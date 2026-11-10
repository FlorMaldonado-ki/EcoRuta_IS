'use strict';
/**
 * Mapper del módulo Viajes. La tabla es plana (origen_lat, origen_lng…); el
 * cliente recibe objetos anidados listos para el mapa: { text, lat, lng }.
 * Valores de dominio en inglés en la API para no mezclar idiomas en TS:
 *   sentido hacia_campus/desde_campus → direction 'to_campus' | 'from_campus'
 */
const { ValidationError } = require('../../shared/errors');
const { str, esUuid, entero, numero, pagina, dentroDeZona } = require('../../shared/validacion');

const DIRECCION_BD_A_CLIENTE = Object.freeze({ hacia_campus: 'to_campus', desde_campus: 'from_campus' });
const DIRECCION_CLIENTE_A_BD = Object.freeze({ to_campus: 'hacia_campus', from_campus: 'desde_campus' });
const ESTADO_BD_A_CLIENTE = Object.freeze({
  publicado: 'published', en_curso: 'in_progress', finalizado: 'finished', cancelado: 'cancelled',
});
const ESTADO_RESERVA_BD_A_CLIENTE = Object.freeze({
  solicitada: 'requested', aceptada: 'accepted', rechazada: 'rejected', cancelada: 'cancelled',
});

const ANTICIPACION_MIN = 30;  // RN-04: publicar con al menos 30 min de anticipación
const HORIZONTE_DIAS = 60;    // evita fechas mal capturadas (p. ej. año equivocado)
const TAM_PAGINA = 20;

const lugar = (texto, lat, lng) => ({ text: texto, lat, lng });

/**
 * @param {object} row  fila de viaje; opcionalmente con columnas del JOIN:
 *   conductor_*, vehiculo_*, distancia_usuario_km (búsqueda RF-11),
 *   mi_reserva_* y solicitudes_pendientes / pasajeros_aceptados
 * @param {{ verContacto?: boolean }} [opciones]  true si quien consulta es el
 *   conductor o tiene una reserva aceptada: se incluyen teléfono y placas (RNF-12)
 */
function toViajeDTO(row, { verContacto = false } = {}) {
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
    createdAt: row.creado_en,
    ...(row.finalizado_en && { finishedAt: row.finalizado_en }),
    ...(row.cancelado_en && { cancelledAt: row.cancelado_en }),
    ...(row.distancia_usuario_km !== undefined && row.distancia_usuario_km !== null && {
      distanceFromYouKm: Math.round(row.distancia_usuario_km * 10) / 10,
    }),
    ...(row.conductor_nombre !== undefined && {
      driver: {
        id: row.conductor_id,
        fullName: row.conductor_nombre,
        affiliation: row.conductor_adscripcion,
        ...(row.conductor_calificacion !== undefined && { ratingAverage: row.conductor_calificacion }),
        ...(verContacto && { phone: row.conductor_telefono ?? null }),
      },
    }),
    ...(row.vehiculo_marca !== undefined && {
      vehicle: {
        brand: row.vehiculo_marca,
        model: row.vehiculo_modelo,
        color: row.vehiculo_color,
        ...(verContacto && { plates: row.vehiculo_placas }),
      },
    }),
    ...(row.mi_reserva_id !== undefined && {
      myReservation: row.mi_reserva_id
        ? {
          id: row.mi_reserva_id,
          status: ESTADO_RESERVA_BD_A_CLIENTE[row.mi_reserva_estado],
          createdAt: row.mi_reserva_creada_en,
          lateCancellation: row.mi_reserva_tardia,
        }
        : null,
    }),
    ...(row.solicitudes_pendientes !== undefined && { pendingRequests: row.solicitudes_pendientes }),
    ...(row.pasajeros_aceptados !== undefined && { acceptedPassengers: row.pasajeros_aceptados }),
  };
}

function validarLugar(valor, campo, errors) {
  const texto = str(valor?.text).replace(/\s+/g, ' ');
  const lat = numero(valor?.lat);
  const lng = numero(valor?.lng);
  if (!texto) errors[campo] = 'Escribe o elige el lugar.';
  else if (texto.length > 160) errors[campo] = 'Máximo 160 caracteres.';
  else if (!dentroDeZona(lat, lng)) errors[campo] = 'El lugar debe estar en Morelia o sus alrededores.';
  return { texto, lat, lng };
}

