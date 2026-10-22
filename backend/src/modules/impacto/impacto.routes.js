'use strict';
/**
 * Eco-Calculator (RF-23, RF-24, RF-25). Lee las vistas de la migración 006.
 * Solo lectura por ahora; el cálculo al finalizar un viaje (RF-21) llegará con
 * el módulo de Reservas.
 */
const { Router } = require('express');
const { pool } = require('../../config/db');
const { requireAuth } = require('../../middlewares/auth');

const router = Router();
const ARBOL_KG_CO2_ANUAL = 21.77; // RF-25: equivalencia aproximada (kg CO2 que absorbe un árbol al año)

// GET /api/impacto/comunidad — RF-24 (pantalla de inicio)
router.get('/comunidad', async (_req, res, next) => {
  try {
    const { rows: [c] } = await pool.query('SELECT co2_total_kg, viajes_compartidos, km_evitados FROM v_co2_comunidad');
    res.json({
      co2SavedKg: c.co2_total_kg,
      sharedTrips: c.viajes_compartidos,
      kmAvoided: c.km_evitados,
      treesEquivalent: Math.round((c.co2_total_kg / ARBOL_KG_CO2_ANUAL) * 10) / 10,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/impacto/me — RF-23 (hoy y total del usuario)
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows: [r] } = await pool.query(
      `SELECT COALESCE(sum(co2_kg), 0) AS total,
              COALESCE(sum(co2_kg) FILTER (WHERE fecha_local = (now() AT TIME ZONE 'America/Mexico_City')::date), 0) AS hoy,
              count(*) AS viajes
         FROM v_co2_usuario WHERE usuario_id = $1`,
      [req.user.id],
    );
    res.json({ co2TodayKg: r.hoy, co2TotalKg: r.total, trips: r.viajes });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
