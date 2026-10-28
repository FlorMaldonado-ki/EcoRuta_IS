-- =============================================================================
-- EcoRuta Escolar · Migración 002 · Módulo Autenticación y perfil
-- Tablas: institucion, usuario, token_verificacion, documento_usuario, vehiculo
-- Requisitos: RF-01 a RF-07, RN-01, RN-02, RN-03, RN-12, RNF-06, RNF-07,
--             RNF-11, RNF-12, RNF-18
-- Contrato con el frontend: src/types/registration.ts (RegistrationFormData)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- institucion (RNF-18): preparada para multi-institución; en F1 solo existe
-- TecNM Campus Morelia. Los dominios permitidos viven aquí, no en el código.
-- -----------------------------------------------------------------------------
CREATE TABLE institucion (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           VARCHAR(150) NOT NULL UNIQUE,
  -- Dominios sin '@', en minúsculas. Ej.: '{morelia.tecnm.mx}'
  dominios_correo  TEXT[]       NOT NULL,
  creado_en        TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT ck_institucion_dominios_no_vacio CHECK (cardinality(dominios_correo) >= 1)
);

COMMENT ON TABLE institucion IS 'Instituciones y sus dominios de correo permitidos (RN-01, RNF-18).';

-- -----------------------------------------------------------------------------
-- usuario
--   FE.fullName  → nombre_completo     FE.userType 'alumno'  → tipo 'estudiante'
--   FE.email     → correo (minúsculas) FE.userType 'maestro' → tipo 'docente'
--   FE.password  → hash_contrasena     FE.career     → carrera       (solo estudiante)
--   FE.termsAccepted → acepto_terminos_en  FE.department → departamento (solo docente)
--   FE.confirmPassword NO se persiste (solo se valida en la API).
-- "rol" es el rol de SEGURIDAD (usuario/admin, RNF-09). Conductor y pasajero
-- no son roles: cualquier usuario activo puede ser ambos (rol dual, ERS 2.4).
-- -----------------------------------------------------------------------------
CREATE TABLE usuario (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  institucion_id      UUID         NOT NULL REFERENCES institucion(id) ON DELETE RESTRICT,
  nombre_completo     VARCHAR(120) NOT NULL,
  correo              VARCHAR(254) NOT NULL,
  hash_contrasena     VARCHAR(255) NOT NULL,               -- bcrypt/argon2, nunca texto plano (RNF-07)
  tipo                VARCHAR(10)  NOT NULL,               -- estudiante | docente
  carrera             VARCHAR(120),                        -- obligatoria si tipo = estudiante
  departamento        VARCHAR(120),                        -- obligatorio si tipo = docente
  telefono            VARCHAR(15),                         -- RF-05 opcional; solo con reserva aceptada (RNF-12)
  rol                 VARCHAR(10)  NOT NULL DEFAULT 'usuario',
  estado              VARCHAR(12)  NOT NULL DEFAULT 'pendiente',
  acepto_terminos_en  TIMESTAMPTZ  NOT NULL,               -- RF-07
  version_terminos    VARCHAR(10)  NOT NULL DEFAULT '1.0', -- qué versión del aviso aceptó (LFPDPPP)
  verificado_en       TIMESTAMPTZ,                         -- se llena al abrir el enlace (RF-02)
  intentos_fallidos   SMALLINT     NOT NULL DEFAULT 0,     -- RNF-11 (en BD porque la API es stateless)
  bloqueado_hasta     TIMESTAMPTZ,
  creado_en           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT uq_usuario_correo         UNIQUE (correo),     -- RN-01: un correo = una cuenta
  CONSTRAINT ck_usuario_correo_minus   CHECK (correo = lower(correo)),
  CONSTRAINT ck_usuario_correo_formato CHECK (correo ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'),
  -- Igual que la validación del formulario: "nombre y apellidos" (≥ 4 caracteres útiles).
  CONSTRAINT ck_usuario_nombre         CHECK (length(btrim(nombre_completo)) >= 4
                                              AND nombre_completo = btrim(nombre_completo)),
  CONSTRAINT ck_usuario_tipo           CHECK (tipo   IN ('estudiante', 'docente')),
  -- Exactamente uno de carrera/departamento, según el tipo (refleja handleUserTypeChange).
  CONSTRAINT ck_usuario_adscripcion    CHECK (
       (tipo = 'estudiante' AND carrera IS NOT NULL AND departamento IS NULL)
    OR (tipo = 'docente'    AND departamento IS NOT NULL AND carrera IS NULL)),
  CONSTRAINT ck_usuario_rol            CHECK (rol    IN ('usuario', 'admin')),
  CONSTRAINT ck_usuario_estado         CHECK (estado IN ('pendiente', 'activo', 'suspendido')),
  -- 10 dígitos nacionales; la API normaliza quitando espacios/guiones y '+52'.
  CONSTRAINT ck_usuario_telefono       CHECK (telefono IS NULL OR telefono ~ '^[0-9]{10}$'),
  CONSTRAINT ck_usuario_intentos       CHECK (intentos_fallidos BETWEEN 0 AND 100),
  -- Una cuenta activa necesariamente pasó por la verificación de correo (RN-02).
  CONSTRAINT ck_usuario_activo_verificado CHECK (estado = 'pendiente' OR verificado_en IS NOT NULL)
);

COMMENT ON COLUMN usuario.rol    IS 'Rol de seguridad (usuario/admin). Conductor y pasajero son capacidades, no roles.';
COMMENT ON COLUMN usuario.tipo   IS 'estudiante/docente (ERS). El cliente usa alumno/maestro; lo traduce el mapper de la API.';
COMMENT ON COLUMN usuario.estado IS 'pendiente = sin verificar (RN-02); activo; suspendido por el administrador (RF-29).';

-- RN-01 + catálogos: el dominio debe pertenecer a la institución y la carrera
-- o el departamento deben existir en parametro ('carreras' / 'departamentos'),
-- que es la misma lista que muestra el frontend (src/constants/options.ts).
-- La API valida antes para dar un mensaje claro; esto es la última defensa.
CREATE OR REPLACE FUNCTION fn_usuario_validar()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_dominios TEXT[];
BEGIN
  IF TG_OP = 'INSERT' OR NEW.correo IS DISTINCT FROM OLD.correo
     OR NEW.institucion_id IS DISTINCT FROM OLD.institucion_id THEN
    SELECT dominios_correo INTO v_dominios FROM institucion WHERE id = NEW.institucion_id;
    IF NOT (split_part(NEW.correo, '@', 2) = ANY (v_dominios)) THEN
      RAISE EXCEPTION 'DOMINIO_NO_PERMITIDO: el correo % no pertenece a la institución', NEW.correo
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.carrera IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.carrera IS DISTINCT FROM OLD.carrera)
     AND NOT EXISTS (SELECT 1 FROM parametro
                     WHERE clave = 'carreras' AND valor ? NEW.carrera) THEN
    RAISE EXCEPTION 'CARRERA_INVALIDA: % no está en el catálogo', NEW.carrera
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.departamento IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.departamento IS DISTINCT FROM OLD.departamento)
     AND NOT EXISTS (SELECT 1 FROM parametro
                     WHERE clave = 'departamentos' AND valor ? NEW.departamento) THEN
    RAISE EXCEPTION 'DEPARTAMENTO_INVALIDO: % no está en el catálogo', NEW.departamento
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_usuario_validar
  BEFORE INSERT OR UPDATE OF correo, institucion_id, carrera, departamento ON usuario
  FOR EACH ROW EXECUTE FUNCTION fn_usuario_validar();

