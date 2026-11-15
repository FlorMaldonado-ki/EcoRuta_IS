# API del Sprint 2 · Vehículos, perfil, viajes y reservas

Endpoints nuevos del backend para las pantallas del Sprint 2. Todos requieren
`Authorization: Bearer <token>`. Los errores siempre llegan como
`{ error, message, fields? }`; `fields` usa las mismas claves que el formulario,
así la pantalla puede hacer `setErrors(err.fields)`. Los tipos de TypeScript
de estos endpoints están en `frontend/src/types/apiBackend.ts`.

## Al conectar las pantallas a la API

Las pantallas del Sprint 2 hoy guardan los datos en el teléfono (`services/tripStorage.ts`)
con los tipos de `types/api.ts`. Al cambiarlas a la API hay que adaptar:

| Dato | La API usa | `types/api.ts` hoy |
|------|-----------|--------------------|
| Estado de reserva | `requested` · `accepted` · `rejected` · `cancelled` | `solicitada` · `aceptada` · … |
| Declaración del vehículo | `licenseAndInsuranceDeclared` | `declarationLicenseInsurance` |
| Puntos de encuentro | uno por viaje, en `notes` | varios, en `meetingPoints` |
| Reserva del usuario en un viaje | `myReservation: { id, status, … }` | `userReservationStatus` + `userReservationId` |
| Puntos del campus | `campus_1` · `campus_2` · `metalurgia` (migración 009, iguales a `CAMPUS_REFERENCE_POINTS`) | iguales ✔ |

Los puntos del campus conviene leerlos de `GET /api/catalogos` → `campusPoints` para que no se desincronicen.

| Jira | Endpoint | Para qué |
|------|----------|----------|
| SCRUM-28 | `POST /api/vehiculos` · `GET /api/me/vehiculos` · `GET/PATCH/DELETE /api/vehiculos/:id` | Mis vehículos |
| SCRUM-45 | `GET /api/me` · `PATCH /api/me` | Mi perfil |
| SCRUM-30 | `POST /api/viajes` | Publicar viaje |
| SCRUM-34 | `GET /api/viajes?direction=…` | Buscar viajes |
| SCRUM-32 | `GET /api/viajes/:id` | Detalle del viaje |
| SCRUM-23 | `POST /api/viajes/:id/cancelar` | Cancelar viaje (conductor) |
| SCRUM-35 | `POST /api/viajes/:id/reservas` | Unirse a la ruta |
| SCRUM-37 | `GET /api/viajes/:id/reservas` · `PATCH /api/reservas/:id` | Solicitudes: aceptar / rechazar |
| SCRUM-41 | `GET /api/me/viajes?role=…&status=…` | Mis viajes |
| SCRUM-44 | `POST /api/reservas/:id/cancelar` | Cancelar mi lugar (pasajero) |

## Vehículos (RF-06)

```jsonc
// POST /api/vehiculos → 201 VehicleDTO (200 si reactiva unas placas que habías desactivado)
{ "brand": "Nissan", "model": "Versa", "color": "Gris", "plates": "ptx-1234", "capacity": 5,
  "licenseAndInsuranceDeclared": true }
```

- `plates` se normaliza: mayúsculas, sin espacios ni guiones (`PTX1234`).
- `capacity` incluye al conductor (2 a 9); `maxSeats` = `capacity − 1` es lo máximo que puede ofrecer al publicar.
- Sin `licenseAndInsuranceDeclared: true` → 422 en ese campo. Placas repetidas → 409 `PLACAS_REGISTRADAS`.
- `PATCH` acepta cualquier subconjunto de los campos. `DELETE` desactiva (no borra); 409 `VEHICULO_CON_VIAJES` si tiene viajes publicados.
- `GET /api/me/vehiculos` devuelve solo los activos; `?includeInactive=true` devuelve todos.
- Vehículo de otra persona → 404.

## Perfil (RF-05)

`PATCH /api/me` solo cambia `fullName`, `phone`, `career` (alumno) y `department` (maestro).
Cualquier otro campo (`email`, `userType`, `status`, `role`…) se ignora.
`phone` acepta `443 123 4567`, `+52…` o guiones; `""` o `null` lo borra; si no son 10 dígitos → 422.

## Publicar viaje (RF-08, RF-10)

