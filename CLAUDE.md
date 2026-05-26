# CLAUDE.md — Pass Daños: Gestión de Daños Vehiculares

## Proyecto

Sistema web externo para gestionar siniestros (daños) en los vehículos de la flota de **Pass Rent a Car Guatemala** (Gold Travel Corps, S.A.). La app reemplaza 4 archivos Excel que hoy se mantienen manualmente: bitácora de daños, reporte diario, presupuestos por taller (46 hojas) y reporte de taller mensual.

La app NO vive dentro de Odoo. Es una aplicación React independiente que se comunica con Odoo 19 Enterprise via un backend Node.js proxy (XML-RPC). Los datos propios de la app (siniestros, cotizaciones, cobros, documentos) viven en Supabase.

---

## Arquitectura

```
┌─────────────────────────────┐     ┌────────────────────────────┐
│   pass-danos-frontend       │     │   pass-danos-backend       │
│   React + Vite + Tailwind   │────▶│   Express + XML-RPC        │
│   gestion-danos.odoo-       │     │   api-danos.odoo-          │
│   server.online             │     │   server.online:3000       │
└──────────┬──────────────────┘     └──────────┬─────────────────┘
           │                                   │
           │ Supabase JS SDK                   │ XML-RPC
           ▼                                   ▼
┌──────────────────────┐          ┌──────────────────────────────┐
│  Supabase            │          │  Odoo 19 Enterprise          │
│  Odoo Gestion Danos  │          │  odoo-server.online          │
│  cxoqviwdryvjahykazpb│          │  odoo19.odoo-server.online   │
│  PostgreSQL + Storage│          │  VPS Contabo 157.173.197.128 │
└──────────────────────┘          └──────────────────────────────┘
```

### Monorepo

```
pass-danos/
├── CLAUDE.md              ← Este archivo
├── README.md
├── .gitignore
├── backend/
│   ├── package.json
│   └── index.js           ← Express server con Odoo XML-RPC proxy
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── index.html
    ├── public/
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── lib/
        │   ├── supabase.js       ← createClient con anon key
        │   └── odoo-api.js       ← fetch wrapper al backend
        ├── hooks/
        │   └── useAuth.js
        ├── components/
        │   ├── Layout.jsx         ← Sidebar + header + outlet
        │   ├── Sidebar.jsx
        │   └── ProtectedRoute.jsx
        └── pages/
            ├── Login.jsx
            ├── Dashboard.jsx
            ├── Siniestros.jsx
            ├── SiniestroDetalle.jsx
            ├── SiniestroNuevo.jsx
            ├── Cotizaciones.jsx
            ├── Proformas.jsx
            ├── FlotaVehicular.jsx
            ├── Catalogos.jsx
            ├── Repositorio.jsx
            └── Reportes.jsx
```

### Patrón de referencia

Este proyecto sigue exactamente el patrón de `pass-ficha-digital`:
- Mismo VPS Contabo, misma instancia Coolify v4
- Deploy Key SSH (Private Repository) por app en Coolify
- Backend en `/backend` con Base Directory en Coolify
- Frontend en `/frontend` con Base Directory en Coolify
- Build Pack: Nixpacks

---

## Stack tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Frontend | React | 19 |
| Bundler | Vite | 6.x |
| CSS | Tailwind CSS | 4.x |
| Router | React Router | 7.x |
| Icons | Lucide React | latest |
| Backend | Node.js + Express | 18+ / 4.21 |
| XML-RPC | xmlrpc (npm) | 1.3.2 |
| Base de datos | Supabase (PostgreSQL) | — |
| Auth | Supabase Auth | email+password |
| Storage | Supabase Storage | bucket "documentos" |
| ERP | Odoo 19 Enterprise | — |
| Hosting | Coolify v4 (Docker) | Contabo VPS |
| Automations | n8n | ya desplegado |

---

## Infraestructura (ya configurado)

### Coolify apps

| App | Dominio | Base Dir | Port |
|-----|---------|----------|------|
| `pass-danos-backend` | `https://api-danos.odoo-server.online` | `/backend` | 3000 |
| `pass-danos-frontend` | `https://gestion-danos.odoo-server.online` | `/frontend` | 5173 |

### Supabase

