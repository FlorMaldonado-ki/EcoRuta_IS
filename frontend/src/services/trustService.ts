/**
 * Módulo 3.1.5 (usuario): calificaciones, reportes, contacto de emergencia y mis documentos.
 * Cada función llama a un endpoint real de la API; nada se simula.
 */
import { apiRequest } from './apiClient';
import { appendFile } from './authService';
import type { AttachedFile } from '../types/registration';
import type {
  CreateRatingRequest, CreateReportRequest, CreateReportResponse, EmergencyContact, EmergencyContactRequest,
  GivenRating, GivenRatingsPage, MyDocumentsDTO, RatingReminder, ReceivedRatingsPage, TripParticipants, UserDocument,
} from '../types/trust';

// ── Calificaciones ──────────────────────────────────────────────────────────
/** GET /api/viajes/:id/participantes — a quién puedo calificar o reportar en ese viaje. */
export const getTripParticipants = (tripId: string) =>
  apiRequest<TripParticipants>(`/api/viajes/${tripId}/participantes`);

/** POST /api/calificaciones — definitiva: no se puede editar ni borrar la puntuación. */
export const createRating = (data: CreateRatingRequest) =>
  apiRequest<GivenRating>('/api/calificaciones', { method: 'POST', body: data });

/** PATCH /api/calificaciones/:id/comentario — solo el autor; la puntuación no cambia. */
export const updateRatingComment = (ratingId: string, comment: string) =>
  apiRequest<GivenRating>(`/api/calificaciones/${ratingId}/comentario`, { method: 'PATCH', body: { comment } });

/** DELETE /api/calificaciones/:id/comentario — la calificación se conserva. */
export const deleteRatingComment = (ratingId: string) =>
  apiRequest<GivenRating>(`/api/calificaciones/${ratingId}/comentario`, { method: 'DELETE' });

export const getMyReceivedRatings = (page = 1) =>
  apiRequest<ReceivedRatingsPage>(`/api/me/calificaciones?page=${page}`);

export const getMyGivenRatings = (page = 1) =>
  apiRequest<GivenRatingsPage>(`/api/me/calificaciones/dadas?page=${page}`);

/** GET /api/calificaciones/pendientes — viajes con recordatorio por mostrar (una sola vez). */
export const getRatingReminders = () =>
  apiRequest<{ items: RatingReminder[] }>('/api/calificaciones/pendientes');

/** POST /api/calificaciones/recordatorios/:tripId — el recordatorio ya se mostró; no vuelve a aparecer. */
export const markReminderShown = (tripId: string) =>
  apiRequest<{ tripId: string; reminded: boolean }>(`/api/calificaciones/recordatorios/${tripId}`, { method: 'POST' });

// ── Reportes ────────────────────────────────────────────────────────────────
export const createReport = (data: CreateReportRequest) =>
  apiRequest<CreateReportResponse>('/api/reportes', { method: 'POST', body: data });

// ── Contacto de emergencia ──────────────────────────────────────────────────
export const getEmergencyContact = () =>
  apiRequest<{ contact: EmergencyContact | null }>('/api/me/contacto-emergencia');

export const saveEmergencyContact = (data: EmergencyContactRequest) =>
  apiRequest<{ contact: EmergencyContact }>('/api/me/contacto-emergencia', { method: 'PUT', body: data });

// ── Mis documentos ──────────────────────────────────────────────────────────
export const getMyDocuments = () => apiRequest<MyDocumentsDTO>('/api/me/documentos');

/** POST /api/me/documentos — reemplaza un documento rechazado; queda pendiente de revisión. */
export function resubmitDocument(file: AttachedFile) {
  const fd = new FormData();
  appendFile(fd, 'document', file);
  return apiRequest<UserDocument>('/api/me/documentos', { formData: fd });
}
