'use strict';
/**
 * Consultas del panel de administración (RF-29, RF-30). Lee las tablas de los
 * demás módulos y escribe solo campos de revisión: documento_usuario (estado),
 * reporte (lectura y atención) y usuario.estado (suspender / reactivar).
 */

/** Usuarios con MÁS DE CINCO reportes históricos (6 o más), sin importar su estado. */
const UMBRAL_RECURRENTE = 6;

// ── Resumen (RF-30) ─────────────────────────────────────────────────────────
async function resumen(db) {
  const { rows } = await db.query(
    `SELECT
       (SELECT count(*) FROM usuario)::int                                         AS usuarios,
       (SELECT count(*) FROM usuario WHERE estado = 'activo')::int                 AS usuarios_activos,
       (SELECT count(*) FROM usuario WHERE estado = 'pendiente')::int              AS usuarios_pendientes,
       (SELECT count(*) FROM usuario WHERE estado = 'suspendido')::int             AS usuarios_suspendidos,
       (SELECT count(*) FROM documento_usuario WHERE estado = 'pendiente')::int    AS documentos_pendientes,
       (SELECT count(*) FROM reporte WHERE leido_en IS NULL)::int                  AS reportes_no_leidos,
       (SELECT count(*) FROM reporte WHERE estado IN ('pendiente', 'en_revision'))::int AS reportes_por_atender,
       (SELECT count(*) FROM (SELECT 1 FROM reporte GROUP BY usuario_reportado_id
                               HAVING count(*) >= $1) x)::int                     AS usuarios_recurrentes,
       (SELECT count(*) FROM viaje)::int                                           AS viajes,
       (SELECT count(*) FROM viaje WHERE estado = 'finalizado')::int               AS viajes_finalizados,
       (SELECT count(*) FROM viaje WHERE estado = 'publicado' AND salida_en > now())::int AS viajes_publicados,
       (SELECT coalesce(sum(co2_kg), 0) FROM impacto_viaje)::float                 AS co2_kg,
       (SELECT round(avg(puntaje)::numeric, 2) FROM calificacion)                  AS calificacion_promedio,
       (SELECT count(*) FROM calificacion)::int                                    AS calificaciones`,
    [UMBRAL_RECURRENTE],
  );
  return rows[0];
}

// ── Documentos ──────────────────────────────────────────────────────────────
const SELECT_DOCUMENTO = `
  SELECT d.*, u.nombre_completo AS propietario_nombre, u.correo AS propietario_correo,
         u.foto_storage_key AS propietario_foto, u.tipo AS propietario_tipo
    FROM documento_usuario d JOIN usuario u ON u.id = d.usuario_id`;

/** @param {{ estado?, tipo?, usuarioId?, q?, desde?, hasta?, limite, desplazamiento }} f */
async function listarDocumentos(db, f) {
  const where = [];
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  if (f.estado) where.push(`d.estado = ${p(f.estado)}`);
  if (f.tipo) where.push(`d.tipo = ${p(f.tipo)}`);
  if (f.usuarioId) where.push(`d.usuario_id = ${p(f.usuarioId)}`);
  if (f.q) where.push(`(u.nombre_completo ILIKE ${p(`%${f.q}%`)} OR u.correo ILIKE $${params.length})`);
  if (f.desde) where.push(`d.creado_en >= ${p(f.desde)}::date`);
  if (f.hasta) where.push(`d.creado_en < (${p(f.hasta)}::date + 1)`);
  const sql = `${SELECT_DOCUMENTO} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY (d.estado = 'pendiente') DESC, d.creado_en ${f.orden === 'asc' ? 'ASC' : 'DESC'}
    LIMIT ${p(f.limite + 1)} OFFSET ${p(f.desplazamiento)}`;
  const { rows } = await db.query(sql, params);
  return rows;
}

async function documento(db, id, { bloquear = false } = {}) {
  const { rows } = await db.query(`${SELECT_DOCUMENTO} WHERE d.id = $1 ${bloquear ? 'FOR UPDATE OF d' : ''}`, [id]);
  return rows[0] || null;
}

async function revisarDocumento(db, id, adminId, { estado, motivo }) {
  await db.query(
    `UPDATE documento_usuario SET estado = $2, motivo_rechazo = $3, revisado_por = $4, revisado_en = now() WHERE id = $1`,
    [id, estado, motivo, adminId],
  );
}

// ── Reportes ────────────────────────────────────────────────────────────────
const SELECT_REPORTE = `
  SELECT r.*,
         rp.nombre_completo AS reportante_nombre, rp.correo AS reportante_correo, rp.foto_storage_key AS reportante_foto,
         rd.nombre_completo AS reportado_nombre,  rd.correo AS reportado_correo,  rd.foto_storage_key AS reportado_foto,
         rd.estado AS reportado_estado,
         (SELECT count(*) FROM reporte x WHERE x.usuario_reportado_id = r.usuario_reportado_id) AS reportado_total,
         v.origen_texto, v.destino_texto, v.salida_en, v.estado AS viaje_estado
    FROM reporte r
    JOIN usuario rp ON rp.id = r.reportante_id
    JOIN usuario rd ON rd.id = r.usuario_reportado_id
    LEFT JOIN viaje v ON v.id = r.viaje_id`;

/**
 * Filtros de la bandeja:
 *   recent / oldest → por atender: excluye los que ya están LEÍDOS Y ATENDIDOS.
 *   read / unread   → por estado de lectura (sin importar la atención).
 *   all             → todos (historial de un usuario con reportedUserId).
 */
