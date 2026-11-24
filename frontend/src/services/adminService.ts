/**
 * Panel de administración. La API exige rol 'admin' en todas estas rutas (403 si no):
 * el menú solo se muestra a administradores, pero la autorización real es del servidor.
 */
import { apiRequest } from './apiClient';
import type {
  AdminDocumentsPage, AdminSummary, AdminUser, Paged, RecurrentUsersDTO, ReceivedRatingsPage,
  ReportDTO, ReportFilter, ReportStatus, ReportsPage, UserDocument,
} from '../types/trust';

const qs = (params: Record<string, string | number | undefined | null>) => {
  const partes = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return partes.length ? `?${partes.join('&')}` : '';
};

export const getAdminSummary = () => apiRequest<AdminSummary>('/api/admin/resumen');

export interface DocumentFilters {
  status?: 'pending' | 'approved' | 'rejected';
  type?: string;
  userId?: string;
  q?: string;
  from?: string; // AAAA-MM-DD
  to?: string;
  order?: 'asc' | 'desc';
  page?: number;
}
export const getAdminDocuments = (f: DocumentFilters = {}) =>
  apiRequest<AdminDocumentsPage>(`/api/admin/documentos${qs({ ...f })}`);

export const getAdminDocument = (id: string) => apiRequest<UserDocument>(`/api/admin/documentos/${id}`);

export const reviewDocument = (id: string, action: 'approve' | 'reject', reason?: string) =>
  apiRequest<UserDocument>(`/api/admin/documentos/${id}`, { method: 'PATCH', body: { action, ...(reason ? { reason } : {}) } });

export interface ReportFilters {
  filter?: ReportFilter;
  reportedUserId?: string;
  reason?: string;
  q?: string;
  page?: number;
}
export const getAdminReports = (f: ReportFilters = {}) =>
  apiRequest<ReportsPage>(`/api/admin/reportes${qs({ ...f })}`);

export const getAdminReport = (id: string) => apiRequest<ReportDTO>(`/api/admin/reportes/${id}`);

export const updateAdminReport = (id: string, changes: { read?: boolean; status?: ReportStatus; note?: string }) =>
  apiRequest<ReportDTO>(`/api/admin/reportes/${id}`, { method: 'PATCH', body: changes });

export const getRecurrentUsers = () => apiRequest<RecurrentUsersDTO>('/api/admin/reportes/recurrentes');

export const getAdminUsers = (f: { q?: string; status?: string; page?: number } = {}) =>
  apiRequest<Paged<AdminUser>>(`/api/admin/usuarios${qs({ ...f })}`);

export const getAdminUser = (id: string) => apiRequest<AdminUser>(`/api/admin/usuarios/${id}`);

export const setUserStatus = (id: string, action: 'suspend' | 'activate') =>
  apiRequest<AdminUser>(`/api/admin/usuarios/${id}`, { method: 'PATCH', body: { action } });

export const getUserRatings = (id: string, page = 1) =>
  apiRequest<ReceivedRatingsPage>(`/api/admin/usuarios/${id}/calificaciones?page=${page}`);
