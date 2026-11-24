'use strict';
/**
 * Módulo Confianza y seguridad (3.1.5).
 *   RF-27 calificaciones: la puntuación es definitiva; el comentario se edita,
 *         se borra y deja de mostrarse tras la vigencia (parametro, 30 días).
 *   RF-28 reportes entre participantes de un viaje.
 *   RF-31 contacto de emergencia.
 *   Mis documentos: estado de revisión y reenvío de un documento rechazado.
 */
const { pool, withTransaction } = require('../../config/db');
const { AppError, ValidationError } = require('../../shared/errors');
const { pagina } = require('../../shared/validacion');
const storage = require('../../shared/storage');
const { urlDocumento } = require('../../shared/archivos');
const mapper = require('./confianza.mapper');
const repo = require('./confianza.repository');

const POR_PAGINA = 20;
const noEncontrado = () => new AppError(404, 'VIAJE_NO_ENCONTRADO', 'No encontramos ese viaje.');

const participo = (viaje, usuarioId) => viaje.conductor_id === usuarioId || viaje.mi_reserva_estado === 'aceptada';

function paginar(query) {
  const p = pagina(query?.page);
  if (p === null) throw new ValidationError({ page: 'Página inválida.' });
  return { pagina: p, limite: POR_PAGINA, desplazamiento: (p - 1) * POR_PAGINA };
}

// ── Participantes del viaje (para calificar y reportar) ─────────────────────
/**
 * GET /api/viajes/:id/participantes
 * El conductor ve a sus pasajeros aceptados; el pasajero aceptado ve al conductor.
 * Cada uno trae si ya lo califiqué y si ya lo reporté en este viaje.
 */
async function participantesDeViaje(viajeId, usuarioId) {
  const viaje = await repo.viajeConRelacion(pool, viajeId, usuarioId);
  if (!viaje || !participo(viaje, usuarioId)) throw noEncontrado();
  const [todos, dadas, reportados, vigencia] = await Promise.all([
    repo.participantes(pool, viajeId),
    repo.dadasEnViaje(pool, viajeId, usuarioId),
    repo.reportesHechosEnViaje(pool, viajeId, usuarioId),
    repo.vigenciaComentarioDias(pool),
  ]);
  const soyConductor = viaje.conductor_id === usuarioId;
  const visibles = todos.filter((p) => p.id !== usuarioId && (soyConductor ? p.rol === 'passenger' : p.rol === 'driver'));
  const finalizado = viaje.estado === 'finalizado';
  return {
    tripId: viaje.id,
    tripStatus: viaje.estado,
    finishedAt: viaje.finalizado_en,
    myRole: soyConductor ? 'driver' : 'passenger',
    participants: visibles.map((p) => {
      const mia = dadas.find((c) => c.evaluado_id === p.id);
      return {
        user: mapper.personaDTO(p.id, p.nombre_completo, p.foto_storage_key, { affiliation: p.carrera ?? p.departamento }),
        role: p.rol,
        myRating: mia ? mapper.toCalificacionDadaDTO(mia, vigencia) : null,
        canRate: finalizado && !mia,
        alreadyReported: reportados.includes(p.id),
      };
    }),
  };
}

// ── Calificaciones ──────────────────────────────────────────────────────────
/** POST /api/calificaciones (RF-27, RN-10). Una por viaje, evaluador y evaluado; definitiva. */
async function calificar(evaluadorId, body) {
  const datos = mapper.parseCalificacion(body);
  if (datos.evaluado_id === evaluadorId) throw new ValidationError({ ratedUserId: 'No puedes calificarte a ti mismo.' });
  const viaje = await repo.viajeConRelacion(pool, datos.viaje_id, evaluadorId);
  if (!viaje || !participo(viaje, evaluadorId)) throw noEncontrado();
  if (viaje.estado !== 'finalizado') throw new AppError(409, 'VIAJE_NO_FINALIZADO', 'Podrás calificar cuando el viaje se finalice.');
  // Conductor ↔ pasajero (reciprocidad de RF-27). El trigger revisa además que ambos participaron.
  const soyConductor = viaje.conductor_id === evaluadorId;
  if (!soyConductor && datos.evaluado_id !== viaje.conductor_id) {
    throw new AppError(403, 'NO_PARTICIPANTE', 'Como pasajero solo puedes calificar al conductor del viaje.');
  }
  const id = await repo.insertarCalificacion(pool, { ...datos, evaluador_id: evaluadorId });
  // Calificar cuenta como haber atendido el recordatorio de ese viaje.
  await repo.marcarRecordatorio(pool, evaluadorId, datos.viaje_id);
  const vigencia = await repo.vigenciaComentarioDias(pool);
  return mapper.toCalificacionDadaDTO(await repo.calificacionPorId(pool, id), vigencia);
}

async function comentarioPropio(db, calificacionId, usuarioId) {
  const fila = await repo.bloquearCalificacion(db, calificacionId);
  // Solo el autor: para cualquier otra persona la calificación "no existe".
  if (!fila || fila.evaluador_id !== usuarioId) {
    throw new AppError(404, 'CALIFICACION_NO_ENCONTRADA', 'No encontramos esa calificación.');
  }
  return fila;
}