```jsonc
// POST /api/viajes → 201 TripDTO
{
  "vehicleId": "uuid",
  "direction": "to_campus",                 // o "from_campus"
  "campusPoint": "campus_1",               // campus_1 | campus_2 | metalurgia (GET /api/catalogos → campusPoints)
  "origin": { "text": "Plaza Las Américas", "lat": 19.7039, "lng": -101.1924 },  // to_campus: manda origin
  // "destination": { … }                   // from_campus: manda destination
  "departureAt": "2026-11-12T13:30:00.000Z",
  "seats": 3,
  "notes": "Llevar credencial",            // opcional, indicaciones (≤ 300)
  "meetingPoints": [                        // opcional, máx. 8; se devuelven como p1, p2…
    { "name": "Acceso Liverpool", "description": "Bahía de descenso", "lat": 19.7039, "lng": -101.1924 }
  ]
}
```

- El extremo del campus **lo pone la API** con el punto de `campusPoint`; solo se manda el otro lugar.
- Salida con al menos 30 min de anticipación (RN-04) y como máximo 60 días después.
- `seats` ≤ `maxSeats` del vehículo; lugares fuera de Morelia → 422 por campo.
- La API calcula `distanceKm`, `durationMin` y `distanceSource` (`osrm`, o `haversine` si OSRM no responde).

## Buscar viajes (RF-11)

`GET /api/viajes?direction=to_campus&date=2026-11-12&timeFrom=07:00&timeTo=09:00&lat=19.70&lng=-101.19&radiusKm=3&page=1`

| Parámetro | Obligatorio | Valores |
|-----------|-------------|---------|
| `direction` | sí | `to_campus` · `from_campus` |
| `date` | no (hoy) | `AAAA-MM-DD`, hora local de Morelia, de hoy a 60 días |
| `timeFrom` / `timeTo` | no (`00:00` / `23:59`) | `HH:MM` |
| `lat` + `lng` | no | ubicación del pasajero; sin ellas solo se ordena por hora |
| `radiusKm` | no (5) | 0.5 a 15 |
| `page` | no (1) | páginas de 20 |

Respuesta: `{ items: TripDTO[], page, pageSize: 20, hasMore }`. Solo viajes publicados, futuros y con
asientos, ordenados por hora y cercanía, sin los viajes propios. Con ubicación, cada viaje trae
`distanceFromYouKm`. Si ya solicitaste lugar, el viaje trae `myReservation`.

## Detalle de viaje (RF-12)

`GET /api/viajes/:id` → `TripDTO` con `driver`, `vehicle`, `myReservation` e `isMine`.

- `driver.phone` y `vehicle.plates` **solo** si eres el conductor o tienes la reserva aceptada (RNF-12).
- Si eres el conductor, además `pendingRequests` y `acceptedPassengers`.
- Un viaje cancelado o finalizado solo lo ven su conductor y quien tuvo reserva; si no, 404.

## Cancelar viaje (RF-13 parcial)

`POST /api/viajes/:id/cancelar` → `{ trip, cancelledReservations }`. Todas las reservas vigentes pasan a
`cancelled` y el viaje deja de aparecer en la búsqueda. No soy el conductor → 403; ya finalizado → 409
`VIAJE_FINALIZADO`; ya cancelado → 409 `VIAJE_YA_CANCELADO`.

## Reservas (RF-15 a RF-17)

`ReservationDTO`: `{ id, tripId, status, createdAt, respondedAt, cancelledAt, lateCancellation, passenger?, trip? }`,
con `status` `requested` · `accepted` · `rejected` · `cancelled`.

| Acción | Endpoint | Errores |
|--------|----------|---------|
| Solicitar lugar | `POST /api/viajes/:id/reservas` `{ meetingPoint }` → 201 (obligatorio si el viaje tiene puntos: `{ "pointId": "p2" }` o `{ "lat", "lng", "name"?, "note"? }`) | 422 `RESERVA_PROPIA` · 409 `VIAJE_NO_DISPONIBLE`, `SIN_ASIENTOS`, `RESERVA_DUPLICADA`, `RESERVA_TRASLAPADA` (otro viaje a ±60 min) · 403 `PASAJERO_NO_ACTIVO` |
| Ver solicitudes (conductor) | `GET /api/viajes/:id/reservas` (`?status=requested`) | No es tu viaje → 404 |
| Aceptar / rechazar | `PATCH /api/reservas/:id` `{ "action": "accept" }` o `"reject"` | 409 `SIN_ASIENTOS`, `RESERVA_YA_RESPONDIDA`, `VIAJE_NO_DISPONIBLE` · ajena → 404 |
| Cancelar mi lugar | `POST /api/reservas/:id/cancelar` | 409 `RESERVA_NO_CANCELABLE`, `VIAJE_YA_SALIO` · ajena → 404 |

