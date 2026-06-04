# Plan — 3 columnas financieras en Reporte Diario + toggles de ocultar

**Estado**: 📋 Pendiente de aprobación
**Origen**: Requerimiento operacional — gerencia necesita ver el resumen financiero del daño (Cliente paga / Pass paga / Margen) en el Reporte Diario
**Prioridad**: Alta
**Estimado**: 1 sesión (1.5 – 2 horas)

---

## Objetivo

1. Agregar **3 columnas financieras** al Reporte Diario (Dashboard + Excel + Print) que apliquen **solo a daños**:
   - `Cliente paga` → `siniestros.monto_cliente`
   - `Pass paga` → `siniestros.costo_pass`
   - `Margen` → `siniestros.margen`
2. Para registros de **servicios** (que no tienen estas columnas en BD), mostrar `—` para no romper el layout
3. Agregar **2 toggles** en la barra de filtros que permitan **ocultar columnas** anchas para no saturar el documento al imprimir/exportar:
   - Toggle "Mostrar Motivo"
   - Toggle "Mostrar Observaciones"

---

## Layout final del Reporte Diario

15 columnas posibles (12 anteriores + 3 nuevas). Las marcadas con 🔘 son ocultables.

**Posición elegida: 3 nuevas ANTES de "Etapa checking"**

```
| # | Placa | Tipo | Reg | Ubicación | Taller    | Fecha    | Fecha     | Días en | Cliente | Pass    | Margen | Etapa    | Motivo de    🔘 | Observ.🔘 |
|   |       |      |     |           | Asignado  | Registro | Aprox.    | Taller  | paga    | paga    |        | checking | envío a taller |           |
|   |       |      |     |           |           |          | Ingreso   |         |         |         |        |          |                |           |
```

### Nuevas columnas — formato

| Columna | Tipo | Dashboard | Excel |
|---------|------|-----------|-------|
| Cliente paga | Daño | `Q 3,375.00` en azul | Número con formato `"Q "#,##0.00` |
| Pass paga | Daño | `Q 3,375.00` en gris | Número con formato `"Q "#,##0.00` |
| Margen | Daño | `Q 0.00` con color: verde si ≥0, rojo si <0 | Número con formato `"Q "#,##0.00`, color condicional |
| (las 3) | Servicio | `—` (guion gris claro) | Celda vacía o texto `"—"` |

### Nuevos toggles

En la barra de filtros (justo antes de "Total"):

```
☑ Mostrar Motivo    ☑ Mostrar Observaciones    [---->]   Total: 6 vehículos
```

- Default: **ambos ON**
- Si se desactivan: la columna desaparece del Dashboard y del Excel
- Estado se guarda en memoria (no persistente entre sesiones — opcional para futuro)

---

## Modelo de datos

**Sin cambios.** Las 3 columnas ya existen en `siniestros`:
- `monto_cliente NUMERIC(12,2) DEFAULT 0`
- `costo_pass NUMERIC(12,2) DEFAULT 0`
- `margen NUMERIC(12,2) DEFAULT 0` (calculado automáticamente por el trigger `sync_costo_pass_from_approved_quote`)

Para servicios (`ordenes_servicio`), simplemente NO se mapean — quedan como `null` / `undefined` y la UI muestra `—`.

---

## Cambios en frontend

### A. `ReporteDiario.jsx`

#### 1. Estado nuevo

```js
const [mostrarMotivo, setMostrarMotivo] = useState(true)
const [mostrarObservaciones, setMostrarObservaciones] = useState(true)
```

#### 2. Query — agregar campos al select de daños

```js
let danosQ = supabase
  .from('siniestros')
  .select(`
    id, numero, placa, tipo_vehiculo, tipo_dano, descripcion, forma_pago,
    fecha_dano, fecha_estimada_entrega, estado, estado_checking,
    ubicacion_vehiculo, ubicacion_detalle, disponible_renta, taller_id,
    monto_cliente, costo_pass, margen,
    talleres(nombre)
  `)
```

(El select de `ordenes_servicio` no se toca.)

#### 3. Normalización — agregar campos a `filasDanos`

```js
const filasDanos = (danos ?? []).map(d => ({
  // … campos existentes …
  montoCliente:  d.monto_cliente,
  costoPass:     d.costo_pass,
  margen:        d.margen,
}))
```

Para `filasServicios` se dejan `undefined` (no se setean los campos).

#### 4. UI — Toggles en la barra de filtros

```jsx
<label className="flex items-center gap-2 cursor-pointer">
  <input type="checkbox"
    checked={mostrarMotivo}
    onChange={e => setMostrarMotivo(e.target.checked)}
    className="accent-red-600" />
  <span className="font-medium text-gray-700">Mostrar Motivo</span>
</label>

<label className="flex items-center gap-2 cursor-pointer">
  <input type="checkbox"
    checked={mostrarObservaciones}
    onChange={e => setMostrarObservaciones(e.target.checked)}
    className="accent-red-600" />
  <span className="font-medium text-gray-700">Mostrar Observaciones</span>
</label>
```

