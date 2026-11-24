-- =============================================================================
-- EcoRuta Escolar · Esquema completo para el SQL Editor de Neon
-- Generado por db/build-neon-bundle.js el 2026-11-24T16:26:16.136Z
-- NO EDITAR A MANO: edita db/migrations/ y vuelve a generar con "npm run db:bundle".
-- Ejecutar UNA sola vez en una base vacía. Es una transacción: si algo falla, no se aplica nada.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  nombre      VARCHAR(255) PRIMARY KEY,
  checksum    CHAR(64)     NOT NULL,
  aplicada_en TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- >>>>>>>>>>>>>>>>>>>> 001_base.sql >>>>>>>>>>>>>>>>>>>>
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

INSERT INTO schema_migrations (nombre, checksum) VALUES ('001_base.sql', '1963c002219bf86efbbdb03f3467b36e3c5cb1678ec08385954916eaa3e56493');

-- >>>>>>>>>>>>>>>>>>>> 002_autenticacion_perfil.sql >>>>>>>>>>>>>>>>>>>>
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

INSERT INTO schema_migrations (nombre, checksum) VALUES ('002_autenticacion_perfil.sql', 'b618e2abe70669b00f178253a41c4231e5b24a044079ae36c28e01817de4595b');

-- >>>>>>>>>>>>>>>>>>>> 003_parametros.sql >>>>>>>>>>>>>>>>>>>>
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

INSERT INTO schema_migrations (nombre, checksum) VALUES ('003_parametros.sql', '6923f3cd564a1dd3359976430656edcde503a0c7770456df6aa738d2249edc4e');

-- >>>>>>>>>>>>>>>>>>>> 004_viajes.sql >>>>>>>>>>>>>>>>>>>>
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

INSERT INTO schema_migrations (nombre, checksum) VALUES ('004_viajes.sql', '2341a3b8d195c083b053bb257ad19f0ec57a2e5eb33016d7a741158a9f370466');

-- >>>>>>>>>>>>>>>>>>>> 005_reservas.sql >>>>>>>>>>>>>>>>>>>>
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

INSERT INTO schema_migrations (nombre, checksum) VALUES ('005_reservas.sql', 'be717d99ecb64bba6ad886be5daaeb32c0f37c0491b10444a034e0c37e6b298a');

-- >>>>>>>>>>>>>>>>>>>> 006_impacto.sql >>>>>>>>>>>>>>>>>>>>
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

INSERT INTO schema_migrations (nombre, checksum) VALUES ('006_impacto.sql', '5081b0c5b2e41fc53d77e380928f44f3d978afc5f2e41b7e0999662b57e43859');

-- >>>>>>>>>>>>>>>>>>>> 007_confianza.sql >>>>>>>>>>>>>>>>>>>>
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

INSERT INTO schema_migrations (nombre, checksum) VALUES ('007_confianza.sql', 'b482a2cebdd21117c3541da183dde015629576b2cc1693654acdad1cba78b2f8');

-- >>>>>>>>>>>>>>>>>>>> 008_datos_referencia.sql >>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- EcoRuta Escolar · Migración 008 · Datos de referencia
-- -----------------------------------------------------------------------------
-- Datos que el sistema NECESITA en cualquier entorno (también producción), por
-- eso van como migración y no como seed. Para cambiarlos después: nueva
-- migración (o el panel de administración, en el caso del FE).
-- =============================================================================

INSERT INTO institucion (nombre, dominios_correo)
VALUES ('TecNM Campus Morelia', ARRAY['morelia.tecnm.mx']);

-- RF-22: FE inicial 0.192 kg CO2/km (auto promedio a gasolina).
-- PENDIENTE (ERS 7.7): confirmar la fuente oficial (SEMARNAT/INECC).
INSERT INTO parametro (clave, valor, descripcion) VALUES
  ('factor_emision_kg_km', '0.192',
   'Factor de emisión (kg CO2 por km) de un auto promedio a gasolina. Fuente: por confirmar (ERS 7.7).');

