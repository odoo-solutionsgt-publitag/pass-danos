# Sistema de Gestión de Daños Vehiculares Integrado con ERP

## Frase de Impacto
Reemplaza gestión manual en Excel con sincronización Odoo, reportes dinámicos y automación.

## Lo Que Se Construyó
- **XML-RPC Odoo 19, SSO JWT, sincronización automática estado**
- **Reportes PDF/XLS 3 niveles con ExcelJS y jsPDF**
- **Supabase RLS, 7 tablas, 4 triggers, 10+ endpoints**

## Stack
React · Vite · Tailwind · Node.js · Express · Supabase · Odoo · Docker

## Métrica
7 tablas Supabase con 4 triggers automáticos, 10+ endpoints REST, 2 apps desplegadas en Coolify.

---

## Detalles Técnicos (Verificados en Código)

### Arquitectura
- **Frontend**: React 19 + Vite 6 + Tailwind 4, servidor static via Coolify
- **Backend**: Node.js 22 + Express con proxy XML-RPC a Odoo 19 Enterprise
- **Base de datos**: Supabase (PostgreSQL) con Row Level Security y Storage bucket privado
- **Infraestructura**: Docker multi-stage (frontend Nixpacks, backend alpine), Coolify v4 orquestando 2 apps

### Integraciones Verificables
1. **Odoo 19 XML-RPC**: Lectura/escritura de `product.template` (vehículos), `sale.order` (contratos), `stock.quant` (inventario). Cambio de estado bidireccional: `x_studio_status_vehiculo` ↔ `disponible_renta` en Supabase
2. **Supabase Auth + JWT**: SSO contra credenciales Odoo. Backend firma JWT con HS256 (SUPABASE_JWT_SECRET). Frontend recibe token y lo usa en sesión Supabase (RLS automático)
3. **Supabase Storage**: Bucket "documentos" (privado, 10 MB máx) para PDFs, fotos, facturas. Path pattern: `{siniestro_numero}/{tipo}/{timestamp}_{filename}`
4. **n8n**: Mencionado en infraestructura Coolify para automatizaciones operacionales (no explorado en código)

### Reportes Dinámicos (Implementación Verificada)
- **PDF**: `exportarFlotilaPDF()` con html2canvas + jsPDF, renderiza tabla HTML, paginación automática
- **XLS**: `exportarFlotillaXLS()` con ExcelJS, logo embebido (200×80px), headers dos líneas, estilos OPAQUE
- **Agrupación 3 niveles**: Tipo Vehículo (alfabético) → Línea (alfabético) → Estado (alfabético) → Vehículos (por modelo ascendente)
- **Pesos**: jspdf.es.min (~357 KB), html2canvas (~202 KB), exceljs.min (~940 KB) — carga dinámica en producción

### Sincronización de Datos
- **Lectura desde Odoo**: Campos mapeados directamente (no parsing): `default_code` (placa), `x_studio_marca`, `x_studio_linea`, `x_studio_modelo_vehiculo`, `x_studio_tipo_de_vehiculo`, `x_studio_status_vehiculo`
- **Escritura a Odoo**: `PATCH /vehiculo/:id/status` actualiza `x_studio_status_vehiculo` + sincroniza `stock.quant` (qty_available) + nota en chatter del producto
- **Bitácora**: URL generada automáticamente `gestion-danos.odoo-server.online/bitacora/:placa`, sincronizada a Odoo en `x_studio_bitacora_de_servicios`

### Base de Datos (7 Tablas Supabase)
1. `siniestros` — Daños (FK a odoo_product_id, contrato_id, taller_id, registrado_por)
2. `ordenes_servicio` — Servicios (FK a odoo_product_id, taller_id, registrado_por)
3. `cotizaciones` — 1-3 cotizaciones por siniestro
4. `cotizacion_lineas` — Detalles (repuesto, mano_obra, otro, descuento)
5. `taller_ingresos` — Tracking de vehículos en talleres (FK a siniestro_id O orden_servicio_id, CHECK exclusivo)
6. `talleres` — Catálogo de 9 proveedores seed
7. `documentos` — Repositorio de archivos (tipo, storage_path en bucket)

**Triggers (4 automáticos)**:
- `generar_numero_siniestro()` — SIN-YYYY-NNN secuencial
- `registrar_cambio_estado()` → `siniestro_timeline` con usuario_id, cambio anterior/nuevo
- `actualizar_totales_cotizacion()` — recalcula totales en INSERT/UPDATE/DELETE de líneas
- `set_dias_en_taller()` — calcula `fecha_egreso - fecha_ingreso` o `TODAY() - fecha_ingreso`

### Autenticación & Control de Acceso
- **SSO Odoo**: Backend autentica con `res.users` credentials vía XML-RPC, valida `x_can_access_danos` (Boolean)
- **UUID determinístico**: uuidv5("odoo:{uid}", NAMESPACE_CONST) mapea usuarios Odoo a `auth.users` en Supabase
- **RLS Policies**: SELECT todos, INSERT/UPDATE/DELETE roles granulares (`admin`, `agente_senior`, `agente`, `operaciones`, `readonly`)

### Ciclo de Vida del Siniestro (9 Estados)
`registrado` → `cotizando` → `proforma_emitida` → `proforma_aprobada` → `en_reparacion` → `reparado` → `en_cobro` → `cerrado` | `anulado`

Transiciones disparan:
- INSERT en `taller_ingresos` cuando → `en_reparacion`
- UPDATE `taller_ingresos.fecha_egreso` cuando → `reparado`
- PATCH `/vehiculo/:id/status` con "Reparación" → `en_reparacion`, "Disponible" → `reparado`/`anulado`

### Números Verificables
- **2 apps en producción**: `pass-danos-frontend`, `pass-danos-backend` ambas en Coolify v4
- **10+ endpoints REST**: `GET /health`, `POST /auth/odoo`, `GET /vehiculos`, `GET /vehiculo/:placa`, `PATCH /vehiculo/:id/status`, `GET /contratos`, `GET /contratos/:id`, `POST /odoo/sync-bitacora`, `POST /odoo/sync-bitacora-all`, `POST /siniestros/:id/refresh-cliente`
- **7 tablas schema** + 2 catálogos (`audit_log`, `bitacora_actualizaciones`)
- **3-5 KB gzip** por página (core JS: index.es DpjLCU9E.js 159 KB, index CubIC6WQ.js 864 KB — minified)

---

## Tags
Odoo · XML-RPC · Supabase · PostgreSQL · RLS · Fullstack · API-First · Docker · Reportes-Dinámicos · n8n
