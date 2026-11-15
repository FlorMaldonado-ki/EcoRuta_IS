-- Datos demo: SOLO para ramas de desarrollo de Neon. Contraseña de todas las cuentas: Demo1234
BEGIN;
-- =============================================================================
-- EcoRuta Escolar · Seed de DEMOSTRACIÓN (solo desarrollo y pruebas, SU-3)
-- -----------------------------------------------------------------------------
-- Contraseña de TODAS las cuentas demo: Demo1234   (bcrypt, coste 10)
-- Correos ficticios del dominio institucional con prefijo "demo.".
-- Re-ejecutable: borra primero los datos demo.
-- =============================================================================

-- Limpieza (orden inverso a las FK) -------------------------------------------
DELETE FROM calificacion  WHERE viaje_id IN (SELECT v.id FROM viaje v JOIN usuario u ON u.id = v.conductor_id WHERE u.correo LIKE 'demo.%');
DELETE FROM impacto_viaje WHERE viaje_id IN (SELECT v.id FROM viaje v JOIN usuario u ON u.id = v.conductor_id WHERE u.correo LIKE 'demo.%');
DELETE FROM reserva       WHERE viaje_id IN (SELECT v.id FROM viaje v JOIN usuario u ON u.id = v.conductor_id WHERE u.correo LIKE 'demo.%');
DELETE FROM reporte       WHERE reportante_id IN (SELECT id FROM usuario WHERE correo LIKE 'demo.%');
DELETE FROM viaje         WHERE conductor_id  IN (SELECT id FROM usuario WHERE correo LIKE 'demo.%');
DELETE FROM vehiculo      WHERE usuario_id    IN (SELECT id FROM usuario WHERE correo LIKE 'demo.%');
DELETE FROM usuario       WHERE correo LIKE 'demo.%';   -- documentos y tokens caen en cascada

-- Usuarios (carrera/departamento tomados de los catálogos) ---------------------
INSERT INTO usuario (institucion_id, nombre_completo, correo, hash_contrasena, tipo, carrera, departamento,
                     telefono, rol, estado, acepto_terminos_en, verificado_en)
SELECT i.id, u.nombre, u.correo,
       '$2a$10$Vj61nEcdPneqdvpPJjVn2udeFPyWmxW3wCxPlBYkGa7faW1kwEqFu',
       u.tipo, u.carrera, u.departamento, u.telefono, u.rol, 'activo', now(), now()
FROM institucion i
CROSS JOIN (VALUES
  ('Admin Demo',      'demo.admin@morelia.tecnm.mx', 'docente',    NULL, 'Departamento de Sistemas y Computación', NULL,         'admin'),
  ('Ana Conductora',  'demo.ana@morelia.tecnm.mx',   'estudiante', 'Ingeniería en Sistemas Computacionales', NULL, '4431234567', 'usuario'),
  ('Luis Conductor',  'demo.luis@morelia.tecnm.mx',  'docente',    NULL, 'Departamento de Ciencias Básicas',       '4437654321', 'usuario'),
  ('Carla Pasajera',  'demo.carla@morelia.tecnm.mx', 'estudiante', 'Ingeniería Industrial',                  NULL, NULL,         'usuario'),
  ('Mario Pasajero',  'demo.mario@morelia.tecnm.mx', 'estudiante', 'Ingeniería Mecatrónica',                 NULL, NULL,         'usuario'),
  ('Sofía Pasajera',  'demo.sofia@morelia.tecnm.mx', 'estudiante', 'Ingeniería en Gestión Empresarial',      NULL, NULL,         'usuario')
) AS u(nombre, correo, tipo, carrera, departamento, telefono, rol)
WHERE i.nombre = 'TecNM Campus Morelia';

-- Documentos de registro (metadatos; el archivo vive en el almacenamiento externo).
INSERT INTO documento_usuario (usuario_id, tipo, nombre_archivo, mime_type, tamano_bytes, storage_key,
                               estado, revisado_por, revisado_en)
SELECT u.id,
       CASE u.tipo WHEN 'estudiante' THEN 'reticula_academica' ELSE 'carga_horaria' END,
       CASE u.tipo WHEN 'estudiante' THEN 'reticula.pdf' ELSE 'horario.pdf' END,
       'application/pdf', 1420500,
       'demo/' || u.id || '/' || CASE u.tipo WHEN 'estudiante' THEN 'reticula.pdf' ELSE 'horario.pdf' END,
       CASE WHEN u.correo = 'demo.sofia@morelia.tecnm.mx' THEN 'pendiente' ELSE 'aprobado' END,
       CASE WHEN u.correo = 'demo.sofia@morelia.tecnm.mx' THEN NULL
            ELSE (SELECT id FROM usuario WHERE correo = 'demo.admin@morelia.tecnm.mx') END,
       CASE WHEN u.correo = 'demo.sofia@morelia.tecnm.mx' THEN NULL ELSE now() END
FROM usuario u
WHERE u.correo LIKE 'demo.%' AND u.rol = 'usuario';

