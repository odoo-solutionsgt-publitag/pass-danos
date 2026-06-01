# Plan — Pre-Diagnóstico / Diagnóstico (3 campos operacionales nuevos)

**Estado**: 📋 Pendiente de aprobación
**Origen**: Requerimiento operacional — visibilidad granular de la etapa real del daño en el flujo de inspección
**Prioridad**: Alta
**Estimado**: 1 sesión (2 – 3 horas)
**Fase**: Post-Fase 2

---

## Objetivo

Agregar 3 campos al registro de **daño** para visibilidad operacional fina:

1. **Ubicación física del vehículo**: dónde está físicamente (Pass, Taller, Otro)
2. **Estado del checking**: en qué etapa del proceso de inspección/reparación está (6 estados)
3. **Disponibilidad para renta**: si Pass puede o no rentar el vehículo en esta condición

Estos campos **complementan** los workflows existentes (`estado` administrativo y `taller_ingresos`), no los reemplazan.

---

## Diseño detallado de cada campo

### 1. Ubicación del vehículo

**Enum nuevo** `ubicacion_vehiculo`:
- `pass` — En instalaciones de Pass
- `taller` — En taller proveedor
- `otro` — Otra ubicación (con campo opcional de texto libre)

**Columna**: `siniestros.ubicacion_vehiculo` enum default `'pass'`
**Columna complementaria**: `siniestros.ubicacion_detalle TEXT` (solo se llena si `ubicacion = 'otro'`)

**Comportamiento**:
- Editable durante todo el ciclo de vida (no solo en el wizard)
- Cuando un vehículo ingresa formalmente al taller (`taller_ingresos`), se debería poder **auto-actualizar** a `taller`. Pero también permitir override manual.

### 2. Estado del Checking (workflow operacional)

**Enum nuevo** `estado_checking_dano` con 6 valores:

| # | Valor | Etiqueta | Significado |
|---|-------|----------|-------------|
| 1 | `pre_diagnostico` | Pre-Diagnóstico | Recién registrado, no se ha inspeccionado a fondo |
| 2 | `diagnostico_cotizacion` | Diagnóstico / Cotización | Inspeccionado, solicitando cotizaciones |
| 3 | `reparacion` | Reparación | En proceso de reparación en el taller |
| 4 | `revision_final` | Revisión Final | Terminada la reparación, validando calidad |
| 5 | `entrega_proveedor` | Entrega del Proveedor | El taller devolvió el vehículo reparado a Pass |
| 6 | `dano_completo` | Daño Completo (Pérdida Total) | El pre-diagnóstico indicó que NO tiene reparación |

**Importante**: `dano_completo` **NO es el endpoint natural del flujo**, es un **camino alterno** para pérdidas totales detectadas en el pre-diagnóstico del proveedor.

```
Flujo normal:
  pre_diagnostico → diagnostico_cotizacion → reparacion
    → revision_final → entrega_proveedor (vehículo regresa OK)

Flujo pérdida total:
  pre_diagnostico → diagnostico_cotizacion → dano_completo
    (el vehículo NO se reparará, se da por perdido)
```

**Columna**: `siniestros.estado_checking` enum default `'pre_diagnostico'`
**Auditoría**: cada cambio queda en `audit_log` (ya automático por el trigger global)

### 3. Disponibilidad para renta — SÍ sincroniza con Odoo

**Columna**: `siniestros.disponible_renta BOOLEAN` default `FALSE`
- Valores: `Disponible` (TRUE) / `No Disponible` (FALSE)
- Default `FALSE` porque normalmente un daño implica indisponibilidad temporal
- Editable en todo momento

**Sincronización automática con Odoo** (confirmado en Q1):

| Cambio en la app | Acción en Odoo (`x_studio_status_vehiculo`) |
|------------------|--------------------------------------------|
| `disponible_renta` se pone en `FALSE` (No Disponible) | → "En Reparación" |
| `disponible_renta` se pone en `TRUE` (Disponible) | → "Disponible" |
| Al crear el daño con `disponible_renta = FALSE` (default) | → "En Reparación" |

**Sincronización al cambiar `estado_checking`**:

