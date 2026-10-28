# Auditoría del modelo de datos vs. Frontend y ERS v2.2

**Fecha:** 20 oct 2026 · **Alcance:** migraciones 001–008, seed, mappers del backend
**Insumos:** `EcoRuta_IS-frontEnd` (RegisterScreen, LoginScreen, ForgotPasswordModal,
`src/types/registration.ts`, `src/constants/options.ts`) y ERS v2.2 (sección 7.3).

> Las migraciones 001–008 se **reescribieron** (no se agregaron migraciones
> `ALTER`), porque todavía no se habían aplicado en la rama `main` de Neon. Si
> alguien ya las corrió en su rama personal, debe resetearla:
> `npm run db:reset:local`.

---

## 1. Mapeo de campos: formulario de registro → BD

| Frontend (`RegistrationFormData`) | Columna                                | Estado |
|-----------------------------------|----------------------------------------|--------|
| `userType: 'alumno' \| 'maestro'` | `usuario.tipo` `'estudiante' \| 'docente'` | Se traduce en el mapper (C-03) |
| `fullName`                        | `usuario.nombre_completo`              | Renombrada (C-02) |
| `email`                           | `usuario.correo` (minúsculas, único)   | Sin cambio |
| `password`                        | `usuario.hash_contrasena` (bcrypt)     | Sin cambio |
| `confirmPassword`                 | — (solo se valida en la API)           | No se persiste |
| `termsAccepted`                   | `usuario.acepto_terminos_en` + `version_terminos` | Columna nueva (C-07) |
| `career` (alumno)                 | `usuario.carrera`                      | Separada (C-04) |
| `department` (maestro)            | `usuario.departamento`                 | **Nueva** (C-04) |
| `academicCurriculumDoc` (alumno)  | `documento_usuario` tipo `reticula_academica` | **Tabla nueva** (C-05) |
| `scheduleDoc` (maestro)           | `documento_usuario` tipo `carga_horaria` | **Tabla nueva** (C-05) |
| —  (RF-05, aún sin pantalla)      | `usuario.telefono` (10 dígitos)        | Ajustada (C-08) |
| —  (RF-06, aún sin pantalla)      | `vehiculo.*`                           | Sin cambio; contrato en `frontend/src/types/api.ts` |

---

## 2. Cambios

| ID   | Cambio | Motivo | Archivo(s) |
|------|--------|--------|------------|
| C-01 | **IDs `BIGINT IDENTITY` → `UUID`** (`gen_random_uuid()`, nativo en PG 13+) en las 11 tablas | node-pg devuelve `BIGINT` como *string*, así que el tipo TS `number` habría sido falso. Además, en una API pública los UUID no se pueden enumerar (`/viajes/1`, `/viajes/2`…), una defensa extra a RNF-09/RNF-10 | 001–007 |
| C-02 | `usuario.nombre` → **`nombre_completo`**, con `CHECK` de ≥ 4 caracteres y sin espacios sobrantes | Igual al campo `fullName` y a su validación en `RegisterScreen` | 002 |
| C-03 | `tipo` se queda como `estudiante/docente` (vocabulario de la ERS); el cliente usa `alumno/maestro` y **el mapper traduce** | La ERS es el documento contractual; la traducción vive en un solo lugar (`usuario.mapper.js`) | 002, mapper |
| C-04 | `carrera` única → **`carrera` + `departamento`**, con `CHECK`: alumno ⇒ solo carrera; maestro ⇒ solo departamento | El frontend tiene dos campos con catálogos distintos y limpia el otro al cambiar de tipo | 002 |
| C-05 | **Tabla nueva `documento_usuario`**: solo metadatos y `storage_key` (nunca el binario); PDF/PNG/JPG ≤ 10 MB; un documento vigente por tipo; estados pendiente/aprobado/rechazado | El registro exige adjuntar retícula u horario. **La ERS no lo contempla: requiere control de cambios** (ver §4) | 002 |
| C-06 | **Catálogos `carreras` y `departamentos`** en `parametro`, copia exacta de `options.ts` (verificado carácter por carácter), validados por trigger | Evita valores libres o con acentos distintos; fuente única para `GET /api/catalogos` | 003, 008 |
| C-07 | `version_terminos` en `usuario` | Saber qué versión del aviso de privacidad aceptó cada persona (LFPDPPP) | 002 |
| C-08 | `telefono`: formato normalizado de **10 dígitos** (`VARCHAR(15)` → `^[0-9]{10}$`) | Un solo formato para mostrar y para enlaces `tel:`/WhatsApp; el mapper quita `+52`, espacios y guiones | 002, mapper |
| C-09 | Coordenadas `NUMERIC(9,6)` → **`DOUBLE PRECISION`** | node-pg devuelve `NUMERIC` como string; `DOUBLE` llega como `number` (lo que esperan Leaflet y TS) y es el tipo nativo para la trigonometría | 004 |
| C-10 | `CHECK` de **zona de servicio** (lat 19.2–20.2, lng −101.7 a −100.7) | Atrapa el error más común con mapas: enviar `[lng, lat]` invertidos | 004 |
| C-11 | **Columna generada `punto_busqueda` + índice GiST parcial** (reemplaza los B-tree `(lat, lng)`) | Búsqueda por cercanía real sin PostGIS: filtro por caja y orden KNN (`<->`). Los B-tree compuestos solo sirven para el primer eje | 004 |
| C-12 | Función **`fn_haversine_km`** (SQL, `IMMUTABLE`) | Una sola implementación para RF-10 (respaldo × 1.3) y RF-11 | 001 |
| C-13 | Consulta de referencia **`db/queries/buscar_viajes.sql`** | RF-11 completo: sentido + ventana de hora + radio + paginación | queries |
| C-14 | Índices de `token_verificacion(expira_en)` y `usuario(estado, creado_en)` | Limpieza de tokens vencidos y panel de administración | 002 |
| C-15 | `src/config/db.js`: Pool con **conversión `NUMERIC`/`INT8` → number** y `withTransaction` | `distancia_km`, `co2_kg` y `count(*)` llegan como `number` al JSON | src/config |
| C-16 | **Mappers** `usuario.mapper.js` y `viaje.mapper.js` + contrato **`frontend/src/types/api.ts`** | Conversión `snake_case` ⇄ `camelCase` explícita; los errores usan las claves de `FormErrors` | src, docs |
| C-17 | `DATABASE_URL` (pooled) para la app y **`DATABASE_URL_DIRECT`** para las migraciones | El *advisory lock* del ejecutor necesita una sesión directa, no PgBouncer | migrate.js, .env.example |