-- RN-11: puntos del campus.
-- PENDIENTE: coordenadas APROXIMADAS; verificarlas en OpenStreetMap antes del Sprint 2.
INSERT INTO parametro (clave, valor, descripcion) VALUES
  ('puntos_campus',
   '[
      {"clave": "entrada_principal", "nombre": "Entrada principal (Av. Tecnológico)", "lat": 19.721700, "lng": -101.185800},
      {"clave": "entrada_posterior", "nombre": "Entrada posterior",                   "lat": 19.723000, "lng": -101.184500},
      {"clave": "estacionamiento",   "nombre": "Estacionamiento de alumnos",          "lat": 19.722300, "lng": -101.186400}
    ]'::jsonb,
   'Puntos del campus que pueden ser origen o destino de un viaje (RN-11). Coordenadas por verificar.');

-- RF-01: catálogos del formulario de registro. Copia EXACTA (incluidos
-- acentos) de src/constants/options.ts del frontend:
--   TECNM_MORELIA_CAREERS     → carreras
--   TECNM_MORELIA_DEPARTMENTS → departamentos
INSERT INTO parametro (clave, valor, descripcion) VALUES
  ('carreras',
   '[
      "Ingeniería en Sistemas Computacionales",
      "Ingeniería en Tecnologías de la Información y Comunicaciones",
      "Ingeniería Mecatrónica",
      "Ingeniería Electrónica",
      "Ingeniería Mecánica",
      "Ingeniería Eléctrica",
      "Ingeniería Industrial",
      "Ingeniería Bioquímica",
      "Ingeniería en Materiales",
      "Ingeniería en Gestión Empresarial",
      "Licenciatura en Administración",
      "Contador Público"
    ]'::jsonb,
   'Carreras válidas para alumnos (RF-01). Fuente única para GET /api/catalogos.'),
  ('departamentos',
   '[
      "Departamento de Sistemas y Computación",
      "Departamento de Ciencias Básicas",
      "Departamento de Ingeniería Eléctrica y Electrónica",
      "Departamento de Metal Mecánica",
      "Departamento de Ingeniería Industrial",
      "Departamento de Ingeniería Química y Bioquímica",
      "Departamento de Ciencias Económico-Administrativas",
      "División de Estudios Profesionales",
      "División de Estudios de Posgrado e Investigación",
      "Departamento de Desarrollo Académico"
    ]'::jsonb,
   'Departamentos o áreas válidas para maestros (RF-01). Fuente única para GET /api/catalogos.');

INSERT INTO schema_migrations (nombre, checksum) VALUES ('008_datos_referencia.sql', '0e1b18b9801f0e5ff82381e134b5123dd02912b5f9033a3c91920e063c4c64f7');

-- >>>>>>>>>>>>>>>>>>>> 009_puntos_campus.sql >>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- EcoRuta Escolar · Migración 009 · Puntos del campus definitivos (RN-11)
-- -----------------------------------------------------------------------------
-- Reemplaza los 3 puntos aproximados de la migración 008 (entrada_principal,
-- entrada_posterior, estacionamiento, todos en Campus 1) por los puntos de
-- referencia que usa el frontend (frontend/src/constants/options.ts →
-- CAMPUS_REFERENCE_POINTS): campus_1, campus_2 y metalurgia.
-- El frontend debe tomarlos de GET /api/catalogos → campusPoints.
-- =============================================================================

UPDATE parametro
   SET valor = '[
      {"clave": "campus_1",   "nombre": "Campus 1 (Central - Av. Tecnológico)", "lat": 19.721700, "lng": -101.185800},
      {"clave": "campus_2",   "nombre": "Campus 2",                             "lat": 19.688500, "lng": -101.240500},
      {"clave": "metalurgia", "nombre": "Metalurgia (Unidad Morelia)",          "lat": 19.724000, "lng": -101.187000}
    ]'::jsonb,
       descripcion = 'Puntos del campus que pueden ser origen o destino de un viaje (RN-11). Mismos que CAMPUS_REFERENCE_POINTS del frontend.'
 WHERE clave = 'puntos_campus';

