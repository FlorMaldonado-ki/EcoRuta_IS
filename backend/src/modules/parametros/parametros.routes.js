'use strict';
/**
 * Parámetros del sistema editables por el administrador (RF-22).
 *
 *   GET   /api/parametros/factor-emision   cualquier usuario con sesión → { value, unit, updatedAt }
 *   PATCH /api/parametros/factor-emision   solo admin { value: 0 < FE < 1 } → mismo DTO
 *
 * Cambiar el FE solo afecta a los viajes que se finalicen después: impacto_viaje
 * guarda el FE con el que se calculó cada viaje. La pantalla de administración
 * llega en el sprint de Administración.
 */
const { Router } = require('express');
const { requireAuth, requireRole } = require('../../middlewares/auth');
const service = require('./parametros.service');

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const router = Router();
router.use(requireAuth);
router.get('/factor-emision', h(async (_req, res) => res.json(await service.obtenerFactorEmision())));
router.patch('/factor-emision', requireRole('admin'), h(async (req, res) =>
  res.json(await service.actualizarFactorEmision(req.user.id, req.body))));

module.exports = router;