#### 5. UI — Headers nuevos (entre Etapa checking y Motivo)

```jsx
<th className="px-3 py-2 font-medium text-right">Cliente<br/>paga</th>
<th className="px-3 py-2 font-medium text-right">Pass<br/>paga</th>
<th className="px-3 py-2 font-medium text-right">Margen</th>
{mostrarMotivo && <th>Motivo de…</th>}
{mostrarObservaciones && <th>Observaciones</th>}
```

#### 6. UI — Celdas nuevas

```jsx
<td className="px-3 py-2 text-right font-medium">
  {f.tipoRegistro === 'dano'
    ? <span className="text-blue-700">{fmtMoneda(f.montoCliente)}</span>
    : <span className="text-gray-300">—</span>}
</td>
<td className="px-3 py-2 text-right font-medium">
  {f.tipoRegistro === 'dano'
    ? <span className="text-gray-700">{fmtMoneda(f.costoPass)}</span>
    : <span className="text-gray-300">—</span>}
</td>
<td className="px-3 py-2 text-right font-medium">
  {f.tipoRegistro === 'dano'
    ? <span className={f.margen >= 0 ? 'text-green-700' : 'text-red-700'}>
        {fmtMoneda(f.margen)}
      </span>
    : <span className="text-gray-300">—</span>}
</td>
{mostrarMotivo && <td>{f.motivo}</td>}
{mostrarObservaciones && <td>{f.observaciones}</td>}
```

#### 7. Función helper

