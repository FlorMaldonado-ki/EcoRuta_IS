'use strict';
/**
 * Lógica del módulo Autenticación y perfil (RF-01 a RF-05, RF-07).
 * Orquesta: mapper (validación/forma) → repository (SQL) → storage/mailer.
 */
const bcrypt = require('bcryptjs');
const env = require('../../config/env');
const { pool, withTransaction } = require('../../config/db');
const { AppError, ValidationError } = require('../../shared/errors');
const { nuevoToken, sha256 } = require('../../shared/tokens');
const storage = require('../../shared/storage');
const mailer = require('../../shared/mailer');
const catalogos = require('../catalogos/catalogos.service');
const repo = require('./auth.repository');
const mapper = require('./usuario.mapper');

const BCRYPT_COSTE = 10;
const VIGENCIA_VERIFICACION_MIN = 24 * 60; // RF-02: 24 horas
const VIGENCIA_RECUPERACION_MIN = 60;      // RF-04: 1 hora
// Hash fijo para comparar cuando el correo no existe: iguala el tiempo de respuesta
// y evita revelar qué correos están registrados.
const HASH_SENUELO = bcrypt.hashSync('contrasena-señuelo-ecoruta', BCRYPT_COSTE);

const enlaceVerificacion = (token) => `${env.publicApiUrl}/api/auth/verify-email?token=${token}`;
const enlaceRecuperacion = (token) => `${env.publicApiUrl}/api/auth/reset-password?token=${token}`;
const normalizarCorreo = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

function validarContrasena(password, confirmPassword) {
  const errors = {};
  if (typeof password !== 'string' || password.length < 8 || password.length > 72
      || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    errors.password = 'La contraseña debe tener al menos 8 caracteres y contener letras y números.';
  }
  if (password !== confirmPassword) errors.confirmPassword = 'Las contraseñas no coinciden.';
  if (Object.keys(errors).length) throw new ValidationError(errors);
}

// ── RF-01, RF-07 · Registro ──────────────────────────────────────────────────
async function registrar(body, file) {
  const ctx = await catalogos.contextoRegistro();
  const { usuario, documento } = mapper.parseRegistro(body, file, ctx);

  if (await repo.existeCorreo(pool, usuario.correo)) {
    throw new AppError(409, 'CORREO_REGISTRADO', 'Este correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.',
      { email: 'Este correo ya tiene una cuenta.' });
  }

  const hash = await bcrypt.hash(usuario.password, BCRYPT_COSTE);
  const storageKey = await storage.guardar(file.buffer, { carpeta: 'documentos', mime: documento.mime_type });
  const { token, hash: tokenHash } = nuevoToken();

  let creado;
  try {
    creado = await withTransaction(async (db) => {
      const fila = await repo.insertarUsuario(db, {
        ...usuario, institucion_id: ctx.institucionId, hash_contrasena: hash,
      });
      await repo.insertarDocumento(db, { ...documento, usuario_id: fila.id, storage_key: storageKey });
      await repo.crearToken(db, fila.id, 'verificacion', tokenHash, VIGENCIA_VERIFICACION_MIN);
      return fila;
    });
  } catch (err) {
    await storage.eliminar(storageKey); // no dejar archivos huérfanos
    throw err;
  }

  const emailSent = await mailer.enviarVerificacion(creado.correo, creado.nombre_completo, enlaceVerificacion(token));
  return {
    user: mapper.toUsuarioDTO(creado),
    emailSent,
    message: emailSent
      ? `Te enviamos un enlace de verificación a ${creado.correo}. Vence en 24 horas.`
      : 'Tu cuenta se creó, pero no pudimos enviar el correo. Solicita un nuevo enlace desde Iniciar sesión.',
  };
}

// ── RF-02 · Verificación de correo ──────────────────────────────────────────
async function verificarCorreo(token) {
  if (!token) return { ok: false, titulo: 'Enlace incompleto', texto: 'Abre el enlace completo que te enviamos por correo.' };
  const hash = sha256(String(token));
  const usuarioId = await withTransaction(async (db) => {
    const id = await repo.consumirToken(db, hash, 'verificacion');
    if (id) await repo.activarCuenta(db, id);
    return id;
  });
  if (usuarioId) {
    return { ok: true, titulo: '¡Correo verificado!', texto: 'Tu cuenta de EcoRuta Escolar ya está activa. Vuelve a la app e inicia sesión.' };
  }
  const { estado } = await repo.estadoToken(pool, hash, 'verificacion');
  const textos = {
    usado: ['Este enlace ya se usó', 'Tu correo ya estaba verificado. Puedes iniciar sesión en la app.'],
    expirado: ['El enlace venció', 'Los enlaces duran 24 horas. En la app, intenta iniciar sesión y pide un enlace nuevo.'],
    inexistente: ['Enlace no válido', 'Puede que hayas pedido un enlace más reciente. Usa el último correo que te enviamos.'],
  }[estado];
  return { ok: estado === 'usado', titulo: textos[0], texto: textos[1] };
}

