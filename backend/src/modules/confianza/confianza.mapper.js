'use strict';
/**
 * Mapper del módulo Confianza y seguridad (RF-27, RF-28, RF-31).
 * Funciones puras: validan la entrada y convierten filas de BD → JSON.
 */
const { ValidationError } = require('../../shared/errors');
const { str, esUuid, entero } = require('../../shared/validacion');
const { urlFoto } = require('../../shared/fotos');

// ── Calificaciones ──────────────────────────────────────────────────────────
const MAX_COMENTARIO = 280;

/** Texto de comentario: null si viene vacío; error si excede el máximo. */
function parseComentario(v, campo = 'comment') {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new ValidationError({ [campo]: 'El comentario debe ser texto.' });
  const t = v.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (t.length > MAX_COMENTARIO) throw new ValidationError({ [campo]: `El comentario no puede exceder ${MAX_COMENTARIO} caracteres.` });
  return t;
}

/** POST /api/calificaciones { tripId, ratedUserId, score, comment? } */
function parseCalificacion(body) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = {};
  if (!esUuid(b.tripId)) errors.tripId = 'Indica el viaje que quieres calificar.';
  if (!esUuid(b.ratedUserId)) errors.ratedUserId = 'Indica a quién quieres calificar.';
  const puntaje = entero(b.score);
  if (puntaje === null || puntaje < 1 || puntaje > 5) errors.score = 'Elige de 1 a 5 estrellas.';
  let comentario = null;
  try {
    comentario = parseComentario(b.comment);
  } catch (err) {
    Object.assign(errors, err.fields);
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { viaje_id: b.tripId, evaluado_id: b.ratedUserId, puntaje, comentario };
}

/** El comentario se muestra mientras no pasen `vigenciaDias` desde que se publicó. */
function comentarioVigente(row, vigenciaDias, ahora = new Date()) {
  if (!row.comentario || !row.comentario_en) return false;
  const vence = new Date(row.comentario_en).getTime() + vigenciaDias * 86_400_000;
  return ahora.getTime() < vence;
}

function venceComentario(row, vigenciaDias) {
  if (!row.comentario_en) return null;
  return new Date(new Date(row.comentario_en).getTime() + vigenciaDias * 86_400_000).toISOString();
}

const personaDTO = (id, nombre, fotoKey, extra = {}) => ({
  id,
  fullName: nombre,
  photoUrl: urlFoto(id, fotoKey),
  ...extra,
});

/** Calificación vista por quien la recibió (o por el administrador). */
function toCalificacionRecibidaDTO(row, vigenciaDias, ahora = new Date()) {
  const vigente = comentarioVigente(row, vigenciaDias, ahora);
  return {
    id: row.id,
    tripId: row.viaje_id,
    score: row.puntaje,
    comment: vigente ? row.comentario : null,
    commentExpired: Boolean(row.comentario) && !vigente,
    createdAt: row.creada_en,
    rater: personaDTO(row.evaluador_id, row.evaluador_nombre, row.evaluador_foto),
    raterRole: row.evaluador_id === row.conductor_id ? 'driver' : 'passenger',
    trip: row.origen_texto ? { origin: row.origen_texto, destination: row.destino_texto, departureAt: row.salida_en } : null,
  };
}

/** Calificación vista por su autor: puede editar o borrar el comentario mientras esté vigente. */
function toCalificacionDadaDTO(row, vigenciaDias, ahora = new Date()) {
  const vigente = comentarioVigente(row, vigenciaDias, ahora);
  return {
    id: row.id,
    tripId: row.viaje_id,
    score: row.puntaje,
    comment: vigente ? row.comentario : null,
    commentExpired: Boolean(row.comentario) && !vigente,
    commentExpiresAt: vigente ? venceComentario(row, vigenciaDias) : null,
    commentEditedAt: row.comentario_editado_en,
    commentDeletedAt: row.comentario_eliminado_en,
    // Con comentario vigente: editar o borrar. Sin comentario (nunca tuvo o lo borró): se puede escribir uno.
    canEditComment: vigente,
    canAddComment: !row.comentario,
    createdAt: row.creada_en,
    ratedUser: personaDTO(row.evaluado_id, row.evaluado_nombre, row.evaluado_foto),
    trip: row.origen_texto ? { origin: row.origen_texto, destination: row.destino_texto, departureAt: row.salida_en } : null,
  };
}

