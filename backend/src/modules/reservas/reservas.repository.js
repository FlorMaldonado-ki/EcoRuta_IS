'use strict';
/**
 * SQL del módulo Reservas. Único lugar que escribe en la tabla reserva (RNF-15).
 * Lee viaje solo para validar; los asientos los ajusta el trigger
 * trg_reserva_ajustar_asientos en la misma transacción (RNF-28).
 */
const VENTANA_TRASLAPE_MIN = 60;   // RN-05
const MINUTOS_TARDIA = 20;         // RN-06

/** Serializa las operaciones de un mismo pasajero (evita dos solicitudes traslapadas en paralelo). */
async function bloquearPasajero(db, pasajeroId) {
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`reserva:${pasajeroId}`]);
}

/** Viaje para validar una solicitud; FOR SHARE impide que se cancele a la vez. */
async function viajeParaReservar(db, viajeId) {
  const { rows } = await db.query(
    `SELECT id, conductor_id, estado, salida_en, asientos_disponibles, salida_en > now() AS es_futuro
       FROM viaje WHERE id = $1 FOR SHARE`,
    [viajeId],
  );
  return rows[0] || null;
}

async function tieneReservaVigente(db, viajeId, pasajeroId) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM reserva WHERE viaje_id = $1 AND pasajero_id = $2 AND estado IN ('solicitada', 'aceptada')`,
    [viajeId, pasajeroId],
  );
  return rowCount > 0;
}

/** RN-05: otra reserva vigente del pasajero en un viaje que sale a ±60 min. */
async function buscarTraslape(db, pasajeroId, viajeId, salidaEn) {
  const { rows } = await db.query(
    `SELECT v.id, v.salida_en
       FROM reserva r JOIN viaje v ON v.id = r.viaje_id
      WHERE r.pasajero_id = $1 AND r.estado IN ('solicitada', 'aceptada')
        AND v.estado IN ('publicado', 'en_curso') AND v.id <> $2
        AND v.salida_en BETWEEN $3::timestamptz - make_interval(mins => $4)
                            AND $3::timestamptz + make_interval(mins => $4)
      LIMIT 1`,
    [pasajeroId, viajeId, salidaEn, VENTANA_TRASLAPE_MIN],
  );
  return rows[0] || null;
}

async function insertar(db, viajeId, pasajeroId) {
  const { rows } = await db.query(
    'INSERT INTO reserva (viaje_id, pasajero_id) VALUES ($1, $2) RETURNING *',
    [viajeId, pasajeroId],
  );
  return rows[0];
}

const SELECT_CON_PASAJERO = `
SELECT r.*, p.nombre_completo AS pasajero_nombre, p.tipo AS pasajero_tipo, p.carrera AS pasajero_carrera,
       p.departamento AS pasajero_departamento, p.telefono AS pasajero_telefono
  FROM reserva r JOIN usuario p ON p.id = r.pasajero_id`;

async function listarPorViaje(db, viajeId, estado) {
  const { rows } = await db.query(
    `${SELECT_CON_PASAJERO}
      WHERE r.viaje_id = $1 AND ($2::varchar IS NULL OR r.estado = $2)
      ORDER BY (r.estado = 'solicitada') DESC, r.creada_en`,
    [viajeId, estado],
  );
  return rows;
}

async function buscarConPasajero(db, reservaId) {
  const { rows } = await db.query(`${SELECT_CON_PASAJERO} WHERE r.id = $1`, [reservaId]);
  return rows[0] || null;
}

/**
 * RF-16: acepta o rechaza solo si quien responde es el conductor y la reserva
 * sigue 'solicitada'. Aceptar descuenta el asiento en el trigger (SIN_ASIENTOS → 409).
 * @returns {Promise<object|null>} reserva actualizada o null si no aplicó
 */
async function responder(db, reservaId, conductorId, nuevoEstado) {
  const { rows } = await db.query(
    `UPDATE reserva r SET estado = $3, respondida_en = now()
       FROM viaje v
      WHERE r.id = $1 AND r.viaje_id = v.id
        AND v.conductor_id = $2            -- RNF-09: solo el dueño del viaje
        AND r.estado = 'solicitada'
        AND ($3 = 'rechazada' OR (v.estado = 'publicado' AND v.salida_en > now()))
      RETURNING r.*`,
    [reservaId, conductorId, nuevoEstado],
  );
  return rows[0] || null;
}

/** Contexto de una reserva para explicar por qué no se pudo actualizar. */
async function contexto(db, reservaId) {
  const { rows } = await db.query(
    `SELECT r.id, r.estado, r.pasajero_id, v.id AS viaje_id, v.conductor_id, v.estado AS viaje_estado,
            v.salida_en, v.salida_en > now() AS es_futuro
       FROM reserva r JOIN viaje v ON v.id = r.viaje_id WHERE r.id = $1`,
    [reservaId],
  );
  return rows[0] || null;
}

/**
 * RF-17 / RN-06: el pasajero cancela su reserva vigente antes de la salida.
 * Es tardía si estaba aceptada y faltan menos de 20 min. El trigger libera el asiento.
 * @returns {Promise<object|null>} reserva con `estado_anterior`, o null si no aplicó
 */
async function cancelarPropia(db, reservaId, pasajeroId) {
  const { rows } = await db.query(
    `WITH previa AS (
       SELECT r.id, r.estado AS estado_anterior
         FROM reserva r JOIN viaje v ON v.id = r.viaje_id
        WHERE r.id = $1 AND r.pasajero_id = $2
          AND r.estado IN ('solicitada', 'aceptada')
          AND v.estado = 'publicado' AND v.salida_en > now()
        FOR UPDATE OF r
     )
     UPDATE reserva r
        SET estado = 'cancelada', cancelada_en = now(),
            cancelacion_tardia = (previa.estado_anterior = 'aceptada'
                                  AND (SELECT salida_en FROM viaje WHERE id = r.viaje_id) - now() < make_interval(mins => $3))
       FROM previa
      WHERE r.id = previa.id
      RETURNING r.*, previa.estado_anterior`,
    [reservaId, pasajeroId, MINUTOS_TARDIA],
  );
  return rows[0] || null;
}

/** Cancela todas las reservas vigentes de un viaje (cuando el conductor lo cancela). */
async function cancelarPorViaje(db, viajeId) {
  const { rows } = await db.query(
    `WITH previa AS (
       SELECT id, estado AS estado_anterior FROM reserva
        WHERE viaje_id = $1 AND estado IN ('solicitada', 'aceptada')
        FOR UPDATE
     )
     UPDATE reserva r SET estado = 'cancelada', cancelada_en = now()
       FROM previa WHERE r.id = previa.id
      RETURNING r.id, r.pasajero_id, previa.estado_anterior`,
    [viajeId],
  );
  return rows;
}

async function asientosDelViaje(db, viajeId) {
  const { rows } = await db.query('SELECT asientos_disponibles, salida_en FROM viaje WHERE id = $1', [viajeId]);
  return rows[0];
}

module.exports = {
  bloquearPasajero, viajeParaReservar, tieneReservaVigente, buscarTraslape, insertar,
  listarPorViaje, buscarConPasajero, responder, contexto, cancelarPropia, cancelarPorViaje, asientosDelViaje,
  VENTANA_TRASLAPE_MIN, MINUTOS_TARDIA,
};