async function reenviarVerificacion(correoCrudo) {
  const usuario = await repo.buscarPorCorreo(pool, normalizarCorreo(correoCrudo));
  if (usuario && usuario.estado === 'pendiente') {
    const { token, hash } = nuevoToken();
    await repo.crearToken(pool, usuario.id, 'verificacion', hash, VIGENCIA_VERIFICACION_MIN);
    await mailer.enviarVerificacion(usuario.correo, usuario.nombre_completo, enlaceVerificacion(token));
  }
  // Respuesta idéntica exista o no la cuenta (no revelar correos registrados).
  return { message: 'Si tu cuenta está pendiente de verificación, te enviamos un enlace nuevo.' };
}

// ── RF-03 · Inicio de sesión (RNF-06, RNF-11) ───────────────────────────────
async function iniciarSesion(body, firmarToken) {
  const correo = normalizarCorreo(body?.email);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!correo || !password) {
    throw new ValidationError({
      ...(!correo && { email: 'El correo institucional es obligatorio.' }),
      ...(!password && { password: 'La contraseña es obligatoria.' }),
    });
  }

  const usuario = await repo.buscarPorCorreo(pool, correo);
  const credencialesInvalidas = new AppError(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos.');

  if (!usuario) {
    await bcrypt.compare(password, HASH_SENUELO);
    throw credencialesInvalidas;
  }
  if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
    const min = Math.ceil((new Date(usuario.bloqueado_hasta) - Date.now()) / 60_000);
    throw new AppError(423, 'CUENTA_BLOQUEADA', `Demasiados intentos fallidos. Intenta de nuevo en ${min} min o restablece tu contraseña.`);
  }
  if (!(await bcrypt.compare(password, usuario.hash_contrasena))) {
    const bloqueadoHasta = await repo.registrarIntentoFallido(pool, usuario.id);
    if (bloqueadoHasta) {
      throw new AppError(423, 'CUENTA_BLOQUEADA', 'Demasiados intentos fallidos. Tu cuenta se bloqueó 15 minutos.');
    }
    throw credencialesInvalidas;
  }

  // La contraseña es correcta: ya podemos dar mensajes específicos.
  if (usuario.estado === 'pendiente') {
    throw new AppError(403, 'CORREO_NO_VERIFICADO', 'Aún no verificas tu correo. Revisa tu bandeja (y spam) o pide un enlace nuevo.');
  }
  if (usuario.estado === 'suspendido') {
    throw new AppError(403, 'CUENTA_SUSPENDIDA', 'Tu cuenta está suspendida. Contacta al administrador.');
  }

  await repo.registrarInicioExitoso(pool, usuario.id);
  return { token: firmarToken(usuario), user: mapper.toUsuarioDTO(usuario) };
}

// ── RF-04 · Recuperación de contraseña ──────────────────────────────────────
async function solicitarRecuperacion(correoCrudo) {
  const usuario = await repo.buscarPorCorreo(pool, normalizarCorreo(correoCrudo));
  if (usuario && usuario.estado !== 'suspendido') {
    const { token, hash } = nuevoToken();
    await repo.crearToken(pool, usuario.id, 'recuperacion', hash, VIGENCIA_RECUPERACION_MIN);
    await mailer.enviarRecuperacion(usuario.correo, usuario.nombre_completo, enlaceRecuperacion(token));
  }
  return { message: 'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.' };
}

async function tokenRecuperacionValido(token) {
  if (!token) return false;
  const { estado } = await repo.estadoToken(pool, sha256(String(token)), 'recuperacion');
  return estado === 'valido';
}

async function restablecerContrasena({ token, password, confirmPassword }) {
  validarContrasena(password, confirmPassword);
  const hash = await bcrypt.hash(password, BCRYPT_COSTE);
  const ok = await withTransaction(async (db) => {
    const usuarioId = await repo.consumirToken(db, sha256(String(token || '')), 'recuperacion');
    if (!usuarioId) return false;
    await repo.actualizarContrasena(db, usuarioId, hash);
    return true;
  });
  if (!ok) throw new AppError(400, 'ENLACE_INVALIDO', 'El enlace venció o ya se usó. Solicita uno nuevo desde la app.');
  return { message: 'Tu contraseña se actualizó. Ya puedes iniciar sesión en la app.' };
}

// ── RF-05 · Perfil ──────────────────────────────────────────────────────────
async function obtenerPerfil(usuarioId) {
  const usuario = await repo.buscarPorId(pool, usuarioId);
  if (!usuario) throw new AppError(404, 'NO_ENCONTRADO', 'No encontramos tu cuenta.');
  return mapper.toUsuarioDTO(usuario);
}

async function actualizarPerfil(usuarioId, body) {
  const actual = await repo.buscarPorId(pool, usuarioId);
  const ctx = await catalogos.contextoRegistro();
  const cambios = mapper.parseActualizacionPerfil(body || {}, actual, ctx);
  await repo.actualizarPerfil(pool, usuarioId, cambios);
  return obtenerPerfil(usuarioId);
}

module.exports = {
  registrar, verificarCorreo, reenviarVerificacion, iniciarSesion,
  solicitarRecuperacion, tokenRecuperacionValido, restablecerContrasena,
  obtenerPerfil, actualizarPerfil,
};
