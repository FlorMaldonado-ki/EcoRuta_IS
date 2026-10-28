# EcoRuta Escolar · TecNM Campus Morelia

Plataforma de carpooling universitario. Monorepo con tres piezas conectadas:

```
EcoRuta_IS/
├── backend/     API REST · Node.js + Express (monolito modular) · se despliega en Render
│   └── db/      migraciones PostgreSQL · se despliegan en Neon
├── frontend/    App móvil · Expo + React Native + TypeScript
├── docs/        CAMBIOS-BD.md (auditoría del modelo de datos)
└── render.yaml  despliegue automático de la API
```

```
 App Expo ──HTTPS/JSON──▶ API Express (Render) ──SSL──▶ PostgreSQL (Neon)
 (frontend)  Bearer JWT    /api/auth, /api/me,           11 tablas, triggers,
                           /api/catalogos, /api/impacto  vistas de CO₂
                                │
                                ├──▶ Correo (SMTP)           verificación y recuperación
                                └──▶ Archivos (Cloudinary)   retícula / horario
```

**Qué funciona ya, de punta a punta:** registro con documento (RF-01, RF-07),
verificación por correo (RF-02), inicio y cierre de sesión con JWT y bloqueo
tras 5 intentos (RF-03, RNF-06, RNF-11), recuperación de contraseña (RF-04),
perfil (RF-05, por API), catálogos desde la BD y CO₂ de la comunidad en el
inicio (RF-24). Viajes, reservas, calificaciones y reportes ya tienen sus
tablas y reglas; sus endpoints son las siguientes tareas de Jira.

---

## 1. Base de datos en Neon (5 minutos)

1. Entra a <https://console.neon.tech> → **New Project**
   - Nombre: `ecoruta` · Postgres **16 o 17** · Región: **AWS US East 2 (Ohio)**.
2. **Dashboard → Connect**: copia dos cadenas de conexión:
   - con **Connection pooling activado** (host con `-pooler`) → `DATABASE_URL`
   - con **Connection pooling desactivado** → `DATABASE_URL_DIRECT`
3. Crea el esquema. Elige **una** de estas opciones:

   **Opción A: sin instalar nada (SQL Editor de Neon)**
   1. Neon → **SQL Editor** → pega todo `backend/db/neon/01_esquema.sql` → **Run**.
      Al final verás las 8 migraciones listadas.
   2. Solo en ramas de desarrollo: pega `backend/db/neon/02_seed_demo.sql` → **Run**.

   **Opción B: desde tu PC**
   ```bash
   cd backend
   copy .env.example .env      # (Windows)  ·  cp .env.example .env (Mac/Linux)
   # edita .env: DATABASE_URL, DATABASE_URL_DIRECT y JWT_SECRET
   npm install
   npm run db:migrate          # crea las 11 tablas (registra cada migración)
   npm run db:seed             # cuentas demo; contraseña: Demo1234
   ```

   Las dos opciones dejan la base en el mismo estado. Después de la A también
   funciona `npm run db:migrate` para las migraciones nuevas.

4. **Ramas por integrante (recomendado):** Neon → **Branches → Create branch**
   (`dev-diego`, `dev-flor`…). Cada quien usa las cadenas de su rama en su `.env`;
   la rama `main` es la de producción.

> Cuentas demo del seed: `demo.ana@morelia.tecnm.mx` (alumna, conductora),
> `demo.luis@…` (maestro), `demo.carla@…`, `demo.mario@…`, `demo.sofia@…`,
> `demo.admin@…` (administrador). Todas con la contraseña `Demo1234`.

---

## 2. API en tu PC

```bash
cd backend
npm install
npm run dev                  # http://localhost:3000  (se reinicia al guardar)
npm run test:smoke           # en otra terminal: 8 pruebas contra la API
```

Al arrancar debe decir `✔ Conectado a PostgreSQL (esquema presente)`.
Con `MAIL_DRIVER=console`, los correos (con su enlace de verificación) se
imprimen en la terminal: ábrelo en el navegador para activar la cuenta.

