'use strict';
/**
 * Utilidades de validación compartidas por los mappers (RNF-10: toda entrada se
 * valida antes de llegar a la BD). Funciones puras, sin dependencias.
 */

/** Texto recortado; cualquier otro tipo → ''. */
const str = (v) => (typeof v === 'string' ? v.trim() : '');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

/** Entero (acepta "3" de query params o formularios); null si no lo es. */
function entero(v) {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

/** Número finito (acepta "19.72"); null si no lo es. */
function numero(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** Página 1..1000 desde query param (por defecto 1). */
function pagina(v) {
  if (v === undefined || v === '') return 1;
  const n = entero(v);
  return n !== null && n >= 1 && n <= 1000 ? n : null;
}

/** Zona de servicio de F1 (igual que ck_viaje_coords en la migración 004). */
const ZONA = Object.freeze({ latMin: 19.2, latMax: 20.2, lngMin: -101.7, lngMax: -100.7 });
const dentroDeZona = (lat, lng) =>
  lat !== null && lng !== null && lat >= ZONA.latMin && lat <= ZONA.latMax && lng >= ZONA.lngMin && lng <= ZONA.lngMax;

module.exports = { str, esUuid, entero, numero, pagina, ZONA, dentroDeZona };