- Al aceptar, el viaje pierde un asiento; la respuesta trae `trip.seatsAvailable`. Dos aceptaciones
  simultáneas del último lugar nunca sobrevenden: una recibe 409 `SIN_ASIENTOS`.
- En la lista del conductor, `passenger.phone` aparece solo cuando la reserva está aceptada.
- Cancelar responde además `previousStatus` y un `message` para mostrar. `lateCancellation: true` si la
  reserva estaba aceptada y faltaban menos de 20 min (RN-06); el asiento se libera.

## Mis viajes (RF-18)

`GET /api/me/viajes?role=driver|passenger&status=upcoming|in_progress|history&page=1`
→ `{ items: TripDTO[], page, pageSize, hasMore, role, status }`

- **Conductor:** mis viajes con `pendingRequests` y `acceptedPassengers`. `upcoming` = publicado y futuro;
  `in_progress` = en curso; `history` = finalizado, cancelado o con la hora ya pasada.
- **Pasajero:** viajes donde tengo reserva, con `myReservation`. `upcoming` e `in_progress` solo con reserva
  vigente; lo rechazado o cancelado va a `history`.

## Notificaciones en la app

Migración `010_notificaciones.sql` (tabla `notificacion`, se conservan 72 h). Las genera el backend
después de cada acción; nunca hacen fallar la acción del usuario.

| Acción | Quién recibe el aviso | `type` | `critical` |
|--------|----------------------|--------|-----------|
| Pasajero solicita lugar | Conductor | `solicitud_recibida` | no |
| Conductor acepta | Pasajero | `solicitud_aceptada` | no |
| Conductor rechaza | Pasajero | `solicitud_rechazada` | sí |
| Pasajero retira una solicitud pendiente | Conductor | `solicitud_cancelada` | sí |
| Pasajero cancela un lugar aceptado (marca si fue tardía, RN-06) | Conductor | `lugar_cancelado` | sí |
| Conductor cancela el viaje | Cada pasajero con reserva vigente | `viaje_cancelado` | sí |

| Endpoint | Respuesta |
|----------|-----------|
| `GET /api/me/notificaciones` | `{ items: NotificationDTO[], unread, summary: { newTrips, pendingRequests } }` (últimas 72 h, máx. 50) |
| `PATCH /api/me/notificaciones/:id/leida` | `NotificationDTO` (ajena → 404) |
| `POST /api/me/notificaciones/leer-todas` | body opcional `{ types: [...] }` para marcar solo una sección → `{ unread }` |
| `POST /api/me/notificaciones/viajes-vistos` | Abrí la búsqueda: reinicia `newTrips` → `{ newTrips: 0 }` |

`summary` alimenta las insignias del panel principal (migración `011_notificacion_marcas.sql`):
`newTrips` = viajes publicados por otros (futuros, con asientos, sin reserva mía) desde mi última visita a la
búsqueda (o en las últimas 24 h si nunca la abrí); `pendingRequests` = solicitudes sin responder en mis viajes.

`NotificationDTO`: `{ id, type, title, message, critical, read, createdAt, tripId, reservationId }`.
La app consulta la bandeja cada 15 s y muestra los avisos nuevos como alerta; los `critical` en rojo,
con vibración y sin cerrarse solos.

## Puntos de encuentro y lista de espera (migración 012)

- `TripDTO.meetingPoints`: `[{ id, name, description, lat, lng, order }]` (los marcados por el conductor).
- `ReservationDTO.meetingPoint` y `myReservation.meetingPoint`:
  `{ type: 'driver' | 'proposed', pointId, name, lat, lng, note }` — dónde se une el pasajero.
- **Lista de espera:** si el viaje se llena con solicitudes pendientes, siguen `requested` y cada pasajero
  recibe `viaje_lleno`. Esa solicitud **no** bloquea pedir otro viaje a ±60 min (RN-05). Si un pasajero con
  lugar cancela, los que esperan reciben `lugar_liberado` y el conductor puede aceptarlos.
- Al aceptar a un pasajero, sus otras solicitudes pendientes a ±60 min se cancelan solas (el otro conductor
  recibe `solicitud_cancelada`). Aceptar a alguien que ya tiene otro viaje confirmado a esa hora → 409
  `RESERVA_TRASLAPADA`.
