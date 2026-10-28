#!/usr/bin/env node
/**
 * EcoRuta Escolar · Ejecutor de migraciones SQL
 * ---------------------------------------------------------------------------
 * Aplica en orden los archivos de db/migrations/*.sql que aún no se han
 * ejecutado y los registra en la tabla schema_migrations. Cada archivo corre
 * dentro de su propia transacción: si falla, no queda nada a medias.
 *
 * Uso:
 *   npm run db:migrate          aplica las migraciones pendientes
 *   npm run db:status           muestra aplicadas / pendientes
 *   npm run db:seed             carga datos de demostración (nunca en producción)
 *
 * Variables de entorno: DATABASE_URL (cadena de conexión de Neon, con
 * ?sslmode=require). Se lee de .env si existe.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

try { require('dotenv').config(); } catch { /* dotenv es opcional */ }

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const SEEDS_DIR = path.join(__dirname, 'seeds');
const NOMBRE_VALIDO = /^\d{3}_[a-z0-9_]+\.sql$/;

const sha256 = (txt) => crypto.createHash('sha256').update(txt).digest('hex');

function leerArchivos(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((nombre) => {
      if (!NOMBRE_VALIDO.test(nombre)) {
        throw new Error(`Nombre inválido: ${nombre}. Formato esperado: 009_descripcion_corta.sql`);
      }
      const sql = fs.readFileSync(path.join(dir, nombre), 'utf8');
      return { nombre, sql, checksum: sha256(sql) };
    });
}

async function conectar() {
  // Conexión DIRECTA (sin pooler): pg_advisory_lock es de sesión y PgBouncer
  // en modo transacción no lo garantiza. Si no existe, usa DATABASE_URL.
  const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Falta DATABASE_URL_DIRECT/DATABASE_URL (copia .env.example a .env).');
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      nombre      VARCHAR(255) PRIMARY KEY,
      checksum    CHAR(64)     NOT NULL,
      aplicada_en TIMESTAMPTZ  NOT NULL DEFAULT now()
    )`);
  return client;
}

async function aplicadas(client) {
  const { rows } = await client.query('SELECT nombre, checksum FROM schema_migrations');
  return new Map(rows.map((r) => [r.nombre, r.checksum]));
}

async function migrar() {
  const client = await conectar();
  try {
    // Evita que dos personas (o dos despliegues) migren al mismo tiempo.
    await client.query('SELECT pg_advisory_lock(20261018)');
    const hechas = await aplicadas(client);
    const archivos = leerArchivos(MIGRATIONS_DIR);

    // Una migración ya aplicada NO se edita: se crea una nueva.
    for (const a of archivos) {
      if (hechas.has(a.nombre) && hechas.get(a.nombre) !== a.checksum) {
        throw new Error(`La migración ${a.nombre} cambió después de aplicarse. ` +
          'No edites migraciones aplicadas; crea una nueva.');
      }
    }

    const pendientes = archivos.filter((a) => !hechas.has(a.nombre));
    if (pendientes.length === 0) {
      console.log('✔ Base de datos al día. No hay migraciones pendientes.');
      return;
    }
    for (const a of pendientes) {
      process.stdout.write(`→ Aplicando ${a.nombre} ... `);
      await client.query('BEGIN');
      try {
        await client.query(a.sql);
        await client.query(
          'INSERT INTO schema_migrations (nombre, checksum) VALUES ($1, $2)',
          [a.nombre, a.checksum],
        );
        await client.query('COMMIT');
        console.log('ok');
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('ERROR');
        throw new Error(`${a.nombre}: ${err.message}`);
      }
    }
    console.log(`✔ ${pendientes.length} migración(es) aplicada(s).`);
  } finally {
    await client.query('SELECT pg_advisory_unlock(20261018)').catch(() => {});
    await client.end();
  }
}

async function estado() {
  const client = await conectar();
  try {
    const hechas = await aplicadas(client);
    for (const a of leerArchivos(MIGRATIONS_DIR)) {
      const marca = !hechas.has(a.nombre) ? '[pendiente]'
        : hechas.get(a.nombre) === a.checksum ? '[aplicada] ' : '[¡MODIFICADA!]';
      console.log(`${marca} ${a.nombre}`);
    }
  } finally {
    await client.end();
  }
}

async function sembrar() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('db:seed está bloqueado en producción.');
  }
  const client = await conectar();
  try {
    for (const s of leerArchivos(SEEDS_DIR)) {
      process.stdout.write(`→ Sembrando ${s.nombre} ... `);
      await client.query('BEGIN');
      try {
        await client.query(s.sql);
        await client.query('COMMIT');
        console.log('ok');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`${s.nombre}: ${err.message}`);
      }
    }
  } finally {
    await client.end();
  }
}

const comandos = { up: migrar, status: estado, seed: sembrar };
const cmd = process.argv[2] || 'up';

if (!comandos[cmd]) {
  console.error(`Comando desconocido: ${cmd}. Usa: up | status | seed`);
  process.exit(1);
}
comandos[cmd]().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exit(1);
});
