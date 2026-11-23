'use strict';
/**
 * SCRUM-52 (RF-19 finalizar), SCRUM-53 (RF-21/22 CO₂ y factor de emisión),
 * SCRUM-54 (RF-23 Mi impacto) y SCRUM-55 (RF-24 total comunitario).
 * Los casos siguen los criterios de aceptación de cada historia en Jira.
 */
const { omitir } = require('../helpers/entorno');
const test = require('node:test');
const assert = require('node:assert/strict');

test('finalizar viaje y CO₂', { skip: omitir }, async (t) => {
  const { crearContexto, pool } = require('../helpers/fixtures');
  const { iniciarServidor } = require('../helpers/http');
  const correos = require('../../src/modules/notificaciones/correos.service');
  const mailer = require('../../src/shared/mailer');
  const enviarOriginal = mailer.enviarSeguro;
  mailer.enviarSeguro = async () => true; // estas pruebas no revisan correos
  const ctx = crearContexto();
  const api = await iniciarServidor();
  const factorOriginal = (await pool.query(`SELECT valor FROM parametro WHERE clave = 'factor_emision_kg_km'`)).rows[0].valor;
  t.after(async () => {
    await pool.query(`UPDATE parametro SET valor = $1::jsonb WHERE clave = 'factor_emision_kg_km'`, [JSON.stringify(factorOriginal)]);
    await correos.esperar();
    mailer.enviarSeguro = enviarOriginal;
    await ctx.limpiar(); await api.cerrar(); await pool.end();
  });

  const conductor = await ctx.usuario({ nombre: 'Conductor Finaliza' });
  const carla = await ctx.usuario({ nombre: 'Carla Finaliza' });
  const mario = await ctx.usuario({ nombre: 'Mario Finaliza' });
  const nuevo = await ctx.usuario({ nombre: 'Sin Viajes' });
  const admin = await ctx.usuario({ nombre: 'Admin Prueba', rol: 'admin' });
  const veh = await ctx.vehiculo(conductor.id);

  /** Viaje futuro con N pasajeros aceptados vía API; después se "adelanta" la salida al pasado. */
  async function viajeTerminado({ pasajeros = [], distanciaKm = 6.4, minutos = 300 } = {}) {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos, asientos: 3 });
    for (const p of pasajeros) {
      const r = await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: p.token });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal((await api.pedir('PATCH', `/api/reservas/${r.body.id}`, { token: conductor.token, body: { action: 'accept' } })).status, 200);
    }
    await pool.query(`UPDATE viaje SET salida_en = now() - interval '10 minutes', distancia_km = $2 WHERE id = $1`, [v.id, distanciaKm]);
    return v;
  }
  const comunidad = async () => (await api.pedir('GET', '/api/impacto/comunidad')).body;

  await t.test('sin viajes finalizados: Mi impacto en 0 y lista vacía', async () => {
    const r = await api.pedir('GET', '/api/impacto/me', { token: nuevo.token });
    assert.equal(r.status, 200);
    assert.equal(r.body.co2TotalKg, 0);
    assert.equal(r.body.co2TodayKg, 0);
    assert.deepEqual(r.body.asDriver, { co2TotalKg: 0, co2TodayKg: 0, trips: 0 });
    const l = await api.pedir('GET', '/api/impacto/me/viajes', { token: nuevo.token });
    assert.deepEqual(l.body.items, []);
    assert.equal(l.body.hasMore, false);
  });

  await t.test('6.4 km con 2 pasajeros y FE 0.192 → finalizado y 2.458 kg en la misma transacción', async () => {
    const antes = await comunidad();
    const v = await viajeTerminado({ pasajeros: [carla, mario] });
    const r = await api.pedir('POST', `/api/viajes/${v.id}/finalizar`, { token: conductor.token });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.trip.status, 'finished');
    assert.ok(r.body.trip.finishedAt);
    assert.deepEqual(r.body.impact, { co2Kg: 2.458, passengers: 2, distanceKm: 6.4, emissionFactor: 0.192 });
    const fila = (await pool.query('SELECT co2_kg FROM impacto_viaje WHERE viaje_id = $1', [v.id])).rows[0];
    assert.equal(fila.co2_kg, 2.458);

    // SCRUM-55: el total comunitario ya incluye el viaje (RF-26: sin reiniciar nada)
    const despues = await comunidad();
    assert.equal(Math.round((despues.co2SavedKg - antes.co2SavedKg) * 1000) / 1000, 2.458);
    assert.equal(despues.sharedTrips - antes.sharedTrips, 1);
    assert.equal(Math.round((despues.kmAvoided - antes.kmAvoided) * 100) / 100, 12.8);

    // SCRUM-64: el detalle del viaje finalizado trae el CO₂ que ahorró
    const det = await api.pedir('GET', `/api/viajes/${v.id}`, { token: carla.token });
    assert.equal(det.body.impact.co2Kg, 2.458);
    assert.equal(det.body.impact.passengerCo2Kg, 1.229);
    const hist = await api.pedir('GET', '/api/me/viajes?role=driver&status=history', { token: conductor.token });
    assert.equal(hist.body.items.find((x) => x.id === v.id).impact.co2Kg, 2.458);
    const histP = await api.pedir('GET', '/api/me/viajes?role=passenger&status=history', { token: mario.token });
    assert.equal(histP.body.items.find((x) => x.id === v.id).impact.co2Kg, 2.458);
  });

  await t.test('Mi impacto: pasajero 1.229 kg hoy y total; conductor 2.458 kg como conductor', async () => {
    const p = (await api.pedir('GET', '/api/impacto/me', { token: carla.token })).body;
    assert.equal(p.co2TodayKg, 1.229);
    assert.equal(p.co2TotalKg, 1.229);
    assert.equal(p.asPassenger.co2TotalKg, 1.229);
    assert.equal(p.asDriver.trips, 0);
    const c = (await api.pedir('GET', '/api/impacto/me', { token: conductor.token })).body;
    assert.equal(c.asDriver.co2TotalKg, 2.458);
    assert.equal(c.co2TodayKg, 2.458);
    const l = (await api.pedir('GET', '/api/impacto/me/viajes', { token: carla.token })).body;
    assert.equal(l.items.length, 1);
    assert.equal(l.items[0].role, 'passenger');
    assert.equal(l.items[0].co2Kg, 1.229);
    assert.equal(l.items[0].origin, 'Origen prueba');
  });

  await t.test('un viaje calculado ayer (hora de CDMX) no suma en "Hoy"', async () => {
    const v = await viajeTerminado({ pasajeros: [mario], distanciaKm: 5 });
    await api.pedir('POST', `/api/viajes/${v.id}/finalizar`, { token: conductor.token });
    await pool.query(`UPDATE impacto_viaje SET calculado_en = now() - interval '1 day' WHERE viaje_id = $1`, [v.id]);
    const m = (await api.pedir('GET', '/api/impacto/me', { token: mario.token })).body;
    assert.equal(m.co2TodayKg, 1.229);                       // solo el de hoy
    assert.equal(m.co2TotalKg, Math.round((1.229 + 0.96) * 1000) / 1000); // 5 × 0.192 = 0.96
  });

  await t.test('sin pasajeros aceptados: queda finalizado sin registro de CO₂ (RN-07)', async () => {
    const v = await viajeTerminado({ pasajeros: [] });
    const r = await api.pedir('POST', `/api/viajes/${v.id}/finalizar`, { token: conductor.token });
    assert.equal(r.status, 200);
    assert.equal(r.body.trip.status, 'finished');
    assert.equal(r.body.impact, null);
    assert.equal(r.body.trip.impact, null);
    assert.equal((await pool.query('SELECT 1 FROM impacto_viaje WHERE viaje_id = $1', [v.id])).rowCount, 0);
  });

  await t.test('antes de la hora de salida → 409 VIAJE_AUN_NO_SALE; ajeno → 404; cancelado o ya finalizado → 409', async () => {
    const futuro = await ctx.viaje(conductor.id, veh.id, { minutos: 120 });
    const r = await api.pedir('POST', `/api/viajes/${futuro.id}/finalizar`, { token: conductor.token });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'VIAJE_AUN_NO_SALE');

    const v = await viajeTerminado();
    assert.equal((await api.pedir('POST', `/api/viajes/${v.id}/finalizar`, { token: carla.token })).status, 404);
    assert.equal((await api.pedir('POST', '/api/viajes/00000000-0000-4000-8000-000000000000/finalizar', { token: conductor.token })).status, 404);
    assert.equal((await api.pedir('POST', `/api/viajes/${v.id}/finalizar`, { token: conductor.token })).status, 200);
    const otra = await api.pedir('POST', `/api/viajes/${v.id}/finalizar`, { token: conductor.token });
    assert.equal(otra.status, 409);
    assert.equal(otra.body.error, 'VIAJE_YA_FINALIZADO');

    const cancelado = await ctx.viaje(conductor.id, veh.id, { minutos: -30 });
    await pool.query(`UPDATE viaje SET estado = 'cancelado', cancelado_en = now() WHERE id = $1`, [cancelado.id]);
    const c = await api.pedir('POST', `/api/viajes/${cancelado.id}/finalizar`, { token: conductor.token });
    assert.equal(c.status, 409);
    assert.equal(c.body.error, 'VIAJE_CANCELADO');
  });

  await t.test('factor de emisión: GET para todos; PATCH solo admin, 0 < FE < 1; el nuevo FE solo aplica a viajes nuevos', async () => {
    const viejo = await viajeTerminado({ pasajeros: [carla] });
    await api.pedir('POST', `/api/viajes/${viejo.id}/finalizar`, { token: conductor.token });

    const g = await api.pedir('GET', '/api/parametros/factor-emision', { token: carla.token });
    assert.equal(g.status, 200);
    assert.equal(g.body.value, 0.192);

    const noAdmin = await api.pedir('PATCH', '/api/parametros/factor-emision', { token: carla.token, body: { value: 0.18 } });
    assert.equal(noAdmin.status, 403);
    for (const value of [0, 1, 2, 'abc']) {
      const r = await api.pedir('PATCH', '/api/parametros/factor-emision', { token: admin.token, body: { value } });
      assert.equal(r.status, 422, `value=${value}`);
      assert.ok(r.body.fields.value);
    }
    const ok = await api.pedir('PATCH', '/api/parametros/factor-emision', { token: admin.token, body: { value: 0.18 } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.value, 0.18);
    assert.equal(ok.body.updatedBy, admin.id);

    const v = await viajeTerminado({ pasajeros: [carla, mario] });
    const r = await api.pedir('POST', `/api/viajes/${v.id}/finalizar`, { token: conductor.token });
    assert.equal(r.body.impact.emissionFactor, 0.18);
    assert.equal(r.body.impact.co2Kg, 2.304);
    const anterior = (await pool.query('SELECT factor_emision FROM impacto_viaje WHERE viaje_id = $1', [viejo.id])).rows[0];
    assert.equal(anterior.factor_emision, 0.192); // los viajes anteriores conservan su FE
    assert.equal((await api.pedir('GET', '/api/parametros/factor-emision')).status, 401);
  });
});
