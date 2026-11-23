'use strict';
/**
 * Rutas del módulo Viajes y rutas. Todas requieren sesión.
 *
 *   POST /api/viajes                 publicar (RF-08)               → 201 TripDTO
 *   GET  /api/viajes                 buscar (RF-11)                 → { items, page, pageSize, hasMore }
 *        ?direction=to_campus|from_campus&date=YYYY-MM-DD&timeFrom=HH:MM&timeTo=HH:MM
 *        &lat=&lng=&radiusKm=0.5..15&page=1
 *   GET  /api/viajes/:id             detalle (RF-12)                → TripDTO con driver, vehicle, myReservation
 *   PATCH /api/viajes/:id            editar (RF-13)                 → TripDTO (409 VIAJE_CON_RESERVAS)
 *   POST /api/viajes/:id/cancelar    cancelar (RF-13 parcial)       → { trip, cancelledReservations }
 *   POST /api/viajes/:id/finalizar   finalizar (RF-19) + CO₂ (RF-21) → { trip, impact }
 *   GET  /api/me/viajes              mis viajes (RF-18)             ?role=driver|passenger&status=upcoming|in_progress|history&page
 */
const { Router } = require('express');
const { requireAuth } = require('../../middlewares/auth');
const { esUuid } = require('../../shared/validacion');
const { AppError } = require('../../shared/errors');
const service = require('./viajes.service');

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const idValido = (req, _res, next) =>
  next(esUuid(req.params.id) ? undefined : new AppError(404, 'VIAJE_NO_ENCONTRADO', 'No encontramos ese viaje.'));

const viajes = Router();
viajes.use(requireAuth);
viajes.post('/', h(async (req, res) => res.status(201).json(await service.publicar(req.user.id, req.body))));
viajes.get('/', h(async (req, res) => res.json(await service.buscar(req.query, req.user.id))));
viajes.get('/:id', idValido, h(async (req, res) => res.json(await service.obtener(req.params.id, req.user.id))));
viajes.patch('/:id', idValido, h(async (req, res) => res.json(await service.editar(req.params.id, req.user.id, req.body))));
viajes.post('/:id/finalizar', idValido, h(async (req, res) => res.json(await service.finalizar(req.params.id, req.user.id))));
viajes.post('/:id/cancelar', idValido, h(async (req, res) => {
  const { trip, cancelledReservations } = await service.cancelar(req.params.id, req.user.id);
  res.json({ trip, cancelledReservations });
}));

const misViajes = Router();
misViajes.use(requireAuth);
misViajes.get('/', h(async (req, res) => res.json(await service.misViajes(req.user.id, req.query))));

module.exports = { viajes, misViajes };
