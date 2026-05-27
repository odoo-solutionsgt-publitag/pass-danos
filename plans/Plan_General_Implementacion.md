# Plan General de Implementación — Pass Gestión de Daños

**Proyecto**: Pass Rent a Car Guatemala — Sistema de Gestión de Daños y Mantenimiento  
**Fecha de inicio**: 2026-05-26  
**Stack**: React 19 + Vite 6 + Tailwind 4 + Supabase + Express (Odoo proxy)  
**Repo**: `odoo-solutionsgt-publitag/pass-danos`  
**Frontend**: https://gestion-danos.odoo-server.online  
**Backend**: https://api-danos.odoo-server.online  

---

## Estado actual (al inicio del plan)

| Componente | Estado |
|-----------|--------|
| Repo GitHub | ✅ Configurado (`pass-danos`) |
| Backend Express | ✅ Deployado en Coolify (api-danos.odoo-server.online) |
| Frontend scaffold | ✅ Deployado en Coolify (gestion-danos.odoo-server.online) |
| Login screen | ✅ Carga correctamente |
| Supabase schema | ✅ Tablas base creadas (001) |
| Migration 002 servicios | ⬜ Pendiente ejecutar en Supabase |
| Variables de entorno | ⬜ Pendiente configurar en Coolify |
| Usuario admin | ⬜ Pendiente crear en Supabase Auth |
| Páginas funcionales | ⬜ Solo scaffolds vacíos |

---

## Arquitectura de módulos

```
App
├── Auth (Login / useAuth)
├── Layout (Sidebar + Header + Outlet)
│
├── MÓDULO 1 — Siniestros (Daños vehiculares)
│   ├── Lista de siniestros
│   ├── Nuevo siniestro (wizard 3 pasos)
│   ├── Detalle del siniestro
│   │   ├── Cotizaciones (solicitar, ingresar líneas, comparar)
│   │   ├── Proforma (cotización aprobada)
│   │   ├── Taller (ingreso / egreso / días)
│   │   ├── Cobro (pipeline facturación FEL)
│   │   ├── Documentos (adjuntos)
│   │   └── Timeline (historial de estados)
│
├── MÓDULO 2 — Servicios de Mantenimiento
│   ├── Lista de órdenes de servicio
│   ├── Nuevo servicio
│   ├── Detalle del servicio
│   │   ├── Líneas de detalle (repuestos / mano de obra)
│   │   ├── Taller (ingreso / egreso)
│   │   ├── Documentos (facturas, fotos)
│   │   └── Timeline
│
├── MÓDULO 3 — Flota Vehicular (lectura Odoo)
│
├── MÓDULO 4 — Catálogos (admin/agente_senior)
│   ├── Talleres (CRUD)
│   └── Repuestos (CRUD)
│
├── MÓDULO 5 — Repositorio de Documentos
│
└── MÓDULO 6 — Reportes y KPIs
```

---

## Fases de desarrollo

### FASE 0 — Entorno y configuración inicial
**Subplan**: `Plan_00_Entorno.md`  
**Prioridad**: BLOQUEANTE — debe completarse antes de cualquier desarrollo  
**Estimado**: 1 sesión (2-3 horas)

**Tareas**:
- [ ] Ejecutar `002_servicios_mantenimiento.sql` en Supabase SQL Editor
- [ ] Configurar variables de entorno del **backend** en Coolify:
  - `ODOO_API_USER`, `ODOO_API_PASSWORD`
  - `SUPABASE_SERVICE_KEY`
- [ ] Configurar variables de entorno del **frontend** en Coolify:
  - `VITE_SUPABASE_ANON_KEY`
- [ ] Validar `/health` endpoint del backend
- [ ] Crear primer usuario admin en Supabase Auth
- [ ] Insertar fila en `perfiles` con rol `admin`
- [ ] Probar login end-to-end en producción
- [ ] Verificar que el Dashboard carga (aunque esté vacío)

**Criterio de éxito**: Login funcional, `/health` retorna OK, usuario admin puede entrar.

---

### FASE 1 — Dashboard (KPIs + actividad reciente)
**Subplan**: `Plan_01_Dashboard.md`  
**Depende de**: Fase 0  
**Estimado**: 1 sesión (2-3 horas)

