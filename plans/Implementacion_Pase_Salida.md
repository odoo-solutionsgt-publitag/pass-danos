# Implementación — Módulo Pase de Salida Interno

**Fecha de inicio**: 2026-06-16  
**Fecha de cierre**: 2026-06-16  
**Estado**: ✅ Implementado en producción  
**Plan original**: [Plan_Pase_de_salida.md](Plan_Pase_de_salida.md)

**Commits relevantes** (en orden cronológico):

| Hash | Descripción |
|------|-------------|
| `715412a` | feat: nuevo módulo Pase de Salida Interno (PASI-YYYY-NNNN) — implementación base |
| `cb5c477` | fix: simplificar form y corregir fetch PDF |
| `6b01fd7` | fix: mover PDF a `frontend/public/pdfs/` (ubicación correcta para Vite) |
| `976d641` | fix: campos faltantes en PDF y mayúsculas |
| `078b57b` | feat: campo Km en form solo para Daños |
| `82d363b` | feat: lugar editable en Daños + datos vehículo desde Odoo + formato fecha/hora/combustible |
| `9d1c002` | fix: revertir campos Odoo inexistentes + mejorar `parseProductName` |
| `809cccc` | feat: pase independiente — gasolinera, diligencias, asignado al personal |
| `e613bf0` | feat: historial en Flota + Bitácora + botón + auto-abrir modal por placa |
| `5323146` | feat: renombrar plantilla PDF → `Pase-Salida-Interno-Pass-2026.pdf` |
| `50bb1d4` | feat: PDF de dos páginas para pases de taller (Daños/Servicios) |
| `bf0bf82` | chore: actualizar plantilla `Pase-Salida-Contrato-Interno-Pass-2026.pdf` (ajuste diseño) |
| `aad6963` | fix: excluir anulados del KPI "Vehículos en reparación" + renombrar botón "Nuevo Servicio" |

---

## Objetivo de este documento

Describir cómo quedó construido el módulo después de la iteración completa — incluyendo desviaciones del plan, decisiones tomadas en caliente y gotchas. El plan original describe la intención; este documento describe la realidad.

---

## Resumen ejecutivo

| Aspecto | Descripción |
|---------|-------------|
| Tabla nueva | `pases_salida` con correlativo `PASI-YYYY-NNNN` |
| Enums nuevos | `motivo_pase_salida` (5 valores) · `estado_pase_salida` (3 valores) |
| Orígenes | Vinculado a Daño **o** Servicio **o** independiente (pase autónomo) |
| PDF | Dos plantillas: `Pase-Salida-Interno-Pass-2026.pdf` (1 pág) y `Pase-Salida-Contrato-Interno-Pass-2026.pdf` (2 págs) |
| Llenado PDF | `pdf-lib` cargado dinámicamente, sin guardar en Storage |
| Sincronización Odoo | Solo en pases independientes (opcional, con flag `cambio_status_odoo`) |
| Acceso desde UI | `PaseSalidaSection` en Daño/Servicio · `/pases-salida` global · botón en Flota y Bitácora |

---

## Archivos creados o modificados

### Base de datos

| Archivo | Tipo | Contenido |
|---------|------|-----------|
| `db/009_pases_salida.sql` | Nuevo | Tabla `pases_salida`, 2 enums, triggers correlativo + updated_at, índices únicos parciales, RLS |
| `db/010_pase_independiente.sql` | Nuevo | Relajar constraint de origen, `contrato_referencia` nullable, columna `cambio_status_odoo` |

### Backend

| Archivo | Tipo | Cambio |
|---------|------|--------|
| `backend/index.js` | Modificado | Añadir `x_studio_color_vehiculo` a los `fields` de `GET /vehiculos` y `GET /vehiculo/:placa` |
| `backend/index.js` | Modificado | `parseProductName(name, placa, tipoVehiculo)` — tercer parámetro que salta el prefijo de tipo (`PICKUP`, `SUV`, etc.) al extraer marca/línea |

### Frontend — nuevos archivos

