'use strict';
/**
 * Estimación de respaldo de RF-10 / RNF-29: línea recta (Haversine) × 1.3 y
 * duración a 25 km/h promedio urbano. Misma fórmula que fn_haversine_km (001).
 */
const R_TIERRA_KM = 6371.0088;
const FACTOR_RUTA = 1.3;
const VELOCIDAD_KMH = 25;

const rad = (g) => (g * Math.PI) / 180;

/** Distancia en línea recta en km entre { lat, lng } y { lat, lng }. */
function haversineKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_TIERRA_KM * Math.asin(Math.sqrt(h));
}

/** @returns {{ distanciaKm: number, duracionMin: number, fuente: 'haversine' }} */
function estimarHaversine(origen, destino) {
  const km = haversineKm(origen, destino) * FACTOR_RUTA;
  return {
    distanciaKm: Math.max(0.01, Math.round(km * 100) / 100),
    duracionMin: Math.max(1, Math.round((km / VELOCIDAD_KMH) * 60)),
    fuente: 'haversine',
  };
}

module.exports = { haversineKm, estimarHaversine, FACTOR_RUTA, VELOCIDAD_KMH };
