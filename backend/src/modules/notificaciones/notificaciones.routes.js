'use strict';
/**
 * Rutas del módulo Notificaciones. Todas requieren sesión y solo tocan las del usuario.
 *
 *   GET   /api/me/notificaciones               bandeja (72 h, máx. 50) → { items, unread, summary }
 *   PATCH /api/me/notificaciones/:id/leida     marcar una como leída   → NotificationDTO
 *   POST  /api/me/notificaciones/leer-todas    { types? } marcar todas o las de una sección → { unread }
 *   POST  /api/me/notificaciones/viajes-vistos abrí la búsqueda: reinicia "viajes nuevos" → { newTrips: 0 }
 */
const { Router } = require('express');
const { requireAuth } = require('../../middlewares/auth');
const service = require('./notificaciones.service');

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const misNotificaciones = Router();
misNotificaciones.use(requireAuth);
misNotificaciones.get('/', h(async (req, res) => res.json(await service.listar(req.user.id))));
misNotificaciones.post('/leer-todas', h(async (req, res) => res.json(await service.marcarTodas(req.user.id, req.body))));
misNotificaciones.post('/viajes-vistos', h(async (req, res) => res.json(await service.marcarViajesVistos(req.user.id))));
misNotificaciones.patch('/:id/leida', h(async (req, res) => res.json(await service.marcarLeida(req.user.id, req.params.id))));

module.exports = { misNotificaciones };
