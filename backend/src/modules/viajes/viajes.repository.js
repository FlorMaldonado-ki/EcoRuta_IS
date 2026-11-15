'use strict';
/**
 * SQL del módulo Viajes. Único lugar que escribe en la tabla viaje (RNF-15).
 * Consultas siempre parametrizadas (RNF-10).
 */

/** Columnas comunes de detalle: conductor, vehículo y la reserva de quien consulta ($2). */
const SELECT_DETALLE = `
SELECT v.*,
       u.nombre_completo                   AS conductor_nombre,
       COALESCE(u.carrera, u.departamento) AS conductor_adscripcion,
       u.telefono                          AS conductor_telefono,
       (SELECT round(avg(c.puntaje)::numeric, 2) FROM calificacion c WHERE c.evaluado_id = u.id) AS conductor_calificacion,
       ve.marca AS vehiculo_marca, ve.modelo AS vehiculo_modelo, ve.color AS vehiculo_color, ve.placas AS vehiculo_placas,
       mr.id AS mi_reserva_id, mr.estado AS mi_reserva_estado, mr.creada_en AS mi_reserva_creada_en,
       mr.cancelacion_tardia AS mi_reserva_tardia, mr.punto_union AS mi_reserva_punto,
       (SELECT count(*) FROM reserva r WHERE r.viaje_id = v.id AND r.estado = 'solicitada') AS solicitudes_pendientes,
       (SELECT count(*) FROM reserva r WHERE r.viaje_id = v.id AND r.estado = 'aceptada')   AS pasajeros_aceptados
FROM viaje v
JOIN usuario  u  ON u.id  = v.conductor_id
JOIN vehiculo ve ON ve.id = v.vehiculo_id
LEFT JOIN LATERAL (
  -- La reserva más relevante del usuario en este viaje: primero la vigente, luego la más reciente.
  SELECT r.id, r.estado, r.creada_en, r.cancelacion_tardia, r.punto_union
    FROM reserva r
   WHERE r.viaje_id = v.id AND r.pasajero_id = $2
   ORDER BY (r.estado IN ('solicitada', 'aceptada')) DESC, r.creada_en DESC
   LIMIT 1
) mr ON true`;

async function buscarDetalle(db, id, usuarioId) {
  const { rows } = await db.query(`${SELECT_DETALLE} WHERE v.id = $1`, [id, usuarioId]);
  return rows[0] || null;
}

async function insertar(db, conductorId, v) {
  const { rows } = await db.query(
    `INSERT INTO viaje (conductor_id, vehiculo_id, sentido, punto_campus,
                        origen_texto, origen_lat, origen_lng, destino_texto, destino_lat, destino_lng,
                        salida_en, asientos_totales, distancia_km, duracion_min, distancia_fuente, notas,
                        puntos_encuentro)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb)
     RETURNING id`,
    [conductorId, v.vehiculo_id, v.sentido, v.punto_campus,
      v.origen_texto, v.origen_lat, v.origen_lng, v.destino_texto, v.destino_lat, v.destino_lng,
      v.salida_en, v.asientos_totales, v.distancia_km, v.duracion_min, v.distancia_fuente, v.notas,
      JSON.stringify(v.puntos_encuentro || [])],
  );
  return rows[0].id;
}

