import { apiRequest } from './apiClient';
import type { NotificationItem, NotificationType, NotificationsResponse } from '../types/api';

/** GET /api/me/notificaciones → últimas 72 h (máx. 50) y número de no leídas. */
export const fetchNotifications = () => apiRequest<NotificationsResponse>('/api/me/notificaciones');

/** PATCH /api/me/notificaciones/:id/leida */
export const markNotificationRead = (id: string) =>
  apiRequest<NotificationItem>(`/api/me/notificaciones/${id}/leida`, { method: 'PATCH' });

/** POST /api/me/notificaciones/leer-todas — todas, o solo las de ciertos tipos (una sección). */
export const markAllNotificationsRead = (types?: NotificationType[]) =>
  apiRequest<{ unread: number }>('/api/me/notificaciones/leer-todas', {
    method: 'POST',
    body: types ? { types } : {},
  });

/** POST /api/me/notificaciones/viajes-vistos — reinicia la insignia de viajes nuevos. */
export const markTripsSeen = () =>
  apiRequest<{ newTrips: number }>('/api/me/notificaciones/viajes-vistos', { method: 'POST' });
