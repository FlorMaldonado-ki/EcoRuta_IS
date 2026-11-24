'use strict';
/**
 * URLs de la foto de perfil. La imagen se pide con <Image source={{ uri }}>,
 * que en web no puede mandar el header Authorization; por eso la URL lleva una
 * firma HMAC ligada al usuario y a la clave del archivo. Al cambiar la foto
 * cambia la clave y la URL anterior deja de servir.
 */
const crypto = require('crypto');
const env = require('../config/env');

const firmar = (usuarioId, key) =>
  crypto.createHmac('sha256', env.jwtSecret).update(`foto:${usuarioId}:${key}`).digest('base64url').slice(0, 32);

/** URL pública firmada, o null si el usuario no tiene foto. */
function urlFoto(usuarioId, key) {
  if (!usuarioId || !key) return null;
  return `${env.publicApiUrl}/api/fotos/${usuarioId}/${firmar(usuarioId, key)}`;
}

function firmaValida(usuarioId, key, firma) {
  if (!key || typeof firma !== 'string') return false;
  const esperada = Buffer.from(firmar(usuarioId, key));
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}

module.exports = { urlFoto, firmaValida };
