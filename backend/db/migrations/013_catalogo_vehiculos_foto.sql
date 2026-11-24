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
