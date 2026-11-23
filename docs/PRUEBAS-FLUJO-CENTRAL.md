# Pruebas del flujo central — Sprint 3

Flujo completo: **publicar → buscar → solicitar → aceptar → finalizar → ver CO₂** (Mi impacto y total de la comunidad).

Hay dos partes:

1. **Prueba automatizada** contra la API (`npm run test:flujo`).
2. **Pruebas manuales en Android** con dos teléfonos: recorrido del conductor (SCRUM-72) y del pasajero (SCRUM-73).

---

## 1. Prueba automatizada (`backend/scripts/flujo-central.js`)

> ⚠️ El script **crea datos** (un viaje, una reserva y su impacto de CO₂) y **cambia la hora de salida del viaje directamente en la base** para poder finalizarlo.
> Por eso **nunca** se corre contra la base de producción. Úsalo con una **rama de pruebas de Neon** o con un PostgreSQL local.

### Requisitos

- Una API levantada que apunte a la **misma** base de pruebas (`npm run dev` con el `.env` de pruebas).
- La base de pruebas con las migraciones 001–012 y el seed de demostración (`npm run db:seed`, **solo en la rama de pruebas**).
- Las cuentas de demostración `demo.ana` (conductora) y `demo.carla` (pasajera), con contraseña `Demo1234`. Se pueden cambiar con `FLUJO_CONDUCTOR_EMAIL`, `FLUJO_CONDUCTOR_PASS`, `FLUJO_PASAJERO_EMAIL` y `FLUJO_PASAJERO_PASS`.

### Cómo correrlo

```bash
cd backend
# 1) URL de la API de pruebas (por omisión http://localhost:3000)
export API_URL=http://localhost:3000
# 2) Cadena DIRECTA de la rama de pruebas de Neon (no la de producción)
export FLUJO_DATABASE_URL="postgresql://…rama-de-pruebas…"
# 3) La bandera obligatoria confirma que la base es de pruebas
npm run test:flujo -- --rama-de-pruebas
```

Si falta la bandera `--rama-de-pruebas` o `FLUJO_DATABASE_URL`, el script no hace nada y termina con código 2.

### Qué revisa (15 pasos)

| # | Paso | Requisito |
|---|------|-----------|
| 1 | La API y la base de datos están en línea | — |
| 2 | Inicio de sesión del conductor y del pasajero | RF-02 |
| 3 | El conductor tiene un vehículo activo (lo registra si no tiene) | RF-06 |
| 4 | Se guardan los totales iniciales (comunidad y pasajero) | — |
| 5 | Se publica un viaje hacia el campus con distancia estimada | RF-08, RF-10 |
| 6 | El pasajero encuentra el viaje en la búsqueda | RF-11 |
| 7 | El pasajero solicita un lugar | RF-15 |
| 8 | El conductor ve la solicitud y la acepta | RF-16 |
| 9 | Con un pasajero aceptado el viaje ya no se edita (409 `VIAJE_CON_RESERVAS`) | RF-13 |
| 10 | Antes de la salida no se puede finalizar (409 `VIAJE_AUN_NO_SALE`) | RF-19 |
| 11 | *(solo BD de pruebas)* La salida del viaje se mueve al pasado | — |
| 12 | El conductor finaliza el viaje y se registra el CO₂ = distancia × FE × pasajeros | RF-19, RF-21 |
| 13 | El Mi impacto del pasajero sube lo esperado | RF-23 |
| 14 | El total de la comunidad sube lo esperado | RF-24, RF-26 |
| 15 | El detalle del viaje finalizado muestra su CO₂ | RF-21 |

### Resultado de la ejecución

- **Fecha:** 23/11/2026.
- **Base:** PostgreSQL local de pruebas con las migraciones 001–012 y el seed de demostración (no Neon, no producción).
- **Resultado:** 15/15 pasos correctos.
- **Pruebas del backend** (`npm test`): 116/116 correctas, incluidas las nuevas de finalizar, CO₂, edición, correos y factor de emisión.

