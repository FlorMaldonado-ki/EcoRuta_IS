# Pruebas de seguridad y checklist de calidad del backend · Sprint 2

**Jira:** SCRUM-47 (parte backend de SCRUM-13) · **ERS:** RNF-06, RNF-08, RNF-09, RNF-10, RNF-11, RNF-12, RNF-14, RNF-32
**Fecha:** 9 de noviembre de 2026 · **Entorno:** API local contra PostgreSQL 16 con las migraciones 001–008 y el seed demo.

## Cómo repetirlas

```bash
cd backend
TEST_DATABASE_URL=<rama de Neon de PRUEBAS> npm test      # unitarias + integración (incluye seguridad)
npm run test:concurrencia -- http://localhost:3000         # SCRUM-39, con la API encendida
npm audit --omit=dev
```

Las pruebas automatizadas están en `backend/test/integracion/seguridad.test.js`. Crean sus propios
usuarios de prueba y los borran al terminar; aun así, **no se corren contra la rama `main`**.

## Resultados

| # | Prueba | Cómo se probó | Resultado |
|---|--------|---------------|-----------|
| 1 | Endpoints protegidos sin token | 10 endpoints (perfil, vehículos, viajes, reservas) sin `Authorization` | ✔ 401 `NO_AUTENTICADO` en todos |
| 2 | Token vencido | JWT firmado con la llave correcta y `exp` en el pasado | ✔ 401 `SESION_EXPIRADA` |
| 3 | Token alterado | Se cambió el payload a `rol: admin` sin volver a firmar | ✔ 401 `TOKEN_INVALIDO` |
| 4 | Token de otra llave y `alg: none` | JWT firmado con otro secreto y JWT sin firma | ✔ 401 `TOKEN_INVALIDO` |
| 5 | Acceso a datos ajenos (RNF-09) | Usuario A contra el vehículo, viaje y reservas de B: leer, editar, desactivar, listar solicitudes, aceptar, cancelar, publicar con su vehículo | ✔ 404 (o 403 al cancelar el viaje, como pide SCRUM-23); los datos de B no cambian |
| 6 | Inyección SQL en filtros | `' OR 1=1 --` y `1; DROP TABLE viaje` en `direction`, `date` y `page` de la búsqueda | ✔ 422 por campo; la consulta nunca se ejecuta |
| 7 | Inyección SQL en formularios | `' OR 1=1 --` y `x'); DELETE FROM vehiculo; --` en marca y modelo de un vehículo; en el login | ✔ Se guarda como texto literal (consultas parametrizadas); login 401 |
| 8 | Inyección en identificadores | `1' OR '1'='1` como id de reserva | ✔ 404 |
| 9 | Bloqueo por intentos (RNF-11) | 5 contraseñas incorrectas seguidas y luego la correcta | ✔ Al 5.º fallo 423; con la contraseña correcta sigue 423 `CUENTA_BLOQUEADA` (15 min) |
| 10 | Límite de peticiones | Logins repetidos desde la misma IP | ✔ 429 `DEMASIADOS_INTENTOS` |
| 11 | Fuga de datos (RNF-12) | Se revisó el JSON de perfil, detalle, búsqueda y lista de solicitudes | ✔ Nunca aparecen `hash_contrasena`, hashes bcrypt ni contadores de bloqueo; teléfono y placas de terceros solo con reserva aceptada |
| 12 | Archivo disfrazado | Texto plano enviado como `reticula.pdf` con tipo `application/pdf` | ✔ 422 en `academicCurriculumDoc` (se revisan los bytes reales) |
| 13 | Cabeceras de seguridad | `GET /api/health` | ✔ `helmet` activo: `X-Content-Type-Options: nosniff`, CSP, sin `X-Powered-By` |
| 14 | Concurrencia del último asiento (RNF-28) | 20 corridas: 2 aceptaciones simultáneas + 15 lecturas de fondo, por API y por service | ✔ 20/20: una aceptada, la otra 409 `SIN_ASIENTOS`, asientos nunca negativos |

## Lo que se corrigió durante las pruebas

| Hallazgo | Corrección |
|----------|------------|
| `npm audit`: 3 vulnerabilidades **altas** (body-parser, multer, nodemailer) | body-parser 1.20.8 → 1.20.9, multer 2.4.0 → 2.5.0 y nodemailer 7.0.13 → 10.4.0. Se probó que el envío por SMTP sigue igual con la versión 10. `npm audit --omit=dev` → **0 vulnerabilidades**. |
| El límite general (300 peticiones/15 min por IP) cortaba la prueba de concurrencia; en el campus muchos alumnos comparten la misma IP pública | Límites configurables con `RATE_LIMIT_GENERAL`, `RATE_LIMIT_LOGIN` y `RATE_LIMIT_CORREOS`. Producción conserva los valores anteriores; desarrollo usa 5000 generales. Revisar el valor de producción antes de la demo en el campus. |
| Un `CHECK` de la BD no validado por la API respondía 500 | Ahora responde 422 `DATOS_INVALIDOS` y lo registra en el log para corregir la validación. |
| Duplicados (placas, reserva vigente) respondían el genérico `DUPLICADO` | Códigos específicos: `PLACAS_REGISTRADAS` (con `fields.plates`) y `RESERVA_DUPLICADA`. |

## Checklist de calidad

- [x] `npm audit --omit=dev` sin vulnerabilidades altas ni críticas (0 en total).
- [x] Ningún secreto en el repositorio: `.env` está en `.gitignore`; `.env.example` solo tiene valores de ejemplo y quedó actualizado (ruteo, límites, Brevo, `TEST_DATABASE_URL`).
- [x] `helmet` y CORS activos; en producción CORS solo acepta `CORS_ORIGINS` y la app nativa (sin `Origin`).
- [x] Cada endpoint nuevo valida su entrada y responde errores con `{ error, message, fields }`.
- [x] Cada service nuevo tiene pruebas (RNF-32): 58 pruebas en total (25 unitarias, 33 de integración).
- [ ] Revisar HTTPS (RNF-08) y CORS en Render cuando se despliegue (SCRUM-16, fuera de este alcance).