Para probar desde el **celular**, en `backend/.env` pon
`PUBLIC_API_URL=http://<IP-de-tu-PC>:3000`; si no, los enlaces del correo
apuntarán a `localhost`, que en el celular no existe. La IP la da `ipconfig`
(Dirección IPv4). Si Windows pregunta por el firewall, permite el acceso en
redes privadas.

---

## 3. App (Expo)

```bash
cd frontend
copy .env.example .env       # pon EXPO_PUBLIC_API_URL (ver comentarios del archivo)
npm install
npx expo start -c            # -c limpia la caché para que lea el .env
```

| Dónde corre la app        | `EXPO_PUBLIC_API_URL`                  |
|---------------------------|----------------------------------------|
| Celular con Expo Go       | `http://<IP de tu PC>:3000` (misma Wi-Fi) |
| Emulador de Android       | `http://10.0.2.2:3000`                 |
| Expo Web (misma PC)       | `http://localhost:3000`                |
| Contra Render             | `https://ecoruta-api.onrender.com`     |

En modo desarrollo, la pantalla de inicio de sesión tiene botones con las
cuentas demo.

---

## 4. Producción: API en Render

1. Sube el repositorio a GitHub.
2. <https://dashboard.render.com> → **New → Blueprint** → elige el repo. Render
   lee `render.yaml` y crea `ecoruta-api`.
3. Captura las variables que pide:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` / `DATABASE_URL_DIRECT` | Cadenas de la rama `main` de Neon (pooled / directa) |
   | `PUBLIC_API_URL` | `https://ecoruta-api.onrender.com` (la URL que te asigne Render) |
   | `MAIL_FROM`, `SMTP_*` | Gmail: `smtp.gmail.com`, 465, tu correo y una **contraseña de aplicación** (Cuenta de Google → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones) |
   | `CLOUDINARY_*` | <https://cloudinary.com> (gratis) → Settings → API Keys |

   `JWT_SECRET` se genera solo.
4. Cada push a la rama principal ejecuta `npm install && npm run db:migrate` y
   reinicia la API: **las migraciones nuevas se aplican solas en Neon**.
5. Comprueba: `npm run test:smoke -- https://ecoruta-api.onrender.com`

> El plan gratuito de Render duerme la API tras 15 min sin uso; la primera
> petición tarda ~50 s (la app espera hasta 60 s). Neon también suspende el
> cómputo y despierta en ~1 s.

---

## 5. Flujo de trabajo en equipo

- Ramas `feature/ER-<jira>-descripcion` → PR a `develop` → revisión cruzada → `main`.
- **Cambio de esquema = migración nueva** (`backend/db/migrations/009_...sql`).
  Nunca edites una ya aplicada; el ejecutor lo detecta por checksum.
  Después corre `npm run db:bundle` para regenerar los scripts de Neon.
- El contrato JSON vive en `frontend/src/types/api.ts` y lo producen los
  mappers de `backend/src/modules/*/*.mapper.js`. Si cambias uno, cambia el otro
  en el mismo PR.
- Más detalle de la base de datos: `backend/db/README.md` · Auditoría: `docs/CAMBIOS-BD.md`.

## Endpoints disponibles

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/health` | Estado de API + BD |
| GET | `/api/catalogos` | Carreras, departamentos, puntos del campus |
| POST | `/api/auth/register` | Registro (multipart con `document`) |
| GET | `/api/auth/verify-email?token=` | Página que abre el enlace del correo |
| POST | `/api/auth/resend-verification` | `{ email }` |
| POST | `/api/auth/login` | `{ email, password }` → `{ token, user }` |
| POST | `/api/auth/forgot-password` | `{ email }` |
| GET/POST | `/api/auth/reset-password` | Formulario del enlace / `{ token, password, confirmPassword }` |
| GET/PATCH | `/api/me` | Perfil propio (requiere `Authorization: Bearer`) |
| GET | `/api/impacto/comunidad` | CO₂ total (RF-24) |
| GET | `/api/impacto/me` | CO₂ del usuario (RF-23) |

## Pendientes

- Confirmar la fuente del factor de emisión y las coordenadas de los puntos del campus (migración 008).
- Persistir la sesión en el celular con `npx expo install expo-secure-store`
  (hoy vive en memoria y se pierde al cerrar la app).
- Panel de administración para revisar documentos (RF-29).
