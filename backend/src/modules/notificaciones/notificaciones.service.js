'use strict';
/**
 * Lógica del módulo Notificaciones (avisos dentro de la app, retención 72 h).
 *
 * Los módulos Reservas y Viajes llaman a los avisos al*() DESPUÉS del COMMIT.
 * Un aviso nunca hace fallar la acción del usuario: si algo sale mal se registra
 * en el log y la acción (reservar, cancelar…) ya quedó guardada.
 */
const { pool } = require('../../config/db');
const { AppError, ValidationError } = require('../../shared/errors');
const { esUuid } = require('../../shared/validacion');
const mapper = require('./notificacion.mapper');
const repo = require('./notificaciones.repository');

const noEncontrada = () => new AppError(404, 'NOTIFICACION_NO_ENCONTRADA', 'No encontramos esa notificación.');

// ── Bandeja del usuario ─────────────────────────────────────────────────────

/** GET /api/me/notificaciones → { items, unread, summary: { newTrips, pendingRequests } } */
async function listar(usuarioId) {
  await repo.purgarAntiguas(pool);
  const [filas, unread, r] = await Promise.all([
    repo.listar(pool, usuarioId),
    repo.contarNoLeidas(pool, usuarioId),
    repo.resumen(pool, usuarioId),
  ]);
  return {
    items: filas.map(mapper.toNotificacionDTO),
    unread,
    summary: { newTrips: r.viajes_nuevos, pendingRequests: r.solicitudes_pendientes },
  };
}

/** POST /api/me/notificaciones/viajes-vistos: el usuario abrió la búsqueda; la insignia vuelve a 0. */
async function marcarViajesVistos(usuarioId) {
  await repo.marcarViajesVistos(pool, usuarioId);
  return { newTrips: 0 };
}

/** PATCH /api/me/notificaciones/:id/leida */
async function marcarLeida(usuarioId, id) {
  if (!esUuid(id)) throw noEncontrada();
  const fila = await repo.marcarLeida(pool, usuarioId, id);
  if (!fila) throw noEncontrada(); // ajena o inexistente (RNF-09)
  return mapper.toNotificacionDTO(fila);
}

/** POST /api/me/notificaciones/leer-todas  { types?: string[] } (sin types = todas) */
async function marcarTodas(usuarioId, body = {}) {
  let tipos = null;
  if (body && body.types !== undefined) {
    if (!Array.isArray(body.types) || body.types.length === 0 || body.types.some((t) => ![...mapper.TIPOS, ...mapper.TIPOS_DOCUMENTO].includes(t))) {
      throw new ValidationError({ types: `Usa una lista con: ${[...mapper.TIPOS, ...mapper.TIPOS_DOCUMENTO].join(', ')}.` });
    }
    tipos = body.types;
  }
  await repo.marcarTodas(pool, usuarioId, tipos);
  return { unread: await repo.contarNoLeidas(pool, usuarioId) };
}

// ── Avisos generados por las acciones ───────────────────────────────────────

async function seguro(nombre, fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`[notificaciones] no se pudo generar el aviso "${nombre}":`, err.message);
  }
}

function filaDeReserva(tipo, destinatario, ctx, extra) {
  const { titulo, mensaje } = mapper.componer(tipo, ctx, extra);
  return { usuarioId: destinatario, tipo, titulo, mensaje, viajeId: ctx.viaje_id, reservaId: ctx.reserva_id };
}

/** Pasajero solicitó lugar → aviso al conductor. */
const alSolicitar = (reservaId) => seguro('solicitud_recibida', async () => {
  const ctx = await repo.contextoReserva(pool, reservaId);
  if (ctx) await repo.insertarVarias(pool, [filaDeReserva('solicitud_recibida', ctx.conductor_id, ctx)]);
});

/** Conductor aceptó o rechazó → aviso al pasajero. */
const alResponder = (reservaId) => seguro('respuesta', async () => {
  const ctx = await repo.contextoReserva(pool, reservaId);
  if (!ctx) return;
  const tipo = ctx.estado === 'aceptada' ? 'solicitud_aceptada' : 'solicitud_rechazada';
  await repo.insertarVarias(pool, [filaDeReserva(tipo, ctx.pasajero_id, ctx)]);
});

/** Pasajero canceló su solicitud o su lugar → aviso al conductor. */
const alCancelarReserva = (reservaId, estadoAnterior) => seguro('cancelacion_reserva', async () => {
  const ctx = await repo.contextoReserva(pool, reservaId);
  if (!ctx) return;
  const tipo = estadoAnterior === 'aceptada' ? 'lugar_cancelado' : 'solicitud_cancelada';
  await repo.insertarVarias(pool, [filaDeReserva(tipo, ctx.conductor_id, ctx, { tardia: ctx.cancelacion_tardia })]);
});

/**
 * Conductor canceló el viaje → aviso a cada pasajero con reserva vigente.
 * @param {string} viajeId
 * @param {{ reservaId: string, pasajeroId: string }[]} afectados
 */
const alCancelarViaje = (viajeId, afectados) => seguro('viaje_cancelado', async () => {
  if (!afectados.length) return;
  const ctx = await repo.contextoViaje(pool, viajeId);
  if (!ctx) return;
  const { titulo, mensaje } = mapper.componer('viaje_cancelado', ctx);
  await repo.insertarVarias(pool, afectados.map((a) => ({
    usuarioId: a.pasajeroId, tipo: 'viaje_cancelado', titulo, mensaje, viajeId, reservaId: a.reservaId,
  })));
});

/** Aviso igual a cada pasajero en lista de espera de un viaje (viaje_lleno / lugar_liberado). */
const avisarEnEspera = (tipo, viajeId) => seguro(tipo, async () => {
  const pendientes = await repo.pendientesDeViaje(pool, viajeId);
  if (!pendientes.length) return;
  const ctx = await repo.contextoViaje(pool, viajeId);
  if (!ctx) return;
  const { titulo, mensaje } = mapper.componer(tipo, ctx);
  await repo.insertarVarias(pool, pendientes.map((p) => ({
    usuarioId: p.pasajero_id, tipo, titulo, mensaje, viajeId, reservaId: p.reserva_id,
  })));
});

/** El viaje se llenó con solicitudes pendientes → quedan en lista de espera. */
const alViajeLleno = (viajeId) => avisarEnEspera('viaje_lleno', viajeId);
/** Se liberó un lugar en un viaje lleno → avisar a la lista de espera. */
const alLugarLiberado = (viajeId) => avisarEnEspera('lugar_liberado', viajeId);

/**
 * El administrador revisó un documento → aviso al dueño.
 * @param {{ usuarioId: string, aprobado: boolean, tipoDocumento: string, motivo?: string|null }} d
 */
const alRevisarDocumento = (d) => seguro('documento_revisado', async () => {
  const tipo = d.aprobado ? 'documento_aprobado' : 'documento_rechazado';
  const { titulo, mensaje } = mapper.componerDocumento(tipo, d);
  await repo.insertarVarias(pool, [{ usuarioId: d.usuarioId, tipo, titulo, mensaje }]);
});

module.exports = { alRevisarDocumento, listar, marcarLeida, marcarTodas, marcarViajesVistos, alViajeLleno, alLugarLiberado, alSolicitar, alResponder, alCancelarReserva, alCancelarViaje };
