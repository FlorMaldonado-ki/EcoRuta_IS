'use strict';
/**
 * Panel de administración (RF-29, RF-30 y revisión de documentos).
 * Todas las rutas exigen sesión con rol 'admin' (requireRole en admin.routes.js):
 * el frontend solo oculta el acceso; la autorización real es esta.
 * Ninguna acción es automática: suspender, atender o rechazar siempre lo decide el administrador.
 */
const { pool, withTransaction } = require('../../config/db');
const { AppError, ValidationError } = require('../../shared/errors');
const { str, esUuid, pagina } = require('../../shared/validacion');
const { urlFoto } = require('../../shared/fotos');
const { urlDocumento } = require('../../shared/archivos');
const confianzaMapper = require('../confianza/confianza.mapper');
const confianza = require('../confianza/confianza.service');
const notificaciones = require('../notificaciones/notificaciones.service');
const repo = require('./admin.repository');

const POR_PAGINA = 20;
const ESTADO_USUARIO = { activo: 'active', pendiente: 'pending', suspendido: 'suspended' };
const ESTADO_USUARIO_BD = { active: 'activo', pending: 'pendiente', suspended: 'suspendido' };
const ESTADO_DOC_BD = { pending: 'pendiente', approved: 'aprobado', rejected: 'rechazado' };

function paginar(query) {
  const p = pagina(query?.page);
  if (p === null) throw new ValidationError({ page: 'Página inválida.' });
  return { pagina: p, limite: POR_PAGINA, desplazamiento: (p - 1) * POR_PAGINA };
}

const pagina$ = (filas, pg, map) => ({
  items: filas.slice(0, POR_PAGINA).map(map),
  page: pg.pagina,
  pageSize: POR_PAGINA,
  hasMore: filas.length > POR_PAGINA,
});

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
function fecha(v, campo) {
  if (v === undefined || v === '') return null;
  if (typeof v !== 'string' || !FECHA_RE.test(v) || Number.isNaN(Date.parse(v))) {
    throw new ValidationError({ [campo]: 'Usa el formato AAAA-MM-DD.' });
  }
  return v;
}

const busqueda = (v) => {
  const t = str(v);
  return t ? t.slice(0, 80) : null;
};

// ── Resumen (RF-30) ─────────────────────────────────────────────────────────
async function resumen() {
  const r = await repo.resumen(pool);
  return {
    users: { total: r.usuarios, active: r.usuarios_activos, pending: r.usuarios_pendientes, suspended: r.usuarios_suspendidos },
    documents: { pending: r.documentos_pendientes },
    reports: { unread: r.reportes_no_leidos, toAttend: r.reportes_por_atender, recurrentUsers: r.usuarios_recurrentes },
    trips: { total: r.viajes, finished: r.viajes_finalizados, published: r.viajes_publicados },
    co2SavedKg: Math.round(r.co2_kg * 1000) / 1000,
    ratings: { average: r.calificacion_promedio === null ? null : Number(r.calificacion_promedio), count: r.calificaciones },
    recurrentThreshold: repo.UMBRAL_RECURRENTE,
  };
}

// ── Documentos ──────────────────────────────────────────────────────────────
const docDTO = (f) => confianzaMapper.toDocumentoDTO(f, { url: urlDocumento(f.id, f.storage_key).url, conPropietario: true });

/** GET /api/admin/documentos?status=&type=&userId=&q=&from=&to=&order=&page= */
async function listarDocumentos(query = {}) {
  const pg = paginar(query);
  const errors = {};
  const estado = query.status ? ESTADO_DOC_BD[query.status] : null;
  if (query.status && !estado) errors.status = 'Usa pending, approved o rejected.';
  const tipo = query.type ? str(query.type) : null;
  if (tipo && !Object.hasOwn(confianzaMapper.TIPOS_DOCUMENTO, tipo)) errors.type = 'Tipo de documento desconocido.';
  if (query.userId && !esUuid(query.userId)) errors.userId = 'Usuario inválido.';
  if (Object.keys(errors).length) throw new ValidationError(errors);
  const filas = await repo.listarDocumentos(pool, {
    estado, tipo, usuarioId: query.userId || null, q: busqueda(query.q),
    desde: fecha(query.from, 'from'), hasta: fecha(query.to, 'to'), orden: query.order === 'asc' ? 'asc' : 'desc', ...pg,
  });
  return { types: Object.entries(confianzaMapper.TIPOS_DOCUMENTO).map(([key, label]) => ({ key, label })), ...pagina$(filas, pg, docDTO) };
}

