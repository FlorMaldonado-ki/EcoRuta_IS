'use strict';
/**
 * URLs temporales para ver documentos de usuario (PDF o imagen).
 * El visor (Linking.openURL / <Image>) no puede mandar el header Authorization,
 * así que la API entrega a quien sí tiene permiso (el dueño o un administrador)
 * una URL firmada que caduca en pocos minutos. La firma liga el documento, la
 * clave del archivo y la hora de expiración (RNF-12: sin URLs públicas permanentes).
 */
const crypto = require('crypto');
const env = require('../config/env');

const VIGENCIA_SEGUNDOS = 10 * 60;

const firmar = (documentoId, storageKey, exp) =>
  crypto.createHmac('sha256', env.jwtSecret).update(`doc:${documentoId}:${storageKey}:${exp}`).digest('base64url');

/** @returns {{ url: string, expiresAt: string }} */
function urlDocumento(documentoId, storageKey, ahora = Date.now()) {
  const exp = Math.floor(ahora / 1000) + VIGENCIA_SEGUNDOS;
  return {
    url: `${env.publicApiUrl}/api/archivos/documentos/${documentoId}?exp=${exp}&sig=${firmar(documentoId, storageKey, exp)}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

function firmaDocumentoValida(documentoId, storageKey, exp, sig, ahora = Date.now()) {
  const n = Number(exp);
  if (!storageKey || typeof sig !== 'string' || !Number.isInteger(n) || n * 1000 < ahora) return false;
  const esperada = Buffer.from(firmar(documentoId, storageKey, n));
  const recibida = Buffer.from(sig);
  return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}

module.exports = { urlDocumento, firmaDocumentoValida, VIGENCIA_SEGUNDOS };
