# Plan: Nuevo Formulario de Repuestos — Catálogo

**Fecha:** 2026-06-24
**Estado:** ✅ Fase 1 completada — en producción
**Alcance:** Formulario de ingreso/edición manual + filtros de búsqueda. Importación masiva Excel = Fase 2 (pendiente).

---

## Contexto

El formulario actual de repuestos tiene un campo libre de texto para Marca y Línea, y un único campo de precio (`precio_ref`). Se requiere:

- Marca y Línea como selects enlazados (la Línea filtra según la Marca elegida)
- Categoría como select
- 3 campos de precio: Precio Lista, Mano de Obra, Total (auto-calculado)

Fuente de datos analizada: `docs/repuestos-agya.xlsx` y `docs/marcas-lineas.xlsx`.

---

## Fase 1 — Formulario de ingreso manual

### 1. Migración de base de datos

Archivo: `db/011_repuestos_nuevos_campos.sql`

```sql
-- Nuevas columnas de precio
ALTER TABLE repuestos_catalogo
  ADD COLUMN IF NOT EXISTS precio_mano_obra NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS categoria        TEXT          NOT NULL DEFAULT 'repuesto'
    CHECK (categoria IN ('repuesto', 'rayones_golpes_leves', 'otro'));

-- El campo precio_ref existente pasa a ser "Precio Lista"
-- Se renombra en la UI pero la columna BD se mantiene como precio_ref
-- para no romper referencias existentes en cotizacion_lineas.

-- Recalcular precio_total en registros existentes
UPDATE repuestos_catalogo
SET precio_total = COALESCE(precio_ref, 0) + 0
WHERE precio_total = 0;

-- Trigger: mantener precio_total sincronizado automáticamente
CREATE OR REPLACE FUNCTION sync_precio_total_repuesto()
RETURNS TRIGGER AS $$
BEGIN
  NEW.precio_total := COALESCE(NEW.precio_ref, 0) + COALESCE(NEW.precio_mano_obra, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_precio_total_repuesto
  BEFORE INSERT OR UPDATE OF precio_ref, precio_mano_obra
  ON repuestos_catalogo
  FOR EACH ROW EXECUTE FUNCTION sync_precio_total_repuesto();
```

> **Nota:** `precio_ref` sigue siendo la columna que usan las cotizaciones para auto-completar el precio unitario al seleccionar un repuesto. Con este cambio, `precio_ref` = Precio Lista. No se requiere modificar `cotizacion_lineas` ni `CotizacionesSection`.

---

### 2. Constantes front-end (dentro de `Catalogos.jsx`)

```js
const MARCAS_LINEAS = {
  Toyota:     ['Agya', 'Corolla', 'HI ACE', 'HI LUX', 'Innova', 'Prado', 'Yaris'],
  Hyundai:    ['SANTA FE', 'Staria'],
  Chevrolet:  ['Suburban', 'Tracker'],
  Mitsubishi: ['L200', 'Montero'],
  Mazda:      ['CX5'],
}

const MARCAS = Object.keys(MARCAS_LINEAS).sort()  // orden alfabético

const CATEGORIAS = [
  { value: 'repuesto',             label: 'Repuesto' },
  { value: 'rayones_golpes_leves', label: 'Rayones y Golpes Leves' },
  { value: 'otro',                 label: 'Otro' },
]
```

---

### 3. Cambios en `RepuestoModal` (`Catalogos.jsx`)

#### Estado del form
```js
const [form, setForm] = useState({
  codigo:          repuesto.codigo || '',
  nombre:          repuesto.nombre || '',
  marca:           repuesto.marca || '',
  linea_modelo:    repuesto.linea_modelo || '',
  categoria:       repuesto.categoria || 'repuesto',   // NUEVO
  anios:           repuesto.anios || '',
  precio_ref:      repuesto.precio_ref ?? '',           // = Precio Lista
  precio_mano_obra: repuesto.precio_mano_obra ?? '',   // NUEVO
  // precio_total: calculado, no en state
  activo:          repuesto.activo ?? true,
})
```

#### Cálculo automático del Total
```js
const precioTotal = (Number(form.precio_ref) || 0) + (Number(form.precio_mano_obra) || 0)
```
Se muestra como campo read-only. No se guarda por separado en el state porque el trigger de BD lo sincroniza al guardar.

#### Layout del formulario
```
[Código *]   [Nombre * ──────────────────────]
[Categoría ──────────────────────────────────]
[Marca ──────────────] [Línea / Modelo ───────]
[Años ───────────────] (vacío)
[Precio Lista Q]  [Mano de Obra Q]  [Total Q (calculado)]
□ Marcar como precio actualizado hoy
□ Repuesto activo
```

**Marca (select):**
- Opciones: Toyota, Hyundai, Chevrolet, Mitsubishi, Mazda + opción vacía "— Sin marca"
- Al cambiar marca → resetea `linea_modelo` a ''

**Línea / Modelo (select):**
- Opciones: las líneas del `MARCAS_LINEAS[form.marca]`, o vacío si no hay marca seleccionada
- Incluye siempre una opción vacía "— Sin línea"
- Si la marca no tiene líneas mapeadas, se muestra un input libre de texto como fallback

**Total Q:**
- Input `disabled`, fondo gris claro, muestra `precioTotal` formateado
- Tooltip o etiqueta: "Calculado automáticamente"

