/**
 * Tipos que usan las pantallas. Los de la API están en apiBackend.ts.
 */
import type { UserType, AttachedFile } from './registration';

/** Rol de SEGURIDAD. No confundir con UserType (alumno/maestro). */
export type SecurityRole = 'user' | 'admin';
export type AccountStatus = 'pending' | 'active' | 'suspended';

export interface UserDTO {
  id: string;
  fullName: string;
  email: string;
  userType: UserType;
  career: string | null;      // solo alumno
  department: string | null;  // solo maestro
  phone: string | null;
  role: SecurityRole;
  status: AccountStatus;
  emailVerified: boolean;
  createdAt: string;
  controlNumber?: string;
  photoUrl?: string | null;   // Fotografía capturada con la cámara
  vehicle?: VehicleDTO | null;
  route?: DriverRoute | null;
}

export interface LoginRequest { email: string; password: string }
export interface LoginResponse { token: string; user: UserDTO }

/** Sesión activa en la app */
export interface Session { token: string; user: UserDTO }

export interface RegisterResponse { user: UserDTO; emailSent: boolean; message: string }
export interface MessageResponse { message: string }

export interface UpdateProfileRequest {
  fullName?: string;
  career?: string;
  department?: string;
  phone?: string | null;
  photoUrl?: string | null;
}

export interface CampusPoint { key: string; name: string; lat: number; lng: number }
export interface CatalogsDTO {
  institution: { name: string; emailDomains: string[] };
  careers: string[];
  departments: string[];
  campusPoints: CampusPoint[];
}

export interface CommunityImpactDTO {
  co2SavedKg: number;
  sharedTrips: number;
  kmAvoided: number;
  treesEquivalent: number;
}
export interface ImpactBreakdown { co2TotalKg: number; co2TodayKg: number; trips: number }
/** GET /api/impacto/me */
export interface MyImpactDTO {
  co2TodayKg: number;
  co2TotalKg: number;
  trips: number;
  kmAvoided?: number;
  asDriver?: ImpactBreakdown;
  asPassenger?: ImpactBreakdown;
}
/** Un renglón de GET /api/impacto/me/viajes */
export interface MyImpactTripDTO {
  tripId: string;
  role: 'driver' | 'passenger';
  co2Kg: number;            // CO₂ atribuido a mí en ese viaje
  kmAvoided: number;
  passengers: number;
  distanceKm: number;
  emissionFactor: number;
  direction: TripDirection;
  origin: string;
  destination: string;
  departureAt: string;
  finishedAt: string;
  calculatedAt: string;
  driver?: { id: string; fullName: string; photoUrl: string | null };
}
export interface MyImpactTripsPage { items: MyImpactTripDTO[]; page: number; pageSize: number; hasMore: boolean }
/** CO₂ ahorrado por un viaje finalizado */
export interface TripImpact { co2Kg: number; passengers: number; distanceKm: number; emissionFactor: number; passengerCo2Kg: number }

export interface VehicleDTO {
  id: string;
  brand: string;
  model: string;
  color: string;
  plates?: string | null;       // Solo para el conductor o con reserva aceptada
  capacity: number;
  active: boolean;
  declarationLicenseInsurance: boolean; // Declaración bajo protesta
  circulationDoc?: AttachedFile | null;
}

export type TripDirection = 'to_campus' | 'from_campus';
export type TripStatus = 'published' | 'in_progress' | 'finished' | 'cancelled';
export interface Place { text: string; lat: number; lng: number }

/** Punto de encuentro seleccionado directamente en el mapa */
export interface MeetingPoint {
  id: string;
  name: string;
  description?: string;
  lat: number;
  lng: number;
  order: number;
}

