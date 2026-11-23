'use strict';
/** SCRUM-58 · RF-13 (HU-18): editar un viaje publicado sin reservas aceptadas. */
const { omitir } = require('../helpers/entorno');
const test = require('node:test');
const assert = require('node:assert/strict');

test('editar viaje', { skip: omitir }, async (t) => {
  const { crearContexto, pool } = require('../helpers/fixtures');
  const { iniciarServidor } = require('../helpers/http');
  const correos = require('../../src/modules/notificaciones/correos.service');
  const mailer = require('../../src/shared/mailer');
  const enviarOriginal = mailer.enviarSeguro;
  mailer.enviarSeguro = async () => true;
  const ctx = crearContexto();
  const api = await iniciarServidor();
  t.after(async () => { await correos.esperar(); mailer.enviarSeguro = enviarOriginal; await ctx.limpiar(); await api.cerrar(); await pool.end(); });

  const conductor = await ctx.usuario({ nombre: 'Conductor Edita' });
  const carla = await ctx.usuario({ nombre: 'Carla Edita' });
  const veh = await ctx.vehiculo(conductor.id, { capacidad: 5 }); // máximo 4 asientos (RN-03)
  const enHoras = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
  const editar = (id, body, token = conductor.token) => api.pedir('PATCH', `/api/viajes/${id}`, { token, body });

  await t.test('sin reservas aceptadas: cambiar la hora a una válida → 200 con la nueva hora', async () => {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 300 });
    const nueva = enHoras(8);
    const r = await editar(v.id, { departureAt: nueva });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(new Date(r.body.departureAt).toISOString(), nueva);
    assert.equal(r.body.isMine, true);
  });

  await t.test('con una solicitud pendiente (no aceptada) sí se puede editar', async () => {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 400 });
    assert.equal((await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: carla.token })).status, 201);
    assert.equal((await editar(v.id, { notes: 'Salgo puntual' })).status, 200);
  });

  await t.test('con al menos una reserva aceptada → 409 VIAJE_CON_RESERVAS', async () => {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 600 });
    const s = await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: carla.token });
    await api.pedir('PATCH', `/api/reservas/${s.body.id}`, { token: conductor.token, body: { action: 'accept' } });
    const r = await editar(v.id, { departureAt: enHoras(12) });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'VIAJE_CON_RESERVAS');
    assert.match(r.body.message, /cancélalo/);
  });

  await t.test('cambiar el punto de salida recalcula distancia y duración (RF-10)', async () => {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 700 }); // distancia fija de 4.5 en el fixture
    const r = await editar(v.id, { origin: { text: 'Salida nueva', lat: 19.68, lng: -101.22 } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.origin.text, 'Salida nueva');
    assert.notEqual(r.body.distanceKm, 4.5);
    assert.ok(r.body.distanceKm > 0);
    assert.ok(r.body.durationMin > 0);
    assert.equal(r.body.distanceSource, 'haversine'); // ROUTING_PROVIDER de las pruebas
    assert.match(r.body.destination.text, /^Campus 1/);  // el extremo del campus se toma del catálogo (RN-11)
  });

  await t.test('más asientos que capacidad − 1 → 422; cambiar asientos reinicia los disponibles', async () => {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 800, asientos: 2 });
    const r = await editar(v.id, { seats: 5 });
    assert.equal(r.status, 422);
    assert.equal(r.body.error, 'ASIENTOS_EXCEDEN_CAPACIDAD');
    assert.ok(r.body.fields.seats);
    const ok = await editar(v.id, { seats: 4 });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.seatsTotal, 4);
    assert.equal(ok.body.seatsAvailable, 4);
  });

  await t.test('validaciones de publicar: menos de 30 min → 422; cuerpo vacío → 422', async () => {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 900 });
    const r = await editar(v.id, { departureAt: enHoras(0.2) });
    assert.equal(r.status, 422);
    assert.ok(r.body.fields.departureAt);
    assert.equal((await editar(v.id, {})).status, 422);
  });

  await t.test('no soy el conductor → 404; viaje cancelado o que ya salió → 409 VIAJE_NO_EDITABLE', async () => {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 1000 });
    assert.equal((await editar(v.id, { notes: 'x' }, carla.token)).status, 404);
    assert.equal((await editar('00000000-0000-4000-8000-000000000000', { notes: 'x' })).status, 404);
    await pool.query(`UPDATE viaje SET estado = 'cancelado', cancelado_en = now() WHERE id = $1`, [v.id]);
    const c = await editar(v.id, { notes: 'x' });
    assert.equal(c.status, 409);
    assert.equal(c.body.error, 'VIAJE_NO_EDITABLE');
    const pasado = await ctx.viaje(conductor.id, veh.id, { minutos: -5 });
    assert.equal((await editar(pasado.id, { notes: 'x' })).body.error, 'VIAJE_NO_EDITABLE');
  });
});