async function obtenerDocumento(id) {
  const fila = await repo.documento(pool, id);
  if (!fila) throw new AppError(404, 'DOCUMENTO_NO_ENCONTRADO', 'No encontramos ese documento.');
  return docDTO(fila);
}

/** PATCH /api/admin/documentos/:id { action: 'approve' | 'reject', reason? } — solo documentos pendientes. */
async function revisarDocumento(id, adminId, body = {}) {
  const accion = body.action;
  if (accion !== 'approve' && accion !== 'reject') throw new ValidationError({ action: 'Usa approve o reject.' });
  let motivo = null;
  if (accion === 'reject') {
    motivo = str(body.reason).replace(/\s+/g, ' ');
    if (motivo.length < 5) throw new ValidationError({ reason: 'Explica al usuario por qué se rechaza (mínimo 5 caracteres).' });
    if (motivo.length > 300) throw new ValidationError({ reason: 'Máximo 300 caracteres.' });
  }
  const fila = await withTransaction(async (db) => {
    const doc = await repo.documento(db, id, { bloquear: true });
    if (!doc) throw new AppError(404, 'DOCUMENTO_NO_ENCONTRADO', 'No encontramos ese documento.');
    if (doc.estado !== 'pendiente') {
      throw new AppError(409, 'DOCUMENTO_YA_REVISADO', 'Este documento ya fue revisado. Si el usuario envía uno nuevo aparecerá como pendiente.');
    }
    await repo.revisarDocumento(db, id, adminId, { estado: accion === 'approve' ? 'aprobado' : 'rechazado', motivo });
    return doc;
  });
  await notificaciones.alRevisarDocumento({
    usuarioId: fila.usuario_id,
    aprobado: accion === 'approve',
    tipoDocumento: (confianzaMapper.TIPOS_DOCUMENTO[fila.tipo] || 'documento').toLowerCase(),
    motivo,
  });
  return obtenerDocumento(id);
}

// ── Reportes ────────────────────────────────────────────────────────────────
const FILTROS_REPORTE = ['recent', 'oldest', 'read', 'unread', 'all'];

/** GET /api/admin/reportes?filter=recent|oldest|read|unread|all&reportedUserId=&reason=&q=&page= */
async function listarReportes(query = {}) {
  const pg = paginar(query);
  const filtro = query.filter || 'recent';
  const errors = {};
  if (!FILTROS_REPORTE.includes(filtro)) errors.filter = `Usa ${FILTROS_REPORTE.join(', ')}.`;
  if (query.reportedUserId && !esUuid(query.reportedUserId)) errors.reportedUserId = 'Usuario inválido.';
  if (query.reason && !Object.hasOwn(confianzaMapper.MOTIVOS_REPORTE, query.reason)) errors.reason = 'Motivo desconocido.';
  if (Object.keys(errors).length) throw new ValidationError(errors);
  const filas = await repo.listarReportes(pool, {
    filtro, reportadoId: query.reportedUserId || null, motivo: query.reason || null, q: busqueda(query.q), ...pg,
  });
  return {
    filter: filtro,
    reasons: Object.entries(confianzaMapper.MOTIVOS_REPORTE).map(([key, label]) => ({ key, label })),
    ...pagina$(filas, pg, confianzaMapper.toReporteDTO),
  };
}

async function obtenerReporte(id) {
  const fila = await repo.reporte(pool, id);
  if (!fila) throw new AppError(404, 'REPORTE_NO_ENCONTRADO', 'No encontramos ese reporte.');
  return confianzaMapper.toReporteDTO(fila);
}

/**
 * PATCH /api/admin/reportes/:id { read?: boolean, status?: pending|in_review|resolved|dismissed, note? }
 * Lectura y atención son independientes; cerrar (resolved/dismissed) lo marca también como leído.
 */
async function actualizarReporte(id, adminId, body = {}) {
  const errors = {};
  if (body.read !== undefined && typeof body.read !== 'boolean') errors.read = 'Usa true o false.';
  const estado = body.status !== undefined ? confianzaMapper.ESTADO_REPORTE_BD[body.status] : undefined;
  if (body.status !== undefined && !estado) errors.status = 'Usa pending, in_review, resolved o dismissed.';
  let nota = null;
  if (body.note !== undefined && body.note !== null) {
    nota = typeof body.note === 'string' ? body.note.trim() : '';
    if (nota.length > 500) errors.note = 'Máximo 500 caracteres.';
    if (!nota) nota = null;
  }
  if (body.read === undefined && body.status === undefined && nota === null) errors.action = 'Indica read, status o note.';
  if (Object.keys(errors).length) throw new ValidationError(errors);

  await withTransaction(async (db) => {
    const r = await repo.reporte(db, id, { bloquear: true });
    if (!r) throw new AppError(404, 'REPORTE_NO_ENCONTRADO', 'No encontramos ese reporte.');
    if (body.read !== undefined) await repo.marcarLectura(db, id, adminId, body.read);
    if (estado !== undefined || nota !== null) await repo.actualizarAtencion(db, id, adminId, { estado: estado ?? r.estado, nota });
  });
  return obtenerReporte(id);
}

