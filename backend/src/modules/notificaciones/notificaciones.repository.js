'use strict';
/** SQL del módulo Notificaciones (dueño de la tabla notificacion). */

const RETENCION_HORAS = 72;
const LIMITE_BANDEJA = 50;

async function insertarVarias(db, filas) {
  if (!filas.length) return [];
  const valores = [];
  const params = [];
  filas.forEach((f, i) => {
    const b = i * 6;
    valores.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`);
    params.push(f.usuarioId, f.tipo, f.titulo, f.mensaje, f.viajeId ?? null, f.reservaId ?? null);
  });
  const { rows } = await db.query(
    `INSERT INTO notificacion (usuario_id, tipo, titulo, mensaje, viaje_id, reserva_id)
     VALUES ${valores.join(', ')} RETURNING *`,
    params,
  );
  return rows;
}

async function purgarAntiguas(db) {
  await db.query(`DELETE FROM notificacion WHERE creada_en < now() - make_interval(hours => $1)`, [RETENCION_HORAS]);
}

async function listar(db, usuarioId) {
  const { rows } = await db.query(
    `SELECT * FROM notificacion
      WHERE usuario_id = $1 AND creada_en >= now() - make_interval(hours => $2)
      ORDER BY creada_en DESC
      LIMIT $3`,
    [usuarioId, RETENCION_HORAS, LIMITE_BANDEJA],
  );
  return rows;
}

async function contarNoLeidas(db, usuarioId) {
  const { rows } = await db.query(
    `SELECT count(*) AS n FROM notificacion
      WHERE usuario_id = $1 AND NOT leida AND creada_en >= now() - make_interval(hours => $2)`,
    [usuarioId, RETENCION_HORAS],
  );
  return rows[0].n;
}

async function marcarLeida(db, usuarioId, id) {
  const { rows } = await db.query(
    'UPDATE notificacion SET leida = true WHERE id = $1 AND usuario_id = $2 RETURNING *',
    [id, usuarioId],
  );
  return rows[0] || null;
}

/** Marca como leídas todas (tipos = null) o solo las de ciertos tipos (una sección del panel). */
async function marcarTodas(db, usuarioId, tipos = null) {
  await db.query(
    'UPDATE notificacion SET leida = true WHERE usuario_id = $1 AND NOT leida AND ($2::text[] IS NULL OR tipo = ANY($2))',
    [usuarioId, tipos],
  );
}

/**
 * Resumen para las insignias del panel principal:
 *   viajes_nuevos           publicados (futuros, con asientos, de otros) desde la última visita a la búsqueda
 *   solicitudes_pendientes  solicitudes sin responder en mis viajes vigentes (como conductor)
 */
async function resumen(db, usuarioId) {
  const { rows } = await db.query(
    `WITH marca AS (
       SELECT COALESCE(
         (SELECT viajes_vistos_en FROM notificacion_marca WHERE usuario_id = $1),
         now() - interval '24 hours') AS desde
     )
     SELECT
       (SELECT count(*) FROM viaje v, marca
         WHERE v.estado = 'publicado' AND v.salida_en > now() AND v.asientos_disponibles > 0
           AND v.conductor_id <> $1 AND v.creado_en > marca.desde
           AND NOT EXISTS (SELECT 1 FROM reserva r
                            WHERE r.viaje_id = v.id AND r.pasajero_id = $1
                              AND r.estado IN ('solicitada', 'aceptada'))) AS viajes_nuevos,
       (SELECT count(*) FROM reserva r JOIN viaje v ON v.id = r.viaje_id
         WHERE v.conductor_id = $1 AND r.estado = 'solicitada'
           AND v.estado = 'publicado' AND v.salida_en > now()) AS solicitudes_pendientes`,
    [usuarioId],
  );
  return rows[0];
}

async function marcarViajesVistos(db, usuarioId) {
  await db.query(
    `INSERT INTO notificacion_marca (usuario_id, viajes_vistos_en) VALUES ($1, now())
     ON CONFLICT (usuario_id) DO UPDATE SET viajes_vistos_en = now()`,
    [usuarioId],
  );
}

/** Datos de una reserva y su viaje para redactar el aviso (solo lectura). */
async function contextoReserva(db, reservaId) {
  const { rows } = await db.query(
    `SELECT r.id AS reserva_id, r.estado, r.cancelacion_tardia, r.pasajero_id,
            v.id AS viaje_id, v.conductor_id, v.origen_texto, v.destino_texto, v.salida_en,
            c.nombre_completo AS conductor_nombre, p.nombre_completo AS pasajero_nombre
       FROM reserva r
       JOIN viaje   v ON v.id = r.viaje_id
       JOIN usuario c ON c.id = v.conductor_id
       JOIN usuario p ON p.id = r.pasajero_id
      WHERE r.id = $1`,
    [reservaId],
  );
  return rows[0] || null;
}

/** Solicitudes pendientes (lista de espera) de un viaje (solo lectura). */
async function pendientesDeViaje(db, viajeId) {
  const { rows } = await db.query(
    `SELECT id AS reserva_id, pasajero_id FROM reserva WHERE viaje_id = $1 AND estado = 'solicitada'`,
    [viajeId],
  );
  return rows;
}

/** Datos de un viaje para redactar el aviso de cancelación (solo lectura). */
async function contextoViaje(db, viajeId) {
  const { rows } = await db.query(
    `SELECT v.id AS viaje_id, v.conductor_id, v.origen_texto, v.destino_texto, v.salida_en,
            c.nombre_completo AS conductor_nombre
       FROM viaje v JOIN usuario c ON c.id = v.conductor_id
      WHERE v.id = $1`,
    [viajeId],
  );
  return rows[0] || null;
}

module.exports = {
  insertarVarias, purgarAntiguas, listar, contarNoLeidas, marcarLeida, marcarTodas, resumen, marcarViajesVistos,
  contextoReserva, contextoViaje, pendientesDeViaje, RETENCION_HORAS, LIMITE_BANDEJA,
};
