#!/usr/bin/env node
/**
 * Genera los scripts para pegar en el SQL Editor de Neon (sin instalar nada):
 *   db/neon/01_esquema.sql     migraciones 001…N + registro en schema_migrations
 *   db/neon/02_seed_demo.sql   datos demo (solo ramas de desarrollo)
 *
 * Como 01_esquema.sql registra cada migración con el MISMO checksum que usa
 * db/migrate.js, después se puede seguir con `npm run db:migrate` sin conflictos.
 *
 * Uso: npm run db:bundle   (vuelve a correrlo cada vez que agregues una migración)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dir = (...p) => path.join(__dirname, ...p);
const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');
const outDir = dir('neon');
fs.mkdirSync(outDir, { recursive: true });

const archivos = fs.readdirSync(dir('migrations')).filter((f) => f.endsWith('.sql')).sort();

let sql = `-- =============================================================================
-- EcoRuta Escolar · Esquema completo para el SQL Editor de Neon
-- Generado por db/build-neon-bundle.js el ${new Date().toISOString()}
-- NO EDITAR A MANO: edita db/migrations/ y vuelve a generar con "npm run db:bundle".
-- Ejecutar UNA sola vez en una base vacía. Es una transacción: si algo falla, no se aplica nada.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  nombre      VARCHAR(255) PRIMARY KEY,
  checksum    CHAR(64)     NOT NULL,
  aplicada_en TIMESTAMPTZ  NOT NULL DEFAULT now()
);
`;

for (const nombre of archivos) {
  const contenido = fs.readFileSync(dir('migrations', nombre), 'utf8');
  sql += `\n-- >>>>>>>>>>>>>>>>>>>> ${nombre} >>>>>>>>>>>>>>>>>>>>\n${contenido}\n`;
  sql += `INSERT INTO schema_migrations (nombre, checksum) VALUES ('${nombre}', '${sha256(contenido)}');\n`;
}
sql += '\nCOMMIT;\n\nSELECT nombre, aplicada_en FROM schema_migrations ORDER BY nombre;\n';
fs.writeFileSync(path.join(outDir, '01_esquema.sql'), sql);

const seed = fs.readFileSync(dir('seeds', '001_demo.sql'), 'utf8');
fs.writeFileSync(path.join(outDir, '02_seed_demo.sql'),
  `-- Datos demo: SOLO para ramas de desarrollo de Neon. Contraseña de todas las cuentas: Demo1234\nBEGIN;\n${seed}\nCOMMIT;\n`);

console.log(`✔ db/neon/01_esquema.sql (${archivos.length} migraciones) y db/neon/02_seed_demo.sql generados.`);
