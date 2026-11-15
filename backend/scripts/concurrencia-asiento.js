#!/usr/bin/env node
/**
 * SCRUM-39 · RNF-28 (sin sobreventa), RNF-03 (15 usuarios concurrentes).
 * Prueba de concurrencia del último asiento contra una API en marcha:
 *   - viaje con 1 asiento y 2 solicitudes (Carla y Mario, cuentas demo)
 *   - las 2 aceptaciones del conductor (Ana) se disparan a la vez (Promise.all)
 *   - 15 lecturas simultáneas de fondo
 *   - se repite 20 veces; en cada corrida exactamente una queda aceptada,
 *     la otra recibe 409 y asientos_disponibles nunca es negativo.
 *
 *   npm run test:concurrencia                       → API en http://localhost:3000
 *   npm run test:concurrencia -- http://localhost:3000 20
 *
 * Requiere: seed demo cargado y DATABASE_URL de una rama de PRUEBAS en .env
 * (crea viajes de prueba y al final los cancela). Nunca contra la rama main.
 */
'use strict';
require('dotenv').config();
const { Client } = require('pg');

const base = (process.argv[2] || process.env.API_URL || 'http://localhost:3000').replace(/\/+$/, '');
const CORRIDAS = Number(process.argv[3] || 20);
const LECTURAS = 15;

if (process.env.NODE_ENV === 'production') {
  console.error('✖ NODE_ENV=production: esta prueba crea datos. Úsala solo con una rama de pruebas.');
  process.exit(1);
}

async function pedir(metodo, ruta, token, body) {
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(70_000),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function login(nombre) {
  const r = await pedir('POST', '/api/auth/login', null, { email: `demo.${nombre}@morelia.tecnm.mx`, password: 'Demo1234' });
  if (r.status !== 200) throw new Error(`No pude iniciar sesión como demo.${nombre} (${r.status}). ¿Cargaste el seed?`);
  return r.body;
}

(async () => {
  console.log(`\nConcurrencia del último asiento contra ${base} (${CORRIDAS} corridas, ${LECTURAS} lecturas de fondo)\n`);
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const [ana, carla, mario] = await Promise.all([login('ana'), login('carla'), login('mario')]);
  const { rows: [veh] } = await db.query('SELECT id FROM vehiculo WHERE usuario_id = $1 AND activo LIMIT 1', [ana.user.id]);
  const creados = [];
  let fallos = 0;

  try {
    for (let i = 0; i < CORRIDAS; i++) {
      // Viaje directo en BD a varios días (no choca con RN-05 entre corridas).
      const { rows: [v] } = await db.query(
        `INSERT INTO viaje (conductor_id, vehiculo_id, sentido, punto_campus, origen_texto, origen_lat, origen_lng,
                            destino_texto, destino_lat, destino_lng, salida_en, asientos_totales, distancia_km, duracion_min, distancia_fuente)
         VALUES ($1, $2, 'hacia_campus', 'campus_1', 'Prueba de concurrencia', 19.7039, -101.1924,
                 'Campus 1 (Central - Av. Tecnológico)', 19.7217, -101.1858, now() + make_interval(days => 20, hours => $3 * 3), 1, 4.1, 14, 'haversine')
         RETURNING id`,
        [ana.user.id, veh.id, i],
      );
      creados.push(v.id);
      const s1 = await pedir('POST', `/api/viajes/${v.id}/reservas`, carla.token);
      const s2 = await pedir('POST', `/api/viajes/${v.id}/reservas`, mario.token);
      if (s1.status !== 201 || s2.status !== 201) throw new Error(`no se pudieron crear las solicitudes (${s1.status}/${s2.status})`);

      const fondo = Array.from({ length: LECTURAS }, (_, k) => pedir('GET', `/api/viajes/${v.id}`, k % 2 ? carla.token : mario.token));
      const [a, b] = await Promise.all([
        pedir('PATCH', `/api/reservas/${s1.body.id}`, ana.token, { action: 'accept' }),
        pedir('PATCH', `/api/reservas/${s2.body.id}`, ana.token, { action: 'accept' }),
      ]);
      await Promise.all(fondo);

      const { rows: [estado] } = await db.query(
        `SELECT v.asientos_disponibles,
                (SELECT count(*) FROM reserva r WHERE r.viaje_id = v.id AND r.estado = 'aceptada')::int AS aceptadas
           FROM viaje v WHERE v.id = $1`, [v.id]);
      const codigos = [a.status, b.status].sort().join('/');
      const bien = codigos === '200/409' && estado.aceptadas === 1 && estado.asientos_disponibles === 0;
      if (!bien) fallos++;
      console.log(`  ${bien ? '✔' : '✖'} corrida ${String(i + 1).padStart(2)}: respuestas ${codigos}, aceptadas ${estado.aceptadas}, asientos ${estado.asientos_disponibles}`);
    }
  } finally {
    // Limpieza: los viajes de prueba quedan cancelados (no aparecen en búsquedas).
    await db.query(`UPDATE reserva SET estado = 'cancelada', cancelada_en = now()
                     WHERE viaje_id = ANY($1) AND estado IN ('solicitada', 'aceptada')`, [creados]);
    await db.query(`UPDATE viaje SET estado = 'cancelado', cancelado_en = now() WHERE id = ANY($1) AND estado = 'publicado'`, [creados]);
    await db.end();
  }

  console.log(fallos ? `\n✖ ${fallos} corrida(s) con sobreventa o respuesta inesperada.\n` : `\n✔ ${CORRIDAS}/${CORRIDAS} corridas: nunca se sobrevendió el último asiento.\n`);
  process.exit(fallos ? 1 : 0);
})().catch((err) => { console.error(`✖ ${err.message}`); process.exit(1); });
