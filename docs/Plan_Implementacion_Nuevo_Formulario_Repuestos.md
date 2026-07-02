# Plan: Nuevo Formulario de Repuestos — Catálogo

**Fecha:** 2026-06-24
**Actualizado:** 2026-07-01
**Estado:** ✅ Completado — Fase 1, Fase 2 e iteraciones en producción

---

## Contexto

El formulario original de repuestos tenía campo libre para Marca y Línea y un único precio (`precio_ref`). Se requería:

- Marca y Línea como selects enlazados
- Categoría como select
- 3 campos de precio: Precio Lista, Mano de Obra, Total (auto-calculado)

Fuente de datos: `docs/repuestos-agya.xlsx` y `docs/marcas-lineas.xlsx`.

---

## Fase 1 — Formulario de ingreso manual ✅

### 1. Migración de base de datos

Archivo: `db/011_repuestos_nuevos_campos.sql`

```sql
ALTER TABLE repuestos_catalogo
  ADD COLUMN IF NOT EXISTS precio_mano_obra NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS categoria        TEXT          NOT NULL DEFAULT 'repuesto'
    CHECK (categoria IN ('repuesto', 'rayones_golpes_leves', 'otro'));
```

Trigger `trg_sync_precio_total_repuesto`: mantiene `precio_total = precio_ref + precio_mano_obra` automáticamente.

> `precio_ref` sigue siendo la columna que usan las cotizaciones. No se requirió modificar `cotizacion_lineas`.

### 2. Constantes front-end (`Catalogos.jsx`)

```js
const MARCAS_LINEAS = {
  Toyota:     ['Agya', 'Corolla', 'HI ACE', 'HI LUX', 'Innova', 'Prado', 'Yaris'],
  Hyundai:    ['SANTA FE', 'Staria'],
  Chevrolet:  ['Suburban', 'Tracker'],
  Mitsubishi: ['L200', 'Montero'],
  Mazda:      ['CX5'],
}

const CATEGORIAS = [
  { value: 'repuesto',             label: 'Repuesto' },
  { value: 'rayones_golpes_leves', label: 'Rayones y Golpes Leves' },
  { value: 'otro',                 label: 'Otro' },
]
```

### 3. Formulario `RepuestoModal`

Layout:
```
[Código *]   [Nombre * ──────────────────────]
[Categoría ──────────────────────────────────]
[Marca ──────────────] [Línea / Modelo ───────]
[Años ───────────────] (vacío)
[Precio Lista Q]  [Mano de Obra Q]  [Total Q (calculado)]
□ Marcar como precio actualizado hoy
□ Repuesto activo
```

### 4. Tabla `RepuestosTab`

Columnas: `[☐] | Código | Repuesto | Categoría | Marca / Modelo | Años | Lista Q | M.O. Q | Total Q | Vigencia | [acciones]`

Badges de categoría: `repuesto` → gris · `rayones_golpes_leves` → ámbar · `otro` → azul

### 5. Commits Fase 1

| Hash | Descripción |
|------|-------------|
| `76aac12` | feat(catalogos): nuevo formulario de repuestos con selects y 3 precios |
| `703bdb5` | feat(catalogos): filtros Categoría, Marca y Línea en tabla de repuestos |

---

## Filtros de búsqueda ✅ (post-Fase 1)

Barra de filtros en `RepuestosTab`:

| Filtro | Comportamiento |
|--------|---------------|
| Texto libre | Busca en código, nombre, marca, línea |
| Categoría | Select: Todas / Repuesto / Rayones y Golpes Leves / Otro |
| Marca | Select: Todas / Toyota / Hyundai / Chevrolet / Mitsubishi / Mazda |
| Línea | Dependiente de Marca — aparece solo si hay marca seleccionada |
| Vigencia | Vigente / Revisar / Desactualizado / Sin precio |
| Limpiar filtros | Aparece solo si hay algún filtro activo, resetea todo |

Todos los filtros son client-side (AND acumulativo). Comparaciones de Marca y Línea son **case-insensitive e insensibles a espacios** (`HI ACE == HIACE`).

---

## Fase 2 — Importación masiva desde Excel ✅

### Formatos de Excel soportados

Los archivos de la flota NO tienen un formato uniforme. Se detectan columnas por encabezado (NFD normalizado, sin tildes):

| Columna | Regex de detección | Campo BD |
|---------|-------------------|----------|
| No. / Código | `/^no\.?$\|^codigo/` | `codigo` |
| Modelo / Línea | `/modelo\|linea/` | `linea_modelo` |
| Categoría | `/categor/` | `categoria` |
| Artículo / Nombre | `/articulo\|nombre\|repuesto/` | `nombre` |
| Precio Lista | `/lista\|precio lista/` | `precio_ref` |
| Mano de Obra / M.O. | `/mano\|m\.o/` | `precio_mano_obra` |

Si la columna no existe → el campo queda en su default (ej. `categoria = 'repuesto'`).

### Modal `ImportarRepuestosModal`

Tres campos de contexto:
- **Marca** (select) — se aplica a todos los registros importados
- **Línea** (select dependiente de Marca) — fallback cuando el Excel no tiene columna Línea (ej. Agya)
- **Archivo** (input file, `.xlsx`)

### Formato de código generado

```js
const lineaUpper = linea.toUpperCase().replace(/\s+/g, '')  // 'HI ACE' → 'HIACE'
// Si el código del Excel tiene letras → se usa tal cual (ej: 'AGYA-001')
// Si es numérico puro → LINEA-NNNNNN (6 dígitos con ceros)
// Ejemplo: id=12, línea=Agya → 'AGYA-000012'
```