| Archivo | Descripción |
|---------|-------------|
| `frontend/src/lib/pase-pdf.js` | Llenado AcroForm con `pdf-lib`. Selección de plantilla según `motivo_salida`. Formatos: fecha `dd/mm/yyyy`, hora `HH:MM HRS.`, combustible con sufijo `TANQUE` |
| `frontend/src/components/PaseSalidaSection.jsx` | Card embebida en `SiniestroDetalle` y `ServicioDetalle`. Muestra el pase del registro (o formulario de creación si no existe). Incluye formulario de cierre y botón Ver/Imprimir |
| `frontend/src/pages/PaseSalida.jsx` | Página `/pases-salida`. Lista global de todos los pases. Modal "Nuevo Pase" para pases independientes con autocompletado de placa, motivo, cambio de status Odoo opcional, y auto-impresión al crear |

### Frontend — archivos modificados

| Archivo | Cambio |
|---------|--------|
| `frontend/src/pages/SiniestroDetalle.jsx` | Importa y renderiza `PaseSalidaSection` con `motivoPreset="taller_reparacion"` y `tallerNombre` del siniestro |
| `frontend/src/pages/ServicioDetalle.jsx` | Importa y renderiza `PaseSalidaSection` con `motivoPreset="taller_servicio"` y `tallerNombre` del servicio |
| `frontend/src/pages/FlotaVehicular.jsx` | Botón amber "+ Pase" en el drawer de vehículo. Navega a `/pases-salida` con `state: { preloadPlaca }`. Sección "Historial de pases" con últimos 5 registros |
| `frontend/src/pages/BitacoraVehiculo.jsx` | Botón "Pase de salida" en acciones rápidas. Sección "Historial de Pases de Salida" con tabla completa |
| `frontend/src/components/Sidebar.jsx` | Ítem de menú "Pases de Salida" (ícono `ClipboardList`) en la sección principal |
| `frontend/src/components/Layout.jsx` | Botón "Nueva orden" renombrado a "Nuevo Servicio" |
| `frontend/src/pages/Dashboard.jsx` | KPI "Vehículos en reparación": query con join a `siniestros` y `ordenes_servicio` para excluir anulados/cerrados/completados/cancelados |

### PDFs (plantillas AcroForm)

| Archivo | Uso |
|---------|-----|
| `frontend/public/pdfs/Pase-Salida-Interno-Pass-2026.pdf` | Pases independientes (gasolinera, diligencias, asignado al personal) — 1 página |
| `frontend/public/pdfs/Pase-Salida-Contrato-Interno-Pass-2026.pdf` | Pases de taller desde Daño o Servicio — 2 páginas (Pase de Salida + Contrato de Taller) |
| `frontend/public/pdfs/Pase-Salida-Interno-Pass.pdf` | Versión anterior — conservada pero no usada |

---

## Modelo de datos

### Tabla `pases_salida`

```sql
id                  UUID PK
numero              TEXT UNIQUE NOT NULL    -- PASI-YYYY-NNNN (trigger)

-- Vínculo al origen (al menos uno debe ser NULL — se permiten ambos NULL para pases independientes)
siniestro_id        UUID FK → siniestros
orden_servicio_id   UUID FK → ordenes_servicio
CONSTRAINT chk_pase_origen: NOT (siniestro_id IS NOT NULL AND orden_servicio_id IS NOT NULL)

contrato_referencia TEXT NULL               -- "SIN-2026-042" ó "SRV-2026-017" (NULL en independientes)
estado              estado_pase_salida      -- abierto | cerrado | anulado
cambio_status_odoo  BOOLEAN DEFAULT FALSE   -- TRUE si se cambió x_studio_status_vehiculo en Odoo al crear

-- Vehículo (snapshot al momento de crear)
vehiculo_placa      TEXT NOT NULL
vehiculo_tipo       TEXT                    -- "TOYOTA PICK UP HI LUX 2025"
vehiculo_color      TEXT
odoo_product_id     INTEGER

-- Destino y piloto
lugar_taller        TEXT
motivo_salida       motivo_pase_salida NOT NULL
piloto_pass         TEXT NOT NULL

-- Datos de salida
combustible_salida  TEXT NOT NULL
kilometraje_salida  NUMERIC(10,0)
fecha_salida        DATE NOT NULL DEFAULT CURRENT_DATE
hora_salida         TEXT NOT NULL           -- 'HH:MM'

-- Datos de entrada (se completan al cerrar)
combustible_entrada TEXT
kilometraje_entrada NUMERIC(10,0)
fecha_entrada       DATE
hora_entrada        TEXT

-- Autorización y auditoría
usuario_responsable TEXT
registrado_por      UUID FK → auth.users
fecha_hora_sistema  TIMESTAMPTZ NOT NULL DEFAULT NOW()
created_at / updated_at TIMESTAMPTZ
```