---

## 2. Pruebas manuales en Android

**Preparación**

- Dos teléfonos Android con la app (Expo Go o APK) apuntando al servidor de pruebas.
- Teléfono **A**: conductor, con vehículo y ruta guardada.
- Teléfono **B**: pasajero.
- Las dos cuentas con correo verificado y con un buzón que puedan revisar (para comprobar los correos de RF-30).

Anota **OK / Falla** y una observación en cada fila. Si algo falla, toma una captura de pantalla.

### SCRUM-72 · Recorrido del conductor (teléfono A)

| # | Acción | Resultado esperado | OK / Falla | Observaciones |
|---|--------|--------------------|------------|---------------|
| C1 | Publicar un viaje para dentro de ≥ 40 min | Se muestra "¡Viaje Registrado con Éxito!" con la distancia y la duración estimadas | | |
| C2 | Mis viajes → **Editar**; cambiar la hora, los asientos y las notas; **Guardar cambios** | "¡Cambios guardados!" y en el detalle se ven los datos nuevos | | |
| C3 | Editar sin cambiar nada → Guardar | Mensaje "No hiciste ningún cambio." | | |
| C4 | Poner más asientos que la capacidad del vehículo | Error en el campo de asientos y el viaje no cambia | | |
| C5 | Recibir la solicitud del pasajero (paso P3) | Aparece la notificación en la app y llega el correo "Nueva solicitud" | | |
| C6 | Aceptar la solicitud | Los asientos disponibles bajan en 1 y el pasajero recibe un correo | | |
| C7 | Intentar **Editar** con un pasajero aceptado | La app ofrece cancelar en lugar de editar | | |
| C8 | Antes de la hora de salida | El botón aparece deshabilitado con el texto "Finalizar desde las HH:MM" | | |
| C9 | Después de la hora de salida → **Finalizar viaje** → confirmar | Mensaje con los kg de CO₂ ahorrados; el viaje pasa a *Finalizados* con la insignia de CO₂ | | |
| C10 | Volver al inicio | La tarjeta de la comunidad y "Tú: … hoy · … en total" muestran los nuevos totales | | |
| C11 | Menú → **Mi Impacto (CO₂)** | Totales de hoy y acumulados, desglose como conductor y el viaje en la lista | | |
| C12 | Finalizar un viaje sin pasajeros aceptados | Se finaliza sin CO₂ y aparece la nota "sin pasajeros" | | |
| C13 | Cancelar un viaje con pasajeros | Los pasajeros reciben el correo de cancelación | | |

### SCRUM-73 · Recorrido del pasajero (teléfono B)

| # | Acción | Resultado esperado | OK / Falla | Observaciones |
|---|--------|--------------------|------------|---------------|
| P1 | Entrar con la cuenta del pasajero | Aparecen el inicio y la tarjeta de la comunidad | | |
| P2 | Buscar viajes hacia el campus | Aparece el viaje publicado en C1 (con los cambios de C2) | | |
| P3 | Abrir el detalle → Solicitar lugar en un punto de encuentro | Estado *Pendiente* y llega el correo de confirmación de la solicitud | | |
| P4 | Después de que se acepta (C6) | Notificación en la app y correo con el punto de encuentro y el teléfono del conductor | | |
| P5 | Después de que el conductor finaliza (C9) | En Mis viajes → historial, el viaje muestra "Este viaje ahorró X kg de CO₂" | | |
| P6 | Menú → **Mi Impacto (CO₂)** | Sube el total como pasajero y el viaje aparece en la lista | | |
| P7 | Cuenta sin viajes → Mi impacto | Estado vacío con el botón "Buscar un viaje" | | |
| P8 | Sin internet → abrir Mi impacto | Mensaje de error con el botón "Reintentar" | | |
| P9 | Cancelar una reserva aceptada a menos de 30 min de la salida | El conductor recibe un correo que la marca como tardía | | |

**Probado por:** ____________ **Fecha:** ____________ **Versión o commit:** ____________