CREATE TRIGGER trg_usuario_actualizado_en
  BEFORE UPDATE ON usuario
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

CREATE INDEX idx_usuario_institucion ON usuario (institucion_id);
CREATE INDEX idx_usuario_estado      ON usuario (estado, creado_en);   -- panel admin (RF-29, RF-30)

-- -----------------------------------------------------------------------------
-- token_verificacion: verificación (24 h, RF-02) y recuperación (RF-04,
-- ForgotPasswordModal). Se guarda el HASH SHA-256 del token, nunca el token.
-- -----------------------------------------------------------------------------
CREATE TABLE token_verificacion (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID        NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  tipo        VARCHAR(14) NOT NULL,          -- verificacion | recuperacion
  hash        CHAR(64)    NOT NULL,          -- SHA-256 en hexadecimal
  expira_en   TIMESTAMPTZ NOT NULL,
  usado_en    TIMESTAMPTZ,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_token_hash   UNIQUE (hash),
  CONSTRAINT ck_token_tipo   CHECK (tipo IN ('verificacion', 'recuperacion')),
  CONSTRAINT ck_token_hash   CHECK (hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_token_expira CHECK (expira_en > creado_en)
);

-- Invalidar tokens previos al reenviar el enlace (RF-02) y limpieza periódica.
CREATE INDEX idx_token_usuario_tipo ON token_verificacion (usuario_id, tipo) WHERE usado_en IS NULL;
CREATE INDEX idx_token_expira       ON token_verificacion (expira_en);

-- -----------------------------------------------------------------------------
-- documento_usuario  ⚠ NUEVA: no está en el diccionario de datos de la ERS v2.2.
-- El registro del frontend exige adjuntar un documento institucional:
--   alumno  → academicCurriculumDoc  (retícula académica vigente)
--   maestro → scheduleDoc            (carga de materias u horario)
-- La BD guarda SOLO metadatos y la clave del archivo en el almacenamiento
-- externo (p. ej. Cloudinary, Supabase Storage o S3); nunca el binario ni una
-- URL pública permanente (son datos personales, RNF-12).
-- -----------------------------------------------------------------------------
CREATE TABLE documento_usuario (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      UUID         NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  tipo            VARCHAR(20)  NOT NULL,          -- reticula_academica | carga_horaria
  nombre_archivo  VARCHAR(255) NOT NULL,          -- AttachedFile.name (solo para mostrar)
  mime_type       VARCHAR(100) NOT NULL,          -- AttachedFile.mimeType (revalidado en la API)
  tamano_bytes    INTEGER      NOT NULL,          -- AttachedFile.size
  storage_key     VARCHAR(500) NOT NULL,          -- ruta interna en el proveedor
  estado          VARCHAR(10)  NOT NULL DEFAULT 'pendiente',
  revisado_por    UUID         REFERENCES usuario(id) ON DELETE SET NULL,
  revisado_en     TIMESTAMPTZ,
  motivo_rechazo  VARCHAR(300),
  creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT uq_documento_storage_key UNIQUE (storage_key),
  CONSTRAINT ck_documento_tipo   CHECK (tipo IN ('reticula_academica', 'carga_horaria')),
  -- Lo que la UI anuncia: "PDF, PNG, JPG (Máx. 10 MB)".
  CONSTRAINT ck_documento_mime   CHECK (mime_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  CONSTRAINT ck_documento_tamano CHECK (tamano_bytes BETWEEN 1 AND 10485760),
  CONSTRAINT ck_documento_estado CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  CONSTRAINT ck_documento_revision CHECK (
       (estado = 'pendiente' AND revisado_en IS NULL)
    OR (estado <> 'pendiente' AND revisado_en IS NOT NULL)),
  CONSTRAINT ck_documento_rechazo CHECK (estado <> 'rechazado' OR motivo_rechazo IS NOT NULL)
);

-- Un solo documento vigente (pendiente o aprobado) por usuario y tipo; los
-- rechazados se conservan como historial y el usuario puede volver a subir.
CREATE UNIQUE INDEX uq_documento_vigente
  ON documento_usuario (usuario_id, tipo) WHERE estado IN ('pendiente', 'aprobado');
CREATE INDEX idx_documento_estado ON documento_usuario (estado, creado_en);  -- bandeja del admin

-- El tipo de documento debe corresponder al tipo de usuario.
CREATE OR REPLACE FUNCTION fn_documento_validar()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_tipo_usuario VARCHAR;
BEGIN
  SELECT tipo INTO v_tipo_usuario FROM usuario WHERE id = NEW.usuario_id;
  IF (v_tipo_usuario = 'estudiante' AND NEW.tipo <> 'reticula_academica')
     OR (v_tipo_usuario = 'docente' AND NEW.tipo <> 'carga_horaria') THEN
    RAISE EXCEPTION 'DOCUMENTO_NO_CORRESPONDE: un % no puede subir %', v_tipo_usuario, NEW.tipo
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_documento_validar
  BEFORE INSERT ON documento_usuario
  FOR EACH ROW EXECUTE FUNCTION fn_documento_validar();

-- -----------------------------------------------------------------------------
-- vehiculo (RF-06, RN-03, RN-12). Un usuario puede tener varios vehículos.
-- No se borran (los viajes los referencian): se desactivan.
-- -----------------------------------------------------------------------------
CREATE TABLE vehiculo (
  id                           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id                   UUID        NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  marca                        VARCHAR(50) NOT NULL,
  modelo                       VARCHAR(50) NOT NULL,
  color                        VARCHAR(30) NOT NULL,
  placas                       VARCHAR(10) NOT NULL,     -- mayúsculas, sin espacios ni guiones
  capacidad                    SMALLINT    NOT NULL,     -- asientos totales INCLUYENDO al conductor
  declaracion_licencia_seguro  BOOLEAN     NOT NULL,     -- RN-12: se declara, no se verifica
  activo                       BOOLEAN     NOT NULL DEFAULT true,
  creado_en                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ck_vehiculo_textos      CHECK (btrim(marca) <> '' AND btrim(modelo) <> '' AND btrim(color) <> ''),
  CONSTRAINT ck_vehiculo_placas      CHECK (placas ~ '^[A-Z0-9]{5,10}$'),
  CONSTRAINT ck_vehiculo_capacidad   CHECK (capacidad BETWEEN 2 AND 9),     -- conductor + ≥1 (RN-03)
  CONSTRAINT ck_vehiculo_declaracion CHECK (declaracion_licencia_seguro),   -- RF-06
  CONSTRAINT uq_vehiculo_usuario_placas UNIQUE (usuario_id, placas),
  -- Permite la FK compuesta de viaje: el conductor solo publica con SU vehículo.
  CONSTRAINT uq_vehiculo_id_usuario  UNIQUE (id, usuario_id)
);

CREATE TRIGGER trg_vehiculo_actualizado_en
  BEFORE UPDATE ON vehiculo
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

CREATE INDEX idx_vehiculo_usuario ON vehiculo (usuario_id) WHERE activo;
