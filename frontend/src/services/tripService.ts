/**
 * EcoRuta Escolar · Viajes y reservas contra la API real (Sprint 2).
 * Guía de endpoints: docs/API-SPRINT2.md · tipos de la API: types/apiBackend.ts.
 *
 * Las pantallas usan los tipos de types/api.ts; aquí se adaptan las respuestas
 * de la API (estados en inglés, myReservation, etc.) a esa forma.
 */
import { apiRequest, ApiError } from './apiClient';
import type {
  ApiCancelReservationResponse,
  ApiCancelTripResponse,
  ApiCreateTripRequest,
  ApiFinishTripResponse,
  ApiMyTripsPage,
  ApiMyTripsRole,
  ApiMyTripsStatus,
  ApiPage,
  ApiReservationDTO,
  ApiReservationStatus,
  ApiJoinPointRequest,
  ApiTripDTO,
  ApiTripDirection,
  ApiUpdateTripRequest,
} from '../types/apiBackend';
import type { ReservationDTO, ReservationStatus, TripDTO, UserDTO } from '../types/api';

// ── Adaptadores API → tipos de las pantallas ────────────────────────────────

const RESERVATION_STATUS: Record<ApiReservationStatus, ReservationStatus> = {
  requested: 'solicitada',
  accepted: 'aceptada',
  rejected: 'rechazada',
  cancelled: 'cancelada',
};

type DriverFallback = TripDTO['driver'];

export function toTrip(t: ApiTripDTO, fallbackDriver?: DriverFallback): TripDTO {
  const depMs = new Date(t.departureAt).getTime();
  return {
    id: t.id,
    direction: t.direction,
    campusPoint: t.campusPoint,
    origin: t.origin,
    destination: t.destination,
    departureAt: t.departureAt,
    estimatedArrivalAt: t.durationMin ? new Date(depMs + t.durationMin * 60_000).toISOString() : null,
    seatsTotal: t.seatsTotal,
    seatsAvailable: t.seatsAvailable,
    distanceKm: t.distanceKm,
    durationMin: t.durationMin,
    distanceSource: t.distanceSource,
    status: t.status,
    notes: t.notes,
    meetingPoints: (t.meetingPoints ?? []).map((p) => ({
      id: p.id, name: p.name, description: p.description ?? undefined, lat: p.lat, lng: p.lng, order: p.order,
    })),
    distanceFromYouKm: t.distanceFromYouKm,
    driver: t.driver
      ? {
          id: t.driver.id,
          fullName: t.driver.fullName,
          affiliation: t.driver.affiliation,
          phone: t.driver.phone ?? null,
          photoUrl: null,
        }
      : fallbackDriver ?? { id: '', fullName: 'Conductor', affiliation: null, photoUrl: null },
    vehicle: t.vehicle
      ? { brand: t.vehicle.brand, model: t.vehicle.model, color: t.vehicle.color, plates: t.vehicle.plates ?? null }
      : { brand: '', model: '', color: '', plates: null },
    userReservationStatus: t.myReservation ? RESERVATION_STATUS[t.myReservation.status] : 'none',
    userReservationId: t.myReservation?.id ?? null,
    userJoinPoint: t.myReservation?.meetingPoint ?? null,
    isMine: t.isMine,
    pendingRequests: t.pendingRequests,
    acceptedPassengers: t.acceptedPassengers,
    finishedAt: t.finishedAt ?? null,
    impact: t.impact ?? null,
  };
}

const driverFromUser = (u: UserDTO): DriverFallback => ({
  id: u.id,
  fullName: u.fullName,
  affiliation: u.career ?? u.department ?? null,
  photoUrl: u.photoUrl ?? null,
});

/** Mensaje legible de cualquier error (ApiError o inesperado). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const fieldMsgs = err.fields ? Object.values(err.fields).filter(Boolean) : [];
    return fieldMsgs.length ? fieldMsgs.join(' ') : err.message;
  }
  console.warn('[api] error inesperado:', err);
  return 'Ocurrió un error inesperado. Intenta de nuevo.';
}

// ── Búsqueda (RF-11) ────────────────────────────────────────────────────────

/** Fecha local del dispositivo como AAAA-MM-DD (la API usa hora de Morelia). */
export function localYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface TripSearchFilters {
  direction?: ApiTripDirection;   // sin valor = ambos sentidos
  dates: string[];                // AAAA-MM-DD (una consulta por fecha)
  timeFrom?: string;
  timeTo?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  campusPoint?: string;           // filtro local
  minSeats?: number;              // filtro local
}

const MAX_PAGES = 5; // 5 × 20 viajes por fecha y sentido

async function fetchAllPages(params: URLSearchParams): Promise<ApiTripDTO[]> {
  const items: ApiTripDTO[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    params.set('page', String(page));
    const res = await apiRequest<ApiPage<ApiTripDTO>>(`/api/viajes?${params.toString()}`);
    items.push(...res.items);
    if (!res.hasMore) break;
  }
  return items;
}

