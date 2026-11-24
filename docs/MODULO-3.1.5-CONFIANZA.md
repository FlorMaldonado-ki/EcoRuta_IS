# Módulo 3.1.5 · Confianza, seguridad y administración

Incluye calificaciones (RF-27), reportes (RF-28), gestión de usuarios (RF-29), estadísticas del administrador (RF-30), contacto de emergencia (RF-31, ampliación de alcance) y revisión de documentos. Además se corrigió que **recargar la página web cerrara la sesión**.

## Reglas del proyecto

| Regla | Dónde se aplica |
|---|---|
| **La puntuación de una calificación es definitiva**: no se edita ni se borra. | API y base de datos. El trigger `trg_calificacion_inmutable` rechaza cualquier `UPDATE` de la puntuación y cualquier `DELETE`. |
| **El comentario es independiente de la puntuación.** Su autor puede editarlo o borrarlo; borrarlo no borra la calificación. | `PATCH` / `DELETE /api/calificaciones/:id/comentario` |
| **Vigencia del comentario: 30 días** desde que se publicó (decisión del usuario, 24/11/2026). Al vencer deja de mostrarse y ya no se puede editar. Las estrellas siguen contando en el promedio. | Parámetro `vigencia_comentario_dias` = 30 en la tabla `parametro` |
| **Una calificación por viaje, evaluador y evaluado.** El conductor califica a sus pasajeros aceptados y el pasajero al conductor, solo en viajes finalizados. | Restricción `uq_calificacion` y trigger `trg_calificacion_validar` |
| **Recordatorio único**: se muestra una sola vez en cualquier dispositivo, se califique o no. | Tabla `recordatorio_calificacion` |
| **Reportes**: todos los campos son obligatorios y el motivo "Otro" exige especificarlo. Solo se puede reportar a alguien con quien se coincidió en un viaje, y una sola vez por persona y viaje. | API y índice `uq_reporte_por_viaje` |
| **Usuario recurrente**: el que tiene **más de cinco** reportes (6 o más). Se cuentan **todos** sus reportes históricos, incluidos los leídos y los atendidos. | `GET /api/admin/reportes/recurrentes` |
| **Filtros "Más recientes" y "Más antiguos"**: excluyen los reportes que ya están **leídos y atendidos** a la vez. "Leídos" y "No leídos" usan solo el estado de lectura. | `GET /api/admin/reportes?filter=` |
| **Ninguna cuenta se suspende automáticamente.** Suspender o reactivar es una acción manual del administrador. | `PATCH /api/admin/usuarios/:id` |
| **Panel de administración**: solo lo ve quien tiene `role === 'admin'`. La API exige el rol en cada ruta (responde 403 si no). | `requireRole('admin')` |

## Migración 015 (`backend/db/migrations/015_confianza_admin.sql`)

Solo **agrega**; no borra ni modifica datos existentes.

- `calificacion`: nuevas columnas `comentario_en`, `comentario_editado_en` y `comentario_eliminado_en`, más el trigger de inmutabilidad.
- Tabla nueva `recordatorio_calificacion`.
- `reporte`:
  - motivos nuevos: `incumplimiento_acuerdos`, `acoso` e `incumplimiento_normas`; los anteriores se conservan;
  - columnas nuevas `motivo_otro`, `leido_en` y `leido_por`.
- Tabla nueva `contacto_emergencia` (una por usuario).
- `notificacion`: tipos nuevos `documento_aprobado` y `documento_rechazado`.
- `parametro`: nueva clave `vigencia_comentario_dias` con valor 30.

## Endpoints nuevos

