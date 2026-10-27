-- =============================================================================
-- EcoRuta Escolar · Migración 004 · Módulo Viajes y rutas
-- Tabla: viaje
-- Requisitos: RF-08 a RF-13, RF-19, RN-02, RN-03, RN-11, RNF-05, RNF-17, RNF-29
-- =============================================================================

CREATE TABLE viaje (
  id                    UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor_id          UUID             NOT NULL,
  vehiculo_id           UUID             NOT NULL,
  sentido               VARCHAR(14)      NOT NULL,     -- hacia_campus | desde_campus
  punto_campus          VARCHAR(40)      NOT NULL,     -- clave de parametro.puntos_campus (RN-11)

  -- Coordenadas simples sin PostGIS (RNF-17). DOUBLE PRECISION y no NUMERIC:
  --   * node-pg devuelve NUMERIC como string ("19.721700") y DOUBLE como number,
  --     que es lo que espera el mapa (Leaflet) y el tipo TS `number`.
  --   * Es el tipo nativo de las funciones trigonométricas (Haversine).
  --   * 15 dígitos significativos: precisión submilimétrica, de sobra.
  origen_texto          VARCHAR(160)     NOT NULL,
  origen_lat            DOUBLE PRECISION NOT NULL,
  origen_lng            DOUBLE PRECISION NOT NULL,
  destino_texto         VARCHAR(160)     NOT NULL,
  destino_lat           DOUBLE PRECISION NOT NULL,
  destino_lng           DOUBLE PRECISION NOT NULL,

  -- Punto FUERA del campus (el que importa para "cercanía", RF-11): como un
  -- extremo siempre es el campus (RN-11), la búsqueda compara contra el otro.
  -- Columna generada → nadie puede desincronizarla; tipo point nativo (x=lng, y=lat).
  punto_busqueda        POINT GENERATED ALWAYS AS (
                          CASE WHEN sentido = 'hacia_campus'
                               THEN point(origen_lng,  origen_lat)
                               ELSE point(destino_lng, destino_lat) END) STORED,

  salida_en             TIMESTAMPTZ      NOT NULL,     -- UTC; el cliente muestra America/Mexico_City
  asientos_totales      SMALLINT         NOT NULL,
  asientos_disponibles  SMALLINT         NOT NULL,     -- el trigger lo inicializa si llega NULL

  distancia_km          NUMERIC(7,2)     NOT NULL,     -- RF-10 (se reporta y se usa en CO2)
  duracion_min          SMALLINT,
  distancia_fuente      VARCHAR(10)      NOT NULL DEFAULT 'osrm',

  estado                VARCHAR(12)      NOT NULL DEFAULT 'publicado',
  notas                 VARCHAR(300),                  -- punto de encuentro (RF-08)
  finalizado_en         TIMESTAMPTZ,
  cancelado_en          TIMESTAMPTZ,
  creado_en             TIMESTAMPTZ      NOT NULL DEFAULT now(),
  actualizado_en        TIMESTAMPTZ      NOT NULL DEFAULT now(),

  CONSTRAINT fk_viaje_vehiculo_conductor
    FOREIGN KEY (vehiculo_id, conductor_id) REFERENCES vehiculo (id, usuario_id) ON DELETE RESTRICT,
  CONSTRAINT fk_viaje_conductor
    FOREIGN KEY (conductor_id) REFERENCES usuario (id) ON DELETE RESTRICT,

  CONSTRAINT ck_viaje_sentido  CHECK (sentido IN ('hacia_campus', 'desde_campus')),
  CONSTRAINT ck_viaje_estado   CHECK (estado  IN ('publicado', 'en_curso', 'finalizado', 'cancelado')),
  CONSTRAINT ck_viaje_fuente   CHECK (distancia_fuente IN ('osrm', 'haversine')),
  CONSTRAINT ck_viaje_textos   CHECK (btrim(origen_texto) <> '' AND btrim(destino_texto) <> ''),
  -- Rango válido y, además, "zona Morelia" holgada (≈ ±0.5°, unos 55 km): atrapa
  -- el error clásico de enviar [lng, lat] invertidos desde el cliente.
  CONSTRAINT ck_viaje_coords   CHECK (
        origen_lat  BETWEEN 19.2 AND 20.2 AND origen_lng  BETWEEN -101.7 AND -100.7
    AND destino_lat BETWEEN 19.2 AND 20.2 AND destino_lng BETWEEN -101.7 AND -100.7),
  CONSTRAINT ck_viaje_origen_distinto_destino
    CHECK ((origen_lat, origen_lng) <> (destino_lat, destino_lng)),
  CONSTRAINT ck_viaje_asientos_totales     CHECK (asientos_totales BETWEEN 1 AND 8),
  CONSTRAINT ck_viaje_asientos_disponibles CHECK (asientos_disponibles BETWEEN 0 AND asientos_totales),
  CONSTRAINT ck_viaje_distancia  CHECK (distancia_km > 0 AND distancia_km < 200),
  CONSTRAINT ck_viaje_duracion   CHECK (duracion_min IS NULL OR duracion_min BETWEEN 1 AND 600),
  CONSTRAINT ck_viaje_finalizado CHECK ((estado = 'finalizado') = (finalizado_en IS NOT NULL)),
  CONSTRAINT ck_viaje_cancelado  CHECK ((estado = 'cancelado')  = (cancelado_en  IS NOT NULL)),
  CONSTRAINT ck_viaje_finaliza_tras_salida CHECK (finalizado_en IS NULL OR finalizado_en >= salida_en)
);

