'use strict';
/** SCRUM-35 (solicitar), SCRUM-37 (aceptar/rechazar), SCRUM-41 (mis viajes), SCRUM-44 (cancelar mi lugar), SCRUM-39 (concurrencia). */
const { omitir } = require('../helpers/entorno');
const test = require('node:test');
const assert = require('node:assert/strict');

test('reservas', { skip: omitir }, async (t) => {
  const { crearContexto, pool } = require('../helpers/fixtures');
  const { iniciarServidor } = require('../helpers/http');
  const reservas = require('../../src/modules/reservas/reservas.service');
  const ctx = crearContexto();
  const api = await iniciarServidor();
  t.after(async () => { await ctx.limpiar(); await api.cerrar(); await pool.end(); });

  const conductor = await ctx.usuario({ nombre: 'Conductor Reservas', telefono: '4430001111' });
  const carla = await ctx.usuario({ nombre: 'Carla Reservas', telefono: '4432223333' });
  const mario = await ctx.usuario({ nombre: 'Mario Reservas' });
  const pendiente = await ctx.usuario({ nombre: 'Sin Verificar', estado: 'pendiente' });
  const veh = await ctx.vehiculo(conductor.id);
  const asientos = async (id) => (await pool.query('SELECT asientos_disponibles FROM viaje WHERE id = $1', [id])).rows[0].asientos_disponibles;

  await t.test('solicitar lugar válido → 201 solicitada; casos inválidos con su código', async () => {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 240 });
    const r = await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: carla.token });
    assert.equal(r.status, 201);
    assert.equal(r.body.status, 'requested');
    assert.equal((await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: carla.token })).body.error, 'RESERVA_DUPLICADA');
    assert.equal((await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: conductor.token })).body.error, 'RESERVA_PROPIA');
    const p = await reservas.solicitar(v.id, pendiente.id).catch((e) => e);
    assert.match(p.message, /^PASAJERO_NO_ACTIVO/); // trigger de la BD → 403 en errorHandler
    assert.equal((await api.pedir('POST', '/api/viajes/00000000-0000-4000-8000-000000000000/reservas', { token: carla.token })).status, 404);
    const cancelado = await ctx.viaje(conductor.id, veh.id, { minutos: 600 });
    await pool.query(`UPDATE viaje SET estado = 'cancelado', cancelado_en = now() WHERE id = $1`, [cancelado.id]);
    assert.equal((await api.pedir('POST', `/api/viajes/${cancelado.id}/reservas`, { token: carla.token })).body.error, 'VIAJE_NO_DISPONIBLE');
  });

  await t.test('RN-05: otra reserva vigente a ±60 min → 409 RESERVA_TRASLAPADA; a 2 h sí se permite', async () => {
    const a = await ctx.viaje(conductor.id, veh.id, { minutos: 1000 });
    const b = await ctx.viaje(conductor.id, veh.id, { minutos: 1040 });
    const c = await ctx.viaje(conductor.id, veh.id, { minutos: 1160 });
    assert.equal((await api.pedir('POST', `/api/viajes/${a.id}/reservas`, { token: mario.token })).status, 201);
    const r = await api.pedir('POST', `/api/viajes/${b.id}/reservas`, { token: mario.token });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'RESERVA_TRASLAPADA');
    assert.equal((await api.pedir('POST', `/api/viajes/${c.id}/reservas`, { token: mario.token })).status, 201);
  });

  await t.test('listar solicitudes: solo el conductor; aceptar descuenta un asiento; ajeno → 404', async () => {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 2000, asientos: 2 });
    const sol = await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: carla.token });
    const lista = await api.pedir('GET', `/api/viajes/${v.id}/reservas`, { token: conductor.token });
    assert.equal(lista.status, 200);
    assert.equal(lista.body[0].passenger.fullName, 'Carla Reservas');
    assert.equal(lista.body[0].passenger.phone, undefined); // aún no aceptada (RNF-12)
    assert.equal((await api.pedir('GET', `/api/viajes/${v.id}/reservas`, { token: carla.token })).status, 404);

    assert.equal((await api.pedir('PATCH', `/api/reservas/${sol.body.id}`, { token: carla.token, body: { action: 'accept' } })).status, 404);
    const r = await api.pedir('PATCH', `/api/reservas/${sol.body.id}`, { token: conductor.token, body: { action: 'accept' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'accepted');
    assert.equal(r.body.trip.seatsAvailable, 1);
    assert.equal(r.body.passenger.phone, '4432223333');
    assert.equal(await asientos(v.id), 1);
    assert.equal((await api.pedir('PATCH', `/api/reservas/${sol.body.id}`, { token: conductor.token, body: { action: 'reject' } })).status, 409);

    const detalle = await api.pedir('GET', `/api/viajes/${v.id}`, { token: carla.token });
    assert.equal(detalle.body.driver.phone, '4430001111');
    assert.ok(detalle.body.vehicle.plates);
    assert.equal(detalle.body.myReservation.status, 'accepted');
  });

  await t.test('rechazar no toca los asientos', async () => {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 3000, asientos: 1 });
    const sol = await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: mario.token });
    const r = await api.pedir('PATCH', `/api/reservas/${sol.body.id}`, { token: conductor.token, body: { action: 'reject' } });
    assert.equal(r.body.status, 'rejected');
    assert.equal(await asientos(v.id), 1);
  });

  await t.test('RN-06: cancelar a 2 h → no tardía y recupera el asiento; a 10 min → tardía; solo solicitada → no tardía', async () => {
    const aTiempo = await ctx.viaje(conductor.id, veh.id, { minutos: 4000, asientos: 2 });
    const s1 = await api.pedir('POST', `/api/viajes/${aTiempo.id}/reservas`, { token: carla.token });
    await api.pedir('PATCH', `/api/reservas/${s1.body.id}`, { token: conductor.token, body: { action: 'accept' } });
    await pool.query(`UPDATE viaje SET salida_en = now() + interval '2 hours' WHERE id = $1`, [aTiempo.id]);
    assert.equal((await api.pedir('POST', `/api/reservas/${s1.body.id}/cancelar`, { token: mario.token })).status, 404);
    const c1 = await api.pedir('POST', `/api/reservas/${s1.body.id}/cancelar`, { token: carla.token });
    assert.equal(c1.status, 200);
    assert.equal(c1.body.status, 'cancelled');
    assert.equal(c1.body.lateCancellation, false);
    assert.equal(await asientos(aTiempo.id), 2);

    const tarde = await ctx.viaje(conductor.id, veh.id, { minutos: 5000, asientos: 2 });
    const s2 = await api.pedir('POST', `/api/viajes/${tarde.id}/reservas`, { token: carla.token });
    await api.pedir('PATCH', `/api/reservas/${s2.body.id}`, { token: conductor.token, body: { action: 'accept' } });
    await pool.query(`UPDATE viaje SET salida_en = now() + interval '10 minutes' WHERE id = $1`, [tarde.id]);
    const c2 = await api.pedir('POST', `/api/reservas/${s2.body.id}/cancelar`, { token: carla.token });
    assert.equal(c2.body.lateCancellation, true);
    assert.equal(await asientos(tarde.id), 2);

    const solicitada = await ctx.viaje(conductor.id, veh.id, { minutos: 6000, asientos: 2 });
    const s3 = await api.pedir('POST', `/api/viajes/${solicitada.id}/reservas`, { token: mario.token });
    await pool.query(`UPDATE viaje SET salida_en = now() + interval '5 minutes' WHERE id = $1`, [solicitada.id]);
    const c3 = await api.pedir('POST', `/api/reservas/${s3.body.id}/cancelar`, { token: mario.token });
    assert.equal(c3.body.lateCancellation, false);
    assert.equal(c3.body.previousStatus, 'requested');
    assert.equal((await api.pedir('POST', `/api/reservas/${s3.body.id}/cancelar`, { token: mario.token })).status, 409);
  });

  await t.test('GET /api/me/viajes filtra por rol y estado, con paginación', async () => {
    const yo = await ctx.usuario({ nombre: 'Mis Viajes Prueba' });
    const vehYo = await ctx.vehiculo(yo.id);
    const futuro = await ctx.viaje(yo.id, vehYo.id, { minutos: 300 });
    const pasado = await ctx.viaje(yo.id, vehYo.id, { minutos: 1 });
    await pool.query(`UPDATE viaje SET salida_en = now() - interval '3 hours' WHERE id = $1`, [pasado.id]);
    const ajeno = await ctx.viaje(conductor.id, veh.id, { minutos: 7000 });
    await api.pedir('POST', `/api/viajes/${ajeno.id}/reservas`, { token: yo.token });

    const ids = async (q) => (await api.pedir('GET', `/api/me/viajes?${q}`, { token: yo.token })).body.items.map((i) => i.id);
    assert.deepEqual(await ids('role=driver&status=upcoming'), [futuro.id]);
    assert.deepEqual(await ids('role=driver&status=history'), [pasado.id]);
    assert.deepEqual(await ids('role=driver&status=in_progress'), []);
    assert.deepEqual(await ids('role=passenger&status=upcoming'), [ajeno.id]);
    assert.deepEqual(await ids('role=passenger&status=history'), []);
    const r = await api.pedir('GET', '/api/me/viajes?role=driver&status=upcoming', { token: yo.token });
    assert.equal(r.body.items[0].pendingRequests, 0);
    assert.equal(r.body.hasMore, false);
    assert.equal((await api.pedir('GET', '/api/me/viajes?role=admin', { token: yo.token })).status, 422);
  });

  await t.test('SCRUM-39 · RNF-28: 2 aceptaciones simultáneas del último asiento, 20 corridas con 15 lecturas de fondo', async () => {
    let unaAceptada = 0;
    for (let corrida = 0; corrida < 20; corrida++) {
      const v = await ctx.viaje(conductor.id, veh.id, { minutos: 8000 + corrida * 200, asientos: 1 });
      const r1 = await reservas.solicitar(v.id, carla.id);
      const r2 = await reservas.solicitar(v.id, mario.id);
      const lecturas = Array.from({ length: 15 }, () => api.pedir('GET', `/api/viajes/${v.id}`, { token: carla.token }));
      const resultados = await Promise.allSettled([
        reservas.responder(r1.id, conductor.id, { action: 'accept' }),
        reservas.responder(r2.id, conductor.id, { action: 'accept' }),
      ]);
      await Promise.all(lecturas);
      const ok = resultados.filter((x) => x.status === 'fulfilled');
      const ko = resultados.filter((x) => x.status === 'rejected');
      assert.equal(ok.length, 1, `corrida ${corrida}: debe aceptarse exactamente una`);
      assert.match(ko[0].reason.message, /^SIN_ASIENTOS/); // trigger → 409 en errorHandler
      assert.equal(await asientos(v.id), 0);
      const { rows } = await pool.query(`SELECT count(*) FILTER (WHERE estado = 'aceptada') AS n FROM reserva WHERE viaje_id = $1`, [v.id]);
      assert.equal(rows[0].n, 1);
      unaAceptada++;
    }
    assert.equal(unaAceptada, 20);
  });
});
