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
const notificaciones = require('../notificaciones/notificaciones.service');
const correos = require('../notificaciones/correos.service');
const eco = require('../impacto/eco.service');
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
  // Avisos a cada pasajero afectado (después del COMMIT): en la app y por correo (RF-20).
  await notificaciones.alCancelarViaje(id, afectados);
  correos.alCancelarViaje(id, afectados);
  return { trip: await obtener(id, conductorId), cancelledReservations: afectados.length, afectados };
}

/**
 * RF-19 (HU-21) · POST /api/viajes/:id/finalizar. En una transacción:
 * viaje → finalizado (finalizado_en = now()) y, si hubo pasajeros aceptados,
 * registro del CO₂ ahorrado en impacto_viaje (RF-21). Sin pasajeros, el viaje
 * se finaliza sin registro de impacto (RN-07).
 * @returns {{ trip: object, impact: object|null }}
 */
async function finalizar(id, conductorId) {
  const impact = await withTransaction(async (db) => {
    const viaje = await repo.bloquear(db, id);
    if (!viaje || viaje.conductor_id !== conductorId) throw noEncontrado(); // RNF-09: ajeno = no existe
    if (viaje.estado === 'cancelado') throw new AppError(409, 'VIAJE_CANCELADO', 'El viaje está cancelado; no se puede finalizar.');
    if (viaje.estado === 'finalizado') throw new AppError(409, 'VIAJE_YA_FINALIZADO', 'Este viaje ya estaba finalizado.');
    if (new Date(viaje.salida_en).getTime() > Date.now()) {
      throw new AppError(409, 'VIAJE_AUN_NO_SALE', 'Podrás finalizar el viaje después de la hora de salida.');
    }
    await repo.marcarFinalizado(db, id);
    return eco.calcularImpacto(id, db);
  });
  return { trip: await obtener(id, conductorId), impact };
}

/**
 * RF-13 (HU-18) · PATCH /api/viajes/:id. Solo el conductor, solo si el viaje
 * sigue publicado, aún no sale y no tiene reservas aceptadas. Mismas reglas que
 * publicar (RN-03, RN-04, RN-11); si cambian origen o destino se recalcula la
 * distancia y la duración (RF-10).
 */
async function editar(id, conductorId, body) {
  const noEditable = (v) => {
    if (!v || v.conductor_id !== conductorId) throw noEncontrado(); // RNF-09
    if (v.estado !== 'publicado' || new Date(v.salida_en).getTime() <= Date.now()) {
      throw new AppError(409, 'VIAJE_NO_EDITABLE', 'Solo puedes editar viajes publicados que aún no salen.');
    }
  };
  const actual = await repo.buscarPorId(pool, id); // se valida y se estima fuera del bloqueo
  noEditable(actual);
  if (await repo.contarAceptadas(pool, id) > 0) throw conReservas();

  const { puntosCampus } = await catalogos.obtener();
  const cambios = mapper.parseViaje(body, { puntosCampus }, { parcial: true, actual });

  // RN-03: los asientos no pueden exceder la capacidad del vehículo (el nuevo o el actual).
  if (cambios.vehiculo_id !== undefined || cambios.asientos_totales !== undefined) {
    const vehiculo = await vehiculos.paraPublicar(conductorId, cambios.vehiculo_id ?? actual.vehiculo_id);
    const asientos = cambios.asientos_totales ?? actual.asientos_totales;
    if (asientos > vehiculo.capacidad - 1) {
      const msg = `Tu vehículo permite ofrecer máximo ${vehiculo.capacidad - 1} asiento(s).`;
      throw new AppError(422, 'ASIENTOS_EXCEDEN_CAPACIDAD', msg, { seats: msg });
    }
  }
  // Sin reservas aceptadas, todos los asientos vuelven a estar disponibles.
  if (cambios.asientos_totales !== undefined) cambios.asientos_disponibles = cambios.asientos_totales;

  // RF-10: nueva estimación solo si cambió algún extremo.
  const cambioRuta = ['origen_lat', 'origen_lng', 'destino_lat', 'destino_lng']
    .some((k) => cambios[k] !== undefined && Number(cambios[k]) !== Number(actual[k]));
  if (cambioRuta) {
    const e = await ruteo.estimar(
      { lat: cambios.origen_lat, lng: cambios.origen_lng },
      { lat: cambios.destino_lat, lng: cambios.destino_lng },
    );
    Object.assign(cambios, { distancia_km: e.distanciaKm, duracion_min: e.duracionMin, distancia_fuente: e.fuente });
  }

  await withTransaction(async (db) => {
    const v = await repo.bloquear(db, id); // re-verificar con el viaje bloqueado: pudo cambiar mientras estimábamos
    noEditable(v);
    if (await repo.contarAceptadas(db, id) > 0) throw conReservas();
    await repo.actualizar(db, id, cambios);
  });
  return obtener(id, conductorId);
}

const conReservas = () => new AppError(409, 'VIAJE_CON_RESERVAS',
  'Este viaje ya tiene pasajeros aceptados; no se puede editar. Si necesitas cambiarlo, cancélalo y publica uno nuevo.');

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

module.exports = { obtener, publicar, buscar, cancelar, finalizar, editar, misViajes };
