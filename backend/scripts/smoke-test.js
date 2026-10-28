#!/usr/bin/env node
/**
 * Prueba rápida de una API desplegada (local o Render). No modifica datos,
 * salvo el contador de intentos de la cuenta demo, que se reinicia al entrar.
 *
 *   npm run test:smoke                                    → http://localhost:3000
 *   npm run test:smoke -- https://ecoruta-api.onrender.com
 *
 * Requiere haber cargado el seed demo (cuenta demo.ana@morelia.tecnm.mx).
 */
'use strict';
const base = (process.argv[2] || process.env.API_URL || 'http://localhost:3000').replace(/\/+$/, '');
let fallos = 0;

async function paso(nombre, fn) {
  try {
    const detalle = await fn();
    console.log(`  ✔ ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  } catch (err) {
    fallos++;
    console.log(`  ✖ ${nombre} — ${err.message}`);
  }
}

async function pedir(ruta, opciones = {}) {
  const res = await fetch(base + ruta, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) },
    signal: AbortSignal.timeout(70_000), // Render gratis puede tardar ~50 s en despertar
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

const esperar = (cond, msg) => { if (!cond) throw new Error(msg); };

(async () => {
  console.log(`\nSmoke test contra ${base}\n`);
  let token;

  await paso('GET /api/health (API + Neon)', async () => {
    const r = await pedir('/api/health');
    esperar(r.status === 200 && r.body.db === 'ok', `status ${r.status} ${JSON.stringify(r.body)}`);
  });
  await paso('GET /api/catalogos', async () => {
    const r = await pedir('/api/catalogos');
    esperar(r.status === 200 && r.body.careers.length > 0, `status ${r.status}`);
    return `${r.body.careers.length} carreras, ${r.body.departments.length} departamentos`;
  });
  await paso('POST /api/auth/register sin datos → 422 con campos', async () => {
    const r = await pedir('/api/auth/register', { method: 'POST', body: '{}' });
    esperar(r.status === 422 && r.body.fields?.userType, `status ${r.status}`);
    return Object.keys(r.body.fields).join(', ');
  });
  await paso('POST /api/auth/login contraseña incorrecta → 401', async () => {
    const r = await pedir('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'nadie@morelia.tecnm.mx', password: 'x1234567' }) });
    esperar(r.status === 401, `status ${r.status}`);
  });
  await paso('POST /api/auth/login cuenta demo', async () => {
    const r = await pedir('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'demo.ana@morelia.tecnm.mx', password: 'Demo1234' }) });
    esperar(r.status === 200 && r.body.token, `status ${r.status} ${r.body?.message || ''} (¿cargaste el seed?)`);
    token = r.body.token;
    return `${r.body.user.fullName} (${r.body.user.userType})`;
  });
  await paso('GET /api/me con token', async () => {
    const r = await pedir('/api/me', { headers: { Authorization: `Bearer ${token}` } });
    esperar(r.status === 200 && r.body.email, `status ${r.status}`);
    esperar(!JSON.stringify(r.body).includes('hash'), 'la respuesta expone el hash');
  });
  await paso('GET /api/me sin token → 401', async () => {
    const r = await pedir('/api/me');
    esperar(r.status === 401, `status ${r.status}`);
  });
  await paso('GET /api/impacto/comunidad', async () => {
    const r = await pedir('/api/impacto/comunidad');
    esperar(r.status === 200 && typeof r.body.co2SavedKg === 'number', `status ${r.status}`);
    return `${r.body.co2SavedKg} kg CO2`;
  });

  console.log(fallos ? `\n✖ ${fallos} prueba(s) fallaron.\n` : '\n✔ Todo en orden.\n');
  process.exit(fallos ? 1 : 0);
})();
