-- =============================================================================
-- EcoRuta Escolar · Migración 007 · Módulo Confianza y seguridad
-- Tablas: calificacion, reporte
-- Requisitos: RF-27, RF-28, RF-29, RN-08, RN-10
-- =============================================================================

-- -----------------------------------------------------------------------------
-- calificacion (RF-27, RN-10): una por (viaje, evaluador, evaluado).
-- -----------------------------------------------------------------------------
CREATE TABLE calificacion (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viaje_id     UUID      NOT NULL REFERENCES viaje(id)   ON DELETE RESTRICT,
  evaluador_id UUID      NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  evaluado_id  UUID      NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  puntaje      SMALLINT    NOT NULL,
  comentario   VARCHAR(280),
  creada_en    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_calificacion UNIQUE (viaje_id, evaluador_id, evaluado_id),
  CONSTRAINT ck_calificacion_puntaje  CHECK (puntaje BETWEEN 1 AND 5),
  CONSTRAINT ck_calificacion_no_propia CHECK (evaluador_id <> evaluado_id)
);

-- Promedio de calificación en el perfil (RF-05).
CREATE INDEX idx_calificacion_evaluado ON calificacion (evaluado_id);

-- RN-10: solo viajes finalizados y solo entre quienes participaron
-- (conductor o pasajero con reserva aceptada).
CREATE OR REPLACE FUNCTION fn_calificacion_validar()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_conductor UUID;
  v_estado    VARCHAR;
BEGIN
  SELECT conductor_id, estado INTO v_conductor, v_estado FROM viaje WHERE id = NEW.viaje_id;

  IF v_estado <> 'finalizado' THEN
    RAISE EXCEPTION 'VIAJE_NO_FINALIZADO: solo se califican viajes finalizados'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT (
        (NEW.evaluador_id = v_conductor OR EXISTS (
           SELECT 1 FROM reserva WHERE viaje_id = NEW.viaje_id
             AND pasajero_id = NEW.evaluador_id AND estado = 'aceptada'))
    AND (NEW.evaluado_id = v_conductor OR EXISTS (
           SELECT 1 FROM reserva WHERE viaje_id = NEW.viaje_id
             AND pasajero_id = NEW.evaluado_id AND estado = 'aceptada'))
  ) THEN
    RAISE EXCEPTION 'NO_PARTICIPANTE: evaluador y evaluado deben haber participado en el viaje'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_calificacion_validar
  BEFORE INSERT ON calificacion
  FOR EACH ROW EXECUTE FUNCTION fn_calificacion_validar();

-- -----------------------------------------------------------------------------
-- reporte (RF-28, RF-29, RN-08). Se reporta a un usuario; el viaje es contexto
-- opcional. Si se reporta "un viaje", la API guarda como reportado al conductor.
-- -----------------------------------------------------------------------------
CREATE TABLE reporte (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reportante_id        UUID       NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  usuario_reportado_id UUID       NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  viaje_id             UUID       REFERENCES viaje(id) ON DELETE SET NULL,
  motivo               VARCHAR(25)  NOT NULL,
  descripcion          VARCHAR(1000) NOT NULL,
  estado               VARCHAR(12)  NOT NULL DEFAULT 'pendiente',
  revisado_por         UUID       REFERENCES usuario(id) ON DELETE SET NULL,
  revisado_en          TIMESTAMPTZ,
  nota_admin           VARCHAR(500),
  creado_en            TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT ck_reporte_motivo CHECK (motivo IN (
    'conducta_inapropiada', 'seguridad', 'no_se_presento',
    'informacion_falsa', 'cobro_indebido', 'otro')),
  CONSTRAINT ck_reporte_estado CHECK (estado IN ('pendiente', 'en_revision', 'resuelto', 'descartado')),
  CONSTRAINT ck_reporte_no_propio CHECK (reportante_id <> usuario_reportado_id),
  CONSTRAINT ck_reporte_revision  CHECK (
    estado IN ('pendiente', 'en_revision') OR (revisado_por IS NOT NULL AND revisado_en IS NOT NULL))
);

-- Evita que un mismo usuario infle el conteo de RN-08 reportando varias veces
-- a la misma persona por el mismo viaje.
CREATE UNIQUE INDEX uq_reporte_por_viaje
  ON reporte (reportante_id, usuario_reportado_id, viaje_id)
  WHERE viaje_id IS NOT NULL;

-- RN-08: contar reportes por usuario reportado; bandeja del admin por estado.
CREATE INDEX idx_reporte_reportado ON reporte (usuario_reportado_id);
CREATE INDEX idx_reporte_estado    ON reporte (estado, creado_en);

-- Usuarios con 3 o más reportes de reportantes distintos (RN-08). La vista
-- solo marca para revisión: suspender es decisión del administrador.
CREATE VIEW v_usuarios_para_revision AS
SELECT usuario_reportado_id               AS usuario_id,
       count(DISTINCT reportante_id)      AS reportantes_distintos,
       count(*) FILTER (WHERE estado = 'pendiente') AS reportes_pendientes,
       max(creado_en)                     AS ultimo_reporte_en
FROM reporte
WHERE estado <> 'descartado'
GROUP BY usuario_reportado_id
HAVING count(DISTINCT reportante_id) >= 3;