- **Proyecto**: Odoo Gestion Danos
- **Ref**: `cxoqviwdryvjahykazpb`
- **URL**: `https://cxoqviwdryvjahykazpb.supabase.co`
- **Region**: us-west-2
- **Plan**: NANO

### Variables de entorno — Backend

```env
PORT=3000
NODE_ENV=production
TZ=America/Guatemala
CORS_ORIGIN=https://gestion-danos.odoo-server.online
ODOO_URL=https://odoo-server.online
ODOO_DB=odoo19server
ODOO_API_USER=<usuario API de Odoo>
ODOO_API_PASSWORD=<API key de Odoo>
SUPABASE_URL=https://cxoqviwdryvjahykazpb.supabase.co
SUPABASE_SERVICE_KEY=<service_role secret key>
```

### Variables de entorno — Frontend

```env
VITE_SUPABASE_URL=https://cxoqviwdryvjahykazpb.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable anon key>
VITE_API_URL=https://api-danos.odoo-server.online
```

---

## Base de datos Supabase (ya creada)

### Enums

```sql
estado_siniestro: registrado | cotizando | proforma_emitida | proforma_aprobada | en_reparacion | reparado | en_cobro | cerrado | anulado
severidad_dano: leve | medio | severo | perdida_total
tipo_dano: choque_frontal | choque_trasero | choque_lateral | rayon | abollon | vidrio | llanta | mecanico | multiple | otro
estado_cotizacion: solicitada | recibida | aprobada | rechazada
tipo_linea_cotizacion: repuesto | mano_obra | otro
estado_cobro: pendiente | informado | facturado | pagado | absorbe_pass | seguro
tipo_documento: cotizacion_pdf | proforma_pdf | foto_dano | factura | comprobante_pago | avaluo | otro
```

### Tablas

#### `talleres` — Catálogo de proveedores de servicio automotriz
```
id              UUID PK
nombre          TEXT NOT NULL
contacto        TEXT
telefono        TEXT
direccion       TEXT
notas           TEXT
activo          BOOLEAN DEFAULT TRUE
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```
Seed data: COFIÑO/CAES, REASA, TRS, AUTO SERVICIO, AUTO LUB, GRUPO Q, Skipy, Polarizado Express, Vidrios Outlet GT.

#### `repuestos_catalogo` — Catálogo de repuestos con precio referencia
```
id                      UUID PK
codigo                  TEXT UNIQUE NOT NULL (ej: REP-001)
nombre                  TEXT NOT NULL
marca                   TEXT
linea_modelo            TEXT
anios                   TEXT
precio_ref              NUMERIC(12,2)
precio_actualizado_at   TIMESTAMPTZ
activo                  BOOLEAN
created_at              TIMESTAMPTZ
updated_at              TIMESTAMPTZ
```

#### `siniestros` — Tabla principal de daños vehiculares
```
id                UUID PK
numero            TEXT UNIQUE NOT NULL (auto: SIN-2026-001, SIN-2026-002...)

-- Datos del vehículo (desde Odoo via API)
placa             TEXT NOT NULL
tipo_vehiculo     TEXT
marca             TEXT
linea             TEXT
anio              INTEGER
odoo_product_id   INTEGER          ← ID del product.template en Odoo

-- Datos del contrato/cliente (desde Odoo via API)
contrato_id       INTEGER          ← ID del sale.order en Odoo
contrato_numero   TEXT
cliente_nombre    TEXT NOT NULL
cliente_dpi       TEXT
cliente_telefono  TEXT
cliente_email     TEXT

-- Datos del daño
fecha_dano        DATE NOT NULL
lugar_accidente   TEXT
tipo_dano         tipo_dano NOT NULL DEFAULT 'otro'
severidad         severidad_dano NOT NULL DEFAULT 'leve'
descripcion       TEXT

-- Estado y flujo
estado            estado_siniestro NOT NULL DEFAULT 'registrado'

-- Montos consolidados
monto_cliente     NUMERIC(12,2) DEFAULT 0
costo_pass        NUMERIC(12,2) DEFAULT 0
margen            NUMERIC(12,2) DEFAULT 0     ← monto_cliente - costo_pass

-- Taller asignado (se llena al aprobar cotización)
taller_id         UUID FK → talleres

-- Metadata
registrado_por    UUID FK → auth.users
created_at        TIMESTAMPTZ
updated_at        TIMESTAMPTZ
```

