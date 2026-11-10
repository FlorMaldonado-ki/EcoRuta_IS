'use strict';
/**
 * Mapper del módulo Reservas (RF-15 a RF-17).
 *   estado solicitada/aceptada/rechazada/cancelada → status requested/accepted/rejected/cancelled
 */
const { ValidationError } = require('../../shared/errors');
const { toUsuarioPublicoDTO } = require('../auth/usuario.mapper');
const { ESTADO_RESERVA_BD_A_CLIENTE } = require('../viajes/viaje.mapper');

const ACCIONES = Object.freeze({ accept: 'aceptada', reject: 'rechazada' });

/** PATCH /api/reservas/:id { action: 'accept' | 'reject' } → estado de BD. */
function parseRespuesta(body) {
  const estado = ACCIONES[body?.action];
  if (!estado) throw new ValidationError({ action: 'La acción debe ser accept o reject.' });
  return estado;
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

module.exports = { parseRespuesta, toReservaDTO, ACCIONES };