-- Los viajes ya publicados con los puntos anteriores pasan a campus_1 (los tres
-- estaban en Campus 1). Se desactiva un momento la validación del trigger para no
-- revalidar viajes históricos (conductor o vehículo que hoy podrían estar inactivos).
ALTER TABLE viaje DISABLE TRIGGER trg_viaje_validar;
UPDATE viaje
   SET punto_campus = 'campus_1'
 WHERE punto_campus IN ('entrada_principal', 'entrada_posterior', 'estacionamiento');
ALTER TABLE viaje ENABLE TRIGGER trg_viaje_validar;

INSERT INTO schema_migrations (nombre, checksum) VALUES ('009_puntos_campus.sql', '0ab447819183050747f31ff2aacea97307823360073478168a9ef8ab261f0d86');

-- >>>>>>>>>>>>>>>>>>>> 010_notificaciones.sql >>>>>>>>>>>>>>>>>>>>
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

INSERT INTO schema_migrations (nombre, checksum) VALUES ('010_notificaciones.sql', '786e5a2e21617d21af5774116be5e34c12e1a45c4887fc2fbf071d547563a6be');

-- >>>>>>>>>>>>>>>>>>>> 011_notificacion_marcas.sql >>>>>>>>>>>>>>>>>>>>
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

INSERT INTO schema_migrations (nombre, checksum) VALUES ('011_notificacion_marcas.sql', 'd6d3cae1df33c082a08672893c771710af06197c886cb07a935d652b34e51c6e');

-- >>>>>>>>>>>>>>>>>>>> 012_puntos_encuentro_lista_espera.sql >>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- EcoRuta Escolar · Migración 012 · Puntos de encuentro y lista de espera
-- -----------------------------------------------------------------------------
-- 1. viaje.puntos_encuentro: puntos que el conductor marcó en el mapa al publicar
--    (se muestran al pasajero en el mapa interactivo del detalle).
--      [{ "id": "p1", "nombre": "...", "descripcion": "...", "lat": 19.7, "lng": -101.1, "orden": 1 }]
-- 2. reserva.punto_union: dónde se unirá el pasajero. Uno de los puntos del
--    conductor o uno que el pasajero propone en la ruta:
--      { "tipo": "conductor", "punto_id": "p1", "nombre": "...", "lat": .., "lng": .. }
--      { "tipo": "propuesto", "nombre": "...", "lat": .., "lng": .., "nota": "..." }
-- 3. Avisos de lista de espera: viaje_lleno (se llenó con tu solicitud pendiente)
--    y lugar_liberado (alguien canceló y vuelve a haber lugar).
-- Sin PostGIS (RNF-17): las coordenadas se validan en la API (zona de Morelia).
-- =============================================================================

ALTER TABLE viaje
  ADD COLUMN puntos_encuentro JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT ck_viaje_puntos_encuentro CHECK (
    jsonb_typeof(puntos_encuentro) = 'array' AND jsonb_array_length(puntos_encuentro) <= 8);

ALTER TABLE reserva
  ADD COLUMN punto_union JSONB,
  ADD CONSTRAINT ck_reserva_punto_union CHECK (
    punto_union IS NULL OR (jsonb_typeof(punto_union) = 'object' AND punto_union->>'tipo' IN ('conductor', 'propuesto')));

COMMENT ON COLUMN viaje.puntos_encuentro IS 'Puntos de encuentro marcados por el conductor (máx. 8).';
COMMENT ON COLUMN reserva.punto_union    IS 'Dónde se une el pasajero: punto del conductor o propuesto en la ruta.';

