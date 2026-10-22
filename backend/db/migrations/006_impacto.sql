-- =============================================================================
-- EcoRuta Escolar · Migración 006 · Módulo Eco-Calculator
-- Tabla: impacto_viaje  ·  Vistas: v_co2_usuario, v_co2_comunidad
-- Requisitos: RF-21 a RF-26, RN-07
-- =============================================================================

-- Un registro por viaje finalizado con al menos un pasajero aceptado (RN-07).
-- Se guarda una "fotografía" de la distancia y del FE usados, para que cambiar
-- el FE después (RF-22) no altere los cálculos antiguos.
CREATE TABLE impacto_viaje (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viaje_id         UUID       NOT NULL REFERENCES viaje(id) ON DELETE RESTRICT,
  pasajeros        SMALLINT     NOT NULL,
  distancia_km     NUMERIC(7,2) NOT NULL,
  factor_emision   NUMERIC(6,4) NOT NULL,                  -- kg CO2 / km (0.192 inicial)
  -- RF-21: CO2 = distancia × FE × pasajeros. Columna generada: la fórmula vive
  -- en un solo lugar y nadie puede guardar un valor incoherente.
  co2_kg           NUMERIC(10,3) GENERATED ALWAYS AS
                     (round(distancia_km * factor_emision * pasajeros, 3)) STORED,
  calculado_en     TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT uq_impacto_viaje        UNIQUE (viaje_id),
  CONSTRAINT ck_impacto_pasajeros    CHECK (pasajeros >= 1),      -- RN-07
  CONSTRAINT ck_impacto_distancia    CHECK (distancia_km > 0),
  CONSTRAINT ck_impacto_factor       CHECK (factor_emision > 0 AND factor_emision < 1)
);

-- Para "CO2 de hoy" y gráficas por periodo (RF-23, RF-25).
CREATE INDEX idx_impacto_calculado_en ON impacto_viaje (calculado_en);

-- Solo se registra impacto de viajes finalizados (RN-07).
CREATE OR REPLACE FUNCTION fn_impacto_validar()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM viaje WHERE id = NEW.viaje_id AND estado = 'finalizado') THEN
    RAISE EXCEPTION 'VIAJE_NO_FINALIZADO: solo se calcula CO2 de viajes finalizados'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_impacto_validar
  BEFORE INSERT ON impacto_viaje
  FOR EACH ROW EXECUTE FUNCTION fn_impacto_validar();

-- -----------------------------------------------------------------------------
-- v_co2_usuario (RF-23): CO2 atribuido a cada usuario por viaje.
--   * Pasajero: distancia × FE (su asiento).
--   * Conductor: distancia × FE × pasajeros (= co2_kg del viaje).
-- OJO: la suma de esta vista NO es el total comunitario, porque el mismo
-- ahorro se atribuye al pasajero y al conductor. El total comunitario sale
-- de impacto_viaje (v_co2_comunidad).
-- -----------------------------------------------------------------------------
CREATE VIEW v_co2_usuario AS
SELECT v.conductor_id                                        AS usuario_id,
       i.viaje_id,
       'conductor'::text                                     AS participacion,
       i.co2_kg                                              AS co2_kg,
       i.distancia_km * i.pasajeros                          AS km_evitados,
       (i.calculado_en AT TIME ZONE 'America/Mexico_City')::date AS fecha_local
FROM impacto_viaje i
JOIN viaje v ON v.id = i.viaje_id
UNION ALL
SELECT r.pasajero_id,
       i.viaje_id,
       'pasajero'::text,
       round(i.distancia_km * i.factor_emision, 3),
       i.distancia_km,
       (i.calculado_en AT TIME ZONE 'America/Mexico_City')::date
FROM impacto_viaje i
JOIN reserva r ON r.viaje_id = i.viaje_id AND r.estado = 'aceptada';

COMMENT ON VIEW v_co2_usuario IS
  'CO2 por usuario y viaje (RF-23). Filtrar por usuario_id y fecha_local = hoy para "CO2 de hoy".';

-- v_co2_comunidad (RF-24, RF-25, RF-30): totales globales en una sola fila.
CREATE VIEW v_co2_comunidad AS
SELECT COALESCE(sum(co2_kg), 0)                    AS co2_total_kg,
       count(*)                                    AS viajes_compartidos,
       COALESCE(sum(distancia_km * pasajeros), 0)  AS km_evitados
FROM impacto_viaje;
