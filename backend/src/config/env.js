'use strict';
/**
 * Configuración centralizada. Se valida al arrancar: si falta algo crítico, la
 * API no inicia (mejor fallar en el deploy que a media petición).
 */
require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

function required(name) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Falta la variable de entorno ${name} (revisa .env / Render).`);
  return v.trim();
}

const env = {
  isProd,
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  publicApiUrl: (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, ''),
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  mail: {
    driver: process.env.MAIL_DRIVER || 'console',
    from: process.env.MAIL_FROM || 'EcoRuta Escolar <no-reply@ecoruta.app>',
    smtp: {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: (process.env.SMTP_SECURE || 'true') === 'true',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  },
  storage: {
    driver: process.env.STORAGE_DRIVER || 'local',
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
    },
  },
};

if (isProd) {
  if (env.jwtSecret.length < 32 || env.jwtSecret.startsWith('cambia-esto')) {
    throw new Error('JWT_SECRET de producción debe ser aleatorio y de al menos 32 caracteres.');
  }
  if (env.storage.driver === 'local') {
    console.warn('[env] STORAGE_DRIVER=local en producción: los documentos se perderán en cada deploy de Render.');
  }
  if (env.mail.driver === 'console') {
    console.warn('[env] MAIL_DRIVER=console en producción: los correos solo se verán en los logs.');
  }
}

module.exports = env;
