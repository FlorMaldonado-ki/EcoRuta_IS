'use strict';
const { Router } = require('express');
const service = require('./catalogos.service');

const router = Router();

// GET /api/catalogos — público: el formulario de registro lo necesita antes de tener sesión.
router.get('/', async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'public, max-age=300');
    res.json(await service.catalogosDTO());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
