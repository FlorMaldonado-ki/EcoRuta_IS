'use strict';
/**
 * Lógica del módulo Reservas (RF-15, RF-16, RF-17, RN-05, RN-06, RNF-09, RNF-28).
 * El descuento y la liberación de asientos los hace el trigger de la BD dentro
 * de la misma transacción: dos aceptaciones simultáneas del último lugar nunca
 * sobrevenden (una recibe 409 SIN_ASIENTOS).
 */
const { pool, withTransaction } = require('../../config/db');
const { AppError } = require('../../shared/errors');
const { esUuid } = require('../../shared/validacion');
const notificaciones = require('../notificaciones/notificaciones.service');
const mapper = require('./reserva.mapper');
const repo = require('./reservas.repository');

const viajeNoEncontrado = () => new AppError(404, 'VIAJE_NO_ENCONTRADO', 'No encontramos ese viaje.');
const reservaNoEncontrada = () => new AppError(404, 'RESERVA_NO_ENCONTRADA', 'No encontramos esa reserva.');

/** RF-15 · POST /api/viajes/:id/reservas { meetingPoint } → 201 con la reserva 'solicitada'. */
async function solicitar(viajeId, pasajeroId, body = {}) {
  if (!esUuid(viajeId)) throw viajeNoEncontrado();
  const reserva = await withTransaction(async (db) => {
    await repo.bloquearPasajero(db, pasajeroId);
    const viaje = await repo.viajeParaReservar(db, viajeId);
    if (!viaje) throw viajeNoEncontrado();
    if (viaje.conductor_id === pasajeroId) throw new AppError(422, 'RESERVA_PROPIA', 'No puedes reservar tu propio viaje.');
    if (viaje.estado !== 'publicado' || !viaje.es_futuro) throw new AppError(409, 'VIAJE_NO_DISPONIBLE', 'Este viaje ya no está disponible.');
    if (viaje.asientos_disponibles <= 0) throw new AppError(409, 'SIN_ASIENTOS', 'Ya no quedan lugares en este viaje.');
    if (await repo.tieneReservaVigente(db, viajeId, pasajeroId)) {
      throw new AppError(409, 'RESERVA_DUPLICADA', 'Ya tienes una solicitud en este viaje.');
    }
    const traslape = await repo.buscarTraslape(db, pasajeroId, viajeId, viaje.salida_en);
    if (traslape) {
      throw new AppError(409, 'RESERVA_TRASLAPADA',
        `Ya tienes otro viaje que sale a menos de ${repo.VENTANA_TRASLAPE_MIN} minutos de este.`);
    }
    const puntoUnion = mapper.parsePuntoUnion(body, viaje.puntos_encuentro || []);
    return repo.insertar(db, viajeId, pasajeroId, puntoUnion);
  });
  // Aviso en la app al conductor (después del COMMIT). RF-20 (Sprint 3) añadirá el correo.
  await notificaciones.alSolicitar(reserva.id);
  return mapper.toReservaDTO(reserva);
}

/** RF-16 · GET /api/viajes/:id/reservas: solo el conductor (si no, 404). */
async function listarDeViaje(viajeId, conductorId, { status } = {}) {
  if (!esUuid(viajeId)) throw viajeNoEncontrado();
  const viaje = await repo.viajeParaReservar(pool, viajeId);
  if (!viaje || viaje.conductor_id !== conductorId) throw viajeNoEncontrado();
  const estados = { requested: 'solicitada', accepted: 'aceptada', rejected: 'rechazada', cancelled: 'cancelada' };
  if (status !== undefined && !estados[status]) {
    throw new AppError(422, 'VALIDATION', 'Revisa los campos marcados.', { status: 'Usa requested, accepted, rejected o cancelled.' });
  }
  const filas = await repo.listarPorViaje(pool, viajeId, status ? estados[status] : null);
  return filas.map(mapper.toReservaDTO);
}

