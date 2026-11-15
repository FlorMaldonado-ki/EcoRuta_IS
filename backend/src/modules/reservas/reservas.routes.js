'use strict';
/**
 * Rutas del módulo Reservas (RF-15 a RF-17). Todas requieren sesión.
 *
 *   POST  /api/viajes/:viajeId/reservas        { meetingPoint } solicitar lugar → 201 ReservationDTO
 *   GET   /api/viajes/:viajeId/reservas        solicitudes (conductor; ?status=requested|accepted|…)
 *   PATCH /api/reservas/:id                    { action: 'accept' | 'reject' } (conductor)
 *   POST  /api/reservas/:id/cancelar           cancelar mi lugar (pasajero)
 */
const { Router } = require('express');
const { requireAuth } = require('../../middlewares/auth');
const service = require('./reservas.service');

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const porViaje = Router({ mergeParams: true });
porViaje.use(requireAuth);
porViaje.post('/', h(async (req, res) => res.status(201).json(await service.solicitar(req.params.viajeId, req.user.id, req.body))));
porViaje.get('/', h(async (req, res) => res.json(await service.listarDeViaje(req.params.viajeId, req.user.id, { status: req.query.status }))));

const reservas = Router();
reservas.use(requireAuth);
reservas.patch('/:id', h(async (req, res) => res.json(await service.responder(req.params.id, req.user.id, req.body))));
reservas.post('/:id/cancelar', h(async (req, res) => res.json(await service.cancelar(req.params.id, req.user.id))));

module.exports = { porViaje, reservas };
