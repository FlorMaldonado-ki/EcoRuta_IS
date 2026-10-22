/**
 * EcoRuta Escolar · Contrato de la API (lado cliente)
 * ---------------------------------------------------------------------------
 * Forma EXACTA de lo que devuelven los mappers del backend
 * (backend/src/modules/*\/*.mapper.js). Mantener ambos lados sincronizados.
 *   - camelCase en todo el JSON; la BD usa snake_case y nunca se expone tal cual.
 *   - IDs: string (UUID).  Fechas: ISO-8601 UTC.  Coordenadas y distancias: number.
 */
import type { UserType } from './registration';

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
  ratingAverage?: number | null;
  ratingCount?: number;
}

export interface LoginRequest { email: string; password: string }
export interface LoginResponse { token: string; user: UserDTO }

/** Sesión activa en la app. */
export interface Session { token: string; user: UserDTO }

export interface RegisterResponse { user: UserDTO; emailSent: boolean; message: string }
export interface MessageResponse { message: string }

export interface UpdateProfileRequest {
  fullName?: string;
  career?: string;
  department?: string;
  phone?: string | null;
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

export interface VehicleDTO {
  id: string; brand: string; model: string; color: string; plates: string;
  capacity: number; active: boolean;
}

export type TripDirection = 'to_campus' | 'from_campus';
export type TripStatus = 'published' | 'in_progress' | 'finished' | 'cancelled';
export interface Place { text: string; lat: number; lng: number }
export interface TripDTO {
  id: string;
  direction: TripDirection;
  campusPoint: string;
  origin: Place;
  destination: Place;
  departureAt: string;
  seatsTotal: number;
  seatsAvailable: number;
  distanceKm: number;
  durationMin: number | null;
  distanceSource: 'osrm' | 'haversine';
  status: TripStatus;
  notes: string | null;
  distanceFromYouKm?: number;
  driver?: { id: string; fullName: string; affiliation: string };
  vehicle?: { brand: string; model: string; color: string };
}

/** Cuerpo de error de la API. `fields` usa las claves de FormErrors → setErrors(err.fields). */
export interface ApiErrorBody {
  error: string;   // 'VALIDATION', 'CORREO_REGISTRADO', 'CORREO_NO_VERIFICADO', …
  message?: string;
  fields?: Record<string, string>;
}