/** RF-16 · PATCH /api/reservas/:id { action }: aceptar descuenta un asiento (trigger). */
async function responder(reservaId, conductorId, body) {
  const nuevoEstado = mapper.parseRespuesta(body);
  if (!esUuid(reservaId)) throw reservaNoEncontrada();
  let esperasCanceladas = [];
  const fila = await withTransaction(async (db) => {
    if (nuevoEstado === 'aceptada') {
      // RN-05: si el pasajero ya confirmó otro viaje a la misma hora (p. ej. mientras estaba en espera), no se acepta.
      const previo = await repo.contexto(db, reservaId);
      if (previo && previo.conductor_id === conductorId && previo.estado === 'solicitada'
        && await repo.buscarAceptadaTraslapada(db, previo.pasajero_id, previo.viaje_id, previo.salida_en)) {
        throw new AppError(409, 'RESERVA_TRASLAPADA', 'Este pasajero ya tiene confirmado otro viaje a la misma hora.');
      }
    }
    const r = await repo.responder(db, reservaId, conductorId, nuevoEstado);
    if (r) {
      if (nuevoEstado === 'aceptada') {
        const ctxAceptada = await repo.contexto(db, reservaId);
        esperasCanceladas = await repo.cancelarPendientesTraslapadas(db, r.pasajero_id, r.viaje_id, ctxAceptada.salida_en);
      }
      return r;
    }
    const ctx = await repo.contexto(db, reservaId);
    if (!ctx || ctx.conductor_id !== conductorId) throw reservaNoEncontrada(); // RNF-09
    if (ctx.estado !== 'solicitada') {
      throw new AppError(409, 'RESERVA_YA_RESPONDIDA', 'Esta solicitud ya fue respondida o cancelada.');
    }
    throw new AppError(409, 'VIAJE_NO_DISPONIBLE', 'El viaje ya no admite pasajeros.');
  });
  // Aviso en la app al pasajero (después del COMMIT). RF-20 (Sprint 3) añadirá el correo.
  await notificaciones.alResponder(fila.id);
  for (const id of esperasCanceladas) await notificaciones.alCancelarReserva(id, 'solicitada');
  const completa = await repo.buscarConPasajero(pool, fila.id);
  const viaje = await repo.asientosDelViaje(pool, fila.viaje_id);
  // Lista de espera: el viaje se acaba de llenar → avisar a quienes siguen pendientes.
  if (fila.estado === 'aceptada' && viaje.asientos_disponibles === 0) await notificaciones.alViajeLleno(fila.viaje_id);
  return mapper.toReservaDTO({ ...completa, viaje_asientos_disponibles: viaje.asientos_disponibles, viaje_salida_en: viaje.salida_en });
}

/** RF-17 · POST /api/reservas/:id/cancelar: solo el pasajero dueño (si no, 404). */
async function cancelar(reservaId, pasajeroId) {
  if (!esUuid(reservaId)) throw reservaNoEncontrada();
  const fila = await withTransaction(async (db) => {
    const r = await repo.cancelarPropia(db, reservaId, pasajeroId);
    if (r) return r;
    const ctx = await repo.contexto(db, reservaId);
    if (!ctx || ctx.pasajero_id !== pasajeroId) throw reservaNoEncontrada(); // RNF-09
    if (!['solicitada', 'aceptada'].includes(ctx.estado)) {
      throw new AppError(409, 'RESERVA_NO_CANCELABLE', 'Esta reserva ya no está vigente.');
    }
    throw new AppError(409, 'VIAJE_YA_SALIO', 'El viaje ya salió o terminó; ya no puedes cancelar tu lugar.');
  });
  // Aviso en la app al conductor (después del COMMIT). RF-20 (Sprint 3) añadirá el correo.
  await notificaciones.alCancelarReserva(fila.id, fila.estado_anterior);
  const viaje = await repo.asientosDelViaje(pool, fila.viaje_id);
  // Lista de espera: estaba lleno y se liberó el lugar → avisar a quienes esperan.
  if (fila.estado_anterior === 'aceptada' && viaje.asientos_disponibles === 1) await notificaciones.alLugarLiberado(fila.viaje_id);
  return {
    ...mapper.toReservaDTO({ ...fila, viaje_asientos_disponibles: viaje.asientos_disponibles, viaje_salida_en: viaje.salida_en }),
    previousStatus: fila.estado_anterior === 'aceptada' ? 'accepted' : 'requested',
    message: fila.cancelacion_tardia
      ? `Cancelaste con menos de ${repo.MINUTOS_TARDIA} minutos de anticipación; quedará registrado como cancelación tardía.`
      : 'Cancelaste tu lugar en el viaje.',
  };
}

/** Para viajes.service.cancelar: cancela las reservas vigentes dentro de SU transacción. */
const cancelarPorViaje = (db, viajeId) => repo.cancelarPorViaje(db, viajeId)
  .then((filas) => filas.map((f) => ({ reservaId: f.id, pasajeroId: f.pasajero_id, estadoAnterior: f.estado_anterior })));

module.exports = { solicitar, listarDeViaje, responder, cancelar, cancelarPorViaje };
