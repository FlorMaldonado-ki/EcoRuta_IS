'use strict';
/**
 * Proveedor OSRM (RF-10). Servidor público por defecto; se puede apuntar a uno
 * propio con OSRM_URL. Solo este archivo conoce la API de OSRM (RNF-19).
 */
const OSRM_URL_DEFECTO = 'https://router.project-osrm.org';

/**
 * @param {{lat:number,lng:number}} origen
 * @param {{lat:number,lng:number}} destino
 * @param {{ timeoutMs?: number, baseUrl?: string, fetchImpl?: typeof fetch }} [opciones]
 * @returns {Promise<{ distanciaKm: number, duracionMin: number, fuente: 'osrm' }>}
 */
async function estimarOsrm(origen, destino, opciones = {}) {
  const { timeoutMs = 5000, baseUrl = process.env.OSRM_URL || OSRM_URL_DEFECTO, fetchImpl = fetch } = opciones;
  // OSRM espera "lng,lat" (al revés que Leaflet).
  const coords = `${origen.lng},${origen.lat};${destino.lng},${destino.lat}`;
  const url = `${baseUrl.replace(/\/+$/, '')}/route/v1/driving/${coords}?overview=false&alternatives=false&steps=false`;

  // Temporizador propio (no AbortSignal.timeout) para cortar también la lectura del cuerpo.
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(Object.assign(new Error('tiempo agotado'), { name: 'TimeoutError' })), timeoutMs);
  let json;
  try {
    const res = await fetchImpl(url, { signal: control.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`OSRM respondió HTTP ${res.status}`);
    json = await res.json();
  } finally {
    clearTimeout(timer);
  }
  const ruta = json?.routes?.[0];
  if (json?.code !== 'Ok' || !ruta || !(ruta.distance > 0)) throw new Error(`OSRM sin ruta (${json?.code || 'respuesta vacía'})`);

  return {
    distanciaKm: Math.round((ruta.distance / 1000) * 100) / 100,
    duracionMin: Math.max(1, Math.round(ruta.duration / 60)),
    fuente: 'osrm',
  };
}

module.exports = { estimarOsrm, OSRM_URL_DEFECTO };
