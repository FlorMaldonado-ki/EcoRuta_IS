-- =============================================================================
-- EcoRuta Escolar · Migración 012 · Puntos de encuentro y lista de espera
-- -----------------------------------------------------------------------------
-- 1. viaje.puntos_encuentro: puntos que el conductor marcó en el mapa al publicar
--    (se muestran al pasajero en el mapa interactivo del detalle).
--      [{ "id": "p1", "nombre": "...", "descripcion": "...", "lat": 19.7, "lng": -101.1, "orden": 1 }]
-- 2. reserva.punto_union: dónde se unirá el pasajero. Uno de los puntos del
--    conductor o uno que el pasajero propone en la ruta:
--      { "tipo": "conductor", "punto_id": "p1", "nombre": "...", "lat": .., "lng": .. }
--      { "tipo": "propuesto", "nombre": "...", "lat": .., "lng": .., "nota": "..." }
-- 3. Avisos de lista de espera: viaje_lleno (se llenó con tu solicitud pendiente)
--    y lugar_liberado (alguien canceló y vuelve a haber lugar).
-- Sin PostGIS (RNF-17): las coordenadas se validan en la API (zona de Morelia).
-- =============================================================================

ALTER TABLE viaje
  ADD COLUMN puntos_encuentro JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT ck_viaje_puntos_encuentro CHECK (
    jsonb_typeof(puntos_encuentro) = 'array' AND jsonb_array_length(puntos_encuentro) <= 8);

ALTER TABLE reserva
  ADD COLUMN punto_union JSONB,
  ADD CONSTRAINT ck_reserva_punto_union CHECK (
    punto_union IS NULL OR (jsonb_typeof(punto_union) = 'object' AND punto_union->>'tipo' IN ('conductor', 'propuesto')));

COMMENT ON COLUMN viaje.puntos_encuentro IS 'Puntos de encuentro marcados por el conductor (máx. 8).';
COMMENT ON COLUMN reserva.punto_union    IS 'Dónde se une el pasajero: punto del conductor o propuesto en la ruta.';

ALTER TABLE notificacion DROP CONSTRAINT ck_notificacion_tipo;
ALTER TABLE notificacion ADD CONSTRAINT ck_notificacion_tipo CHECK (tipo IN (
  'solicitud_recibida', 'solicitud_aceptada', 'solicitud_rechazada',
  'solicitud_cancelada', 'lugar_cancelado', 'viaje_cancelado',
  'viaje_lleno',     -- al pasajero en espera: el viaje se llenó con su solicitud pendiente
  'lugar_liberado'   -- al pasajero en espera: se liberó un lugar
));