/** GET /api/admin/reportes/recurrentes — usuarios con 6 o más reportes históricos (alerta). */
async function recurrentes() {
  const filas = await repo.recurrentes(pool);
  return {
    threshold: repo.UMBRAL_RECURRENTE,
    items: filas.map((f) => ({
      user: { id: f.usuario_id, fullName: f.nombre_completo, email: f.correo, photoUrl: urlFoto(f.usuario_id, f.foto_storage_key), status: ESTADO_USUARIO[f.estado] },
      totalReports: f.total,
      unreadReports: f.no_leidos,
      reportsToAttend: f.por_atender,
      distinctReporters: f.reportantes,
      lastReportAt: f.ultimo,
    })),
  };
}

// ── Usuarios (RF-29) ────────────────────────────────────────────────────────
function usuarioDTO(f) {
  return {
    id: f.id,
    fullName: f.nombre_completo,
    email: f.correo,
    userType: f.tipo === 'estudiante' ? 'alumno' : 'maestro',
    affiliation: f.carrera ?? f.departamento,
    phone: f.telefono,
    role: f.rol === 'admin' ? 'admin' : 'user',
    status: ESTADO_USUARIO[f.estado],
    emailVerified: f.verificado_en !== null,
    createdAt: f.creado_en,
    photoUrl: urlFoto(f.id, f.foto_storage_key),
    ratingAverage: f.calificacion_promedio === null ? null : Number(f.calificacion_promedio),
    ratingCount: f.calificaciones,
    reportsReceived: f.reportes_recibidos,
    tripsAsDriver: f.viajes_conductor,
    tripsAsPassenger: f.viajes_pasajero,
    documentStatus: f.documento_estado ? confianzaMapper.ESTADO_DOCUMENTO[f.documento_estado] : null,
    recurrent: f.reportes_recibidos >= repo.UMBRAL_RECURRENTE,
  };
}

/** GET /api/admin/usuarios?q=&status=&page= */
async function listarUsuarios(query = {}) {
  const pg = paginar(query);
  const estado = query.status ? ESTADO_USUARIO_BD[query.status] : null;
  if (query.status && !estado) throw new ValidationError({ status: 'Usa active, pending o suspended.' });
  const filas = await repo.listarUsuarios(pool, { estado, q: busqueda(query.q), ...pg });
  return pagina$(filas, pg, usuarioDTO);
}

async function obtenerUsuario(id) {
  const f = await repo.usuario(pool, id);
  if (!f) throw new AppError(404, 'USUARIO_NO_ENCONTRADO', 'No encontramos ese usuario.');
  return usuarioDTO(f);
}

/** PATCH /api/admin/usuarios/:id { action: 'suspend' | 'activate' } — decisión manual del administrador. */
async function cambiarEstadoUsuario(id, adminId, body = {}) {
  if (body.action !== 'suspend' && body.action !== 'activate') throw new ValidationError({ action: 'Usa suspend o activate.' });
  if (id === adminId) throw new AppError(409, 'ACCION_SOBRE_SI_MISMO', 'No puedes cambiar el estado de tu propia cuenta.');
  const f = await repo.usuario(pool, id);
  if (!f) throw new AppError(404, 'USUARIO_NO_ENCONTRADO', 'No encontramos ese usuario.');
  if (f.rol === 'admin') throw new AppError(409, 'USUARIO_ADMIN', 'No se puede suspender a otro administrador desde la app.');
  if (body.action === 'activate' && !f.verificado_en) {
    throw new AppError(409, 'CORREO_NO_VERIFICADO', 'Esta cuenta no ha verificado su correo; no se puede activar.');
  }
  await repo.cambiarEstadoUsuario(pool, id, body.action === 'suspend' ? 'suspendido' : 'activo');
  return obtenerUsuario(id);
}

async function calificacionesDeUsuario(id, query) {
  await obtenerUsuario(id);
  return confianza.recibidasDeUsuario(id, query);
}

module.exports = {
  resumen, listarDocumentos, obtenerDocumento, revisarDocumento,
  listarReportes, obtenerReporte, actualizarReporte, recurrentes,
  listarUsuarios, obtenerUsuario, cambiarEstadoUsuario, calificacionesDeUsuario,
};
