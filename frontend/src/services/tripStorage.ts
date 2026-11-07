/**
 * EcoRuta Escolar · Almacenamiento y Gestor de Estado para el Sprint 2
 * Gestiona viajes, rutas de conductor, puntos de encuentro, reservaciones,
 * notificaciones con purga estricta de 72 horas y despacho de eventos de correo.
 */
import type {
  TripDTO,
  DriverRoute,
  MeetingPoint,
  VehicleDTO,
  ReservationDTO,
  NotificationItem,
  EmailNotificationEvent,
  SearchTripsParams,
} from '../types/api';
import { CAMPUS_REFERENCE_POINTS } from '../constants/options';

const RETENTION_HOURS_MS = 72 * 60 * 60 * 1000; // 72 horas (3 días)

// Helper para crear fechas relativas
const now = new Date();
const addHours = (h: number) => new Date(now.getTime() + h * 3600_000).toISOString();
const subHours = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();

/** Puntos de campus por defecto */
const C1 = CAMPUS_REFERENCE_POINTS[0]; // Campus 1
const C2 = CAMPUS_REFERENCE_POINTS[1]; // Campus 2
const METAL = CAMPUS_REFERENCE_POINTS[2]; // Metalurgia

/** Datos semilla iniciales del Sprint 2 alineados al TecNM Morelia */
let initialTrips: TripDTO[] = [
  {
    id: 'trip-demo-1',
    direction: 'to_campus',
    campusPoint: 'campus_1',
    origin: { text: 'Plaza Las Américas (Camelinas)', lat: 19.7039, lng: -101.1924 },
    destination: { text: C1.name, lat: C1.lat, lng: C1.lng },
    departureAt: addHours(2), // Dentro de 2 horas
    estimatedArrivalAt: addHours(2.35), // ~21 min después
    seatsTotal: 4,
    seatsAvailable: 3,
    distanceKm: 5.2,
    durationMin: 21,
    distanceSource: 'osrm',
    status: 'published',
    notes: 'Punto de encuentro frente al acceso de Liverpool en el estacionamiento exterior.',
    meetingPoints: [
      { id: 'mp-1', name: 'Plaza Las Américas - Acceso Liverpool', description: 'En la bahía de descenso', lat: 19.7039, lng: -101.1924, order: 1 },
      { id: 'mp-2', name: 'Crucero Salida a Charo', description: 'Frente a la farmacia Guadalajara', lat: 19.7120, lng: -101.1890, order: 2 },
    ],
    driver: {
      id: 'driver-ana',
      fullName: 'Ana Paola Gómez Morales',
      affiliation: 'Ingeniería en Sistemas Computacionales',
      photoUrl: null,
    },
    vehicle: {
      brand: 'Nissan',
      model: 'Versa 2022',
      color: 'Gris',
      plates: 'PTX-4821', // Solo visible con reserva aceptada
    },
    userReservationStatus: 'none',
  },
  {
    id: 'trip-demo-2',
    direction: 'to_campus',
    campusPoint: 'campus_2',
    origin: { text: 'Centro Histórico (Plaza de Armas)', lat: 19.7024, lng: -101.1922 },
    destination: { text: C2.name, lat: C2.lat, lng: C2.lng },
    departureAt: addHours(4),
    estimatedArrivalAt: addHours(4.45),
    seatsTotal: 3,
    seatsAvailable: 2,
    distanceKm: 7.8,
    durationMin: 27,
    distanceSource: 'osrm',
    status: 'published',
    notes: 'Punto de encuentro en esquina Madero y Abasolo.',
    meetingPoints: [
      { id: 'mp-3', name: 'Catedral / Plaza de Armas', description: 'Frente a portales', lat: 19.7024, lng: -101.1922, order: 1 },
      { id: 'mp-4', name: 'Monumento a Lázaro Cárdenas', description: 'Frente a tienda de conveniencia', lat: 19.7028, lng: -101.2065, order: 2 },
    ],
    driver: {
      id: 'driver-luis',
      fullName: 'Mtro. Luis Fernando Ortiz',
      affiliation: 'Departamento de Ciencias Básicas',
      photoUrl: null,
    },
    vehicle: {
      brand: 'Volkswagen',
      model: 'Jetta 2021',
      color: 'Blanco',
      plates: 'PRB-9912',
    },
    userReservationStatus: 'none',
  },
  {
    id: 'trip-demo-3',
    direction: 'to_campus',
    campusPoint: 'metalurgia',
    origin: { text: 'Altozano (Glorieta del Papa)', lat: 19.6720, lng: -101.1650 },
    destination: { text: METAL.name, lat: METAL.lat, lng: METAL.lng },
    departureAt: addHours(5.5),
    estimatedArrivalAt: addHours(6.05),
    seatsTotal: 4,
    seatsAvailable: 4,
    distanceKm: 9.1,
    durationMin: 33,
    distanceSource: 'osrm',
    status: 'published',
    notes: 'Punto de encuentro en gasolinera de Altozano.',
    meetingPoints: [
      { id: 'mp-5', name: 'Glorieta Juan Pablo II', description: 'Bahía de ascenso', lat: 19.6720, lng: -101.1650, order: 1 },
    ],
    driver: {
      id: 'driver-mario',
      fullName: 'Mario Alberto Tena',
      affiliation: 'Ingeniería en Materiales',
      photoUrl: null,
    },
    vehicle: {
      brand: 'Chevrolet',
      model: 'Aveo 2020',
      color: 'Rojo',
      plates: 'PTE-3341',
    },
    userReservationStatus: 'none',
  },
  {
    id: 'trip-demo-4',
    direction: 'from_campus',
    campusPoint: 'campus_1',
    origin: { text: C1.name, lat: C1.lat, lng: C1.lng },
    destination: { text: 'Estadio Morelos / Libramiento Norte', lat: 19.7275, lng: -101.2310 },
    departureAt: addHours(7),
    estimatedArrivalAt: addHours(7.3),
    seatsTotal: 3,
    seatsAvailable: 1,
    distanceKm: 6.4,
    durationMin: 18,
    distanceSource: 'osrm',
    status: 'published',
    notes: 'Salida desde la puerta principal del Tec (Av. Tecnológico).',
    meetingPoints: [
      { id: 'mp-6', name: 'Puerta Principal Av. Tecnológico', description: 'Bahía escolar', lat: C1.lat, lng: C1.lng, order: 1 },
    ],
    driver: {
      id: 'driver-ana',
      fullName: 'Ana Paola Gómez Morales',
      affiliation: 'Ingeniería en Sistemas Computacionales',
      photoUrl: null,
    },
    vehicle: {
      brand: 'Nissan',
      model: 'Versa 2022',
      color: 'Gris',
      plates: 'PTX-4821',
    },
    userReservationStatus: 'none',
  },
];