**Trigger**: `trg_numero_siniestro` genera `numero` automáticamente (SIN-YYYY-NNN).
**Trigger**: `trg_siniestro_estado_timeline` registra cada cambio de estado en `siniestro_timeline`.

#### `cotizaciones` — 1-3 cotizaciones de talleres por siniestro
```
id                UUID PK
siniestro_id      UUID FK → siniestros ON DELETE CASCADE
taller_id         UUID FK → talleres

estado            estado_cotizacion DEFAULT 'solicitada'
fecha_solicitud   DATE
fecha_recepcion   DATE

total_repuestos   NUMERIC(12,2) DEFAULT 0     ← calculado por trigger
total_mano_obra   NUMERIC(12,2) DEFAULT 0     ← calculado por trigger
total_otros       NUMERIC(12,2) DEFAULT 0     ← calculado por trigger
total_general     NUMERIC(12,2) DEFAULT 0     ← calculado por trigger

notas             TEXT
created_at        TIMESTAMPTZ
updated_at        TIMESTAMPTZ
```

#### `cotizacion_lineas` — Detalle de cada cotización
```
id                UUID PK
cotizacion_id     UUID FK → cotizaciones ON DELETE CASCADE

tipo              tipo_linea_cotizacion DEFAULT 'repuesto'
descripcion       TEXT NOT NULL
repuesto_id       UUID FK → repuestos_catalogo (opcional)
cantidad          NUMERIC(10,2) DEFAULT 1
precio_unitario   NUMERIC(12,2) DEFAULT 0
subtotal          NUMERIC(12,2) DEFAULT 0

created_at        TIMESTAMPTZ
```

**Trigger**: `trg_cotizacion_totales` recalcula los totales de la cotización padre al INSERT/UPDATE/DELETE en lineas.

#### `taller_ingresos` — Tracking de vehículos en taller
```
id                UUID PK
siniestro_id      UUID FK → siniestros ON DELETE CASCADE
taller_id         UUID FK → talleres

fecha_ingreso     DATE NOT NULL DEFAULT CURRENT_DATE
fecha_egreso      DATE (NULL si sigue en taller)
dias_en_taller    INTEGER DEFAULT 0            ← calculado por trigger

motivo            TEXT
es_servicio       BOOLEAN DEFAULT FALSE
es_dano           BOOLEAN DEFAULT TRUE
observaciones     TEXT

created_at        TIMESTAMPTZ
updated_at        TIMESTAMPTZ
```

**Trigger**: `trg_taller_ingresos_dias` calcula `dias_en_taller` automáticamente en INSERT/UPDATE.
- Si `fecha_egreso` IS NOT NULL → `fecha_egreso - fecha_ingreso`
- Si `fecha_egreso` IS NULL → `CURRENT_DATE - fecha_ingreso` (vehículo aún en taller)

Semáforo visual: 0-2 días = verde, 3-5 = amarillo, 6+ = rojo.

#### `cobros` — Pipeline de cobro al cliente
```
id                UUID PK
siniestro_id      UUID FK → siniestros ON DELETE CASCADE

estado            estado_cobro DEFAULT 'pendiente'
monto_total       NUMERIC(12,2) NOT NULL DEFAULT 0

-- Facturación FEL (Infile)
factura_numero    TEXT
factura_serie     TEXT
factura_fecha     DATE

-- Pago
boleta_pago       TEXT
fecha_pago        DATE

-- Alternativas al cobro
es_gasto_pass     BOOLEAN DEFAULT FALSE       ← Pass absorbe el costo
es_seguro         BOOLEAN DEFAULT FALSE       ← Cubierto por seguro

notas             TEXT
created_at        TIMESTAMPTZ
updated_at        TIMESTAMPTZ
```

#### `documentos` — Repositorio de archivos por siniestro
```
id                UUID PK
siniestro_id      UUID FK → siniestros ON DELETE CASCADE
cotizacion_id     UUID FK → cotizaciones (opcional)

tipo              tipo_documento DEFAULT 'otro'
nombre_archivo    TEXT NOT NULL
storage_path      TEXT NOT NULL                ← ruta en Supabase Storage bucket "documentos"
tamanio_bytes     BIGINT
mime_type         TEXT

subido_por        UUID FK → auth.users
created_at        TIMESTAMPTZ
```

Storage bucket: `documentos` (privado, 10MB max, tipos: PDF, JPEG, PNG, WebP).

