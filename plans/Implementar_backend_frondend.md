# Plan 01 — Implementación inicial: Backend + Frontend

**Fecha:** 2026-05-27
**Estado:** Completado ✅

---

## Objetivo

Tener el repositorio GitHub inicializado, el backend deployado en Coolify y el frontend con scaffold completo visible en producción en `https://gestion-danos.odoo-server.online`.

---

## Contexto previo al inicio

- El proyecto tenía los archivos `CLAUDE.md`, `ClaudeMant.md`, `README.md` y el backend escrito en `/backend/index.js` + `package.json`, pero **no había git inicializado**.
- En Coolify ya existía el servicio `pass-danos-backend` creado pero sin código deployado (fallaba por Nixpacks).
- El frontend estaba vacío (solo `.gitkeep`).
- El repo GitHub `odoo-solutionsgt-publitag/pass-danos.git` existía pero solo tenía un `README.md` inicial.

---

## Lo que se hizo

### 1. Inicialización de Git

```bash
git init
git config user.name "Pass Rent a Car"
git config user.email "dev@passrentacar.com"
git remote add origin https://github.com/odoo-solutionsgt-publitag/pass-danos.git
git fetch origin
git reset --mixed origin/main
git branch -m master main
```

Se conectó el repo local al remoto existente y se sincronizó sin perder los archivos locales.

---

### 2. Push del backend (commit 1)

**Archivos incluidos:**
- `.gitignore`
- `README.md` (actualizado)
- `CLAUDE.md` — documentación completa de arquitectura, DB, API y frontend
- `ClaudeMant.md` — módulo de servicios de mantenimiento
- `002_servicios_mantenimiento.sql` — migration SQL para el módulo de servicios
- `backend/index.js` — Express + XML-RPC proxy a Odoo 19
- `backend/package.json`
- `frontend/.gitkeep`

**Problema que resolvió:** Coolify fallaba con "Nixpacks failed to detect the application type" porque el repo remoto no tenía el `package.json` del backend.

---

### 3. Scaffold completo del frontend (commit 2)

**Stack:** React 19 + Vite 6 + Tailwind CSS 4 (`@tailwindcss/vite`) + React Router 7 + Lucide React + Supabase JS

**Archivos creados en `/frontend/`:**

| Archivo | Descripción |
|---------|-------------|
| `package.json` | Dependencias del frontend |
| `vite.config.js` | Vite 6 con plugin Tailwind 4 y preview en 0.0.0.0:5173 |
| `index.html` | Entry point HTML |
| `src/main.jsx` | Bootstrap de React |
| `src/index.css` | Tailwind 4 import + base styles |
| `src/App.jsx` | Router completo con todas las rutas |
| `src/lib/supabase.js` | Cliente Supabase con anon key |
| `src/lib/odoo-api.js` | Fetch wrapper al backend Express |
| `src/hooks/useAuth.js` | Hook auth: session, perfil, signIn, signOut |
| `src/components/ProtectedRoute.jsx` | Redirect a login si no hay sesión |
| `src/components/Layout.jsx` | Shell: Sidebar + Header + Outlet |
| `src/components/Sidebar.jsx` | Navegación lateral con NavLink activos |

**Páginas funcionales implementadas:**

| Página | Funcionalidad |
|--------|--------------|
| `Login.jsx` | Email + password con Supabase Auth, manejo de errores |
| `Dashboard.jsx` | 5 KPI cards + tabla últimos siniestros + feed de actividad reciente |
| `Siniestros.jsx` | Lista con filtros (búsqueda, estado, severidad), badges de color |
| `SiniestroNuevo.jsx` | Wizard 3 pasos: Vehículo (desde Odoo API) → Cliente → Daño |
| `SiniestroDetalle.jsx` | Header con estado, transiciones de estado, PATCH Odoo, timeline |
| `Servicios.jsx` | Lista órdenes de mantenimiento con filtros |
| `FlotaVehicular.jsx` | Kanban agrupado por status desde Odoo API |

