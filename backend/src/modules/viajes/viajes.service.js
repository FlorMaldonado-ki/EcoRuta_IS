'use strict';
/**
 * Lógica del módulo Viajes y rutas (RF-08, RF-10, RF-11, RF-12, RF-13 parcial, RF-18).
 * Orquesta: mapper (validación) → vehiculos/ruteo → repository (SQL).
 */
const { pool, withTransaction } = require('../../config/db');
const { AppError, ValidationError } = require('../../shared/errors');
const { pagina } = require('../../shared/validacion');
const ruteo = require('../../shared/ruteo');
const catalogos = require('../catalogos/catalogos.service');
const vehiculos = require('../vehiculos/vehiculos.service');
const reservas = require('../reservas/reservas.service');
const mapper = require('./viaje.mapper');
const repo = require('./viajes.repository');

const noEncontrado = () => new AppError(404, 'VIAJE_NO_ENCONTRADO', 'No encontramos ese viaje.');

/** Arma la respuesta de detalle aplicando las reglas de privacidad (RNF-12). */
function detalleDTO(fila, usuarioId) {
  const esConductor = fila.conductor_id === usuarioId;
  const conReservaAceptada = fila.mi_reserva_estado === 'aceptada';
  const dto = mapper.toViajeDTO(fila, { verContacto: esConductor || conReservaAceptada });
  dto.isMine = esConductor;
  if (!esConductor) {
    delete dto.pendingRequests;
    delete dto.acceptedPassengers;
  }
  return dto;
}

/**
 * RF-12 · GET /api/viajes/:id. Un viaje publicado lo ve cualquier usuario; uno
 * cancelado o finalizado solo su conductor o quien tuvo reserva en él.
 */
async function obtener(id, usuarioId) {
  const fila = await repo.buscarDetalle(pool, id, usuarioId);
  if (!fila) throw noEncontrado();
  const visible = fila.estado === 'publicado' || fila.conductor_id === usuarioId || fila.mi_reserva_id;
  if (!visible) throw noEncontrado();
  return detalleDTO(fila, usuarioId);
}

/** RF-08 · POST /api/viajes (RN-02 trigger, RN-03, RN-04, RN-11) con estimación RF-10. */
async function publicar(conductorId, body) {
  const { puntosCampus } = await catalogos.obtener();
  const datos = mapper.parseViaje(body, { puntosCampus });

  const vehiculo = await vehiculos.paraPublicar(conductorId, datos.vehiculo_id);
  if (datos.asientos_totales > vehiculo.capacidad - 1) { // RN-03 (también lo valida el trigger)
    const msg = `Tu vehículo permite ofrecer máximo ${vehiculo.capacidad - 1} asiento(s).`;
    throw new AppError(422, 'ASIENTOS_EXCEDEN_CAPACIDAD', msg, { seats: msg });
  }

  const estimacion = await ruteo.estimar(
    { lat: datos.origen_lat, lng: datos.origen_lng },
    { lat: datos.destino_lat, lng: datos.destino_lng },
  );
  const id = await repo.insertar(pool, conductorId, {
    ...datos,
    distancia_km: estimacion.distanciaKm,
    duracion_min: estimacion.duracionMin,
    distancia_fuente: estimacion.fuente,
  });
  return obtener(id, conductorId);
}

/** RF-11 · GET /api/viajes: publicados, futuros, con asientos, por hora y cercanía. */
async function buscar(query, usuarioId) {
  const filtros = mapper.parseBusqueda(query);
  const filas = await repo.buscar(pool, filtros, usuarioId);
  const hasMore = filas.length > filtros.limite;
  return {
    items: filas.slice(0, filtros.limite).map((f) => mapper.toViajeDTO(f)),
    page: filtros.pagina,
    pageSize: filtros.limite,
    hasMore,
  };
}

/**
 * RF-13 parcial (HU-19) · POST /api/viajes/:id/cancelar. En una transacción:
 * viaje → cancelado y sus reservas vigentes → cancelada (el trigger libera asientos).
 * @returns {{ trip: object, cancelledReservations: number, afectados: {reservaId,pasajeroId,estadoAnterior}[] }}
 */
async function cancelar(id, conductorId) {
  const afectados = await withTransaction(async (db) => {
    const viaje = await repo.bloquear(db, id);
    if (!viaje) throw noEncontrado();
    if (viaje.conductor_id !== conductorId) throw new AppError(403, 'NO_ES_TU_VIAJE', 'Solo el conductor puede cancelar este viaje.');
    if (viaje.estado === 'finalizado') throw new AppError(409, 'VIAJE_FINALIZADO', 'El viaje ya finalizó; no se puede cancelar.');
    if (viaje.estado === 'cancelado') throw new AppError(409, 'VIAJE_YA_CANCELADO', 'Este viaje ya estaba cancelado.');
    if (viaje.estado !== 'publicado') throw new AppError(409, 'VIAJE_EN_CURSO', 'El viaje ya está en curso; no se puede cancelar.');
    const lista = await reservas.cancelarPorViaje(db, id);
    await repo.marcarCancelado(db, id);
    return lista;
  });
  // Los correos a los pasajeros (RF-20) se enviarán aquí, después del COMMIT (Sprint 3).
  return { trip: await obtener(id, conductorId), cancelledReservations: afectados.length, afectados };
}

/** RF-18 · GET /api/me/viajes?role=driver|passenger&status=upcoming|in_progress|history&page */
async function misViajes(usuarioId, query) {
  const role = query.role ?? 'driver';
  const status = query.status ?? 'upcoming';
  const errors = {};
  if (!['driver', 'passenger'].includes(role)) errors.role = 'Usa driver o passenger.';
  if (!['upcoming', 'in_progress', 'history'].includes(status)) errors.status = 'Usa upcoming, in_progress o history.';
  const page = pagina(query.page);
  if (page === null) errors.page = 'Página no válida.';
  if (Object.keys(errors).length) throw new ValidationError(errors);

  const opciones = { limite: mapper.TAM_PAGINA, pagina: page };
  const filas = role === 'driver'
    ? await repo.listarComoConductor(pool, usuarioId, status, opciones)
    : await repo.listarComoPasajero(pool, usuarioId, status, opciones);
  const hasMore = filas.length > opciones.limite;
  const items = filas.slice(0, opciones.limite).map((f) => (role === 'driver'
    ? { ...mapper.toViajeDTO(f, { verContacto: true }), isMine: true }
    : mapper.toViajeDTO(f, { verContacto: f.mi_reserva_estado === 'aceptada' })));
  return { items, page, pageSize: opciones.limite, hasMore, role, status };
}

module.exports = { obtener, publicar, buscar, cancelar, misViajes };
