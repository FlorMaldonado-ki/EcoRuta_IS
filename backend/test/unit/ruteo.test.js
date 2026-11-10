'use strict';
/** SCRUM-18 · RF-10, RNF-19, RNF-29: estimación con OSRM y respaldo Haversine × 1.3. */
const test = require('node:test');
const assert = require('node:assert/strict');
const ruteo = require('../../src/shared/ruteo');
const { haversineKm } = require('../../src/shared/ruteo/haversine');

const PLAZA = { lat: 19.7039, lng: -101.1924 };   // Plaza Las Américas
const CAMPUS = { lat: 19.7217, lng: -101.1858 };  // Entrada principal
const silencio = () => {};

test('Haversine coincide con fn_haversine_km (≈ 2.10 km en línea recta)', () => {
  assert.ok(Math.abs(haversineKm(PLAZA, CAMPUS) - 2.1) < 0.05);
});

test('con OSRM disponible usa su distancia (2 decimales), duración en minutos y fuente osrm', async () => {
  const fetchImpl = async (url) => {
    assert.match(url, /\/route\/v1\/driving\/-101\.1924,19\.7039;-101\.1858,19\.7217/); // lng,lat
    return { ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 6437.4, duration: 754 }] }) };
  };
  const r = await ruteo.estimar(PLAZA, CAMPUS, { fetchImpl, log: silencio, proveedor: 'osrm' });
  assert.deepEqual(r, { distanciaKm: 6.44, duracionMin: 13, fuente: 'osrm' });
});

test('si OSRM falla usa Haversine × 1.3 y 25 km/h, sin lanzar error', async () => {
  const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
  const r = await ruteo.estimar(PLAZA, CAMPUS, { fetchImpl, log: silencio, proveedor: 'osrm' });
  const esperado = Math.round(haversineKm(PLAZA, CAMPUS) * 1.3 * 100) / 100;
  assert.equal(r.fuente, 'haversine');
  assert.equal(r.distanciaKm, esperado);
  assert.equal(r.duracionMin, Math.round((haversineKm(PLAZA, CAMPUS) * 1.3 / 25) * 60));
});

test('si OSRM tarda más del límite usa el respaldo', async () => {
  const fetchImpl = (_url, { signal }) => new Promise((_res, rej) => signal.addEventListener('abort', () => rej(signal.reason)));
  const inicio = Date.now();
  const r = await ruteo.estimar(PLAZA, CAMPUS, { fetchImpl, log: silencio, timeoutMs: 50, proveedor: 'osrm' });
  assert.equal(r.fuente, 'haversine');
  assert.ok(Date.now() - inicio < 2000);
});

test('si OSRM responde sin ruta o con HTTP de error usa el respaldo', async () => {
  for (const respuesta of [{ ok: false, status: 503, json: async () => ({}) }, { ok: true, json: async () => ({ code: 'NoRoute', routes: [] }) }]) {
    const r = await ruteo.estimar(PLAZA, CAMPUS, { fetchImpl: async () => respuesta, log: silencio, proveedor: 'osrm' });
    assert.equal(r.fuente, 'haversine');
  }
});

test('ROUTING_PROVIDER=haversine no llama a la red', async () => {
  const r = await ruteo.estimar(PLAZA, CAMPUS, { proveedor: 'haversine', fetchImpl: () => assert.fail('no debe llamar a OSRM') });
  assert.equal(r.fuente, 'haversine');
});
