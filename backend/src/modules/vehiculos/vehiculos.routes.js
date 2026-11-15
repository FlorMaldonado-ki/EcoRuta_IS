'use strict';
/**
 * Rutas del módulo Vehículos (RF-06). Todas requieren sesión.
 *
 *   POST   /api/vehiculos            registrar  → 201 VehicleDTO
 *   GET    /api/vehiculos/:id        uno mío    → VehicleDTO
 *   PATCH  /api/vehiculos/:id        editar     → VehicleDTO
 *   DELETE /api/vehiculos/:id        desactivar → VehicleDTO (active: false); no borra
 *   GET    /api/me/vehiculos         mis vehículos activos (?includeInactive=true para todos)
 */
const { Router } = require('express');
const { requireAuth } = require('../../middlewares/auth');
const { esUuid } = require('../../shared/validacion');
const { AppError } = require('../../shared/errors');
const service = require('./vehiculos.service');

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const idValido = (req, _res, next) =>
  next(esUuid(req.params.id) ? undefined : new AppError(404, 'VEHICULO_NO_ENCONTRADO', 'No encontramos ese vehículo.'));

const vehiculos = Router();
vehiculos.use(requireAuth);
vehiculos.post('/', h(async (req, res) => {
  const { vehiculo, reactivado } = await service.registrar(req.user.id, req.body);
  res.status(reactivado ? 200 : 201).json(vehiculo);
}));
vehiculos.get('/:id', idValido, h(async (req, res) => res.json(await service.obtener(req.user.id, req.params.id))));
vehiculos.patch('/:id', idValido, h(async (req, res) => res.json(await service.actualizar(req.user.id, req.params.id, req.body))));
vehiculos.delete('/:id', idValido, h(async (req, res) => res.json(await service.desactivar(req.user.id, req.params.id))));

const misVehiculos = Router();
misVehiculos.use(requireAuth);
misVehiculos.get('/', h(async (req, res) => {
  res.json(await service.listar(req.user.id, { incluirInactivos: req.query.includeInactive === 'true' }));
}));

module.exports = { vehiculos, misVehiculos };
