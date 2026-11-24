-- =============================================================================
-- EcoRuta Escolar · Migración 015 · Confianza, seguridad y administración
-- Módulo 3.1.5 (RF-27, RF-28, RF-29, RF-30, RF-31)
-- -----------------------------------------------------------------------------
-- 1. calificacion: la puntuación es definitiva (no se cambia ni se borra); el
--    comentario tiene su propio ciclo de vida (editar, borrar, vigencia).
-- 2. Recordatorio único para calificar después de un viaje finalizado.
-- 3. reporte: nuevos motivos, motivo "otro" con texto, y estado de lectura del
--    administrador independiente del estado de atención.
-- 4. contacto_emergencia (RF-31): uno por usuario.
-- 5. Notificaciones de revisión de documentos.
-- 6. Parámetro: días que un comentario sigue visible (decisión del proyecto: 30).
-- Solo agrega tablas, columnas y restricciones; no borra datos existentes.
-- =============================================================================

-- ── 1. Calificaciones ────────────────────────────────────────────────────────
ALTER TABLE calificacion
  ADD COLUMN comentario_en          TIMESTAMPTZ,  -- cuándo se publicó el comentario vigente (cuenta la vigencia)
  ADD COLUMN comentario_editado_en  TIMESTAMPTZ,
  ADD COLUMN comentario_eliminado_en TIMESTAMPTZ;

UPDATE calificacion SET comentario_en = creada_en WHERE comentario IS NOT NULL;

ALTER TABLE calificacion
  ADD CONSTRAINT ck_calificacion_comentario_texto CHECK (comentario IS NULL OR btrim(comentario) <> ''),
  ADD CONSTRAINT ck_calificacion_comentario_fecha CHECK ((comentario IS NULL) = (comentario_en IS NULL));

COMMENT ON COLUMN calificacion.comentario_en IS
  'Publicación del comentario. Se muestra mientras now() < comentario_en + parametro.vigencia_comentario_dias.';

-- La puntuación es definitiva: no se modifica ni se elimina (decisión del proyecto, RF-27).
CREATE OR REPLACE FUNCTION fn_calificacion_inmutable()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Única excepción: limpieza de datos de prueba (SET LOCAL ecoruta.limpieza_pruebas = 'on').
    IF current_setting('ecoruta.limpieza_pruebas', true) = 'on' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'CALIFICACION_DEFINITIVA: una calificación no se puede eliminar'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.puntaje <> OLD.puntaje OR NEW.viaje_id <> OLD.viaje_id
     OR NEW.evaluador_id <> OLD.evaluador_id OR NEW.evaluado_id <> OLD.evaluado_id
     OR NEW.creada_en <> OLD.creada_en THEN
    RAISE EXCEPTION 'CALIFICACION_DEFINITIVA: la puntuación no se puede modificar'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_calificacion_inmutable
  BEFORE UPDATE OR DELETE ON calificacion
  FOR EACH ROW EXECUTE FUNCTION fn_calificacion_inmutable();

CREATE INDEX idx_calificacion_evaluador ON calificacion (evaluador_id, creada_en DESC);

-- ── 2. Recordatorio único de calificación ───────────────────────────────────
CREATE TABLE recordatorio_calificacion (
  usuario_id  UUID        NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  viaje_id    UUID        NOT NULL REFERENCES viaje(id)   ON DELETE CASCADE,
  mostrado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, viaje_id)
);
COMMENT ON TABLE recordatorio_calificacion IS
  'Viajes cuyo recordatorio de calificar ya se mostró al usuario: no se vuelve a mostrar (en ningún dispositivo).';

-- ── 3. Reportes ──────────────────────────────────────────────────────────────
ALTER TABLE reporte DROP CONSTRAINT ck_reporte_motivo;
ALTER TABLE reporte ADD CONSTRAINT ck_reporte_motivo CHECK (motivo IN (
  'conducta_inapropiada', 'incumplimiento_acuerdos', 'informacion_falsa', 'seguridad',
  'acoso', 'incumplimiento_normas', 'otro',
  -- motivos de la versión anterior; se conservan para los reportes ya guardados
  'no_se_presento', 'cobro_indebido'));

ALTER TABLE reporte
  ADD COLUMN motivo_otro VARCHAR(100),
  ADD COLUMN leido_en    TIMESTAMPTZ,
  ADD COLUMN leido_por   UUID REFERENCES usuario(id) ON DELETE SET NULL,
  ADD CONSTRAINT ck_reporte_motivo_otro CHECK (motivo <> 'otro' OR motivo_otro IS NULL OR btrim(motivo_otro) <> ''),
  ADD CONSTRAINT ck_reporte_descripcion CHECK (btrim(descripcion) <> '');

COMMENT ON COLUMN reporte.leido_en IS 'Lectura del administrador. Independiente de estado (atención).';

CREATE INDEX idx_reporte_lectura ON reporte (leido_en, creado_en);

-- ── 4. Contacto de emergencia (RF-31) ───────────────────────────────────────
CREATE TABLE contacto_emergencia (
  usuario_id      UUID         PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
  nombre          VARCHAR(120) NOT NULL,
  telefono        VARCHAR(10)  NOT NULL,
  parentesco      VARCHAR(10)  NOT NULL,
  parentesco_otro VARCHAR(60),
  creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT ck_contacto_nombre     CHECK (length(btrim(nombre)) >= 3),
  CONSTRAINT ck_contacto_telefono   CHECK (telefono ~ '^[0-9]{10}$'),
  CONSTRAINT ck_contacto_parentesco CHECK (parentesco IN (
    'madre', 'padre', 'hermano', 'hermana', 'hijo', 'hija', 'pareja',
    'abuelo', 'abuela', 'familiar', 'amigo', 'amiga', 'otro')),
  CONSTRAINT ck_contacto_parentesco_otro CHECK (
    (parentesco = 'otro') = (parentesco_otro IS NOT NULL AND btrim(parentesco_otro) <> ''))
);
COMMENT ON TABLE contacto_emergencia IS 'RF-31. Dato personal: solo lo ve su dueño.';

-- ── 5. Notificaciones de documentos ─────────────────────────────────────────
ALTER TABLE notificacion DROP CONSTRAINT ck_notificacion_tipo;
ALTER TABLE notificacion ADD CONSTRAINT ck_notificacion_tipo CHECK (tipo IN (
  'solicitud_recibida', 'solicitud_aceptada', 'solicitud_rechazada',
  'solicitud_cancelada', 'lugar_cancelado', 'viaje_cancelado',
  'viaje_lleno', 'lugar_liberado',
  'documento_aprobado',   -- al usuario: el administrador aceptó su documento
  'documento_rechazado'   -- al usuario: el administrador lo rechazó (con comentario)
));

-- ── 6. Vigencia de los comentarios ──────────────────────────────────────────
INSERT INTO parametro (clave, valor, descripcion)
VALUES ('vigencia_comentario_dias', '30'::jsonb,
        'Días que un comentario de calificación sigue visible desde que se publicó. La puntuación se conserva siempre.')
ON CONFLICT (clave) DO NOTHING;