async function listarReportes(db, f) {
  const where = [];
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  if (f.filtro === 'recent' || f.filtro === 'oldest') {
    where.push(`NOT (r.leido_en IS NOT NULL AND r.estado IN ('resuelto', 'descartado'))`);
  } else if (f.filtro === 'read') {
    where.push('r.leido_en IS NOT NULL');
  } else if (f.filtro === 'unread') {
    where.push('r.leido_en IS NULL');
  }
  if (f.reportadoId) where.push(`r.usuario_reportado_id = ${p(f.reportadoId)}`);
  if (f.motivo) where.push(`r.motivo = ${p(f.motivo)}`);
  if (f.q) where.push(`(rd.nombre_completo ILIKE ${p(`%${f.q}%`)} OR rp.nombre_completo ILIKE $${params.length})`);
  const orden = f.filtro === 'oldest' ? 'ASC' : 'DESC';
  const sql = `${SELECT_REPORTE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY r.creado_en ${orden} LIMIT ${p(f.limite + 1)} OFFSET ${p(f.desplazamiento)}`;
  const { rows } = await db.query(sql, params);
  return rows;
}

async function reporte(db, id, { bloquear = false } = {}) {
  const { rows } = await db.query(`${SELECT_REPORTE} WHERE r.id = $1 ${bloquear ? 'FOR UPDATE OF r' : ''}`, [id]);
  return rows[0] || null;
}

async function marcarLectura(db, id, adminId, leido) {
  await db.query(
    `UPDATE reporte SET leido_en = CASE WHEN $2::boolean THEN coalesce(leido_en, now()) ELSE NULL END,
                        leido_por = CASE WHEN $2::boolean THEN coalesce(leido_por, $3::uuid) ELSE NULL END
      WHERE id = $1`,
    [id, leido, adminId],
  );
}

async function actualizarAtencion(db, id, adminId, { estado, nota }) {
  const cerrado = estado === 'resuelto' || estado === 'descartado';
  await db.query(
    `UPDATE reporte
        SET estado = $2::varchar,
            nota_admin = coalesce($3::varchar, nota_admin),
            revisado_por = CASE WHEN $4::boolean THEN $5::uuid ELSE NULL END,
            revisado_en  = CASE WHEN $4::boolean THEN now() ELSE NULL END,
            -- atender un reporte implica haberlo leído
            leido_en  = CASE WHEN $4::boolean THEN coalesce(leido_en, now()) ELSE leido_en END,
            leido_por = CASE WHEN $4::boolean THEN coalesce(leido_por, $5::uuid) ELSE leido_por END
      WHERE id = $1`,
    [id, estado, nota, cerrado, adminId],
  );
}

/** Conteo histórico de TODOS los reportes recibidos (leídos, atendidos o no). */
async function recurrentes(db) {
  const { rows } = await db.query(
    `SELECT r.usuario_reportado_id AS usuario_id, u.nombre_completo, u.correo, u.foto_storage_key, u.estado,
            count(*)::int AS total,
            count(*) FILTER (WHERE r.leido_en IS NULL)::int AS no_leidos,
            count(*) FILTER (WHERE r.estado IN ('pendiente', 'en_revision'))::int AS por_atender,
            count(DISTINCT r.reportante_id)::int AS reportantes,
            max(r.creado_en) AS ultimo
       FROM reporte r JOIN usuario u ON u.id = r.usuario_reportado_id
      GROUP BY r.usuario_reportado_id, u.nombre_completo, u.correo, u.foto_storage_key, u.estado
     HAVING count(*) >= $1
      ORDER BY count(*) DESC, max(r.creado_en) DESC`,
    [UMBRAL_RECURRENTE],
  );
  return rows;
}

// ── Usuarios ────────────────────────────────────────────────────────────────
const SELECT_USUARIO = `
  SELECT u.id, u.nombre_completo, u.correo, u.tipo, u.carrera, u.departamento, u.telefono, u.rol, u.estado,
         u.verificado_en, u.creado_en, u.foto_storage_key,
         (SELECT round(avg(c.puntaje)::numeric, 2) FROM calificacion c WHERE c.evaluado_id = u.id) AS calificacion_promedio,
         (SELECT count(*) FROM calificacion c WHERE c.evaluado_id = u.id)::int AS calificaciones,
         (SELECT count(*) FROM reporte r WHERE r.usuario_reportado_id = u.id)::int AS reportes_recibidos,
         (SELECT count(*) FROM viaje v WHERE v.conductor_id = u.id)::int AS viajes_conductor,
         (SELECT count(*) FROM reserva s WHERE s.pasajero_id = u.id AND s.estado = 'aceptada')::int AS viajes_pasajero,
         (SELECT d.estado FROM documento_usuario d WHERE d.usuario_id = u.id ORDER BY d.creado_en DESC LIMIT 1) AS documento_estado
    FROM usuario u`;

async function listarUsuarios(db, f) {
  const where = [];
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  if (f.estado) where.push(`u.estado = ${p(f.estado)}`);
  if (f.q) where.push(`(u.nombre_completo ILIKE ${p(`%${f.q}%`)} OR u.correo ILIKE $${params.length})`);
  const sql = `${SELECT_USUARIO} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY u.creado_en DESC LIMIT ${p(f.limite + 1)} OFFSET ${p(f.desplazamiento)}`;
  const { rows } = await db.query(sql, params);
  return rows;
}

async function usuario(db, id) {
  const { rows } = await db.query(`${SELECT_USUARIO} WHERE u.id = $1`, [id]);
  return rows[0] || null;
}

async function cambiarEstadoUsuario(db, id, estado) {
  await db.query('UPDATE usuario SET estado = $2 WHERE id = $1', [id, estado]);
}

module.exports = {
  UMBRAL_RECURRENTE, resumen, listarDocumentos, documento, revisarDocumento,
  listarReportes, reporte, marcarLectura, actualizarAtencion, recurrentes,
  listarUsuarios, usuario, cambiarEstadoUsuario,
};
