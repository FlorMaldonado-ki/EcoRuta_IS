-- =============================================================================
-- EcoRuta Escolar · Migración 010 · Notificaciones dentro de la app
-- Tabla: notificacion
-- Avisos de solicitudes, respuestas y cancelaciones (complementa RF-20, que
-- los enviará por correo en el Sprint 3). Retención de 72 horas.
-- -----------------------------------------------------------------------------
-- Una fila por aviso y por destinatario. La generan los módulos Reservas y
-- Viajes después de cada acción (solicitar, aceptar, rechazar, cancelar lugar,
-- cancelar viaje). Las de más de 72 h se purgan al consultar la bandeja.
-- =============================================================================

CREATE TABLE notificacion (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID         NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,  -- destinatario
  tipo        VARCHAR(24)  NOT NULL,
  titulo      VARCHAR(120) NOT NULL,
  mensaje     VARCHAR(400) NOT NULL,
  viaje_id    UUID REFERENCES viaje(id)   ON DELETE CASCADE,
  reserva_id  UUID REFERENCES reserva(id) ON DELETE CASCADE,
  leida       BOOLEAN      NOT NULL DEFAULT false,
  creada_en   TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT ck_notificacion_tipo CHECK (tipo IN (
    'solicitud_recibida',   -- al conductor: un pasajero pidió lugar
    'solicitud_aceptada',   -- al pasajero
    'solicitud_rechazada',  -- al pasajero
    'solicitud_cancelada',  -- al conductor: el pasajero retiró una solicitud pendiente
    'lugar_cancelado',      -- al conductor: el pasajero canceló un lugar ya aceptado
    'viaje_cancelado'       -- al pasajero: el conductor canceló el viaje
  ))
);

-- Bandeja del usuario, más recientes primero (y conteo de no leídas).
CREATE INDEX idx_notificacion_usuario_fecha ON notificacion (usuario_id, creada_en DESC);
-- Purga por antigüedad (72 h).
CREATE INDEX idx_notificacion_creada ON notificacion (creada_en);

COMMENT ON TABLE notificacion IS 'Avisos dentro de la app. Se conservan 72 horas.';
