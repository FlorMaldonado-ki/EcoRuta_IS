-- =============================================================================
-- EcoRuta Escolar · Migración 009 · Puntos del campus definitivos (RN-11)
-- -----------------------------------------------------------------------------
-- Reemplaza los 3 puntos aproximados de la migración 008 (entrada_principal,
-- entrada_posterior, estacionamiento, todos en Campus 1) por los puntos de
-- referencia que usa el frontend (frontend/src/constants/options.ts →
-- CAMPUS_REFERENCE_POINTS): campus_1, campus_2 y metalurgia.
-- El frontend debe tomarlos de GET /api/catalogos → campusPoints.
-- =============================================================================

UPDATE parametro
   SET valor = '[
      {"clave": "campus_1",   "nombre": "Campus 1 (Central - Av. Tecnológico)", "lat": 19.721700, "lng": -101.185800},
      {"clave": "campus_2",   "nombre": "Campus 2",                             "lat": 19.688500, "lng": -101.240500},
      {"clave": "metalurgia", "nombre": "Metalurgia (Unidad Morelia)",          "lat": 19.724000, "lng": -101.187000}
    ]'::jsonb,
       descripcion = 'Puntos del campus que pueden ser origen o destino de un viaje (RN-11). Mismos que CAMPUS_REFERENCE_POINTS del frontend.'
 WHERE clave = 'puntos_campus';

-- Los viajes ya publicados con los puntos anteriores pasan a campus_1 (los tres
-- estaban en Campus 1). Se desactiva un momento la validación del trigger para no
-- revalidar viajes históricos (conductor o vehículo que hoy podrían estar inactivos).
ALTER TABLE viaje DISABLE TRIGGER trg_viaje_validar;
UPDATE viaje
   SET punto_campus = 'campus_1'
 WHERE punto_campus IN ('entrada_principal', 'entrada_posterior', 'estacionamiento');
ALTER TABLE viaje ENABLE TRIGGER trg_viaje_validar;