### Normalización de nombres (`normalizarNombreRepuesto`)

Correcciones tipográficas aplicadas automáticamente al importar:

| Incorrecto | Correcto |
|-----------|----------|
| Bomper / Bompers | Bumper / Bumpers |
| delt. / Tras. / Lat. | Delantero / Trasero / Lateral |
| Izq. / Der. / Int. / Ext. | Izquierdo / Derecho / Interior / Exterior |
| Alineacion | Alineación |
| Perciana | Persiana |
| Rajilla / Regilla | Rejilla |
| Magnecio | Magnesio |
| Tapiceria | Tapicería |
| Bateria | Batería |
| Tricket | Trinquete |
| Capo | Capó |
| Faldon | Faldón |
| Neblineros | Neblineras |
| Trasera (en contexto de repuesto) | Trasero |

La preview del modal muestra el nombre original tachado cuando fue normalizado, con contador "✎ X nombres normalizados".

### Upsert

```js
supabase.from('repuestos_catalogo')
  .upsert(payload, { onConflict: 'codigo', ignoreDuplicates: false })
```

Idempotente: reimportar el mismo archivo actualiza precios sin duplicar.

### Commits Fase 2

| Hash | Descripción |
|------|-------------|
| `<hash-import>` | feat(catalogos): importacion masiva Excel con preview y upsert |
| `<hash-norm>` | feat(catalogos): normalizacion automatica de nombres en import |
| `<hash-linea-modal>` | feat(catalogos): selector Linea en modal de importacion |

---

## Iteraciones post-Fase 2 ✅ (2026-07-01)

### Submenú de Catálogos en Sidebar

El ítem "Catálogos" del sidebar se separó en dos sublinks:
- **Talleres** → `/catalogos?tab=talleres`
- **Repuestos** → `/catalogos?tab=repuestos`

Cada sección se muestra sin tabs visuales; el tab activo viene del `?tab=` de la URL. El ítem activo se resalta en rojo en el sidebar.

Commits: `02a7788` (eliminar tabs), `79e0960` (filtros case-insensitive), `2008d14` (insensible a espacios)

### Botón Anular

Botón `Ban` a la derecha del lápiz (editar). Inline confirmation "¿Anular? Sí / No". Registros anulados (`activo = false`) se ocultan para usuarios sin permiso `ver_anulados`. No hay recuperación desde la UI de producción.

### Filtros robustos

- Marca y Línea: comparación **case-insensitive**
- Línea: además **insensible a espacios** (`HIACE == HI ACE`)
- Botón **"Limpiar filtros"**: aparece solo cuando hay algún filtro activo

Commit: `ee250b0`

### Paginación + Orden + Modo Presupuesto

Commit: `48f17ab`

**Paginación:**
- Botones 10 / 25 / 50 / Todos en la barra de filtros
- Pie de tabla: "1–25 de 645" con navegación numérica

**Ordenado:**
- Tabla siempre ordenada A→Z por nombre de repuesto (`localeCompare('es')`)

**Modo Presupuesto:**
- Columna de checkbox a la izquierda del Código (cabecera selecciona/deselecciona todos los visibles)
- Filas marcadas se resaltan en azul claro
- Al marcar ≥1 registro → aparece botón **"Presupuesto (N)"** en la barra
- Al hacer clic → banner azul, tabla muestra solo los seleccionados, fila **TOTAL** al pie con suma de Lista Q, M.O. Q y Total Q
- Botón **"Salir"** en el banner → vuelve a la vista normal y limpia selección

---

## Correcciones de datos en producción

### AGYA — caso especial (2026-07-01)

El archivo `docs/repuestos-agya.xlsx` no tiene columnas Línea ni Categoría. Todos los registros quedaron con:
- `categoria = 'repuesto'` (default correcto)
- `linea_modelo = 'AGYA'` (todo caps, incorrecto — debía ser `'Agya'`)
- `codigo` numérico puro (`1`, `22`...) en lugar de `AGYA-000001`, `AGYA-000022`

SQL de corrección aplicado en Supabase:

```sql
UPDATE repuestos_catalogo
SET
  linea_modelo = 'Agya',
  codigo       = 'AGYA-' || LPAD(codigo, 6, '0')
WHERE linea_modelo = 'AGYA'
  AND codigo ~ '^[0-9]+$';
```

### HI ACE / HI LUX (2026-07-01)

Importados como `'HIACE'` / `'HILUX'` (sin espacio). Corregidos a `'HI ACE'` / `'HI LUX'`:

```sql
UPDATE repuestos_catalogo SET linea_modelo = 'HI ACE' WHERE LOWER(REPLACE(linea_modelo,' ','')) = 'hiace';
UPDATE repuestos_catalogo SET linea_modelo = 'HI LUX' WHERE LOWER(REPLACE(linea_modelo,' ','')) = 'hilux';
```

---

## Estado del catálogo (2026-07-01)

| categoria | registros |
|-----------|-----------|
| `repuesto` | 463 |
| `rayones_golpes_leves` | 182 |
| **Total** | **645** |

Vehículos importados hasta la fecha: Toyota Agya, Toyota HI LUX, Chevrolet Tracker (y otros con categoría Rayones).
Pendientes de importar: Corolla, HI ACE, Innova, Prado, Yaris, SANTA FE, Staria, Suburban, L200, Montero, CX5.

---

## Sesión 2026-06-24 — Otros cambios

### Permiso `ver_anulados`
- Flag en `perfiles.permisos` JSONB
- Commit: `d9059e6`

### PDF Pase de Salida actualizado
- Commit: `25c00b8`
