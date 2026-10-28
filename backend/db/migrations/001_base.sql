-- =============================================================================
-- EcoRuta Escolar · Migración 001 · Base común
-- -----------------------------------------------------------------------------
-- Funciones reutilizadas por todos los módulos. No crea tablas de negocio.
-- Requiere PostgreSQL 13+ (gen_random_uuid() es nativo desde la 13; Neon usa
-- 16/17). No se usa PostGIS ni extensiones (RNF-17).
-- =============================================================================

-- Mantiene la columna actualizado_en al día en cualquier tabla que la tenga.
CREATE OR REPLACE FUNCTION fn_set_actualizado_en()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_set_actualizado_en() IS
  'Trigger genérico BEFORE UPDATE: actualiza la columna actualizado_en.';

-- Distancia Haversine en km (RNF-17, RF-10 respaldo, RF-11 cercanía).
-- IMMUTABLE + PARALLEL SAFE: el planificador puede usarla en ORDER BY sin costo extra.
CREATE OR REPLACE FUNCTION fn_haversine_km(
  lat1 DOUBLE PRECISION, lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION, lng2 DOUBLE PRECISION)
RETURNS DOUBLE PRECISION
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT 2 * 6371.0088 * asin(sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2)
         + cos(radians(lat1)) * cos(radians(lat2))
         * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

COMMENT ON FUNCTION fn_haversine_km IS
  'Distancia en línea recta (km) entre dos coordenadas. Para la estimación de respaldo de RF-10 multiplicar por 1.3.';