/** Ruta registrada del conductor */
export interface DriverRoute {
  id: string;
  driverId?: string;
  direction: TripDirection;
  campusPoint: string;          // 'campus_1' | 'campus_2' | 'metalurgia'
  origin: Place;
  destination: Place;
  meetingPoints: MeetingPoint[];
  isConfigured: boolean;        // true si ya completó la ruta de prueba y guardó puntos
  distanceKm?: number;
  durationMin?: number;
  notes?: string;
  updatedAt: string;
}

/** Dónde se une el pasajero al viaje. */
export interface JoinPoint {
  type: 'driver' | 'proposed';   // punto del conductor o propuesto por el pasajero
  pointId: string | null;
  name: string;
  lat: number;
  lng: number;
  note: string | null;
}

export type ReservationStatus =
  | 'none'
  | 'solicitada'
  | 'pendiente'
  | 'aceptada'
  | 'rechazada'
  | 'cancelada';

/** Viaje publicado */
export interface TripDTO {
  id: string;
  direction: TripDirection;
  campusPoint: string;
  origin: Place;
  destination: Place;
  departureAt: string;          // ISO-8601
  estimatedArrivalAt?: string | null; // ISO-8601 calculada con durationMin
  seatsTotal: number;
  seatsAvailable: number;
  distanceKm: number;
  durationMin: number | null;
  distanceSource: 'osrm' | 'haversine';
  status: TripStatus;
  notes: string | null;
  meetingPoints: MeetingPoint[];
  distanceFromYouKm?: number;
  driver: {
    id: string;
    fullName: string;
    affiliation?: string | null;
    photoUrl?: string | null;   // Foto obligatoria desde la cámara
    phone?: string | null;      // Solo conductor o reserva aceptada
  };
  vehicle: {
    brand: string;
    model: string;
    color: string;
    plates?: string | null;     // Solo visible si está permitido (reserva aceptada)
  };
  userReservationStatus?: ReservationStatus;
  userReservationId?: string | null;
  userJoinPoint?: JoinPoint | null; // dónde elegí unirme (si tengo reserva)
  isMine?: boolean;             // soy el conductor
  pendingRequests?: number;     // solo para el conductor
  acceptedPassengers?: number;  // solo para el conductor
  finishedAt?: string | null;
  impact?: TripImpact | null;   // CO₂ que ahorró (viaje finalizado con pasajeros)
}

export interface ReservationDTO {
  id: string;
  tripId: string;
  passengerId: string;
  passengerName: string;
  passengerAffiliation?: string;
  passengerPhoto?: string | null;
  passengerPhone?: string | null; // solo con reserva aceptada
  status: ReservationStatus;
  createdAt: string;
  requestedAt?: string;
  respondedAt?: string | null;
  cancelledAt?: string | null;
  lateCancellation?: boolean; // < 20 min antes de salida
  joinPoint?: JoinPoint | null; // dónde se une el pasajero
  trip?: TripDTO;
}

/** Notificación dentro de la aplicación (GET /api/me/notificaciones, retención 72 h) */
export type NotificationType =
  | 'solicitud_recibida'
  | 'solicitud_aceptada'
  | 'solicitud_rechazada'
  | 'solicitud_cancelada'
  | 'lugar_cancelado'
  | 'viaje_cancelado'
  | 'viaje_lleno'       // lista de espera: el viaje se llenó
  | 'lugar_liberado';   // lista de espera: se liberó un lugar

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  critical: boolean;          // cancelaciones y rechazos: se muestran con alerta destacada
  read: boolean;
  createdAt: string;          // ISO-8601
  tripId: string | null;
  reservationId: string | null;
}

/** Insignias del panel principal. */
export interface NotificationsSummary {
  newTrips: number;         // viajes publicados desde la última visita a la búsqueda
  pendingRequests: number;  // solicitudes sin responder en mis viajes (conductor)
}

export interface NotificationsResponse {
  items: NotificationItem[];
  unread: number;
  summary: NotificationsSummary;
}

export interface ApiErrorBody {
  error: string;
  message?: string;
  fields?: Record<string, string>;
}
