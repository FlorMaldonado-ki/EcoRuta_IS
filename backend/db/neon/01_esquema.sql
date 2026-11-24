-- =============================================================================
-- EcoRuta Escolar · Esquema completo para el SQL Editor de Neon
-- Generado por db/build-neon-bundle.js el 2026-11-24T18:13:48.310Z
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

-- >>>>>>>>>>>>>>>>>>>> 014_catalogo_vehiculos_vpic.sql >>>>>>>>>>>>>>>>>>>>
-- Generado por db/catalogos/importar-vpic.js el 2026-11-24 (NHTSA vPIC, años 1995–2027).
-- Marcas consultadas sin modelos en vPIC: MG, Peugeot, Renault, SEAT.
INSERT INTO catalogo_vehiculo (tipo, marca, modelo, anio, fuente)
SELECT v.tipo, v.marca, v.modelo, gs.anio, 'nhtsa_vpic'
  FROM (VALUES
  ('automovil', 'Acura', 'CL', 1995, 1999),
  ('automovil', 'Acura', 'CL', 2001, 2003),
  ('automovil', 'Acura', 'ILX', 2013, 2022),
  ('automovil', 'Acura', 'Integra', 1995, 2001),
  ('automovil', 'Acura', 'Integra', 2023, 2027),
  ('automovil', 'Acura', 'Legend', 1995, 1995),
  ('automovil', 'Acura', 'NSX', 1995, 2005),
  ('automovil', 'Acura', 'NSX', 2016, 2022),
  ('automovil', 'Acura', 'RL', 1995, 2012),
  ('automovil', 'Acura', 'RLX', 2014, 2020),
  ('automovil', 'Acura', 'RSX', 2002, 2006),
  ('automovil', 'Acura', 'TL', 1995, 2014),
  ('automovil', 'Acura', 'TLX', 2015, 2025),
  ('automovil', 'Acura', 'TSX', 2004, 2014),
  ('automovil', 'Alfa Romeo', '164', 1995, 1995),
  ('automovil', 'Alfa Romeo', '4C', 2014, 2020),
  ('automovil', 'Alfa Romeo', '8C Competizione Spider', 2000, 2013),
  ('automovil', 'Alfa Romeo', 'Giulia (952)', 2016, 2027),
  ('automovil', 'Alfa Romeo', 'Tonale', 2024, 2027),
  ('automovil', 'Audi', '90', 1995, 1995),
  ('automovil', 'Audi', 'A3', 2006, 2013),
  ('automovil', 'Audi', 'A3', 2015, 2020),
  ('automovil', 'Audi', 'A3', 2022, 2027),
  ('automovil', 'Audi', 'A4', 1996, 2025),
  ('automovil', 'Audi', 'A5', 2008, 2027),
  ('automovil', 'Audi', 'A6', 1995, 2027),
  ('automovil', 'Audi', 'A6 allroad', 2020, 2026),
  ('automovil', 'Audi', 'A7', 2012, 2025),
  ('automovil', 'Audi', 'A7 e', 2021, 2022),
  ('automovil', 'Audi', 'A8', 1997, 2020),
  ('automovil', 'Audi', 'A8 e', 2020, 2020),
  ('automovil', 'Audi', 'A8 L', 2021, 2027),
  ('automovil', 'Audi', 'A8 L e', 2021, 2021),
  ('automovil', 'Audi', 'allroad', 2001, 2005),
  ('automovil', 'Audi', 'Cabriolet', 1995, 1998),
  ('automovil', 'Audi', 'e-tron GT', 2022, 2024),
  ('automovil', 'Audi', 'Q7', 2007, 2015),
  ('automovil', 'Audi', 'Q7', 2017, 2027),
  ('automovil', 'Audi', 'R8', 2008, 2012),
  ('automovil', 'Audi', 'R8', 2014, 2018),
  ('automovil', 'Audi', 'R8', 2020, 2023),
  ('automovil', 'Audi', 'RS 3', 2017, 2020),
  ('automovil', 'Audi', 'RS 3', 2022, 2027),
  ('automovil', 'Audi', 'RS 4', 2007, 2008),
  ('automovil', 'Audi', 'RS 5', 2013, 2015),
  ('automovil', 'Audi', 'RS 5', 2018, 2019),
  ('automovil', 'Audi', 'RS 5', 2021, 2025),
  ('automovil', 'Audi', 'RS 6', 2003, 2004),
  ('automovil', 'Audi', 'RS 6 Avant', 2021, 2026),
  ('automovil', 'Audi', 'RS 7', 2014, 2018),
  ('automovil', 'Audi', 'RS 7', 2021, 2027),
  ('automovil', 'Audi', 'RS e-tron GT', 2022, 2027),
  ('automovil', 'Audi', 'S e-tron GT', 2025, 2027),
  ('automovil', 'Audi', 'S3', 2015, 2020),
  ('automovil', 'Audi', 'S3', 2022, 2027),
  ('automovil', 'Audi', 'S4', 2000, 2002),
  ('automovil', 'Audi', 'S4', 2004, 2016),
  ('automovil', 'Audi', 'S4', 2018, 2025),
  ('automovil', 'Audi', 'S5', 2008, 2027),
  ('automovil', 'Audi', 'S6', 1995, 1997),
  ('automovil', 'Audi', 'S6', 2002, 2003),
  ('automovil', 'Audi', 'S6', 2007, 2011),
  ('automovil', 'Audi', 'S6', 2013, 2018),
  ('automovil', 'Audi', 'S6', 2020, 2025),
  ('automovil', 'Audi', 'S6', 2027, 2027),
  ('automovil', 'Audi', 'S7', 2013, 2018),
  ('automovil', 'Audi', 'S7', 2020, 2025),
  ('automovil', 'Audi', 'S8', 2001, 2003),
  ('automovil', 'Audi', 'S8', 2007, 2009),
  ('automovil', 'Audi', 'S8', 2013, 2018),
  ('automovil', 'Audi', 'S8', 2020, 2027),
  ('automovil', 'Audi', 'TT', 2000, 2006),
  ('automovil', 'Audi', 'TT', 2008, 2023),
  ('automovil', 'Audi', 'TT RS', 2013, 2014),
  ('automovil', 'Audi', 'TT RS', 2018, 2022),
  ('automovil', 'Audi', 'TTS', 2009, 2023),
  ('automovil', 'BMW', '128i', 2008, 2014),
  ('automovil', 'BMW', '135i', 2008, 2014),
  ('automovil', 'BMW', '1M', 2011, 2011),
  ('automovil', 'BMW', '228', 2026, 2027),
  ('automovil', 'BMW', '228i', 2014, 2018),
  ('automovil', 'BMW', '228i', 2020, 2025),
  ('automovil', 'BMW', '230i', 2017, 2026),
  ('automovil', 'BMW', '318i', 1995, 1998),
  ('automovil', 'BMW', '318iC', 1995, 1996),
  ('automovil', 'BMW', '318iS', 1995, 1996),
  ('automovil', 'BMW', '318ti', 1995, 1996),
  ('automovil', 'BMW', '318ti', 1999, 2000),
  ('automovil', 'BMW', '320i', 2013, 2018),
  ('automovil', 'BMW', '323i', 1999, 2000),
  ('automovil', 'BMW', '323iC', 1998, 2000),
  ('automovil', 'BMW', '323is', 1998, 2000),
  ('automovil', 'BMW', '325Ci', 2000, 2006),
  ('automovil', 'BMW', '325i', 1995, 1995),
  ('automovil', 'BMW', '325i', 2001, 2006),
  ('automovil', 'BMW', '325iC', 1995, 1995),
  ('automovil', 'BMW', '325iS', 1995, 1995),
  ('automovil', 'BMW', '325xi', 2002, 2006),
  ('automovil', 'BMW', '328Ci', 1999, 2000),
  ('automovil', 'BMW', '328d', 2014, 2018),
  ('automovil', 'BMW', '328i', 1996, 2000),
  ('automovil', 'BMW', '328i', 2007, 2016),
  ('automovil', 'BMW', '328iC', 1996, 2000),
  ('automovil', 'BMW', '328iS', 1996, 2000),
  ('automovil', 'BMW', '328xi', 2007, 2008),
  ('automovil', 'BMW', '330Ci', 2001, 2006),
  ('automovil', 'BMW', '330e', 2016, 2018),
  ('automovil', 'BMW', '330e', 2021, 2024),
  ('automovil', 'BMW', '330i', 2001, 2006),
  ('automovil', 'BMW', '330i', 2017, 2027),
  ('automovil', 'BMW', '330xi', 2002, 2006),
  ('automovil', 'BMW', '335', 2014, 2014),
  ('automovil', 'BMW', '335d', 2009, 2011),
  ('automovil', 'BMW', '335i', 2007, 2017),
  ('automovil', 'BMW', '335is', 2011, 2015),
  ('automovil', 'BMW', '335xi', 2007, 2008),
  ('automovil', 'BMW', '340i', 2016, 2019),
  ('automovil', 'BMW', '340i', 2023, 2024),
  ('automovil', 'BMW', '428i', 2014, 2016),
  ('automovil', 'BMW', '430i', 2017, 2027),
  ('automovil', 'BMW', '435i', 2014, 2016),
  ('automovil', 'BMW', '440i', 2017, 2020),
  ('automovil', 'BMW', '525i', 1995, 1995),
  ('automovil', 'BMW', '525i', 2001, 2007),
  ('automovil', 'BMW', '525iA', 2003, 2003),
  ('automovil', 'BMW', '525xi', 2006, 2007),
  ('automovil', 'BMW', '528i', 1997, 2000),
  ('automovil', 'BMW', '528i', 2008, 2016),
  ('automovil', 'BMW', '528xi', 2008, 2008),
  ('automovil', 'BMW', '528xi', 2012, 2013),
  ('automovil', 'BMW', '530e', 2018, 2023),
  ('automovil', 'BMW', '530i', 1995, 1995),
  ('automovil', 'BMW', '530i', 2001, 2007),
  ('automovil', 'BMW', '530i', 2017, 2027),
  ('automovil', 'BMW', '530iA', 2003, 2003),
  ('automovil', 'BMW', '530xi', 2006, 2007),
  ('automovil', 'BMW', '535d', 2014, 2016),
  ('automovil', 'BMW', '535i', 2008, 2017),
  ('automovil', 'BMW', '535xi', 2008, 2008),
  ('automovil', 'BMW', '540d', 2018, 2019),
  ('automovil', 'BMW', '540i', 1995, 1995),
  ('automovil', 'BMW', '540i', 1997, 2003),
  ('automovil', 'BMW', '540i', 2017, 2027),
  ('automovil', 'BMW', '540iA', 2003, 2003),
  ('automovil', 'BMW', '545i', 2004, 2005),
  ('automovil', 'BMW', '550e', 2025, 2027),
  ('automovil', 'BMW', '550i', 2006, 2017),
  ('automovil', 'BMW', '640i', 2012, 2019),
  ('automovil', 'BMW', '640xi', 2018, 2019),
  ('automovil', 'BMW', '645Ci', 2004, 2005),
  ('automovil', 'BMW', '645i', 2004, 2004),
  ('automovil', 'BMW', '650i', 2006, 2010),
  ('automovil', 'BMW', '650i', 2012, 2019),
  ('automovil', 'BMW', '650i, Alpina B6', 2015, 2016),
  ('automovil', 'BMW', '650i, B6', 2017, 2019),
  ('automovil', 'BMW', '650xi', 2012, 2015),
  ('automovil', 'BMW', '740', 2027, 2027),
  ('automovil', 'BMW', '740e', 2017, 2019),
  ('automovil', 'BMW', '740i', 1995, 1995),
  ('automovil', 'BMW', '740i', 1997, 2001),
  ('automovil', 'BMW', '740i', 2011, 2021),
  ('automovil', 'BMW', '740i', 2023, 2026),
  ('automovil', 'BMW', '740iL', 1995, 2001),
  ('automovil', 'BMW', '740Li', 2011, 2015),
  ('automovil', 'BMW', '740Li', 2022, 2022),
  ('automovil', 'BMW', '745e', 2020, 2021),
  ('automovil', 'BMW', '745i', 2002, 2005),
  ('automovil', 'BMW', '745Le', 2022, 2022),
  ('automovil', 'BMW', '745Li', 2002, 2005),
  ('automovil', 'BMW', '750e', 2024, 2027),
  ('automovil', 'BMW', '750i', 2001, 2001),
  ('automovil', 'BMW', '750i', 2006, 2016),
  ('automovil', 'BMW', '750i', 2018, 2022),
  ('automovil', 'BMW', '750i, Alpina B7', 2012, 2015),
  ('automovil', 'BMW', '750i, B7', 2017, 2019),
  ('automovil', 'BMW', '750iL', 1995, 1999),
  ('automovil', 'BMW', '750Li', 2000, 2000),
  ('automovil', 'BMW', '750Li', 2006, 2015),
  ('automovil', 'BMW', '750Li', 2022, 2022),
  ('automovil', 'BMW', '750Li, Alpina B7', 2012, 2015),
  ('automovil', 'BMW', '750Lxi', 2010, 2011),
  ('automovil', 'BMW', '750Lxi', 2013, 2015),
  ('automovil', 'BMW', '750Lxi, Alpina B7', 2012, 2012),
  ('automovil', 'BMW', '750xi', 2010, 2011),
  ('automovil', 'BMW', '750xi', 2013, 2015),
  ('automovil', 'BMW', '750xi, Alpina B7', 2012, 2012),
  ('automovil', 'BMW', '760i', 2005, 2006),
  ('automovil', 'BMW', '760i', 2023, 2026),
  ('automovil', 'BMW', '760Li', 2003, 2008),
  ('automovil', 'BMW', '760Li', 2010, 2015),
  ('automovil', 'BMW', '840Ci', 1995, 1996),
  ('automovil', 'BMW', '840i', 2020, 2026),
  ('automovil', 'BMW', '850Ci', 1995, 1996),
  ('automovil', 'BMW', '850CSi', 1995, 1995),
  ('automovil', 'BMW', '850i', 2019, 2019),
  ('automovil', 'BMW', 'ActiveE', 2012, 2012),
  ('automovil', 'BMW', 'ActiveHybrid 3', 2014, 2015),
  ('automovil', 'BMW', 'ActiveHybrid 5', 2012, 2016),
  ('automovil', 'BMW', 'ActiveHybrid 5', 2018, 2018),
  ('automovil', 'BMW', 'ActiveHybrid 7', 2014, 2015),
  ('automovil', 'BMW', 'Alpina', 2003, 2003),
  ('automovil', 'BMW', 'Alpina B8', 2022, 2025),
  ('automovil', 'BMW', 'B7', 2019, 2022),
  ('automovil', 'BMW', 'i3', 2014, 2021),
  ('automovil', 'BMW', 'i3', 2027, 2027),
  ('automovil', 'BMW', 'i4', 2022, 2026),
  ('automovil', 'BMW', 'i5', 2024, 2027),
  ('automovil', 'BMW', 'i7', 2023, 2027),
  ('automovil', 'BMW', 'i8', 2014, 2017),
  ('automovil', 'BMW', 'i8', 2019, 2020),
  ('automovil', 'BMW', 'M2', 2016, 2027),
  ('automovil', 'BMW', 'M235', 2025, 2027),
  ('automovil', 'BMW', 'M235i', 2014, 2016),
  ('automovil', 'BMW', 'M235i', 2020, 2024),
  ('automovil', 'BMW', 'M240i', 2017, 2027),
  ('automovil', 'BMW', 'M3', 1995, 1999),
  ('automovil', 'BMW', 'M3', 2001, 2006),
  ('automovil', 'BMW', 'M3', 2008, 2013),
  ('automovil', 'BMW', 'M3', 2015, 2018),
  ('automovil', 'BMW', 'M3', 2021, 2027),
  ('automovil', 'BMW', 'M340i', 2020, 2026),
  ('automovil', 'BMW', 'M350', 2027, 2027),
  ('automovil', 'BMW', 'M3Ci', 2001, 2006),
  ('automovil', 'BMW', 'M4', 2015, 2027),
  ('automovil', 'BMW', 'M440i', 2021, 2027),
  ('automovil', 'BMW', 'M5', 2000, 2003),
  ('automovil', 'BMW', 'M5', 2006, 2010),
  ('automovil', 'BMW', 'M5', 2013, 2023),
  ('automovil', 'BMW', 'M5', 2025, 2027),
  ('automovil', 'BMW', 'M550i', 2018, 2023),
  ('automovil', 'BMW', 'M6', 2006, 2010),
  ('automovil', 'BMW', 'M6', 2012, 2019),
  ('automovil', 'BMW', 'M760i', 2017, 2021),
  ('automovil', 'BMW', 'M760Li', 2022, 2022),
  ('automovil', 'BMW', 'M8', 2020, 2025),
  ('automovil', 'BMW', 'M850i', 2020, 2026),
  ('automovil', 'BMW', 'X1', 2012, 2027),
  ('automovil', 'BMW', 'X3', 2004, 2027),
  ('automovil', 'BMW', 'X5', 2000, 2027),
  ('automovil', 'BMW', 'Z3', 1996, 2002),
  ('automovil', 'BMW', 'Z4', 2003, 2016),
  ('automovil', 'BMW', 'Z4', 2019, 2026),
  ('automovil', 'BMW', 'Z8', 2001, 2003),
  ('automovil', 'Buick', 'Allure', 2005, 2009),
  ('automovil', 'Buick', 'Cascada', 2016, 2019),
  ('automovil', 'Buick', 'Century', 1995, 2005),
  ('automovil', 'Buick', 'Coachbuilder', 1995, 1996),
  ('automovil', 'Buick', 'LaCrosse', 2005, 2019),
  ('automovil', 'Buick', 'LeSabre', 1995, 2005),
  ('automovil', 'Buick', 'Lucerne', 2006, 2011),
  ('automovil', 'Buick', 'Park Avenue', 1995, 2005),
  ('automovil', 'Buick', 'Regal', 1995, 2004),
  ('automovil', 'Buick', 'Regal', 2011, 2020),
  ('automovil', 'Buick', 'Regal TourX', 2018, 2020),
  ('automovil', 'Buick', 'Riviera', 1995, 1999),
  ('automovil', 'Buick', 'Roadmaster', 1995, 1996),
  ('automovil', 'Buick', 'Skylark', 1995, 1998),
  ('automovil', 'Buick', 'Verano', 2012, 2017),
  ('automovil', 'BYD', 'e6', 2011, 2017),
  ('automovil', 'Cadillac', 'ATS', 2013, 2019),
  ('automovil', 'Cadillac', 'Catera', 1997, 2001),
  ('automovil', 'Cadillac', 'Celestiq', 2025, 2027),
  ('automovil', 'Cadillac', 'Commercial Chassis', 1995, 2001),
  ('automovil', 'Cadillac', 'CT4', 2020, 2027),
  ('automovil', 'Cadillac', 'CT5', 2020, 2027),
  ('automovil', 'Cadillac', 'CT6', 2016, 2020),
  ('automovil', 'Cadillac', 'CTS', 2003, 2019),
  ('automovil', 'Cadillac', 'Deville', 1995, 2005),
  ('automovil', 'Cadillac', 'DTS', 2006, 2011),
  ('automovil', 'Cadillac', 'Eldorado', 1995, 2002),
  ('automovil', 'Cadillac', 'ELR', 2014, 2017),
  ('automovil', 'Cadillac', 'Fleetwood', 1995, 1996),
  ('automovil', 'Cadillac', 'Hearse', 1997, 2011),
  ('automovil', 'Cadillac', 'Limousine', 1998, 2011),
  ('automovil', 'Cadillac', 'Seville', 1995, 2004),
  ('automovil', 'Cadillac', 'STS', 2005, 2011),
  ('automovil', 'Cadillac', 'XLR', 2003, 2009),
  ('automovil', 'Cadillac', 'XTS', 2013, 2019),
  ('automovil', 'Chevrolet', 'Alero', 1999, 1999),
  ('automovil', 'Chevrolet', 'Aveo', 2004, 2020),
  ('automovil', 'Chevrolet', 'Beretta', 1995, 1996),
  ('automovil', 'Chevrolet', 'Bolt', 2027, 2027),
  ('automovil', 'Chevrolet', 'Bolt EUV', 2022, 2023),
  ('automovil', 'Chevrolet', 'Bolt EV', 2017, 2023),
  ('automovil', 'Chevrolet', 'Camaro', 1995, 2002),
  ('automovil', 'Chevrolet', 'Camaro', 2010, 2024),
  ('automovil', 'Chevrolet', 'Caprice', 1995, 1996),
  ('automovil', 'Chevrolet', 'Caprice Police Vehicle', 2011, 2017),
  ('automovil', 'Chevrolet', 'Cavalier', 1995, 2005),
  ('automovil', 'Chevrolet', 'Cobalt', 2005, 2010),
  ('automovil', 'Chevrolet', 'Corsica', 1995, 1996),
  ('automovil', 'Chevrolet', 'Corvette', 1995, 2027),
  ('automovil', 'Chevrolet', 'Cruze', 2010, 2019),
  ('automovil', 'Chevrolet', 'Cruze Limited', 2016, 2016),
  ('automovil', 'Chevrolet', 'Epica', 2004, 2006),
  ('automovil', 'Chevrolet', 'Geo Prizm', 1998, 2002),
  ('automovil', 'Chevrolet', 'Hearse/Limo', 1995, 1995),
  ('automovil', 'Chevrolet', 'Impala', 2000, 2020),
  ('automovil', 'Chevrolet', 'Impala Limited', 2014, 2016),
  ('automovil', 'Chevrolet', 'Kalos', 2008, 2008),
  ('automovil', 'Chevrolet', 'Lumina', 1995, 2001),
  ('automovil', 'Chevrolet', 'Malibu', 1997, 2025),
  ('automovil', 'Chevrolet', 'Malibu Classic', 2004, 2005),
  ('automovil', 'Chevrolet', 'Malibu Limited', 2016, 2016),
  ('automovil', 'Chevrolet', 'Matiz', 2004, 2006),
  ('automovil', 'Chevrolet', 'Matiz', 2008, 2008),
  ('automovil', 'Chevrolet', 'Matiz', 2012, 2012),
  ('automovil', 'Chevrolet', 'Metro', 1998, 2001),
  ('automovil', 'Chevrolet', 'Monte Carlo', 1995, 2007),
  ('automovil', 'Chevrolet', 'Onix', 2021, 2024),
  ('automovil', 'Chevrolet', 'Optra', 2004, 2009),
  ('automovil', 'Chevrolet', 'Sonic', 2012, 2020),
  ('automovil', 'Chevrolet', 'Spark', 2008, 2008),
  ('automovil', 'Chevrolet', 'Spark', 2011, 2022),
  ('automovil', 'Chevrolet', 'SS', 2014, 2017),
  ('automovil', 'Chevrolet', 'U100', 2004, 2005),
  ('automovil', 'Chevrolet', 'Volt', 2011, 2019),
  ('automovil', 'Chrysler', '200', 2011, 2017),
  ('automovil', 'Chrysler', '300', 1999, 2023),
  ('automovil', 'Chrysler', '300C', 2005, 2011),
  ('automovil', 'Chrysler', 'Cirrus', 1995, 2000),
  ('automovil', 'Chrysler', 'Cirrus', 2006, 2006),
  ('automovil', 'Chrysler', 'Concorde', 1995, 2004),
  ('automovil', 'Chrysler', 'Concorde/LHS', 1995, 1995),
  ('automovil', 'Chrysler', 'Crossfire', 2004, 2008),
  ('automovil', 'Chrysler', 'Intrepid', 1995, 2003),
  ('automovil', 'Chrysler', 'LeBaron', 1995, 1995),
  ('automovil', 'Chrysler', 'LHS', 1995, 1997),
  ('automovil', 'Chrysler', 'LHS', 1999, 2001),
  ('automovil', 'Chrysler', 'Neon', 1995, 2002),
  ('automovil', 'Chrysler', 'New Yorker', 1995, 1997),
  ('automovil', 'Chrysler', 'Prowler', 2001, 2002),
  ('automovil', 'Chrysler', 'PT Cruiser', 2001, 2010),
  ('automovil', 'Chrysler', 'Sebring', 1995, 2010),
  ('automovil', 'Chrysler', 'Stratus', 1995, 1997),
  ('automovil', 'Chrysler', 'Viper', 1995, 1997),
  ('automovil', 'Chrysler', 'Vision', 1995, 1997),
  ('automovil', 'Dodge', 'Avenger', 1995, 2000),
  ('automovil', 'Dodge', 'Avenger', 2007, 2014),
  ('automovil', 'Dodge', 'Caliber', 2006, 2012),
  ('automovil', 'Dodge', 'Challenger', 2008, 2023),
  ('automovil', 'Dodge', 'Charger', 2006, 2027),
  ('automovil', 'Dodge', 'Colt', 1995, 1995),
  ('automovil', 'Dodge', 'Dart', 2013, 2016),
  ('automovil', 'Dodge', 'Intrepid', 1995, 2004),
  ('automovil', 'Dodge', 'Neon', 1995, 2005),
  ('automovil', 'Dodge', 'Ram', 1995, 2012),
  ('automovil', 'Dodge', 'Spirit', 1995, 1995),
  ('automovil', 'Dodge', 'Stealth', 1995, 1996),
  ('automovil', 'Dodge', 'Stratus', 1995, 2006),
  ('automovil', 'Dodge', 'Viper', 1995, 2006),
  ('automovil', 'Dodge', 'Viper', 2008, 2010),
  ('automovil', 'Dodge', 'Viper', 2013, 2017),
  ('automovil', 'Fiat', '124 Spider', 2017, 2020),
  ('automovil', 'Fiat', '500', 2012, 2019),
  ('automovil', 'Fiat', '500e', 2024, 2027),
  ('automovil', 'Ford', '''34', 1995, 2027),
  ('automovil', 'Ford', 'Aspire', 1995, 1997),
  ('automovil', 'Ford', 'C-Max', 2013, 2018),
  ('automovil', 'Ford', 'Contour', 1995, 2000),
  ('automovil', 'Ford', 'Crown Victoria', 1995, 2011),
  ('automovil', 'Ford', 'Escort', 1995, 2002),
  ('automovil', 'Ford', 'Fiesta', 2011, 2019),
  ('automovil', 'Ford', 'Five Hundred', 2005, 2007),
  ('automovil', 'Ford', 'Focus', 2000, 2018),
  ('automovil', 'Ford', 'Fusion', 2006, 2020),
  ('automovil', 'Ford', 'GT', 2004, 2006),
  ('automovil', 'Ford', 'GT', 2017, 2022),
  ('automovil', 'Ford', 'GT MKII', 2023, 2027),
  ('automovil', 'Ford', 'Mustang', 1995, 2027),
  ('automovil', 'Ford', 'Mustang GTD', 2025, 2027),
  ('automovil', 'Ford', 'Probe', 1995, 1997),
  ('automovil', 'Ford', 'Taurus', 1995, 2019),
  ('automovil', 'Ford', 'Thunderbird', 1995, 1997),
  ('automovil', 'Ford', 'Thunderbird', 2002, 2005),
  ('automovil', 'Ford', 'ZX2', 1999, 2003),
  ('automovil', 'GMC', 'Electric Vehicle', 1997, 2000),
  ('automovil', 'Honda', 'Accord', 1995, 2027),
  ('automovil', 'Honda', 'Civic', 1995, 2027),
  ('automovil', 'Honda', 'Civic Si', 2022, 2026),
  ('automovil', 'Honda', 'Civic Type R', 2017, 2021),
  ('automovil', 'Honda', 'Civic Type R', 2023, 2027),
  ('automovil', 'Honda', 'Clarity', 2017, 2021),
  ('automovil', 'Honda', 'CR-Z', 2011, 2016),
  ('automovil', 'Honda', 'del Sol', 1995, 1997),
  ('automovil', 'Honda', 'EV Plus', 1997, 1999),
  ('automovil', 'Honda', 'FCX Clarity', 2004, 2014),
  ('automovil', 'Honda', 'Fit', 2007, 2020),
  ('automovil', 'Honda', 'Insight', 2000, 2014),
  ('automovil', 'Honda', 'Insight', 2019, 2022),
  ('automovil', 'Honda', 'Odyssey', 1995, 2027),
  ('automovil', 'Honda', 'Prelude', 1995, 2001),
  ('automovil', 'Honda', 'Prelude', 2026, 2027),
  ('automovil', 'Honda', 'S2000', 2000, 2009),
  ('automovil', 'Hyundai', 'Accent', 1995, 2022),
  ('automovil', 'Hyundai', 'Azera', 2006, 2018),
  ('automovil', 'Hyundai', 'Elantra', 1995, 2027),
  ('automovil', 'Hyundai', 'Elantra GT', 2017, 2020),
  ('automovil', 'Hyundai', 'Elantra N', 2022, 2027),
  ('automovil', 'Hyundai', 'Elantra Touring', 2010, 2010),
  ('automovil', 'Hyundai', 'Equus', 2011, 2016),
  ('automovil', 'Hyundai', 'Genesis', 2009, 2016),
  ('automovil', 'Hyundai', 'Genesis Coupe', 2010, 2016),
  ('automovil', 'Hyundai', 'Ioniq', 2017, 2022),
  ('automovil', 'Hyundai', 'Ioniq 6', 2023, 2026),
  ('automovil', 'Hyundai', 'Ioniq 6 N', 2026, 2027),
  ('automovil', 'Hyundai', 'Santa Fe', 2001, 2027),
  ('automovil', 'Hyundai', 'Scoupe', 1995, 1995),
  ('automovil', 'Hyundai', 'Sonata', 1995, 2027),
  ('automovil', 'Hyundai', 'Tiburon', 1997, 2008),
  ('automovil', 'Hyundai', 'Tucson', 2005, 2027),
  ('automovil', 'Hyundai', 'Veloster', 2012, 2021),
  ('automovil', 'Hyundai', 'Veloster N', 2019, 2022),
  ('automovil', 'Hyundai', 'Venue', 2020, 2027),
  ('automovil', 'Hyundai', 'Veracruz', 2007, 2013),
  ('automovil', 'Hyundai', 'XG300', 2001, 2001),
  ('automovil', 'Hyundai', 'XG350', 2002, 2005),
  ('automovil', 'Infiniti', 'EX35', 2008, 2013),
  ('automovil', 'Infiniti', 'G20', 1995, 1996),
  ('automovil', 'Infiniti', 'G20', 1999, 2002),
  ('automovil', 'Infiniti', 'G25', 2011, 2012),
  ('automovil', 'Infiniti', 'G35', 2003, 2009),
  ('automovil', 'Infiniti', 'G37', 2008, 2013),
  ('automovil', 'Infiniti', 'I30', 1996, 2001),
  ('automovil', 'Infiniti', 'I35', 2002, 2004),
  ('automovil', 'Infiniti', 'J30', 1995, 1997),
  ('automovil', 'Infiniti', 'M35', 2006, 2010),
  ('automovil', 'Infiniti', 'M35h', 2012, 2013),
  ('automovil', 'Infiniti', 'M37', 2011, 2013),
  ('automovil', 'Infiniti', 'M45', 2003, 2004),
  ('automovil', 'Infiniti', 'M45', 2006, 2010),
  ('automovil', 'Infiniti', 'M56', 2011, 2013),
  ('automovil', 'Infiniti', 'Q40', 2015, 2016),
  ('automovil', 'Infiniti', 'Q45', 1995, 2007),
  ('automovil', 'Infiniti', 'Q50', 2014, 2024),
  ('automovil', 'Infiniti', 'Q60', 2014, 2015),
  ('automovil', 'Infiniti', 'Q60', 2017, 2022),
  ('automovil', 'Infiniti', 'Q70', 2014, 2022),
  ('automovil', 'Infiniti', 'Q70L', 2015, 2022),
  ('automovil', 'Infiniti', 'QX30', 2017, 2019),
  ('automovil', 'Infiniti', 'QX50', 2014, 2017),
  ('automovil', 'Infiniti', 'QX50', 2019, 2025),
  ('automovil', 'Jaguar', 'F-TYPE', 2014, 2024),
  ('automovil', 'Jaguar', 'S-Type', 2000, 2008),
  ('automovil', 'Jaguar', 'Vanden Plas', 1995, 2004),
  ('automovil', 'Jaguar', 'X-Type', 2002, 2008),
  ('automovil', 'Jaguar', 'XE', 2017, 2021),
  ('automovil', 'Jaguar', 'XF', 2009, 2024),
  ('automovil', 'Jaguar', 'XJ', 2002, 2019),
  ('automovil', 'Jaguar', 'XJ12', 1995, 1997),
  ('automovil', 'Jaguar', 'XJ6', 1995, 1997),
  ('automovil', 'Jaguar', 'XJ8', 1998, 2003),
  ('automovil', 'Jaguar', 'XJR', 1995, 2007),
  ('automovil', 'Jaguar', 'XJS', 1995, 1997),
  ('automovil', 'Jaguar', 'XK', 2000, 2015),
  ('automovil', 'Jaguar', 'XK8', 1997, 2004),
  ('automovil', 'Kia', 'Amanti', 2004, 2009),
  ('automovil', 'Kia', 'Borrego', 2009, 2011),
  ('automovil', 'Kia', 'Cadenza', 2014, 2020),
  ('automovil', 'Kia', 'Forte', 2010, 2024),
  ('automovil', 'Kia', 'Forte Koup', 2016, 2017),
  ('automovil', 'Kia', 'K4', 2025, 2027),
  ('automovil', 'Kia', 'K5', 2021, 2027),
  ('automovil', 'Kia', 'K900', 2015, 2020),
  ('automovil', 'Kia', 'Optima', 2001, 2020),
  ('automovil', 'Kia', 'Rio', 2001, 2023),
  ('automovil', 'Kia', 'Rondo', 2007, 2016),
  ('automovil', 'Kia', 'Sedona', 2001, 2021),
  ('automovil', 'Kia', 'Sephia', 1995, 2001),
  ('automovil', 'Kia', 'Sorento', 2001, 2009),
  ('automovil', 'Kia', 'Sorento', 2011, 2027),
  ('automovil', 'Kia', 'Spectra', 2000, 2009),
  ('automovil', 'Kia', 'Sportage', 1995, 2027),
  ('automovil', 'Kia', 'Stinger', 2018, 2023),
  ('automovil', 'Lincoln', 'Continental', 1995, 2002),
  ('automovil', 'Lincoln', 'Continental', 2017, 2020),
  ('automovil', 'Lincoln', 'LS', 2000, 2006),
  ('automovil', 'Lincoln', 'Mark', 1995, 1998),
  ('automovil', 'Lincoln', 'MKS', 2009, 2016),
  ('automovil', 'Lincoln', 'MKZ', 2007, 2020),
  ('automovil', 'Lincoln', 'Town Car', 1995, 2011),
  ('automovil', 'Lincoln', 'Zephyr', 2006, 2006),
  ('automovil', 'Mazda', '626', 1995, 2002),
  ('automovil', 'Mazda', '929', 1995, 1996),
  ('automovil', 'Mazda', 'CX-3', 2016, 2022),
  ('automovil', 'Mazda', 'Mazda2', 2011, 2021),
  ('automovil', 'Mazda', 'Mazda3', 2004, 2027),
  ('automovil', 'Mazda', 'Mazda5', 2006, 2015),
  ('automovil', 'Mazda', 'Mazda6', 2003, 2021),
  ('automovil', 'Mazda', 'Millenia', 1995, 2002),
  ('automovil', 'Mazda', 'MPV', 1995, 2006),
  ('automovil', 'Mazda', 'MX-3', 1995, 1996),
  ('automovil', 'Mazda', 'MX-30', 2022, 2023),
  ('automovil', 'Mazda', 'MX-5', 1995, 1997),
  ('automovil', 'Mazda', 'MX-5', 1999, 2027),
  ('automovil', 'Mazda', 'MX-6', 1996, 1997),
  ('automovil', 'Mazda', 'Protege', 1995, 2003),
  ('automovil', 'Mazda', 'RX-7', 1995, 1996),
  ('automovil', 'Mazda', 'RX-8', 2004, 2012),
  ('automovil', 'Mercedes-Benz', 'A-Class', 2019, 2022),
  ('automovil', 'Mercedes-Benz', 'AMG GT', 2016, 2027),
  ('automovil', 'Mercedes-Benz', 'B-Class', 2011, 2012),
  ('automovil', 'Mercedes-Benz', 'B-Class', 2014, 2022),
  ('automovil', 'Mercedes-Benz', 'C-Class', 1995, 2027),
  ('automovil', 'Mercedes-Benz', 'CL-Class', 1998, 2014),
  ('automovil', 'Mercedes-Benz', 'CLA-Class', 2014, 2027),
  ('automovil', 'Mercedes-Benz', 'CLE', 2024, 2027),
  ('automovil', 'Mercedes-Benz', 'CLK-Class', 1998, 2009),
  ('automovil', 'Mercedes-Benz', 'CLS-Class', 2005, 2023),
  ('automovil', 'Mercedes-Benz', 'E-Class', 1995, 2027),
  ('automovil', 'Mercedes-Benz', 'EQE-Class Sedan', 2023, 2026),
  ('automovil', 'Mercedes-Benz', 'EQS-Class Sedan', 2022, 2027),
  ('automovil', 'Mercedes-Benz', 'G-Class', 1999, 1999),
  ('automovil', 'Mercedes-Benz', 'G-Class', 2002, 2027),
  ('automovil', 'Mercedes-Benz', 'GLA-Class', 2015, 2026),
  ('automovil', 'Mercedes-Benz', 'S-Class', 1995, 2027),
  ('automovil', 'Mercedes-Benz', 'SL-Class', 1995, 2009),
  ('automovil', 'Mercedes-Benz', 'SL-Class', 2011, 2027),
  ('automovil', 'Mercedes-Benz', 'SLC-Class', 2017, 2020),
  ('automovil', 'Mercedes-Benz', 'SLK-Class', 1998, 2016),
  ('automovil', 'Mercedes-Benz', 'SLR McLaren', 2004, 2009),
  ('automovil', 'Mercedes-Benz', 'SLS-Class', 2011, 2022),
  ('automovil', 'Mini', 'Clubman', 2008, 2014),
  ('automovil', 'Mini', 'Clubman', 2016, 2024),
  ('automovil', 'Mini', 'Cooper', 2002, 2010),
  ('automovil', 'Mini', 'Cooper Convertible', 2004, 2027),
  ('automovil', 'Mini', 'Cooper Coupe', 2012, 2015),
  ('automovil', 'Mini', 'Cooper Roadster', 2012, 2015),
  ('automovil', 'Mini', 'Countryman', 2011, 2027),
  ('automovil', 'Mini', 'Hardtop', 2009, 2027),
  ('automovil', 'Mini', 'Paceman', 2013, 2019),
  ('automovil', 'Mitsubishi', '3000GT', 1995, 1999),
  ('automovil', 'Mitsubishi', 'Diamante', 1995, 2005),
  ('automovil', 'Mitsubishi', 'Eclipse', 1995, 2012),
  ('automovil', 'Mitsubishi', 'Expo', 1995, 1996),
  ('automovil', 'Mitsubishi', 'Galant', 1995, 2012),
  ('automovil', 'Mitsubishi', 'i-MiEV', 2012, 2018),
  ('automovil', 'Mitsubishi', 'Lancer', 2002, 2017),
  ('automovil', 'Mitsubishi', 'Lancer Evolution', 2003, 2006),
  ('automovil', 'Mitsubishi', 'Lancer Evolution', 2008, 2015),
  ('automovil', 'Mitsubishi', 'Lancer SportBack', 2004, 2005),
  ('automovil', 'Mitsubishi', 'Lancer SportBack', 2009, 2017),
  ('automovil', 'Mitsubishi', 'Mirage', 1995, 2002),
  ('automovil', 'Mitsubishi', 'Mirage', 2014, 2024),
  ('automovil', 'Mitsubishi', 'Mirage G4', 2017, 2024),
  ('automovil', 'Nissan', '200SX', 1995, 1998),
  ('automovil', 'Nissan', '240SX', 1995, 2001),
  ('automovil', 'Nissan', '300ZX', 1995, 1996),
  ('automovil', 'Nissan', '350Z', 2003, 2009),
  ('automovil', 'Nissan', '370Z', 2009, 2022),
  ('automovil', 'Nissan', 'Altima', 1995, 2027),
  ('automovil', 'Nissan', 'Altra', 1998, 1998),
  ('automovil', 'Nissan', 'Altra-EV', 1999, 2002),
  ('automovil', 'Nissan', 'Altra-EV', 2004, 2004),
  ('automovil', 'Nissan', 'Ariya Hatchback', 2023, 2024),
  ('automovil', 'Nissan', 'GT-R', 2009, 2024),
  ('automovil', 'Nissan', 'Kicks', 2018, 2024),
  ('automovil', 'Nissan', 'Kicks Play', 2025, 2025),
  ('automovil', 'Nissan', 'Leaf', 2011, 2027),
  ('automovil', 'Nissan', 'Maxima', 1995, 2014),
  ('automovil', 'Nissan', 'Maxima', 2016, 2023),
  ('automovil', 'Nissan', 'Nissan Z', 2023, 2027),
  ('automovil', 'Nissan', 'Rogue Sport', 2017, 2022),
  ('automovil', 'Nissan', 'Sentra', 1995, 2027),
  ('automovil', 'Nissan', 'Sentra Classic', 1995, 1995),
  ('automovil', 'Nissan', 'Versa', 2007, 2025),
  ('automovil', 'Nissan', 'Versa Note', 2014, 2020),
  ('automovil', 'Porsche', '718 Boxster', 2017, 2025),
  ('automovil', 'Porsche', '718 Cayman', 2017, 2025),
  ('automovil', 'Porsche', '718 Spyder', 2020, 2020),
  ('automovil', 'Porsche', '718 Spyder', 2022, 2025),
  ('automovil', 'Porsche', '911', 1995, 2027),
  ('automovil', 'Porsche', '918', 2015, 2015),
  ('automovil', 'Porsche', 'Boxster', 1997, 2016),
  ('automovil', 'Porsche', 'Cayenne', 2003, 2027),
  ('automovil', 'Porsche', 'Cayman', 2006, 2016),
  ('automovil', 'Porsche', 'Panamera', 2010, 2027),
  ('automovil', 'Porsche', 'Taycan', 2020, 2027),
  ('automovil', 'Subaru', 'BRZ', 2013, 2027),
  ('automovil', 'Subaru', 'Forester', 1998, 2027),
  ('automovil', 'Subaru', 'Impreza', 1995, 2027),
  ('automovil', 'Subaru', 'Legacy', 1995, 2025),
  ('automovil', 'Subaru', 'Outback', 2005, 2027),
  ('automovil', 'Subaru', 'SVX', 1995, 1997),
  ('automovil', 'Subaru', 'WRX', 2015, 2027),
  ('automovil', 'Suzuki', 'Aerio', 2002, 2007),
  ('automovil', 'Suzuki', 'Esteem', 1995, 2002),
  ('automovil', 'Suzuki', 'Forenza', 2004, 2008),
  ('automovil', 'Suzuki', 'Kizashi', 2010, 2014),
  ('automovil', 'Suzuki', 'Reno', 2005, 2008),
  ('automovil', 'Suzuki', 'Swift', 1995, 2001),
  ('automovil', 'Suzuki', 'Swift', 2004, 2008),
  ('automovil', 'Suzuki', 'SX4', 2007, 2014),
  ('automovil', 'Suzuki', 'Verona', 2004, 2008),
  ('automovil', 'Tesla', 'Cybercab', 2026, 2027),
  ('automovil', 'Tesla', 'Model 3', 2017, 2027),
  ('automovil', 'Tesla', 'Model S', 2012, 2026),
  ('automovil', 'Tesla', 'Model X', 2016, 2026),
  ('automovil', 'Tesla', 'Model Y', 2020, 2027),
  ('automovil', 'Tesla', 'Roadster', 2008, 2012),
  ('automovil', 'Toyota', '86', 2017, 2020),
  ('automovil', 'Toyota', 'Avalon', 1995, 2022),
  ('automovil', 'Toyota', 'C-HR', 2018, 2022),
  ('automovil', 'Toyota', 'C-HR', 2026, 2027),
  ('automovil', 'Toyota', 'Camry', 1995, 2027),
  ('automovil', 'Toyota', 'Camry Solara', 1999, 2009),
  ('automovil', 'Toyota', 'Celica', 1995, 2006),
  ('automovil', 'Toyota', 'Corolla', 1995, 2027),
  ('automovil', 'Toyota', 'Corolla iM', 2017, 2018),
  ('automovil', 'Toyota', 'Corolla Matrix', 2003, 2013),
  ('automovil', 'Toyota', 'Crown', 2023, 2027),
  ('automovil', 'Toyota', 'Crown Signia', 2025, 2027),
  ('automovil', 'Toyota', 'Echo', 2000, 2005),
  ('automovil', 'Toyota', 'FCHV-adv', 2009, 2010),
  ('automovil', 'Toyota', 'GR Corolla', 2023, 2027),
  ('automovil', 'Toyota', 'GR86', 2022, 2027),
  ('automovil', 'Toyota', 'Mirai', 2016, 2027),
  ('automovil', 'Toyota', 'MR2', 1995, 1995),
  ('automovil', 'Toyota', 'MR2', 2000, 2007),
  ('automovil', 'Toyota', 'Paseo', 1995, 1999),
  ('automovil', 'Toyota', 'Pick-Up', 1995, 1995),
  ('automovil', 'Toyota', 'Prius', 2001, 2027),
  ('automovil', 'Toyota', 'Prius C', 2012, 2020),
  ('automovil', 'Toyota', 'Prius Prime (PHEV)', 2017, 2027),
  ('automovil', 'Toyota', 'Prius V', 2012, 2017),
  ('automovil', 'Toyota', 'Scion FR-S', 2013, 2016),
  ('automovil', 'Toyota', 'Scion iA', 2016, 2016),
  ('automovil', 'Toyota', 'Scion iM', 2016, 2016),
  ('automovil', 'Toyota', 'Scion iQ', 2011, 2015),
  ('automovil', 'Toyota', 'Scion tC', 2005, 2016),
  ('automovil', 'Toyota', 'Scion xA', 2004, 2006),
  ('automovil', 'Toyota', 'Scion xD', 2008, 2014),
  ('automovil', 'Toyota', 'Supra', 1995, 1998),
  ('automovil', 'Toyota', 'Supra', 2020, 2027),
  ('automovil', 'Toyota', 'Tercel', 1995, 1999),
  ('automovil', 'Toyota', 'Yaris', 2007, 2020),
  ('automovil', 'Toyota', 'Yaris iA', 2017, 2019),
  ('automovil', 'Volkswagen', 'Arteon', 2019, 2023),
  ('automovil', 'Volkswagen', 'Beetle', 1998, 2010),
  ('automovil', 'Volkswagen', 'Beetle', 2012, 2019),
  ('automovil', 'Volkswagen', 'Cabrio', 1995, 2002),
  ('automovil', 'Volkswagen', 'CC', 2012, 2012),
  ('automovil', 'Volkswagen', 'CC', 2014, 2018),
  ('automovil', 'Volkswagen', 'Corrado', 1995, 1995),
  ('automovil', 'Volkswagen', 'e-Golf', 2015, 2020),
  ('automovil', 'Volkswagen', 'Eos', 2007, 2016),
  ('automovil', 'Volkswagen', 'EuroVan', 1995, 2004),
  ('automovil', 'Volkswagen', 'GLI', 2008, 2009),
  ('automovil', 'Volkswagen', 'Golf', 1996, 2006),
  ('automovil', 'Volkswagen', 'Golf', 2010, 2021),
  ('automovil', 'Volkswagen', 'Golf Alltrack', 2017, 2020),
  ('automovil', 'Volkswagen', 'Golf GTI', 2016, 2024),
  ('automovil', 'Volkswagen', 'Golf GTI', 2026, 2027),
  ('automovil', 'Volkswagen', 'Golf III', 1995, 1995),
  ('automovil', 'Volkswagen', 'Golf R', 2013, 2013),
  ('automovil', 'Volkswagen', 'Golf R', 2016, 2020),
  ('automovil', 'Volkswagen', 'Golf R', 2022, 2027),
  ('automovil', 'Volkswagen', 'Golf SportWagen', 2015, 2020),
  ('automovil', 'Volkswagen', 'GTI', 1995, 2003),
  ('automovil', 'Volkswagen', 'GTI', 2005, 2015),
  ('automovil', 'Volkswagen', 'GTI', 2025, 2025),
  ('automovil', 'Volkswagen', 'Jetta', 1995, 2027),
  ('automovil', 'Volkswagen', 'Jetta GLI', 2021, 2027),
  ('automovil', 'Volkswagen', 'Jetta SportWagen', 2009, 2014),
  ('automovil', 'Volkswagen', 'Jetta Wagon', 2001, 2006),
  ('automovil', 'Volkswagen', 'Passat', 1995, 2022),
  ('automovil', 'Volkswagen', 'Phaeton', 2004, 2006),
  ('automovil', 'Volkswagen', 'R32', 2004, 2004),
  ('automovil', 'Volkswagen', 'R32', 2008, 2008),
  ('automovil', 'Volkswagen', 'Rabbit', 2006, 2009),
  ('automovil', 'Volkswagen', 'Touareg', 2004, 2018),
  ('automovil', 'Volvo', '850 Series', 1995, 1997),
  ('automovil', 'Volvo', '940 Series', 1995, 1995),
  ('automovil', 'Volvo', '960 Series', 1995, 1997),
  ('automovil', 'Volvo', 'C30', 2007, 2013),
  ('automovil', 'Volvo', 'C70', 1998, 2004),
  ('automovil', 'Volvo', 'C70', 2006, 2013),
  ('automovil', 'Volvo', 'C70 / C30', 2012, 2012),
  ('automovil', 'Volvo', 'S40', 1999, 2011),
  ('automovil', 'Volvo', 'S60', 2001, 2009),
  ('automovil', 'Volvo', 'S60', 2011, 2025),
  ('automovil', 'Volvo', 'S60CC', 2016, 2018),
  ('automovil', 'Volvo', 'S70', 1998, 2000),
  ('automovil', 'Volvo', 'S80', 1999, 2016),
  ('automovil', 'Volvo', 'S90', 1998, 1998),
  ('automovil', 'Volvo', 'S90', 2017, 2027),
  ('automovil', 'Volvo', 'V40', 2000, 2004),
  ('automovil', 'Volvo', 'V50', 2005, 2011),
  ('automovil', 'Volvo', 'V60', 2015, 2025),
  ('automovil', 'Volvo', 'V60CC', 2015, 2026),
  ('automovil', 'Volvo', 'V70', 1998, 2010),
  ('automovil', 'Volvo', 'V90', 1998, 1998),
  ('automovil', 'Volvo', 'V90', 2017, 2021),
  ('automovil', 'Volvo', 'V90CC', 2017, 2026),
  ('automovil', 'Volvo', 'XC60', 2010, 2027),
  ('automovil', 'Volvo', 'XC70', 2004, 2016),
  ('automovil', 'Volvo', 'XC90', 2003, 2014),
  ('automovil', 'Volvo', 'XC90', 2016, 2027),
  ('pickup', 'BYD', '6F/6R', 2024, 2027),
  ('pickup', 'BYD', '8TT', 2024, 2027),
  ('pickup', 'BYD', '8Y', 2024, 2027),
  ('pickup', 'BYD', 'Electric Truck', 2016, 2027),
  ('pickup', 'BYD', 'Electric Truck Chassis', 2016, 2027),
  ('pickup', 'BYD', 'Electric Truck Tractor', 2016, 2018),
  ('pickup', 'BYD', 'Electric Truck Tractor', 2022, 2027),
  ('pickup', 'BYD', 'Fuel Cell Truck', 2019, 2027),
  ('pickup', 'BYD', 'Fuel Cell Truck Chassis', 2019, 2027),
  ('pickup', 'BYD', 'Fuel Cell Truck Tractor', 2022, 2027),
  ('pickup', 'Cadillac', 'Escalade', 1999, 2027),
  ('pickup', 'Cadillac', 'SRX', 2004, 2016),
  ('pickup', 'Chevrolet', '3 ton', 2001, 2004),
  ('pickup', 'Chevrolet', 'Astro Van', 1995, 2005),
  ('pickup', 'Chevrolet', 'Avalanche', 2002, 2013),
  ('pickup', 'Chevrolet', 'B7', 1995, 2002),
  ('pickup', 'Chevrolet', 'Blazer', 1995, 2005),
  ('pickup', 'Chevrolet', 'Blazer', 2019, 2027),
  ('pickup', 'Chevrolet', 'BrightDrop', 2025, 2027),
  ('pickup', 'Chevrolet', 'C/K Pickup', 2003, 2006),
  ('pickup', 'Chevrolet', 'C5', 1995, 1996),
  ('pickup', 'Chevrolet', 'C5', 2003, 2009),
  ('pickup', 'Chevrolet', 'C6', 1995, 2009),
  ('pickup', 'Chevrolet', 'C7', 1995, 2009),
  ('pickup', 'Chevrolet', 'City Express', 2015, 2018),
  ('pickup', 'Chevrolet', 'Colorado', 2004, 2012),
  ('pickup', 'Chevrolet', 'Colorado', 2015, 2027),
  ('pickup', 'Chevrolet', 'Cutaway Chassis', 1995, 1997),
  ('pickup', 'Chevrolet', 'Equinox', 2005, 2027),
  ('pickup', 'Chevrolet', 'Express', 1997, 2027),
  ('pickup', 'Chevrolet', 'G-Series', 1995, 1996),
  ('pickup', 'Chevrolet', 'GMT-400', 1995, 2002),
  ('pickup', 'Chevrolet', 'HHR', 2006, 2011),
  ('pickup', 'Chevrolet', 'Lumina APV', 1995, 1996),
  ('pickup', 'Chevrolet', 'Motorhome Chassis', 1995, 1999),
  ('pickup', 'Chevrolet', 'P6S', 1995, 1996),
  ('pickup', 'Chevrolet', 'S-10 Blazer', 1995, 1995),
  ('pickup', 'Chevrolet', 'S-10 Blazer', 1999, 2000),
  ('pickup', 'Chevrolet', 'S-10 Pickup', 1995, 2005),
  ('pickup', 'Chevrolet', 'Silverado', 1999, 2027),
  ('pickup', 'Chevrolet', 'Silverado HD', 2019, 2019),
  ('pickup', 'Chevrolet', 'Silverado HD', 2022, 2027),
  ('pickup', 'Chevrolet', 'Silverado LD', 2019, 2019),
  ('pickup', 'Chevrolet', 'Silverado LTD', 2022, 2022),
  ('pickup', 'Chevrolet', 'SSR', 2003, 2006),
  ('pickup', 'Chevrolet', 'Suburban', 1995, 2027),
  ('pickup', 'Chevrolet', 'Tahoe', 1995, 2027),
  ('pickup', 'Chevrolet', 'Venture', 1997, 2005),
  ('pickup', 'Chrysler', 'Town and Country', 1995, 2016),
  ('pickup', 'Dodge', 'Caravan', 1995, 1995),
  ('pickup', 'Dodge', 'Caravan', 2002, 2002),
  ('pickup', 'Dodge', 'Caravan', 2004, 2004),
  ('pickup', 'Dodge', 'Caravan/Grand Caravan', 1995, 2001),
  ('pickup', 'Dodge', 'Caravan/Grand Caravan', 2003, 2003),
  ('pickup', 'Dodge', 'Caravan/Grand Caravan', 2005, 2008),
  ('pickup', 'Dodge', 'Dakota', 1995, 2012),
  ('pickup', 'Dodge', 'Durango', 1995, 2009),
  ('pickup', 'Dodge', 'Durango', 2011, 2027),
  ('pickup', 'Dodge', 'Grand Caravan', 2002, 2002),
  ('pickup', 'Dodge', 'Grand Caravan', 2004, 2004),
  ('pickup', 'Dodge', 'Grand Caravan', 2009, 2023),
  ('pickup', 'Dodge', 'Journey', 2009, 2023),
  ('pickup', 'Dodge', 'Nitro', 2007, 2012),
  ('pickup', 'Dodge', 'Ram', 1995, 2012),
  ('pickup', 'Dodge', 'Ram Chassis Cab', 1995, 2002),
  ('pickup', 'Dodge', 'Ram Chassis Cab', 2007, 2012),
  ('pickup', 'Dodge', 'Ram Van', 1995, 2003),
  ('pickup', 'Dodge', 'Ram Wagon', 1995, 2003),
  ('pickup', 'Dodge', 'Ramcharger', 1996, 1997),
  ('pickup', 'Dodge', 'Sprinter', 2005, 2009),
  ('pickup', 'Fiat', 'Ducato', 2019, 2023),
  ('pickup', 'Fiat', 'Freemont', 2011, 2016),
  ('pickup', 'Ford', 'A8513', 1995, 1998),
  ('pickup', 'Ford', 'A9513', 1995, 1998),
  ('pickup', 'Ford', 'A9522', 1995, 1998),
  ('pickup', 'Ford', 'Aerostar', 1995, 1997),
  ('pickup', 'Ford', 'AT8513', 1995, 1998),
  ('pickup', 'Ford', 'AT9513', 1995, 1998),
  ('pickup', 'Ford', 'AT9522', 1995, 1998),
  ('pickup', 'Ford', 'B-750', 2002, 2002),
  ('pickup', 'Ford', 'B800', 1995, 1997),
  ('pickup', 'Ford', 'Bronco', 1995, 1996),
  ('pickup', 'Ford', 'Bronco', 2021, 2027),
  ('pickup', 'Ford', 'CF7000', 1995, 1996),
  ('pickup', 'Ford', 'CF8000', 1995, 1997),
  ('pickup', 'Ford', 'CFT8000', 1995, 1997),
  ('pickup', 'Ford', 'E-150', 1995, 2014),
  ('pickup', 'Ford', 'E-250', 1995, 2014),
  ('pickup', 'Ford', 'E-350', 1995, 2027),
  ('pickup', 'Ford', 'E-450', 1995, 2027),
  ('pickup', 'Ford', 'E-550', 2002, 2003),
  ('pickup', 'Ford', 'E-550', 2015, 2015),
  ('pickup', 'Ford', 'Escape', 2001, 2027),
  ('pickup', 'Ford', 'Excursion', 2000, 2005),
  ('pickup', 'Ford', 'Expedition', 1997, 2027),
  ('pickup', 'Ford', 'Explorer', 1995, 2027),
  ('pickup', 'Ford', 'Explorer Sport Trac', 2001, 2005),
  ('pickup', 'Ford', 'Explorer Sport Trac', 2007, 2010),
  ('pickup', 'Ford', 'F-150', 1995, 2027),
  ('pickup', 'Ford', 'F-150 Heritage', 2004, 2004),
  ('pickup', 'Ford', 'F-250', 1995, 2027),
  ('pickup', 'Ford', 'F-350', 1995, 1997),
  ('pickup', 'Ford', 'F-350', 1999, 2027),
  ('pickup', 'Ford', 'F-450', 1999, 2027),
  ('pickup', 'Ford', 'F-550', 1999, 2027),
  ('pickup', 'Ford', 'F-600', 2020, 2027),
  ('pickup', 'Ford', 'F-650', 2000, 2027),
  ('pickup', 'Ford', 'F-700', 1995, 1998),
  ('pickup', 'Ford', 'F-750', 2000, 2027),
  ('pickup', 'Ford', 'F-800', 1995, 2002),
  ('pickup', 'Ford', 'F-Super Duty', 1995, 1997),
  ('pickup', 'Ford', 'Freestar', 2004, 2007),
  ('pickup', 'Ford', 'Freestyle', 2005, 2007),
  ('pickup', 'Ford', 'FT900', 1995, 1998),
  ('pickup', 'Ford', 'L8000', 1995, 1997),
  ('pickup', 'Ford', 'L8501', 1997, 1998),
  ('pickup', 'Ford', 'L8511', 1998, 1998),
  ('pickup', 'Ford', 'L8513', 1995, 1998),
  ('pickup', 'Ford', 'L9000', 1995, 1997),
  ('pickup', 'Ford', 'L9501', 1997, 1998),
  ('pickup', 'Ford', 'L9511', 1998, 1998),
  ('pickup', 'Ford', 'L9513', 1995, 1998),
  ('pickup', 'Ford', 'L9522', 1998, 1998),
  ('pickup', 'Ford', 'LA8000', 1995, 1997),
  ('pickup', 'Ford', 'LA9000', 1995, 1997),
  ('pickup', 'Ford', 'LL9000', 1995, 1997),
  ('pickup', 'Ford', 'LLA9000', 1995, 1997),
  ('pickup', 'Ford', 'LLS9000', 1995, 1997),
  ('pickup', 'Ford', 'LN7000', 1995, 1997),
  ('pickup', 'Ford', 'LN8000', 1995, 1997),
  ('pickup', 'Ford', 'LN9000', 1995, 1997),
  ('pickup', 'Ford', 'LNT8000', 1995, 1997),
  ('pickup', 'Ford', 'LNT9000', 1995, 1997),
  ('pickup', 'Ford', 'LS8000', 1995, 1997),
  ('pickup', 'Ford', 'LS9000', 1995, 1997),
  ('pickup', 'Ford', 'LT8000', 1995, 1997),
  ('pickup', 'Ford', 'LT8501', 1995, 1998),
  ('pickup', 'Ford', 'LT8511', 1998, 1998),
  ('pickup', 'Ford', 'LT8513', 1995, 1998),
  ('pickup', 'Ford', 'LT9000', 1995, 1997),
  ('pickup', 'Ford', 'LT9501', 1995, 1998),
  ('pickup', 'Ford', 'LT9511', 1998, 1998),
  ('pickup', 'Ford', 'LT9513', 1995, 1998),
  ('pickup', 'Ford', 'LT9522', 1995, 1998),
  ('pickup', 'Ford', 'LTA9000', 1995, 1997),
  ('pickup', 'Ford', 'LTL9000', 1995, 1997),
  ('pickup', 'Ford', 'LTLA9000', 1995, 1997),
  ('pickup', 'Ford', 'LTLS9000', 1995, 1997),
  ('pickup', 'Ford', 'LTS8000', 1995, 1997),
  ('pickup', 'Ford', 'LTS9000', 1995, 1997),
  ('pickup', 'Ford', 'Maverick', 2022, 2027),
  ('pickup', 'Ford', 'Motorhome Chassis', 1999, 2002),
  ('pickup', 'Ford', 'Motorhome Chassis', 2004, 2004),
  ('pickup', 'Ford', 'Motorhome Chassis', 2006, 2027),
  ('pickup', 'Ford', 'P700', 1995, 1997),
  ('pickup', 'Ford', 'P800', 1995, 1997),
  ('pickup', 'Ford', 'Ranger', 1995, 2011),
  ('pickup', 'Ford', 'Ranger', 2019, 2027),
  ('pickup', 'Ford', 'Taurus X', 2008, 2009),
  ('pickup', 'Ford', 'Transit', 2015, 2027),
  ('pickup', 'Ford', 'Transit Connect', 2010, 2023),
  ('pickup', 'Ford', 'Windstar', 1995, 2003),
  ('pickup', 'GMC', 'Acadia', 2007, 2027),
  ('pickup', 'GMC', 'C5', 1995, 1996),
  ('pickup', 'GMC', 'C5', 2003, 2009),
  ('pickup', 'GMC', 'C6', 1995, 2009),
  ('pickup', 'GMC', 'C7', 1995, 2009),
  ('pickup', 'GMC', 'Canyon', 2004, 2027),
  ('pickup', 'GMC', 'Hummer EV Pickup', 2022, 2027),
  ('pickup', 'GMC', 'Jimmy Utility', 1995, 2005),
  ('pickup', 'GMC', 'Motorhome Chassis', 1995, 1999),
  ('pickup', 'GMC', 'Safari', 1995, 2005),
  ('pickup', 'GMC', 'Savana', 1996, 2027),
  ('pickup', 'GMC', 'Sierra', 1995, 2027),
  ('pickup', 'GMC', 'Sierra HD', 2019, 2019),
  ('pickup', 'GMC', 'Sierra HD', 2022, 2027),
  ('pickup', 'GMC', 'Sierra Limited', 2019, 2019),
  ('pickup', 'GMC', 'Sierra Limited', 2022, 2022),
  ('pickup', 'GMC', 'Sonoma', 1995, 2004),
  ('pickup', 'GMC', 'Suburban', 1995, 2000),
  ('pickup', 'GMC', 'Terrain', 2009, 2027),
  ('pickup', 'GMC', 'Vandura', 1995, 1996),
  ('pickup', 'GMC', 'Yukon', 1995, 2027),
  ('pickup', 'GMC', 'Yukon XL', 1995, 1995),
  ('pickup', 'GMC', 'Yukon XL', 2000, 2011),
  ('pickup', 'GMC', 'Yukon XL', 2015, 2027),
  ('pickup', 'Honda', 'Odyssey', 1995, 2027),
  ('pickup', 'Honda', 'Ridgeline', 2006, 2027),
  ('pickup', 'Hyundai', 'Santa Cruz', 2022, 2027),
  ('pickup', 'Hyundai', 'Xcient', 2023, 2027),
  ('pickup', 'Jeep', 'Cherokee', 1995, 2011),
  ('pickup', 'Jeep', 'Cherokee', 2014, 2023),
  ('pickup', 'Jeep', 'Cherokee', 2026, 2027),
  ('pickup', 'Jeep', 'Commander', 2006, 2010),
  ('pickup', 'Jeep', 'Compass', 2006, 2027),
  ('pickup', 'Jeep', 'Gladiator', 2020, 2027),
  ('pickup', 'Jeep', 'Grand Cherokee', 1995, 2027),
  ('pickup', 'Jeep', 'Liberty', 1995, 2013),
  ('pickup', 'Jeep', 'Patriot', 2007, 2018),
  ('pickup', 'Jeep', 'Wrangler', 1995, 2027),
  ('pickup', 'Lincoln', 'Blackwood', 2002, 2003),
  ('pickup', 'Lincoln', 'Mark LT', 2006, 2008),
  ('pickup', 'Mazda', 'B-Series', 1995, 2010),
  ('pickup', 'Mazda', 'MPV', 1995, 2006),
  ('pickup', 'Mercedes-Benz', 'eSprinter', 2024, 2027),
  ('pickup', 'Mercedes-Benz', 'Metris', 2016, 2023),
  ('pickup', 'Mercedes-Benz', 'Sprinter', 2010, 2027),
  ('pickup', 'Mitsubishi', 'Mighty Max', 1995, 1996),
  ('pickup', 'Mitsubishi', 'Montero', 1995, 2006),
  ('pickup', 'Mitsubishi', 'Montero Sport', 1997, 2004),
  ('pickup', 'Mitsubishi', 'Raider', 1995, 2010),
  ('pickup', 'Nissan', 'Armada', 2002, 2015),
  ('pickup', 'Nissan', 'Armada', 2017, 2027),
  ('pickup', 'Nissan', 'Cube', 2009, 2014),
  ('pickup', 'Nissan', 'Frontier', 1998, 2027),
  ('pickup', 'Nissan', 'Murano', 2002, 2007),
  ('pickup', 'Nissan', 'Murano', 2009, 2027),
  ('pickup', 'Nissan', 'NV', 2011, 2021),
  ('pickup', 'Nissan', 'NV200', 2013, 2024),
  ('pickup', 'Nissan', 'Pathfinder', 1995, 2027),
  ('pickup', 'Nissan', 'Pickup', 1995, 1997),
  ('pickup', 'Nissan', 'Quest', 1995, 2009),
  ('pickup', 'Nissan', 'Quest', 2011, 2017),
  ('pickup', 'Nissan', 'Titan', 2002, 2024),
  ('pickup', 'Nissan', 'Xterra', 2000, 2015),
  ('pickup', 'Ram', '1500', 2013, 2027),
  ('pickup', 'Ram', '2500', 2013, 2027),
  ('pickup', 'Ram', '3500', 2012, 2027),
  ('pickup', 'Ram', '4000', 2013, 2023),
  ('pickup', 'Ram', '4500', 2013, 2027),
  ('pickup', 'Ram', '5500', 2013, 2027),
  ('pickup', 'Ram', 'Cargo Van', 2013, 2016),
  ('pickup', 'Ram', 'ProMaster 1500', 2014, 2027),
  ('pickup', 'Ram', 'ProMaster 2500', 2014, 2027),
  ('pickup', 'Ram', 'ProMaster 3500', 2014, 2027),
  ('pickup', 'Suzuki', 'Equator', 2009, 2013),
  ('pickup', 'Suzuki', 'Samurai', 1995, 1996),
  ('pickup', 'Suzuki', 'Sidekick', 1995, 1998),
  ('pickup', 'Suzuki', 'Sidekick Sport', 1995, 1998),
  ('pickup', 'Tesla', 'Cybertruck', 2024, 2027),
  ('pickup', 'Tesla', 'Semi', 2023, 2027),
  ('pickup', 'Toyota', '4Runner', 1995, 2027),
  ('pickup', 'Toyota', 'Land Cruiser', 1995, 2021),
  ('pickup', 'Toyota', 'Land Cruiser', 2024, 2027),
  ('pickup', 'Toyota', 'Pick-Up', 1995, 1995),
  ('pickup', 'Toyota', 'T100', 1995, 1998),
  ('pickup', 'Toyota', 'Tacoma', 1995, 2027),
  ('pickup', 'Toyota', 'Tundra', 1995, 2027),
  ('pickup', 'Volkswagen', 'Cabrio', 1995, 2002),
  ('pickup', 'Volkswagen', 'Corrado', 1995, 1995),
  ('pickup', 'Volkswagen', 'EuroVan', 1995, 2004),
  ('pickup', 'Volkswagen', 'Golf III', 1995, 1995),
  ('pickup', 'Volkswagen', 'GTI', 1995, 2003),
  ('pickup', 'Volkswagen', 'GTI', 2005, 2015),
  ('pickup', 'Volkswagen', 'GTI', 2025, 2025),
  ('pickup', 'Volkswagen', 'Jetta', 1995, 2027),
  ('pickup', 'Volkswagen', 'Passat', 1995, 2022),
  ('pickup', 'Volkswagen', 'Rabbit', 2006, 2009),
  ('pickup', 'Volkswagen', 'Routan', 2009, 2014),
  ('pickup', 'Volvo', 'Cab Behind Engine', 1995, 2027),
  ('pickup', 'Volvo', 'Cab Over Engine HT', 1995, 2027),
  ('pickup', 'Volvo', 'Cab Over Engine LT', 1995, 2027),
  ('pickup', 'Volvo', 'F12 w/F7 Cab', 1995, 2027),
  ('pickup', 'Volvo', 'F6 w/F7 Cab', 1995, 2027),
  ('pickup', 'Volvo', 'VS', 2019, 2027),
  ('pickup', 'Volvo', 'VT', 2019, 2027),
  ('suv', 'Acura', 'ADX', 2025, 2027),
  ('suv', 'Acura', 'MDX', 2001, 2027),
  ('suv', 'Acura', 'RDX', 2007, 2027),
  ('suv', 'Acura', 'SLX', 1996, 1999),
  ('suv', 'Acura', 'ZDX', 2010, 2013),
  ('suv', 'Acura', 'ZDX', 2024, 2027),
  ('suv', 'Alfa Romeo', 'Stelvio', 2018, 2027),
  ('suv', 'Alfa Romeo', 'Tonale', 2024, 2027),
  ('suv', 'Audi', 'A3', 2006, 2013),
  ('suv', 'Audi', 'A3', 2015, 2020),
  ('suv', 'Audi', 'A3', 2022, 2027),
  ('suv', 'Audi', 'A4', 1996, 2025),
  ('suv', 'Audi', 'A4 allroad', 2013, 2025),
  ('suv', 'Audi', 'A5', 2008, 2027),
  ('suv', 'Audi', 'A6', 1995, 2027),
  ('suv', 'Audi', 'A8', 1997, 2020),
  ('suv', 'Audi', 'allroad', 2001, 2005),
  ('suv', 'Audi', 'e-tron', 2019, 2019),
  ('suv', 'Audi', 'e-tron', 2021, 2023),
  ('suv', 'Audi', 'e-tron Sportback', 2020, 2022),
  ('suv', 'Audi', 'Q3', 2015, 2027),
  ('suv', 'Audi', 'Q4', 2022, 2027),
  ('suv', 'Audi', 'Q5', 2009, 2027),
  ('suv', 'Audi', 'Q5 e', 2020, 2021),
  ('suv', 'Audi', 'Q5 e', 2023, 2025),
  ('suv', 'Audi', 'Q6', 2025, 2027),
  ('suv', 'Audi', 'Q7', 2007, 2015),
  ('suv', 'Audi', 'Q7', 2017, 2027),
  ('suv', 'Audi', 'Q8', 2019, 2027),
  ('suv', 'Audi', 'Q9', 2027, 2027),
  ('suv', 'Audi', 'R8', 2008, 2012),
  ('suv', 'Audi', 'R8', 2014, 2018),
  ('suv', 'Audi', 'R8', 2020, 2023),
  ('suv', 'Audi', 'RS 4', 2007, 2008),
  ('suv', 'Audi', 'RS 6', 2003, 2004),
  ('suv', 'Audi', 'RS Q8', 2020, 2027),
  ('suv', 'Audi', 'S4', 2000, 2002),
  ('suv', 'Audi', 'S4', 2004, 2016),
  ('suv', 'Audi', 'S4', 2018, 2025),
  ('suv', 'Audi', 'S5', 2008, 2027),
  ('suv', 'Audi', 'S6', 1995, 1997),
  ('suv', 'Audi', 'S6', 2002, 2003),
  ('suv', 'Audi', 'S6', 2007, 2011),
  ('suv', 'Audi', 'S6', 2013, 2018),
  ('suv', 'Audi', 'S6', 2020, 2025),
  ('suv', 'Audi', 'S6', 2027, 2027),
  ('suv', 'Audi', 'S8', 2001, 2003),
  ('suv', 'Audi', 'S8', 2007, 2009),
  ('suv', 'Audi', 'S8', 2013, 2018),
  ('suv', 'Audi', 'S8', 2020, 2027),
  ('suv', 'Audi', 'SQ5', 2014, 2027),
  ('suv', 'Audi', 'SQ6', 2025, 2027),
  ('suv', 'Audi', 'SQ7', 2020, 2027),
  ('suv', 'Audi', 'SQ8', 2020, 2027),
  ('suv', 'Audi', 'SQ9', 2027, 2027),
  ('suv', 'Audi', 'TT', 2000, 2006),
  ('suv', 'Audi', 'TT', 2008, 2023),
  ('suv', 'BMW', '128i', 2008, 2014),
  ('suv', 'BMW', '135i', 2008, 2014),
  ('suv', 'BMW', '325Ci', 2000, 2006),
  ('suv', 'BMW', '325i', 1995, 1995),
  ('suv', 'BMW', '325i', 2001, 2006),
  ('suv', 'BMW', '325xi', 2002, 2006),
  ('suv', 'BMW', '328i', 1996, 2000),
  ('suv', 'BMW', '328i', 2007, 2016),
  ('suv', 'BMW', '328xi', 2007, 2008),
  ('suv', 'BMW', '330Ci', 2001, 2006),
  ('suv', 'BMW', '330i', 2001, 2006),
  ('suv', 'BMW', '330i', 2017, 2027),
  ('suv', 'BMW', '330xi', 2002, 2006),
  ('suv', 'BMW', '335d', 2009, 2011),
  ('suv', 'BMW', '335i', 2007, 2017),
  ('suv', 'BMW', '335xi', 2007, 2008),
  ('suv', 'BMW', '525i', 1995, 1995),
  ('suv', 'BMW', '525i', 2001, 2007),
  ('suv', 'BMW', '525xi', 2006, 2007),
  ('suv', 'BMW', '528i', 1997, 2000),
  ('suv', 'BMW', '528i', 2008, 2016),
  ('suv', 'BMW', '528xi', 2008, 2008),
  ('suv', 'BMW', '528xi', 2012, 2013),
  ('suv', 'BMW', '530i', 1995, 1995),
  ('suv', 'BMW', '530i', 2001, 2007),
  ('suv', 'BMW', '530i', 2017, 2027),
  ('suv', 'BMW', '530xi', 2006, 2007),
  ('suv', 'BMW', '535i', 2008, 2017),
  ('suv', 'BMW', '535xi', 2008, 2008),
  ('suv', 'BMW', '545i', 2004, 2005),
  ('suv', 'BMW', '550i', 2006, 2017),
  ('suv', 'BMW', '645Ci', 2004, 2005),
  ('suv', 'BMW', '645i', 2004, 2004),
  ('suv', 'BMW', '650i', 2006, 2010),
  ('suv', 'BMW', '650i', 2012, 2019),
  ('suv', 'BMW', '745i', 2002, 2005),
  ('suv', 'BMW', '745Li', 2002, 2005),
  ('suv', 'BMW', '750i', 2001, 2001),
  ('suv', 'BMW', '750i', 2006, 2016),
  ('suv', 'BMW', '750i', 2018, 2022),
  ('suv', 'BMW', '750Li', 2000, 2000),
  ('suv', 'BMW', '750Li', 2006, 2015),
  ('suv', 'BMW', '750Li', 2022, 2022),
  ('suv', 'BMW', '750Lxi', 2010, 2011),
  ('suv', 'BMW', '750Lxi', 2013, 2015),
  ('suv', 'BMW', '750xi', 2010, 2011),
  ('suv', 'BMW', '750xi', 2013, 2015),
  ('suv', 'BMW', '760i', 2005, 2006),
  ('suv', 'BMW', '760i', 2023, 2026),
  ('suv', 'BMW', '760Li', 2003, 2008),
  ('suv', 'BMW', '760Li', 2010, 2015),
  ('suv', 'BMW', 'iX', 2022, 2027),
  ('suv', 'BMW', 'iX3', 2027, 2027),
  ('suv', 'BMW', 'iX4', 2027, 2027),
  ('suv', 'BMW', 'iX5', 2027, 2027),
  ('suv', 'BMW', 'X1', 2012, 2027),
  ('suv', 'BMW', 'X2', 2018, 2027),
  ('suv', 'BMW', 'X3', 2004, 2027),
  ('suv', 'BMW', 'X4', 2015, 2025),
  ('suv', 'BMW', 'X5', 2000, 2027),
  ('suv', 'BMW', 'X6', 2008, 2027),
  ('suv', 'BMW', 'X7', 2019, 2027),
  ('suv', 'BMW', 'XM', 2023, 2027),
  ('suv', 'BMW', 'Z4', 2003, 2016),
  ('suv', 'BMW', 'Z4', 2019, 2026),
  ('suv', 'Buick', 'Enclave', 2007, 2027),
  ('suv', 'Buick', 'Encore', 2013, 2022),
  ('suv', 'Buick', 'Encore GX', 2020, 2027),
  ('suv', 'Buick', 'Envision', 2016, 2027),
  ('suv', 'Buick', 'Envista', 2024, 2027),
  ('suv', 'Buick', 'Incomplete', 2001, 2001),
  ('suv', 'Buick', 'Rainier', 2004, 2007),
  ('suv', 'Buick', 'Rendezvous', 2001, 2007),
  ('suv', 'Buick', 'Terraza', 2005, 2007),
  ('suv', 'Cadillac', 'Escalade', 1999, 2027),
  ('suv', 'Cadillac', 'Escalade ESV', 2017, 2027),
  ('suv', 'Cadillac', 'Escalade IQ', 2025, 2027),
  ('suv', 'Cadillac', 'Escalade IQL', 2026, 2027),
  ('suv', 'Cadillac', 'Hearse', 1997, 2011),
  ('suv', 'Cadillac', 'Limousine', 1998, 2011),
  ('suv', 'Cadillac', 'Lyriq', 2023, 2027),
  ('suv', 'Cadillac', 'Optiq', 2025, 2027),
  ('suv', 'Cadillac', 'SRX', 2004, 2016),
  ('suv', 'Cadillac', 'Vistiq', 2026, 2027),
  ('suv', 'Cadillac', 'XT4', 2019, 2025),
  ('suv', 'Cadillac', 'XT5', 2017, 2027),
  ('suv', 'Cadillac', 'XT6', 2020, 2025),
  ('suv', 'Chevrolet', '3 ton', 2001, 2004),
  ('suv', 'Chevrolet', 'Astro Van', 1995, 2005),
  ('suv', 'Chevrolet', 'Avalanche', 2002, 2013),
  ('suv', 'Chevrolet', 'Beretta', 1995, 1996),
  ('suv', 'Chevrolet', 'Blazer', 1995, 2005),
  ('suv', 'Chevrolet', 'Blazer', 2019, 2027),
  ('suv', 'Chevrolet', 'Camaro', 1995, 2002),
  ('suv', 'Chevrolet', 'Camaro', 2010, 2024),
  ('suv', 'Chevrolet', 'Caprice', 1995, 1996),
  ('suv', 'Chevrolet', 'Captiva Sport', 2010, 2017),
  ('suv', 'Chevrolet', 'Cavalier', 1995, 2005),
  ('suv', 'Chevrolet', 'Corsica', 1995, 1996),
  ('suv', 'Chevrolet', 'Corvette', 1995, 2027),
  ('suv', 'Chevrolet', 'Equinox', 2005, 2027),
  ('suv', 'Chevrolet', 'Express', 1997, 2027),
  ('suv', 'Chevrolet', 'G-Series', 1995, 1996),
  ('suv', 'Chevrolet', 'GMT-400', 1995, 2002),
  ('suv', 'Chevrolet', 'Hearse/Limo', 1995, 1995),
  ('suv', 'Chevrolet', 'HHR', 2006, 2011),
  ('suv', 'Chevrolet', 'Lumina', 1995, 2001),
  ('suv', 'Chevrolet', 'Lumina APV', 1995, 1996),
  ('suv', 'Chevrolet', 'Monte Carlo', 1995, 2007),
  ('suv', 'Chevrolet', 'Orlando', 2009, 2015),
  ('suv', 'Chevrolet', 'S-10 Pickup', 1995, 2005),
  ('suv', 'Chevrolet', 'Silverado', 1999, 2027),
  ('suv', 'Chevrolet', 'Suburban', 1995, 2027),
  ('suv', 'Chevrolet', 'Suburban HD', 2024, 2027),
  ('suv', 'Chevrolet', 'Tahoe', 1995, 2027),
  ('suv', 'Chevrolet', 'Tracker', 1995, 2004),
  ('suv', 'Chevrolet', 'Tracker', 2016, 2020),
  ('suv', 'Chevrolet', 'Trailblazer', 2002, 2009),
  ('suv', 'Chevrolet', 'Trailblazer', 2021, 2027),
  ('suv', 'Chevrolet', 'Traverse', 2009, 2027),
  ('suv', 'Chevrolet', 'Traverse Limited', 2024, 2024),
  ('suv', 'Chevrolet', 'Trax', 2013, 2027),
  ('suv', 'Chevrolet', 'Uplander', 2005, 2009),
  ('suv', 'Chevrolet', 'Venture', 1997, 2005),
  ('suv', 'Chrysler', 'Aspen', 2007, 2009),
  ('suv', 'Chrysler', 'Grand Caravan', 2021, 2027),
  ('suv', 'Chrysler', 'Grand Voyager', 2000, 2000),
  ('suv', 'Chrysler', 'Pacifica', 2004, 2009),
  ('suv', 'Chrysler', 'Pacifica', 2017, 2027),
  ('suv', 'Chrysler', 'PT Cruiser', 2001, 2010),
  ('suv', 'Chrysler', 'Town and Country', 1995, 2016),
  ('suv', 'Chrysler', 'Voyager', 2000, 2003),
  ('suv', 'Chrysler', 'Voyager', 2008, 2009),
  ('suv', 'Chrysler', 'Voyager', 2020, 2026),
  ('suv', 'Dodge', 'Caravan', 1995, 1995),
  ('suv', 'Dodge', 'Caravan', 2002, 2002),
  ('suv', 'Dodge', 'Caravan', 2004, 2004),
  ('suv', 'Dodge', 'Caravan/Grand Caravan', 1995, 2001),
  ('suv', 'Dodge', 'Caravan/Grand Caravan', 2003, 2003),
  ('suv', 'Dodge', 'Caravan/Grand Caravan', 2005, 2008),
  ('suv', 'Dodge', 'Colt', 1995, 1995),
  ('suv', 'Dodge', 'Dakota', 1995, 2012),
  ('suv', 'Dodge', 'Durango', 1995, 2009),
  ('suv', 'Dodge', 'Durango', 2011, 2027),
  ('suv', 'Dodge', 'Grand Caravan', 2002, 2002),
  ('suv', 'Dodge', 'Grand Caravan', 2004, 2004),
  ('suv', 'Dodge', 'Grand Caravan', 2009, 2023),
  ('suv', 'Dodge', 'Hornet', 2023, 2025),
  ('suv', 'Dodge', 'Journey', 2009, 2023),
  ('suv', 'Dodge', 'Magnum', 2005, 2008),
  ('suv', 'Dodge', 'Nitro', 2007, 2012),
  ('suv', 'Dodge', 'Ram', 1995, 2012),
  ('suv', 'Dodge', 'Ram Chassis Cab', 1995, 2002),
  ('suv', 'Dodge', 'Ram Chassis Cab', 2007, 2012),
  ('suv', 'Dodge', 'Ram Van', 1995, 2003),
  ('suv', 'Dodge', 'Ram Wagon', 1995, 2003),
  ('suv', 'Dodge', 'Ramcharger', 1996, 1997),
  ('suv', 'Dodge', 'Sprinter', 2005, 2009),
  ('suv', 'Fiat', '500L', 2014, 2020),
  ('suv', 'Fiat', '500X', 2016, 2023),
  ('suv', 'Fiat', 'Ducato', 2019, 2023),
  ('suv', 'Fiat', 'Freemont', 2011, 2016),
  ('suv', 'Ford', 'A8513', 1995, 1998),
  ('suv', 'Ford', 'A9513', 1995, 1998),
  ('suv', 'Ford', 'A9522', 1995, 1998),
  ('suv', 'Ford', 'Aerostar', 1995, 1997),
  ('suv', 'Ford', 'AT8513', 1995, 1998),
  ('suv', 'Ford', 'AT9513', 1995, 1998),
  ('suv', 'Ford', 'AT9522', 1995, 1998),
  ('suv', 'Ford', 'B800', 1995, 1997),
  ('suv', 'Ford', 'Bronco', 1995, 1996),
  ('suv', 'Ford', 'Bronco', 2021, 2027),
  ('suv', 'Ford', 'Bronco Sport', 2021, 2027),
  ('suv', 'Ford', 'CF7000', 1995, 1996),
  ('suv', 'Ford', 'CF8000', 1995, 1997),
  ('suv', 'Ford', 'CFT8000', 1995, 1997),
  ('suv', 'Ford', 'E-150', 1995, 2014),
  ('suv', 'Ford', 'E-250', 1995, 2014),
  ('suv', 'Ford', 'E-350', 1995, 2027),
  ('suv', 'Ford', 'E-450', 1995, 2027),
  ('suv', 'Ford', 'E-550', 2002, 2003),
  ('suv', 'Ford', 'E-550', 2015, 2015),
  ('suv', 'Ford', 'Ecosport', 2018, 2022),
  ('suv', 'Ford', 'Edge', 2007, 2024),
  ('suv', 'Ford', 'Escape', 2001, 2027),
  ('suv', 'Ford', 'Excursion', 2000, 2005),
  ('suv', 'Ford', 'Expedition', 1997, 2027),
  ('suv', 'Ford', 'Expedition EL', 2017, 2017),
  ('suv', 'Ford', 'Expedition MAX', 2007, 2009),
  ('suv', 'Ford', 'Expedition MAX', 2015, 2016),
  ('suv', 'Ford', 'Expedition MAX', 2018, 2027),
  ('suv', 'Ford', 'Explorer', 1995, 2027),
  ('suv', 'Ford', 'Explorer Sport', 2003, 2003),
  ('suv', 'Ford', 'Explorer Sport Trac', 2001, 2005),
  ('suv', 'Ford', 'Explorer Sport Trac', 2007, 2010),
  ('suv', 'Ford', 'F-150', 1995, 2027),
  ('suv', 'Ford', 'F-250', 1995, 2027),
  ('suv', 'Ford', 'F-350', 1995, 1997),
  ('suv', 'Ford', 'F-350', 1999, 2027),
  ('suv', 'Ford', 'F-450', 1999, 2027),
  ('suv', 'Ford', 'F-550', 1999, 2027),
  ('suv', 'Ford', 'F-600', 2020, 2027),
  ('suv', 'Ford', 'F-700', 1995, 1998),
  ('suv', 'Ford', 'F-800', 1995, 2002),
  ('suv', 'Ford', 'F-Super Duty', 1995, 1997),
  ('suv', 'Ford', 'Flex', 2009, 2019),
  ('suv', 'Ford', 'Freestar', 2004, 2007),
  ('suv', 'Ford', 'Freestyle', 2005, 2007),
  ('suv', 'Ford', 'FT900', 1995, 1998),
  ('suv', 'Ford', 'L8000', 1995, 1997),
  ('suv', 'Ford', 'L8501', 1997, 1998),
  ('suv', 'Ford', 'L8511', 1998, 1998),
  ('suv', 'Ford', 'L8513', 1995, 1998),
  ('suv', 'Ford', 'L9000', 1995, 1997),
  ('suv', 'Ford', 'L9501', 1997, 1998),
  ('suv', 'Ford', 'L9511', 1998, 1998),
  ('suv', 'Ford', 'L9513', 1995, 1998),
  ('suv', 'Ford', 'L9522', 1998, 1998),
  ('suv', 'Ford', 'LA8000', 1995, 1997),
  ('suv', 'Ford', 'LA9000', 1995, 1997),
  ('suv', 'Ford', 'LL9000', 1995, 1997),
  ('suv', 'Ford', 'LLA9000', 1995, 1997),
  ('suv', 'Ford', 'LLS9000', 1995, 1997),
  ('suv', 'Ford', 'LN7000', 1995, 1997),
  ('suv', 'Ford', 'LN8000', 1995, 1997),
  ('suv', 'Ford', 'LN9000', 1995, 1997),
  ('suv', 'Ford', 'LNT8000', 1995, 1997),
  ('suv', 'Ford', 'LNT9000', 1995, 1997),
  ('suv', 'Ford', 'LS8000', 1995, 1997),
  ('suv', 'Ford', 'LS9000', 1995, 1997),
  ('suv', 'Ford', 'LT8000', 1995, 1997),
  ('suv', 'Ford', 'LT8501', 1995, 1998),
  ('suv', 'Ford', 'LT8511', 1998, 1998),
  ('suv', 'Ford', 'LT8513', 1995, 1998),
  ('suv', 'Ford', 'LT9000', 1995, 1997),
  ('suv', 'Ford', 'LT9501', 1995, 1998),
  ('suv', 'Ford', 'LT9511', 1998, 1998),
  ('suv', 'Ford', 'LT9513', 1995, 1998),
  ('suv', 'Ford', 'LT9522', 1995, 1998),
  ('suv', 'Ford', 'LTA9000', 1995, 1997),
  ('suv', 'Ford', 'LTL9000', 1995, 1997),
  ('suv', 'Ford', 'LTLA9000', 1995, 1997),
  ('suv', 'Ford', 'LTLS9000', 1995, 1997),
  ('suv', 'Ford', 'LTS8000', 1995, 1997),
  ('suv', 'Ford', 'LTS9000', 1995, 1997),
  ('suv', 'Ford', 'Motorhome Chassis', 1999, 2002),
  ('suv', 'Ford', 'Motorhome Chassis', 2004, 2004),
  ('suv', 'Ford', 'Motorhome Chassis', 2006, 2027),
  ('suv', 'Ford', 'Mustang Mach-E', 2021, 2027),
  ('suv', 'Ford', 'P700', 1995, 1997),
  ('suv', 'Ford', 'P800', 1995, 1997),
  ('suv', 'Ford', 'Ranger', 1995, 2011),
  ('suv', 'Ford', 'Ranger', 2019, 2027),
  ('suv', 'Ford', 'Taurus X', 2008, 2009),
  ('suv', 'Ford', 'Transit', 2015, 2027),
  ('suv', 'Ford', 'Windstar', 1995, 2003),
  ('suv', 'GMC', 'Acadia', 2007, 2027),
  ('suv', 'GMC', 'Canyon', 2004, 2027),
  ('suv', 'GMC', 'Cruise Origin AV', 2024, 2024),
  ('suv', 'GMC', 'Envoy', 2002, 2009),
  ('suv', 'GMC', 'Hummer EV SUV', 2024, 2027),
  ('suv', 'GMC', 'Jimmy Utility', 1995, 2005),
  ('suv', 'GMC', 'Motorhome Chassis', 1995, 1999),
  ('suv', 'GMC', 'P Truck Forward', 1995, 1999),
  ('suv', 'GMC', 'Rally', 1995, 1996),
  ('suv', 'GMC', 'Safari', 1995, 2005),
  ('suv', 'GMC', 'Savana', 1996, 2027),
  ('suv', 'GMC', 'Sierra', 1995, 2027),
  ('suv', 'GMC', 'Sonoma', 1995, 2004),
  ('suv', 'GMC', 'Suburban', 1995, 2000),
  ('suv', 'GMC', 'Terrain', 2009, 2027),
  ('suv', 'GMC', 'Yukon', 1995, 2027),
  ('suv', 'GMC', 'Yukon XL', 1995, 1995),
  ('suv', 'GMC', 'Yukon XL', 2000, 2011),
  ('suv', 'GMC', 'Yukon XL', 2015, 2027),
  ('suv', 'Honda', 'Accord', 1995, 2027),
  ('suv', 'Honda', 'Accord Crosstour', 2010, 2011),
  ('suv', 'Honda', 'CR-V', 1997, 2027),
  ('suv', 'Honda', 'Crosstour', 2012, 2015),
  ('suv', 'Honda', 'Element', 2003, 2011),
  ('suv', 'Honda', 'HR-V', 2016, 2027),
  ('suv', 'Honda', 'Odyssey', 1995, 2027),
  ('suv', 'Honda', 'Passport', 1995, 2002),
  ('suv', 'Honda', 'Passport', 2019, 2027),
  ('suv', 'Honda', 'Pilot', 2003, 2027),
  ('suv', 'Honda', 'Prologue', 2024, 2027),
  ('suv', 'Hyundai', 'Accent', 1995, 2022),
  ('suv', 'Hyundai', 'Azera', 2006, 2018),
  ('suv', 'Hyundai', 'Elantra', 1995, 2027),
  ('suv', 'Hyundai', 'Entourage', 2006, 2014),
  ('suv', 'Hyundai', 'Ioniq 5', 2022, 2027),
  ('suv', 'Hyundai', 'Ioniq 5 N', 2025, 2027),
  ('suv', 'Hyundai', 'Ioniq 9', 2026, 2027),
  ('suv', 'Hyundai', 'Kona', 2018, 2027),
  ('suv', 'Hyundai', 'Kona N', 2022, 2023),
  ('suv', 'Hyundai', 'Nexo', 2019, 2027),
  ('suv', 'Hyundai', 'Palisade', 2020, 2027),
  ('suv', 'Hyundai', 'Santa Fe', 2001, 2027),
  ('suv', 'Hyundai', 'Santa Fe Sport', 2013, 2018),
  ('suv', 'Hyundai', 'Santa Fe XL', 2019, 2019),
  ('suv', 'Hyundai', 'Sonata', 1995, 2027),
  ('suv', 'Hyundai', 'Tiburon', 1997, 2008),
  ('suv', 'Hyundai', 'Tucson', 2005, 2027),
  ('suv', 'Hyundai', 'Veracruz', 2007, 2013),
  ('suv', 'Hyundai', 'XG350', 2002, 2005),
  ('suv', 'Infiniti', 'FX35', 2003, 2010),
  ('suv', 'Infiniti', 'FX35', 2012, 2012),
  ('suv', 'Infiniti', 'FX37', 2013, 2013),
  ('suv', 'Infiniti', 'FX45', 2003, 2008),
  ('suv', 'Infiniti', 'FX50', 2009, 2013),
  ('suv', 'Infiniti', 'JX35', 2013, 2013),
  ('suv', 'Infiniti', 'QX4', 1997, 2003),
  ('suv', 'Infiniti', 'QX50', 2014, 2017),
  ('suv', 'Infiniti', 'QX50', 2019, 2025),
  ('suv', 'Infiniti', 'QX55', 2022, 2025),
  ('suv', 'Infiniti', 'QX56', 2003, 2013),
  ('suv', 'Infiniti', 'QX60', 2014, 2027),
  ('suv', 'Infiniti', 'QX65', 2027, 2027),
  ('suv', 'Infiniti', 'QX70', 2014, 2018),
  ('suv', 'Infiniti', 'QX80', 2014, 2027),
  ('suv', 'Jaguar', 'E-PACE', 2018, 2024),
  ('suv', 'Jaguar', 'F-PACE', 2017, 2026),
  ('suv', 'Jaguar', 'I-PACE', 2019, 2024),
  ('suv', 'Jeep', 'Cherokee', 1995, 2011),
  ('suv', 'Jeep', 'Cherokee', 2014, 2023),
  ('suv', 'Jeep', 'Cherokee', 2026, 2027),
  ('suv', 'Jeep', 'Commander', 2006, 2010),
  ('suv', 'Jeep', 'Compass', 2006, 2027),
  ('suv', 'Jeep', 'Grand Cherokee', 1995, 2027),
  ('suv', 'Jeep', 'Grand Cherokee L', 2021, 2027),
  ('suv', 'Jeep', 'Grand Wagoneer', 2022, 2027),
  ('suv', 'Jeep', 'Grand Wagoneer L', 2024, 2027),
  ('suv', 'Jeep', 'Liberty', 1995, 2013),
  ('suv', 'Jeep', 'Patriot', 2007, 2018),
  ('suv', 'Jeep', 'Recon', 2026, 2027),
  ('suv', 'Jeep', 'Renegade', 2015, 2023),
  ('suv', 'Jeep', 'Wagoneer', 2022, 2025),
  ('suv', 'Jeep', 'Wagoneer L', 2024, 2025),
  ('suv', 'Jeep', 'Wagoneer S', 2024, 2027),
  ('suv', 'Jeep', 'Wrangler', 1995, 2027),
  ('suv', 'Jeep', 'Wrangler JK', 2018, 2018),
  ('suv', 'Kia', 'Amanti', 2004, 2009),
  ('suv', 'Kia', 'Borrego', 2009, 2011),
  ('suv', 'Kia', 'Carnival', 2022, 2027),
  ('suv', 'Kia', 'EV3', 2027, 2027),
  ('suv', 'Kia', 'EV6', 2022, 2027),
  ('suv', 'Kia', 'EV9', 2024, 2027),
  ('suv', 'Kia', 'Niro', 2017, 2027),
  ('suv', 'Kia', 'Optima', 2001, 2020),
  ('suv', 'Kia', 'Rio', 2001, 2023),
  ('suv', 'Kia', 'Rondo', 2007, 2016),
  ('suv', 'Kia', 'Sedona', 2001, 2021),
  ('suv', 'Kia', 'Seltos', 2021, 2027),
  ('suv', 'Kia', 'Sephia', 1995, 2001),
  ('suv', 'Kia', 'Sorento', 2001, 2009),
  ('suv', 'Kia', 'Sorento', 2011, 2027),
  ('suv', 'Kia', 'Soul', 2010, 2025),
  ('suv', 'Kia', 'Spectra', 2000, 2009),
  ('suv', 'Kia', 'Sportage', 1995, 2027),
  ('suv', 'Kia', 'Telluride', 2020, 2027),
  ('suv', 'Land Rover', 'Defender', 1995, 1995),
  ('suv', 'Land Rover', 'Defender', 1997, 1997),
  ('suv', 'Land Rover', 'Defender', 2020, 2027),
  ('suv', 'Land Rover', 'Discovery', 1995, 2004),
  ('suv', 'Land Rover', 'Discovery', 2017, 2027),
  ('suv', 'Land Rover', 'Discovery Sport', 2015, 2027),
  ('suv', 'Land Rover', 'Freelander', 2002, 2005),
  ('suv', 'Land Rover', 'LR2', 2008, 2015),
  ('suv', 'Land Rover', 'LR3', 2005, 2009),
  ('suv', 'Land Rover', 'LR4', 2010, 2016),
  ('suv', 'Land Rover', 'New Range Rover', 2022, 2022),
  ('suv', 'Land Rover', 'Range Rover', 1995, 2027),
  ('suv', 'Land Rover', 'Range Rover Evoque', 2012, 2027),
  ('suv', 'Land Rover', 'Range Rover Sport', 2006, 2027),
  ('suv', 'Land Rover', 'Range Rover Velar', 2018, 2027),
  ('suv', 'Lincoln', 'Aviator', 2003, 2005),
  ('suv', 'Lincoln', 'Aviator', 2020, 2027),
  ('suv', 'Lincoln', 'Corsair', 2020, 2027),
  ('suv', 'Lincoln', 'MKC', 2015, 2019),
  ('suv', 'Lincoln', 'MKT', 2010, 2019),
  ('suv', 'Lincoln', 'MKX', 2007, 2018),
  ('suv', 'Lincoln', 'Nautilus', 2019, 2027),
  ('suv', 'Lincoln', 'Navigator', 1998, 2027),
  ('suv', 'Lincoln', 'Navigator L', 2017, 2027),
  ('suv', 'Mazda', 'B-Series', 1995, 2010),
  ('suv', 'Mazda', 'CX-30', 2020, 2027),
  ('suv', 'Mazda', 'CX-5', 2013, 2027),
  ('suv', 'Mazda', 'CX-50', 2023, 2027),
  ('suv', 'Mazda', 'CX-7', 2007, 2012),
  ('suv', 'Mazda', 'CX-70', 2025, 2026),
  ('suv', 'Mazda', 'CX-9', 2007, 2023),
  ('suv', 'Mazda', 'CX-90', 2024, 2027),
  ('suv', 'Mazda', 'Mazda3', 2004, 2027),
  ('suv', 'Mazda', 'Mazda6', 2003, 2021),
  ('suv', 'Mazda', 'MPV', 1995, 2006),
  ('suv', 'Mazda', 'MX-5', 1995, 1997),
  ('suv', 'Mazda', 'MX-5', 1999, 2027),
  ('suv', 'Mazda', 'RX-8', 2004, 2012),
  ('suv', 'Mazda', 'Tribute', 2001, 2006),
  ('suv', 'Mazda', 'Tribute', 2008, 2011),
  ('suv', 'Mercedes-Benz', 'C-Class', 1995, 2027),
  ('suv', 'Mercedes-Benz', 'EQB-Class', 2022, 2025),
  ('suv', 'Mercedes-Benz', 'EQE-Class SUV', 2023, 2027),
  ('suv', 'Mercedes-Benz', 'EQS-Class SUV', 2023, 2027),
  ('suv', 'Mercedes-Benz', 'eSprinter', 2024, 2027),
  ('suv', 'Mercedes-Benz', 'G-Class', 1999, 1999),
  ('suv', 'Mercedes-Benz', 'G-Class', 2002, 2027),
  ('suv', 'Mercedes-Benz', 'GL-Class', 2006, 2016),
  ('suv', 'Mercedes-Benz', 'GLA-Class', 2015, 2026),
  ('suv', 'Mercedes-Benz', 'GLB-Class', 2020, 2026),
  ('suv', 'Mercedes-Benz', 'GLC-Class', 2016, 2027),
  ('suv', 'Mercedes-Benz', 'GLE-Class', 2016, 2027),
  ('suv', 'Mercedes-Benz', 'GLK-Class', 2010, 2020),
  ('suv', 'Mercedes-Benz', 'GLS-Class', 2016, 2027),
  ('suv', 'Mercedes-Benz', 'M-Class', 1995, 2011),
  ('suv', 'Mercedes-Benz', 'M-Class', 2016, 2019),
  ('suv', 'Mercedes-Benz', 'Metris', 2016, 2023),
  ('suv', 'Mercedes-Benz', 'ML-Class', 2012, 2015),
  ('suv', 'Mercedes-Benz', 'R-Class', 2006, 2013),
  ('suv', 'Mercedes-Benz', 'Sprinter', 2010, 2027),
  ('suv', 'Mini', 'Countryman', 2011, 2027),
  ('suv', 'Mitsubishi', 'Eclipse Cross', 2018, 2026),
  ('suv', 'Mitsubishi', 'Endeavor', 2004, 2011),
  ('suv', 'Mitsubishi', 'Mighty Max', 1995, 1996),
  ('suv', 'Mitsubishi', 'Mirage', 1995, 2002),
  ('suv', 'Mitsubishi', 'Mirage', 2014, 2024),
  ('suv', 'Mitsubishi', 'Montero', 1995, 2006),
  ('suv', 'Mitsubishi', 'Montero Sport', 1997, 2004),
  ('suv', 'Mitsubishi', 'Outlander', 2003, 2027),
  ('suv', 'Mitsubishi', 'Outlander Sport', 2011, 2027),
  ('suv', 'Mitsubishi', 'Raider', 1995, 2010),
  ('suv', 'Mitsubishi', 'RVR', 2011, 2022),
  ('suv', 'Nissan', 'Ariya MPV', 2025, 2027),
  ('suv', 'Nissan', 'Armada', 2002, 2015),
  ('suv', 'Nissan', 'Armada', 2017, 2027),
  ('suv', 'Nissan', 'Cube', 2009, 2014),
  ('suv', 'Nissan', 'Frontier', 1998, 2027),
  ('suv', 'Nissan', 'Juke', 2011, 2018),
  ('suv', 'Nissan', 'Kicks MPV', 2025, 2027),
  ('suv', 'Nissan', 'Murano', 2002, 2007),
  ('suv', 'Nissan', 'Murano', 2009, 2027),
  ('suv', 'Nissan', 'NV200', 2013, 2024),
  ('suv', 'Nissan', 'Pathfinder', 1995, 2027),
  ('suv', 'Nissan', 'Pickup', 1995, 1997),
  ('suv', 'Nissan', 'Quest', 1995, 2009),
  ('suv', 'Nissan', 'Quest', 2011, 2017),
  ('suv', 'Nissan', 'Rogue', 2008, 2027),
  ('suv', 'Nissan', 'Rogue Select', 2014, 2014),
  ('suv', 'Nissan', 'Titan', 2002, 2024),
  ('suv', 'Nissan', 'X-Trail', 2005, 2006),
  ('suv', 'Nissan', 'Xterra', 2000, 2015),
  ('suv', 'Porsche', 'Cayenne', 2003, 2027),
  ('suv', 'Porsche', 'Macan', 2015, 2027),
  ('suv', 'Ram', '1500', 2013, 2027),
  ('suv', 'Ram', '2500', 2013, 2027),
  ('suv', 'Ram', '3500', 2012, 2027),
  ('suv', 'Ram', '4000', 2013, 2023),
  ('suv', 'Ram', '4500', 2013, 2027),
  ('suv', 'Ram', '5500', 2013, 2027),
  ('suv', 'Ram', 'Cargo Van', 2013, 2016),
  ('suv', 'Ram', 'ProMaster 1500', 2014, 2027),
  ('suv', 'Ram', 'ProMaster 2500', 2014, 2027),
  ('suv', 'Ram', 'ProMaster 3500', 2014, 2027),
  ('suv', 'Ram', 'Promaster City', 2015, 2022),
  ('suv', 'Ram', 'Promaster City', 2027, 2027),
  ('suv', 'Subaru', 'Ascent', 2019, 2027),
  ('suv', 'Subaru', 'B9 Tribeca', 2006, 2014),
  ('suv', 'Subaru', 'Baja', 2003, 2006),
  ('suv', 'Subaru', 'Crosstrek', 2016, 2027),
  ('suv', 'Subaru', 'Forester', 1998, 2027),
  ('suv', 'Subaru', 'Impreza', 1995, 2027),
  ('suv', 'Subaru', 'Legacy', 1995, 2025),
  ('suv', 'Subaru', 'Outback', 2005, 2027),
  ('suv', 'Subaru', 'Solterra', 2023, 2027),
  ('suv', 'Subaru', 'SVX', 1995, 1997),
  ('suv', 'Subaru', 'Trailseeker', 2026, 2027),
  ('suv', 'Subaru', 'Uncharted', 2026, 2027),
  ('suv', 'Subaru', 'XV CrossTrek', 2012, 2015),
  ('suv', 'Suzuki', 'Grand Vitara', 1999, 2014),
  ('suv', 'Suzuki', 'Grand Vitara XL-7', 2002, 2002),
  ('suv', 'Suzuki', 'Grand Vitara XL-7', 2006, 2008),
  ('suv', 'Suzuki', 'Samurai', 1995, 1996),
  ('suv', 'Suzuki', 'Sidekick', 1995, 1998),
  ('suv', 'Suzuki', 'Sidekick Sport', 1995, 1998),
  ('suv', 'Suzuki', 'Vitara', 1999, 2004),
  ('suv', 'Suzuki', 'X-90', 1996, 1998),
  ('suv', 'Suzuki', 'XL7', 2003, 2005),
  ('suv', 'Suzuki', 'XL7', 2007, 2009),
  ('suv', 'Tesla', 'Model X', 2016, 2026),
  ('suv', 'Tesla', 'Model Y', 2020, 2027),
  ('suv', 'Toyota', '4Runner', 1995, 2027),
  ('suv', 'Toyota', 'Avalon', 1995, 2022),
  ('suv', 'Toyota', 'bZ', 2026, 2027),
  ('suv', 'Toyota', 'bZ Woodland', 2026, 2027),
  ('suv', 'Toyota', 'bZ4X', 2023, 2025),
  ('suv', 'Toyota', 'C-HR', 2018, 2022),
  ('suv', 'Toyota', 'C-HR', 2026, 2027),
  ('suv', 'Toyota', 'Camry', 1995, 2027),
  ('suv', 'Toyota', 'Corolla Cross', 2022, 2027),
  ('suv', 'Toyota', 'FJ Cruiser', 2007, 2014),
  ('suv', 'Toyota', 'Grand Highlander', 2024, 2027),
  ('suv', 'Toyota', 'Highlander', 2001, 2027),
  ('suv', 'Toyota', 'Land Cruiser', 1995, 2021),
  ('suv', 'Toyota', 'Land Cruiser', 2024, 2027),
  ('suv', 'Toyota', 'Pick-Up', 1995, 1995),
  ('suv', 'Toyota', 'Previa', 1995, 1998),
  ('suv', 'Toyota', 'RAV4', 1996, 2027),
  ('suv', 'Toyota', 'RAV4 Prime (PHEV)', 2021, 2027),
  ('suv', 'Toyota', 'Scion xB', 2004, 2015),
  ('suv', 'Toyota', 'Sequoia', 2000, 2027),
  ('suv', 'Toyota', 'Sienna', 1995, 2027),
  ('suv', 'Toyota', 'Venza', 2009, 2017),
  ('suv', 'Toyota', 'Venza', 2021, 2024),
  ('suv', 'Volkswagen', 'Atlas', 2018, 2027),
  ('suv', 'Volkswagen', 'Atlas Cross Sport', 2020, 2027),
  ('suv', 'Volkswagen', 'Beetle', 1998, 2010),
  ('suv', 'Volkswagen', 'Beetle', 2012, 2019),
  ('suv', 'Volkswagen', 'Cabrio', 1995, 2002),
  ('suv', 'Volkswagen', 'Corrado', 1995, 1995),
  ('suv', 'Volkswagen', 'Eos', 2007, 2016),
  ('suv', 'Volkswagen', 'EuroVan', 1995, 2004),
  ('suv', 'Volkswagen', 'Golf', 1996, 2006),
  ('suv', 'Volkswagen', 'Golf', 2010, 2021),
  ('suv', 'Volkswagen', 'Golf III', 1995, 1995),
  ('suv', 'Volkswagen', 'GTI', 1995, 2003),
  ('suv', 'Volkswagen', 'GTI', 2005, 2015),
  ('suv', 'Volkswagen', 'GTI', 2025, 2025),
  ('suv', 'Volkswagen', 'ID. Buzz', 2025, 2025),
  ('suv', 'Volkswagen', 'ID.4', 2021, 2027),
  ('suv', 'Volkswagen', 'Jetta', 1995, 2027),
  ('suv', 'Volkswagen', 'Jetta Wagon', 2001, 2006),
  ('suv', 'Volkswagen', 'Passat', 1995, 2022),
  ('suv', 'Volkswagen', 'Phaeton', 2004, 2006),
  ('suv', 'Volkswagen', 'R32', 2004, 2004),
  ('suv', 'Volkswagen', 'R32', 2008, 2008),
  ('suv', 'Volkswagen', 'Rabbit', 2006, 2009),
  ('suv', 'Volkswagen', 'Routan', 2009, 2014),
  ('suv', 'Volkswagen', 'Taos', 2022, 2027),
  ('suv', 'Volkswagen', 'Tiguan', 2009, 2027),
  ('suv', 'Volkswagen', 'Tiguan Limited', 2018, 2018),
  ('suv', 'Volkswagen', 'Touareg', 2004, 2018),
  ('suv', 'Volvo', 'C30', 2007, 2013),
  ('suv', 'Volvo', 'C40', 2022, 2024),
  ('suv', 'Volvo', 'C70', 1998, 2004),
  ('suv', 'Volvo', 'C70', 2006, 2013),
  ('suv', 'Volvo', 'C70 / C30', 2012, 2012),
  ('suv', 'Volvo', 'EC40', 2025, 2026),
  ('suv', 'Volvo', 'EX30', 2025, 2027),
  ('suv', 'Volvo', 'EX30 CC', 2026, 2027),
  ('suv', 'Volvo', 'EX40', 2025, 2026),
  ('suv', 'Volvo', 'EX60', 2027, 2027),
  ('suv', 'Volvo', 'EX90', 2025, 2027),
  ('suv', 'Volvo', 'S40', 1999, 2011),
  ('suv', 'Volvo', 'S60', 2001, 2009),
  ('suv', 'Volvo', 'S60', 2011, 2025),
  ('suv', 'Volvo', 'S60CC', 2016, 2018),
  ('suv', 'Volvo', 'S80', 1999, 2016),
  ('suv', 'Volvo', 'S90', 1998, 1998),
  ('suv', 'Volvo', 'S90', 2017, 2027),
  ('suv', 'Volvo', 'V50', 2005, 2011),
  ('suv', 'Volvo', 'V60', 2015, 2025),
  ('suv', 'Volvo', 'V60CC', 2015, 2026),
  ('suv', 'Volvo', 'V70', 1998, 2010),
  ('suv', 'Volvo', 'V90', 1998, 1998),
  ('suv', 'Volvo', 'V90', 2017, 2021),
  ('suv', 'Volvo', 'V90CC', 2017, 2026),
  ('suv', 'Volvo', 'XC40', 2019, 2026),
  ('suv', 'Volvo', 'XC60', 2010, 2027),
  ('suv', 'Volvo', 'XC70', 2004, 2016),
  ('suv', 'Volvo', 'XC90', 2003, 2014),
  ('suv', 'Volvo', 'XC90', 2016, 2027)
  ) AS v (tipo, marca, modelo, desde, hasta)
  CROSS JOIN LATERAL generate_series(v.desde, v.hasta) AS gs (anio)
ON CONFLICT (tipo, marca, modelo, anio) DO NOTHING;

INSERT INTO schema_migrations (nombre, checksum) VALUES ('014_catalogo_vehiculos_vpic.sql', 'a0bf9b1be2470c713e08eec3179badfeeb7143a74e1c3667ff3203aaabfd32fc');

-- >>>>>>>>>>>>>>>>>>>> 015_confianza_admin.sql >>>>>>>>>>>>>>>>>>>>
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

INSERT INTO schema_migrations (nombre, checksum) VALUES ('015_confianza_admin.sql', 'bd83ce6179d66f9616f617066061ae75c1470778ed7516998c6b92c5ee3c2494');

COMMIT;

SELECT nombre, aplicada_en FROM schema_migrations ORDER BY nombre;
