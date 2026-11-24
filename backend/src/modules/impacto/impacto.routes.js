'use strict';
/**
 * Eco-Calculator (RF-23, RF-24, RF-25). Lee las vistas de la migración 006; el
 * registro del impacto al finalizar un viaje (RF-21) vive en eco.service.
 *
 *   GET /api/impacto/comunidad            total de la comunidad (RF-24, sin sesión)
 *   GET /api/impacto/me                   hoy, total y desglose conductor/pasajero (RF-23)
 *   GET /api/impacto/me/viajes?page=1     viajes con el CO₂ atribuido, 20 por página (RF-23)
 */
const { Router } = require('express');
const { urlFoto } = require('../../shared/fotos');
const { pool } = require('../../config/db');
const { requireAuth } = require('../../middlewares/auth');
const { ValidationError } = require('../../shared/errors');
const { pagina } = require('../../shared/validacion');
const repo = require('./impacto.repository');
const { DIRECCION_BD_A_CLIENTE } = require('../viajes/viaje.mapper');

const router = Router();
const ARBOL_KG_CO2_ANUAL = 21.77; // RF-25: equivalencia aproximada (kg CO2 que absorbe un árbol al año)
const TAM_PAGINA = 20;
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const n = (v) => Number(v);

// GET /api/impacto/comunidad — RF-24 (pantalla de inicio)
router.get('/comunidad', h(async (_req, res) => {
  const c = await repo.comunidad(pool);
  res.json({
    co2SavedKg: n(c.co2_total_kg),
    sharedTrips: n(c.viajes_compartidos),
    kmAvoided: n(c.km_evitados),
    treesEquivalent: Math.round((n(c.co2_total_kg) / ARBOL_KG_CO2_ANUAL) * 10) / 10,
  });
}));

// GET /api/impacto/me — RF-23 (hoy y total del usuario, con desglose)
router.get('/me', requireAuth, h(async (req, res) => {
  const r = await repo.resumenUsuario(pool, req.user.id);
  res.json({
    co2TodayKg: n(r.hoy),
    co2TotalKg: n(r.total),
    trips: n(r.viajes),
    kmAvoided: n(r.km_evitados),
    asDriver: { co2TotalKg: n(r.conductor_co2), co2TodayKg: n(r.conductor_hoy), trips: n(r.conductor_viajes) },
    asPassenger: { co2TotalKg: n(r.pasajero_co2), co2TodayKg: n(r.pasajero_hoy), trips: n(r.pasajero_viajes) },
  });
}));

// GET /api/impacto/me/viajes?page — RF-23 (historial con el CO₂ de cada viaje)
router.get('/me/viajes', requireAuth, h(async (req, res) => {
  const page = pagina(req.query.page);
  if (page === null) throw new ValidationError({ page: 'Página no válida.' });
  const filas = await repo.viajesUsuario(pool, req.user.id, { limite: TAM_PAGINA, pagina: page });
  res.json({
    items: filas.slice(0, TAM_PAGINA).map((f) => ({
      tripId: f.viaje_id,
      role: f.participacion === 'conductor' ? 'driver' : 'passenger',
      co2Kg: n(f.co2_kg),
      kmAvoided: n(f.km_evitados),
      passengers: n(f.pasajeros),
      distanceKm: n(f.distancia_km),
      emissionFactor: n(f.factor_emision),
      direction: DIRECCION_BD_A_CLIENTE[f.sentido],
      origin: f.origen_texto,
      destination: f.destino_texto,
      departureAt: f.salida_en,
      finishedAt: f.finalizado_en,
      calculatedAt: f.calculado_en,
      driver: { id: f.conductor_id, fullName: f.conductor_nombre, photoUrl: urlFoto(f.conductor_id, f.conductor_foto) },
    })),
    page,
    pageSize: TAM_PAGINA,
    hasMore: filas.length > TAM_PAGINA,
  });
}));

module.exports = router;
