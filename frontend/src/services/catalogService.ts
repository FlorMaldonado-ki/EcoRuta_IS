import { apiRequest } from './apiClient';
import type { CatalogsDTO, CommunityImpactDTO, MyImpactDTO, MyImpactTripsPage } from '../types/api';

/** GET /api/catalogos — carreras, departamentos y puntos del campus (fuente: tabla parametro). */
export const getCatalogs = () => apiRequest<CatalogsDTO>('/api/catalogos', { token: null });

/** GET /api/impacto/comunidad */
export const getCommunityImpact = () => apiRequest<CommunityImpactDTO>('/api/impacto/comunidad', { token: null });

/** GET /api/impacto/me: hoy, total y desglose conductor/pasajero. */
export const getMyImpact = () => apiRequest<MyImpactDTO>('/api/impacto/me');

/** GET /api/impacto/me/viajes: CO₂ atribuido por viaje (20 por página). */
export const getMyImpactTrips = (page = 1) => apiRequest<MyImpactTripsPage>(`/api/impacto/me/viajes?page=${page}`);