### Usuario (con sesión)

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/viajes/:id/participantes` | Contrapartes del viaje, indicando si ya se calificaron o reportaron |
| POST | `/api/calificaciones` | `{ tripId, ratedUserId, score, comment? }` → 201 |
| PATCH | `/api/calificaciones/:id/comentario` | `{ comment }`, solo el autor |
| DELETE | `/api/calificaciones/:id/comentario` | Solo el autor |
| GET | `/api/calificaciones/pendientes` | Recordatorio de calificar |
| POST | `/api/calificaciones/recordatorios/:viajeId` | Registra que el recordatorio ya se mostró |
| GET | `/api/me/calificaciones` | Calificaciones recibidas, con promedio y distribución |
| GET | `/api/me/calificaciones/dadas` | Calificaciones escritas por el usuario |
| POST | `/api/reportes` | `{ reportedUserId, tripId, reason, reasonOther?, description }` |
| GET / PUT / DELETE | `/api/me/contacto-emergencia` | Contacto de emergencia |
| GET | `/api/me/documentos` | Documentos del usuario y su revisión |
| POST | `/api/me/documentos` | Reenvío de un documento rechazado (multipart, campo `document`) |
| GET | `/api/archivos/documentos/:id?exp=&sig=` | Archivo, mediante una URL firmada que vence en 10 minutos |

### Administración (rol `admin`)

| Método | Ruta |
|---|---|
| GET | `/api/admin/resumen` |
| GET | `/api/admin/documentos?status=&type=&userId=&q=&from=&to=&order=&page=` |
| GET / PATCH | `/api/admin/documentos/:id` · `{ action: approve\|reject, reason? }` |
| GET | `/api/admin/reportes?filter=recent\|oldest\|read\|unread\|all&reportedUserId=&reason=&q=&page=` |
| GET | `/api/admin/reportes/recurrentes` |
| GET / PATCH | `/api/admin/reportes/:id` · `{ read?, status?, note? }` |
| GET | `/api/admin/usuarios?q=&status=&page=` |
| GET / PATCH | `/api/admin/usuarios/:id` · `{ action: suspend\|activate }` |
| GET | `/api/admin/usuarios/:id/calificaciones` |

## Frontend

**Pantallas nuevas**
- `MyRatingsScreen` (Mis calificaciones).
- `EmergencyContactScreen` (Contacto de emergencia).
- `MyDocumentsScreen` (Mis documentos).
- Panel de administración en `admin/`: `AdminPanelScreen`, `AdminDocumentsScreen`, `AdminReportsScreen` y `AdminUsersScreen`.

**Componentes nuevos** (`components/trust/`)
- `RateUserModal`, `ReportUserModal`, `TripPeopleSection` y `RatingReminderBanner`.
- Piezas compartidas en `ui.tsx`.

**Hook nuevo**
- `useLoader`: carga datos sin llamar `setState` de forma síncrona dentro de un efecto.

**Pantallas existentes modificadas**
- Inicio: recordatorio de calificar, sección "Mi cuenta y seguridad" y tarjeta del panel solo para administradores.
- Menú lateral.
- Detalle del viaje: sección de personas del viaje, para calificar y reportar.
- Solicitudes: opción "Reportar pasajero".
- Alertas: un aviso agrupado de documentos ahora lleva a "Mis documentos".

**Sesión en la web**
- El token se guarda en `localStorage` (`services/sessionStorage.ts`) y se valida con `GET /api/me` al abrir la app.
- Si la API responde 401 (sesión vencida o inválida), la app cierra la sesión.
- También se conserva la ruta del conductor.
- En Android e iOS la sesión sigue solo en memoria. Guardarla requeriría `expo-secure-store`, que no se instaló.

## Pruebas

**Backend**
- `npm test`: **138/138**.
- Nuevas: `test/unit/confianza.mapper.test.js` y `test/integracion/confianza-admin.test.js` (13 casos).

**Frontend**
- `npx tsc --noEmit` sin errores.
- ESLint sin errores en los archivos nuevos. Los avisos `react-hooks/set-state-in-effect` que quedan en `TripDetailScreen`, `DriverRequestsScreen` y `useNotifications` ya existían antes.

**Prueba en el navegador** (Chrome sin interfaz, contra la API y la base local de pruebas)
- La sesión se conserva al recargar.
- El panel no aparece para una usuaria normal.
- El recordatorio aparece una sola vez y la calificación se envía bien.
- El administrador rechaza un documento con comentario.
- Funcionan los reportes recurrentes, su historial y la acción de marcar como atendido.
- El usuario ve el rechazo y reenvía su documento.
- El contacto de emergencia valida el teléfono y se guarda.
- Se edita el comentario de una calificación.

## Pendientes

- Aplicar la migración 015 en producción con `ecoruta-desplegar --migrar`.
- Los tipos de documento siguen siendo `reticula_academica` y `carga_horaria`. Subir la tarjeta de circulación sería una función nueva; el frontend ya muestra cualquier tipo que envíe la API.
- Probar en Android: la ventana de calificar, el selector de documento y el reenvío con `XMLHttpRequest`.
