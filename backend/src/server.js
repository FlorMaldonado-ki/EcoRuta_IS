'use strict';
const env = require('./config/env');
const app = require('./app');
const { pool } = require('./config/db');
const mailer = require('./shared/mailer');
const storage = require('./shared/storage');

const server = app.listen(env.port, '0.0.0.0', async () => {
  console.log(`✔ EcoRuta API escuchando en el puerto ${env.port} (${env.nodeEnv})`);
  console.log(`  URL pública para correos: ${env.publicApiUrl}`);
  mailer.verificarConfiguracion();
  storage.verificarConfiguracion();
  try {
    const { rows } = await pool.query(
      "SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'usuario'");
    console.log(rows[0].n ? '✔ Conectado a PostgreSQL (esquema presente)'
      : '⚠ Conectado a PostgreSQL pero no hay tablas: ejecuta "npm run db:migrate"');
  } catch (err) {
    console.error('✖ No se pudo conectar a PostgreSQL:', err.message);
  }
});

// Apagado limpio (Render envía SIGTERM en cada deploy).
for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, () => {
    console.log(`\n${senal} recibido: cerrando…`);
    server.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
