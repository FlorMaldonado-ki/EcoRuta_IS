'use strict';
/**
 * Autenticación JWT (RNF-06) y control de rol (RNF-09).
 * La API es stateless (RNF-16): todo lo necesario va en el token.
 * Además se consulta el estado actual del usuario para que una suspensión
 * (RF-29) surta efecto de inmediato, sin esperar a que caduque el JWT.
 */
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { pool } = require('../config/db');
const { AppError } = require('../shared/errors');

function firmarToken(usuario) {
  return jwt.sign({ rol: usuario.rol }, env.jwtSecret, {
    subject: usuario.id,
    expiresIn: env.jwtExpiresIn,
    issuer: 'ecoruta-api',
  });
}

async function requireAuth(req, _res, next) {
  try {
    const [tipo, token] = (req.headers.authorization || '').split(' ');
    if (tipo !== 'Bearer' || !token) throw new AppError(401, 'NO_AUTENTICADO', 'Inicia sesión para continuar.');

    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret, { issuer: 'ecoruta-api' });
    } catch (err) {
      const expirado = err.name === 'TokenExpiredError';
      throw new AppError(401, expirado ? 'SESION_EXPIRADA' : 'TOKEN_INVALIDO',
        expirado ? 'Tu sesión expiró. Vuelve a iniciar sesión.' : 'Sesión no válida. Vuelve a iniciar sesión.');
    }

    const { rows } = await pool.query('SELECT estado, rol FROM usuario WHERE id = $1', [payload.sub]);
    if (!rows[0]) throw new AppError(401, 'TOKEN_INVALIDO', 'Sesión no válida. Vuelve a iniciar sesión.');
    if (rows[0].estado === 'suspendido') throw new AppError(403, 'CUENTA_SUSPENDIDA', 'Tu cuenta está suspendida. Contacta al administrador.');

    req.user = { id: payload.sub, rol: rows[0].rol, estado: rows[0].estado };
    next();
  } catch (err) {
    next(err);
  }
}

const requireRole = (rol) => (req, _res, next) =>
  next(req.user?.rol === rol ? undefined : new AppError(403, 'SIN_PERMISO', 'No tienes permiso para esta acción.'));

module.exports = { firmarToken, requireAuth, requireRole };
