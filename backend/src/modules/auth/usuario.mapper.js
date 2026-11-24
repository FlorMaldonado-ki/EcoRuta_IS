'use strict';
/**
 * Mapper del módulo Autenticación y perfil.
 *
 *  Cliente (camelCase, src/types/registration.ts)  ⇄  BD (snake_case, tabla usuario)
 *
 * Reglas:
 *  1. Entrada  → `parseRegistro()` valida, normaliza y devuelve la fila a insertar.
 *     Los errores usan las MISMAS claves que `FormErrors` del frontend, así la
 *     pantalla puede hacer `setErrors(resp.fields)` sin traducir nada.
 *  2. Salida   → `toUsuarioDTO()` / `toUsuarioPublicoDTO()` eligen columna por
 *     columna qué se expone. Nunca `SELECT *` directo a `res.json()`.
 *  3. Los valores de dominio se traducen en un único lugar (TIPO_*).
 */

const { ValidationError } = require('../../shared/errors');
const { urlFoto } = require('../../shared/fotos');

const TIPO_CLIENTE_A_BD = Object.freeze({ alumno: 'estudiante', maestro: 'docente' });
const TIPO_BD_A_CLIENTE = Object.freeze({ estudiante: 'alumno', docente: 'maestro' });
const DOCUMENTO_POR_TIPO = Object.freeze({ estudiante: 'reticula_academica', docente: 'carga_horaria' });
const MIME_PERMITIDOS = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const MAX_BYTES = 10 * 1024 * 1024;

const str = (v) => (typeof v === 'string' ? v.trim() : '');
// multipart/form-data manda todo como texto: "true", "on", "1".
const bool = (v) => v === true || v === 'true' || v === 'on' || v === '1';

/**
 * Convierte el payload de registro en la fila de `usuario` + metadatos del documento.
 *
 * El registro llega como multipart/form-data (lleva un archivo):
 *   campos: userType, fullName, email, password, confirmPassword,
 *           termsAccepted, career | department
 *   archivo: document  (academicCurriculumDoc o scheduleDoc del formulario)
 *
 * @param {Record<string, unknown>} body   req.body (multer)
 * @param {{ originalname: string, mimetype: string, size: number } | undefined} file  req.file
 * @param {{ dominios: string[], carreras: string[], departamentos: string[] }} ctx  institución + catálogos
 */
function parseRegistro(body, file, ctx) {
  /** @type {Record<string, string>} */
  const errors = {};

  const userType = str(body.userType);
  const tipo = TIPO_CLIENTE_A_BD[userType];
  if (!tipo) errors.userType = 'Debes seleccionar obligatoriamente si eres Alumno o Maestro.';

  const fullName = str(body.fullName).replace(/\s+/g, ' ');
  if (fullName.length < 4) errors.fullName = 'Ingresa tu nombre y apellidos completos.';
  else if (fullName.length > 120) errors.fullName = 'El nombre no puede exceder 120 caracteres.';

  const email = str(body.email).toLowerCase();
  if (!email) errors.email = 'El correo institucional es obligatorio.';
  else if (!ctx.dominios.includes(email.split('@')[1]))
    errors.email = `Solo se admiten correos institucionales del dominio @${ctx.dominios[0]}`;
  else if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email))
    errors.email = 'El formato del correo institucional no es válido.';

  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8 || password.length > 72 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))
    errors.password = 'La contraseña debe tener al menos 8 caracteres y contener letras y números.';
  if (password !== body.confirmPassword) errors.confirmPassword = 'Las contraseñas no coinciden.';

  if (!bool(body.termsAccepted))
    errors.termsAccepted = 'Debes aceptar los términos de uso y el aviso de privacidad para registrarte.';

  let carrera = null;
  let departamento = null;
  const docField = tipo === 'docente' ? 'scheduleDoc' : 'academicCurriculumDoc';
  if (tipo === 'estudiante') {
    carrera = str(body.career);
    if (!ctx.carreras.includes(carrera)) errors.career = 'Debes seleccionar tu carrera.';
  } else if (tipo === 'docente') {
    departamento = str(body.department);
    if (!ctx.departamentos.includes(departamento))
      errors.department = 'Debes seleccionar tu área académica o departamento.';
  }

  if (tipo) {
    if (!file) errors[docField] = 'Es obligatorio adjuntar el documento institucional.';
    else if (!MIME_PERMITIDOS.has(file.mimetype)) errors[docField] = 'Formatos soportados: PDF, PNG, JPG.';
    else if (file.size > MAX_BYTES) errors[docField] = 'El archivo excede 10 MB.';
  }

  if (Object.keys(errors).length) throw new ValidationError(errors);

  return {
    usuario: {
      nombre_completo: fullName,
      correo: email,
      password, // el service la convierte a hash_contrasena con bcrypt y la descarta
      tipo,
      carrera,
      departamento,
      acepto_terminos_en: new Date(),
    },
    documento: {
      tipo: DOCUMENTO_POR_TIPO[tipo],
      nombre_archivo: file.originalname.slice(0, 255),
      mime_type: file.mimetype,
      tamano_bytes: file.size,
    },
  };
}

