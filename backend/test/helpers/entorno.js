'use strict';
/**
 * Prepara el entorno de las pruebas de integración ANTES de cargar la app.
 * Usan TEST_DATABASE_URL: una rama de Neon de pruebas o un PostgreSQL local con
 * las migraciones aplicadas. Nunca la rama main (las pruebas crean y borran datos).
 *
 *   TEST_DATABASE_URL=postgresql://... npm test
 *
 * Sin TEST_DATABASE_URL, las pruebas de integración se omiten.
 */
const url = process.env.TEST_DATABASE_URL;
const disponible = Boolean(url);
if (disponible) {
  process.env.DATABASE_URL = url;
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas-0123456789-abcdef';
  process.env.NODE_ENV = 'test';
  process.env.ROUTING_PROVIDER = 'haversine'; // sin depender de internet
  process.env.MAIL_DRIVER = 'console';
  process.env.STORAGE_DRIVER = 'local';
  process.env.PG_POOL_MAX = process.env.PG_POOL_MAX || '25';
}
const omitir = disponible ? false : 'define TEST_DATABASE_URL para correr las pruebas de integración';
module.exports = { disponible, omitir };