#### `siniestro_timeline` — Auditoría de cambios de estado
```
id                UUID PK
siniestro_id      UUID FK → siniestros ON DELETE CASCADE

estado_anterior   estado_siniestro
estado_nuevo      estado_siniestro NOT NULL
accion            TEXT NOT NULL
detalle           TEXT

usuario_id        UUID FK → auth.users
created_at        TIMESTAMPTZ
```

Se llena automáticamente via trigger cuando cambia `siniestros.estado`.

#### `perfiles` — Extensión de auth.users con roles
```
id                UUID PK FK → auth.users ON DELETE CASCADE
nombre_completo   TEXT NOT NULL
rol               TEXT CHECK (admin | agente_senior | agente | operaciones | readonly)
activo            BOOLEAN DEFAULT TRUE
created_at        TIMESTAMPTZ
updated_at        TIMESTAMPTZ
```

### Row Level Security

- **SELECT**: todos los usuarios autenticados pueden leer todas las tablas.
- **INSERT/UPDATE**: solo roles `admin`, `agente_senior`, `agente`, `operaciones`.
- **Catálogos** (talleres, repuestos): solo `admin` y `agente_senior` pueden modificar.
- **Perfiles**: solo admin o el propio usuario pueden modificar.
- Helper function: `get_user_rol()` retorna el rol del usuario autenticado.

### Funciones SQL importantes

- `generar_numero_siniestro()`: trigger BEFORE INSERT en siniestros, genera SIN-YYYY-NNN secuencial.
- `registrar_cambio_estado()`: trigger BEFORE UPDATE en siniestros, inserta en siniestro_timeline.
- `actualizar_totales_cotizacion()`: trigger AFTER INSERT/UPDATE/DELETE en cotizacion_lineas, recalcula totales.
- `set_dias_en_taller()`: trigger BEFORE INSERT/UPDATE en taller_ingresos, calcula dias_en_taller.
- `set_updated_at()`: trigger genérico en todas las tablas para updated_at automático.

---

## Backend API (ya implementado en /backend/index.js)

Express server en puerto 3000. Proxy XML-RPC a Odoo 19.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Health check: valida conexión a Odoo y Supabase |
| GET | `/vehiculos` | Lista vehículos (product.template donde rent_ok=true). Query params: `status`, `placa`, `limit` |
| GET | `/vehiculo/:placa` | Detalle de vehículo por placa + contrato activo (sale.order) + datos del cliente (res.partner) |
| PATCH | `/vehiculo/:id/status` | Cambia `x_studio_status_vehiculo` en Odoo. Body: `{ status: "En Reparación" }` |
| GET | `/vehiculo/:id/fleet` | Datos de fleet.vehicle vinculado al product.template |

### Campos Odoo relevantes

**product.template** (vehículos):
- `x_studio_placa_vehiculo_id` — placa del vehículo (ej: P-091LCM)
- `x_studio_tipo_de_vehiculo` — Sedán, SUV, Pickup, Microbús
- `x_studio_status_vehiculo` — Selection: Disponible | Rentado | Vehículo No Asegurado | En Mantenimiento | Servicios Varios | En Reparación | Asignado al personal | No aplica
- `x_studio_tipo_de_servicio` — tipo de servicio
- `rent_ok` — boolean, TRUE para vehículos de alquiler
- `categ_id` — categoría (2 = Alquiler)

**sale.order** (contratos de renta):
- `is_rental_order` — boolean
- `x_studio_numero_contrato` — número de contrato Pass
- `partner_id` — relación al cliente (res.partner)
- `state` — sale, done, cancel

**res.partner** (clientes):
- `phone`, `mobile`, `email`, `vat` (DPI/NIT)

**fleet.vehicle** (flota):
- `x_product_template_id` — vínculo al product.template
- `license_plate`, `model_id`, `model_year`, `color`, `vin_sn`, `odometer`

### XML-RPC helpers

```javascript
// Autenticar (con cache de 30 min)
const uid = await getUid();

// Ejecutar operación en Odoo
const result = await odooExecute(uid, 'model.name', 'method', [args], { kwargs });

// Ejemplos:
// search_read: odooExecute(uid, 'product.template', 'search_read', [domain], { fields, limit, order })
// write: odooExecute(uid, 'product.template', 'write', [[id], { campo: valor }])
// read: odooExecute(uid, 'res.partner', 'read', [[id]], { fields })
```

