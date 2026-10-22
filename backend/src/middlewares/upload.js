'use strict';
/**
 * Subida del documento de registro (multipart/form-data, campo "document").
 * - En memoria (máx. 10 MB) para validarlo antes de guardarlo.
 * - Se revisan los "magic bytes": el mimeType que manda el cliente no basta.
 */
const multer = require('multer');
const { ValidationError } = require('../shared/errors');

const MAX_BYTES = 10 * 1024 * 1024;

const recibir = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 20, fieldSize: 10 * 1024 },
}).single('document');

/** Tipo real según los primeros bytes. */
function detectarMime(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}

const campoDocumento = (body) => (body?.userType === 'maestro' ? 'scheduleDoc' : 'academicCurriculumDoc');

function documentoRegistro(req, res, next) {
  recibir(req, res, (err) => {
    if (err) {
      const campo = campoDocumento(req.body);
      if (err.code === 'LIMIT_FILE_SIZE') return next(new ValidationError({ [campo]: 'El archivo excede 10 MB.' }));
      if (err.code === 'LIMIT_UNEXPECTED_FILE') return next(new ValidationError({ [campo]: 'Envía un solo archivo en el campo "document".' }));
      return next(err);
    }
    if (req.file) {
      const real = detectarMime(req.file.buffer);
      if (!real) {
        return next(new ValidationError({ [campoDocumento(req.body)]: 'Formatos soportados: PDF, PNG, JPG.' }));
      }
      req.file.mimetype = real; // confiamos en el contenido, no en lo declarado
    }
    next();
  });
}

module.exports = { documentoRegistro, detectarMime };
