'use strict';
/** SCRUM-70 · RF-20: correos de reservas y cancelaciones, y RNF-29 (si el correo falla, la operación sigue). */
const { omitir } = require('../helpers/entorno');
const test = require('node:test');
const assert = require('node:assert/strict');

test('correos de reservas', { skip: omitir }, async (t) => {
  const { crearContexto, pool } = require('../helpers/fixtures');
  const { iniciarServidor } = require('../helpers/http');
  const correos = require('../../src/modules/notificaciones/correos.service');
  const mailer = require('../../src/shared/mailer');
  const enviarOriginal = mailer.enviarSeguro;
  let enviados = [];
  let falla = false;
  mailer.enviarSeguro = async (msg) => {
    if (falla) { console.error('[prueba] servidor de correo caído'); return false; }
    enviados.push(msg);
    return true;
  };
  const ctx = crearContexto();
  const api = await iniciarServidor();
  t.after(async () => { await correos.esperar(); mailer.enviarSeguro = enviarOriginal; await ctx.limpiar(); await api.cerrar(); await pool.end(); });

  const conductor = await ctx.usuario({ nombre: 'Ana Correos', telefono: '4431112222' });
  const carla = await ctx.usuario({ nombre: 'Carla Correos' });
  const mario = await ctx.usuario({ nombre: 'Mario Correos' });
  const veh = await ctx.vehiculo(conductor.id);
  const listo = async () => { await correos.esperar(); const e = enviados; enviados = []; return e; };
  const correoDe = async (id) => (await pool.query('SELECT correo FROM usuario WHERE id = $1', [id])).rows[0].correo;

  await t.test('solicitar lugar → correo al conductor con el nombre del pasajero y el viaje', async () => {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 300 });
    const r = await api.pedir('POST', `/api/viajes/${v.id}/reservas`, {
      token: carla.token, body: { meetingPoint: { name: 'OXXO Camelinas', lat: 19.69, lng: -101.18 } },
    });
    assert.equal(r.status, 201);
    const e = await listo();
    assert.equal(e.length, 1);
    assert.equal(e[0].to, await correoDe(conductor.id));
    assert.match(e[0].subject, /Carla Correos/);
    assert.match(e[0].text, /Origen prueba → Destino prueba/);

    // aceptar → correo al pasajero con el punto exacto de encuentro
    assert.equal((await api.pedir('PATCH', `/api/reservas/${r.body.id}`, { token: conductor.token, body: { action: 'accept' } })).status, 200);
    const a = await listo();
    assert.equal(a.length, 1);
    assert.equal(a[0].to, await correoDe(carla.id));
    assert.match(a[0].subject, /confirmado/);
    assert.match(a[0].text, /Punto de encuentro: OXXO Camelinas/);
    assert.match(a[0].text, /4431112222/);
  });

  await t.test('rechazar → correo al pasajero sin punto de encuentro', async () => {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 500 });
    const r = await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: mario.token });
    await listo();
    await api.pedir('PATCH', `/api/reservas/${r.body.id}`, { token: conductor.token, body: { action: 'reject' } });
    const e = await listo();
    assert.equal(e.length, 1);
    assert.equal(e[0].to, await correoDe(mario.id));
    assert.match(e[0].subject, /no fue aceptada/);
  });

  await t.test('cancelar un viaje con 2 reservas → los 2 pasajeros reciben correo', async () => {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 900 });
    const c1 = await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: carla.token });
    await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: mario.token });
    await api.pedir('PATCH', `/api/reservas/${c1.body.id}`, { token: conductor.token, body: { action: 'accept' } });
    await listo();
    const r = await api.pedir('POST', `/api/viajes/${v.id}/cancelar`, { token: conductor.token });
    assert.equal(r.body.cancelledReservations, 2);
    const e = await listo();
    assert.deepEqual(e.map((m) => m.to).sort(), [await correoDe(carla.id), await correoDe(mario.id)].sort());
    assert.ok(e.every((m) => /canceló el viaje/.test(m.text)));
  });

  await t.test('el pasajero cancela su lugar → correo al conductor; si es tardía, lo indica', async () => {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 1300 });
    const s = await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: carla.token });
    await api.pedir('PATCH', `/api/reservas/${s.body.id}`, { token: conductor.token, body: { action: 'accept' } });
    await listo();
    assert.equal((await api.pedir('POST', `/api/reservas/${s.body.id}/cancelar`, { token: carla.token })).status, 200);
    const e = await listo();
    assert.equal(e.length, 1);
    assert.equal(e[0].to, await correoDe(conductor.id));
    assert.match(e[0].subject, /canceló su lugar/);
    assert.doesNotMatch(e[0].text, /tardía/);

    const pronto = await ctx.viaje(conductor.id, veh.id, { minutos: 10 }); // sale en 10 min (RN-06: menos de 20)
    const s2 = await api.pedir('POST', `/api/viajes/${pronto.id}/reservas`, { token: mario.token });
    await api.pedir('PATCH', `/api/reservas/${s2.body.id}`, { token: conductor.token, body: { action: 'accept' } });
    await listo();
    await api.pedir('POST', `/api/reservas/${s2.body.id}/cancelar`, { token: mario.token });
    const t2 = await listo();
    assert.match(t2[0].text, /cancelación tardía/);
  });

  await t.test('si el servidor de correo falla, la operación se completa igual (RNF-29)', async () => {
    falla = true;
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 1700 });
    const r = await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: carla.token });
    assert.equal(r.status, 201);
    await correos.esperar();
    assert.equal((await pool.query('SELECT estado FROM reserva WHERE id = $1', [r.body.id])).rows[0].estado, 'solicitada');
    falla = false;
  });
});
