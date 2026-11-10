'use strict';
/** Limitación de intentos (RNF-11). El bloqueo tras 5 fallos vive en la BD (auth.service). */
const { rateLimit } = require('express-rate-limit');

// Si el cuerpo aún no se leyó (p. ej. el archivo del registro), se consume antes de
// responder: Android corta la conexión si el servidor contesta a mitad de la subida
// y la app solo vería "No se pudo conectar" en lugar del 429.
const respuesta = (message) => (req, res) => {
  const enviar = () => res.status(429).json({ error: 'DEMASIADOS_INTENTOS', message });
  if (req.readableEnded) return enviar();
  req.once('end', enviar).once('error', enviar).resume();
};

const base = { standardHeaders: 'draft-7', legacyHeaders: false };
const enProduccion = process.env.NODE_ENV === 'production';
// Límites configurables (RNF-11). En el campus muchos usuarios comparten la misma IP
// pública, así que el general debe ser holgado; ajustarlo en Render con RATE_LIMIT_GENERAL.
const limite = (variable, prod, dev) => Number(process.env[variable]) || (enProduccion ? prod : dev);

module.exports = {
  // Inicio de sesión: 20 intentos por IP cada 15 min.
  login: rateLimit({ ...base, windowMs: 15 * 60_000, limit: limite('RATE_LIMIT_LOGIN', 20, 20),
    handler: respuesta('Demasiados intentos de inicio de sesión. Espera unos minutos.') }),
  // Todo lo que envía correo: 8 por IP cada hora (30 en desarrollo).
  correos: rateLimit({ ...base, windowMs: 60 * 60_000, limit: limite('RATE_LIMIT_CORREOS', 8, 30),
    handler: respuesta('Has solicitado demasiados correos. Intenta más tarde.') }),
  // General para la API: 300 por IP cada 15 min en producción (5000 en desarrollo/pruebas).
  general: rateLimit({ ...base, windowMs: 15 * 60_000, limit: limite('RATE_LIMIT_GENERAL', 300, 5000),
    handler: respuesta('Demasiadas peticiones. Intenta en unos minutos.') }),
};
