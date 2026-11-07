/**
 * EcoRuta Escolar · Contratos TypeScript y Tipos del Frontend (Sprint 1 + Sprint 2)
 */
import type { UserType, AttachedFile } from './registration';

/** Rol de SEGURIDAD (RNF-09). No confundir con UserType (alumno/maestro). */
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
export interface MyImpactDTO { co2TodayKg: number; co2TotalKg: number; trips: number }

/** Información del vehículo del conductor (Sprint 2) */
export interface VehicleDTO {
  id: string;
  brand: string;
  model: string;
  color: string;
  plates?: string | null;       // Protegido por RNF-12: visible solo con reserva aceptada o conductor
  capacity: number;
  active: boolean;
  declarationLicenseInsurance: boolean; // Declaración bajo protesta (RN-12)
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
  };
  vehicle: {
    brand: string;
    model: string;
    color: string;
    plates?: string | null;     // Solo visible si está permitido (reserva aceptada)
  };
  userReservationStatus?: ReservationStatus;
  userReservationId?: string | null;
}

export interface SearchTripsParams {
  date?: string;             // YYYY-MM-DD
  timeFrom?: string;         // HH:MM
  timeTo?: string;           // HH:MM
  direction?: TripDirection; // 'to_campus' | 'from_campus'
  campusPoint?: string;      // 'campus_1' | 'campus_2' | 'metalurgia'
  lat?: number;
  lng?: number;
  radiusKm?: number;
  minSeats?: number;
}

export interface ReservationDTO {
  id: string;
  tripId: string;
  passengerId: string;
  passengerName: string;
  passengerAffiliation?: string;
  passengerPhoto?: string | null;
  status: ReservationStatus;
  createdAt: string;
  requestedAt?: string;
  respondedAt?: string | null;
  cancelledAt?: string | null;
  lateCancellation?: boolean; // RN-06: < 20 min antes de salida
  trip?: TripDTO;
}

/** Notificación dentro de la aplicación con límite de 72 horas */
export type NotificationType =
  | 'solicitud_recibida'
  | 'solicitud_aceptada'
  | 'solicitud_rechazada'
  | 'solicitud_cancelada'
  | 'lugar_cancelado'
  | 'viaje_cancelado'
  | 'viaje_proximo';

export interface NotificationItem {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;          // ISO-8601 para calcular antigüedad de 72 horas
  read: boolean;
  relatedTripId?: string;
  relatedReservationId?: string;
}

/** Evento para preparación de notificación por correo */
export interface EmailNotificationEvent {
  id: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  summary: string;
  event: NotificationType;
  tripOrigin: string;
  tripDestination: string;
  departureTime: string;
  timestamp: string;
}

export interface ApiErrorBody {
  error: string;
  message?: string;
  fields?: Record<string, string>;
}