// ── Reportes ────────────────────────────────────────────────────────────────
/** Motivos que ofrece la app (en este orden). Los dos últimos de la BD quedan solo para historial. */
const MOTIVOS_REPORTE = Object.freeze({
  conducta_inapropiada: 'Comportamiento inapropiado',
  incumplimiento_acuerdos: 'Incumplimiento de acuerdos del viaje',
  informacion_falsa: 'Información falsa o engañosa',
  seguridad: 'Problemas de seguridad',
  acoso: 'Acoso o intimidación',
  incumplimiento_normas: 'Incumplimiento de normas',
  otro: 'Otro',
});
const MOTIVOS_HISTORICOS = Object.freeze({ no_se_presento: 'No se presentó', cobro_indebido: 'Cobro indebido' });
const etiquetaMotivo = (m) => MOTIVOS_REPORTE[m] || MOTIVOS_HISTORICOS[m] || m;

const MIN_DESCRIPCION = 10;
const MAX_DESCRIPCION = 1000;
const MAX_MOTIVO_OTRO = 100;

/** POST /api/reportes { reportedUserId, tripId, reason, reasonOther?, description } */
function parseReporte(body) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = {};
  if (!esUuid(b.reportedUserId)) errors.reportedUserId = 'Indica a quién quieres reportar.';
  if (!esUuid(b.tripId)) errors.tripId = 'Indica el viaje relacionado con el reporte.';
  const motivo = str(b.reason);
  if (!Object.hasOwn(MOTIVOS_REPORTE, motivo)) errors.reason = 'Selecciona un motivo.';
  let motivoOtro = null;
  if (motivo === 'otro') {
    motivoOtro = str(b.reasonOther).replace(/\s+/g, ' ');
    if (!motivoOtro) errors.reasonOther = 'Especifica el motivo.';
    else if (motivoOtro.length > MAX_MOTIVO_OTRO) errors.reasonOther = `Máximo ${MAX_MOTIVO_OTRO} caracteres.`;
  }
  const descripcion = typeof b.description === 'string' ? b.description.trim() : '';
  if (!descripcion) errors.description = 'Describe lo que pasó.';
  else if (descripcion.length < MIN_DESCRIPCION) errors.description = `Escribe al menos ${MIN_DESCRIPCION} caracteres.`;
  else if (descripcion.length > MAX_DESCRIPCION) errors.description = `Máximo ${MAX_DESCRIPCION} caracteres.`;
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { usuario_reportado_id: b.reportedUserId, viaje_id: b.tripId, motivo, motivo_otro: motivoOtro, descripcion };
}

const ESTADO_REPORTE = Object.freeze({ pendiente: 'pending', en_revision: 'in_review', resuelto: 'resolved', descartado: 'dismissed' });
const ESTADO_REPORTE_BD = Object.freeze(Object.fromEntries(Object.entries(ESTADO_REPORTE).map(([k, v]) => [v, k])));

function toReporteDTO(row) {
  return {
    id: row.id,
    reason: row.motivo,
    reasonLabel: etiquetaMotivo(row.motivo),
    reasonOther: row.motivo_otro,
    description: row.descripcion,
    status: ESTADO_REPORTE[row.estado],
    read: row.leido_en !== null,
    readAt: row.leido_en,
    attended: row.estado === 'resuelto' || row.estado === 'descartado',
    adminNote: row.nota_admin,
    reviewedAt: row.revisado_en,
    createdAt: row.creado_en,
    reporter: personaDTO(row.reportante_id, row.reportante_nombre, row.reportante_foto, { email: row.reportante_correo }),
    reportedUser: personaDTO(row.usuario_reportado_id, row.reportado_nombre, row.reportado_foto, {
      email: row.reportado_correo,
      status: row.reportado_estado === 'activo' ? 'active' : row.reportado_estado === 'pendiente' ? 'pending' : 'suspended',
      totalReports: row.reportado_total !== undefined ? Number(row.reportado_total) : undefined,
    }),
    trip: row.viaje_id
      ? { id: row.viaje_id, origin: row.origen_texto, destination: row.destino_texto, departureAt: row.salida_en, status: row.viaje_estado }
      : null,
  };
}

// ── Contacto de emergencia (RF-31) ──────────────────────────────────────────
const PARENTESCOS = Object.freeze({
  madre: 'Madre', padre: 'Padre', hermano: 'Hermano', hermana: 'Hermana', hijo: 'Hijo', hija: 'Hija',
  pareja: 'Pareja', abuelo: 'Abuelo', abuela: 'Abuela', familiar: 'Familiar', amigo: 'Amigo', amiga: 'Amiga', otro: 'Otro',
});