/**
 * PATCH /api/calificaciones/:id/comentario { comment }
 * Edita el comentario vigente o escribe uno nuevo si no tiene (nunca lo tuvo o lo borró).
 * La puntuación no cambia. Un comentario vencido ya no se puede editar.
 */
async function editarComentario(calificacionId, usuarioId, body) {
  const comentario = mapper.parseComentario(body?.comment);
  if (!comentario) throw new ValidationError({ comment: 'Escribe tu comentario o elimínalo.' });
  const vigencia = await repo.vigenciaComentarioDias(pool);
  await withTransaction(async (db) => {
    const fila = await comentarioPropio(db, calificacionId, usuarioId);
    if (fila.comentario && !mapper.comentarioVigente(fila, vigencia)) {
      throw new AppError(409, 'COMENTARIO_VENCIDO', `El comentario ya no está visible (pasaron más de ${vigencia} días) y no se puede editar.`);
    }
    await repo.guardarComentario(db, calificacionId, comentario, { nuevo: !fila.comentario });
  });
  return mapper.toCalificacionDadaDTO(await repo.calificacionPorId(pool, calificacionId), vigencia);
}

/** DELETE /api/calificaciones/:id/comentario — borra solo el comentario; la puntuación se conserva. */
async function eliminarComentario(calificacionId, usuarioId) {
  await withTransaction(async (db) => {
    const fila = await comentarioPropio(db, calificacionId, usuarioId);
    if (!fila.comentario) throw new AppError(409, 'SIN_COMENTARIO', 'Esta calificación no tiene comentario.');
    await repo.eliminarComentario(db, calificacionId);
  });
  const vigencia = await repo.vigenciaComentarioDias(pool);
  return mapper.toCalificacionDadaDTO(await repo.calificacionPorId(pool, calificacionId), vigencia);
}

function resumenDTO(r) {
  return {
    average: r.promedio === null ? null : Number(r.promedio),
    count: r.total,
    distribution: { 5: r.e5, 4: r.e4, 3: r.e3, 2: r.e2, 1: r.e1 },
  };
}

/** GET /api/me/calificaciones?page= — recibidas, con promedio. */
async function recibidas(usuarioId, query) {
  const pg = paginar(query);
  const [resumen, filas, vigencia] = await Promise.all([
    repo.resumenRecibidas(pool, usuarioId),
    repo.listarRecibidas(pool, usuarioId, pg),
    repo.vigenciaComentarioDias(pool),
  ]);
  return {
    summary: resumenDTO(resumen),
    commentRetentionDays: vigencia,
    items: filas.slice(0, POR_PAGINA).map((f) => mapper.toCalificacionRecibidaDTO(f, vigencia)),
    page: pg.pagina,
    pageSize: POR_PAGINA,
    hasMore: filas.length > POR_PAGINA,
  };
}

/** GET /api/me/calificaciones/dadas?page= — las que escribí (para editar o borrar el comentario). */
async function dadas(usuarioId, query) {
  const pg = paginar(query);
  const [filas, vigencia] = await Promise.all([repo.listarDadas(pool, usuarioId, pg), repo.vigenciaComentarioDias(pool)]);
  return {
    commentRetentionDays: vigencia,
    items: filas.slice(0, POR_PAGINA).map((f) => mapper.toCalificacionDadaDTO(f, vigencia)),
    page: pg.pagina,
    pageSize: POR_PAGINA,
    hasMore: filas.length > POR_PAGINA,
  };
}

/** Resumen de calificaciones de cualquier usuario (lo usa el panel de administración). */
async function resumenDeUsuario(usuarioId) {
  return resumenDTO(await repo.resumenRecibidas(pool, usuarioId));
}

/** Calificaciones recibidas por un usuario, vistas por el administrador. */
async function recibidasDeUsuario(usuarioId, query) {
  return recibidas(usuarioId, query);
}

/** GET /api/calificaciones/pendientes — el recordatorio a mostrar (como máximo uno por viaje, una sola vez). */
async function pendientes(usuarioId) {
  const filas = await repo.pendientesDeCalificar(pool, usuarioId);
  return {
    items: filas.map((f) => ({
      tripId: f.id,
      trip: { origin: f.origen_texto, destination: f.destino_texto, departureAt: f.salida_en },
      finishedAt: f.finalizado_en,
      myRole: f.soy_conductor ? 'driver' : 'passenger',
      toRate: f.por_calificar.map((u) => mapper.personaDTO(u.id, u.nombre, u.foto)),
    })),
  };
}

/**
 * POST /api/calificaciones/recordatorios/:viajeId — el recordatorio ya se mostró:
 * no vuelve a aparecer en ningún dispositivo, califique o no.
 */
