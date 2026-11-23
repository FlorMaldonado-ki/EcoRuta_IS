/**
 * EcoRuta Escolar · Contrato de la API del backend · Sprint 2
 * ---------------------------------------------------------------------------
 * Forma EXACTA de lo que devuelven y reciben los endpoints nuevos del backend
 * (vehículos, viajes, reservas, mis viajes). Guía completa: docs/API-SPRINT2.md.
 *
 * Las pantallas actuales usan los tipos de ./api.ts con datos locales
 * (services/tripStorage.ts). Al conectarlas a la API, usar estos tipos y adaptar:
 *   - estados de reserva en inglés: requested | accepted | rejected | cancelled
 *   - vehículo: licenseAndInsuranceDeclared (no declarationLicenseInsurance)
 *   - un solo punto de encuentro por viaje (notes); no hay meetingPoints
 *   - campusPoint: campus_1 | campus_2 | metalurgia (GET /api/catalogos → campusPoints)
 */
import type { UserType } from './registration';

export type ApiTripDirection = 'to_campus' | 'from_campus';
export type ApiTripStatus = 'published' | 'in_progress' | 'finished' | 'cancelled';
export type ApiReservationStatus = 'requested' | 'accepted' | 'rejected' | 'cancelled';
export interface ApiPlace { text: string; lat: number; lng: number }

/** Respuesta paginada (20 por página). */
export interface ApiPage<T> { items: T[]; page: number; pageSize: number; hasMore: boolean }

// ── Vehículos (RF-06) ────────────────────────────────────────────────────────
export interface ApiVehicleDTO {
  id: string;
  brand: string;
  model: string;
  color: string;
  plates: string;
  capacity: number;            // incluye al conductor (2–9)
  maxSeats: number;            // capacity − 1: lo máximo que puede ofrecer (RN-03)
  licenseAndInsuranceDeclared: boolean;
  active: boolean;
  createdAt: string;
}
/** POST /api/vehiculos (todos los campos) · PATCH /api/vehiculos/:id (cualquier subconjunto). */
export interface ApiVehicleRequest {
  brand: string;
  model: string;
  color: string;
  plates: string;              // la API la normaliza: "ptx-1234" → "PTX1234"
  capacity: number;
  licenseAndInsuranceDeclared: true;
}

// ── Viajes (RF-08, RF-11, RF-12) ─────────────────────────────────────────────
/** Punto de encuentro que el conductor marcó en el mapa. */
export interface ApiMeetingPoint {
  id: string;                  // 'p1', 'p2', …
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  order: number;
}
/** Dónde se une el pasajero: punto del conductor o propuesto en la ruta. */
export interface ApiJoinPoint {
  type: 'driver' | 'proposed';
  pointId: string | null;
  name: string;
  lat: number;
  lng: number;
  note: string | null;
}
/** Cuerpo de POST /api/viajes/:id/reservas. */
export type ApiJoinPointRequest =
  | { pointId: string }
  | { lat: number; lng: number; name?: string; note?: string };

export interface ApiMyReservation {
  id: string;
  status: ApiReservationStatus;
  createdAt: string;
  lateCancellation: boolean;
  meetingPoint?: ApiJoinPoint | null;
}
export interface ApiTripDTO {
  id: string;
  direction: ApiTripDirection;
  campusPoint: string;
  origin: ApiPlace;
  destination: ApiPlace;
  departureAt: string;
  seatsTotal: number;
  seatsAvailable: number;
  distanceKm: number;
  durationMin: number | null;
  distanceSource: 'osrm' | 'haversine';
  status: ApiTripStatus;
  notes: string | null;        // indicaciones del conductor
  meetingPoints: ApiMeetingPoint[];
  createdAt: string;
  finishedAt?: string;
  cancelledAt?: string;
  distanceFromYouKm?: number;  // búsqueda con lat/lng
  driver?: {
    id: string;
    fullName: string;
    affiliation: string;
    ratingAverage?: number | null;
    phone?: string | null;     // solo conductor o reserva aceptada (RNF-12)
  };
  vehicle?: { brand: string; model: string; color: string; plates?: string };  // plates: igual que phone
  myReservation?: ApiMyReservation | null;
  isMine?: boolean;            // soy el conductor
  pendingRequests?: number;    // solo para el conductor
  acceptedPassengers?: number; // solo para el conductor
  impact?: ApiTripImpact | null; // RF-21 · solo viajes finalizados con pasajeros (null si no hubo)
}