export async function searchTrips(f: TripSearchFilters): Promise<TripDTO[]> {
  const directions: ApiTripDirection[] = f.direction ? [f.direction] : ['to_campus', 'from_campus'];
  const requests: Promise<ApiTripDTO[]>[] = [];

  for (const direction of directions) {
    for (const date of f.dates) {
      const params = new URLSearchParams({ direction, date });
      if (f.timeFrom) params.set('timeFrom', f.timeFrom);
      if (f.timeTo) params.set('timeTo', f.timeTo);
      if (f.lat !== undefined && f.lng !== undefined) {
        params.set('lat', String(f.lat));
        params.set('lng', String(f.lng));
        // Sin radio elegido se usa el máximo que acepta la API.
        params.set('radiusKm', String(f.radiusKm && f.radiusKm > 0 ? f.radiusKm : 15));
      }
      requests.push(fetchAllPages(params));
    }
  }

  const seen = new Set<string>();
  let list = (await Promise.all(requests))
    .flat()
    .filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
    .map((t) => toTrip(t));

  if (f.campusPoint) list = list.filter((t) => t.campusPoint === f.campusPoint);
  if (f.minSeats && f.minSeats > 1) list = list.filter((t) => t.seatsAvailable >= f.minSeats!);

  return list.sort((a, b) => {
    const diff = new Date(a.departureAt).getTime() - new Date(b.departureAt).getTime();
    return diff !== 0 ? diff : (a.distanceFromYouKm ?? 0) - (b.distanceFromYouKm ?? 0);
  });
}

// ── Detalle, publicar y cancelar (RF-08, RF-12, RF-13) ──────────────────────

export async function getTripById(id: string, currentUser?: UserDTO): Promise<TripDTO> {
  const t = await apiRequest<ApiTripDTO>(`/api/viajes/${id}`);
  return toTrip(t, currentUser && t.isMine ? driverFromUser(currentUser) : undefined);
}

export async function publishTrip(data: ApiCreateTripRequest, currentUser: UserDTO): Promise<TripDTO> {
  const t = await apiRequest<ApiTripDTO>('/api/viajes', { method: 'POST', body: data });
  return toTrip(t, driverFromUser(currentUser));
}

export async function cancelTripByDriver(tripId: string): Promise<{ message: string }> {
  const res = await apiRequest<ApiCancelTripResponse>(`/api/viajes/${tripId}/cancelar`, { method: 'POST' });
  const n = res.cancelledReservations;
  return {
    message: n > 0
      ? `Se cancelaron ${n} reservación(es) y cada pasajero recibió una notificación.`
      : 'El viaje ya no aparecerá en la búsqueda. No tenía pasajeros inscritos.',
  };
}

/** RF-13 · PATCH /api/viajes/:id con solo los campos que cambian (409 VIAJE_CON_RESERVAS si ya hay aceptados). */
export async function updateTrip(tripId: string, changes: ApiUpdateTripRequest, currentUser: UserDTO): Promise<TripDTO> {
  const t = await apiRequest<ApiTripDTO>(`/api/viajes/${tripId}`, { method: 'PATCH', body: changes });
  return toTrip(t, driverFromUser(currentUser));
}

export interface FinishTripResult {
  trip: TripDTO;
  /** null si el viaje no tuvo pasajeros aceptados (RN-07) */
  impact: ApiFinishTripResponse['impact'];
}

/** RF-19 · POST /api/viajes/:id/finalizar: el viaje pasa a finalizado y se registra el CO₂ (RF-21). */
export async function finishTrip(tripId: string, currentUser: UserDTO): Promise<FinishTripResult> {
  const res = await apiRequest<ApiFinishTripResponse>(`/api/viajes/${tripId}/finalizar`, { method: 'POST' });
  return { trip: toTrip(res.trip, driverFromUser(currentUser)), impact: res.impact };
}

/** ¿Ya se puede finalizar? Solo el conductor, viaje vigente y después de la hora de salida (RF-19). */
export const canFinishTrip = (trip: Pick<TripDTO, 'status' | 'departureAt'>, now = Date.now()) =>
  (trip.status === 'published' || trip.status === 'in_progress') && new Date(trip.departureAt).getTime() <= now;

/** ¿Se puede editar? Publicado, aún no sale y sin pasajeros aceptados (RF-13). */
export const canEditTrip = (trip: Pick<TripDTO, 'status' | 'departureAt' | 'acceptedPassengers'>, now = Date.now()) =>
  trip.status === 'published' && new Date(trip.departureAt).getTime() > now && (trip.acceptedPassengers ?? 0) === 0;

// ── Reservas (RF-15 a RF-17) ────────────────────────────────────────────────

