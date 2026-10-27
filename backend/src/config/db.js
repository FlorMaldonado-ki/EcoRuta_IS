'use strict';
/**
 * Pool de conexiones a Neon (PostgreSQL).
 *
 * - DATABASE_URL es la cadena *pooled* de Neon (host con "-pooler").
 *   Las migraciones usan DATABASE_URL_DIRECT (ver db/migrate.js).
 * - Conversión de tipos para que el JSON salga con tipos de JavaScript reales:
 *     NUMERIC (1700) → number   (distancia_km, co2_kg; node-pg lo da como string)
 *     INT8    (20)   → number   (count(*); nuestros conteos jamás pasan de 2^53)
 */
const { Pool, types } = require('pg');
const env = require('./env');

types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000, // Neon "despierta" el cómputo suspendido en ~1-5 s
});

pool.on('error', (err) => {
  // Un cliente inactivo perdió la conexión (p. ej. Neon suspendió el cómputo).
  console.error('[db] error en cliente inactivo:', err.message);
});

/**
 * Ejecuta fn(client) dentro de una transacción (RNF-17, RNF-28).
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTransaction };
