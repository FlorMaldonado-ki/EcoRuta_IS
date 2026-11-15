'use strict';
/** Lista de espera (viaje lleno con solicitudes pendientes) y punto de unión del pasajero. */
const { omitir } = require('../helpers/entorno');
const test = require('node:test');
const assert = require('node:assert/strict');

test('lista de espera y puntos de encuentro', { skip: omitir }, async (t) => {
  const { crearContexto, pool } = require('../helpers/fixtures');
  const { iniciarServidor } = require('../helpers/http');
  const ctx = crearContexto();
  const api = await iniciarServidor();
  t.after(async () => { await ctx.limpiar(); await api.cerrar(); await pool.end(); });

  const conductor = await ctx.usuario({ nombre: 'Conductor Espera' });
  const ana = await ctx.usuario({ nombre: 'Ana Espera' });
  const beto = await ctx.usuario({ nombre: 'Beto Espera' });
  const veh = await ctx.vehiculo(conductor.id);
  const otroConductor = await ctx.usuario({ nombre: 'Otro Conductor Espera' });
  const veh2 = await ctx.vehiculo(otroConductor.id);
  const ultimo = async (u) => (await api.pedir('GET', '/api/me/notificaciones', { token: u.token })).body.items[0];
  const puntos = [
    { name: 'Acceso Liverpool', lat: 19.7039, lng: -101.1924 },
    { name: 'Salida a Charo', description: 'Frente a la farmacia', lat: 19.712, lng: -101.189 },
  ];
  const ponerPuntos = (viajeId) => pool.query(
    `UPDATE viaje SET puntos_encuentro = $2::jsonb WHERE id = $1`,
    [viajeId, JSON.stringify(puntos.map((p, i) => ({ id: `p${i + 1}`, nombre: p.name, descripcion: p.description ?? null, lat: p.lat, lng: p.lng, orden: i + 1 })))],
  );

  await t.test('el pasajero ve los puntos del conductor y elige dónde unirse; el conductor lo ve en Solicitudes', async () => {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 300, asientos: 2 });
    await ponerPuntos(v.id);
    const det = await api.pedir('GET', `/api/viajes/${v.id}`, { token: ana.token });
    assert.deepEqual(det.body.meetingPoints.map((p) => p.id), ['p1', 'p2']);

    assert.equal((await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: ana.token })).status, 422, 'sin punto → 422');
    const r = await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: ana.token, body: { meetingPoint: { pointId: 'p2' } } });
    assert.equal(r.status, 201);
    assert.equal(r.body.meetingPoint.name, 'Salida a Charo');

    const propuesto = await api.pedir('POST', `/api/viajes/${v.id}/reservas`, {
      token: beto.token, body: { meetingPoint: { lat: 19.705, lng: -101.191, name: 'Esquina OXXO', note: 'Llevo mochila azul' } },
    });
    assert.equal(propuesto.body.meetingPoint.type, 'proposed');

    const lista = await api.pedir('GET', `/api/viajes/${v.id}/reservas`, { token: conductor.token });
    const deBeto = lista.body.find((x) => x.passenger.fullName === 'Beto Espera');
    assert.equal(deBeto.meetingPoint.note, 'Llevo mochila azul');
    assert.equal((await api.pedir('GET', `/api/viajes/${v.id}`, { token: ana.token })).body.myReservation.meetingPoint.pointId, 'p2');
  });

  await t.test('se llena con solicitudes pendientes → aviso viaje_lleno; la espera no bloquea otro viaje (RN-05)', async () => {
    const v = await ctx.viaje(conductor.id, veh.id, { minutos: 2000, asientos: 1 });
    const sa = await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: ana.token });
    await api.pedir('POST', `/api/viajes/${v.id}/reservas`, { token: beto.token });
    await api.pedir('PATCH', `/api/reservas/${sa.body.id}`, { token: conductor.token, body: { action: 'accept' } });

    const n = await ultimo(beto);
    assert.equal(n.type, 'viaje_lleno');
    assert.equal(n.tripId, v.id);

    // Beto sigue pendiente (en espera) pero puede pedir otro viaje a la misma hora.
    const otro = await ctx.viaje(otroConductor.id, veh2.id, { minutos: 2010, asientos: 2 });
    assert.equal((await api.pedir('POST', `/api/viajes/${otro.id}/reservas`, { token: beto.token })).status, 201);

    // Ana cancela su lugar → se libera y Beto recibe lugar_liberado.
    await api.pedir('POST', `/api/reservas/${sa.body.id}/cancelar`, { token: ana.token });
    assert.equal((await ultimo(beto)).type, 'lugar_liberado');
  });

  await t.test('al confirmarlo en otro viaje se cancela su espera; y no se acepta si ya tiene otro confirmado', async () => {
    const lleno = await ctx.viaje(conductor.id, veh.id, { minutos: 4000, asientos: 1 });
    const libre = await ctx.viaje(otroConductor.id, veh2.id, { minutos: 4020, asientos: 2 });
    const sAna = await api.pedir('POST', `/api/viajes/${lleno.id}/reservas`, { token: ana.token });
    const sBetoEspera = await api.pedir('POST', `/api/viajes/${lleno.id}/reservas`, { token: beto.token });
    await api.pedir('PATCH', `/api/reservas/${sAna.body.id}`, { token: conductor.token, body: { action: 'accept' } });

    const sBetoLibre = await api.pedir('POST', `/api/viajes/${libre.id}/reservas`, { token: beto.token });
    await api.pedir('PATCH', `/api/reservas/${sBetoLibre.body.id}`, { token: otroConductor.token, body: { action: 'accept' } });
    const estado = (await pool.query('SELECT estado FROM reserva WHERE id = $1', [sBetoEspera.body.id])).rows[0].estado;
    assert.equal(estado, 'cancelada', 'su espera en el viaje lleno se canceló sola');
    assert.equal((await ultimo(conductor)).type, 'solicitud_cancelada');

    // Caso directo: espera vigente + confirmado en otro viaje → aceptar la espera da 409.
    const lleno2 = await ctx.viaje(conductor.id, veh.id, { minutos: 6000, asientos: 1 });
    const libre2 = await ctx.viaje(otroConductor.id, veh2.id, { minutos: 6010, asientos: 2 });
    const espera = await api.pedir('POST', `/api/viajes/${lleno2.id}/reservas`, { token: beto.token });
    await pool.query(`UPDATE viaje SET asientos_disponibles = 0 WHERE id = $1`, [lleno2.id]); // se llenó (simulado)
    const conf = await api.pedir('POST', `/api/viajes/${libre2.id}/reservas`, { token: beto.token });
    await pool.query(`UPDATE reserva SET estado = 'aceptada', respondida_en = now() WHERE id = $1`, [conf.body.id]); // confirmado sin pasar por la API
    await pool.query(`UPDATE viaje SET asientos_disponibles = 1 WHERE id = $1`, [lleno2.id]); // se liberó
    const r = await api.pedir('PATCH', `/api/reservas/${espera.body.id}`, { token: conductor.token, body: { action: 'accept' } });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'RESERVA_TRASLAPADA');
  });
});