ALTER TABLE notificacion DROP CONSTRAINT ck_notificacion_tipo;
ALTER TABLE notificacion ADD CONSTRAINT ck_notificacion_tipo CHECK (tipo IN (
  'solicitud_recibida', 'solicitud_aceptada', 'solicitud_rechazada',
  'solicitud_cancelada', 'lugar_cancelado', 'viaje_cancelado',
  'viaje_lleno',     -- al pasajero en espera: el viaje se llenó con su solicitud pendiente
  'lugar_liberado'   -- al pasajero en espera: se liberó un lugar
));

INSERT INTO schema_migrations (nombre, checksum) VALUES ('012_puntos_encuentro_lista_espera.sql', '10d1623ac67d736c199168e6684d51d0fe8a823f47289c7a3aa6fdb45034e9f2');

-- >>>>>>>>>>>>>>>>>>>> 013_catalogo_vehiculos_foto.sql >>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- EcoRuta Escolar · Migración 013 · Catálogo de vehículos y foto del conductor
-- -----------------------------------------------------------------------------
-- 1. catalogo_vehiculo: combinaciones válidas tipo + marca + modelo + año.
--    Se llena con db/catalogos/importar-vpic.js (NHTSA vPIC, migración 014) y,
--    para modelos exclusivos de México, con filas fuente = 'manual'.
-- 2. vehiculo.tipo y vehiculo.anio: obligatorios en la API para registros nuevos;
--    quedan NULL en los vehículos registrados antes de este cambio.
-- 3. usuario.foto_storage_key: foto del perfil capturada con la cámara. Igual
--    que los documentos, la BD guarda la clave y el archivo vive en el storage.
-- =============================================================================

CREATE TABLE catalogo_vehiculo (
  id      SERIAL      PRIMARY KEY,
  tipo    VARCHAR(20) NOT NULL,
  marca   VARCHAR(50) NOT NULL,
  modelo  VARCHAR(50) NOT NULL,
  anio    SMALLINT    NOT NULL,
  fuente  VARCHAR(20) NOT NULL DEFAULT 'manual',
  activo  BOOLEAN     NOT NULL DEFAULT true,
  CONSTRAINT ck_catalogo_vehiculo_tipo   CHECK (tipo IN ('automovil', 'suv', 'pickup')),
  CONSTRAINT ck_catalogo_vehiculo_anio   CHECK (anio BETWEEN 1980 AND 2100),
  CONSTRAINT ck_catalogo_vehiculo_textos CHECK (btrim(marca) <> '' AND btrim(modelo) <> ''),
  CONSTRAINT ck_catalogo_vehiculo_fuente CHECK (fuente IN ('nhtsa_vpic', 'manual')),
  CONSTRAINT uq_catalogo_vehiculo UNIQUE (tipo, marca, modelo, anio)
);

COMMENT ON TABLE catalogo_vehiculo IS 'Combinaciones válidas de tipo, marca, modelo y año para registrar vehículos.';

ALTER TABLE vehiculo
  ADD COLUMN tipo VARCHAR(20),
  ADD COLUMN anio SMALLINT,
  ADD CONSTRAINT ck_vehiculo_tipo CHECK (tipo IS NULL OR tipo IN ('automovil', 'suv', 'pickup')),
  ADD CONSTRAINT ck_vehiculo_anio CHECK (anio IS NULL OR anio BETWEEN 1980 AND 2100);

ALTER TABLE usuario ADD COLUMN foto_storage_key VARCHAR(255);
COMMENT ON COLUMN usuario.foto_storage_key IS 'Foto de perfil (cámara). Se sirve con URL firmada en /api/fotos.';

INSERT INTO schema_migrations (nombre, checksum) VALUES ('013_catalogo_vehiculos_foto.sql', '52e612f88f106b61aaf0619a3cf0271f8ff53744c6b2413d7266562415182f9d');

COMMIT;

SELECT nombre, aplicada_en FROM schema_migrations ORDER BY nombre;
