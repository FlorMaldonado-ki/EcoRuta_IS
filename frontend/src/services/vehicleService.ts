import { apiRequest } from './apiClient';
import type { ApiVehicleDTO, ApiVehicleRequest } from '../types/apiBackend';

/** RF-06 · POST /api/vehiculos → 201 (o 200 si reactiva unas placas desactivadas). */
export const createVehicle = (data: ApiVehicleRequest) =>
  apiRequest<ApiVehicleDTO>('/api/vehiculos', { method: 'POST', body: data });

/** RF-06 · PATCH /api/vehiculos/:id (cualquier subconjunto de campos). */
export const updateVehicle = (id: string, changes: Partial<ApiVehicleRequest>) =>
  apiRequest<ApiVehicleDTO>(`/api/vehiculos/${id}`, { method: 'PATCH', body: changes });

/** RF-06 · GET /api/me/vehiculos → solo los activos. */
export const getMyVehicles = () => apiRequest<ApiVehicleDTO[]>('/api/me/vehiculos');
