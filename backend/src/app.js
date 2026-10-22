'use strict';
/**
 * Aplicación Express (monolito modular, RNF-15). Cada módulo monta sus rutas
 * bajo /api/<modulo>. Este archivo solo arma middlewares transversales.
 */
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const { pool } = require('./config/db');
const limites = require('./middlewares/rateLimits');
const { errorHandler, notFound } = require('./middlewares/errorHandler');
const { auth, me } = require('./modules/auth/auth.routes');
const catalogos = require('./modules/catalogos/catalogos.routes');
const impacto = require('./modules/impacto/impacto.routes');

const app = express();

app.set('trust proxy', 1); // Render está detrás de un proxy: IP real para el rate limit
app.disable('x-powered-by');

app.use(helmet()); // cabeceras seguras (RNF-10)
app.use(cors({
  // La app nativa no envía Origin, así que no le afecta. Expo Web sí: se limita a CORS_ORIGINS.
  origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin) || (!env.isProd && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))),
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' })); // formulario HTML de nueva contraseña

if (!env.isProd) {
  app.use((req, _res, next) => { console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`); next(); });
}

app.get('/', (_req, res) => res.json({ name: 'EcoRuta Escolar API', docs: '/api/health' }));

// Salud: lo usa Render (health check) y la app para "despertar" el servicio.
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok', time: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'error', message: err.message });
  }
});

app.use('/api', limites.general);
app.use('/api/auth', auth);
app.use('/api/me', me);
app.use('/api/catalogos', catalogos);
app.use('/api/impacto', impacto);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
