'use strict';
/** SCRUM-62 · RF-21, RF-22, RNF-32: pruebas unitarias del cálculo de CO₂. */
const test = require('node:test');
const assert = require('node:assert/strict');
const eco = require('../../src/modules/impacto/eco.service');

test('criterio de aceptación: 6.4 km × 0.192 × 2 pasajeros = 2.458 kg', () => {
  assert.equal(eco.calcularCo2(6.4, 0.192, 2), 2.458);
});

test('RF-23: al pasajero se le atribuye su asiento (6.4 × 0.192 = 1.229 kg)', () => {
  assert.equal(eco.co2Pasajero(6.4, 0.192), 1.229);
});

test('RN-07: sin pasajeros, distancia o factor no hay ahorro', () => {
  assert.equal(eco.calcularCo2(6.4, 0.192, 0), 0);
  assert.equal(eco.calcularCo2(0, 0.192, 2), 0);
  assert.equal(eco.calcularCo2(6.4, 0, 2), 0);
});

test('RF-22: con FE 0.180 el mismo viaje da 2.304 kg', () => {
  assert.equal(eco.calcularCo2(6.4, 0.18, 2), 2.304);
});

test('redondeo a 3 decimales como round(x, 3) de PostgreSQL (mitad hacia arriba)', () => {
  assert.equal(eco.redondear3(1.0005), 1.001);
  assert.equal(eco.calcularCo2(4.5, 0.192, 3), 2.592);
  assert.equal(eco.calcularCo2(12.37, 0.1925, 1), 2.381); // 2.381225
});

test('toImpactoDTO convierte la fila de impacto_viaje a números', () => {
  assert.deepEqual(
    eco.toImpactoDTO({ co2_kg: '2.458', pasajeros: 2, distancia_km: '6.40', factor_emision: '0.1920' }),
    { co2Kg: 2.458, passengers: 2, distanceKm: 6.4, emissionFactor: 0.192 },
  );
});