### Constraint de origen — evolución

El constraint original en el plan exigía exactamente uno de los dos IDs (`siniestro_id XOR orden_servicio_id`). Durante la implementación de pases independientes se relajó a:

```sql
-- Plan original (009_pases_salida.sql):
CHECK ((siniestro_id IS NOT NULL AND orden_servicio_id IS NULL) OR
       (siniestro_id IS NULL AND orden_servicio_id IS NOT NULL))

-- Tras 010_pase_independiente.sql:
CHECK (NOT (siniestro_id IS NOT NULL AND orden_servicio_id IS NOT NULL))
-- Permite: ambos NULL (independiente), uno NOT NULL (vinculado)
```

### Índices únicos parciales

```sql
-- Solo un pase activo (no anulado) por Daño
CREATE UNIQUE INDEX uq_pase_siniestro ON pases_salida(siniestro_id)
  WHERE siniestro_id IS NOT NULL AND estado != 'anulado';

-- Solo un pase activo (no anulado) por Servicio
CREATE UNIQUE INDEX uq_pase_servicio ON pases_salida(orden_servicio_id)
  WHERE orden_servicio_id IS NOT NULL AND estado != 'anulado';
```

Los pases independientes (ambos IDs NULL) no tienen restricción de unicidad — se pueden crear N pases independientes para la misma placa.

### Enums

```sql
motivo_pase_salida: taller_reparacion | taller_servicio | gasolinera | diligencias | asignado_personal
estado_pase_salida: abierto | cerrado | anulado
```

---

## Selección de plantilla PDF

```js
// pase-pdf.js
const esTaller = pase.motivo_salida === 'taller_reparacion' || pase.motivo_salida === 'taller_servicio'
const pdfFile = esTaller
  ? 'Pase-Salida-Contrato-Interno-Pass-2026.pdf'   // 2 páginas (Pase + Contrato de Taller)
  : 'Pase-Salida-Interno-Pass-2026.pdf'            // 1 página (independiente)
```

Ambas plantillas usan **los mismos nombres de campos AcroForm** — el llenado es idéntico. La diferencia es solo visual (diseño de 2 páginas para uso del área de Talleres).

---

## Patrones de código clave

### Crear pase desde Daño/Servicio (`PaseSalidaSection`)

```js
const payload = {
  ...(esDano ? { siniestro_id: origen.id } : { orden_servicio_id: origen.id }),
  contrato_referencia: origen.numero,
  vehiculo_placa:      origen.placa,
  vehiculo_tipo:       vehiculoTipo,   // construido desde Odoo: tipo+marca+linea+año
  vehiculo_color:      vehiculoColor,  // desde x_studio_color_vehiculo
  odoo_product_id:     origen.odoo_product_id,
  motivo_salida:       motivoPreset ?? (esDano ? 'taller_reparacion' : 'taller_servicio'),
  lugar_taller:        esDano ? lugar.trim() || null : tallerNombre || null,
  piloto_pass:         piloto.trim(),
  combustible_salida:  combustible,
  kilometraje_salida:  km || null,
  fecha_salida:        fecha,          // fecha Guatemala (UTC-6)
  hora_salida:         hora,           // 'HH:MM'
  usuario_responsable: userName,
  estado:              'abierto',
}
```

### Crear pase independiente (`PaseSalida.jsx`)