**Tareas**:
- [ ] 5 KPI cards con queries reales a Supabase:
  - Siniestros activos (no cerrado/anulado)
  - Proformas pendientes (estado proforma_emitida)
  - Vehículos en reparación (taller_ingresos sin egreso)
  - Servicios en curso (ordenes_servicio estado=en_proceso)
  - Próximas proformas a cobrar
- [ ] Tabla "Últimos 5 siniestros" con badges de estado
- [ ] Sección "Próximos servicios programados" (ordenes_servicio estado=programado, orden por fecha)
- [ ] Feed "Actividad reciente" (últimos 10 registros de siniestro_timeline)
- [ ] Manejo de estado vacío (cuando no hay datos)

**Criterio de éxito**: Dashboard muestra datos reales o placeholders correctos.

---

### FASE 2 — Módulo de Siniestros (lista + nuevo)
**Subplan**: `Plan_02_Siniestros_Lista_Nuevo.md`  
**Depende de**: Fase 0  
**Estimado**: 2 sesiones (4-6 horas)

**Parte A — Lista**:
- [ ] Tabla con columnas: No., Fecha, Vehículo (placa + marca), Cliente, Tipo Daño, Severidad, Total Q., Estado, Acción
- [ ] Búsqueda en tiempo real (placa, cliente, número)
- [ ] Filtro por estado (dropdown)
- [ ] Filtro por severidad (dropdown)
- [ ] Badges de color por severidad y estado (según CLAUDE.md)
- [ ] Paginación o scroll infinito
- [ ] Botón "+ Registrar siniestro"
- [ ] Click en fila → navega a detalle

**Parte B — Nuevo siniestro (wizard 3 pasos)**:
- [ ] Step 0: Select de placa → llama GET /vehiculos → auto-completa tipo/marca/línea/año
  - Si hay contrato activo → auto-completa datos del cliente
- [ ] Step 1: Datos del cliente (nombre, DPI, teléfono, correo) — pre-llenados si aplica
- [ ] Step 2: Datos del daño (fecha, lugar, tipo_dano, severidad, descripción)
- [ ] Validación de campos obligatorios por paso
- [ ] Al guardar: INSERT en `siniestros` (estado=`registrado`)
- [ ] El trigger genera el número SIN-YYYY-NNN automáticamente
- [ ] Redirect a detalle del siniestro recién creado
- [ ] Toast de éxito o error

**Criterio de éxito**: Se puede registrar un siniestro completo y aparece en la lista.

---

### FASE 3 — Detalle de siniestro (estado + timeline)
**Subplan**: `Plan_03_Siniestro_Detalle.md`  
**Depende de**: Fase 2  
**Estimado**: 2 sesiones (4-6 horas)

**Tareas**:
- [ ] Header: número, placa, marca, cliente, estado (badge grande)
- [ ] Botones de acción según estado actual:
  - `registrado` → "Solicitar cotizaciones" → pasa a `cotizando`
  - `cotizando` → (se gestiona en sección Cotizaciones)
  - `proforma_emitida` → "Aprobar proforma" → pasa a `proforma_aprobada`
  - `proforma_aprobada` → "Ingresar a taller" → pasa a `en_reparacion` + INSERT taller_ingresos + PATCH Odoo
  - `en_reparacion` → "Marcar como reparado" → pasa a `reparado` + UPDATE taller_ingresos.fecha_egreso + PATCH Odoo
  - `reparado` → "Registrar cobro" → pasa a `en_cobro` / "Absorbe Pass" / "Cubre seguro"
  - `en_cobro` → "Cerrar siniestro" → pasa a `cerrado`
  - Cualquier estado → "Anular" (solo admin/agente_senior)
- [ ] Sección "Taller": tabla de ingresos con fecha_ingreso, fecha_egreso, días, semáforo de color
- [ ] Timeline visual: lista de siniestro_timeline ordenado por fecha, con iconos por estado
- [ ] Confirmación antes de cambios de estado críticos (modal)

**Criterio de éxito**: Se puede navegar por los estados del siniestro con las acciones correctas.

---

### FASE 4 — Cotizaciones y proforma
**Subplan**: `Plan_04_Cotizaciones_Proforma.md`  
**Depende de**: Fase 3  
**Estimado**: 3 sesiones (6-9 horas)

**Parte A — Cotizaciones**:
- [ ] Sección "Cotizaciones" dentro del detalle de siniestro (visible cuando estado=`cotizando`)
- [ ] Modal "Solicitar cotización": seleccionar 1-3 talleres del catálogo
  - INSERT en `cotizaciones` por cada taller seleccionado