---

## Frontend (por implementar)

### Flujo de datos

- **Frontend → Supabase directo**: Todo el CRUD de la app (siniestros, cotizaciones, cobros, documentos, catálogos, perfiles, timeline). Usa `@supabase/supabase-js` con la anon key. RLS controla el acceso.
- **Frontend → Backend → Odoo**: Solo para operaciones que tocan Odoo (leer vehículos, cambiar status). El frontend hace fetch al backend Express, que traduce a XML-RPC.

### Configuración del cliente Supabase (src/lib/supabase.js)

```javascript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

### Configuración del cliente API Odoo (src/lib/odoo-api.js)

```javascript
const API_URL = import.meta.env.VITE_API_URL;

export async function fetchVehiculos(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_URL}/vehiculos?${query}`);
  if (!res.ok) throw new Error('Error fetching vehiculos');
  return res.json();
}

export async function fetchVehiculo(placa) {
  const res = await fetch(`${API_URL}/vehiculo/${placa}`);
  if (!res.ok) throw new Error('Vehiculo not found');
  return res.json();
}

export async function updateVehiculoStatus(odooId, status) {
  const res = await fetch(`${API_URL}/vehiculo/${odooId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Error updating status');
  return res.json();
}

export async function fetchVehiculoFleet(odooId) {
  const res = await fetch(`${API_URL}/vehiculo/${odooId}/fleet`);
  if (!res.ok) throw new Error('Fleet data not found');
  return res.json();
}
```

### Auth (Supabase Auth con email+password)

```javascript
// Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'carlos@passrentacar.com',
  password: '...',
});

// Obtener sesión actual
const { data: { session } } = await supabase.auth.getSession();

// Obtener perfil con rol
const { data: perfil } = await supabase
  .from('perfiles')
  .select('*')
  .eq('id', session.user.id)
  .single();
