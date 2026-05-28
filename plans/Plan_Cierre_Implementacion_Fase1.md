# Cierre de Implementación — Fase 1

**Proyecto**: Pass Daños — Sistema de Gestión de Daños y Mantenimiento Vehicular
**Cliente**: Pass Rent a Car Guatemala (Gold Travel Corps, S.A.)
**Período de desarrollo**: 2026-05-26 → 2026-05-28
**Estado final**: ✅ MVP en producción, operativo
**URLs**:
- Frontend: https://gestion-danos.odoo-server.online
- Backend: https://api-danos.odoo-server.online
- Supabase: `cxoqviwdryvjahykazpb`
- Repo: `odoo-solutionsgt-publitag/pass-danos`

---

## Resumen ejecutivo

En 3 días se construyó, deployó y puso en producción un sistema completo de gestión de daños vehiculares y mantenimientos que reemplaza 4 archivos Excel manuales. La app está integrada con Odoo 19 (lectura de flota y contratos vía XML-RPC) y conectada con SSO bidireccional: los usuarios autentican con sus credenciales de Odoo, y desde Odoo se accede a la app y a la bitácora de cada vehículo individual.

---

## Inventario de Fases implementadas

| # | Módulo | Status | Subplan |
|---|--------|--------|---------|
| 0 | Entorno (Coolify, Supabase, Odoo) | ✅ | [Plan_00_Entorno.md](Plan_00_Entorno.md) |
| 1 | Dashboard + KPIs + actividad | ✅ | [Plan_01_Dashboard.md](Plan_01_Dashboard.md) |
| 2 | Daños — lista + wizard de registro | ✅ | [Plan_02_Siniestros_Lista_Nuevo.md](Plan_02_Siniestros_Lista_Nuevo.md) |
| 3 | Daño — detalle + máquina de estados + taller | ✅ | [Plan_03_Siniestro_Detalle.md](Plan_03_Siniestro_Detalle.md) |
| 4 | Cotizaciones + comparador + proforma | ✅ | [Plan_04_Cotizaciones_Proforma.md](Plan_04_Cotizaciones_Proforma.md) |
| 5 | Cobros | ⏭️ Omitida — se gestiona en Odoo | [Plan_05_Cobros.md](Plan_05_Cobros.md) |
| 6 | Servicios de Mantenimiento | ✅ | [Plan_06_Servicios_Mantenimiento.md](Plan_06_Servicios_Mantenimiento.md) |
| 7 | Flota Vehicular (Kanban + drawer) | ✅ | [Plan_07_Flota_Vehicular.md](Plan_07_Flota_Vehicular.md) |
| 8 | Catálogos (Talleres + Repuestos) | ✅ | [Plan_08_Catalogos.md](Plan_08_Catalogos.md) |
| 9 | Repositorio de Documentos | ✅ | [Plan_09_Repositorio.md](Plan_09_Repositorio.md) |
| 10 | Reportes y KPIs | ✅ | [Plan_10_Reportes.md](Plan_10_Reportes.md) |
| Extra | Acceso vía Odoo (SSO con JWT a Supabase) | ✅ | [Plan_Acceso_Odoo_Gestion_Danos.md](Plan_Acceso_Odoo_Gestion_Danos.md) |

---

## Características construidas

### Funcionalidad principal

**Daños vehiculares**:
- Wizard de 3 pasos con búsqueda por placa O por número de contrato (autocomplete contra Odoo)
- 9 estados con máquina dirigida: registrado → cotizando → proforma_emitida → proforma_aprobada → en_reparacion → reparado → en_cobro → cerrado (+ anulado)
- Cada transición pide confirmación y dispara efectos secundarios (PATCH Odoo `x_studio_status_vehiculo`, INSERT en `taller_ingresos`, etc.)
- Cotizaciones 1-3 talleres con líneas inline, comparador automático con highlight del menor total
- Proforma editable con monto_cliente / costo_pass / margen
- Documentos adjuntos contextuales por daño Y por cotización

