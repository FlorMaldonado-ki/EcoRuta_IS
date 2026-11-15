-- =============================================================================
-- EcoRuta Escolar · Migración 011 · Marcas de lectura por sección
-- Tabla: notificacion_marca
-- -----------------------------------------------------------------------------
-- Guarda cuándo vio el usuario por última vez la búsqueda de viajes, para que el
-- panel principal muestre cuántos viajes NUEVOS se publicaron desde entonces
-- (insignia en "Buscar Viajes"). Una fila por usuario; si no existe, se cuentan
-- los viajes de las últimas 24 horas.
-- =============================================================================

CREATE TABLE notificacion_marca (
  usuario_id        UUID PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
  viajes_vistos_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conteo de viajes publicados después de la marca (búsqueda de "nuevos").
CREATE INDEX IF NOT EXISTS idx_viaje_publicado_creado ON viaje (creado_en) WHERE estado = 'publicado';

COMMENT ON TABLE notificacion_marca IS 'Última vez que el usuario revisó la búsqueda de viajes (insignia de viajes nuevos).';
