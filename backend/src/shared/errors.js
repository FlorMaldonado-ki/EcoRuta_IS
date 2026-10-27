'use strict';

/** Error de negocio con código estable que el cliente puede interpretar. */
class AppError extends Error {
  /**
   * @param {number} status   código HTTP
   * @param {string} code     código estable en MAYÚSCULAS (p. ej. CORREO_NO_VERIFICADO)
   * @param {string} message  mensaje en español para mostrar al usuario (RNF-24)
   * @param {Record<string,string>} [fields] errores por campo (mismas claves que FormErrors)
   */
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/** Errores de validación de formulario (422). Claves = FormErrors del frontend. */
class ValidationError extends AppError {
  /** @param {Record<string,string>} fields */
  constructor(fields, message = 'Revisa los campos marcados.') {
    super(422, 'VALIDATION', message, fields);
  }
}

module.exports = { AppError, ValidationError };
