-- RF-11 · Búsqueda de viajes por sentido, ventana de hora y cercanía (sin PostGIS)
-- Parámetros:
--   $1 sentido ('hacia_campus'|'desde_campus')   $2 desde (timestamptz)   $3 hasta (timestamptz)
--   $4 lat del pasajero   $5 lng del pasajero    $6 radio en km           $7 límite   $8 offset
-- 1° de latitud ≈ 111.32 km; 1° de longitud ≈ 111.32·cos(lat) km.
-- La caja (<@ box) puede usar el índice GiST; el Haversine afina al círculo exacto.
-- point: [0] = lng (x), [1] = lat (y).
SELECT v.*,
       fn_haversine_km($4, $5, v.punto_busqueda[1], v.punto_busqueda[0]) AS distancia_usuario_km,
       u.nombre_completo                   AS conductor_nombre,
       COALESCE(u.carrera, u.departamento) AS conductor_adscripcion,
       ve.marca AS vehiculo_marca, ve.modelo AS vehiculo_modelo, ve.color AS vehiculo_color
FROM viaje v
JOIN usuario  u  ON u.id  = v.conductor_id
JOIN vehiculo ve ON ve.id = v.vehiculo_id
WHERE v.estado = 'publicado'
  AND v.sentido = $1
  AND v.salida_en BETWEEN $2 AND $3
  AND v.asientos_disponibles > 0
  AND v.punto_busqueda <@ box(
        point($5 - $6 / (111.32 * cos(radians($4))), $4 - $6 / 111.32),
        point($5 + $6 / (111.32 * cos(radians($4))), $4 + $6 / 111.32))
  AND fn_haversine_km($4, $5, v.punto_busqueda[1], v.punto_busqueda[0]) <= $6
ORDER BY v.salida_en, distancia_usuario_km      -- RF-11: por hora y cercanía
LIMIT $7 OFFSET $8;