- [ ] Formulario de ingreso de líneas por cotización:
  - Tipo (repuesto/mano de obra/otro)
  - Descripción (con búsqueda en `repuestos_catalogo` para autocompletar precio)
  - Cantidad + precio unitario → subtotal calculado
  - Los totales se actualizan automáticamente vía trigger
- [ ] Comparador lado a lado: tabla con cotizaciones de cada taller en columnas
  - Highlight visual al taller con menor total_general
- [ ] Botón "Aprobar cotización" por cada taller:
  - UPDATE cotización ganadora → `aprobada`
  - UPDATE resto → `rechazada`
  - UPDATE siniestro.taller_id
  - UPDATE siniestro.estado → `proforma_emitida`

**Parte B — Proforma**:
- [ ] Sección "Proforma" visible cuando hay cotización aprobada
- [ ] Muestra el desglose de la cotización aprobada (líneas + totales)
- [ ] Campos editables: `monto_cliente` (lo que se cobra al cliente)
- [ ] Cálculo de `costo_pass` y `margen`
- [ ] Botón "Exportar PDF" (opcional: usar `window.print()` o librería)

**Criterio de éxito**: Flujo completo desde cotizando → proforma aprobada con comparador funcional.

---

### FASE 5 — Cobros
**Subplan**: `Plan_05_Cobros.md`  
**Depende de**: Fase 4  
**Estimado**: 1 sesión (2-3 horas)

**Tareas**:
- [ ] Sección "Cobro" dentro del detalle de siniestro (visible desde estado=`reparado`)
- [ ] Formulario de cobro:
  - Monto total (pre-llenado con monto_cliente del siniestro)
  - Número y serie de factura FEL (Infile)
  - Fecha de factura
  - Boleta de pago + fecha de pago
- [ ] Opciones alternativas: "Absorbe Pass" / "Cubre seguro"
- [ ] Pipeline de estados del cobro: pendiente → informado → facturado → pagado
- [ ] Tabla de historial de cobros del siniestro

**Criterio de éxito**: Se puede registrar un cobro completo con todos los campos de FEL.

---

### FASE 6 — Módulo de Servicios de Mantenimiento
**Subplan**: `Plan_06_Servicios_Mantenimiento.md`  
**Depende de**: Fase 0 (migration 002 ejecutada)  
**Estimado**: 3 sesiones (6-9 horas)  
**Nota**: Puede desarrollarse en paralelo a Fases 3-5 si hay capacidad

**Parte A — Lista de servicios**:
- [ ] Tabla con columnas: No. Orden, Fecha programada, Vehículo, Tipo servicio, Taller, Total Q., Estado, Acción
- [ ] Búsqueda por placa / número
- [ ] Filtro por tipo_servicio y estado
- [ ] Badges de tipo y estado (según ClaudeMant.md)
- [ ] Botón "+ Nuevo servicio"

**Parte B — Nuevo servicio**:
- [ ] Select de placa → auto-completa datos del vehículo (misma API Odoo)
- [ ] Select de tipo de servicio
- [ ] Select de taller (catálogo, un solo taller)
- [ ] Fecha programada + kilometraje
- [ ] Descripción / observaciones
- [ ] Tabla de líneas de detalle (repuestos, mano de obra, otros)
- [ ] Lógica de `requiere_autorizacion`:
  - Auto-activa si tipo=`servicio_mayor` o total > Q5,000
- [ ] INSERT en `ordenes_servicio` con estado `programado`

**Parte C — Detalle del servicio**:
- [ ] Header: número, placa, tipo servicio, estado (badge)
- [ ] Botones de acción según estado:
  - `programado` + requiere_autorizacion → "Autorizar" (→ `aprobado`, captura autorizado_por)
  - `programado` + no requiere → "Enviar a taller" (→ `en_proceso` + INSERT taller_ingresos + PATCH Odoo)
  - `aprobado` → "Enviar a taller" (→ `en_proceso` + INSERT taller_ingresos + PATCH Odoo)
  - `en_proceso` → "Completar servicio" (→ `completado` + UPDATE taller_ingresos.fecha_egreso + PATCH Odoo → "Disponible")
  - Cualquier estado → "Cancelar" (admin)
- [ ] Sección detalle de líneas con totales
- [ ] Sección Taller con tracking días
- [ ] Timeline de cambios de estado
- [ ] Mapeo correcto de tipo servicio a status Odoo (según tabla en ClaudeMant.md)

