'use strict';
/**
 * Abstracción del proveedor de ruteo (RF-10, RNF-19, RNF-29).
 * Los módulos SOLO usan `ruteo.estimar(origen, destino)`; nunca llaman a OSRM
 * directamente. Si OSRM falla o tarda más de 5 s, se usa Haversine × 1.3 sin
 * que el usuario vea un error.
 *
 *   ROUTING_PROVIDER=osrm       (por defecto) OSRM con respaldo Haversine
 *   ROUTING_PROVIDER=haversine  solo Haversine (pruebas, sin internet)
 */
const { estimarOsrm } = require('./osrm');
const { estimarHaversine } = require('./haversine');

const DISTANCIA_MAX_KM = 199.99; // ck_viaje_distancia (< 200)
const DURACION_MAX_MIN = 600;    // ck_viaje_duracion

/** Ajusta a los límites de la tabla viaje para que un dato raro no rompa el INSERT. */
function acotar(r) {
  return {
    distanciaKm: Math.min(Math.max(r.distanciaKm, 0.01), DISTANCIA_MAX_KM),
    duracionMin: Math.min(Math.max(r.duracionMin, 1), DURACION_MAX_MIN),
    fuente: r.fuente,
  };
}

/**
 * @param {{lat:number,lng:number}} origen
 * @param {{lat:number,lng:number}} destino
 * @param {{ proveedor?: 'osrm'|'haversine', timeoutMs?: number, fetchImpl?: typeof fetch, log?: (msg: string) => void }} [opciones]
 * @returns {Promise<{ distanciaKm: number, duracionMin: number, fuente: 'osrm'|'haversine' }>}
 */
async function estimar(origen, destino, opciones = {}) {
  const proveedor = opciones.proveedor || process.env.ROUTING_PROVIDER || 'osrm';
  const log = opciones.log || ((m) => console.warn(m));
  if (proveedor === 'haversine') return acotar(estimarHaversine(origen, destino));
  try {
    return acotar(await estimarOsrm(origen, destino, opciones));
  } catch (err) {
    log(`[ruteo] OSRM no disponible (${err.name === 'TimeoutError' ? 'tardó más de 5 s' : err.message}); uso Haversine × 1.3`);
    return acotar(estimarHaversine(origen, destino));
  }
}

module.exports = { estimar };
