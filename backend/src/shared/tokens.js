'use strict';
/**
 * Tokens de un solo uso para correos (verificación y recuperación).
 * Al usuario se le envía el token en claro; en la BD solo se guarda su SHA-256,
 * así una fuga de la tabla token_verificacion no permite usar los enlaces.
 */
const crypto = require('crypto');

const sha256 = (txt) => crypto.createHash('sha256').update(txt).digest('hex');

function nuevoToken() {
  const token = crypto.randomBytes(32).toString('base64url'); // 43 caracteres, seguro en URL
  return { token, hash: sha256(token) };
}

module.exports = { nuevoToken, sha256 };