**Criterio de éxito**: Flujo completo programado → en_proceso → completado con integración Odoo.

---

### FASE 7 — Flota Vehicular
**Subplan**: `Plan_07_Flota_Vehicular.md`  
**Depende de**: Fase 0 (variables de entorno backend configuradas)  
**Estimado**: 1 sesión (2-3 horas)

**Tareas**:
- [ ] Vista Kanban: columnas por status Odoo
  - Disponible (verde) | Rentado (azul) | En Reparación (rojo) | En Mantenimiento (amarillo) | Servicios Varios (amarillo) | Asignado al personal (gris) | No Asegurado (naranja)
- [ ] Contadores en header por estado
- [ ] Card por vehículo: placa, marca/línea, año, tipo
- [ ] Click en card → modal con datos completos desde `/vehiculo/:placa`
  - Datos de flota (odómetro, VIN, color, modelo)
  - Contrato activo si lo hay
- [ ] Filtro por tipo de vehículo (Sedán, SUV, Pickup, Microbús)
- [ ] Buscador por placa

**Criterio de éxito**: Se ven todos los vehículos de la flota agrupados por estado.

---

### FASE 8 — Catálogos
**Subplan**: `Plan_08_Catalogos.md`  
**Depende de**: Fase 0  
**Estimado**: 2 sesiones (4-6 horas)

**Parte A — Talleres**:
- [ ] Tabla de talleres con columnas: Nombre, Contacto, Teléfono, Dirección, Activo
- [ ] CRUD completo (solo admin/agente_senior):
  - Crear taller (modal con form)
  - Editar taller
  - Activar/desactivar (no eliminar)
- [ ] Datos de seed ya existentes en Supabase (9 talleres)

**Parte B — Repuestos**:
- [ ] Tabla con columnas: Código, Nombre, Marca, Línea/Modelo, Años, Precio Ref., Vigencia, Activo
- [ ] Indicador "Vigente" / "Revisar" / "Desactualizado" basado en `precio_actualizado_at`:
  - < 30 días → Vigente (verde)
  - 30-90 días → Revisar (amarillo)
  - > 90 días → Desactualizado (rojo)
- [ ] CRUD completo (solo admin/agente_senior):
  - Código auto-generado REP-NNN
  - Crear / editar / activar-desactivar
- [ ] Filtros: búsqueda por código/nombre, filtro por marca, filtro por vigencia

**Criterio de éxito**: Admin puede gestionar talleres y repuestos del catálogo.

---

### FASE 9 — Repositorio de Documentos
**Subplan**: `Plan_09_Repositorio.md`  
**Depende de**: Fase 2 (siniestros) y Fase 6 (servicios)  
**Estimado**: 2 sesiones (4-6 horas)

**Tareas**:
- [ ] Tabla global de documentos con columnas: Nombre, Tipo, Vinculado a (siniestro/servicio), Fecha, Tamaño, Acciones
- [ ] Filtros: por tipo de documento, por fecha, por siniestro/servicio
- [ ] Upload de documentos:
  - Drag & drop (zona de carga) o click para seleccionar
  - Tipos permitidos: PDF, JPEG, PNG, WebP (max 10MB)
  - Path en Storage: `{siniestro_numero o srv_numero}/{tipo}/{timestamp}_{filename}`
  - INSERT en tabla `documentos` con storage_path y metadatos
- [ ] Visualización:
  - PDFs: abrir en nueva pestaña (signed URL de Supabase Storage)
  - Imágenes: preview en modal
- [ ] Descarga de documentos
- [ ] Integración con detalle de siniestro y detalle de servicio (sección "Documentos")

**Criterio de éxito**: Se pueden subir, ver y descargar documentos desde el repositorio y desde los detalles.

---

### FASE 10 — Reportes y KPIs
**Subplan**: `Plan_10_Reportes.md`  
**Depende de**: Todas las fases anteriores  
**Estimado**: 2 sesiones (4-6 horas)