async function marcarRecordatorio(usuarioId, viajeId) {
  const viaje = await repo.viajeConRelacion(pool, viajeId, usuarioId);
  if (!viaje || !participo(viaje, usuarioId)) throw noEncontrado();
  await repo.marcarRecordatorio(pool, usuarioId, viajeId);
  return { tripId: viajeId, reminded: true };
}

// ── Reportes ────────────────────────────────────────────────────────────────
/**
 * POST /api/reportes (RF-28). Se reporta a otra persona del mismo viaje: el conductor
 * a quien tuvo una solicitud en su viaje; el pasajero al conductor del viaje que reservó.
 */
async function reportar(reportanteId, body) {
  const datos = mapper.parseReporte(body);
  if (datos.usuario_reportado_id === reportanteId) throw new ValidationError({ reportedUserId: 'No puedes reportarte a ti mismo.' });
  const viaje = await repo.viajeConRelacion(pool, datos.viaje_id, reportanteId);
  if (!viaje) throw noEncontrado();
  const soyConductor = viaje.conductor_id === reportanteId;
  const relacionado = soyConductor
    ? await repo.tuvoReserva(pool, viaje.id, datos.usuario_reportado_id)
    : Boolean(viaje.mi_reserva_estado) && datos.usuario_reportado_id === viaje.conductor_id;
  if (!relacionado) {
    throw new AppError(403, 'REPORTE_NO_PERMITIDO', 'Solo puedes reportar a personas con las que coincidiste en este viaje.');
  }
  const fila = await repo.insertarReporte(pool, { ...datos, reportante_id: reportanteId });
  return {
    id: fila.id,
    createdAt: fila.creado_en,
    message: 'Recibimos tu reporte. El equipo de administración lo revisará de forma confidencial.',
  };
}

// ── Contacto de emergencia ──────────────────────────────────────────────────
async function obtenerContacto(usuarioId) {
  return { contact: mapper.toContactoDTO(await repo.contacto(pool, usuarioId)) };
}

async function guardarContacto(usuarioId, body) {
  return { contact: mapper.toContactoDTO(await repo.guardarContacto(pool, usuarioId, mapper.parseContacto(body))) };
}

async function eliminarContacto(usuarioId) {
  if (!(await repo.eliminarContacto(pool, usuarioId))) {
    throw new AppError(404, 'SIN_CONTACTO', 'No tienes un contacto de emergencia registrado.');
  }
  return { contact: null };
}

// ── Mis documentos ──────────────────────────────────────────────────────────
const TIPO_POR_USUARIO = { estudiante: 'reticula_academica', docente: 'carga_horaria' };

/** GET /api/me/documentos — todos mis documentos (los rechazados quedan como historial). */
async function misDocumentos(usuarioId) {
  const filas = await repo.documentosDe(pool, usuarioId);
  const vigente = filas.find((f) => f.estado !== 'rechazado');
  const usuario = await repo.usuarioBasico(pool, usuarioId);
  return {
    requiredType: TIPO_POR_USUARIO[usuario.tipo],
    // Se puede reenviar si no hay uno pendiente ni aprobado (el último fue rechazado o no hay ninguno).
    canUpload: !vigente,
    items: filas.map((f) => mapper.toDocumentoDTO(f, { url: urlDocumento(f.id, f.storage_key).url })),
  };
}

/** POST /api/me/documentos (multipart "document") — reemplaza un documento rechazado. */
async function reenviarDocumento(usuarioId, file) {
  if (!file) throw new ValidationError({ document: 'Adjunta el documento (PDF, PNG o JPG).' });
  const usuario = await repo.usuarioBasico(pool, usuarioId);
  const tipo = TIPO_POR_USUARIO[usuario.tipo];
  const filas = await repo.documentosDe(pool, usuarioId);
  const vigente = filas.find((f) => f.tipo === tipo && f.estado !== 'rechazado');
  if (vigente?.estado === 'pendiente') throw new AppError(409, 'DOCUMENTO_EN_REVISION', 'Tu documento ya está en revisión. Espera la respuesta del administrador.');
  if (vigente?.estado === 'aprobado') throw new AppError(409, 'DOCUMENTO_APROBADO', 'Tu documento ya fue aceptado; no necesitas enviarlo de nuevo.');

  const key = await storage.guardar(file.buffer, { carpeta: 'documentos', mime: file.mimetype });
  try {
    const fila = await repo.insertarDocumento(pool, usuarioId, {
      tipo,
      nombre_archivo: String(file.originalname || 'documento').slice(0, 255),
      mime_type: file.mimetype,
      tamano_bytes: file.size,
      storage_key: key,
    });
    return mapper.toDocumentoDTO(fila, { url: urlDocumento(fila.id, fila.storage_key).url });
  } catch (err) {
    await storage.eliminar(key);
    throw err;
  }
}

module.exports = {
  participantesDeViaje, calificar, editarComentario, eliminarComentario, recibidas, dadas, resumenDeUsuario,
  recibidasDeUsuario, pendientes, marcarRecordatorio, reportar,
  obtenerContacto, guardarContacto, eliminarContacto, misDocumentos, reenviarDocumento,
};