/**
 * Teléfono de México: 10 dígitos nacionales (la LADA ya va incluida en ellos).
 * Acepta espacios, guiones, puntos, paréntesis y el prefijo +52 / 52 opcional.
 * @returns {string|null} 10 dígitos o null si no es válido
 */
function normalizarTelefonoMx(v) {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const texto = String(v).trim();
  if (!/^[+\d\s\-().]+$/.test(texto)) return null;
  let digitos = texto.replace(/\D/g, '');
  if (texto.startsWith('+')) {
    if (!digitos.startsWith('52')) return null;
    digitos = digitos.slice(2);
  } else if (digitos.length === 12 && digitos.startsWith('52')) {
    digitos = digitos.slice(2);
  }
  return /^[0-9]{10}$/.test(digitos) ? digitos : null;
}

/** PUT /api/me/contacto-emergencia { name, phone, relationship, relationshipOther? } */
function parseContacto(body) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = {};
  const nombre = str(b.name).replace(/\s+/g, ' ');
  if (nombre.length < 3) errors.name = 'Escribe el nombre de tu contacto.';
  else if (nombre.length > 120) errors.name = 'Máximo 120 caracteres.';
  else if (/[0-9]/.test(nombre)) errors.name = 'El nombre no debe llevar números.';
  const telefono = normalizarTelefonoMx(b.phone);
  if (!str(String(b.phone ?? ''))) errors.phone = 'Escribe el número de teléfono.';
  else if (!telefono) errors.phone = 'Escribe un número de 10 dígitos (incluye la LADA).';
  const parentesco = str(b.relationship);
  if (!Object.hasOwn(PARENTESCOS, parentesco)) errors.relationship = 'Selecciona el parentesco.';
  let otro = null;
  if (parentesco === 'otro') {
    otro = str(b.relationshipOther).replace(/\s+/g, ' ');
    if (!otro) errors.relationshipOther = 'Especifica el parentesco.';
    else if (otro.length > 60) errors.relationshipOther = 'Máximo 60 caracteres.';
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { nombre, telefono, parentesco, parentesco_otro: otro };
}

function toContactoDTO(row) {
  if (!row) return null;
  return {
    name: row.nombre,
    phone: row.telefono,
    relationship: row.parentesco,
    relationshipLabel: row.parentesco === 'otro' ? row.parentesco_otro : PARENTESCOS[row.parentesco],
    relationshipOther: row.parentesco_otro,
    updatedAt: row.actualizado_en,
  };
}

// ── Documentos ──────────────────────────────────────────────────────────────
const TIPOS_DOCUMENTO = Object.freeze({ reticula_academica: 'Retícula académica', carga_horaria: 'Carga horaria' });
const ESTADO_DOCUMENTO = Object.freeze({ pendiente: 'pending', aprobado: 'approved', rechazado: 'rejected' });

function toDocumentoDTO(row, { url = null, conPropietario = false } = {}) {
  return {
    id: row.id,
    type: row.tipo,
    typeLabel: TIPOS_DOCUMENTO[row.tipo] || row.tipo,
    fileName: row.nombre_archivo,
    mimeType: row.mime_type,
    sizeBytes: row.tamano_bytes,
    status: ESTADO_DOCUMENTO[row.estado],
    rejectionReason: row.motivo_rechazo,
    reviewedAt: row.revisado_en,
    uploadedAt: row.creado_en,
    viewUrl: url,
    ...(conPropietario && {
      owner: personaDTO(row.usuario_id, row.propietario_nombre, row.propietario_foto, {
        email: row.propietario_correo,
        userType: row.propietario_tipo === 'estudiante' ? 'alumno' : 'maestro',
      }),
    }),
  };
}

module.exports = {
  MAX_COMENTARIO, MIN_DESCRIPCION, MAX_DESCRIPCION, MOTIVOS_REPORTE, PARENTESCOS, TIPOS_DOCUMENTO,
  ESTADO_REPORTE, ESTADO_REPORTE_BD, ESTADO_DOCUMENTO,
  parseComentario, parseCalificacion, comentarioVigente, parseReporte, parseContacto, normalizarTelefonoMx,
  toCalificacionRecibidaDTO, toCalificacionDadaDTO, toReporteDTO, toContactoDTO, toDocumentoDTO, personaDTO, etiquetaMotivo,
};