| Cambio de estado_checking | Acción sugerida |
|---------------------------|-----------------|
| → `entrega_proveedor` | Sugerir al usuario marcar `disponible_renta = TRUE` (el vehículo regresó OK del taller); el toggle dispara la sync a Odoo |
| → `dano_completo` (pérdida total) | El vehículo se queda en `disponible_renta = FALSE` permanentemente |

Para mantener todo manual (Q2 — sin automatizar), **el cambio a `entrega_proveedor` NO toca automáticamente `disponible_renta`**. El usuario lo decide explícitamente con el toggle. Sin embargo, mostraremos un **hint visual** en la UI: "Si el vehículo regresó listo del taller, considera marcarlo como Disponible".

**Implementación técnica**:
- El toggle `disponible_renta` en el frontend hace 2 llamadas en paralelo:
  1. `supabase.from('siniestros').update({ disponible_renta })`
  2. `updateVehiculoStatus(odoo_product_id, disponible_renta ? 'Disponible' : 'En Reparación')` (best-effort, no bloquea si Odoo falla)
- Si Odoo falla, el cambio en la app sí persiste; se muestra warning toast: "No se pudo sincronizar el estado a Odoo, reintentar después"

---

## Relación con los workflows existentes

| Campo | Workflow existente | Relación |
|-------|-------------------|----------|
| `estado` (existente) | Registrado → Cotizando → ... → Cerrado | **Workflow administrativo / financiero** |
| `estado_checking` (nuevo) | Pre-Diagnóstico → ... → Daño Completo | **Workflow operacional / técnico** |

**No se reemplazan, son ortogonales**. Un mismo daño puede estar:
- `estado = en_reparacion` (admin: aprobada proforma, ingresado a taller)
- `estado_checking = revision_final` (operacional: la reparación está casi lista)

Esto da visibilidad granular: el admin sabe "en reparación", el técnico sabe "ya estamos en revisión final".

---

## Modelo de datos

### SQL — `db/007_predominio_checking.sql`

```sql
BEGIN;

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE ubicacion_vehiculo AS ENUM ('pass', 'taller', 'otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_checking_dano AS ENUM (
    'pre_diagnostico',
    'diagnostico_cotizacion',
    'reparacion',
    'revision_final',
    'entrega_proveedor',
    'dano_completo'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Columnas en siniestros
ALTER TABLE siniestros
  ADD COLUMN IF NOT EXISTS ubicacion_vehiculo ubicacion_vehiculo NOT NULL DEFAULT 'pass',
  ADD COLUMN IF NOT EXISTS ubicacion_detalle  TEXT,
  ADD COLUMN IF NOT EXISTS estado_checking    estado_checking_dano NOT NULL DEFAULT 'pre_diagnostico',
  ADD COLUMN IF NOT EXISTS disponible_renta   BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN siniestros.ubicacion_vehiculo IS
  'Ubicación física actual del vehículo: pass | taller | otro';
COMMENT ON COLUMN siniestros.ubicacion_detalle IS
  'Texto libre si ubicacion=otro (ej: "agencia Mercedes Zona 9")';
COMMENT ON COLUMN siniestros.estado_checking IS
  'Etapa operacional del proceso de inspección/reparación.';
COMMENT ON COLUMN siniestros.disponible_renta IS
  'Si Pass puede o no rentar el vehículo en esta condición. FALSE por default.';

-- 3. Permisos (consistente con el resto)
-- (las columnas heredan los grants de la tabla, no se requiere acción)

COMMIT;
```

### ¿Se aplica también a `ordenes_servicio`?

**Decisión por defecto**: NO en esta iteración.

Razón: los servicios son mantenimiento preventivo/correctivo programado, no daños imprevistos. El concepto de "Pre-Diagnóstico" no aplica igual. Si más adelante se requiere, se agrega en otra iteración con sus propios estados.

---

## UI — cambios en el frontend

### A. Wizard `SiniestroNuevo` — paso 3

Agregar después de "Forma de pago anticipada", antes del botón "Registrar daño":

