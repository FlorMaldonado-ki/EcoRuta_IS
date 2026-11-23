#!/usr/bin/env node
/**
 * SCRUM-71 · Prueba automatizada del FLUJO CENTRAL contra una API desplegada:
 *   vehículo → publicar → buscar → solicitar → aceptar → (editar = 409) → finalizar
 *   → CO₂ del pasajero y de la comunidad
 *
 * CREA DATOS (un viaje, una reserva y su impacto). Úsalo SOLO contra una rama
 * de pruebas de Neon, nunca contra la base de producción.
 *
 *   FLUJO_DATABASE_URL=postgresql://...rama-pruebas... \
 *   npm run test:flujo -- https://mi-api-de-pruebas --rama-de-pruebas
 *
 * Variables (por defecto, las cuentas del seed demo, contraseña Demo1234):
 *   FLUJO_CONDUCTOR_EMAIL / FLUJO_CONDUCTOR_PASS   (demo.ana@morelia.tecnm.mx)
 *   FLUJO_PASAJERO_EMAIL  / FLUJO_PASAJERO_PASS    (demo.carla@morelia.tecnm.mx)
 *   FLUJO_DATABASE_URL  conexión a la MISMA rama que usa la API. Hace falta para
 *                       un solo paso: adelantar la salida del viaje al pasado
 *                       (no se puede publicar con < 30 min ni finalizar antes de salir).
 *
 * Registro y verificación de correo se prueban a mano (ver docs/PRUEBAS-FLUJO-CENTRAL.md).
 */
'use strict';
const crypto = require('crypto');
const { Client } = require('pg');
const { calcularCo2, co2Pasajero } = require('../src/modules/impacto/eco.service');

const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith('--')) || process.env.API_URL || 'http://localhost:3000').replace(/\/+$/, '');
const confirmado = args.includes('--rama-de-pruebas');
const dbUrl = process.env.FLUJO_DATABASE_URL;
const cuentas = {
  conductor: [process.env.FLUJO_CONDUCTOR_EMAIL || 'demo.ana@morelia.tecnm.mx', process.env.FLUJO_CONDUCTOR_PASS || 'Demo1234'],
  pasajero: [process.env.FLUJO_PASAJERO_EMAIL || 'demo.carla@morelia.tecnm.mx', process.env.FLUJO_PASAJERO_PASS || 'Demo1234'],
};

if (!confirmado || !dbUrl) {
  console.error(`
Este script CREA datos (viaje, reserva e impacto) y necesita:
  1. --rama-de-pruebas      para confirmar que la API apunta a una rama de PRUEBAS de Neon
  2. FLUJO_DATABASE_URL     la conexión a esa misma rama (para adelantar la salida del viaje)

Nunca lo corras contra la base de producción.
`);
  process.exit(2);
}

const resultados = [];
let fallos = 0;

