'use strict';
/**
 * SQL del módulo Confianza (dueño de calificacion, recordatorio_calificacion,
 * reporte y contacto_emergencia). También lee documento_usuario para "Mis documentos".
 */

// ── Participantes de un viaje ───────────────────────────────────────────────
/** Viaje con su conductor y si el usuario participó (conductor o reserva). */
async function viajeConRelacion(db, viajeId, usuarioId) {
  const { rows } = await db.query(
    `SELECT v.id, v.estado, v.conductor_id, v.origen_texto, v.destino_texto, v.salida_en, v.finalizado_en,
            (SELECT r.estado FROM reserva r WHERE r.viaje_id = v.id AND r.pasajero_id = $2
              ORDER BY (r.estado = 'aceptada') DESC, r.creada_en DESC LIMIT 1) AS mi_reserva_estado
       FROM viaje v WHERE v.id = $1`,
    [viajeId, usuarioId],
  );
  return rows[0] || null;
}

/** Conductor y pasajeros aceptados del viaje (los que pueden calificarse entre sí, RN-10). */
async function participantes(db, viajeId) {
  const { rows } = await db.query(
    `SELECT u.id, u.nombre_completo, u.foto_storage_key, u.carrera, u.departamento, u.tipo, 'driver' AS rol
       FROM viaje v JOIN usuario u ON u.id = v.conductor_id WHERE v.id = $1
     UNION ALL
     SELECT u.id, u.nombre_completo, u.foto_storage_key, u.carrera, u.departamento, u.tipo, 'passenger' AS rol
       FROM reserva r JOIN usuario u ON u.id = r.pasajero_id
      WHERE r.viaje_id = $1 AND r.estado = 'aceptada'`,
    [viajeId],
  );
  return rows;
}

/** ¿Tuvo el usuario alguna reserva (de cualquier estado) en el viaje? Sirve para reportar solicitantes. */
async function tuvoReserva(db, viajeId, usuarioId) {
  const { rowCount } = await db.query('SELECT 1 FROM reserva WHERE viaje_id = $1 AND pasajero_id = $2 LIMIT 1', [viajeId, usuarioId]);
  return rowCount > 0;
}

async function usuarioBasico(db, id) {
  const { rows } = await db.query(
    'SELECT id, nombre_completo, foto_storage_key, carrera, departamento, tipo, estado FROM usuario WHERE id = $1', [id]);
  return rows[0] || null;
}

// ── Calificaciones ──────────────────────────────────────────────────────────
async function vigenciaComentarioDias(db) {
  const { rows } = await db.query(`SELECT (valor #>> '{}')::int AS dias FROM parametro WHERE clave = 'vigencia_comentario_dias'`);
  return rows[0]?.dias ?? 30;
}

async function insertarCalificacion(db, c) {
  const { rows } = await db.query(
    `INSERT INTO calificacion (viaje_id, evaluador_id, evaluado_id, puntaje, comentario, comentario_en)
     VALUES ($1, $2, $3, $4, $5::varchar, CASE WHEN $5::varchar IS NULL THEN NULL ELSE now() END)
     RETURNING id`,
    [c.viaje_id, c.evaluador_id, c.evaluado_id, c.puntaje, c.comentario],
  );
  return rows[0].id;
}

const SELECT_CALIFICACION = `
  SELECT c.*, v.conductor_id, v.origen_texto, v.destino_texto, v.salida_en,
         ev.nombre_completo AS evaluador_nombre, ev.foto_storage_key AS evaluador_foto,
         eo.nombre_completo AS evaluado_nombre, eo.foto_storage_key AS evaluado_foto
    FROM calificacion c
    JOIN viaje v    ON v.id = c.viaje_id
    JOIN usuario ev ON ev.id = c.evaluador_id
    JOIN usuario eo ON eo.id = c.evaluado_id`;

async function calificacionPorId(db, id) {
  const { rows } = await db.query(`${SELECT_CALIFICACION} WHERE c.id = $1`, [id]);
  return rows[0] || null;
}

