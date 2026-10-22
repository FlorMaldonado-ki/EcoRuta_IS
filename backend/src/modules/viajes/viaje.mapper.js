'use strict';
/**
 * Mapper del módulo Viajes. La tabla es plana (origen_lat, origen_lng…); el
 * cliente recibe objetos anidados listos para el mapa: { text, lat, lng }.
 * Valores de dominio en inglés en la API para no mezclar idiomas en TS:
 *   sentido hacia_campus/desde_campus → direction 'to_campus' | 'from_campus'
 */
const DIRECCION_BD_A_CLIENTE = Object.freeze({ hacia_campus: 'to_campus', desde_campus: 'from_campus' });
const DIRECCION_CLIENTE_A_BD = Object.freeze({ to_campus: 'hacia_campus', from_campus: 'desde_campus' });
const ESTADO_BD_A_CLIENTE = Object.freeze({
  publicado: 'published', en_curso: 'in_progress', finalizado: 'finished', cancelado: 'cancelled',
});

const lugar = (texto, lat, lng) => ({ text: texto, lat, lng });

/**
 * @param {object} row  fila de viaje; opcionalmente con columnas del JOIN:
 *   conductor_* , vehiculo_* y distancia_usuario_km (de la búsqueda RF-11)
 */
function toViajeDTO(row) {
  return {
    id: row.id,
    direction: DIRECCION_BD_A_CLIENTE[row.sentido],
    campusPoint: row.punto_campus,
    origin: lugar(row.origen_texto, row.origen_lat, row.origen_lng),
    destination: lugar(row.destino_texto, row.destino_lat, row.destino_lng),
    departureAt: row.salida_en, // Date → "2026-10-21T13:00:00.000Z"
    seatsTotal: row.asientos_totales,
    seatsAvailable: row.asientos_disponibles,
    distanceKm: row.distancia_km, // number gracias al type parser de NUMERIC
    durationMin: row.duracion_min,
    distanceSource: row.distancia_fuente,
    status: ESTADO_BD_A_CLIENTE[row.estado],
    notes: row.notas,
    ...(row.distancia_usuario_km !== undefined && {
      distanceFromYouKm: Math.round(row.distancia_usuario_km * 10) / 10,
    }),
    ...(row.conductor_nombre !== undefined && {
      driver: { id: row.conductor_id, fullName: row.conductor_nombre, affiliation: row.conductor_adscripcion },
    }),
    ...(row.vehiculo_marca !== undefined && {
      vehicle: { brand: row.vehiculo_marca, model: row.vehiculo_modelo, color: row.vehiculo_color },
    }),
  };
}

/** POST /api/viajes → columnas de viaje (lo demás lo completa el service). */
function toViajeInsert(body) {
  return {
    vehiculo_id: body.vehicleId,
    sentido: DIRECCION_CLIENTE_A_BD[body.direction],
    punto_campus: body.campusPoint,
    origen_texto: body.origin?.text,
    origen_lat: Number(body.origin?.lat),
    origen_lng: Number(body.origin?.lng),
    destino_texto: body.destination?.text,
    destino_lat: Number(body.destination?.lat),
    destino_lng: Number(body.destination?.lng),
    salida_en: new Date(body.departureAt), // el cliente envía ISO-8601 con zona
    asientos_totales: body.seats,
    notas: body.notes ?? null,
  };
}

module.exports = { toViajeDTO, toViajeInsert, DIRECCION_CLIENTE_A_BD, DIRECCION_BD_A_CLIENTE };
