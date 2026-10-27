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