```

Roles: `admin` (todo), `agente_senior` (todo + catálogos), `agente` (CRUD siniestros), `operaciones` (CRUD siniestros), `readonly` (solo lectura).

### Páginas y funcionalidad

#### 1. Login
- Email + password (Supabase Auth)
- Redirect a Dashboard si hay sesión activa
- Logo Pass Rent a Car

#### 2. Dashboard
- 4 KPI cards: Siniestros activos, Proformas pendientes, Proformas emitidas (mes), Vehículos en reparación
- Tabla "Últimos siniestros" (5 más recientes)
- Feed "Actividad reciente" (últimos 10 registros de siniestro_timeline)
- Queries Supabase:
  ```javascript
  // Siniestros activos
  const { count } = await supabase.from('siniestros')
    .select('*', { count: 'exact', head: true })
    .not('estado', 'in', '("cerrado","anulado")');
  
  // Vehículos en reparación
  const { count } = await supabase.from('taller_ingresos')
    .select('*', { count: 'exact', head: true })
    .is('fecha_egreso', null);
  ```

#### 3. Siniestros (lista)
- Tabla con columnas: No. Siniestro, Fecha, Vehículo, Cliente, Tipo Daño, Severidad, Total Q., Estado, Acción
- Filtros: búsqueda por placa/cliente/número, dropdown estado, dropdown severidad
- Badges de color por severidad: leve=green, medio=amber, severo=red, perdida_total=darkred
- Badges de color por estado: registrado=gray, cotizando/proforma_emitida=amber, en_reparacion=red, reparado=blue, cerrado=green
- Botón "Ver proforma" cuando aplique
- Botón "+ Registrar siniestro"

#### 4. Registrar nuevo siniestro (modal o página)
- **Paso 1 — Datos del vehículo**: Select de placa (carga desde API backend `/vehiculos`). Al seleccionar placa, auto-completa tipo, marca, línea, año desde Odoo. Si hay contrato activo, auto-completa datos del cliente.
- **Paso 2 — Datos del cliente**: Nombre, DPI, teléfono, correo. Pre-llenado si viene del contrato.
- **Paso 3 — Descripción del daño**: Fecha del siniestro, lugar del accidente, tipo de daño (select), severidad (select), descripción adicional (textarea), fotos (upload a Supabase Storage).
- Al guardar:
  1. INSERT en `siniestros` con estado `registrado`
  2. El trigger genera el número automáticamente
  3. El trigger registra en `siniestro_timeline`
  4. PATCH al backend para cambiar status Odoo a "En Reparación" (si aplica)

#### 5. Detalle de siniestro
- Header con número, placa, cliente, estado actual (badge grande)
- Timeline visual de cambios de estado (desde siniestro_timeline)
- Sección "Cotizaciones" — tabla con las cotizaciones solicitadas a talleres
- Sección "Proforma" — la cotización aprobada con desglose
- Sección "Taller" — tracking de ingreso/egreso con días en taller y semáforo
- Sección "Cobro" — pipeline de cobro al cliente
- Sección "Documentos" — archivos adjuntos (PDFs, fotos)
- Botones de acción según estado:
  - `registrado` → "Solicitar cotización" (cambia a `cotizando`)
  - `cotizando` → "Generar proforma" (cambia a `proforma_emitida`)
  - `proforma_emitida` → "Aprobar proforma" (cambia a `proforma_aprobada`)
  - `proforma_aprobada` → "Ingresar a taller" (cambia a `en_reparacion`, PATCH Odoo)
  - `en_reparacion` → "Marcar como reparado" (cambia a `reparado`, registra egreso taller, PATCH Odoo → "Disponible")
  - `reparado` → "Registrar cobro" (cambia a `en_cobro`) o "Absorbe Pass" / "Seguro"
  - `en_cobro` → "Cerrar siniestro" (cambia a `cerrado`)

#### 6. Cotizaciones / Proformas
- Al solicitar cotización: seleccionar 1-3 talleres del catálogo
- Para cada taller: agregar líneas (repuesto / mano de obra / otro) con descripción, cantidad, precio
- Opcionalmente vincular a repuesto del catálogo para auto-completar precio
- **Comparador lado a lado**: tabla que muestra las cotizaciones de cada taller en columnas, con totales de repuestos, mano de obra, otros, y total general. Highlight visual al más económico.
- Al aprobar una cotización: cambia su estado a `aprobada`, las demás a `rechazada`, genera proforma, asigna `taller_id` al siniestro
- Exportar proforma a PDF

#### 7. Flota vehicular
- Vista Kanban de vehículos agrupados por status (carga desde API backend `/vehiculos`)
- Indicadores de color: verde=Disponible, rojo=En Reparación, amarillo=En Mantenimiento, azul=Rentado
- Contadores en header: "Disponible: 38 · Reparación: 5 · Rentado: 5"
- Click en un vehículo → abre detalle desde Odoo

#### 8. Catálogos (solo admin/agente_senior)
- Tabs: Repuestos | Mano de obra | Catálogo de daños | Otros gastos
- CRUD con código, nombre, marca, línea/modelo, años, precio referencia
- Indicador "Vigente" / "Revisar" / "Desactualizado" basado en `precio_actualizado_at`
- Botón "+ Agregar ítem"

#### 9. Repositorio de documentos
- Tabla global de todos los documentos subidos, agrupables por siniestro
- Columnas: documento, proveedor/taller, siniestro, tipo (badge), fecha, tamaño, acción (ver/descargar)
- Upload con drag & drop al bucket "documentos" de Supabase Storage
- Path pattern: `{siniestro_numero}/{tipo}/{timestamp}_{filename}`

#### 10. Reportes
- KPIs grandes: Total siniestros año, Promedio por siniestro
- Tabla "Resumen por tipo de vehículo": tipo, # siniestros, desglose por severidad, total, monto Q.
- Filtros por rango de fecha, tipo de vehículo
- Charts opcionales: barras por mes, pie por severidad, top 5 vehículos con más siniestros

### Diseño visual

- Sidebar izquierdo oscuro con logo Pass Rent a Car
- Secciones: Dashboard, Siniestros, Proformas, Flota Vehicular (principal); Catálogos, Repositorio, Reportes (configuración)
- Botón rojo "+ Nuevo Siniestro" en header
- Colores de marca Pass: rojo primario (#E53935), blanco, gris oscuro
- Badges de severidad: leve=green, medio=amber, severo=red, pérdida_total=darkred
- Badges de estado: registrado=gray, cotizando=amber, proforma_emitida=amber, proforma_aprobada=blue, en_reparacion=red, reparado=teal, en_cobro=purple, cerrado=green, anulado=gray
- Responsive: desktop-first pero usable en tablet

---

## Ciclo de vida del siniestro

```
registrado → cotizando → proforma_emitida → proforma_aprobada → en_reparacion → reparado → en_cobro → cerrado
                                                                                    ↓
                                                                              absorbe_pass / seguro → cerrado
