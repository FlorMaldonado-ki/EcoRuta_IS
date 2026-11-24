# Base de datos · EcoRuta Escolar

PostgreSQL en Neon, sin PostGIS ni extensiones (RNF-17). El esquema se construye
**solo** con las migraciones de esta carpeta; nadie crea ni altera tablas a mano.

## Estructura

```
backend/
├── db/
│   ├── migrate.js                        # ejecutor: up | status | seed
│   ├── migrations/
│   │   ├── 001_base.sql                  # trigger actualizado_en, fn_haversine_km
│   │   ├── 002_autenticacion_perfil.sql  # institucion, usuario, token_verificacion,
│   │   │                                 # documento_usuario, vehiculo
│   │   ├── 003_parametros.sql            # parametro
│   │   ├── 004_viajes.sql                # viaje + índices temporal y GiST
│   │   ├── 005_reservas.sql              # reserva + control de asientos
│   │   ├── 006_impacto.sql               # impacto_viaje + vistas de CO2
│   │   ├── 007_confianza.sql             # calificacion, reporte
│   │   └── 008_datos_referencia.sql      # institución, FE, puntos, carreras, departamentos
│   ├── build-neon-bundle.js            # genera neon/01_esquema.sql y 02_seed_demo.sql
│   ├── neon/                           # scripts para pegar en el SQL Editor de Neon
│   ├── queries/
│   │   └── buscar_viajes.sql             # consulta de RF-11 (referencia para el repository)
│   └── seeds/001_demo.sql                # datos demo (contraseña: Demo1234)
├── src/
│   ├── config/db.js                      # Pool de pg + conversión de tipos + withTransaction
│   └── modules/
│       ├── auth/usuario.mapper.js        # BD ⇄ JSON (registro, perfil)
│       └── viajes/viaje.mapper.js        # BD ⇄ JSON (viajes)
│   (contrato TS para el cliente: frontend/src/types/api.ts)
└── .env.example
```

Cada módulo de `src/modules` es dueño de las tablas de su migración y solo él
escribe SQL sobre ellas, en su `repository.js`. Los demás módulos llaman a su
`service` (monolito modular, RNF-15).

## Puesta en marcha

```bash
cp .env.example .env        # DATABASE_URL (pooled) y DATABASE_URL_DIRECT de TU rama de Neon
npm install
npm run db:migrate          # crea las 11 tablas
npm run db:seed             # datos demo (bloqueado si NODE_ENV=production)
npm run db:status
```

Usen una rama de Neon por integrante: `main` es la que usa Render y cada quien
tiene la suya (`dev-<nombre>`).

## Catálogo de vehículos

El registro de vehículos solo acepta combinaciones **tipo + marca + modelo + año**
que existan en `catalogo_vehiculo` (migración 013). La tabla se crea vacía; mientras
esté vacía, la app avisa que el catálogo no está disponible y no deja registrar.

