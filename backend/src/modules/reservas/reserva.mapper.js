'use strict';
/**
 * Mapper del módulo Reservas (RF-15 a RF-17).
 *   estado solicitada/aceptada/rechazada/cancelada → status requested/accepted/rejected/cancelled
 */
const { ValidationError } = require('../../shared/errors');
const { toUsuarioPublicoDTO } = require('../auth/usuario.mapper');
const { str, numero, dentroDeZona } = require('../../shared/validacion');
const { ESTADO_RESERVA_BD_A_CLIENTE, toPuntoUnionDTO } = require('../viajes/viaje.mapper');

const ACCIONES = Object.freeze({ accept: 'aceptada', reject: 'rechazada' });

/** PATCH /api/reservas/:id { action: 'accept' | 'reject' } → estado de BD. */
function parseRespuesta(body) {
  const estado = ACCIONES[body?.action];
  if (!estado) throw new ValidationError({ action: 'La acción debe ser accept o reject.' });
  return estado;
}

/**
 * POST /api/viajes/:id/reservas { meetingPoint } → reserva.punto_union.
 *   { pointId: 'p2' }                                → uno de los puntos del conductor
 *   { lat, lng, name?, note? }                       → punto propuesto por el pasajero en la ruta
 * Si el viaje tiene puntos de encuentro, elegir dónde unirse es obligatorio.
 * @param {object} body
 * @param {object[]} puntosViaje  viaje.puntos_encuentro
 * @returns {object|null}
 */
function parsePuntoUnion(body, puntosViaje = []) {
  const mp = body?.meetingPoint;
  if (mp === undefined || mp === null) {
    if (puntosViaje.length) throw new ValidationError({ meetingPoint: 'Elige dónde te unirás al viaje.' });
    return null;
  }
  if (typeof mp !== 'object' || Array.isArray(mp)) {
    throw new ValidationError({ meetingPoint: 'Indica un punto de encuentro válido.' });
  }
  if (mp.pointId !== undefined) {
    const p = puntosViaje.find((x) => x.id === mp.pointId);
    if (!p) throw new ValidationError({ meetingPoint: 'Ese punto de encuentro no pertenece al viaje.' });
    return { tipo: 'conductor', punto_id: p.id, nombre: p.nombre, lat: p.lat, lng: p.lng };
  }
  const lat = numero(mp.lat);
  const lng = numero(mp.lng);
  const nombre = str(mp.name).replace(/\s+/g, ' ') || 'Punto propuesto por el pasajero';
  const nota = str(mp.note).replace(/\s+/g, ' ');
  if (!dentroDeZona(lat, lng)) throw new ValidationError({ meetingPoint: 'El punto debe estar en Morelia o sus alrededores.' });
  if (nombre.length > 80) throw new ValidationError({ meetingPoint: 'El nombre del punto es muy largo (máximo 80).' });
  if (nota.length > 160) throw new ValidationError({ meetingPoint: 'La nota para el conductor es muy larga (máximo 160).' });
  return { tipo: 'propuesto', nombre, lat, lng, nota: nota || null };
}

/**
 * ReservationDTO. Si la fila trae columnas pasajero_* (lista del conductor),
 * agrega `passenger`; su teléfono solo con la reserva aceptada (RNF-12).
 */
function toReservaDTO(row) {
  return {
    id: row.id,
    tripId: row.viaje_id,
    status: ESTADO_RESERVA_BD_A_CLIENTE[row.estado],
    createdAt: row.creada_en,
    respondedAt: row.respondida_en,
    cancelledAt: row.cancelada_en,
    lateCancellation: row.cancelacion_tardia,
    ...(row.punto_union !== undefined && { meetingPoint: toPuntoUnionDTO(row.punto_union) }),
    ...(row.pasajero_nombre !== undefined && {
      passenger: toUsuarioPublicoDTO({
        id: row.pasajero_id,
        nombre_completo: row.pasajero_nombre,
        tipo: row.pasajero_tipo,
        carrera: row.pasajero_carrera,
        departamento: row.pasajero_departamento,
        telefono: row.pasajero_telefono,
      }, { incluirTelefono: row.estado === 'aceptada' }),
    }),
    ...(row.viaje_asientos_disponibles !== undefined && {
      trip: { id: row.viaje_id, seatsAvailable: row.viaje_asientos_disponibles, departureAt: row.viaje_salida_en },
    }),
  };
}

module.exports = { parseRespuesta, parsePuntoUnion, toReservaDTO, ACCIONES };