**Servicios de Mantenimiento**:
- 7 tipos: servicio_menor, servicio_mayor, cambio_llantas, cambio_bateria, alineacion_balanceo, cambio_frenos, otro
- 5 estados: programado → aprobado → en_proceso → completado (+ cancelado)
- Lógica `requiere_autorizacion` automática: servicio_mayor OR total > Q5,000
- Mapeo de tipo de servicio → status Odoo (En Mantenimiento / Servicios Varios)
- Captura de `autorizado_por` cuando aplica

**Flota Vehicular**:
- Kanban con toggle "Por estado" / "Por tipo" (Económico, Sedán, Pickup, SUV/Camioneta, Microbus, Camión)
- Filtro `categ_id=2` (Vehículos) y exclusión de tipo "Cotización"
- 4 KPI cards (Disponible / Rentado / En Reparación / En Mantenimiento)
- Drawer al click con detalle Odoo + contrato activo + historial daños/servicios + atajos "+Daño", "+Servicio", "Ver bitácora"

**Bitácora del Vehículo** (URL única por placa):
- Ruta `/bitacora/:placa` con expediente consolidado: contrato activo, historial daños + servicios, expediente documental, KPIs (# daños, # servicios, último evento, costo total)
- URL sincronizada automáticamente al campo `x_studio_bitacora_de_servicios` del product.template en Odoo
- Endpoint `/odoo/sync-bitacora-all` para población masiva

**Reportes**:
- Toggle Daños / Servicios con shortcuts de fecha (30d / 90d / 12m)
- Bar chart por mes (CSS puro, sin librería)
- Distribución por severidad / tipo de servicio
- Top 5 vehículos con más eventos
- Resumen por tipo de vehículo
- Export CSV con BOM UTF-8

**Repositorio**:
- Tabla global con filtros por tipo, origen y proveedor
- Drag & drop de PDF, JPG, PNG, WebP, Excel, Word, CSV (max 10MB)
- Signed URLs de 60s para descarga
- Path pattern: `{numero}/{tipo}/{timestamp}_{filename}`

**Fichas imprimibles**:
- `/siniestros/:id/imprimir` con accent rojo y firmas Cliente / Pass
- `/servicios/:id/imprimir` con accent slate y firmas Taller / Pass / Autorizado
- Auto-trigger `window.print()` y CSS A4

### Integración Odoo

**Lectura (XML-RPC)**:
- `product.template` — flota filtrada por `rent_ok=true AND categ_id=2 AND x_studio_tipo_de_vehiculo != Cotización`
- Parseo automático del nombre del producto (`"P-006KXB TOYOTA PICK UP HI LUX 2025"`) → marca, línea, año
- `sale.order` — búsqueda de contratos por nombre con ilike
- `res.partner` — datos del cliente (DPI vía `x_studio_dpipasaporte_cliente`, NIT vía `vat`, phone, email, mobile fallback)

**Escritura (XML-RPC)**:
- PATCH `product.template.x_studio_status_vehiculo` al ingresar/egresar de taller
- PATCH `product.template.x_studio_bitacora_de_servicios` con la URL única del vehículo

**SSO bidireccional** (módulo Odoo `pass_gestion_danos`):
- Menú "Gestión de Daños/Mant" en Rental que abre la app
- Campo `x_can_access_danos` en `res.users` (tab "Pass — Apps Externas")
- Endpoint `POST /auth/odoo` autentica contra Odoo y firma JWT compatible con Supabase

---

## Stack final

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Frontend | React | 19 |
| Bundler | Vite | 6.x |
| CSS | Tailwind | 4.x |
| Router | React Router | 7.x |
| Icons | Lucide React | latest |
| Backend | Node.js + Express | 18+ / 4.21 |
| XML-RPC | xmlrpc (npm) | 1.3.2 |
| JWT | jsonwebtoken | 9.0 |
| UUID v5 | uuid | 10.x |
| DB | Supabase (PostgreSQL) | latest |
| Auth | Supabase Auth + Odoo SSO | — |
| Storage | Supabase Storage | bucket "documentos" |
| ERP | Odoo 19 Enterprise | — |
| Hosting | Coolify v4 (Docker) | Contabo VPS |
| Build | Backend → Dockerfile; Frontend → Nixpacks | — |

---

## Modelo de datos final (Supabase)

### Enums

```
estado_siniestro: registrado | cotizando | proforma_emitida | proforma_aprobada |
                  en_reparacion | reparado | en_cobro | cerrado | anulado
severidad_dano: leve | medio | severo | perdida_total
tipo_dano: choque_frontal | choque_trasero | choque_lateral | rayon | abollon |
           vidrio | llanta | mecanico | multiple | otro
tipo_servicio_mant: servicio_menor | servicio_mayor | cambio_llantas | cambio_bateria |
                    alineacion_balanceo | cambio_frenos | otro
estado_orden_servicio: programado | aprobado | en_proceso | completado | cancelado
estado_cotizacion: solicitada | recibida | aprobada | rechazada
tipo_linea_cotizacion: repuesto | mano_obra | otro
estado_cobro: pendiente | informado | facturado | pagado | absorbe_pass | seguro
tipo_documento: cotizacion_pdf | proforma_pdf | foto_dano | factura |
                comprobante_pago | avaluo | otro
```

### Tablas

- `talleres` — proveedores (seed 9 talleres: COFIÑO/CAES, REASA, TRS, AUTO SERVICIO, AUTO LUB, GRUPO Q, Skipy, Polarizado Express, Vidrios Outlet GT)
- `repuestos_catalogo` — repuestos con `precio_actualizado_at` para indicador de vigencia
- `siniestros` — daños con campos vehicular + cliente + financiero
- `cotizaciones` + `cotizacion_lineas` — cotizaciones por taller con totales auto-recalculados
- `ordenes_servicio` + `orden_servicio_lineas` — mantenimientos (estructura paralela a siniestros/cotizaciones)
- `taller_ingresos` — tracking de ingreso/egreso (soporta siniestros Y servicios via CHECK)
- `cobros` — bitácora de cobros (FEL en Odoo)
- `documentos` — archivos en Storage, soporta siniestro_id + orden_servicio_id + cotizacion_id (opcional)
- `siniestro_timeline` + `orden_servicio_timeline` — auditoría de cambios de estado
- `perfiles` — extiende `auth.users` con `nombre_completo`, `rol`, `activo`

---

## Pregunta del usuario: ¿qué fechas guardan los registros?

### Tabla `siniestros` (daños)

| Campo | Llenado por | Cuándo |
|-------|-------------|--------|
| `created_at` | DB (default) | INSERT inicial — sello inmutable del registro |
| `updated_at` | trigger `set_updated_at()` | Cada UPDATE — última modificación |
| `fecha_dano` | usuario en wizard | Fecha real del accidente |

**Cambios de estado**: cada vez que `siniestros.estado` cambia, el trigger `registrar_cambio_estado()` inserta en `siniestro_timeline`:
- `estado_anterior`, `estado_nuevo`
- `accion` (texto)
- `detalle` (descripción opcional)
- `created_at` ← **este timestamp marca el momento de la transición de estado**

### Tabla `ordenes_servicio` (servicios)

| Campo | Llenado por | Cuándo |
|-------|-------------|--------|
| `created_at` | DB (default) | INSERT inicial |
| `updated_at` | trigger `set_updated_at()` | Cada UPDATE |
| `fecha_programada` | usuario | Fecha en que se programa el servicio |
| `fecha_autorizacion` | usuario / backend | Cuando se aprueba un servicio que requería autorización |

**Cambios de estado**: análogo a siniestros via `orden_servicio_timeline`.

### Tabla `taller_ingresos` (tracking taller)

| Campo | Llenado por | Cuándo |
|-------|-------------|--------|
| `fecha_ingreso` | backend al pasar a `en_reparacion` / `en_proceso` | Día que entra al taller |
| `fecha_egreso` | backend al pasar a `reparado` / `completado` | Día que sale del taller |
| `dias_en_taller` | trigger `set_dias_en_taller()` | Calculado: `fecha_egreso - fecha_ingreso` o `CURRENT_DATE - fecha_ingreso` si sigue dentro |

### Tabla `cotizaciones`

| Campo | Llenado por | Cuándo |
|-------|-------------|--------|
| `created_at` | DB | Al solicitar la cotización |
| `updated_at` | trigger | Cada modificación |
| `fecha_solicitud` | usuario / backend | Cuando se envía solicitud al taller |
| `fecha_recepcion` | usuario / backend | Cuando el taller envía la cotización |

### Tabla `cobros`

| Campo | Llenado por | Cuándo |
|-------|-------------|--------|
| `factura_fecha` | usuario | Fecha de la factura FEL |
| `fecha_pago` | usuario | Fecha del pago/boleta |

### Tabla `documentos`

| Campo | Llenado por | Cuándo |
|-------|-------------|--------|
| `created_at` | DB | Momento del upload |

### Resumen visual del ciclo de un daño con sus fechas

```
USUARIO REGISTRA              → created_at  + fecha_dano (input)
ESTADO=cotizando              → timeline.created_at (transición)
ESTADO=proforma_emitida       → timeline.created_at
ESTADO=proforma_aprobada      → timeline.created_at
ESTADO=en_reparacion          → timeline.created_at  + taller_ingresos.fecha_ingreso
                                + PATCH Odoo status="En Reparación"
ESTADO=reparado               → timeline.created_at  + taller_ingresos.fecha_egreso
                                + PATCH Odoo status="Disponible"
                                + dias_en_taller calculado
ESTADO=en_cobro               → timeline.created_at  + cobros.fecha_pago (al pagarse)
ESTADO=cerrado                → timeline.created_at  + updated_at
```

> **Faltante detectado**: la app NO guarda quién hizo cada cambio de estado en `siniestro_timeline.usuario_id`. Es parte de la Fase 2.

---

## Ajustes / fixes hechos durante la implementación

| Tema | Detalle |
|------|---------|
| Placa Odoo | Cambio de `x_studio_placa_vehiculo_id` → `default_code` (referencia interna real) |
| Deploy backend | Cambio Nixpacks → Dockerfile por timeouts de descarga nix-env |
| Disco Coolify | `docker system prune -a --volumes -f` cuando "exporting to image" fallaba |
| SQL ambiguo `anio` | `generar_numero_siniestro()` y `generar_numero_servicio()`: renombrado variable local a `v_anio` |
| NIT separado | Nueva columna `siniestros.cliente_nit` (NIT en `vat` de Odoo, DPI en `x_studio_dpipasaporte_cliente`) |
| Cliente readonly | Datos del cliente vienen de Odoo, no se editan en la app |
| Marca/Línea/Año | Parser en backend extrae del nombre del producto Odoo |
| Tipo Cotización | Excluido del listado de Flota Vehicular (`!= 'Cotización'`) |
| Bucket MIME types | Ampliado a Excel, Word, CSV además de PDF/imágenes |
| Logo | Integrado en Login, Sidebar, fichas impresas y favicon |
| Botones nuevos | "+Nueva orden" junto a "+Nuevo Daño" en el header |
| SSO Odoo | Implementación completa con JWT firmado HS256 con Legacy JWT Secret |
| Permisos service_role | `GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role` necesario en proyectos nuevos de Supabase |
| Auto-sync bitácora | `syncBitacora()` call después de cada INSERT de daño/servicio |

---

## Configuración crítica de producción

### Backend (Coolify env vars)
```env
PORT=3000
NODE_ENV=production
TZ=America/Guatemala
CORS_ORIGIN=https://gestion-danos.odoo-server.online
ODOO_URL=https://odoo-server.online
ODOO_DB=odoo19server
ODOO_API_USER=<usuario API Odoo>
ODOO_API_PASSWORD=<API key Odoo>
SUPABASE_URL=https://cxoqviwdryvjahykazpb.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_yyDMep...                    ← Secret API key
SUPABASE_JWT_SECRET=<Legacy JWT secret de Supabase>         ← Para firmar JWTs SSO
ODOO_DANOS_NAMESPACE_UUID=51b0e28f-2a0d-4d37-a934-d1dba8bbb680
BITACORA_BASE_URL=https://gestion-danos.odoo-server.online  ← opcional, default deriva de CORS_ORIGIN
```

### Frontend (Coolify env vars)
```env
VITE_SUPABASE_URL=https://cxoqviwdryvjahykazpb.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_duo43fZgsn...
VITE_API_URL=https://api-danos.odoo-server.online
```

### Supabase Storage
Bucket `documentos`:
- Privado, max 10MB
- MIME types: `application/pdf, image/jpeg, image/png, image/webp, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document`

### Supabase Permisos
```sql
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
```

---

## Módulo Odoo entregado

Ubicación: `odoo_addons/pass_gestion_danos/`

**8 archivos**:
- `__init__.py`, `__manifest__.py`
- `models/__init__.py`, `models/res_users.py` (campo `x_can_access_danos`)
- `data/gestion_danos_action.xml` (acción URL hacia la app)
- `views/res_users_views.xml` (tab "Pass — Apps Externas")
- `views/menu_gestion_danos.xml` (menú en Rental)
- `security/ir.model.access.csv`

Instalado y operativo en Odoo 19 producción.

---

## Métricas finales

| Métrica | Valor |
|---------|-------|
| Commits totales | ~35 |
| Líneas de código (aprox) | 8,000 (frontend) + 700 (backend) |
| Componentes React | 20+ |
| Páginas | 14 |
| Endpoints backend | 11 |
| Tablas Supabase | 11 |
| Triggers SQL | 8 |
| Tiempo de desarrollo | 3 días (intensivos) |

---

## Hand-off operacional

### Cómo agregar un nuevo usuario
1. En Odoo: crear `res.users` con email/password
2. En tab "Pass — Apps Externas": marcar `x_can_access_danos`
3. El usuario hace su primer login en la app → auto-crea su perfil con rol `agente`
4. Admin Supabase ajusta su `rol` en `perfiles` si necesita más permisos

### Cómo agregar un taller / repuesto
- App → Catálogos → Talleres o Repuestos → botón "+ Nuevo"
- Solo `admin` y `agente_senior` pueden modificar

### Cómo monitorear
- Health check: `GET https://api-danos.odoo-server.online/health` (valida Odoo + Supabase)
- Logs de backend en Coolify (tab "Logs" del contenedor)
- Auth events en Supabase Dashboard → Authentication → Audit Logs

---

## Cierre Fase 1

Fase 1 cerrada exitosamente con todos los criterios cumplidos. El sistema está operativo en producción, los usuarios pueden registrar daños y servicios, generar proformas, imprimir fichas, mantener catálogos y consultar reportes. La integración con Odoo es bidireccional (lectura + escritura) y los usuarios autentican vía SSO de Odoo.

La **Fase 2** abordará: auditoría granular, roles avanzados, mejoras a cotizaciones, ampliación de catálogos, formas de pago, tipos de servicio adicionales, fechas extendidas, gestión de anulaciones, descuentos y checklist de documentos al cierre.

Ver: [Plan_General_Fase2.md](Plan_General_Fase2.md)
