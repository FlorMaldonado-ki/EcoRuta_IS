'use strict';
/**
 * SCRUM-47 · Pruebas de seguridad de la API (RNF-06, RNF-09, RNF-10, RNF-11, RNF-12).
 * El resultado de cada caso se resume en docs/PRUEBAS-SEGURIDAD.md.
 */
process.env.RATE_LIMIT_LOGIN = '12'; // límite bajo SOLO en este archivo para comprobar el 429
const { omitir } = require('../helpers/entorno');
const test = require('node:test');
const assert = require('node:assert/strict');

test('seguridad de la API', { skip: omitir }, async (t) => {
  const jwt = require('jsonwebtoken');
  const { crearContexto, pool } = require('../helpers/fixtures');
  const { iniciarServidor } = require('../helpers/http');
  const ctx = crearContexto();
  const api = await iniciarServidor();
  t.after(async () => { await ctx.limpiar(); await api.cerrar(); await pool.end(); });

  const a = await ctx.usuario({ nombre: 'Usuario A Seguridad', telefono: '4431110000' });
  const b = await ctx.usuario({ nombre: 'Usuario B Seguridad', telefono: '4432220000' });
  const vehB = await ctx.vehiculo(b.id);
  const viajeB = await ctx.viaje(b.id, vehB.id, { minutos: 600 });
  const c = await ctx.usuario({ nombre: 'Usuario C Seguridad' });
  const viajeB2 = await ctx.viaje(b.id, vehB.id, { minutos: 900 });
  const reservaC = (await api.pedir('POST', `/api/viajes/${viajeB2.id}/reservas`, { token: c.token })).body;

  const PROTEGIDOS = [
    ['GET', '/api/me'], ['PATCH', '/api/me'], ['GET', '/api/me/vehiculos'], ['POST', '/api/vehiculos'],
    ['GET', '/api/me/viajes'], ['GET', '/api/viajes?direction=to_campus'], ['POST', '/api/viajes'],
    ['GET', `/api/viajes/${viajeB.id}`], ['POST', `/api/viajes/${viajeB.id}/reservas`], ['PATCH', `/api/reservas/${reservaC.id}`],
  ];

  await t.test('sin token, con token vencido, con firma alterada o alg "none" → 401 en todos los endpoints protegidos', async () => {
    const secreto = process.env.JWT_SECRET;
    const vencido = jwt.sign({ rol: 'usuario' }, secreto, { subject: a.id, issuer: 'ecoruta-api', expiresIn: -10 });
    const [h, p, s] = a.token.split('.');
    const payloadAdmin = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), rol: 'admin' })).toString('base64url');
    const alterado = `${h}.${payloadAdmin}.${s}`;
    const otraLlave = jwt.sign({ rol: 'admin' }, 'otra-llave-cualquiera', { subject: a.id, issuer: 'ecoruta-api' });
    const sinFirma = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${p}.`;
    for (const [metodo, ruta] of PROTEGIDOS) {
      for (const [nombre, token, codigo] of [['sin token', null, 'NO_AUTENTICADO'], ['vencido', vencido, 'SESION_EXPIRADA'],
        ['alterado', alterado, 'TOKEN_INVALIDO'], ['otra llave', otraLlave, 'TOKEN_INVALIDO'], ['alg none', sinFirma, 'TOKEN_INVALIDO']]) {
        const r = await api.pedir(metodo, ruta, { token, body: metodo === 'GET' ? undefined : {} });
        assert.equal(r.status, 401, `${metodo} ${ruta} (${nombre})`);
        assert.equal(r.body.error, codigo, `${metodo} ${ruta} (${nombre})`);
      }
    }
  });

  await t.test('RNF-09: A no puede leer ni modificar vehículos, viajes ni reservas de B', async () => {
    assert.equal((await api.pedir('GET', `/api/vehiculos/${vehB.id}`, { token: a.token })).status, 404);
    assert.equal((await api.pedir('PATCH', `/api/vehiculos/${vehB.id}`, { token: a.token, body: { color: 'Negro' } })).status, 404);
    assert.equal((await api.pedir('DELETE', `/api/vehiculos/${vehB.id}`, { token: a.token })).status, 404);
    assert.equal((await api.pedir('GET', `/api/viajes/${viajeB2.id}/reservas`, { token: a.token })).status, 404);
    assert.equal((await api.pedir('POST', `/api/viajes/${viajeB.id}/cancelar`, { token: a.token })).status, 403);
    assert.equal((await api.pedir('PATCH', `/api/reservas/${reservaC.id}`, { token: a.token, body: { action: 'accept' } })).status, 404);
    assert.equal((await api.pedir('POST', `/api/reservas/${reservaC.id}/cancelar`, { token: a.token })).status, 404);
    const publicar = await api.pedir('POST', '/api/viajes', { token: a.token, body: { vehicleId: vehB.id, direction: 'to_campus', campusPoint: 'campus_1',
      origin: { text: 'X', lat: 19.70, lng: -101.19 }, departureAt: new Date(Date.now() + 7200_000).toISOString(), seats: 1 } });
    assert.equal(publicar.status, 422); // no puede publicar con el vehículo de B
    const { rows } = await pool.query('SELECT color, activo FROM vehiculo WHERE id = $1', [vehB.id]);
    assert.deepEqual(rows[0], { color: 'Gris', activo: true });
  });

  await t.test('inyección SQL en filtros y formularios no altera las consultas', async () => {
    const inyeccion = "' OR 1=1 --";
    const busqueda = await api.pedir('GET', `/api/viajes?direction=${encodeURIComponent(inyeccion)}&date=${encodeURIComponent(inyeccion)}&page=${encodeURIComponent('1; DROP TABLE viaje')}`, { token: a.token });
    assert.equal(busqueda.status, 422);
    const login = await api.pedir('POST', '/api/auth/login', { body: { email: inyeccion, password: inyeccion } });
    assert.ok([401, 422].includes(login.status));
    const veh = await api.pedir('POST', '/api/vehiculos', { token: a.token, body: { type: 'automovil', brand: inyeccion, model: "x'); DELETE FROM vehiculo; --", year: 2020, color: 'Gris', plates: 'SQL1234', capacity: 4, licenseAndInsuranceDeclared: true } });
    assert.equal(veh.status, 422); // se buscó en el catálogo como texto literal y no existe
    assert.ok(veh.body.fields.model);
    const { rows } = await pool.query('SELECT count(*) AS n FROM vehiculo WHERE id = $1', [vehB.id]);
    assert.equal(rows[0].n, 1);
    const reservaFalsa = await api.pedir('PATCH', `/api/reservas/${encodeURIComponent("1' OR '1'='1")}`, { token: b.token, body: { action: 'accept' } });
    assert.equal(reservaFalsa.status, 404);
  });

  await t.test('RNF-12: ninguna respuesta expone el hash, los contadores de bloqueo ni datos de contacto de terceros', async () => {
    const respuestas = await Promise.all([
      api.pedir('GET', '/api/me', { token: a.token }),
      api.pedir('GET', `/api/viajes/${viajeB.id}`, { token: a.token }),
      api.pedir('GET', '/api/viajes?direction=to_campus', { token: a.token }),
      api.pedir('GET', `/api/viajes/${viajeB2.id}/reservas`, { token: b.token }),
    ]);
    for (const r of respuestas) {
      assert.ok(!/hash|\$2[aby]\$|intentos|bloqueado_hasta/i.test(r.texto), r.texto.slice(0, 200));
    }
    assert.ok(!respuestas[1].texto.includes('4432220000'), 'teléfono de B sin reserva aceptada');
    assert.ok(!respuestas[1].texto.includes(vehB.placas), 'placas de B sin reserva aceptada');
    assert.ok(!respuestas[3].texto.includes('phone'), 'teléfono del pasajero con solicitud no aceptada');
  });

  await t.test('subir un archivo que no es PDF ni imagen real (renombrado) → 422', async () => {
    const form = new FormData();
    for (const [k, v] of Object.entries({ userType: 'alumno', fullName: 'Prueba Archivo', email: `archivo.${Date.now()}@morelia.tecnm.mx`,
      password: 'Prueba1234', confirmPassword: 'Prueba1234', termsAccepted: 'true', career: 'Ingeniería Industrial' })) form.append(k, v);
    form.append('document', new Blob(['MZ esto es un ejecutable renombrado'], { type: 'application/pdf' }), 'reticula.pdf');
    const res = await fetch(`${api.base}/api/auth/register`, { method: 'POST', body: form });
    const body = await res.json();
    assert.equal(res.status, 422);
    assert.ok(body.fields.academicCurriculumDoc);
  });

  await t.test('RNF-11: 5 intentos fallidos bloquean la cuenta; el límite por IP responde 429', async () => {
    const correo = a.correo;
    for (let i = 0; i < 4; i++) {
      assert.equal((await api.pedir('POST', '/api/auth/login', { body: { email: correo, password: 'Incorrecta1' } })).status, 401);
    }
    const quinto = await api.pedir('POST', '/api/auth/login', { body: { email: correo, password: 'Incorrecta1' } });
    assert.equal(quinto.status, 423);
    const conLaCorrecta = await api.pedir('POST', '/api/auth/login', { body: { email: correo, password: 'Prueba1234' } });
    assert.equal(conLaCorrecta.status, 423);
    assert.equal(conLaCorrecta.body.error, 'CUENTA_BLOQUEADA');
    let limitado = null;
    for (let i = 0; i < 12 && !limitado; i++) {
      const r = await api.pedir('POST', '/api/auth/login', { body: { email: 'nadie@morelia.tecnm.mx', password: 'x' } });
      if (r.status === 429) limitado = r;
    }
    assert.ok(limitado, 'debe responder 429 al pasar el límite');
    assert.equal(limitado.body.error, 'DEMASIADOS_INTENTOS');
  });

  await t.test('cabeceras de seguridad de helmet activas', async () => {
    const res = await fetch(`${api.base}/api/health`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(res.headers.get('content-security-policy'));
    assert.equal(res.headers.get('x-powered-by'), null);
  });
});