```js
function fmtMoneda(n) {
  if (n === null || n === undefined) return '—'
  return `Q ${Number(n).toLocaleString('es-GT', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`
}
```

#### 8. colSpan dinámico

El colSpan de la fila "no hay datos" y el loading skeleton deben ajustarse al número de columnas activas:

```js
const nColumnas = 10 + 3 + (mostrarMotivo ? 1 : 0) + (mostrarObservaciones ? 1 : 0)
// 10 fijas + 3 financieras + opcionales
```

### B. `lib/exportarReporteExcel.js`

Aceptar los toggles como parámetros y ajustar headers/columnas/datos en consecuencia:

```js
export async function exportarReporteExcel({
  filas, info, nombreArchivo,
  mostrarMotivo = true,
  mostrarObservaciones = true,
}) {
  // … build columns dynamically …
}
```

Headers en doble línea ya están en uso; agregar los nuevos con el mismo patrón:

```js
const headers = [
  '#', 'Placa', 'Tipo vehículo', 'Registro', 'Ubicación',
  'Taller\nAsignado',
  'Fecha\nRegistro',
  'Fecha Aprox.\nIngreso',
  'Días en\nTaller',
  'Etapa checking',
  'Cliente\npaga',
  'Pass\npaga',
  'Margen',
  ...(mostrarMotivo ? ['Motivo de\nenvío a taller'] : []),
  ...(mostrarObservaciones ? ['Observaciones'] : []),
]
```

Anchos:
- Cliente paga: 13
- Pass paga: 13
- Margen: 13

Valores de las celdas:
- Daños: número real (`d.monto_cliente`)
- Servicios: cadena `'—'`

Formato Excel currency en las 3 columnas:
```js
cell.numFmt = '"Q "#,##0.00'
```

Color condicional para Margen:
- ≥ 0 → texto verde (`FF15803D`)
- < 0 → texto rojo (`FFB91C1C`)

### C. `ReporteDiario.jsx` — invocación del Excel

```js
async function exportarExcel() {
  await exportarReporteExcel({
    filas: filasFiltradas,
    info: { … },
    nombreArchivo: nombreArchivo(),
    mostrarMotivo,
    mostrarObservaciones,
  })
}
```

### D. Print CSS — sin cambios estructurales

El CSS de print actual oculta las clases `.no-print` y mantiene el resto. Los toggles ya están en `.no-print` (vivian en la barra de filtros). Como las columnas se ocultan condicionalmente en el JSX, el print respeta automáticamente la selección.

---

## Decisiones tomadas

| # | Decisión | Justificación |
|---|----------|---------------|
| 1 | 3 columnas siempre visibles (no son toggleables) | Son las que justifican el "valor gerencial" del reporte; los toggles son para columnas voluminosas |
| 2 | Solo Motivo y Observaciones son toggleables | Son las 2 más largas con word-wrap a 40ch; al ocultarlas se reduce significativamente el ancho |
| 3 | Default: ambos toggles ON | Mantiene el comportamiento actual; el usuario decide cuándo recortar |
| 4 | Servicios muestran `—` (guion) en las 3 financieras | Visual claro de "no aplica"; no confunde con `0` o vacío |
| 5 | Color en Margen: verde ≥0, rojo <0 | Visualización inmediata del impacto financiero |
| 6 | Excel guarda número real (no string formateado) | Permite sumas, filtros y formato condicional Excel |
| 7 | Toggles NO se persisten entre sesiones | Por simplicidad; cada vez que se carga el dashboard arranca con default ON |
| 8 | El nombre del archivo Excel NO cambia según los toggles | Mantenemos `reporte-diario[-tipo]-YYYY-MM-DD.xlsx` sin sufijos adicionales |
| 9 | Sin cambios en BD ni backend | Los campos ya existen; solo cambia el frontend |
| 10 | Print respeta automáticamente los toggles | Los toggles ocultan los `<th>` y `<td>` en el JSX, no por CSS |

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Tabla se vuelve demasiado ancha con las 3 columnas + Motivo + Observaciones | Toggles permiten apagarlas; el usuario decide qué mostrar |
| Servicios con `—` se confunden con daños sin monto | Color gris claro distinto del azul/negro de los daños |
| Excel sin Motivo y Observaciones pierde contexto | Asumimos que es deliberado del usuario; si quiere todo, los activa |
| `margen` mal calculado en daños viejos | El trigger SQL ya recalcula correctamente; daños pre-trigger podrían tener inconsistencias menores — no se aborda aquí |
| El Print podría imprimirse en horizontal A4 estrecho con muchas columnas | Ya está en A4 landscape; con los 5 nuevos campos + Motivo + Observ. la tabla puede salirse — recomendación: usar los toggles antes de imprimir |

---

## Métricas de éxito

### Dashboard
- [ ] Aparecen 3 columnas nuevas: Cliente paga, Pass paga, Margen
- [ ] Se ubican entre "Etapa checking" y "Motivo de envío a taller"
- [ ] Daños muestran montos formateados como `Q 3,375.00`
- [ ] Servicios muestran `—` en las 3
- [ ] Margen muestra color verde si ≥0, rojo si <0
- [ ] Toggles "Mostrar Motivo" y "Mostrar Observaciones" en la barra de filtros (ambos ON por default)
- [ ] Al desactivar Motivo, la columna desaparece del Dashboard
- [ ] Al desactivar Observaciones, la columna desaparece del Dashboard
- [ ] El loading skeleton y el "sin registros" tienen colSpan correcto en todos los casos

### Excel
- [ ] Las 3 columnas nuevas aparecen entre Etapa checking y Motivo de envío
- [ ] Valor numérico con formato currency `Q 3,375.00`
- [ ] Servicios muestran `—` en las 3 (texto)
- [ ] Margen tiene color de texto verde/rojo según signo
- [ ] Si toggle Motivo está OFF, la columna NO aparece en el Excel
- [ ] Si toggle Observaciones está OFF, la columna NO aparece en el Excel
- [ ] Anchos de columna razonables (no se cortan los Q)

### Print
- [ ] Al imprimir desde el botón, las columnas ocultas por toggle NO aparecen
- [ ] El layout sigue cabiendo en A4 landscape

---

## Archivos a modificar

### Modificar
- `frontend/src/components/ReporteDiario.jsx`
  - Estado `mostrarMotivo`, `mostrarObservaciones`
  - Toggles en barra de filtros
  - Select Supabase incluye `monto_cliente, costo_pass, margen`
  - Filas normalizadas incluyen los 3 campos para daños
  - Helper `fmtMoneda`
  - Headers + celdas nuevas
  - Renderizado condicional de Motivo y Observaciones
  - colSpan dinámico
  - Llamada a `exportarReporteExcel` pasa los toggles
- `frontend/src/lib/exportarReporteExcel.js`
  - Acepta `mostrarMotivo`, `mostrarObservaciones`
  - Headers dinámicos
  - Anchos de columna dinámicos
  - 3 columnas financieras con currency format + color en Margen
  - Manejo de `—` para servicios

### Crear
- `plans/Plan_implementacion_tres_columnas.md` (este documento)

### Sin tocar
- BD: ningún cambio
- Backend: ningún cambio
- `db/`: ninguna migración
- Otros componentes

---

## Orden de ejecución

1. Modificar `ReporteDiario.jsx`:
   - Agregar estado de los toggles
   - Ampliar query Supabase con los 3 campos
   - Helper `fmtMoneda`
   - Toggles en UI
   - Headers nuevos + celdas nuevas
   - Renderizado condicional de Motivo y Observaciones
   - colSpan dinámico
2. Modificar `lib/exportarReporteExcel.js`:
   - Aceptar nuevos params
   - Construir headers/columnas dinámicamente
   - Formato currency + color en Margen
3. Conectar: `exportarExcel()` pasa los toggles
4. Pruebas locales:
   - Ver Dashboard con todos los toggles ON
   - Desactivar Motivo → verificar
   - Desactivar Observaciones → verificar
   - Exportar Excel con distintas combinaciones
   - Imprimir con toggles distintos
5. Commit y push

---

## Notas para futuro (no en este alcance)

- Persistir los toggles en localStorage para que el usuario no tenga que apagarlos cada vez
- Permitir reordenar columnas drag&drop
- Agregar más toggles para otras columnas (Ubicación, Taller, etc.)
- Total de fila al pie del Excel con suma de Cliente paga / Pass paga / Margen (solo daños)
- Filtro adicional: solo mostrar daños con margen negativo (alerta financiera)