/**
 * POST /api/viajes (CreateTripRequest) → columnas de viaje.
 * El extremo del campus se toma de parametro.puntos_campus (RN-11): no se
 * confía en las coordenadas que mande el cliente para ese extremo.
 *
 * @param {object} body
 * @param {{ puntosCampus: {clave:string,nombre:string,lat:number,lng:number}[], ahora?: Date }} ctx
 * @param {{ parcial?: boolean, actual?: object }} [opciones]  parcial = edición (Sprint 3)
 */
function parseViaje(body, ctx, { parcial = false, actual = null } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError({}, 'Envía los datos del viaje.');
  const errors = {};
  const ahora = ctx.ahora || new Date();
  const presente = (k) => !parcial || body[k] !== undefined;
  const out = {};

  if (presente('vehicleId')) {
    if (!esUuid(body.vehicleId)) errors.vehicleId = 'Selecciona uno de tus vehículos.';
    else out.vehiculo_id = body.vehicleId;
  }

  const direccionCliente = body.direction ?? (actual && DIRECCION_BD_A_CLIENTE[actual.sentido]);
  const sentido = DIRECCION_CLIENTE_A_BD[direccionCliente];
  if (presente('direction') && !sentido) errors.direction = 'Indica si vas hacia el campus o sales del campus.';
  else if (sentido) out.sentido = sentido;

  const claveCampus = body.campusPoint ?? actual?.punto_campus;
  const punto = ctx.puntosCampus.find((p) => p.clave === claveCampus);
  if ((presente('campusPoint') || presente('direction')) && !punto) errors.campusPoint = 'Elige un punto del campus de la lista.';

  // El extremo FUERA del campus lo elige el conductor; el otro es el punto del campus.
  const campoLibre = sentido === 'desde_campus' ? 'destination' : 'origin';
  const tocaLugares = presente('direction') || presente('campusPoint') || body[campoLibre] !== undefined;
  if (sentido && punto && tocaLugares) {
    const libre = body[campoLibre] !== undefined || !actual
      ? validarLugar(body[campoLibre], campoLibre, errors)
      : sentido === 'desde_campus'
        ? { texto: actual.destino_texto, lat: actual.destino_lat, lng: actual.destino_lng }
        : { texto: actual.origen_texto, lat: actual.origen_lat, lng: actual.origen_lng };
    const campus = { texto: punto.nombre, lat: Number(punto.lat), lng: Number(punto.lng) };
    const [o, d] = sentido === 'desde_campus' ? [campus, libre] : [libre, campus];
    if (!errors[campoLibre] && o.lat === d.lat && o.lng === d.lng) errors[campoLibre] = 'El origen y el destino no pueden ser el mismo punto.';
    Object.assign(out, {
      punto_campus: punto.clave,
      origen_texto: o.texto, origen_lat: o.lat, origen_lng: o.lng,
      destino_texto: d.texto, destino_lat: d.lat, destino_lng: d.lng,
    });
  }

  if (presente('departureAt')) {
    const salida = typeof body.departureAt === 'string' ? new Date(body.departureAt) : null;
    if (!salida || Number.isNaN(salida.getTime())) errors.departureAt = 'Indica la fecha y hora de salida.';
    else if (salida.getTime() < ahora.getTime() + ANTICIPACION_MIN * 60_000) {
      errors.departureAt = `Publica el viaje con al menos ${ANTICIPACION_MIN} minutos de anticipación.`; // RN-04
    } else if (salida.getTime() > ahora.getTime() + HORIZONTE_DIAS * 86_400_000) {
      errors.departureAt = `Solo puedes publicar viajes de los próximos ${HORIZONTE_DIAS} días.`;
    } else out.salida_en = salida;
  }

  if (presente('seats')) {
    const asientos = entero(body.seats);
    if (asientos === null || asientos < 1 || asientos > 8) errors.seats = 'Ofrece de 1 a 8 asientos.';
    else out.asientos_totales = asientos;
  }

  if (body.notes !== undefined) {
    const notas = body.notes === null ? '' : str(body.notes);
    if (notas.length > 300) errors.notes = 'Máximo 300 caracteres.';
    else out.notas = notas || null;
  } else if (!parcial) out.notas = null;

  if (Object.keys(errors).length) throw new ValidationError(errors);
  if (parcial && Object.keys(out).length === 0) throw new ValidationError({}, 'No enviaste ningún cambio.');
  return out;
}