---

## 3. Hallazgos en el frontend (para tareas de Flor y Jesús)

| ID   | Hallazgo | Recomendación |
|------|----------|---------------|
| F-01 | `LoginScreen`/`App.tsx` llaman **`role`** a alumno/maestro. En la API, `role` es el rol de seguridad (`user`/`admin`, RNF-09) | Renombrar a `userType` en el estado del usuario y usar `UserDTO` de `frontend/src/types/api.ts` |
| F-02 | `DocumentPickerField` acepta `image/*`, `.doc` y `.docx`, pero el texto dice "PDF, PNG, JPG" | Limitar `type` a `['application/pdf','image/png','image/jpeg']`; la BD rechaza lo demás |
| F-03 | Las listas de `options.ts` están fijas en el código | Leerlas de `GET /api/catalogos`, con `options.ts` como respaldo sin conexión |
| F-04 | El registro lleva un archivo, así que no puede ir como JSON | Enviar `multipart/form-data` (`FormData`), según el comentario de `RegisterResponse` en `frontend/src/types/api.ts` |
| F-05 | El quick-fill usa `L24120341@…` con mayúscula | Sin problema: la API normaliza a minúsculas. Mantener el `toLowerCase()` del cliente |
| F-06 | El *login* simula el tipo de usuario por el texto del correo | Al conectar la API, tomarlo de `LoginResponse.user.userType` |

---

## 4. Decisiones que necesitan acuerdo del equipo

1. **Documentos de registro (C-05).** Es un cambio de alcance respecto a la ERS v2.2:
   - Agregar a la ERS (RF-01 y diccionario de datos) la tabla 11 `documento_usuario`.
   - Elegir almacenamiento gratuito (Cloudinary, Supabase Storage o Cloudflare R2) detrás
     de la capa de abstracción (RNF-19). Neon no debe guardar archivos.
   - Definir si un documento `pendiente` **bloquea** publicar o reservar. Hoy **no**
     bloquea: RN-02 solo exige el correo verificado. Si debe bloquear, se agrega a
     `fn_viaje_validar` y `fn_reserva_validar_insercion` en una migración nueva.
   - Agregar una historia de usuario para que el administrador revise documentos (RF-29).
2. **Vocabulario de `tipo` (C-03).** La alternativa es unificar todo en `alumno/maestro`,
   lo que implica cambiar la ERS. La traducción en el mapper funciona en ambos casos.

---

## 5. Sugerencia de registro en Jira / GitHub

- **Historia técnica:** `ER-xx · Auditoría y ajuste del modelo de datos contra el frontend (Sprint 1)`
- **Subtareas:** C-01…C-17 agrupadas en: *Esquema (001–008)*, *Catálogos*,
  *Búsqueda geográfica*, *Capa de mapeo*, *Documentación*.
- **Rama:** `feature/ER-xx-auditoria-modelo-datos`
- **Commit (Conventional Commits):**
  ```
  feat(db): alinear modelo de datos con el registro del frontend

  - UUID como PK, nombre_completo, carrera/departamento separados
  - tabla documento_usuario para retícula/horario (pendiente de ERS)
  - catálogos de carreras y departamentos en parametro
  - coordenadas DOUBLE PRECISION + índice GiST para búsqueda por cercanía
  - mappers snake_case ⇄ camelCase y contrato TS

  Refs: ER-xx
  ```
- **Checklist del PR:** migraciones aplican en una rama limpia de Neon · seed corre
  dos veces · `npm run db:status` sin "¡MODIFICADA!" · revisor de frontend aprueba
  `frontend/src/types/api.ts`.
