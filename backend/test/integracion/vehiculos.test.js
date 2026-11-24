'use strict';
/** SCRUM-28 · API de vehículos: criterios de aceptación contra la BD. */
const { omitir } = require('../helpers/entorno');
const test = require('node:test');
const assert = require('node:assert/strict');

test('API de vehículos', { skip: omitir }, async (t) => {
  const { crearContexto, pool } = require('../helpers/fixtures');
  const { iniciarServidor } = require('../helpers/http');
  const ctx = crearContexto();
  const api = await iniciarServidor();
  // Fila propia del catálogo: la prueba no depende de que el catálogo de vPIC esté cargado.
  const modelo = `Prueba ${Date.now().toString(36)}`;
  t.after(async () => {
    await ctx.limpiar();
    await pool.query('DELETE FROM catalogo_vehiculo WHERE modelo = $1', [modelo]);
    await api.cerrar();
    await pool.end();
  });

  const ana = await ctx.usuario({ nombre: 'Ana Prueba' });
  const beto = await ctx.usuario({ nombre: 'Beto Prueba' });
  const placas = `V${Date.now().toString(36).toUpperCase().slice(-6)}`;
  await pool.query(
    `INSERT INTO catalogo_vehiculo (tipo, marca, modelo, anio) VALUES ('automovil', 'Nissan', $1, 2020)`, [modelo]);
  const cuerpo = { type: 'automovil', brand: 'nissan', model: modelo.toLowerCase(), year: 2020, color: 'Gris', plates: placas.toLowerCase(), capacity: 5, licenseAndInsuranceDeclared: true };
  let id;

  await t.test('registro válido → 201 con VehicleDTO y placas normalizadas', async () => {
    const r = await api.pedir('POST', '/api/vehiculos', { token: ana.token, body: cuerpo });
    assert.equal(r.status, 201);
    assert.equal(r.body.plates, placas);
    assert.equal(r.body.active, true);
    assert.equal(r.body.brand, 'Nissan'); // escritura oficial del catálogo
    assert.equal(r.body.model, modelo);
    assert.equal(r.body.year, 2020);
    id = r.body.id;
  });

  await t.test('combinación que no está en el catálogo → 422 en model', async () => {
    const r = await api.pedir('POST', '/api/vehiculos', { token: ana.token, body: { ...cuerpo, plates: 'CAT1234', year: 2005 } });
    assert.equal(r.status, 422);
    assert.ok(r.body.fields.model);
  });

  await t.test('GET /api/catalogos/vehiculos es público e incluye la combinación', async () => {
    const r = await api.pedir('GET', '/api/catalogos/vehiculos');
    assert.equal(r.status, 200);
    assert.ok(r.body.types.some((x) => x.key === 'automovil'));
    assert.ok(Array.isArray(r.body.models));
  });

  await t.test('sin declaración de licencia y seguro → 422 en ese campo (RN-12)', async () => {
    const r = await api.pedir('POST', '/api/vehiculos', { token: ana.token, body: { ...cuerpo, plates: 'OTRA123', licenseAndInsuranceDeclared: false } });
    assert.equal(r.status, 422);
    assert.ok(r.body.fields.licenseAndInsuranceDeclared);
  });

  await t.test('mismas placas dos veces → 409', async () => {
    const r = await api.pedir('POST', '/api/vehiculos', { token: ana.token, body: cuerpo });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'PLACAS_REGISTRADAS');
  });

  await t.test('GET /api/me/vehiculos lista solo los míos', async () => {
    const r = await api.pedir('GET', '/api/me/vehiculos', { token: ana.token });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.map((v) => v.id), [id]);
    const deBeto = await api.pedir('GET', '/api/me/vehiculos', { token: beto.token });
    assert.deepEqual(deBeto.body, []);
  });

  await t.test('editar o desactivar un vehículo ajeno → 404 (RNF-09)', async () => {
    assert.equal((await api.pedir('PATCH', `/api/vehiculos/${id}`, { token: beto.token, body: { color: 'Rojo' } })).status, 404);
    assert.equal((await api.pedir('DELETE', `/api/vehiculos/${id}`, { token: beto.token })).status, 404);
    assert.equal((await api.pedir('GET', `/api/vehiculos/${id}`, { token: beto.token })).status, 404);
    assert.equal((await api.pedir('PATCH', '/api/vehiculos/no-es-uuid', { token: ana.token, body: { color: 'Rojo' } })).status, 404);
  });

  await t.test('editar el mío → 200', async () => {
    const r = await api.pedir('PATCH', `/api/vehiculos/${id}`, { token: ana.token, body: { color: 'Azul', capacity: 4 } });
    assert.equal(r.status, 200);
    assert.equal(r.body.color, 'Azul');
    assert.equal(r.body.capacity, 4);
  });

  await t.test('no se desactiva ni se reduce la capacidad por debajo de un viaje publicado', async () => {
    const viaje = await ctx.viaje(ana.id, id, { asientos: 3 });
    const reducir = await api.pedir('PATCH', `/api/vehiculos/${id}`, { token: ana.token, body: { capacity: 3 } });
    assert.equal(reducir.status, 409);
    assert.ok(reducir.body.fields.capacity);
    const bloqueado = await api.pedir('DELETE', `/api/vehiculos/${id}`, { token: ana.token });
    assert.equal(bloqueado.status, 409);
    assert.equal(bloqueado.body.error, 'VEHICULO_CON_VIAJES');
    await pool.query(`UPDATE viaje SET estado = 'cancelado', cancelado_en = now() WHERE id = $1`, [viaje.id]);
    const r = await api.pedir('DELETE', `/api/vehiculos/${id}`, { token: ana.token });
    assert.equal(r.status, 200);
    assert.equal(r.body.active, false); // sin viajes pendientes se desactiva sin borrarse
    const { rowCount } = await pool.query('SELECT 1 FROM vehiculo WHERE id = $1', [id]);
    assert.equal(rowCount, 1);
  });

  await t.test('registrar de nuevo las placas desactivadas reactiva el vehículo', async () => {
    const r = await api.pedir('POST', '/api/vehiculos', { token: ana.token, body: cuerpo });
    assert.equal(r.status, 200);
    assert.equal(r.body.id, id);
    assert.equal(r.body.active, true);
  });
});
