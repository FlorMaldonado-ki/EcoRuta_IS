'use strict';
/** SCRUM-28 · RF-06, RN-03, RN-12: validación y normalización de vehículos. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseVehiculo, normalizarPlacas, toVehiculoDTO } = require('../../src/modules/vehiculos/vehiculo.mapper');

const valido = { type: 'automovil', brand: 'Nissan', model: 'Versa', year: 2020, color: 'Gris', plates: 'ptx-12 34', capacity: 5, licenseAndInsuranceDeclared: true };

test('normaliza placas: mayúsculas sin espacios, guiones ni puntos', () => {
  assert.equal(normalizarPlacas(' ptx-12 34 '), 'PTX1234');
  assert.equal(normalizarPlacas('a.b.c-123'), 'ABC123');
});

test('un vehículo válido produce las columnas de la tabla', () => {
  assert.deepEqual(parseVehiculo(valido), {
    marca: 'Nissan', modelo: 'Versa', color: 'Gris', tipo: 'automovil', anio: 2020,
    placas: 'PTX1234', capacidad: 5, declaracion_licencia_seguro: true,
  });
});

test('tipo y año son obligatorios al registrar y deben ser válidos', () => {
  assert.throws(() => parseVehiculo({ ...valido, type: undefined, year: undefined }),
    (e) => Boolean(e.fields.type && e.fields.year));
  assert.throws(() => parseVehiculo({ ...valido, type: 'moto' }), (e) => Boolean(e.fields.type));
  assert.throws(() => parseVehiculo({ ...valido, year: 1970 }), (e) => Boolean(e.fields.year));
  assert.throws(() => parseVehiculo({ ...valido, year: new Date().getFullYear() + 2 }), (e) => Boolean(e.fields.year));
});

test('en una edición, tipo/marca/modelo/año se envían juntos para validar la combinación', () => {
  assert.throws(() => parseVehiculo({ model: 'Sentra' }, { parcial: true }),
    (e) => Boolean(e.fields.type && e.fields.brand && e.fields.year && !e.fields.model));
  assert.deepEqual(
    parseVehiculo({ type: 'automovil', brand: 'Nissan', model: 'Sentra', year: 2019 }, { parcial: true }),
    { marca: 'Nissan', modelo: 'Sentra', tipo: 'automovil', anio: 2019 },
  );
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
  assert.equal(dto.type, null); // vehículos registrados antes del catálogo
  assert.equal(dto.year, null);
});