El pase independiente no tiene `siniestro_id` ni `orden_servicio_id`. Adicionalmente:
- Permite cambiar `x_studio_status_vehiculo` en Odoo de forma **opcional** (radio Sí/No)
- Si `cambio_status_odoo = true`, al cerrar el pase se revierte el status a `"Disponible"`
- Auto-navega a la modal con placa pre-llenada si viene de Flota o Bitácora vía `useLocation().state.preloadPlaca`

```js
// Mapeo motivo → status Odoo (solo en pase independiente)
const MOTIVO_STATUS_ODOO = {
  gasolinera:        'Servicios Varios',
  diligencias:       'Servicios Varios',
  asignado_personal: 'Asignado al personal',
}
```

### `lugar_taller` — campo editable solo en Daños

- **Daños**: campo de texto libre editable (el taller puede no estar asignado aún al momento de crear el pase)
- **Servicios**: pre-llenado con el nombre del taller del servicio, mostrado como texto read-only en el form

### Formato de datos en PDF

| Campo | Formato | Ejemplo |
|-------|---------|---------|
| Fechas (`fecha_salida`, `fecha_entrada`) | `dd/mm/yyyy` | `16/06/2026` |
| Horas (`hora_salida`, `hora_entrada`) | `HH:MM HRS.` | `14:30 HRS.` |
| Timestamp sistema (`fecha_hora_sistema`) | `dd/mm/yyyy HH:MM HRS.` en Guatemala | `16/06/2026 14:30 HRS.` |
| Combustible | Sufijo `TANQUE` si no lo lleva | `3/8 TANQUE`, `FULL TANQUE` |
| Todos los campos | Uppercase | Automático vía `str.toUpperCase()` |

### Fix Dashboard KPI — "Vehículos en reparación"

El KPI original contaba `taller_ingresos` con `fecha_egreso IS NULL` sin filtrar por estado del daño/servicio. Esto causaba que registros vinculados a anulados/cerrados se contaran.

```js
// Nuevo: join + filtro client-side
const { data: tallerData } = await supabase
  .from('taller_ingresos')
  .select('id, siniestro_id, orden_servicio_id, siniestros(estado), ordenes_servicio(estado)')
  .is('fecha_egreso', null)

const enReparacion = (tallerData ?? []).filter(t => {
  if (t.siniestro_id)      return t.siniestros     && !['cerrado','anulado'].includes(t.siniestros.estado)
  if (t.orden_servicio_id) return t.ordenes_servicio && !['completado','cancelado'].includes(t.ordenes_servicio.estado)
  return false
}).length
```

---

## Desviaciones respecto al plan original

| # | Plan original | Realidad implementada |
|---|--------------|----------------------|
| 1 | Un solo tipo de PDF (`Pase-Salida-Interno-Pass.pdf`) | Dos plantillas: 1 página para independientes, 2 páginas (con Contrato de Taller) para daños/servicios |
| 2 | `lugar_taller` capturado al generar el pase (genérico) | Campo editable solo en Daños; en Servicios viene del registro (read-only) |
| 3 | `motivo_salida` capturado en el form | Preset desde el contexto (`motivoPreset`); en `PaseSalidaSection` no se muestra selector de motivo |
| 4 | Constraint origen: exactamente uno de los dos IDs | Relajado para permitir pases independientes (ambos NULL), via `010_pase_independiente.sql` |
| 5 | Campo `km` siempre capturado | Campo `km` solo visible en Daños cuando `kmInicial` no viene pre-llenado del registro |
| 6 | Sincronización Odoo: ninguna (todo delegado al flujo del Daño/Servicio) | Pases independientes pueden cambiar `x_studio_status_vehiculo` opcionalmente; al cerrar se revierte si `cambio_status_odoo = TRUE` |
| 7 | Sin acceso desde Flota o Bitácora | Botón "+ Pase" en drawer de Flota y acciones rápidas de Bitácora; auto-apertura de modal con placa pre-llenada |
| 8 | `PaseSalidaDetalle.jsx` como página separada opcional | No se creó página de detalle — todo se maneja desde la lista y desde los componentes embebidos |

