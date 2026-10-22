-- =============================================================================
-- EcoRuta Escolar · Migración 003 · Parámetros del sistema
-- Tabla: parametro
-- Requisitos: RF-22 (factor de emisión editable), RN-11 (puntos del campus),
--             RF-01 (catálogos de carreras y departamentos del formulario)
-- =============================================================================

-- Almacén clave → valor JSONB. Claves usadas en F1:
--   factor_emision_kg_km  número          (RF-22)
--   puntos_campus         arreglo objetos (RN-11)
--   carreras              arreglo texto   (RF-01, alumno)
--   departamentos         arreglo texto   (RF-01, maestro)
-- El frontend debería pedir los catálogos a GET /api/catalogos en vez de
-- tenerlos fijos en src/constants/options.ts, para que no se desincronicen.
CREATE TABLE parametro (
  clave            VARCHAR(60)  PRIMARY KEY,
  valor            JSONB        NOT NULL,
  descripcion      VARCHAR(255),
  actualizado_por  UUID         REFERENCES usuario(id) ON DELETE SET NULL,  -- NULL = carga inicial
  actualizado_en   TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT ck_parametro_clave CHECK (clave ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT ck_parametro_factor_emision CHECK (
    clave <> 'factor_emision_kg_km'
    OR (jsonb_typeof(valor) = 'number'
        AND (valor #>> '{}')::numeric > 0 AND (valor #>> '{}')::numeric < 1)),
  CONSTRAINT ck_parametro_arreglos CHECK (
    clave NOT IN ('puntos_campus', 'carreras', 'departamentos')
    OR (jsonb_typeof(valor) = 'array' AND jsonb_array_length(valor) >= 1))
);

CREATE TRIGGER trg_parametro_actualizado_en
  BEFORE UPDATE ON parametro
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

COMMENT ON TABLE parametro IS
  'Parámetros editables por el administrador: factor_emision_kg_km, puntos_campus, carreras, departamentos.';
