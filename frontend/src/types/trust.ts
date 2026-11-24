/**
 * Contrato del módulo 3.1.5 · Confianza, seguridad y administración.
 * Refleja exactamente lo que devuelve la API (backend/src/modules/confianza y admin).
 */
import type { UserType } from './registration';

export interface PersonRef {
  id: string;
  fullName: string;
  photoUrl: string | null;
  affiliation?: string | null;
  email?: string;
}

export interface TripRef {
  origin: string;
  destination: string;
  departureAt: string;
}

// ── Calificaciones (RF-27) ──────────────────────────────────────────────────
export interface RatingSummary {
  average: number | null;
  count: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

/** Calificación recibida. `comment` es null si no hay o si ya venció (commentExpired). */
export interface ReceivedRating {
  id: string;
  tripId: string;
  score: number;
  comment: string | null;
  commentExpired: boolean;
  createdAt: string;
  rater: PersonRef;
  raterRole: 'driver' | 'passenger';
  trip: TripRef | null;
}

/** Calificación escrita por mí: la puntuación es definitiva; el comentario se edita o borra mientras está vigente. */
export interface GivenRating {
  id: string;
  tripId: string;
  score: number;
  comment: string | null;
  commentExpired: boolean;
  commentExpiresAt: string | null;
  commentEditedAt: string | null;
  commentDeletedAt: string | null;
  canEditComment: boolean;
  canAddComment: boolean;
  createdAt: string;
  ratedUser: PersonRef;
  trip: TripRef | null;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ReceivedRatingsPage extends Paged<ReceivedRating> {
  summary: RatingSummary;
  commentRetentionDays: number;
}

export interface GivenRatingsPage extends Paged<GivenRating> {
  commentRetentionDays: number;
}

export interface TripParticipant {
  user: PersonRef;
  role: 'driver' | 'passenger';
  myRating: GivenRating | null;
  canRate: boolean;
  alreadyReported: boolean;
}

export interface TripParticipants {
  tripId: string;
  tripStatus: string;
  finishedAt: string | null;
  myRole: 'driver' | 'passenger';
  participants: TripParticipant[];
}

export interface RatingReminder {
  tripId: string;
  trip: TripRef;
  finishedAt: string;
  myRole: 'driver' | 'passenger';
  toRate: PersonRef[];
}

export interface CreateRatingRequest {
  tripId: string;
  ratedUserId: string;
  score: number;
  comment?: string | null;
}

// ── Reportes (RF-28) ────────────────────────────────────────────────────────
export type ReportReason =
  | 'conducta_inapropiada'
  | 'incumplimiento_acuerdos'
  | 'informacion_falsa'
  | 'seguridad'
  | 'acoso'
  | 'incumplimiento_normas'
  | 'otro';

export interface CreateReportRequest {
  reportedUserId: string;
  tripId: string;
  reason: ReportReason;
  reasonOther?: string;
  description: string;
}

export interface CreateReportResponse {
  id: string;
  createdAt: string;
  message: string;
}

export type ReportStatus = 'pending' | 'in_review' | 'resolved' | 'dismissed';

export interface ReportDTO {
  id: string;
  reason: string;
  reasonLabel: string;
  reasonOther: string | null;
  description: string;
  status: ReportStatus;
  read: boolean;
  readAt: string | null;
  attended: boolean;
  adminNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  reporter: PersonRef;
  reportedUser: PersonRef & { status: 'active' | 'pending' | 'suspended'; totalReports?: number };
  trip: (TripRef & { id: string; status: string }) | null;
}

export type ReportFilter = 'recent' | 'oldest' | 'read' | 'unread' | 'all';

export interface ReportsPage extends Paged<ReportDTO> {
  filter: ReportFilter;
  reasons: { key: string; label: string }[];
}

export interface RecurrentUser {
  user: PersonRef & { status: 'active' | 'pending' | 'suspended' };
  totalReports: number;
  unreadReports: number;
  reportsToAttend: number;
  distinctReporters: number;
  lastReportAt: string;
}

export interface RecurrentUsersDTO {
  threshold: number;
  items: RecurrentUser[];
}

// ── Contacto de emergencia (RF-31) ──────────────────────────────────────────
export type Relationship =
  | 'madre' | 'padre' | 'hermano' | 'hermana' | 'hijo' | 'hija' | 'pareja'
  | 'abuelo' | 'abuela' | 'familiar' | 'amigo' | 'amiga' | 'otro';

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: Relationship;
  relationshipLabel: string;
  relationshipOther: string | null;
  updatedAt: string;
}

export interface EmergencyContactRequest {
  name: string;
  phone: string;
  relationship: Relationship;
  relationshipOther?: string;
}

// ── Documentos ──────────────────────────────────────────────────────────────
export type DocumentStatus = 'pending' | 'approved' | 'rejected';

export interface UserDocument {
  id: string;
  type: string;
  typeLabel: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  rejectionReason: string | null;
  reviewedAt: string | null;
  uploadedAt: string;
  /** URL temporal (10 min) para ver el archivo. */
  viewUrl: string | null;
  owner?: PersonRef & { email: string; userType: UserType };
}

export interface MyDocumentsDTO {
  requiredType: string;
  canUpload: boolean;
  items: UserDocument[];
}

export interface AdminDocumentsPage extends Paged<UserDocument> {
  types: { key: string; label: string }[];
}

// ── Administración ──────────────────────────────────────────────────────────
export interface AdminSummary {
  users: { total: number; active: number; pending: number; suspended: number };
  documents: { pending: number };
  reports: { unread: number; toAttend: number; recurrentUsers: number };
  trips: { total: number; finished: number; published: number };
  co2SavedKg: number;
  ratings: { average: number | null; count: number };
  recurrentThreshold: number;
}

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  userType: UserType;
  affiliation: string | null;
  phone: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'pending' | 'suspended';
  emailVerified: boolean;
  createdAt: string;
  photoUrl: string | null;
  ratingAverage: number | null;
  ratingCount: number;
  reportsReceived: number;
  tripsAsDriver: number;
  tripsAsPassenger: number;
  documentStatus: DocumentStatus | null;
  recurrent: boolean;
}