-- Vehículos -------------------------------------------------------------------
INSERT INTO vehiculo (usuario_id, marca, modelo, color, placas, capacidad, declaracion_licencia_seguro)
SELECT id, 'Nissan', 'Versa', 'Gris', 'PTX1234', 5, true FROM usuario WHERE correo = 'demo.ana@morelia.tecnm.mx'
UNION ALL
SELECT id, 'Volkswagen', 'Jetta', 'Blanco', 'PRB5678', 5, true FROM usuario WHERE correo = 'demo.luis@morelia.tecnm.mx';

-- Viajes: uno de ayer (para tener CO2) y dos futuros publicados --------------
INSERT INTO viaje (conductor_id, vehiculo_id, sentido, punto_campus,
                   origen_texto, origen_lat, origen_lng, destino_texto, destino_lat, destino_lng,
                   salida_en, asientos_totales, distancia_km, duracion_min, notas)
SELECT u.id, v.id, x.sentido, 'campus_1',
       x.o_txt, x.o_lat, x.o_lng, x.d_txt, x.d_lat, x.d_lng,
       x.salida, 3, x.km, x.mins, x.notas
FROM usuario u
JOIN vehiculo v ON v.usuario_id = u.id
JOIN (VALUES
  ('demo.ana@morelia.tecnm.mx',  'hacia_campus',
   'Plaza Las Américas', 19.703900, -101.192400, 'Campus 1 (Central - Av. Tecnológico)', 19.721700, -101.185800,
   date_trunc('hour', now()) - interval '1 day', 4.10, 14, 'Frente a la entrada de Liverpool'),
  ('demo.ana@morelia.tecnm.mx',  'hacia_campus',
   'Centro Histórico (Catedral)', 19.702400, -101.192200, 'Campus 1 (Central - Av. Tecnológico)', 19.721700, -101.185800,
   date_trunc('hour', now()) + interval '1 day 7 hours', 4.60, 18, 'Esquina Madero y Abasolo'),
  ('demo.luis@morelia.tecnm.mx', 'desde_campus',
   'Campus 1 (Central - Av. Tecnológico)', 19.721700, -101.185800, 'Altozano', 19.672000, -101.165000,
   date_trunc('hour', now()) + interval '1 day 15 hours', 7.80, 22, NULL)
) AS x(correo, sentido, o_txt, o_lat, o_lng, d_txt, d_lat, d_lng, salida, km, mins, notas)
  ON x.correo = u.correo;

-- Reservas del viaje de ayer: solicitadas y luego aceptadas (el trigger descuenta asientos).
INSERT INTO reserva (viaje_id, pasajero_id)
SELECT vj.id, p.id
FROM viaje vj
JOIN usuario c ON c.id = vj.conductor_id AND c.correo = 'demo.ana@morelia.tecnm.mx'
JOIN usuario p ON p.correo IN ('demo.carla@morelia.tecnm.mx', 'demo.mario@morelia.tecnm.mx')
WHERE vj.salida_en < now();

UPDATE reserva SET estado = 'aceptada', respondida_en = now()
WHERE viaje_id IN (SELECT vj.id FROM viaje vj JOIN usuario c ON c.id = vj.conductor_id
                   WHERE c.correo = 'demo.ana@morelia.tecnm.mx' AND vj.salida_en < now());

-- Finalizar el viaje de ayer y registrar su impacto (RF-19, RF-21).
UPDATE viaje SET estado = 'finalizado', finalizado_en = salida_en + interval '20 minutes'
WHERE salida_en < now()
  AND conductor_id = (SELECT id FROM usuario WHERE correo = 'demo.ana@morelia.tecnm.mx');

INSERT INTO impacto_viaje (viaje_id, pasajeros, distancia_km, factor_emision)
SELECT vj.id,
       (SELECT count(*) FROM reserva r WHERE r.viaje_id = vj.id AND r.estado = 'aceptada'),
       vj.distancia_km,
       (SELECT (valor #>> '{}')::numeric FROM parametro WHERE clave = 'factor_emision_kg_km')
FROM viaje vj
JOIN usuario c ON c.id = vj.conductor_id AND c.correo = 'demo.ana@morelia.tecnm.mx'
WHERE vj.estado = 'finalizado';

-- Una solicitud pendiente en el viaje futuro de Luis.
INSERT INTO reserva (viaje_id, pasajero_id)
SELECT vj.id, p.id
FROM viaje vj
JOIN usuario c ON c.id = vj.conductor_id AND c.correo = 'demo.luis@morelia.tecnm.mx'
JOIN usuario p ON p.correo = 'demo.sofia@morelia.tecnm.mx';

-- Calificaciones del viaje finalizado.
INSERT INTO calificacion (viaje_id, evaluador_id, evaluado_id, puntaje, comentario)
SELECT vj.id, p.id, vj.conductor_id, 5, 'Muy puntual'
FROM viaje vj
JOIN reserva r ON r.viaje_id = vj.id AND r.estado = 'aceptada'
JOIN usuario p ON p.id = r.pasajero_id
WHERE vj.estado = 'finalizado'
  AND vj.conductor_id = (SELECT id FROM usuario WHERE correo = 'demo.ana@morelia.tecnm.mx');

COMMIT;
