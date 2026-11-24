import { apiRequest } from './apiClient';
import type { ApiVehicleCatalog, ApiVehicleDTO, ApiVehicleRequest } from '../types/apiBackend';

/** POST /api/vehiculos → 201 (o 200 si reactiva unas placas desactivadas). */
export const createVehicle = (data: ApiVehicleRequest) =>
  apiRequest<ApiVehicleDTO>('/api/vehiculos', { method: 'POST', body: data });

/** PATCH /api/vehiculos/:id. Tipo, marca, modelo y año se envían juntos. */
export const updateVehicle = (id: string, changes: Partial<ApiVehicleRequest>) =>
  apiRequest<ApiVehicleDTO>(`/api/vehiculos/${id}`, { method: 'PATCH', body: changes });

/** GET /api/me/vehiculos → solo los activos. */
export const getMyVehicles = () => apiRequest<ApiVehicleDTO[]>('/api/me/vehiculos');

let catalogCache: Promise<ApiVehicleCatalog> | null = null;

/** GET /api/catalogos/vehiculos. Se pide una vez por sesión de la app. */
export function getVehicleCatalog(): Promise<ApiVehicleCatalog> {
  if (!catalogCache) {
    catalogCache = apiRequest<ApiVehicleCatalog>('/api/catalogos/vehiculos', { token: null });
    catalogCache.catch(() => { catalogCache = null; });
  }
  return catalogCache;
}