#### Payload al guardar
```js
const payload = {
  codigo:           form.codigo.trim().toUpperCase(),
  nombre:           form.nombre.trim(),
  marca:            form.marca || null,
  linea_modelo:     form.linea_modelo || null,
  categoria:        form.categoria,
  anios:            form.anios.trim() || null,
  precio_ref:       form.precio_ref === '' ? 0 : Number(form.precio_ref),
  precio_mano_obra: form.precio_mano_obra === '' ? 0 : Number(form.precio_mano_obra),
  // precio_total lo calcula el trigger de BD
  activo:           form.activo,
}
```

---

### 4. Cambios en la tabla `RepuestosTab`

La tabla actual muestra: Código, Repuesto, Marca/Modelo, Años, Precio ref. Q, Vigencia.

Ajustes:
- Columna **"Precio ref. Q"** → renombrar a **"Lista Q"**
- Agregar columna **"M.O. Q"** (Mano de Obra)
- Agregar columna **"Total Q"**
- Agregar columna **"Categoría"** (badge de color):
  - `repuesto` → gris
  - `rayones_golpes_leves` → ámbar
  - `otro` → azul

Orden de columnas propuesto:
```
Código | Repuesto | Categoría | Marca / Modelo | Años | Lista Q | M.O. Q | Total Q | Vigencia | [editar]
```

> La tabla se vuelve más ancha — se mantiene `overflow-x-auto` ya existente.

---

### 5. Impacto en otras partes del sistema

| Componente | Impacto | Acción |
|------------|---------|--------|
| `CotizacionesSection.jsx` | Usa `precio_ref` al seleccionar repuesto | Ninguna — sigue usando `precio_ref` (Precio Lista) |
| `repuestos_catalogo` RLS | Solo admin/agente_senior puede modificar | Sin cambio |
| `precio_actualizado_at` | Se sigue marcando con el checkbox existente | Sin cambio |

---

## Filtros de búsqueda (implementado post-Fase 1)

Solicitado tras validar el formulario en producción. Cambios solo en frontend, sin migración BD.

**Nuevos filtros en la barra de `RepuestosTab`:**

| Filtro | Comportamiento |
|--------|---------------|
| Categoría | Select: Todas / Repuesto / Rayones y Golpes Leves / Otro |
| Marca | Select: Todas / Toyota / Hyundai / Chevrolet / Mitsubishi / Mazda |
| Línea | Select dependiente de Marca — aparece solo si hay marca seleccionada; se resetea al cambiar marca |
| Vigencia | Ya existía (Vigente / Revisar / Desactualizado / Sin precio) |

Todos los filtros son client-side (los datos ya están cargados en memoria). Se combinan acumulativamente con la búsqueda de texto libre existente.

---

## Fase 2 — Importación masiva desde Excel (pendiente)

**Formato esperado** (igual al `repuestos-agya.xlsx`):

| No. | Modelo (Línea) | Categoría | Artículo | Precio Lista | Mano de Obra | Total |
|-----|----------------|-----------|----------|--------------|--------------|-------|

**Comportamiento:**
- Botón "Importar Excel" en la barra de filtros de RepuestosTab
- Parseo client-side con `xlsx` (npm, carga dinámica como `exceljs`)
- Preview de filas antes de confirmar
- Insert bulk vía Supabase `upsert` usando `codigo` como clave de conflicto
- Reporte de éxito/error por fila

> Este módulo se planificará en un documento separado una vez validado el formulario manual.

---

## Orden de implementación (Fase 1)

1. ✅ Ejecutar `db/011_repuestos_nuevos_campos.sql` en Supabase
2. ✅ Actualizar `Catalogos.jsx`:
   - Agregar constantes `MARCAS_LINEAS` y `CATEGORIAS`
   - Modificar `RepuestoModal` (state, layout, selects, precios)
   - Actualizar tabla en `RepuestosTab` (columnas nuevas, badge categoría)
   - Agregar filtros Categoría / Marca / Línea / Vigencia en barra de búsqueda
3. ✅ Commit + push → deploy frontend

No requiere cambios en backend ni en ninguna otra página.

---

## Commits de referencia (rama main)

| Hash | Descripción |
|------|-------------|
| `76aac12` | feat(catalogos): nuevo formulario de repuestos con selects y 3 precios |
| `703bdb5` | feat(catalogos): filtros Categoría, Marca y Línea en tabla de repuestos |

---

## Sesión 2026-06-24 — Otros cambios implementados

Además del formulario de repuestos, en la misma sesión se implementaron:

### Permiso `ver_anulados` por usuario
- Nuevo flag `ver_anulados` en el JSONB `perfiles.permisos`
- Solo usuarios con ese flag ven daños anulados y servicios cancelados en: Lista Daños/Servicios, Dashboard, Reporte Diario, Bitácora, Flota, Proformas
- Preset Admin lo activa por defecto; los demás en `false`
- Columna nueva `👁‍🗨` visible en la tabla de Usuarios y permisos
- Commit: `d9059e6`

### PDF Pase de Salida actualizado
- Subido `Pase-Salida-Contrato-Interno-Pass-2026.pdf` actualizado en `frontend/public/pdfs/`
- Commit: `25c00b8`