/**
 * Perfil propio (GET /api/me, respuesta de login). Incluye teléfono y estado.
 * `role` = rol de seguridad; `userType` = alumno/maestro. Son cosas distintas.
 */
function toUsuarioDTO(row) {
  return {
    id: row.id,
    fullName: row.nombre_completo,
    email: row.correo,
    userType: TIPO_BD_A_CLIENTE[row.tipo],
    career: row.carrera,
    department: row.departamento,
    phone: row.telefono,
    role: row.rol === 'admin' ? 'admin' : 'user',
    status: row.estado === 'activo' ? 'active' : row.estado === 'pendiente' ? 'pending' : 'suspended',
    emailVerified: row.verificado_en !== null,
    photoUrl: urlFoto(row.id, row.foto_storage_key),
    createdAt: row.creado_en,
    ...(row.calificacion_promedio !== undefined && {
      ratingAverage: row.calificacion_promedio,
      ratingCount: row.calificaciones ?? 0,
    }),
  };
}

/**
 * Datos mínimos de OTRO usuario (RNF-12): nombre y adscripción.
 * El teléfono solo se añade si quien consulta tiene una reserva aceptada con él.
 */
function toUsuarioPublicoDTO(row, { incluirTelefono = false } = {}) {
  return {
    id: row.id,
    fullName: row.nombre_completo,
    userType: TIPO_BD_A_CLIENTE[row.tipo],
    affiliation: row.carrera ?? row.departamento,
    ...(incluirTelefono && { phone: row.telefono }),
  };
}

/**
 * PATCH /api/me (RF-05, RNF-09, SCRUM-45). Lista blanca: fullName, phone y
 * career (alumno) o department (maestro). Cualquier otro campo (email, userType,
 * status, role, password…) se IGNORA: nunca llega al UPDATE.
 */
const CAMPOS_PERFIL = Object.freeze(['fullName', 'phone', 'career', 'department']);

function parseActualizacionPerfil(body, usuarioActual, ctx) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError({}, 'Envía los datos del perfil.');
  }
  const errors = {};
  const cambios = {};
  const vacio = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

  if (body.fullName !== undefined) {
    const v = str(body.fullName).replace(/\s+/g, ' ');
    if (v.length < 4) errors.fullName = 'Ingresa tu nombre y apellidos completos.';
    else if (v.length > 120) errors.fullName = 'El nombre no puede exceder 120 caracteres.';
    else cambios.nombre_completo = v;
  }

  if (!vacio(body.career)) {
    if (usuarioActual.tipo !== 'estudiante') errors.career = 'Solo los alumnos registran carrera.';
    else if (!ctx.carreras.includes(str(body.career))) errors.career = 'Selecciona una carrera de la lista.';
    else cambios.carrera = str(body.career);
  }
  if (!vacio(body.department)) {
    if (usuarioActual.tipo !== 'docente') errors.department = 'Solo los maestros registran departamento.';
    else if (!ctx.departamentos.includes(str(body.department))) errors.department = 'Selecciona un departamento de la lista.';
    else cambios.departamento = str(body.department);
  }

  if (body.phone !== undefined) {
    if (vacio(body.phone)) cambios.telefono = null; // el teléfono es opcional (RF-05)
    else {
      const crudo = String(body.phone);
      const digitos = crudo.replace(/[\s\-().]/g, '').replace(/^\+?52(?=\d{10}$)/, '');
      if (!/^\d{10}$/.test(digitos)) errors.phone = 'El teléfono debe tener 10 dígitos.';
      else cambios.telefono = digitos;
    }
  }

  if (Object.keys(errors).length) throw new ValidationError(errors);
  return cambios;
}

module.exports = {
  TIPO_CLIENTE_A_BD,
  TIPO_BD_A_CLIENTE,
  ValidationError,
  parseRegistro,
  parseActualizacionPerfil,
  CAMPOS_PERFIL,
  toUsuarioDTO,
  toUsuarioPublicoDTO,
};