/** Solicitar lugar indicando dónde se unirá (punto del conductor o propuesto). */
export async function requestSeat(tripId: string, meetingPoint?: ApiJoinPointRequest): Promise<ApiReservationDTO> {
  return apiRequest<ApiReservationDTO>(`/api/viajes/${tripId}/reservas`, {
    method: 'POST',
    body: meetingPoint ? { meetingPoint } : {},
  });
}

/** Solicitud pendiente en un viaje sin lugares = lista de espera. */
export const isWaitlisted = (status: ReservationStatus | undefined, trip: Pick<TripDTO, 'seatsAvailable' | 'status'>) =>
  (status === 'solicitada' || status === 'pendiente') && trip.status === 'published' && trip.seatsAvailable <= 0;

export async function cancelReservation(
  reservationId: string,
): Promise<{ message: string; lateCancellation: boolean }> {
  const res = await apiRequest<ApiCancelReservationResponse>(`/api/reservas/${reservationId}/cancelar`, {
    method: 'POST',
  });
  return { message: res.message, lateCancellation: res.lateCancellation };
}

export const acceptReservationRequest = (reservationId: string) =>
  apiRequest<ApiReservationDTO>(`/api/reservas/${reservationId}`, { method: 'PATCH', body: { action: 'accept' } });

export const rejectReservationRequest = (reservationId: string) =>
  apiRequest<ApiReservationDTO>(`/api/reservas/${reservationId}`, { method: 'PATCH', body: { action: 'reject' } });

// ── Mis viajes (RF-18) ──────────────────────────────────────────────────────

export type TripBucket = ApiMyTripsStatus; // 'upcoming' | 'in_progress' | 'history'

async function fetchMyTrips(role: ApiMyTripsRole, status: ApiMyTripsStatus): Promise<ApiTripDTO[]> {
  const items: ApiTripDTO[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await apiRequest<ApiMyTripsPage>(`/api/me/viajes?role=${role}&status=${status}&page=${page}`);
    items.push(...res.items);
    if (!res.hasMore) break;
  }
  return items;
}

const BUCKETS: TripBucket[] = ['upcoming', 'in_progress', 'history'];

export interface MyTrips {
  asDriver: { trip: TripDTO; bucket: TripBucket }[];
  asPassenger: { trip: TripDTO; reservation: ReservationDTO; bucket: TripBucket }[];
}

export async function getMyTrips(currentUser: UserDTO): Promise<MyTrips> {
  const me = driverFromUser(currentUser);
  const [driverLists, passengerLists] = await Promise.all([
    Promise.all(BUCKETS.map((b) => fetchMyTrips('driver', b))),
    Promise.all(BUCKETS.map((b) => fetchMyTrips('passenger', b))),
  ]);

  const asDriver = driverLists.flatMap((list, i) =>
    list.map((t) => ({ trip: toTrip(t, me), bucket: BUCKETS[i] })),
  );

  const asPassenger = passengerLists.flatMap((list, i) =>
    list
      .filter((t) => t.myReservation)
      .map((t) => {
        const trip = toTrip(t);
        const r = t.myReservation!;
        const reservation: ReservationDTO = {
          id: r.id,
          tripId: t.id,
          passengerId: currentUser.id,
          passengerName: currentUser.fullName,
          status: RESERVATION_STATUS[r.status],
          createdAt: r.createdAt,
          lateCancellation: r.lateCancellation,
          joinPoint: r.meetingPoint ?? null,
          trip,
        };
        return { trip, reservation, bucket: BUCKETS[i] };
      }),
  );

  return { asDriver, asPassenger };
}

/** Solicitudes recibidas en mis viajes vigentes (publicados o en curso). */
export async function getDriverReservations(currentUser: UserDTO): Promise<ReservationDTO[]> {
  const me = driverFromUser(currentUser);
  const trips = (await Promise.all([fetchMyTrips('driver', 'upcoming'), fetchMyTrips('driver', 'in_progress')]))
    .flat()
    .map((t) => toTrip(t, me));

  const perTrip = await Promise.all(
    trips.map(async (trip) => {
      const list = await apiRequest<ApiReservationDTO[]>(`/api/viajes/${trip.id}/reservas`);
      return list.map<ReservationDTO>((r) => ({
        id: r.id,
        tripId: r.tripId,
        passengerId: r.passenger?.id ?? '',
        passengerName: r.passenger?.fullName ?? 'Pasajero',
        passengerAffiliation: r.passenger?.affiliation ?? undefined,
        passengerPhone: r.passenger?.phone ?? null,
        status: RESERVATION_STATUS[r.status],
        createdAt: r.createdAt,
        respondedAt: r.respondedAt,
        cancelledAt: r.cancelledAt,
        lateCancellation: r.lateCancellation,
        joinPoint: r.meetingPoint ?? null,
        trip,
      }));
    }),
  );

  return perTrip.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