**Sección 1 — Siniestros**:
- [ ] Total siniestros del año / mes actual
- [ ] Promedio monto por siniestro
- [ ] Monto total cobrado vs monto absorbido por Pass
- [ ] Tabla: resumen por tipo de vehículo (# siniestros, desglose severidad, total Q.)
- [ ] Top 5 vehículos con más siniestros
- [ ] Distribución por tipo de daño (gráfica de pastel o barras)
- [ ] Siniestros por mes (gráfica de barras)

**Sección 2 — Mantenimiento**:
- [ ] Total gastado en servicios (mes / año)
- [ ] Desglose por tipo de servicio
- [ ] Top 5 vehículos con más gasto en mantenimiento
- [ ] Comparativa: costo daños vs costo mantenimiento

**Filtros**:
- [ ] Rango de fechas (inicio / fin)
- [ ] Tipo de vehículo

**Librería de charts**: Recharts (ligera, compatible con React 19)

**Criterio de éxito**: El módulo de reportes muestra datos reales con filtros funcionales.

---

## Orden recomendado de implementación

```
Fase 0 (Entorno)                    ← PRIMERO, bloqueante
    │
    ├── Fase 1 (Dashboard)           ← Día 1-2
    ├── Fase 2 (Siniestros lista/nuevo) ← Día 2-3
    ├── Fase 3 (Siniestro detalle)   ← Día 3-4
    ├── Fase 4 (Cotizaciones)        ← Día 4-5
    ├── Fase 5 (Cobros)              ← Día 5
    ├── Fase 6 (Servicios)           ← Día 5-7   ← puede solaparse con Fase 3-5
    ├── Fase 7 (Flota)               ← Día 7-8
    ├── Fase 8 (Catálogos)           ← Día 8-9
    ├── Fase 9 (Repositorio)         ← Día 9-10
    └── Fase 10 (Reportes)           ← Día 10-12
```

**Estimación total**: 10-15 sesiones de trabajo (20-35 horas de desarrollo)

---

## Componentes reutilizables a construir desde temprano

Estos componentes se necesitan en múltiples módulos. Conviene crearlos bien desde la primera vez:

| Componente | Se usa en |
|-----------|---------|
| `Badge.jsx` | Siniestros, Servicios, Catálogos |
| `StatusBadge.jsx` | Siniestros, Servicios |
| `DataTable.jsx` | Todos los módulos de lista |
| `ConfirmModal.jsx` | Cambios de estado, eliminaciones |
| `FormModal.jsx` | Catálogos, Cobros |
| `LineItemEditor.jsx` | Cotizaciones, Servicios (líneas de detalle) |
| `VehiculoSelector.jsx` | Nuevo Siniestro, Nuevo Servicio |
| `TimelineItem.jsx` | Detalle Siniestro, Detalle Servicio |
| `DocumentUpload.jsx` | Repositorio, Detalle Siniestro, Detalle Servicio |
| `TallerIngreso.jsx` | Detalle Siniestro, Detalle Servicio |

---

## Convenciones a mantener en todo el desarrollo

- Idioma: inglés para código, español para labels y mensajes al usuario
- Sin comentarios salvo WHY no obvios
- Toast notifications para errores y confirmaciones
- Fechas: almacenar UTC, mostrar en Guatemala (UTC-6)
- Placas: siempre UPPERCASE
- Supabase queries directas en componentes o hooks; no crear capa de abstracción extra
- Error handling: try/catch con toast, no alert()
- Rutas: definidas en `App.jsx`, no en los componentes
- Formularios: useState local, sin librería de formularios (evitar overhead)

---

## Subplanes creados

| Archivo | Estado |
|---------|--------|
| `plans/Implementar_backend_frontend.md` | ✅ Creado — Sesión 1 |
| `plans/Plan_General_Implementacion.md` | ✅ Este documento |
| `plans/Plan_00_Entorno.md` | ⬜ Por crear |
| `plans/Plan_01_Dashboard.md` | ⬜ Por crear |
| `plans/Plan_02_Siniestros_Lista_Nuevo.md` | ⬜ Por crear |
| `plans/Plan_03_Siniestro_Detalle.md` | ⬜ Por crear |
| `plans/Plan_04_Cotizaciones_Proforma.md` | ⬜ Por crear |
| `plans/Plan_05_Cobros.md` | ⬜ Por crear |
| `plans/Plan_06_Servicios_Mantenimiento.md` | ⬜ Por crear |
| `plans/Plan_07_Flota_Vehicular.md` | ⬜ Por crear |
| `plans/Plan_08_Catalogos.md` | ⬜ Por crear |
| `plans/Plan_09_Repositorio.md` | ⬜ Por crear |
| `plans/Plan_10_Reportes.md` | ⬜ Por crear |