/** Bloquea la fila del viaje dentro de una transacción (cancelar, finalizar, editar). */
async function bloquear(db, id) {
  const { rows } = await db.query('SELECT * FROM viaje WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] || null;
}

async function marcarCancelado(db, id) {
  await db.query(`UPDATE viaje SET estado = 'cancelado', cancelado_en = now() WHERE id = $1`, [id]);
}

// ── RF-11 · Búsqueda (ver db/queries/buscar_viajes.sql) ──────────────────────
// La ventana de hora llega como fecha + horas locales de Morelia y se convierte
// a timestamptz en SQL; el inicio nunca es anterior a now() (solo viajes futuros).
const VENTANA = `
  v.salida_en BETWEEN GREATEST(($2::date + $3::time) AT TIME ZONE 'America/Mexico_City', now())
                  AND ($2::date + $4::time) AT TIME ZONE 'America/Mexico_City'`;

const SELECT_BUSQUEDA = `
SELECT v.*, %DISTANCIA% AS distancia_usuario_km,
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
  AND ${VENTANA}
  AND v.asientos_disponibles > 0
  AND v.conductor_id <> $5`;

/**
 * @param {{ sentido, fecha, horaDesde, horaHasta, lat, lng, radioKm, limite, pagina }} f
 * @returns {Promise<object[]>} hasta limite + 1 filas (la extra indica que hay más)
 */
async function buscar(db, f, usuarioId) {
  const offset = (f.pagina - 1) * f.limite;
  const base = [f.sentido, f.fecha, f.horaDesde, f.horaHasta, usuarioId];
  if (f.lat === null) {
    const { rows } = await db.query(
      `${SELECT_BUSQUEDA.replace('%DISTANCIA%', 'NULL::double precision')}
       ORDER BY v.salida_en, v.id
       LIMIT $6 OFFSET $7`,
      [...base, f.limite + 1, offset],
    );
    return rows;
  }
  // point: [0] = lng (x), [1] = lat (y). 1° lat ≈ 111.32 km; 1° lng ≈ 111.32·cos(lat) km.
  // La caja (<@ box) usa el índice GiST; el Haversine afina al círculo exacto.
  const { rows } = await db.query(
    `${SELECT_BUSQUEDA.replace('%DISTANCIA%', 'fn_haversine_km($6, $7, v.punto_busqueda[1], v.punto_busqueda[0])')}
       AND v.punto_busqueda <@ box(
             point($7 - $8 / (111.32 * cos(radians($6))), $6 - $8 / 111.32),
             point($7 + $8 / (111.32 * cos(radians($6))), $6 + $8 / 111.32))
       AND fn_haversine_km($6, $7, v.punto_busqueda[1], v.punto_busqueda[0]) <= $8
     ORDER BY v.salida_en, distancia_usuario_km, v.id
     LIMIT $9 OFFSET $10`,
    [...base, f.lat, f.lng, f.radioKm, f.limite + 1, offset],
  );
  return rows;
}

// ── RF-18 · Mis viajes ───────────────────────────────────────────────────────
const FILTRO_CONDUCTOR = {
  upcoming: `v.estado = 'publicado' AND v.salida_en > now()`,
  in_progress: `v.estado = 'en_curso'`,
  history: `(v.estado IN ('finalizado', 'cancelado') OR (v.estado = 'publicado' AND v.salida_en <= now()))`,
};

async function listarComoConductor(db, conductorId, estado, { limite, pagina }) {
  const orden = estado === 'history' ? 'v.salida_en DESC' : 'v.salida_en ASC';
  const { rows } = await db.query(
    `SELECT v.*,
            ve.marca AS vehiculo_marca, ve.modelo AS vehiculo_modelo, ve.color AS vehiculo_color, ve.placas AS vehiculo_placas,
            (SELECT count(*) FROM reserva r WHERE r.viaje_id = v.id AND r.estado = 'solicitada') AS solicitudes_pendientes,
            (SELECT count(*) FROM reserva r WHERE r.viaje_id = v.id AND r.estado = 'aceptada')   AS pasajeros_aceptados
       FROM viaje v
       JOIN vehiculo ve ON ve.id = v.vehiculo_id
      WHERE v.conductor_id = $1 AND ${FILTRO_CONDUCTOR[estado]}
      ORDER BY ${orden}, v.id
      LIMIT $2 OFFSET $3`,
    [conductorId, limite + 1, (pagina - 1) * limite],
  );
  return rows;
}

// Pasajero: la reserva más reciente por viaje. "Próximos" y "en curso" solo con
// reserva vigente; todo lo demás (rechazada, cancelada, viaje pasado) es historial.
const FILTRO_PASAJERO = {
  upcoming: `v.estado = 'publicado' AND v.salida_en > now() AND mr.estado IN ('solicitada', 'aceptada')`,
  in_progress: `v.estado = 'en_curso' AND mr.estado = 'aceptada'`,
  history: `NOT ((v.estado = 'publicado' AND v.salida_en > now() AND mr.estado IN ('solicitada', 'aceptada'))
              OR (v.estado = 'en_curso' AND mr.estado = 'aceptada'))`,
};

async function listarComoPasajero(db, pasajeroId, estado, { limite, pagina }) {
  const orden = estado === 'history' ? 'v.salida_en DESC' : 'v.salida_en ASC';
  const { rows } = await db.query(
    `WITH mr AS (
       SELECT DISTINCT ON (r.viaje_id) r.viaje_id, r.id, r.estado, r.creada_en, r.cancelacion_tardia, r.punto_union
         FROM reserva r
        WHERE r.pasajero_id = $1
        ORDER BY r.viaje_id, (r.estado IN ('solicitada', 'aceptada')) DESC, r.creada_en DESC
     )
     SELECT v.*,
            u.nombre_completo AS conductor_nombre, COALESCE(u.carrera, u.departamento) AS conductor_adscripcion,
            u.telefono AS conductor_telefono,
            ve.marca AS vehiculo_marca, ve.modelo AS vehiculo_modelo, ve.color AS vehiculo_color, ve.placas AS vehiculo_placas,
            mr.id AS mi_reserva_id, mr.estado AS mi_reserva_estado, mr.creada_en AS mi_reserva_creada_en,
            mr.cancelacion_tardia AS mi_reserva_tardia, mr.punto_union AS mi_reserva_punto
       FROM mr
       JOIN viaje    v  ON v.id  = mr.viaje_id
       JOIN usuario  u  ON u.id  = v.conductor_id
       JOIN vehiculo ve ON ve.id = v.vehiculo_id
      WHERE ${FILTRO_PASAJERO[estado]}
      ORDER BY ${orden}, v.id
      LIMIT $2 OFFSET $3`,
    [pasajeroId, limite + 1, (pagina - 1) * limite],
  );
  return rows;
}

module.exports = { buscarDetalle, insertar, bloquear, marcarCancelado, buscar, listarComoConductor, listarComoPasajero };
