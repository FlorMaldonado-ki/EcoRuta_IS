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
  VEHICULO_INACTIVO: [422, 'Ese vehículo está desactivado.', 'vehicleId'],
  ASIENTOS_EXCEDEN_CAPACIDAD: [422, 'Ofreces más asientos de los que tiene tu vehículo.', 'seats'],
  PUNTO_CAMPUS_INVALIDO: [422, 'Elige un punto del campus de la lista.', 'campusPoint'],
  RESERVA_PROPIA: [422, 'No puedes reservar tu propio viaje.'],
  VIAJE_NO_DISPONIBLE: [409, 'Este viaje ya no está disponible.'],
  SIN_ASIENTOS: [409, 'Ya no quedan lugares en este viaje.'],
  NO_PARTICIPANTE: [403, 'Solo quienes participaron en el viaje pueden calificar.'],
  VIAJE_NO_FINALIZADO: [409, 'El viaje aún no ha finalizado.'],
};

// Restricciones UNIQUE (SQLSTATE 23505) → [código, mensaje, campo].
const DUPLICADOS = {
  uq_usuario_correo: ['CORREO_REGISTRADO', 'Este correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.', 'email'],
  uq_vehiculo_usuario_placas: ['PLACAS_REGISTRADAS', 'Ya registraste un vehículo con esas placas.', 'plates'],
  uq_reserva_viaje_pasajero_vigente: ['RESERVA_DUPLICADA', 'Ya tienes una solicitud en este viaje.'],
  uq_impacto_viaje: ['IMPACTO_YA_REGISTRADO', 'El impacto de este viaje ya se registró.'],
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
    const [codigoDup, mensaje, campo] = DUPLICADOS[err.constraint] || ['DUPLICADO', 'El registro ya existe.'];
    return res.status(409).json({ error: codigoDup, message: mensaje, ...(campo && { fields: { [campo]: mensaje } }) });
  }
  if (err.code === '23503') {
    return res.status(422).json({ error: 'REFERENCIA_INVALIDA', message: 'Uno de los datos hace referencia a algo que no existe.' });
  }
  if (err.code === '23514') {
    // CHECK que la API debió validar antes: se registra para corregir la validación (db/README.md).
    console.error(`[error] ${req.method} ${req.originalUrl} CHECK no validado en la API: ${err.constraint || err.message}`);
    return res.status(422).json({ error: 'DATOS_INVALIDOS', message: 'Revisa los datos enviados.' });
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
