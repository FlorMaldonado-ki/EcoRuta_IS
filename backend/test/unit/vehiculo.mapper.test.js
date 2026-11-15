'use strict';
/** SCRUM-28 · RF-06, RN-03, RN-12: validación y normalización de vehículos. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseVehiculo, normalizarPlacas, toVehiculoDTO } = require('../../src/modules/vehiculos/vehiculo.mapper');

const valido = { brand: 'Nissan', model: 'Versa', color: 'Gris', plates: 'ptx-12 34', capacity: 5, licenseAndInsuranceDeclared: true };

test('normaliza placas: mayúsculas sin espacios, guiones ni puntos', () => {
  assert.equal(normalizarPlacas(' ptx-12 34 '), 'PTX1234');
  assert.equal(normalizarPlacas('a.b.c-123'), 'ABC123');
});

test('un vehículo válido produce las columnas de la tabla', () => {
  assert.deepEqual(parseVehiculo(valido), {
    marca: 'Nissan', modelo: 'Versa', color: 'Gris', placas: 'PTX1234', capacidad: 5, declaracion_licencia_seguro: true,
  });
});

test('sin la declaración de licencia y seguro → 422 en ese campo (RN-12)', () => {
  for (const v of [false, 'true', undefined]) {
    assert.throws(() => parseVehiculo({ ...valido, licenseAndInsuranceDeclared: v }),
      (e) => Boolean(e.status === 422 && Boolean(e.fields.licenseAndInsuranceDeclared)));
  }
});

test('capacidad fuera de 2–9 y placas inválidas → 422 por campo', () => {
  assert.throws(() => parseVehiculo({ ...valido, capacity: 1, plates: 'AB' }),
    (e) => Boolean(e.fields.capacity && e.fields.plates));
  assert.throws(() => parseVehiculo({ ...valido, capacity: 10 }), (e) => Boolean(e.fields.capacity));
  assert.throws(() => parseVehiculo({ ...valido, plates: "' OR 1=1 --" }), (e) => Boolean(e.fields.plates));
});

test('en una edición solo valida lo que viene y exige al menos un cambio', () => {
  assert.deepEqual(parseVehiculo({ color: 'Azul' }, { parcial: true }), { color: 'Azul' });
  assert.throws(() => parseVehiculo({}, { parcial: true }), (e) => e.status === 422);
  assert.throws(() => parseVehiculo({ licenseAndInsuranceDeclared: false }, { parcial: true }), (e) => Boolean(e.fields.licenseAndInsuranceDeclared));
});

test('el DTO expone maxSeats = capacidad − 1 (RN-03)', () => {
  const dto = toVehiculoDTO({ id: 'x', marca: 'a', modelo: 'b', color: 'c', placas: 'ABC123', capacidad: 5, declaracion_licencia_seguro: true, activo: true, creado_en: new Date() });
  assert.equal(dto.maxSeats, 4);
  assert.equal(dto.plates, 'ABC123');
});