COMMENT ON COLUMN viaje.punto_campus     IS 'Clave de un elemento de parametro.puntos_campus (RN-11).';
COMMENT ON COLUMN viaje.punto_busqueda   IS 'Extremo fuera del campus, point(lng, lat). Indexado con GiST para cercanía (RF-11).';
COMMENT ON COLUMN viaje.distancia_fuente IS 'osrm = ruteo real; haversine = línea recta × 1.3 (RF-10/RNF-29).';
COMMENT ON CONSTRAINT ck_viaje_coords ON viaje IS
  'Zona de servicio de F1 (Morelia y alrededores). Ampliar con una migración si se agrega otra institución.';

-- -----------------------------------------------------------------------------
-- Reglas entre tablas al publicar o editar (RN-02, RN-03, RN-11, vehículo activo).
-- RN-04 (30 min de anticipación) depende de now() y se valida en la API.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_viaje_validar()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_estado_usuario  VARCHAR;
  v_capacidad       SMALLINT;
  v_vehiculo_activo BOOLEAN;
BEGIN
  IF NEW.asientos_disponibles IS NULL THEN
    NEW.asientos_disponibles := NEW.asientos_totales;
  END IF;

  IF TG_OP = 'INSERT'
     OR NEW.vehiculo_id      IS DISTINCT FROM OLD.vehiculo_id
     OR NEW.asientos_totales IS DISTINCT FROM OLD.asientos_totales
     OR NEW.punto_campus     IS DISTINCT FROM OLD.punto_campus THEN

    SELECT estado INTO v_estado_usuario FROM usuario WHERE id = NEW.conductor_id;
    IF v_estado_usuario IS DISTINCT FROM 'activo' THEN
      RAISE EXCEPTION 'CONDUCTOR_NO_ACTIVO: el conductor no puede publicar viajes'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT capacidad, activo INTO v_capacidad, v_vehiculo_activo FROM vehiculo WHERE id = NEW.vehiculo_id;
    IF NOT v_vehiculo_activo THEN
      RAISE EXCEPTION 'VEHICULO_INACTIVO: el vehículo está desactivado'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.asientos_totales > v_capacidad - 1 THEN
      RAISE EXCEPTION 'ASIENTOS_EXCEDEN_CAPACIDAD: máximo % asientos para este vehículo', v_capacidad - 1
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM parametro p, jsonb_array_elements(p.valor) AS punto
      WHERE p.clave = 'puntos_campus' AND punto->>'clave' = NEW.punto_campus
    ) THEN
      RAISE EXCEPTION 'PUNTO_CAMPUS_INVALIDO: % no está en la lista de puntos del campus', NEW.punto_campus
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_viaje_validar
  BEFORE INSERT OR UPDATE ON viaje
  FOR EACH ROW EXECUTE FUNCTION fn_viaje_validar();

CREATE TRIGGER trg_viaje_actualizado_en
  BEFORE UPDATE ON viaje
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- -----------------------------------------------------------------------------
-- Índices (RNF-05: fecha, origen y estado)
-- -----------------------------------------------------------------------------
-- 1) TEMPORAL · búsqueda principal (RF-11): publicados, por sentido y ventana
--    de hora. Parcial: solo contiene viajes buscables, se mantiene pequeño.
CREATE INDEX idx_viaje_busqueda_tiempo
  ON viaje (sentido, salida_en)
  WHERE estado = 'publicado';

-- 2) GEOGRÁFICO sin PostGIS · GiST nativo sobre point. Soporta:
--      punto_busqueda <@ box(...)              (filtro por caja)
--      ORDER BY punto_busqueda <-> point(...)   (vecinos más cercanos, KNN)
--    Las distancias en grados son aproximadas; la API reordena/muestra con
--    fn_haversine_km. Ver db/README.md para la consulta completa.
CREATE INDEX idx_viaje_busqueda_geo
  ON viaje USING gist (punto_busqueda)
  WHERE estado = 'publicado';

-- 3) Estado + fecha: admin, estadísticas (RF-30), tareas de mantenimiento.
CREATE INDEX idx_viaje_estado_salida    ON viaje (estado, salida_en);
-- 4) "Mis viajes" como conductor (RF-18).
CREATE INDEX idx_viaje_conductor_salida ON viaje (conductor_id, salida_en DESC);
-- 5) Soporte de la FK compuesta hacia vehiculo.
CREATE INDEX idx_viaje_vehiculo         ON viaje (vehiculo_id);
