import { apiRequest } from './apiClient';
import type { CatalogsDTO, CommunityImpactDTO, MyImpactDTO, MyImpactTripsPage } from '../types/api';

/** GET /api/catalogos — carreras, departamentos y puntos del campus (fuente: tabla parametro). */
export const getCatalogs = () => apiRequest<CatalogsDTO>('/api/catalogos', { token: null });

/** RF-24 · CO₂ total de la comunidad */
export const getCommunityImpact = () => apiRequest<CommunityImpactDTO>('/api/impacto/comunidad', { token: null });

/** RF-23 · CO₂ del usuario (hoy, total y desglose conductor/pasajero) */
export const getMyImpact = () => apiRequest<MyImpactDTO>('/api/impacto/me');

/** RF-23 · viajes con el CO₂ que se me atribuye (20 por página) */
export const getMyImpactTrips = (page = 1) => apiRequest<MyImpactTripsPage>(`/api/impacto/me/viajes?page=${page}`);
