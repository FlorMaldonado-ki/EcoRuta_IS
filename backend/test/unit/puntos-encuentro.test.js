'use strict';
/** Puntos de encuentro del conductor y punto de unión del pasajero. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePuntosEncuentro, toPuntosEncuentroDTO, toPuntoUnionDTO } = require('../../src/modules/viajes/viaje.mapper');
const { parsePuntoUnion } = require('../../src/modules/reservas/reserva.mapper');

const LIVERPOOL = { name: 'Acceso Liverpool', description: 'Bahía de descenso', lat: 19.7039, lng: -101.1924 };
const CHARO = { name: 'Salida a Charo', lat: 19.712, lng: -101.189 };

test('puntos del conductor: se numeran p1..pN y se devuelven al cliente en orden', () => {
  const errors = {};
  const puntos = parsePuntosEncuentro([LIVERPOOL, CHARO], errors);
  assert.deepEqual(errors, {});
  assert.deepEqual(puntos.map((p) => p.id), ['p1', 'p2']);
  const dto = toPuntosEncuentroDTO(puntos);
  assert.deepEqual(dto[0], { id: 'p1', name: 'Acceso Liverpool', description: 'Bahía de descenso', lat: 19.7039, lng: -101.1924, order: 1 });
  assert.equal(dto[1].description, null);
});

test('puntos del conductor: fuera de Morelia, sin nombre o más de 8 → error en meetingPoints', () => {
  for (const lista of [[{ ...CHARO, lat: 25 }], [{ ...CHARO, name: '  ' }], Array(9).fill(CHARO), 'no-es-lista']) {
    const errors = {};
    parsePuntosEncuentro(lista, errors);
    assert.ok(errors.meetingPoints, JSON.stringify(lista).slice(0, 40));
  }
  assert.deepEqual(parsePuntosEncuentro(undefined, {}), []);
});

test('punto de unión: elegir un punto del conductor copia sus datos', () => {
  const puntos = parsePuntosEncuentro([LIVERPOOL, CHARO], {});
  const r = parsePuntoUnion({ meetingPoint: { pointId: 'p2' } }, puntos);
  assert.deepEqual(r, { tipo: 'conductor', punto_id: 'p2', nombre: 'Salida a Charo', lat: 19.712, lng: -101.189 });
  assert.deepEqual(toPuntoUnionDTO(r), { type: 'driver', pointId: 'p2', name: 'Salida a Charo', lat: 19.712, lng: -101.189, note: null });
});

test('punto de unión: propuesto por el pasajero con nota; nombre por defecto', () => {
  const r = parsePuntoUnion({ meetingPoint: { lat: 19.70, lng: -101.19, note: 'Frente al OXXO' } }, []);
  assert.equal(r.tipo, 'propuesto');
  assert.equal(r.nombre, 'Punto propuesto por el pasajero');
  assert.equal(toPuntoUnionDTO(r).type, 'proposed');
  assert.equal(toPuntoUnionDTO(r).note, 'Frente al OXXO');
  assert.equal(toPuntoUnionDTO(null), null);
});

test('punto de unión: obligatorio si el viaje tiene puntos; inválidos → 422', () => {
  const puntos = parsePuntosEncuentro([LIVERPOOL], {});
  assert.throws(() => parsePuntoUnion({}, puntos), (e) => Boolean(e.fields?.meetingPoint));
  assert.throws(() => parsePuntoUnion({ meetingPoint: { pointId: 'p9' } }, puntos), (e) => Boolean(e.fields?.meetingPoint));
  assert.throws(() => parsePuntoUnion({ meetingPoint: { lat: 40, lng: -3 } }, puntos), (e) => Boolean(e.fields?.meetingPoint));
  assert.throws(() => parsePuntoUnion({ meetingPoint: { lat: 19.7, lng: -101.19, note: 'x'.repeat(161) } }, []), (e) => Boolean(e.fields?.meetingPoint));
  assert.equal(parsePuntoUnion({}, []), null); // viaje sin puntos: opcional
});
