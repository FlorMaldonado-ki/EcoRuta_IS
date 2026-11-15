'use strict';
/** SCRUM-30 / SCRUM-34 · RN-04, RN-11, RF-11: validación de publicar y de búsqueda. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseViaje, parseBusqueda, toViajeDTO } = require('../../src/modules/viajes/viaje.mapper');

const ahora = new Date('2026-11-10T15:00:00Z'); // 09:00 en Morelia
const ctx = { ahora, puntosCampus: [{ clave: 'campus_1', nombre: 'Campus 1', lat: 19.7217, lng: -101.1858 }] };
const base = {
  vehicleId: '6f524c0e-6986-410e-87b9-25e2b38053f0', direction: 'to_campus', campusPoint: 'campus_1',
  origin: { text: 'Plaza Las Américas', lat: 19.7039, lng: -101.1924 }, departureAt: '2026-11-10T16:00:00Z', seats: 3,
};

test('copia las coordenadas del punto del campus desde parametro, no del cliente (RN-11)', () => {
  const v = parseViaje({ ...base, destination: { text: 'Mi casa', lat: 19.5, lng: -101.5 } }, ctx);
  assert.equal(v.destino_texto, 'Campus 1');
  assert.equal(v.destino_lat, 19.7217);
  assert.equal(v.origen_texto, 'Plaza Las Américas');
});

test('desde el campus: el origen es el punto del campus y el destino lo elige el conductor', () => {
  const v = parseViaje({ ...base, direction: 'from_campus', origin: undefined, destination: { text: 'Altozano', lat: 19.672, lng: -101.165 } }, ctx);
  assert.equal(v.sentido, 'desde_campus');
  assert.equal(v.origen_lat, 19.7217);
  assert.equal(v.destino_texto, 'Altozano');
});

test('RN-04: menos de 30 min de anticipación → 422 en departureAt', () => {
  assert.throws(() => parseViaje({ ...base, departureAt: '2026-11-10T15:20:00Z' }, ctx), (e) => Boolean(e.fields.departureAt));
  assert.ok(parseViaje({ ...base, departureAt: '2026-11-10T15:30:00Z' }, ctx));
});

test('punto del campus inexistente, coordenadas fuera de Morelia y asientos inválidos → 422 por campo', () => {
  assert.throws(() => parseViaje({ ...base, campusPoint: 'biblioteca', origin: { text: 'x', lat: 0, lng: 0 }, seats: 0 }, ctx),
    (e) => Boolean(e.fields.campusPoint && e.fields.seats));
  assert.throws(() => parseViaje({ ...base, origin: { text: 'x', lat: -101.19, lng: 19.70 } }, ctx), (e) => Boolean(e.fields.origin)); // lat/lng invertidos
});

test('búsqueda: valores por defecto, página de 20 y fecha local de Morelia', () => {
  const f = parseBusqueda({ direction: 'to_campus' }, { ahora });
  assert.equal(f.fecha, '2026-11-10');
  assert.equal(f.radioKm, 5);
  assert.equal(f.limite, 20);
  assert.equal(f.lat, null);
});

test('búsqueda: inyección SQL y rangos inválidos → 422, nunca llegan a la consulta', () => {
  assert.throws(() => parseBusqueda({ direction: "to_campus' OR 1=1 --", date: "2026-11-10'; DROP TABLE viaje; --" }, { ahora }),
    (e) => Boolean(e.fields.direction && e.fields.date));
  assert.throws(() => parseBusqueda({ direction: 'to_campus', radiusKm: '0.1', lat: '19.7' }, { ahora }), (e) => Boolean(e.fields.radiusKm && e.fields.location));
  assert.throws(() => parseBusqueda({ direction: 'to_campus', timeFrom: '18:00', timeTo: '07:00' }, { ahora }), (e) => Boolean(e.fields.timeTo));
});

test('toViajeDTO oculta teléfono y placas sin permiso y los muestra con verContacto', () => {
  const fila = { id: '1', sentido: 'hacia_campus', estado: 'publicado', conductor_id: 'c', conductor_nombre: 'Ana', conductor_adscripcion: 'x',
    conductor_telefono: '4431234567', vehiculo_marca: 'Kia', vehiculo_modelo: 'Rio', vehiculo_color: 'Rojo', vehiculo_placas: 'ABC123' };
  assert.ok(!JSON.stringify(toViajeDTO(fila)).match(/4431234567|ABC123/));
  const conPermiso = toViajeDTO(fila, { verContacto: true });
  assert.equal(conPermiso.driver.phone, '4431234567');
  assert.equal(conPermiso.vehicle.plates, 'ABC123');
});