```

### Acciones por transición de estado

| De → A | Acción en Supabase | Acción en Odoo |
|--------|-------------------|----------------|
| → registrado | INSERT siniestro | — |
| registrado → cotizando | INSERT cotizaciones (1-3) | — |
| cotizando → proforma_emitida | UPDATE cotizacion.estado = recibida | — |
| proforma_emitida → proforma_aprobada | UPDATE cotizacion ganadora = aprobada, resto = rechazada. UPDATE siniestro.taller_id | — |
| proforma_aprobada → en_reparacion | INSERT taller_ingresos con fecha_ingreso | PATCH status → "En Reparación" |
| en_reparacion → reparado | UPDATE taller_ingresos.fecha_egreso | PATCH status → "Disponible" |
| reparado → en_cobro | INSERT cobros con monto | — |
| en_cobro → cerrado | UPDATE cobros.estado = pagado | — |
| reparado → cerrado (absorbe_pass) | INSERT cobros con es_gasto_pass=true | — |
| cualquier → anulado | UPDATE estado = anulado | PATCH status → "Disponible" (si estaba en reparación) |

---

## Talleres proveedores (seed data)

| Nombre | Especialidad |
|--------|-------------|
| COFIÑO / CAES | Taller autorizado Toyota. Servicios menores y mayores. |
| REASA | Enderezado y pintura. |
| TRS | Taller de reparaciones general. |
| AUTO SERVICIO | Servicios generales. |
| AUTO LUB | Lubricación y servicios menores. |
| GRUPO Q | Suspensión y mecánica general. |
| Skipy | Vidrios y polarizado. |
| Polarizado Express | Polarizado vehicular. |
| Vidrios Outlet GT | Windshields y vidrios. |

---

## Montos y cálculos financieros

- **monto_cliente**: lo que se le cobra al cliente por el daño. Puede ser igual al total de la proforma o un monto negociado.
- **costo_pass**: lo que Pass paga al taller (total de la proforma aprobada).
- **margen**: monto_cliente - costo_pass. Puede ser positivo (ganancia), cero, o negativo (pérdida si Pass absorbe).
- Los totales de la cotización se calculan automáticamente via trigger al modificar líneas.
- El cobro soporta FEL: serie + número de factura, vinculado al contrato de Infile.
- Moneda: Quetzales (Q). Todos los campos NUMERIC(12,2).

---

## Convenciones de código

- Idioma del código: inglés para variables y funciones, español para labels y textos visibles al usuario.
- Componentes React: PascalCase funcional con hooks.
- Archivos: kebab-case para archivos, PascalCase para componentes.
- Supabase queries: usar el SDK directamente en componentes o en hooks personalizados.
- No usar ORM; queries directas con supabase-js.
- Error handling: try/catch con toast notifications para errores del usuario.
- Fechas: almacenar en UTC, mostrar en timezone Guatemala (UTC-6).
- Formato de placa: siempre UPPERCASE.

---

## Notas importantes

1. **El schema de Supabase ya está creado y ejecutado.** No necesitas correr migrations. Las 9 tablas, 7 enums, triggers, RLS policies y seed data de talleres ya existen en el proyecto `cxoqviwdryvjahykazpb`.

2. **El backend ya está escrito** en `/backend/index.js`. Solo necesita ser subido al repo GitHub y deployado en Coolify.

3. **El frontend es lo que falta implementar.** Scaffold con Vite + React + Tailwind + React Router, luego los módulos uno a uno empezando por auth y layout.

4. **Odoo 19 tiene breaking changes**: JSONB `arch_db`, `<list>` vs `<tree>`, inline `invisible=` vs `attrs=`. Pero esto no afecta esta app porque nos comunicamos via XML-RPC, no modificamos vistas Odoo.

5. **Ficha Digital de referencia**: El proyecto `pass-ficha-digital` en el mismo repo de GitHub y Coolify es el patrón a seguir. Misma estructura, misma metodología de deploy.

6. **Dominio frontend**: `gestion-danos.odoo-server.online` (dev). Producción eventual: subdominio de `passrentacar.net.gt`.
