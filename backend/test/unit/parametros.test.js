'use strict';
/** SCRUM-63 · RF-22: validación del factor de emisión (0 < FE < 1). */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost/sin-conexion';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas-0123456789-abcdef';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFactor } = require('../../src/modules/parametros/parametros.service');

test('acepta valores entre 0 y 1 (también como texto)', () => {
  assert.equal(parseFactor({ value: 0.18 }), 0.18);
  assert.equal(parseFactor({ value: '0.192' }), 0.192);
});

test('rechaza 0, 1, negativos, más de 4 decimales y valores no numéricos con 422', () => {
  for (const value of [0, 1, 1.5, -0.1, 0.12345, 'abc', null, undefined]) {
    assert.throws(() => parseFactor({ value }), (e) => e.status === 422 && Boolean(e.fields.value), `value=${value}`);
  }
});