/** Bloquea la fila para editar el comentario. */
async function bloquearCalificacion(db, id) {
  const { rows } = await db.query('SELECT * FROM calificacion WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] || null;
}

/** Solo toca columnas del comentario: el trigger impide cambiar la puntuación. */
async function guardarComentario(db, id, comentario, { nuevo }) {
  await db.query(
    `UPDATE calificacion
        SET comentario = $2::varchar,
            comentario_en = CASE WHEN $3::boolean THEN now() ELSE comentario_en END,
            comentario_editado_en = CASE WHEN $3::boolean THEN NULL ELSE now() END,
            comentario_eliminado_en = NULL
      WHERE id = $1`,
    [id, comentario, nuevo],
  );
}

async function eliminarComentario(db, id) {
  await db.query(
    `UPDATE calificacion SET comentario = NULL, comentario_en = NULL, comentario_eliminado_en = now() WHERE id = $1`, [id]);
}

async function resumenRecibidas(db, usuarioId) {
  const { rows } = await db.query(
    `SELECT round(avg(puntaje)::numeric, 2) AS promedio, count(*)::int AS total,
            count(*) FILTER (WHERE puntaje = 5)::int AS e5, count(*) FILTER (WHERE puntaje = 4)::int AS e4,
            count(*) FILTER (WHERE puntaje = 3)::int AS e3, count(*) FILTER (WHERE puntaje = 2)::int AS e2,
            count(*) FILTER (WHERE puntaje = 1)::int AS e1
       FROM calificacion WHERE evaluado_id = $1`,
    [usuarioId],
  );
  return rows[0];
}

async function listarRecibidas(db, usuarioId, { limite, desplazamiento }) {
  const { rows } = await db.query(
    `${SELECT_CALIFICACION} WHERE c.evaluado_id = $1 ORDER BY c.creada_en DESC LIMIT $2 OFFSET $3`,
    [usuarioId, limite + 1, desplazamiento],
  );
  return rows;
}

async function listarDadas(db, usuarioId, { limite, desplazamiento }) {
  const { rows } = await db.query(
    `${SELECT_CALIFICACION} WHERE c.evaluador_id = $1 ORDER BY c.creada_en DESC LIMIT $2 OFFSET $3`,
    [usuarioId, limite + 1, desplazamiento],
  );
  return rows;
}

/** Calificaciones que el usuario ya dio en un viaje (para no ofrecer calificar dos veces). */
async function dadasEnViaje(db, viajeId, usuarioId) {
  const { rows } = await db.query(`${SELECT_CALIFICACION} WHERE c.viaje_id = $1 AND c.evaluador_id = $2`, [viajeId, usuarioId]);
  return rows;
}

/** Reportes que el usuario ya hizo en un viaje. */
async function reportesHechosEnViaje(db, viajeId, usuarioId) {
  const { rows } = await db.query(
    'SELECT usuario_reportado_id FROM reporte WHERE viaje_id = $1 AND reportante_id = $2', [viajeId, usuarioId]);
  return rows.map((r) => r.usuario_reportado_id);
}

/**
 * Viajes finalizados (últimos 30 días) donde el usuario participó, le falta
 * calificar a alguien y aún no se le mostró el recordatorio.
 */
async function pendientesDeCalificar(db, usuarioId) {
  const { rows } = await db.query(
    `WITH mis_viajes AS (
       SELECT v.id, v.conductor_id, v.origen_texto, v.destino_texto, v.salida_en, v.finalizado_en
         FROM viaje v
        WHERE v.estado = 'finalizado' AND v.finalizado_en > now() - interval '30 days'
          AND (v.conductor_id = $1 OR EXISTS (
                SELECT 1 FROM reserva r WHERE r.viaje_id = v.id AND r.pasajero_id = $1 AND r.estado = 'aceptada'))
     ), contrapartes AS (
       -- El conductor califica a sus pasajeros aceptados; el pasajero, al conductor.
       SELECT mv.id AS viaje_id, r.pasajero_id AS usuario_id
         FROM mis_viajes mv JOIN reserva r ON r.viaje_id = mv.id AND r.estado = 'aceptada'
        WHERE mv.conductor_id = $1
       UNION ALL
       SELECT mv.id, mv.conductor_id FROM mis_viajes mv WHERE mv.conductor_id <> $1
     )
     SELECT mv.id, mv.origen_texto, mv.destino_texto, mv.salida_en, mv.finalizado_en,
            (mv.conductor_id = $1) AS soy_conductor,
            json_agg(json_build_object('id', u.id, 'nombre', u.nombre_completo, 'foto', u.foto_storage_key)
                     ORDER BY u.nombre_completo) AS por_calificar
       FROM mis_viajes mv
       JOIN contrapartes cp ON cp.viaje_id = mv.id
       JOIN usuario u ON u.id = cp.usuario_id
      WHERE NOT EXISTS (SELECT 1 FROM calificacion c
                         WHERE c.viaje_id = mv.id AND c.evaluador_id = $1 AND c.evaluado_id = cp.usuario_id)
        AND NOT EXISTS (SELECT 1 FROM recordatorio_calificacion rc WHERE rc.usuario_id = $1 AND rc.viaje_id = mv.id)
      GROUP BY mv.id, mv.origen_texto, mv.destino_texto, mv.salida_en, mv.finalizado_en, mv.conductor_id
      ORDER BY mv.finalizado_en DESC`,
    [usuarioId],
  );
  return rows;
}

async function marcarRecordatorio(db, usuarioId, viajeId) {
  await db.query(
    `INSERT INTO recordatorio_calificacion (usuario_id, viaje_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [usuarioId, viajeId],
  );
}

// ── Reportes ────────────────────────────────────────────────────────────────
async function insertarReporte(db, r) {
  const { rows } = await db.query(
    `INSERT INTO reporte (reportante_id, usuario_reportado_id, viaje_id, motivo, motivo_otro, descripcion)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, creado_en`,
    [r.reportante_id, r.usuario_reportado_id, r.viaje_id, r.motivo, r.motivo_otro, r.descripcion],
  );
  return rows[0];
}

// ── Contacto de emergencia ──────────────────────────────────────────────────
async function contacto(db, usuarioId) {
  const { rows } = await db.query('SELECT * FROM contacto_emergencia WHERE usuario_id = $1', [usuarioId]);
  return rows[0] || null;
}

async function guardarContacto(db, usuarioId, c) {
  const { rows } = await db.query(
    `INSERT INTO contacto_emergencia (usuario_id, nombre, telefono, parentesco, parentesco_otro)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (usuario_id) DO UPDATE
       SET nombre = EXCLUDED.nombre, telefono = EXCLUDED.telefono, parentesco = EXCLUDED.parentesco,
           parentesco_otro = EXCLUDED.parentesco_otro, actualizado_en = now()
     RETURNING *`,
    [usuarioId, c.nombre, c.telefono, c.parentesco, c.parentesco_otro],
  );
  return rows[0];
}

async function eliminarContacto(db, usuarioId) {
  const { rowCount } = await db.query('DELETE FROM contacto_emergencia WHERE usuario_id = $1', [usuarioId]);
  return rowCount > 0;
}

// ── Mis documentos ──────────────────────────────────────────────────────────
async function documentosDe(db, usuarioId) {
  const { rows } = await db.query(
    'SELECT * FROM documento_usuario WHERE usuario_id = $1 ORDER BY creado_en DESC', [usuarioId]);
  return rows;
}

async function documentoPorId(db, id) {
  const { rows } = await db.query('SELECT * FROM documento_usuario WHERE id = $1', [id]);
  return rows[0] || null;
}

async function insertarDocumento(db, usuarioId, d) {
  const { rows } = await db.query(
    `INSERT INTO documento_usuario (usuario_id, tipo, nombre_archivo, mime_type, tamano_bytes, storage_key)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [usuarioId, d.tipo, d.nombre_archivo, d.mime_type, d.tamano_bytes, d.storage_key],
  );
  return rows[0];
}

module.exports = {
  viajeConRelacion, participantes, tuvoReserva, usuarioBasico,
  vigenciaComentarioDias, insertarCalificacion, calificacionPorId, bloquearCalificacion, guardarComentario, eliminarComentario,
  resumenRecibidas, listarRecibidas, listarDadas, dadasEnViaje, reportesHechosEnViaje, pendientesDeCalificar, marcarRecordatorio,
  insertarReporte, contacto, guardarContacto, eliminarContacto,
  documentosDe, documentoPorId, insertarDocumento,
};
