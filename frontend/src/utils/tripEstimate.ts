import type { TripDTO } from '../types/api';

/**
 * RF-10 · Texto de la estimación calculada por el backend (ruteo.estimar).
 * fuente 'osrm' = ruta real por calles; 'haversine' = línea recta × 1.3 a 25 km/h (respaldo RNF-29).
 */
type Estimate = Pick<TripDTO, 'distanceKm' | 'durationMin' | 'distanceSource'>;

export const formatDistanceKm = (km: number) =>
  `${km.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;

export const formatDurationMin = (min: number | null | undefined) => {
  if (!min) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

/** "2.76 km · 5 min" */
export function formatTripEstimate(t: Estimate): string {
  const dur = formatDurationMin(t.durationMin);
  return dur ? `${formatDistanceKm(t.distanceKm)} · ${dur}` : formatDistanceKm(t.distanceKm);
}

export const estimateSourceLabel = (t: Estimate) =>
  t.distanceSource === 'osrm' ? 'Ruta por calles (OSRM)' : 'Estimación aproximada';