/** Memoria local de reservas */
let reservations: ReservationDTO[] = [];

/** Memoria de notificaciones con marca temporal */
let notifications: NotificationItem[] = [
  {
    id: 'notif-1',
    userId: 'current-user',
    type: 'solicitud_aceptada',
    title: '¡Solicitud aceptada!',
    message: 'Ana Paola aceptó tu solicitud para el viaje de Plaza Las Américas al Campus 1.',
    createdAt: subHours(1), // Hace 1 hora (válida dentro de las 72 h)
    read: false,
    relatedTripId: 'trip-demo-1',
  },
  {
    id: 'notif-2',
    userId: 'current-user',
    type: 'viaje_proximo',
    title: 'Viaje próximo',
    message: 'Tu viaje programado saldrá en menos de 2 horas. Revisa el punto de encuentro.',
    createdAt: subHours(3),
    read: true,
    relatedTripId: 'trip-demo-1',
  },
];

/** Eventos de correo electrónico despachados */
let emailEventsLog: EmailNotificationEvent[] = [];

/** Memoria de ruta del conductor actual */
let currentDriverRoute: DriverRoute | null = null;

/** Memoria de vehículo del conductor actual */
let currentDriverVehicle: VehicleDTO | null = null;

/** Memoria de foto del conductor */
let currentDriverPhotoUrl: string | null = null;