---

## Problema resuelto: `parseProductName` y prefijo de tipo

El backend extraía incorrectamente la marca cuando el nombre del producto en Odoo incluye el tipo de vehículo como primer token:

```
"P-183KKQ PICKUP TOYOTA HI LUX 2024"
→ marca: "PICKUP"  (incorrecto)
→ linea: "TOYOTA HI LUX"
```

**Fix**: `parseProductName(name, placa, tipoVehiculo)` recibe el valor de `x_studio_tipo_de_vehiculo` como tercer parámetro. Si el primer token coincide con ese valor (o con una lista de tipos conocidos), lo salta:

```js
const TIPOS_VEHICULO_PREFIJO = [
  'PICKUP','PICK-UP','SEDAN','SEDÁN','SUV','VAN',
  'MICROBUS','MICROBÚS','MINIBUS','MINIBÚS','CAMION','CAMIÓN','BUS','CAMIONETA'
]
// Si el primer token es el tipo → start = 1, extrae marca desde tokens[1]
```

**Causa raíz**: al investigar este bug se descubrió también que `FlotaVehicular.jsx` incluía en su query a Odoo los campos inexistentes `x_studio_marca`, `x_studio_linea`, `x_studio_modelo`, lo que rompía toda la carga de la flota con error "Invalid field". Se eliminaron esos campos — la marca/línea se extrae en el backend desde el nombre del producto.

---

## Decisiones tomadas durante implementación

| # | Decisión | Motivo |
|---|----------|--------|
| 1 | PDF no se guarda en Supabase Storage | Generado al vuelo con `pdf-lib`; si se necesita reimprimir se regenera desde los datos guardados |
| 2 | `pdf-lib` se carga dinámicamente (`await import('pdf-lib')`) | Evita inflar el bundle inicial; se carga solo cuando el usuario va a imprimir |
| 3 | Verificación de magic bytes `%PDF` antes de parsear | Evita error confuso si el servidor devuelve HTML (ej. 404 con página de error) en lugar del PDF |
| 4 | `form.flatten()` antes de guardar | Los campos quedan "quemados" en el PDF; el receptor no puede modificarlos |
| 5 | Estado `anulado` es terminal | Coherente con el resto del sistema; la auditoría queda preservada |
| 6 | Km solo visible en Daños | En Servicios el km viene de `ordenes_servicio.kilometraje_actual` (pre-llenado); en Daños no siempre está disponible |
| 7 | Revertir status Odoo al cerrar pase independiente | Permite que operaciones que toman un vehículo "temporalmente" (gasolinera, diligencias) lo devuelvan a Disponible de forma automática al cerrar el pase |
| 8 | Auto-abrir modal con placa via `useLocation().state` | Evita que el usuario deba buscar la placa manualmente al navegar desde Flota o Bitácora |
| 9 | Un solo pase activo por Daño/Servicio (índice único parcial) | Evitar múltiples pases abiertos en paralelo para el mismo registro; si el pase está anulado, se puede crear uno nuevo |

---

## Gotchas y trampas conocidas

### `taller_ingresos` con `fecha_egreso = NULL` persiste si el daño/servicio es anulado
Cuando se anula un Daño o Servicio, el flujo no cierra automáticamente el `taller_ingreso` asociado. Esto causaba que el KPI "Vehículos en reparación" del Dashboard contara registros de anulados. Fix aplicado en `Dashboard.jsx` con filtro client-side; pero la causa raíz (falta de cierre automático de `taller_ingresos` al anular) sigue siendo técnicamente un issue menor.

### El PDF se sirve desde `frontend/public/pdfs/` — Vite lo copia tal cual
El archivo debe estar en `frontend/public/pdfs/`, NO en `public/pdfs/` de la raíz del monorepo. Vite copia `frontend/public/` como assets estáticos al build. Un error en la primera iteración colocó el PDF en la raíz — causa que no se encontrara en producción.

