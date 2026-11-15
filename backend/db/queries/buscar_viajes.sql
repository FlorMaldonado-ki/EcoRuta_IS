-- RF-11 · Búsqueda de viajes por sentido, ventana de hora y cercanía (sin PostGIS)
-- Es la consulta que ejecuta src/modules/viajes/viajes.repository.js (buscar) cuando
-- el pasajero manda su ubicación. Sin ubicación se omiten la caja y el Haversine y se
-- ordena solo por hora (usa idx_viaje_busqueda_tiempo).
-- Parámetros:
--   $1 sentido ('hacia_campus'|'desde_campus')   $2 fecha local (date)   $3 hora desde (time)   $4 hora hasta (time)
--   $5 id de quien busca (se excluyen sus propios viajes y se marca su reserva vigente)
--   $6 lat del pasajero   $7 lng del pasajero    $8 radio en km           $9 límite (21 = 20 + 1 para saber si hay más)   $10 offset
-- La fecha y las horas son de Morelia (America/Mexico_City); el inicio nunca es anterior a now().
-- 1° de latitud ≈ 111.32 km; 1° de longitud ≈ 111.32·cos(lat) km.
-- La caja (<@ box) usa el índice GiST; el Haversine afina al círculo exacto.
-- point: [0] = lng (x), [1] = lat (y).
-- Verificado con 20 000 viajes: usa idx_viaje_busqueda_geo (con ubicación) o idx_viaje_busqueda_tiempo (sin ella), < 10 ms.
SELECT v.*,
       fn_haversine_km($6, $7, v.punto_busqueda[1], v.punto_busqueda[0]) AS distancia_usuario_km,
       u.nombre_completo                   AS conductor_nombre,
       COALESCE(u.carrera, u.departamento) AS conductor_adscripcion,
       (SELECT round(avg(c.puntaje)::numeric, 2) FROM calificacion c WHERE c.evaluado_id = u.id) AS conductor_calificacion,
       ve.marca AS vehiculo_marca, ve.modelo AS vehiculo_modelo, ve.color AS vehiculo_color,
       mr.id AS mi_reserva_id, mr.estado AS mi_reserva_estado, mr.creada_en AS mi_reserva_creada_en,
       mr.cancelacion_tardia AS mi_reserva_tardia
FROM viaje v
JOIN usuario  u  ON u.id  = v.conductor_id
JOIN vehiculo ve ON ve.id = v.vehiculo_id
LEFT JOIN LATERAL (
  SELECT r.id, r.estado, r.creada_en, r.cancelacion_tardia FROM reserva r
   WHERE r.viaje_id = v.id AND r.pasajero_id = $5 AND r.estado IN ('solicitada', 'aceptada')
   LIMIT 1
) mr ON true
WHERE v.estado = 'publicado'
  AND v.sentido = $1
  AND v.salida_en BETWEEN GREATEST(($2::date + $3::time) AT TIME ZONE 'America/Mexico_City', now())
                      AND ($2::date + $4::time) AT TIME ZONE 'America/Mexico_City'
  AND v.asientos_disponibles > 0
  AND v.conductor_id <> $5
  AND v.punto_busqueda <@ box(
        point($7 - $8 / (111.32 * cos(radians($6))), $6 - $8 / 111.32),
        point($7 + $8 / (111.32 * cos(radians($6))), $6 + $8 / 111.32))
  AND fn_haversine_km($6, $7, v.punto_busqueda[1], v.punto_busqueda[0]) <= $8
ORDER BY v.salida_en, distancia_usuario_km, v.id      -- RF-11: por hora y cercanía
LIMIT $9 OFFSET $10;