async function paso(nombre, fn) {
  try {
    const detalle = await fn();
    resultados.push({ nombre, ok: true, detalle });
    console.log(`  ✔ ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  } catch (err) {
    fallos++;
    resultados.push({ nombre, ok: false, detalle: err.message });
    console.log(`  ✖ ${nombre} — ${err.message}`);
    throw err; // cada paso depende del anterior
  }
}

async function pedir(metodo, ruta, { token, body } = {}) {
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(70_000), // un servicio gratuito puede tardar en despertar
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

const esperar = (cond, msg) => { if (!cond) throw new Error(msg); };
const r3 = (x) => Math.round(x * 1000) / 1000;
const fechaLocal = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(d);
const horaLocal = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' }).format(d);

(async () => {
  console.log(`\nFlujo central contra ${base}\n`);
  const s = {};
  const db = new Client({ connectionString: dbUrl });
  try {
    await paso('API y base de datos en línea', async () => {
      const r = await pedir('GET', '/api/health');
      esperar(r.status === 200 && r.body.db === 'ok', `status ${r.status}`);
    });

    await paso('inicio de sesión del conductor y del pasajero', async () => {
      for (const [rol, [email, password]] of Object.entries(cuentas)) {
        const r = await pedir('POST', '/api/auth/login', { body: { email, password } });
        esperar(r.status === 200 && r.body.token, `${rol} (${email}): status ${r.status} ${r.body?.message || ''}`);
        s[rol] = { token: r.body.token, ...r.body.user };
      }
      return `${s.conductor.fullName} / ${s.pasajero.fullName}`;
    });

    await paso('el conductor tiene un vehículo activo (lo registra si no)', async () => {
      const r = await pedir('GET', '/api/me/vehiculos', { token: s.conductor.token });
      esperar(r.status === 200, `status ${r.status}`);
      s.vehiculo = r.body.find((v) => v.capacity >= 3);
      if (!s.vehiculo) {
        const nuevo = await pedir('POST', '/api/vehiculos', {
          token: s.conductor.token,
          body: { brand: 'Nissan', model: 'Versa', color: 'Gris', plates: `PRU${crypto.randomBytes(2).toString('hex').toUpperCase()}`, capacity: 5, licenseAndInsuranceDeclared: true },
        });
        esperar([200, 201].includes(nuevo.status), `registrar vehículo: status ${nuevo.status} ${JSON.stringify(nuevo.body?.fields || '')}`);
        s.vehiculo = nuevo.body;
      }
      return `${s.vehiculo.brand} ${s.vehiculo.model}, capacidad ${s.vehiculo.capacity}`;
    });

    await paso('totales antes de empezar (comunidad y pasajero)', async () => {
      s.comunidadAntes = (await pedir('GET', '/api/impacto/comunidad')).body;
      s.pasajeroAntes = (await pedir('GET', '/api/impacto/me', { token: s.pasajero.token })).body;
      esperar(typeof s.comunidadAntes.co2SavedKg === 'number', 'sin /api/impacto/comunidad');
      return `comunidad ${s.comunidadAntes.co2SavedKg} kg`;
    });

    await paso('publicar un viaje hacia el campus (RF-08, estimación RF-10)', async () => {
      const cat = (await pedir('GET', '/api/catalogos')).body;
      const salida = new Date(Date.now() + 50 * 60_000);
      const r = await pedir('POST', '/api/viajes', {
        token: s.conductor.token,
        body: {
          vehicleId: s.vehiculo.id, direction: 'to_campus', campusPoint: cat.campusPoints[0].key,
          origin: { text: 'Plaza Las Américas (prueba flujo central)', lat: 19.7039, lng: -101.1924 },
          departureAt: salida.toISOString(), seats: 2, notes: 'Viaje creado por scripts/flujo-central.js',
        },
      });
      esperar(r.status === 201, `status ${r.status} ${JSON.stringify(r.body?.fields || r.body?.message || '')}`);
      s.viaje = r.body;
      return `${r.body.distanceKm} km (${r.body.distanceSource}), sale ${horaLocal(salida)}`;
    });

    await paso('el pasajero lo encuentra en la búsqueda (RF-11)', async () => {
      const d = new Date(s.viaje.departureAt);
      const q = new URLSearchParams({ direction: 'to_campus', date: fechaLocal(d), lat: '19.7039', lng: '-101.1924', radiusKm: '2' });
      const r = await pedir('GET', `/api/viajes?${q}`, { token: s.pasajero.token });
      esperar(r.status === 200 && r.body.items.some((v) => v.id === s.viaje.id), `no apareció (status ${r.status})`);
    });

    await paso('el pasajero solicita lugar (RF-15)', async () => {
      const det = (await pedir('GET', `/api/viajes/${s.viaje.id}`, { token: s.pasajero.token })).body;
      const meetingPoint = det.meetingPoints.length ? { pointId: det.meetingPoints[0].id } : undefined;
      const r = await pedir('POST', `/api/viajes/${s.viaje.id}/reservas`, { token: s.pasajero.token, body: meetingPoint ? { meetingPoint } : {} });
      esperar(r.status === 201 && r.body.status === 'requested', `status ${r.status} ${r.body?.message || ''}`);
      s.reserva = r.body;
    });

    await paso('el conductor ve la solicitud y la acepta (RF-16)', async () => {
      const l = await pedir('GET', `/api/viajes/${s.viaje.id}/reservas`, { token: s.conductor.token });
      esperar(l.status === 200 && l.body.some((x) => x.id === s.reserva.id), 'la solicitud no aparece en la lista del conductor');
      const r = await pedir('PATCH', `/api/reservas/${s.reserva.id}`, { token: s.conductor.token, body: { action: 'accept' } });
      esperar(r.status === 200 && r.body.status === 'accepted', `status ${r.status} ${r.body?.message || ''}`);
    });

    await paso('con un pasajero aceptado ya no se puede editar (RF-13 → 409 VIAJE_CON_RESERVAS)', async () => {
      const r = await pedir('PATCH', `/api/viajes/${s.viaje.id}`, { token: s.conductor.token, body: { notes: 'cambio' } });
      esperar(r.status === 409 && r.body.error === 'VIAJE_CON_RESERVAS', `status ${r.status} ${r.body?.error || ''}`);
    });

    await paso('antes de la salida no se puede finalizar (409 VIAJE_AUN_NO_SALE)', async () => {
      const r = await pedir('POST', `/api/viajes/${s.viaje.id}/finalizar`, { token: s.conductor.token });
      esperar(r.status === 409 && r.body.error === 'VIAJE_AUN_NO_SALE', `status ${r.status} ${r.body?.error || ''}`);
    });

    await paso('[BD de pruebas] se adelanta la salida del viaje al pasado', async () => {
      await db.connect();
      const r = await db.query(`UPDATE viaje SET salida_en = now() - interval '5 minutes' WHERE id = $1 AND estado = 'publicado'`, [s.viaje.id]);
      esperar(r.rowCount === 1, 'no se encontró el viaje en FLUJO_DATABASE_URL: ¿es la misma rama que usa la API?');
    });

    await paso('el conductor finaliza el viaje y se registra el CO₂ (RF-19, RF-21)', async () => {
      const r = await pedir('POST', `/api/viajes/${s.viaje.id}/finalizar`, { token: s.conductor.token });
      esperar(r.status === 200 && r.body.trip.status === 'finished', `status ${r.status} ${r.body?.message || ''}`);
      esperar(r.body.impact, 'no se registró impacto aunque había un pasajero aceptado');
      const esperado = calcularCo2(r.body.impact.distanceKm, r.body.impact.emissionFactor, 1);
      esperar(r.body.impact.co2Kg === esperado, `CO₂ ${r.body.impact.co2Kg} ≠ ${esperado}`);
      s.impacto = r.body.impact;
      return `${r.body.impact.co2Kg} kg (${r.body.impact.distanceKm} km × ${r.body.impact.emissionFactor})`;
    });

    await paso('Mi impacto del pasajero aumentó lo esperado (RF-23)', async () => {
      const r = (await pedir('GET', '/api/impacto/me', { token: s.pasajero.token })).body;
      const delta = r3(r.co2TotalKg - s.pasajeroAntes.co2TotalKg);
      const esperado = co2Pasajero(s.impacto.distanceKm, s.impacto.emissionFactor);
      esperar(delta === esperado, `aumentó ${delta} kg, se esperaban ${esperado}`);
      return `+${delta} kg`;
    });

    await paso('el total de la comunidad aumentó lo esperado (RF-24, RF-26)', async () => {
      const r = (await pedir('GET', '/api/impacto/comunidad')).body;
      const delta = r3(r.co2SavedKg - s.comunidadAntes.co2SavedKg);
      esperar(delta >= s.impacto.co2Kg, `aumentó ${delta} kg, se esperaban al menos ${s.impacto.co2Kg}`); // otros viajes pudieron finalizar a la vez
      esperar(r.sharedTrips > s.comunidadAntes.sharedTrips, 'el número de viajes compartidos no aumentó');
      return `+${delta} kg · ${r.sharedTrips} viajes compartidos`;
    });

    await paso('el viaje finalizado muestra su CO₂ en el detalle (RF-21)', async () => {
      const r = (await pedir('GET', `/api/viajes/${s.viaje.id}`, { token: s.pasajero.token })).body;
      esperar(r.impact && r.impact.co2Kg === s.impacto.co2Kg, 'el detalle no trae impact.co2Kg');
    });
  } catch {
    // el paso que falló ya se reportó
  } finally {
    await db.end().catch(() => {});
  }

  console.log(fallos ? `\n✖ El flujo central falló (${resultados.filter((r) => r.ok).length} de ${resultados.length} pasos).\n` : `\n✔ Flujo central completo (${resultados.length} pasos).\n`);
  if (s.viaje) console.log(`Viaje de prueba: ${s.viaje.id}\n`);
  process.exit(fallos ? 1 : 0);
})();
