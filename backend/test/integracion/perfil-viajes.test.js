'use strict';
/** SCRUM-45 (perfil), SCRUM-30 (publicar), SCRUM-32 (detalle), SCRUM-34 (búsqueda), SCRUM-23 (cancelar viaje). */
const { omitir } = require('../helpers/entorno');
const test = require('node:test');
const assert = require('node:assert/strict');

test('perfil y viajes', { skip: omitir }, async (t) => {
  const { crearContexto, pool } = require('../helpers/fixtures');
  const { iniciarServidor } = require('../helpers/http');
  const { hoyLocal } = require('../../src/modules/viajes/viaje.mapper');
  const ctx = crearContexto();
  const api = await iniciarServidor();
  t.after(async () => { await ctx.limpiar(); await api.cerrar(); await pool.end(); });

  const conductor = await ctx.usuario({ nombre: 'Conductor Prueba', telefono: '4439998877' });
  const pasajero = await ctx.usuario({ nombre: 'Pasajera Prueba', telefono: '4431112233' });
  const otro = await ctx.usuario({ nombre: 'Otro Prueba' });
  const veh = await ctx.vehiculo(conductor.id, { capacidad: 4 });

  await t.test('PATCH /api/me con teléfono válido → 200; el correo no cambia', async () => {
    const r = await api.pedir('PATCH', '/api/me', { token: pasajero.token, body: { phone: '443 222 3344', email: 'hack@gmail.com', status: 'suspended' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.phone, '4432223344');
    assert.equal(r.body.email, pasajero.correo);
    assert.equal(r.body.status, 'active');
    const invalido = await api.pedir('PATCH', '/api/me', { token: pasajero.token, body: { phone: '123' } });
    assert.equal(invalido.status, 422);
    assert.ok(invalido.body.fields.phone);
  });

  const salida = new Date(Date.now() + 3 * 3600_000);
  const publicar = (extra = {}) => api.pedir('POST', '/api/viajes', {
    token: conductor.token,
    body: { vehicleId: veh.id, direction: 'to_campus', campusPoint: 'campus_1',
      origin: { text: 'Plaza Las Américas', lat: 19.7039, lng: -101.1924 }, departureAt: salida.toISOString(), seats: 2, ...extra },
  });
  let viaje;

  await t.test('POST /api/viajes válido → 201 con distancia estimada y punto del campus de parametro', async () => {
    const r = await publicar({ destination: { text: 'Falso', lat: 19.5, lng: -101.5 } });
    assert.equal(r.status, 201);
    viaje = r.body;
    assert.equal(viaje.status, 'published');
    assert.equal(viaje.seatsAvailable, 2);
    assert.ok(viaje.distanceKm > 0);
    assert.equal(viaje.distanceSource, 'haversine');
    assert.equal(viaje.destination.lat, 19.7217);
  });

  await t.test('POST /api/viajes inválido → 422 con fields; vehículo ajeno → 422 en vehicleId', async () => {
    const r = await publicar({ seats: 9, departureAt: new Date(Date.now() + 10 * 60_000).toISOString() });
    assert.equal(r.status, 422);
    assert.ok(r.body.fields.seats && r.body.fields.departureAt);
    const ajeno = await api.pedir('POST', '/api/viajes', { token: otro.token, body: { vehicleId: veh.id, direction: 'to_campus', campusPoint: 'campus_1',
      origin: { text: 'X', lat: 19.70, lng: -101.19 }, departureAt: salida.toISOString(), seats: 1 } });
    assert.equal(ajeno.status, 422);
    assert.ok(ajeno.body.fields.vehicleId);
    const capacidad = await publicar({ seats: 4 }); // vehículo de 4 plazas → máx. 3 asientos
    assert.equal(capacidad.status, 422);
    assert.ok(capacidad.body.fields.seats);
  });

  await t.test('GET /api/viajes/:id sin reserva aceptada no incluye teléfono ni placas', async () => {
    const r = await api.pedir('GET', `/api/viajes/${viaje.id}`, { token: pasajero.token });
    assert.equal(r.status, 200);
    assert.equal(r.body.driver.phone, undefined);
    assert.equal(r.body.vehicle.plates, undefined);
    assert.equal(r.body.myReservation, null);
    assert.equal(r.body.pendingRequests, undefined);
    assert.equal((await api.pedir('GET', '/api/viajes/123', { token: pasajero.token })).status, 404);
    assert.equal((await api.pedir('GET', '/api/viajes/00000000-0000-4000-8000-000000000000', { token: pasajero.token })).status, 404);
  });

  await t.test('GET /api/viajes busca publicados, futuros, por cercanía y sin mis propios viajes', async () => {
    const q = `direction=to_campus&date=${hoyLocal(salida)}&lat=19.7045&lng=-101.1920&radiusKm=1`;
    const r = await api.pedir('GET', `/api/viajes?${q}`, { token: pasajero.token });
    assert.equal(r.status, 200);
    const encontrado = r.body.items.find((v) => v.id === viaje.id);
    assert.ok(encontrado, 'el viaje debe aparecer');
    assert.ok(encontrado.distanceFromYouKm < 1);
    assert.equal(r.body.pageSize, 20);
    const lejos = await api.pedir('GET', `/api/viajes?direction=to_campus&date=${hoyLocal(salida)}&lat=19.65&lng=-101.25&radiusKm=1`, { token: pasajero.token });
    assert.ok(!lejos.body.items.some((v) => v.id === viaje.id));
    const propios = await api.pedir('GET', `/api/viajes?${q}`, { token: conductor.token });
    assert.ok(!propios.body.items.some((v) => v.id === viaje.id));
    const otroSentido = await api.pedir('GET', `/api/viajes?direction=from_campus&date=${hoyLocal(salida)}`, { token: pasajero.token });
    assert.ok(!otroSentido.body.items.some((v) => v.id === viaje.id));
  });

  await t.test('cancelar viaje: ajeno → 403; propio → reservas canceladas en la misma transacción', async () => {
    const res = await api.pedir('POST', `/api/viajes/${viaje.id}/reservas`, { token: pasajero.token });
    assert.equal(res.status, 201);
    await api.pedir('PATCH', `/api/reservas/${res.body.id}`, { token: conductor.token, body: { action: 'accept' } });
    const res2 = await api.pedir('POST', `/api/viajes/${viaje.id}/reservas`, { token: otro.token });
    assert.equal(res2.status, 201);

    assert.equal((await api.pedir('POST', `/api/viajes/${viaje.id}/cancelar`, { token: pasajero.token })).status, 403);
    const r = await api.pedir('POST', `/api/viajes/${viaje.id}/cancelar`, { token: conductor.token });
    assert.equal(r.status, 200);
    assert.equal(r.body.trip.status, 'cancelled');
    assert.equal(r.body.cancelledReservations, 2);
    assert.equal(r.body.trip.seatsAvailable, 2);
    const { rows } = await pool.query(`SELECT estado FROM reserva WHERE viaje_id = $1`, [viaje.id]);
    assert.ok(rows.every((x) => x.estado === 'cancelada'));
    const busqueda = await api.pedir('GET', `/api/viajes?direction=to_campus&date=${hoyLocal(salida)}`, { token: pasajero.token });
    assert.ok(!busqueda.body.items.some((v) => v.id === viaje.id));
  });

  await t.test('cancelar un viaje finalizado → 409', async () => {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 1 });
    await pool.query(`UPDATE viaje SET salida_en = now() - interval '1 hour', estado = 'finalizado', finalizado_en = now() WHERE id = $1`, [v.id]);
    const r = await api.pedir('POST', `/api/viajes/${v.id}/cancelar`, { token: conductor.token });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'VIAJE_FINALIZADO');
  });
});