**Páginas stub (esqueleto para desarrollo futuro):**
- `Proformas.jsx`
- `ServicioNuevo.jsx`
- `ServicioDetalle.jsx`
- `Catalogos.jsx`
- `Repositorio.jsx`
- `Reportes.jsx`

---

### 4. Resolución de errores de Coolify (commits 3 y 4)

#### Error 1: Bad Gateway
**Causa:** `vite preview` sin `--host 0.0.0.0` arranca en `localhost:4173`. Traefik no puede alcanzar `localhost` dentro del contenedor.

**Fix:** `frontend/package.json`
```json
"preview": "vite preview --host 0.0.0.0 --port 5173"
```

**Fix adicional:** `frontend/nixpacks.toml`
```toml
[phases.build]
cmds = ["npm run build"]

[start]
cmd = "npm run preview"
```

**Fix en Coolify:** "Ports Exposes" cambiado de `80` → `5173`.

#### Error 2: Blocked request
**Causa:** Vite 6 bloquea por defecto hosts externos no autorizados.

**Fix:** `frontend/vite.config.js`
```js
preview: {
  host: '0.0.0.0',
  port: 5173,
  allowedHosts: ['gestion-danos.odoo-server.online'],
},
```

---

## Configuración final en Coolify

### `pass-danos-backend`
| Campo | Valor |
|-------|-------|
| Repo | `odoo-solutionsgt-publitag/pass-danos` |
| Branch | `main` |
| Base Directory | `/backend` |
| Build Pack | Nixpacks |
| Port | `3000` |
| Dominio | `https://api-danos.odoo-server.online` |

**Variables de entorno requeridas:**
```
PORT=3000
NODE_ENV=production
TZ=America/Guatemala
CORS_ORIGIN=https://gestion-danos.odoo-server.online
ODOO_URL=https://odoo-server.online
ODOO_DB=odoo19server
ODOO_API_USER=<usuario API Odoo>
ODOO_API_PASSWORD=<API key Odoo>
SUPABASE_URL=https://cxoqviwdryvjahykazpb.supabase.co
SUPABASE_SERVICE_KEY=<service_role key>
```

### `pass-danos-frontend`
| Campo | Valor |
|-------|-------|
| Repo | `odoo-solutionsgt-publitag/pass-danos` |
| Branch | `main` |
| Base Directory | `/frontend` |
| Build Pack | Nixpacks |
| Port (Ports Exposes) | `5173` |
| Dominio | `https://gestion-danos.odoo-server.online` |

**Variables de entorno requeridas:**
```
VITE_SUPABASE_URL=https://cxoqviwdryvjahykazpb.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_API_URL=https://api-danos.odoo-server.online
```

---

## Estado final

| Componente | Estado |
|-----------|--------|
| Repo GitHub | ✅ Inicializado con 4 commits |
| Backend Coolify | ✅ Deployado (pendiente validar /health con env vars) |
| Frontend Coolify | ✅ Running — pantalla de login visible |
| Login screen | ✅ Cargando en producción |

---

## Commits realizados

| Commit | Descripción |
|--------|-------------|
| `67eb47a` | feat: setup inicial — backend completo + documentación |
| `2c035b9` | feat: scaffold completo del frontend |
| `16bbc79` | fix: frontend preview en 0.0.0.0:5173 + nixpacks.toml |
| `7da9cc1` | fix: agregar allowedHosts para gestion-danos.odoo-server.online |

---

## Próximos pasos

1. **Configurar variables de entorno** en ambos servicios de Coolify y validar `/health` del backend
2. **Crear usuarios** en Supabase Auth + tabla `perfiles` con rol `admin`
3. **Implementar módulo de Cotizaciones / Proformas** (página stub actualmente)
4. **Implementar módulo de Catálogos** — CRUD de talleres y repuestos
5. **Implementar módulo de Repositorio** — upload de documentos a Supabase Storage
6. **Implementar módulo de Reportes** — KPIs y gráficas
7. **Implementar ServicioNuevo y ServicioDetalle** — módulo de mantenimiento completo