// ============================================================================
// FUNCIONES DE NOTIFICACIONES (Límite estricto de 72 horas)
// ============================================================================

export function purgeOldNotifications() {
  const cutoff = Date.now() - RETENTION_HOURS_MS;
  notifications = notifications.filter((n) => {
    const time = new Date(n.createdAt).getTime();
    return time >= cutoff;
  });
}

export function getNotifications(userId?: string): NotificationItem[] {
  purgeOldNotifications();
  return [...notifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function addNotification(
  item: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>
): NotificationItem {
  purgeOldNotifications();
  const newItem: NotificationItem = {
    ...item,
    id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
    read: false,
  };
  notifications.unshift(newItem);
  return newItem;
}

export function markNotificationAsRead(id: string) {
  notifications = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
}

export function markAllNotificationsAsRead() {
  notifications = notifications.map((n) => ({ ...n, read: true }));
}

export function getUnreadNotificationCount(): number {
  purgeOldNotifications();
  return notifications.filter((n) => !n.read).length;
}

// ============================================================================
// INTEGRACIÓN DE CORREOS ELECTRÓNICOS
// ============================================================================

export function dispatchEmailNotification(event: Omit<EmailNotificationEvent, 'id' | 'timestamp'>) {
  const entry: EmailNotificationEvent = {
    ...event,
    id: `email-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
  };
  emailEventsLog.unshift(entry);
  console.log(`📧 [EcoRuta Mailer Event] Despachado correo a ${entry.recipientEmail}: "${entry.subject}"`);
  return entry;
}

export function getEmailEventsLog(): EmailNotificationEvent[] {
  return [...emailEventsLog];
}

// ============================================================================
// GESTIÓN DE RUTA Y VEHÍCULO DEL CONDUCTOR
// ============================================================================

export function saveDriverVehicle(vehicle: VehicleDTO) {
  currentDriverVehicle = vehicle;
}

export function getDriverVehicle(): VehicleDTO | null {
  return currentDriverVehicle;
}

export function saveDriverPhoto(photoUrl: string) {
  currentDriverPhotoUrl = photoUrl;
}

export function getDriverPhoto(): string | null {
  return currentDriverPhotoUrl;
}

export function saveDriverRoute(route: DriverRoute) {
  currentDriverRoute = route;
}

export function getDriverRoute(): DriverRoute | null {
  return currentDriverRoute;
}

export function updateRouteMeetingPoints(points: MeetingPoint[]) {
  if (!currentDriverRoute) return null;
  currentDriverRoute = {
    ...currentDriverRoute,
    meetingPoints: points,
    isConfigured: points.length > 0,
    updatedAt: new Date().toISOString(),
  };
  return currentDriverRoute;
}

// ============================================================================
// MÓDULO PASAJERO: BÚSQUEDA Y CONSULTA DE VIAJES
// ============================================================================

function calculateHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function searchTrips(params: SearchTripsParams, currentUserId?: string): TripDTO[] {
  let list = [...initialTrips];

  // 1. Filtrar solo viajes publicados y con lugares disponibles
  list = list.filter((t) => t.status === 'published' && t.seatsAvailable > 0);

  // 2. Filtro de fecha
  if (params.date) {
    const filterDate = params.date; // YYYY-MM-DD
    list = list.filter((t) => t.departureAt.startsWith(filterDate));
  }

  // 3. Filtro de dirección
  if (params.direction) {
    list = list.filter((t) => t.direction === params.direction);
  }

  // 4. Filtro de punto de campus / destino
  if (params.campusPoint && params.campusPoint !== 'all') {
    list = list.filter((t) => t.campusPoint === params.campusPoint);
  }

  // 5. Filtro de horario de salida
  if (params.timeFrom || params.timeTo) {
    list = list.filter((t) => {
      const depDate = new Date(t.departureAt);
      const hours = depDate.getHours().toString().padStart(2, '0');
      const mins = depDate.getMinutes().toString().padStart(2, '0');
      const tripTime = `${hours}:${mins}`;

      if (params.timeFrom && tripTime < params.timeFrom) return false;
      if (params.timeTo && tripTime > params.timeTo) return false;
      return true;
    });
  }

  // 6. Filtro de asientos mínimos disponibles
  if (params.minSeats && params.minSeats > 1) {
    list = list.filter((t) => t.seatsAvailable >= params.minSeats!);
  }

  // 7. Filtro de proximidad y cálculo de distancia
  if (params.lat !== undefined && params.lng !== undefined) {
    list = list.map((t) => {
      // El punto que compara cercanía es el punto fuera del campus
      const targetPoint = t.direction === 'to_campus' ? t.origin : t.destination;
      const dist = calculateHaversineKm(params.lat!, params.lng!, targetPoint.lat, targetPoint.lng);
      return { ...t, distanceFromYouKm: dist };
    });

    if (params.radiusKm && params.radiusKm > 0) {
      list = list.filter((t) => (t.distanceFromYouKm ?? 999) <= params.radiusKm!);
    }
  }

  // Marcar estado de reserva del usuario actual
  if (currentUserId) {
    list = list.map((t) => {
      const res = reservations.find(
        (r) => r.tripId === t.id && r.passengerId === currentUserId && r.status !== 'cancelada'
      );
      return {
        ...t,
        userReservationStatus: res ? res.status : 'none',
        userReservationId: res ? res.id : null,
      };
    });
  }

  // Ordenar por horario de salida y proximidad
  list.sort((a, b) => {
    const timeA = new Date(a.departureAt).getTime();
    const timeB = new Date(b.departureAt).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return (a.distanceFromYouKm ?? 0) - (b.distanceFromYouKm ?? 0);
  });

  return list;
}

export function getTripById(id: string, currentUserId?: string): TripDTO | null {
  const trip = initialTrips.find((t) => t.id === id);
  if (!trip) return null;

  const res = reservations.find(
    (r) => r.tripId === id && r.passengerId === currentUserId && r.status !== 'cancelada'
  );

  return {
    ...trip,
    userReservationStatus: res ? res.status : 'none',
    userReservationId: res ? res.id : null,
  };
}

// ============================================================================
// VALIDACIONES Y SOLICITUD DE VIAJE (Módulo Pasajero)
// ============================================================================

export function requestSeat(
  tripId: string,
  user: { id: string; fullName: string; email: string; photoUrl?: string | null }
): { ok: boolean; message: string; reservation?: ReservationDTO } {
  const trip = initialTrips.find((t) => t.id === tripId);
  if (!trip) return { ok: false, message: 'El viaje no existe.' };

  // 1. No permitir solicitar un viaje propio
  if (trip.driver.id === user.id) {
    return { ok: false, message: 'No puedes solicitar un lugar en tu propio viaje.' };
  }

  // 2. No permitir solicitar viajes llenos
  if (trip.seatsAvailable <= 0) {
    return { ok: false, message: 'Este viaje ya no cuenta con lugares disponibles.' };
  }

  // 3. No permitir solicitar viajes vencidos
  if (new Date(trip.departureAt).getTime() <= Date.now()) {
    return { ok: false, message: 'La hora de salida de este viaje ya pasó.' };
  }

  // 4. No permitir solicitudes duplicadas
  const existing = reservations.find(
    (r) => r.tripId === tripId && r.passengerId === user.id && r.status !== 'cancelada'
  );
  if (existing) {
    return { ok: false, message: 'Ya tienes una solicitud activa para este viaje.' };
  }

  // 5. No permitir viajes que se traslapen en horario
  const tripStart = new Date(trip.departureAt).getTime();
  const tripDurationMs = (trip.durationMin || 30) * 60_000;
  const tripEnd = tripStart + tripDurationMs;

  const userActiveReservations = reservations.filter(
    (r) => r.passengerId === user.id && (r.status === 'solicitada' || r.status === 'aceptada')
  );

  for (const r of userActiveReservations) {
    const otherTrip = initialTrips.find((t) => t.id === r.tripId);
    if (otherTrip) {
      const otherStart = new Date(otherTrip.departureAt).getTime();
      const otherEnd = otherStart + (otherTrip.durationMin || 30) * 60_000;
      // Comprobar traslape de intervalos: max(startA, startB) < min(endA, endB)
      if (Math.max(tripStart, otherStart) < Math.min(tripEnd, otherEnd)) {
        return {
          ok: false,
          message: `Conflicto de horario: Ya tienes un viaje reservado o solicitado hacia ${otherTrip.destination.text} que coincide en el mismo horario.`,
        };
      }
    }
  }

  // Crear la reservación en estado 'solicitada'
  const newReservation: ReservationDTO = {
    id: `res-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    tripId,
    passengerId: user.id,
    passengerName: user.fullName,
    passengerPhoto: user.photoUrl,
    status: 'solicitada',
    createdAt: new Date().toISOString(),
    trip,
  };

  reservations.push(newReservation);

  // Notificación In-App al conductor
  addNotification({
    userId: trip.driver.id,
    type: 'solicitud_recibida',
    title: 'Nueva solicitud de lugar',
    message: `${user.fullName} ha solicitado unirse a tu viaje a ${trip.destination.text}.`,
    relatedTripId: trip.id,
    relatedReservationId: newReservation.id,
  });

  // Notificación por correo al conductor
  dispatchEmailNotification({
    recipientEmail: 'conductor@morelia.tecnm.mx', // Correo del conductor
    recipientName: trip.driver.fullName,
    subject: 'Nueva solicitud de viaje en EcoRuta Escolar',
    summary: `${user.fullName} solicitó un lugar para el viaje hacia ${trip.destination.text}.`,
    event: 'solicitud_recibida',
    tripOrigin: trip.origin.text,
    tripDestination: trip.destination.text,
    departureTime: new Date(trip.departureAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
  });

  return {
    ok: true,
    message: '¡Solicitud enviada con éxito! Permanecerá pendiente hasta que el conductor la acepte o rechace.',
    reservation: newReservation,
  };
}

export function cancelReservation(
  reservationId: string,
  userId: string
): { ok: boolean; message: string; lateCancellation?: boolean } {
  const res = reservations.find((r) => r.id === reservationId);
  if (!res) return { ok: false, message: 'La reservación no fue encontrada.' };

  const trip = initialTrips.find((t) => t.id === res.tripId);
  if (!trip) return { ok: false, message: 'El viaje asociado no existe.' };

  const depMs = new Date(trip.departureAt).getTime();
  const minutesToDeparture = (depMs - Date.now()) / 60_000;
  const wasAccepted = res.status === 'aceptada';
  const isLate = wasAccepted && minutesToDeparture < 20;

  // Si estaba aceptada, liberar asiento
  if (wasAccepted) {
    trip.seatsAvailable = Math.min(trip.seatsTotal, trip.seatsAvailable + 1);
  }

  res.status = 'cancelada';
  res.cancelledAt = new Date().toISOString();
  res.lateCancellation = isLate;

  // Notificar al conductor
  addNotification({
    userId: trip.driver.id,
    type: wasAccepted ? 'lugar_cancelado' : 'solicitud_cancelada',
    title: 'Solicitud cancelada',
    message: `${res.passengerName} canceló su lugar en el viaje hacia ${trip.destination.text}${
      isLate ? ' (aviso tardío: menos de 20 min)' : ''
    }.`,
    relatedTripId: trip.id,
  });

  dispatchEmailNotification({
    recipientEmail: 'conductor@morelia.tecnm.mx',
    recipientName: trip.driver.fullName,
    subject: 'Cancelación de plaza en tu viaje',
    summary: `${res.passengerName} canceló su solicitud para el viaje hacia ${trip.destination.text}.`,
    event: 'solicitud_cancelada',
    tripOrigin: trip.origin.text,
    tripDestination: trip.destination.text,
    departureTime: new Date(trip.departureAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
  });

  return {
    ok: true,
    message: isLate
      ? 'Solicitud cancelada. Al faltar menos de 20 minutos para la salida, se registró como cancelación tardía.'
      : 'Tu solicitud fue cancelada exitosamente.',
    lateCancellation: isLate,
  };
}

// ============================================================================
// GESTIÓN DEL CONDUCTOR: SOLICITUDES, PUBLICAR Y FINALIZAR
// ============================================================================

export function acceptReservationRequest(reservationId: string): { ok: boolean; message: string } {
  const res = reservations.find((r) => r.id === reservationId);
  if (!res) return { ok: false, message: 'Solicitud no encontrada.' };

  const trip = initialTrips.find((t) => t.id === res.tripId);
  if (!trip) return { ok: false, message: 'Viaje no encontrado.' };

  if (trip.seatsAvailable <= 0) {
    return { ok: false, message: 'No quedan lugares disponibles para aceptar más pasajeros.' };
  }

  res.status = 'aceptada';
  res.respondedAt = new Date().toISOString();
  trip.seatsAvailable = Math.max(0, trip.seatsAvailable - 1);

  // Notificación al pasajero
  addNotification({
    userId: res.passengerId,
    type: 'solicitud_aceptada',
    title: '¡Lugar confirmado!',
    message: `${trip.driver.fullName} ha aceptado tu solicitud de viaje. ¡Ya tienes asiento asegurado!`,
    relatedTripId: trip.id,
  });

  dispatchEmailNotification({
    recipientEmail: 'pasajero@morelia.tecnm.mx',
    recipientName: res.passengerName,
    subject: '¡Tu lugar fue confirmado en EcoRuta Escolar!',
    summary: `Tu solicitud para el viaje a ${trip.destination.text} fue aceptada por ${trip.driver.fullName}.`,
    event: 'solicitud_aceptada',
    tripOrigin: trip.origin.text,
    tripDestination: trip.destination.text,
    departureTime: new Date(trip.departureAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
  });

  return { ok: true, message: 'Solicitud aceptada y lugar asignado.' };
}

export function rejectReservationRequest(reservationId: string): { ok: boolean; message: string } {
  const res = reservations.find((r) => r.id === reservationId);
  if (!res) return { ok: false, message: 'Solicitud no encontrada.' };

  const trip = initialTrips.find((t) => t.id === res.tripId);
  res.status = 'rechazada';
  res.respondedAt = new Date().toISOString();

  // Notificación al pasajero
  addNotification({
    userId: res.passengerId,
    type: 'solicitud_rechazada',
    title: 'Solicitud rechazada',
    message: `El conductor no pudo aceptar tu solicitud para el viaje a ${trip?.destination.text || 'destino'}.`,
    relatedTripId: trip?.id,
  });

  dispatchEmailNotification({
    recipientEmail: 'pasajero@morelia.tecnm.mx',
    recipientName: res.passengerName,
    subject: 'Actualización sobre tu solicitud de viaje',
    summary: `El conductor no pudo aceptar tu solicitud para el viaje hacia ${trip?.destination.text || 'destino'}.`,
    event: 'solicitud_rechazada',
    tripOrigin: trip?.origin.text || '',
    tripDestination: trip?.destination.text || '',
    departureTime: trip ? new Date(trip.departureAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '',
  });

  return { ok: true, message: 'Solicitud rechazada.' };
}

export function publishTrip(
  tripData: Omit<TripDTO, 'id' | 'seatsAvailable' | 'status' | 'userReservationStatus'>
): { ok: boolean; message: string; trip?: TripDTO } {
  const depTime = new Date(tripData.departureAt).getTime();
  const minNoticeMs = 30 * 60_000; // 30 minutos

  if (depTime <= Date.now()) {
    return { ok: false, message: 'No puedes publicar un viaje en fecha u hora pasada.' };
  }
  if (depTime < Date.now() + minNoticeMs) {
    return { ok: false, message: 'Debes publicar el viaje con al menos 30 minutos de anticipación.' };
  }
  if (tripData.seatsTotal < 1) {
    return { ok: false, message: 'Debes ofrecer al menos 1 lugar disponible.' };
  }

  const newTrip: TripDTO = {
    ...tripData,
    id: `trip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    seatsAvailable: tripData.seatsTotal,
    status: 'published',
    userReservationStatus: 'none',
  };

  initialTrips.unshift(newTrip);

  return {
    ok: true,
    message: '¡Tu viaje ha sido publicado exitosamente! Ya está disponible para la comunidad.',
    trip: newTrip,
  };
}

export function finishTrip(tripId: string): { ok: boolean; message: string } {
  const trip = initialTrips.find((t) => t.id === tripId);
  if (!trip) return { ok: false, message: 'Viaje no encontrado.' };

  const depMs = new Date(trip.departureAt).getTime();
  if (depMs > Date.now()) {
    return { ok: false, message: 'No puedes finalizar un viaje antes de su hora de salida programada.' };
  }

  trip.status = 'finished';
  return { ok: true, message: 'El viaje ha sido marcado como completado.' };
}

export function cancelTripByDriver(tripId: string): { ok: boolean; message: string } {
  const trip = initialTrips.find((t) => t.id === tripId);
  if (!trip) return { ok: false, message: 'Viaje no encontrado.' };

  trip.status = 'cancelled';

  // Cancelar reservas activas y notificar
  const affected = reservations.filter((r) => r.tripId === tripId && r.status !== 'cancelada');
  affected.forEach((r) => {
    r.status = 'cancelada';
    addNotification({
      userId: r.passengerId,
      type: 'viaje_cancelado',
      title: 'Viaje cancelado por el conductor',
      message: `El conductor canceló el viaje hacia ${trip.destination.text} programado para las ${new Date(trip.departureAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}.`,
      relatedTripId: trip.id,
    });
    dispatchEmailNotification({
      recipientEmail: 'pasajero@morelia.tecnm.mx',
      recipientName: r.passengerName,
      subject: 'Aviso importante: Viaje cancelado',
      summary: `El conductor canceló el viaje hacia ${trip.destination.text}.`,
      event: 'viaje_cancelado',
      tripOrigin: trip.origin.text,
      tripDestination: trip.destination.text,
      departureTime: new Date(trip.departureAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
    });
  });

  return { ok: true, message: 'Viaje cancelado. Se ha notificado a todos los pasajeros inscritos.' };
}

export function getMyTrips(userId: string) {
  const asDriver = initialTrips.filter((t) => t.driver.id === userId);
  const myReservations = reservations.filter(
    (r) => r.passengerId === userId && r.status !== 'cancelada'
  );
  const asPassenger = myReservations
    .map((r) => {
      const trip = initialTrips.find((t) => t.id === r.tripId);
      return trip ? { trip, reservation: r } : null;
    })
    .filter(Boolean) as { trip: TripDTO; reservation: ReservationDTO }[];

  return { asDriver, asPassenger };
}

export function getDriverReservations(driverId: string): ReservationDTO[] {
  const driverTripIds = new Set(initialTrips.filter((t) => t.driver.id === driverId).map((t) => t.id));
  return reservations.filter((r) => driverTripIds.has(r.tripId));
}
