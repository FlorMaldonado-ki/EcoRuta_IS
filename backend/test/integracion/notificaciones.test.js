'use strict';
/** Notificaciones en la app: cada acción de reserva o viaje avisa a la otra persona. */
const { omitir } = require('../helpers/entorno');
const test = require('node:test');
const assert = require('node:assert/strict');

test('notificaciones', { skip: omitir }, async (t) => {
  const { crearContexto, pool } = require('../helpers/fixtures');
  const { iniciarServidor } = require('../helpers/http');
  const ctx = crearContexto();
  const api = await iniciarServidor();
  t.after(async () => { await ctx.limpiar(); await api.cerrar(); await pool.end(); });

  const conductor = await ctx.usuario({ nombre: 'Conductor Avisos' });
  const pasajero = await ctx.usuario({ nombre: 'Pasajero Avisos' });
  const otro = await ctx.usuario({ nombre: 'Otro Avisos' });
  const veh = await ctx.vehiculo(conductor.id);
  const bandeja = async (u) => (await api.pedir('GET', '/api/me/notificaciones', { token: u.token })).body;
  const tipos = async (u) => (await bandeja(u)).items.map((n) => n.type);

  await t.test('solicitar → conductor; aceptar → pasajero; cancelar lugar → conductor (crítica)', async () => {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 240 });
    const sol = await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: pasajero.token });
    let b = await bandeja(conductor);
    assert.equal(b.items[0].type, 'solicitud_recibida');
    assert.match(b.items[0].message, /Pasajero Avisos/);
    assert.equal(b.items[0].critical, false);
    assert.equal(b.items[0].tripId, v.id);

    await api.pedir('PATCH', `/api/reservas/${sol.body.id}`, { token: conductor.token, body: { action: 'accept' } });
    assert.equal((await tipos(pasajero))[0], 'solicitud_aceptada');

    await api.pedir('POST', `/api/reservas/${sol.body.id}/cancelar`, { token: pasajero.token });
    b = await bandeja(conductor);
    assert.equal(b.items[0].type, 'lugar_cancelado');
    assert.equal(b.items[0].critical, true);
  });

  await t.test('rechazar → pasajero (crítica); retirar solicitud pendiente → conductor', async () => {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 600 });
    const sol = await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: pasajero.token });
    await api.pedir('PATCH', `/api/reservas/${sol.body.id}`, { token: conductor.token, body: { action: 'reject' } });
    const n = (await bandeja(pasajero)).items[0];
    assert.equal(n.type, 'solicitud_rechazada');
    assert.equal(n.critical, true);

    const v2 = await ctx.viaje(conductor.id, veh.id, { minutos: 900 });
    const sol2 = await api.pedir('POST', `/api/viajes/${v2.id}/reservas`, { token: pasajero.token });
    await api.pedir('POST', `/api/reservas/${sol2.body.id}/cancelar`, { token: pasajero.token });
    assert.equal((await tipos(conductor))[0], 'solicitud_cancelada');
  });

  await t.test('cancelar viaje → aviso crítico a cada pasajero con reserva vigente', async () => {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 1300 });
    await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: pasajero.token });
    await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: otro.token });
    const r = await api.pedir('POST', `/api/viajes/${v.id}/cancelar`, { token: conductor.token });
    assert.equal(r.body.cancelledReservations, 2);
    for (const u of [pasajero, otro]) {
      const n = (await bandeja(u)).items[0];
      assert.equal(n.type, 'viaje_cancelado');
      assert.equal(n.critical, true);
      assert.match(n.message, /Conductor Avisos/);
    }
  });

  await t.test('no leídas, marcar una, marcar todas; la de otro usuario → 404', async () => {
    const b = await bandeja(conductor);
    assert.ok(b.unread >= 1);
    const id = b.items.find((n) => !n.read).id;
    assert.equal((await api.pedir('PATCH', `/api/me/notificaciones/${id}/leida`, { token: pasajero.token })).status, 404);
    const r = await api.pedir('PATCH', `/api/me/notificaciones/${id}/leida`, { token: conductor.token });
    assert.equal(r.body.read, true);
    assert.equal((await bandeja(conductor)).unread, b.unread - 1);
    await api.pedir('POST', '/api/me/notificaciones/leer-todas', { token: conductor.token });
    assert.equal((await bandeja(conductor)).unread, 0);
  });

  await t.test('resumen del panel: viajes nuevos, solicitudes pendientes y leer por sección', async () => {
    await api.pedir('POST', '/api/me/notificaciones/viajes-vistos', { token: otro.token });
    assert.equal((await bandeja(otro)).summary.newTrips, 0);
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 2400 });
    assert.equal((await bandeja(otro)).summary.newTrips, 1);
    assert.equal((await bandeja(conductor)).summary.newTrips, 0, 'mis propios viajes no cuentan');
    assert.equal((await api.pedir('POST', '/api/me/notificaciones/viajes-vistos', { token: otro.token })).body.newTrips, 0);
    assert.equal((await bandeja(otro)).summary.newTrips, 0);

    const antes = (await bandeja(conductor)).summary.pendingRequests;
    await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: otro.token });
    const b = await bandeja(conductor);
    assert.equal(b.summary.pendingRequests, antes + 1);
    assert.equal(b.items[0].type, 'solicitud_recibida');

    // Solo se marcan las de la sección pedida.
    await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: pasajero.token });
    await api.pedir('POST', '/api/me/notificaciones/leer-todas', { token: conductor.token, body: { types: ['lugar_cancelado'] } });
    assert.ok((await bandeja(conductor)).items.some((n) => n.type === 'solicitud_recibida' && !n.read));
    const r = await api.pedir('POST', '/api/me/notificaciones/leer-todas', { token: conductor.token, body: { types: ['solicitud_recibida'] } });
    assert.equal(r.status, 200);
    assert.ok(!(await bandeja(conductor)).items.some((n) => n.type === 'solicitud_recibida' && !n.read));
    assert.equal((await api.pedir('POST', '/api/me/notificaciones/leer-todas', { token: conductor.token, body: { types: ['otro'] } })).status, 422);
  });

  await t.test('se purgan las de más de 72 h y sin sesión → 401', async () => {
    await pool.query(`UPDATE notificacion SET creada_en = now() - interval '73 hours' WHERE usuario_id = $1`, [otro.id]);
    assert.equal((await bandeja(otro)).items.length, 0);
    assert.equal((await api.pedir('GET', '/api/me/notificaciones')).status, 401);
  });
});