```
┌─────────────────────────────────────────────────────────────────┐
│ Ubicación del vehículo                                          │
│ [● PASS]  [○ Taller]  [○ Otro]                                  │
│ [campo de texto opcional si "Otro"]                             │
│                                                                 │
│ Estado del checking                                             │
│ [Pre-Diagnóstico ▼]   (default, todos los nuevos arrancan aquí)│
│                                                                 │
│ ¿Disponible para renta?                                         │
│ [○ Disponible]  [● No Disponible]                               │
└─────────────────────────────────────────────────────────────────┘
```

- 3 radio-cards estilo "Forma de pago" para Ubicación
- Select normal para Estado del checking
- 2 radio-cards para Disponible / No Disponible
- Defaults razonables: `pass`, `pre_diagnostico`, `FALSE`

### B. Detalle del daño (`SiniestroDetalle`)

Agregar nuevo bloque editable **"Información operacional"** ubicado entre "Detalle del daño" y la sección de Cotizaciones:

```
┌─────────────────────────────────────────────────────────────────┐
│ 🛠 Información operacional                          [Editar]    │
├─────────────────────────────────────────────────────────────────┤
│ Ubicación        Estado del checking         Disponible renta   │
│ Pass / Taller    Pre-Diagnóstico ▼          ● Disponible        │
│                                              ○ No Disponible    │
└─────────────────────────────────────────────────────────────────┘
```

Como un componente nuevo `InfoOperacional` que se reutiliza, similar a `FechasTaller`.

### C. Lista de daños (`Siniestros`)

Agregar columna opcional o badge inline para `estado_checking` (al lado del `estado` existente).

Si la tabla se vuelve muy ancha, considerar mostrar solo el badge `estado_checking` y ocultar el `estado` admin a un tooltip o detalle.

### D. Reporte Diario

Agregar columna **"Etapa checking"** entre `MOTIVO` y `OBSERVACIONES`. Útil para ver de un vistazo en qué etapa operacional está cada vehículo.

### E. Ficha imprimible (`FichaSiniestroPrint`)

Bloque nuevo "Estado operacional" con:
- Ubicación
- Estado del checking
- Disponible para renta

---

## Decisiones tomadas

| # | Decisión | Justificación |
|---|----------|---------------|
| 1 | 3 enums/columnas separadas, no JSONB | Tipado fuerte + filtros eficientes en SQL |
| 2 | Solo en `siniestros`, no en `ordenes_servicio` | Servicios tienen otro flujo operacional |
| 3 | `estado_checking` es ortogonal a `estado` existente | Workflow técnico vs administrativo |
| 4 | Default `disponible_renta = FALSE` | Un daño suele implicar indisponibilidad |
| 5 | `ubicacion = pass` default | La mayoría inicia en instalaciones Pass antes de mandarlo a taller |
| 6 | Auditoría automática vía trigger global | Sin código adicional |
| 7 | Editable en todo momento (no solo wizard) | Estos campos evolucionan durante el ciclo |
| 8 | `disponible_renta` SÍ sincroniza a Odoo (TRUE→Disponible, FALSE→En Reparación) | Confirmado en Q1 |
| 9 | `dano_completo` = pérdida total (no es endpoint del flujo, es camino alterno) | Confirmado por el usuario |
| 10 | El wizard crea el daño con `disponible_renta=FALSE` y sincroniza Odoo a "En Reparación" al instante | Operacionalmente, un daño implica indisponibilidad inmediata |

---

## Decisiones confirmadas con el usuario

### Q1 — Sincronización con Odoo `x_studio_status_vehiculo` ✅ SÍ sincroniza

`disponible_renta` actualiza directamente el campo de Odoo:
- `FALSE` → `"En Reparación"`
- `TRUE` → `"Disponible"`

Esto significa que cuando el proveedor devuelva la unidad reparada y el usuario marque `disponible_renta = TRUE`, Odoo refleja "Disponible" inmediatamente.

Detalles de implementación arriba en la sección "Disponibilidad para renta".

### Q2 — Automatizaciones del `estado_checking` ❌ NO automatizar

`estado_checking` queda 100% manual. No dispara cambios en `estado` admin ni en `taller_ingresos` ni en `disponible_renta`. Si la operación pide automatizaciones después de validar comportamiento real, se evalúan.

Sí se mostrará un **hint visual** (no automático) al pasar a `entrega_proveedor`: "Considera marcar Disponible para renta si el vehículo regresó OK".