### `parseProductName` puede fallar con nombres muy cortos o sin marca
Si `product.template.name` tiene solo la placa, o formato inesperado, la función devuelve `{ marca: '', linea: '', anio: null }`. El pase aún se crea; los campos quedan vacíos en el PDF.

### Pases independientes sin `contrato_referencia`
`contrato_referencia` es `NULL` en pases independientes. Cualquier query o componente que asuma este campo como siempre presente debe usar `?.` o `|| ''`. En el PDF, el campo `contrato_referencia` simplemente queda en blanco.

### `cambio_status_odoo` = TRUE requiere que `odoo_product_id` esté disponible
Al crear el pase independiente se hace autocomplete de la placa vía `GET /vehiculos`. Si el vehículo no se encuentra en Odoo (nombre de placa diferente al esperado), `odoo_product_id` puede quedar NULL. En ese caso, aunque el usuario haya indicado "Sí cambiar status", el PATCH a Odoo falla silenciosamente y `cambio_status_odoo` se guarda como `FALSE`.

---

## Flujo completo implementado

```
[SiniestroDetalle / ServicioDetalle]
    └─ PaseSalidaSection (embebido)
           ├─ loadPase() → busca pase abierto del registro
           ├─ Sin pase → botón "Generar Pase de Salida"
           │       ├─ Form: Lugar (editable en Daño) · Piloto · Combustible · Km (solo Daño)
           │       ├─ crearPase() → INSERT pases_salida
           │       └─ imprimirPasePDF(data) → abre Contrato Interno (2 págs) en nueva pestaña
           └─ Con pase → resumen + botones:
                   ├─ Ver/Imprimir PDF
                   ├─ Cerrar pase → modal (combustible entrada, km entrada) → UPDATE estado=cerrado
                   └─ Anular → UPDATE estado=anulado

[PaseSalida.jsx — /pases-salida]
    ├─ Tabla global de todos los pases (todos los orígenes)
    ├─ Filtros: estado, búsqueda placa/número
    ├─ Botón "Nuevo Pase" (independiente)
    │       ├─ Form: Placa (autocomplete) · Motivo · Piloto · Combustible · Km · Lugar
    │       ├─ Radio "¿Cambiar status en Odoo?" (Sí/No)
    │       ├─ crearPaseIndependiente() → INSERT pases_salida (sin siniestro_id ni orden_servicio_id)
    │       ├─ Si cambio_status_odoo → PATCH /vehiculo/:id/status
    │       └─ imprimirPasePDF(data) → abre Pase Interno (1 pág) en nueva pestaña
    └─ Botón "Cerrar pase" o "Reimprimir" por fila
           └─ confirmarCierre(): si cambio_status_odoo → PATCH status → "Disponible"

[FlotaVehicular.jsx — drawer de vehículo]
    └─ Botón amber "+ Pase"
           └─ navigate('/pases-salida', { state: { preloadPlaca: vehiculo.placa } })

[BitacoraVehiculo.jsx]
    └─ Botón "Pase de salida" en acciones rápidas
           └─ navigate('/pases-salida', { state: { preloadPlaca: placa } })
```

---

## Métricas de éxito alcanzadas

- [x] Tabla `pases_salida` con correlativo `PASI-YYYY-NNNN` en producción
- [x] PDF AcroForm llenado correctamente con todos los campos del plan
- [x] Pase embebido en Daño y Servicio (`PaseSalidaSection`)
- [x] Lista global `/pases-salida` funcional
- [x] Pases independientes (gasolinera, diligencias, asignado al personal)
- [x] Cambio de status Odoo opcional en pases independientes con revert al cerrar
- [x] Botón + Pase en Flota Vehicular con apertura automática de modal y placa pre-llenada
- [x] Historial de pases en Bitácora del Vehículo
- [x] Dos plantillas PDF: 1 página (independientes) · 2 páginas (Daño/Servicio — incluye Contrato de Taller)
- [x] `parseProductName` corregido para vehículos con tipo como primer token del nombre
- [x] KPI "Vehículos en reparación" corregido — excluye anulados/cerrados
- [x] Botón header renombrado "Nueva orden" → "Nuevo Servicio"
