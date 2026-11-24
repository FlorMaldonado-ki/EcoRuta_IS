'use strict';
/**
 * Panel de administración. TODAS las rutas exigen sesión con rol 'admin' (403 SIN_PERMISO si no).
 *
 *   GET   /api/admin/resumen                       indicadores (RF-30)
 *   GET   /api/admin/documentos?status=&type=&userId=&q=&from=&to=&order=&page=
 *   GET   /api/admin/documentos/:id                detalle con URL temporal para verlo
 *   PATCH /api/admin/documentos/:id                { action: approve|reject, reason? } (reject exige reason)
 *   GET   /api/admin/reportes?filter=recent|oldest|read|unread|all&reportedUserId=&reason=&q=&page=
 *   GET   /api/admin/reportes/recurrentes          usuarios con 6 o más reportes históricos
 *   GET   /api/admin/reportes/:id
 *   PATCH /api/admin/reportes/:id                  { read?, status?, note? }
 *   GET   /api/admin/usuarios?q=&status=&page=
 *   GET   /api/admin/usuarios/:id
 *   PATCH /api/admin/usuarios/:id                  { action: suspend|activate } (RF-29)
 *   GET   /api/admin/usuarios/:id/calificaciones?page=
 */
const { Router } = require('express');
const service = require('./admin.service');
const { requireAuth, requireRole } = require('../../middlewares/auth');
const { esUuid } = require('../../shared/validacion');
const { AppError } = require('../../shared/errors');

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const id = (req) => {
  if (!esUuid(req.params.id)) throw new AppError(404, 'NO_ENCONTRADO', 'No encontramos lo que buscas.');
  return req.params.id;
};

const admin = Router();
admin.use(requireAuth, requireRole('admin'));

admin.get('/resumen', h(async (_req, res) => res.json(await service.resumen())));

admin.get('/documentos', h(async (req, res) => res.json(await service.listarDocumentos(req.query))));
admin.get('/documentos/:id', h(async (req, res) => res.json(await service.obtenerDocumento(id(req)))));
admin.patch('/documentos/:id', h(async (req, res) => res.json(await service.revisarDocumento(id(req), req.user.id, req.body))));

admin.get('/reportes', h(async (req, res) => res.json(await service.listarReportes(req.query))));
admin.get('/reportes/recurrentes', h(async (_req, res) => res.json(await service.recurrentes())));
admin.get('/reportes/:id', h(async (req, res) => res.json(await service.obtenerReporte(id(req)))));
admin.patch('/reportes/:id', h(async (req, res) => res.json(await service.actualizarReporte(id(req), req.user.id, req.body))));

admin.get('/usuarios', h(async (req, res) => res.json(await service.listarUsuarios(req.query))));
admin.get('/usuarios/:id', h(async (req, res) => res.json(await service.obtenerUsuario(id(req)))));
admin.patch('/usuarios/:id', h(async (req, res) => res.json(await service.cambiarEstadoUsuario(id(req), req.user.id, req.body))));
admin.get('/usuarios/:id/calificaciones', h(async (req, res) => res.json(await service.calificacionesDeUsuario(id(req), req.query))));

module.exports = { admin };