### Q3 — Permisos ✅ Usar `puedeEditar`

Cualquier usuario con permiso de editar puede modificar los 3 campos. Sin nivel adicional.

### Q4 — Reporte Diario ✅ Agregar columna `estado_checking`

Se agrega únicamente `estado_checking` al Reporte Diario (el más relevante operacionalmente). `ubicacion` y `disponible_renta` solo en el detalle.

---

## Implementación detallada

### Archivos a crear
- `db/007_predominio_checking.sql` — migración
- `frontend/src/components/InfoOperacional.jsx` — card editable de los 3 campos

### Archivos a modificar

**Backend**: ningún cambio necesario (Supabase recibe los inserts/updates directamente).

**Frontend**:
- `frontend/src/pages/SiniestroNuevo.jsx`
  - Agregar 3 estados al form: `ubicacion_vehiculo`, `ubicacion_detalle`, `estado_checking`, `disponible_renta`
  - 3 inputs en el paso 3
  - Incluir en el INSERT
- `frontend/src/pages/SiniestroDetalle.jsx`
  - Embeber `<InfoOperacional />` entre detalle del daño y cotizaciones
- `frontend/src/pages/Siniestros.jsx` (lista)
  - Columna badge para `estado_checking`
- `frontend/src/components/ReporteDiario.jsx`
  - Columna `Etapa checking`
- `frontend/src/pages/FichaSiniestroPrint.jsx`
  - Bloque "Estado operacional"

---

## Métricas de éxito

### Modelo
- [ ] Existen los 2 enums y las 4 columnas nuevas
- [ ] Las columnas tienen sus defaults correctos
- [ ] El trigger de auditoría registra cambios en estos campos

### UI
- [ ] El wizard captura los 3 campos en paso 3
- [ ] El detalle muestra y permite editar los 3 campos
- [ ] La lista de daños muestra badge de `estado_checking`
- [ ] El Reporte Diario muestra columna de `estado_checking`
- [ ] La ficha imprimible incluye el bloque nuevo

### Comportamiento
- [ ] Si selecciono "Otro" en ubicación, el campo de detalle se vuelve obligatorio
- [ ] Cambiar el `estado_checking` queda registrado en audit_log
- [ ] `disponible_renta` toggle funciona y persiste
- [ ] Al crear un daño nuevo con `disponible_renta=FALSE`, Odoo se actualiza a "En Reparación"
- [ ] Al cambiar `disponible_renta` a TRUE, Odoo se actualiza a "Disponible"
- [ ] Si Odoo falla en la sincronización, el cambio en la app igual persiste y se muestra warning
- [ ] Al pasar a `entrega_proveedor`, aparece hint visual (no automático) recomendando marcar Disponible
- [ ] Sin permiso de editar, los campos se ven readonly

---

## Orden de ejecución sugerido

1. **SQL** — Crear `007_predominio_checking.sql` y correr en Supabase Studio
2. **Componente** — `InfoOperacional.jsx` (autocontenido, editable)
3. **Wizard** — Agregar inputs al paso 3 de `SiniestroNuevo`
4. **Detalle** — Embeber `InfoOperacional` en `SiniestroDetalle`
5. **Lista** — Badge en `Siniestros.jsx`
6. **Reporte Diario** — Columna nueva
7. **Ficha imprimible** — Bloque nuevo
8. **Pruebas** — Crear 1 daño, recorrer cambios de checking, verificar audit y permisos
9. Commit y push

---

## Notas para futuro (Fase 3 opcional)

- Misma capacidad para `ordenes_servicio` con su propio set de etapas
- Notificación automática cuando un daño lleve >N días en `pre_diagnostico` (alerta de inacción)
- Dashboard de "Daños por etapa de checking" (cuántos hay en cada etapa)
- Workflow visual tipo Kanban con drag&drop entre etapas
- Permitir comentario obligatorio al cambiar de etapa (ej. "¿por qué pasamos a Reparación si aún no hay cotización aprobada?")
- Sincronización automática a Odoo según `disponible_renta` (Q1 arriba)
- Reglas de transición permitidas (no se puede ir de "Pre-Diagnóstico" directo a "Daño Completo" sin pasar por las intermedias)
