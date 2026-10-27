'use strict';
/**
 * Traduce cualquier error a la forma ApiError del contrato:
 *   { error: CODIGO, message: "texto para el usuario", fields?: { campo: "mensaje" } }
 * Incluye los errores que lanza la BD (triggers y constraints, ver db/README.md).
 */
const { AppError } = require('../shared/errors');

// Códigos que lanzan los triggers (mensaje "CODIGO: detalle", SQLSTATE 23514).
const ERRORES_BD = {
  DOMINIO_NO_PERMITIDO: [422, 'Solo se admiten correos institucionales.', 'email'],
  CARRERA_INVALIDA: [422, 'Selecciona una carrera de la lista.', 'career'],
  DEPARTAMENTO_INVALIDO: [422, 'Selecciona un departamento de la lista.', 'department'],
  DOCUMENTO_NO_CORRESPONDE: [422, 'El documento no corresponde a tu tipo de usuario.'],
  CONDUCTOR_NO_ACTIVO: [403, 'Verifica tu correo para publicar viajes.'],
  PASAJERO_NO_ACTIVO: [403, 'Verifica tu correo para reservar viajes.'],
  VEHICULO_INACTIVO: [422, 'Ese vehículo está desactivado.'],
  ASIENTOS_EXCEDEN_CAPACIDAD: [422, 'Ofreces más asientos de los que tiene tu vehículo.'],
  PUNTO_CAMPUS_INVALIDO: [422, 'Elige un punto del campus de la lista.'],
  RESERVA_PROPIA: [422, 'No puedes reservar tu propio viaje.'],
  VIAJE_NO_DISPONIBLE: [409, 'Este viaje ya no está disponible.'],
  SIN_ASIENTOS: [409, 'Ya no quedan lugares en este viaje.'],
  NO_PARTICIPANTE: [403, 'Solo quienes participaron en el viaje pueden calificar.'],
  VIAJE_NO_FINALIZADO: [409, 'El viaje aún no ha finalizado.'],
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.code, message: err.message, ...(err.fields && { fields: err.fields }) });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON_INVALIDO', message: 'El cuerpo de la petición no es JSON válido.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'PETICION_MUY_GRANDE', message: 'La petición es demasiado grande.' });
  }

  // Errores de PostgreSQL
  const codigo = /^([A-Z_]+):/.exec(err.message || '')?.[1];
  if (err.code === '23514' && ERRORES_BD[codigo]) {
    const [status, message, campo] = ERRORES_BD[codigo];
    return res.status(status).json({ error: codigo, message, ...(campo && { fields: { [campo]: message } }) });
  }
  if (err.code === '23505') {
    const duplicadoCorreo = err.constraint === 'uq_usuario_correo';
    return res.status(409).json({
      error: duplicadoCorreo ? 'CORREO_REGISTRADO' : 'DUPLICADO',
      message: duplicadoCorreo ? 'Este correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.' : 'El registro ya existe.',
      ...(duplicadoCorreo && { fields: { email: 'Este correo ya tiene una cuenta.' } }),
    });
  }
  if (err.code === '22P02') {
    return res.status(404).json({ error: 'NO_ENCONTRADO', message: 'No encontramos lo que buscas.' });
  }

  // Inesperado: CHECK que la API no validó antes, caída de la BD, bug…
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  const caida = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '57P01'].includes(err.code);
  return res.status(caida ? 503 : 500).json({
    error: caida ? 'SERVICIO_NO_DISPONIBLE' : 'ERROR_INTERNO',
    message: caida ? 'El servicio no está disponible por el momento. Intenta en unos minutos.' : 'Ocurrió un error inesperado. Intenta de nuevo.',
  });
}

function notFound(req, res) {
  res.status(404).json({ error: 'RUTA_NO_ENCONTRADA', message: `No existe ${req.method} ${req.path}` });
}

module.exports = { errorHandler, notFound };
