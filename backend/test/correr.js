#!/usr/bin/env node
'use strict';
/**
 * Corre todas las pruebas de test/ con el runner nativo de Node (node:test).
 *   npm test                         → unitarias (+ integración si hay TEST_DATABASE_URL)
 *   TEST_DATABASE_URL=... npm test   → también las de integración contra esa BD
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const raiz = __dirname;
const archivos = [];
(function recorrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(ruta);
    else if (e.name.endsWith('.test.js')) archivos.push(ruta);
  }
}(raiz));
archivos.sort();

if (!process.env.TEST_DATABASE_URL) {
  console.log('ℹ Sin TEST_DATABASE_URL: se omiten las pruebas de integración (necesitan PostgreSQL).\n');
}
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...archivos], { stdio: 'inherit' });
process.exit(r.status ?? 1);