/** Compatibilidad con el contrato del Sprint 1 (sin validar). Preferir parseViaje. */
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
    salida_en: new Date(body.departureAt),
    asientos_totales: body.seats,
    notas: body.notes ?? null,
  };
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Fecha local de hoy en Morelia (YYYY-MM-DD). */
function hoyLocal(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(ahora);
}

/**
 * GET /api/viajes (RF-11): query params → filtros validados.
 *   direction  to_campus | from_campus   (obligatorio)
 *   date       YYYY-MM-DD hora local de Morelia (por defecto hoy)
 *   timeFrom   HH:MM (por defecto 00:00)    timeTo HH:MM (por defecto 23:59)
 *   lat, lng   punto del pasajero (opcionales, juntos)   radiusKm 0.5–15 (por defecto 5)
 *   page       1, 2, … (20 por página)
 */
function parseBusqueda(q, { ahora = new Date() } = {}) {
  const errors = {};
  const sentido = DIRECCION_CLIENTE_A_BD[q.direction];
  if (!sentido) errors.direction = 'Indica si vas hacia el campus o sales del campus.';

  const hoy = hoyLocal(ahora);
  const fecha = q.date === undefined || q.date === '' ? hoy : String(q.date);
  if (!FECHA_RE.test(fecha) || Number.isNaN(Date.parse(`${fecha}T00:00:00Z`))) errors.date = 'Fecha no válida (AAAA-MM-DD).';
  else if (fecha < hoy) errors.date = 'Busca a partir de hoy.';
  else if (Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`) > HORIZONTE_DIAS * 86_400_000) {
    errors.date = `Busca dentro de los próximos ${HORIZONTE_DIAS} días.`;
  }

  const desde = q.timeFrom === undefined || q.timeFrom === '' ? '00:00' : String(q.timeFrom);
  const hasta = q.timeTo === undefined || q.timeTo === '' ? '23:59' : String(q.timeTo);
  if (!HORA_RE.test(desde)) errors.timeFrom = 'Hora no válida (HH:MM).';
  if (!HORA_RE.test(hasta)) errors.timeTo = 'Hora no válida (HH:MM).';
  else if (HORA_RE.test(desde) && hasta < desde) errors.timeTo = 'La hora final debe ser posterior a la inicial.';

  const hayLat = q.lat !== undefined && q.lat !== '';
  const hayLng = q.lng !== undefined && q.lng !== '';
  let lat = null;
  let lng = null;
  if (hayLat || hayLng) {
    lat = numero(q.lat);
    lng = numero(q.lng);
    if (!dentroDeZona(lat, lng)) errors.location = 'Tu ubicación debe estar en Morelia o sus alrededores.';
  }

  const radio = q.radiusKm === undefined || q.radiusKm === '' ? 5 : numero(q.radiusKm);
  if (radio === null || radio < 0.5 || radio > 15) errors.radiusKm = 'El radio debe ser de 0.5 a 15 km.';

  const pag = pagina(q.page);
  if (pag === null) errors.page = 'Página no válida.';

  if (Object.keys(errors).length) throw new ValidationError(errors);
  return {
    sentido, fecha, horaDesde: `${desde}:00`, horaHasta: `${hasta}:59`,
    lat, lng, radioKm: radio, pagina: pag, limite: TAM_PAGINA,
  };
}

module.exports = {
  toViajeDTO, toViajeInsert, parseViaje, parseBusqueda, hoyLocal,
  DIRECCION_CLIENTE_A_BD, DIRECCION_BD_A_CLIENTE, ESTADO_BD_A_CLIENTE, ESTADO_RESERVA_BD_A_CLIENTE,
  ANTICIPACION_MIN, TAM_PAGINA,
};
