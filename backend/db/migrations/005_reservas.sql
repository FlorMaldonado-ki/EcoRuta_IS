-- =============================================================================
-- EcoRuta Escolar · Migración 005 · Módulo Reservas
-- Tabla: reserva
-- Requisitos: RF-15 a RF-18, RN-02, RN-05, RN-06, RNF-28
-- =============================================================================

CREATE TABLE reserva (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viaje_id            UUID      NOT NULL REFERENCES viaje(id)   ON DELETE RESTRICT,
  pasajero_id         UUID      NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  estado              VARCHAR(12) NOT NULL DEFAULT 'solicitada',
  creada_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
  respondida_en       TIMESTAMPTZ,                        -- cuando el conductor acepta o rechaza
  cancelada_en        TIMESTAMPTZ,
  cancelacion_tardia  BOOLEAN     NOT NULL DEFAULT false, -- RN-06: < 20 min antes de la salida
  actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ck_reserva_estado CHECK (estado IN ('solicitada', 'aceptada', 'rechazada', 'cancelada')),
  CONSTRAINT ck_reserva_respondida CHECK (
    estado = 'solicitada' OR estado = 'cancelada' OR respondida_en IS NOT NULL),
  CONSTRAINT ck_reserva_cancelada  CHECK ((estado = 'cancelada') = (cancelada_en IS NOT NULL)),
  CONSTRAINT ck_reserva_tardia     CHECK (NOT cancelacion_tardia OR estado = 'cancelada')
);

-- Unicidad (viaje, pasajero) SOLO entre reservas vigentes: un pasajero no puede
-- tener dos solicitudes activas en el mismo viaje, pero sí volver a solicitar
-- después de cancelar, conservando el historial (y la marca de cancelación tardía).
CREATE UNIQUE INDEX uq_reserva_viaje_pasajero_vigente
  ON reserva (viaje_id, pasajero_id)
  WHERE estado IN ('solicitada', 'aceptada');

-- "Mis viajes" como pasajero (RF-18) y verificación de traslapes (RN-05).
CREATE INDEX idx_reserva_pasajero_estado ON reserva (pasajero_id, estado);
-- Solicitudes de un viaje para el conductor (RF-16) y conteo de aceptados (RF-21).
CREATE INDEX idx_reserva_viaje_estado    ON reserva (viaje_id, estado);

-- -----------------------------------------------------------------------------
-- Validaciones al crear una reserva (RF-15, RN-02, RN-05 parcial).
-- RN-05 (traslape de horarios) y RN-06 (minutos antes de salir) dependen de
-- now() y de reglas de negocio más ricas: se validan en la API.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_reserva_validar_insercion()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_conductor  UUID;
  v_estado     VARCHAR;
  v_estado_pas VARCHAR;
BEGIN
  SELECT conductor_id, estado INTO v_conductor, v_estado FROM viaje WHERE id = NEW.viaje_id;

  IF v_conductor = NEW.pasajero_id THEN
    RAISE EXCEPTION 'RESERVA_PROPIA: no puedes reservar tu propio viaje'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_estado <> 'publicado' THEN
    RAISE EXCEPTION 'VIAJE_NO_DISPONIBLE: el viaje % está %', NEW.viaje_id, v_estado
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT estado INTO v_estado_pas FROM usuario WHERE id = NEW.pasajero_id;
  IF v_estado_pas IS DISTINCT FROM 'activo' THEN
    RAISE EXCEPTION 'PASAJERO_NO_ACTIVO: la cuenta no puede reservar'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reserva_validar_insercion
  BEFORE INSERT ON reserva
  FOR EACH ROW EXECUTE FUNCTION fn_reserva_validar_insercion();

-- -----------------------------------------------------------------------------
-- Contabilidad de asientos (RF-16, RF-17, RNF-28).
-- Al pasar a 'aceptada' se descuenta 1 asiento; al salir de 'aceptada' se
-- libera. Va en la MISMA transacción que el UPDATE de la reserva, y el
-- UPDATE ... WHERE asientos_disponibles > 0 bloquea la fila del viaje, así que
-- dos aceptaciones simultáneas nunca sobrevenden el último lugar.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_reserva_ajustar_asientos()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado = 'aceptada' AND OLD.estado IS DISTINCT FROM 'aceptada' THEN
    UPDATE viaje
       SET asientos_disponibles = asientos_disponibles - 1
     WHERE id = NEW.viaje_id
       AND estado = 'publicado'
       AND asientos_disponibles > 0;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SIN_ASIENTOS: el viaje % ya no tiene lugares disponibles', NEW.viaje_id
        USING ERRCODE = 'check_violation';
    END IF;

  ELSIF OLD.estado = 'aceptada' AND NEW.estado <> 'aceptada' THEN
    UPDATE viaje
       SET asientos_disponibles = asientos_disponibles + 1
     WHERE id = NEW.viaje_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reserva_ajustar_asientos
  AFTER UPDATE OF estado ON reserva
  FOR EACH ROW EXECUTE FUNCTION fn_reserva_ajustar_asientos();

CREATE TRIGGER trg_reserva_actualizado_en
  BEFORE UPDATE ON reserva
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();