Fuente: [NHTSA vPIC](https://vpic.nhtsa.dot.gov/api/), API pública y gratuita.
**No** está sincronizada con AUTOCOM ni con ningún distribuidor.

```bash
npm run db:catalogo-vehiculos > db/migrations/014_catalogo_vehiculos_vpic.sql
# revisa el archivo (marcas sin datos al inicio), commitéalo y:
npm run db:migrate && npm run db:bundle
```

- Tarda unos minutos; si vPIC responde 403 bloqueó la IP por exceso de peticiones:
  espera un rato y vuelve a correrlo.
- vPIC cubre el mercado de EE. UU. Los modelos que solo se venden en México no
  aparecen: agrégalos en una migración nueva con `fuente = 'manual'` tomando los
  datos de una fuente verificable (INEGI RAIAVL o la ficha del fabricante).
- Para actualizar el catálogo, genera otra migración (las filas usan
  `ON CONFLICT DO NOTHING`); para retirar un modelo, `activo = false`.

## Reglas para el equipo

1. **Una migración aplicada nunca se edita.** El ejecutor guarda un checksum y
   se detiene si el archivo cambió. Para corregir algo, crea `009_...sql`.
2. **Un cambio de esquema = un PR con su migración**, con la clave de Jira en la
   rama (`feature/ER-23-...`). El revisor cruzado lee el SQL antes que el código.
3. **Numeración:** `git pull origin develop` y toma el siguiente número libre.
4. **Render:** build command `npm install && npm run db:migrate`.
5. Datos que el sistema necesita → **migración**; datos de prueba → **seed**.
6. **Catálogos:** carreras y departamentos viven en `parametro`. Si cambian, se
   cambian ahí (nueva migración) y el frontend los obtiene de `GET /api/catalogos`.

## Tipos: lo que llega a JavaScript

| PostgreSQL         | node-pg (por defecto) | Con `src/config/db.js` | JSON / TS      |
|--------------------|-----------------------|------------------------|----------------|
| `UUID`             | string                | string                 | `string`       |
| `TIMESTAMPTZ`      | Date                  | Date                   | ISO-8601 `Z`   |
| `DOUBLE PRECISION` | number                | number                 | `number`       |
| `NUMERIC`          | **string**            | number                 | `number`       |
| `BIGINT` (count)   | **string**            | number                 | `number`       |
| `SMALLINT`/`INT`   | number                | number                 | `number`       |
| `JSONB`            | objeto                | objeto                 | objeto         |

## Errores de la BD → HTTP

Los triggers lanzan `check_violation` (SQLSTATE `23514`) con un mensaje que
empieza con un código en mayúsculas.

| Código / SQLSTATE                               | HTTP | Regla        |
|-------------------------------------------------|------|--------------|
| `DOMINIO_NO_PERMITIDO`                          | 422  | RN-01        |
| `CARRERA_INVALIDA`, `DEPARTAMENTO_INVALIDO`     | 422  | RF-01        |
| `DOCUMENTO_NO_CORRESPONDE`                      | 422  | registro     |
| `CONDUCTOR_NO_ACTIVO`, `PASAJERO_NO_ACTIVO`     | 403  | RN-02        |
| `ASIENTOS_EXCEDEN_CAPACIDAD`, `PUNTO_CAMPUS_INVALIDO`, `VEHICULO_INACTIVO` | 422 | RN-03, RN-11 |
| `RESERVA_PROPIA`                                | 422  | RN-05        |
| `VIAJE_NO_DISPONIBLE`, `SIN_ASIENTOS`           | 409  | RF-15, RNF-28|
| `NO_PARTICIPANTE`, `VIAJE_NO_FINALIZADO`        | 403/409 | RN-10, RN-07 |
| `23505` unique_violation (`uq_usuario_correo`)  | 409  | correo ya registrado |
| `23514` otro CHECK (`ck_*`)                     | 422  | bug de validación en la API: registrar |
| `22P02` texto no es UUID (`/viajes/123`)        | 404  | —            |

```js
// src/middlewares/errorHandler.js (esbozo)
if (err instanceof ValidationError) return res.status(422).json({ error: 'VALIDATION', fields: err.fields });
const codigo = /^([A-Z_]+):/.exec(err.message || '')?.[1];
if (err.code === '23514' && codigo) return res.status(MAPA[codigo] ?? 422).json({ error: codigo });
if (err.code === '23505') return res.status(409).json({ error: 'DUPLICADO', constraint: err.constraint });
if (err.code === '22P02') return res.status(404).json({ error: 'NO_ENCONTRADO' });
```

## Búsqueda de viajes (RF-11) sin PostGIS

`viaje.punto_busqueda` es una columna generada `point(lng, lat)` con el extremo
que **no** es el campus (RN-11 garantiza que un extremo siempre lo es). Tiene un
índice GiST parcial y se combina con el índice temporal `(sentido, salida_en)`.
La consulta completa está en `queries/buscar_viajes.sql`.

Probado con 20 000 viajes: con ventana de 4 h usa el índice temporal y, con
ventana de 30 días y radio de 1 km, el GiST. Ambas tardan < 1 ms.

## Aceptar una reserva (RF-16)

El trigger `trg_reserva_ajustar_asientos` descuenta el asiento en la misma
transacción; el endpoint solo cambia el estado:

```js
const { rows } = await pool.query(
  `UPDATE reserva r SET estado = 'aceptada', respondida_en = now()
     FROM viaje v
    WHERE r.id = $1 AND r.viaje_id = v.id
      AND v.conductor_id = $2          -- RNF-09: solo el dueño del viaje
      AND r.estado = 'solicitada'
   RETURNING r.*`,
  [reservaId, req.user.id],
);
```

## Lo que valida la API y no la BD

RN-04 (30 min de anticipación), RN-05 (traslape de horarios), RN-06
(cancelación tardía), caducidad de tokens, bloqueo por intentos (RNF-11),
transiciones de estado del viaje, contraseña ≥ 8 con letras y números (RNF-06)
y el tipo real del archivo subido (revisar los bytes, no solo el `mimeType`
que declara el cliente).

## Pendientes

- Confirmar la fuente oficial del factor de emisión (migración 008).
- Verificar en OpenStreetMap las coordenadas de los puntos del campus (008).
- Elegir proveedor de almacenamiento para `documento_usuario` (ver CAMBIOS-BD.md).
