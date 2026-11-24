'use strict';
/**
 * Rutas del módulo Autenticación y perfil.
 *
 *   POST  /api/auth/register              multipart: campos del formulario + archivo "document"
 *   POST  /api/auth/login                 { email, password } → { token, user }
 *   GET   /api/auth/verify-email?token=   página HTML (se abre desde el correo)
 *   POST  /api/auth/resend-verification   { email }
 *   POST  /api/auth/forgot-password       { email }
 *   GET   /api/auth/reset-password?token= formulario HTML (se abre desde el correo)
 *   POST  /api/auth/reset-password        { token, password, confirmPassword } (JSON o formulario)
 *   GET   /api/me                         perfil propio
 *   PATCH /api/me                         { fullName?, career?, department?, phone? }
 *   PUT   /api/me/foto                    multipart: "photo" (PNG/JPG, 5 MB) → perfil
 *   GET   /api/fotos/:usuarioId/:firma     imagen (URL firmada que viene en photoUrl)
 *
 * Cerrar sesión (RF-03): la API es stateless; el cliente descarta el token.
 */
const { Router } = require('express');
const service = require('./auth.service');
const { firmarToken, requireAuth } = require('../../middlewares/auth');
const { documentoRegistro, fotoPerfil } = require('../../middlewares/upload');
const { esUuid } = require('../../shared/validacion');
const limites = require('../../middlewares/rateLimits');
const paginas = require('../../shared/paginas');
const { ValidationError, AppError } = require('../../shared/errors');

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const auth = Router();

auth.post('/register', limites.correos, documentoRegistro, h(async (req, res) => {
  res.status(201).json(await service.registrar(req.body, req.file));
}));

auth.post('/login', limites.login, h(async (req, res) => {
  res.json(await service.iniciarSesion(req.body, firmarToken));
}));

auth.get('/verify-email', h(async (req, res) => {
  const r = await service.verificarCorreo(req.query.token);
  res.status(r.ok ? 200 : 400).type('html').send(paginas.mensaje(r.titulo, r.texto, r.ok ? 'ok' : 'error'));
}));

auth.post('/resend-verification', limites.correos, h(async (req, res) => {
  res.json(await service.reenviarVerificacion(req.body?.email));
}));

auth.post('/forgot-password', limites.correos, h(async (req, res) => {
  res.json(await service.solicitarRecuperacion(req.body?.email));
}));

auth.get('/reset-password', h(async (req, res) => {
  if (!(await service.tokenRecuperacionValido(req.query.token))) {
    return res.status(400).type('html').send(paginas.mensaje('Enlace no válido',
      'El enlace venció o ya se usó. Solicita uno nuevo desde "¿Olvidaste tu contraseña?" en la app.', 'error'));
  }
  res.type('html').send(paginas.formularioContrasena(req.query.token));
}));

auth.post('/reset-password', limites.login, async (req, res, next) => {
  const desdeFormulario = req.is('application/x-www-form-urlencoded');
  try {
    const r = await service.restablecerContrasena(req.body || {});
    if (desdeFormulario) return res.type('html').send(paginas.mensaje('Contraseña actualizada', r.message, 'ok'));
    res.json(r);
  } catch (err) {
    if (!desdeFormulario) return next(err);
    if (err instanceof ValidationError) {
      const msg = Object.values(err.fields).join(' ');
      return res.status(422).type('html').send(paginas.formularioContrasena(req.body.token, msg));
    }
    if (err instanceof AppError) return res.status(err.status).type('html').send(paginas.mensaje('No se pudo actualizar', err.message, 'error'));
    next(err);
  }
});

const me = Router();
me.use(requireAuth);
me.get('/', h(async (req, res) => res.json(await service.obtenerPerfil(req.user.id))));
me.patch('/', h(async (req, res) => res.json(await service.actualizarPerfil(req.user.id, req.body))));
me.put('/foto', fotoPerfil, h(async (req, res) => res.json(await service.actualizarFoto(req.user.id, req.file))));

const fotos = Router();
fotos.get('/:usuarioId/:firma', h(async (req, res) => {
  const foto = esUuid(req.params.usuarioId) ? await service.leerFoto(req.params.usuarioId, req.params.firma) : null;
  if (!foto) throw new AppError(404, 'FOTO_NO_ENCONTRADA', 'No encontramos esa foto.');
  res.set({
    'Content-Type': foto.mime,
    'Cache-Control': 'private, max-age=86400',
    'Cross-Origin-Resource-Policy': 'cross-origin', // Expo Web la carga desde otro origen
  });
  res.send(foto.contenido);
}));

module.exports = { auth, me, fotos };