/** CO₂ ahorrado por un viaje finalizado (RF-21). */
export interface ApiTripImpact {
  co2Kg: number;           // total del viaje: distancia × FE × pasajeros
  passengers: number;
  distanceKm: number;
  emissionFactor: number;  // kg CO₂/km con el que se calculó (RF-22)
  passengerCo2Kg: number;  // lo que se atribuye a cada pasajero (distancia × FE)
}

/** PATCH /api/viajes/:id (RF-13): solo los campos que cambian. */
export type ApiUpdateTripRequest = Partial<ApiCreateTripRequest>;

/** POST /api/viajes/:id/finalizar (RF-19) */
export interface ApiFinishTripResponse {
  trip: ApiTripDTO;
  impact: Omit<ApiTripImpact, 'passengerCo2Kg'> | null;
}

/** POST /api/viajes. El extremo del campus lo pone la API con campusPoint. */
export interface ApiCreateTripRequest {
  vehicleId: string;
  direction: ApiTripDirection;
  campusPoint: string;
  origin?: ApiPlace;           // obligatorio si direction = 'to_campus'
  destination?: ApiPlace;      // obligatorio si direction = 'from_campus'
  departureAt: string;         // ISO-8601, ≥ 30 min en el futuro (RN-04)
  seats: number;               // 1 … vehicle.maxSeats
  notes?: string | null;       // ≤ 300
  meetingPoints?: { name: string; description?: string | null; lat: number; lng: number }[]; // ≤ 8
}

/** GET /api/viajes (RF-11). date y horas en hora local de Morelia. */
export interface ApiTripSearchQuery {
  direction: ApiTripDirection;
  date?: string;               // AAAA-MM-DD (por defecto hoy)
  timeFrom?: string;           // HH:MM
  timeTo?: string;             // HH:MM
  lat?: number;
  lng?: number;
  radiusKm?: number;           // 0.5–15 (por defecto 5)
  page?: number;
}

/** POST /api/viajes/:id/cancelar */
export interface ApiCancelTripResponse { trip: ApiTripDTO; cancelledReservations: number }

/** GET /api/me/viajes (RF-18). */
export type ApiMyTripsRole = 'driver' | 'passenger';
export type ApiMyTripsStatus = 'upcoming' | 'in_progress' | 'history';
export interface ApiMyTripsPage extends ApiPage<ApiTripDTO> { role: ApiMyTripsRole; status: ApiMyTripsStatus }

// ── Reservas (RF-15 a RF-17) ─────────────────────────────────────────────────
/** Datos mínimos de otro usuario (RNF-12). */
export interface ApiPublicUserDTO {
  id: string;
  fullName: string;
  userType: UserType;
  affiliation: string | null;
  phone?: string | null;       // solo con reserva aceptada
}
export interface ApiReservationDTO {
  id: string;
  tripId: string;
  status: ApiReservationStatus;
  createdAt: string;
  respondedAt: string | null;
  cancelledAt: string | null;
  lateCancellation: boolean;
  meetingPoint?: ApiJoinPoint | null;
  passenger?: ApiPublicUserDTO;                                        // GET /api/viajes/:id/reservas
  trip?: { id: string; seatsAvailable: number; departureAt: string };  // al aceptar o cancelar
}
/** PATCH /api/reservas/:id */
export interface ApiRespondReservationRequest { action: 'accept' | 'reject' }
/** POST /api/reservas/:id/cancelar */
export interface ApiCancelReservationResponse extends ApiReservationDTO {
  previousStatus: 'requested' | 'accepted';
  message: string;
}
