import { apiRequest } from './apiClient';
import type { CatalogsDTO, CommunityImpactDTO, MyImpactDTO } from '../types/api';

/** GET /api/catalogos — carreras, departamentos y puntos del campus (fuente: tabla parametro). */
export const getCatalogs = () => apiRequest<CatalogsDTO>('/api/catalogos', { token: null });

/** RF-24 · CO₂ total de la comunidad */
export const getCommunityImpact = () => apiRequest<CommunityImpactDTO>('/api/impacto/comunidad', { token: null });

/** RF-23 · CO₂ del usuario (hoy y total) */
export const getMyImpact = () => apiRequest<MyImpactDTO>('/api/impacto/me');
