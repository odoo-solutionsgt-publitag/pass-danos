# Plan — Reporte Diario: Exportar a Excel + Mejora de Impresión

**Estado**: 📋 Pendiente de aprobación
**Origen**: Requerimiento operacional — el CSV actual no es suficiente para presentación gerencial
**Prioridad**: Alta
**Estimado**: 1 sesión (2 – 3 horas)

---

## Objetivo

Reemplazar / complementar el botón actual "Exportar CSV" con un **botón "Exportar a Excel"** que genere un archivo `.xlsx` profesional, con:

1. **Logo de Pass Rent a Car** en el encabezado
2. **Título y resumen de filtros aplicados** (Servicios/Daños/Mes)
3. **Mismas columnas que el dashboard** (orden y contenido idéntico)
4. **Filtros respetados**: refleja la misma vista que ve el usuario en pantalla
5. **Orden descendente por fecha** (más reciente arriba)
6. **Formato visual rico**: bordes, colores en semáforo de días, encabezados con fondo, word-wrap en celdas largas

De paso, **mejorar la vista de impresión** (Print) para que también muestre logo, título y resumen de filtros, no solo la tabla pelada.

---

## Bloques de trabajo

| # | Bloque | Alcance |
|---|--------|---------|
| 1 | Excel export con `exceljs` | Botón nuevo + utility de generación + logo embebido |
| 2 | Mejora del Print | Header con logo + filtros visibles en impresión |
| 3 | Orden descendente unificado | Tanto en dashboard como en Excel y Print |

---

## Bloque 1 — Excel export

### Librería elegida: **`exceljs`**

**Razones**:
- Soporta imágenes embebidas (necesario para el logo)
- Soporta formato avanzado: bordes, colores de celda, freeze rows, autosize columns
- API limpia, ampliamente usada
- ~1.2 MB minified — aceptable, se importa **dinámicamente** solo cuando el usuario hace click en el botón (`await import('exceljs')`)

**Alternativa descartada**: `xlsx` (SheetJS) community version no soporta imágenes.

**Instalación**:
```bash
npm install exceljs
```

### Layout del archivo Excel

```
┌─────────────────────────────────────────────────────────────────────┐
│ [LOGO PASS]    PASS RENT A CAR GUATEMALA                            │
│                Registro de Daños/Servicios                          │
│                Fechas: Todas    ·    Total: N                       │
│                Generado: 1 jun 2026, 14:32                          │
├─────────────────────────────────────────────────────────────────────┤
│ # │ Placa │ Tipo │ Reg │ Ubic │ Taller │ F. Reg │ Est.Sal │ Días │ Checking │ Motivo │ Observ │
├───┼───────┼──────┼─────┼──────┼────────┼────────┼─────────┼──────┼──────────┼────────┼────────┤
│ 1 │ P-... │ ...  │ ... │ ...  │ ...    │ ...    │ ...     │  3 🟡│ ...      │ ...    │ ...    │
└───┴───────┴──────┴─────┴──────┴────────┴────────┴─────────┴──────┴──────────┴────────┴────────┘
```

### Título dinámico (sin la palabra "Filtros")

| Combinación de filtros | Título |
|------------------------|--------|
| Solo Servicios | **Registro de Servicios** |
| Solo Daños | **Registro de Daños** |
| Ambos (Servicios + Daños) | **Registro de Daños/Servicios** |
| Ninguno | (no se permite, debe haber al menos uno) |

### Etiqueta de fecha

| Selección | Etiqueta |
|-----------|----------|
| Mes = Todos | **Fechas: Todas** |
| Mes específico (ej. Abril) + año 2026 | **Fecha: Mes de Abril 2026** |

### Estructura técnica

| Fila | Contenido |
|------|-----------|
| 1-4 | Logo (anclado en A1, ocupa ~4 filas de alto) + título y subtítulo (B1, B2) + fecha de generación (B3) |
| 5 | Línea de filtros aplicados (resumen textual) |
| 6 | Conteo total de filas |
| 7 | Vacía (separador) |
| 8 | **Encabezados de columna** (negrita, fondo rojo Pass, texto blanco) — **frozen** |
| 9+ | Datos |

### Columnas (mismas que dashboard)

| Col | Header | Origen | Formato Excel |
|-----|--------|--------|---------------|
| A | # | índice 1-based | número |
| B | Placa | `f.placa` | texto, monospace si posible |
| C | Tipo vehículo | `f.tipoVehiculo` | texto |
| D | Registro | "Daño" / "Servicio" | texto + color fondo (rojo claro / slate) |
| E | Ubicación | `f.ubicacion` | texto |
| F | Taller | `f.taller` | texto |
| G | F. Registro | `f.fechaRegistro` | fecha (formato `dd-mmm-yyyy`) |
| H | Est. salida | `f.fechaEstSalida` | fecha |
| I | Días | `f.dias` | número + **fondo según semáforo** (verde 1-2, ámbar 3-5, rojo 6+) |
| J | Etapa checking | label de `f.checking` | texto |
| K | Motivo | `f.motivo` | texto + **word wrap** + alineación arriba |
| L | Observaciones | `f.observaciones` | texto + **word wrap** + alineación arriba |

**Anchos de columna sugeridos**:
| Col | Ancho |
|-----|-------|
| A (#) | 5 |
| B (Placa) | 12 |
| C (Tipo) | 14 |
| D (Registro) | 10 |
| E (Ubicación) | 18 |
| F (Taller) | 18 |
| G (F. Registro) | 14 |
| H (Est. salida) | 14 |
| I (Días) | 8 |
| J (Checking) | 22 |
| K (Motivo) | 40 |
| L (Observaciones) | 40 |

### Nombre del archivo

| Selección | Nombre |
|-----------|--------|
| Ambos | `reporte-diario-2026-06-01.xlsx` |
| Solo Daños | `reporte-diario-danos-2026-06-01.xlsx` |
| Solo Servicios | `reporte-diario-servicios-2026-06-01.xlsx` |

(Sin acentos ni ñ para máxima compatibilidad de filesystem.)

### Orden

**Descendente por `fechaRegistro`** — los más recientes arriba.
Aplica también al dashboard para que el Excel y la vista en pantalla coincidan.

### Implementación

**Archivo nuevo**: `frontend/src/lib/exportarReporteExcel.js`

```js
export async function exportarReporteExcel({ filas, filtros, nombreArchivo }) {
  const ExcelJS = (await import('exceljs')).default

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Pass Rent a Car — Gestión de Daños'
  wb.created = new Date()

  const ws = wb.addWorksheet('Reporte Diario', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
  })

  // Cargar logo
  const logoBlob = await fetch('/pass-35-logo.png').then(r => r.blob())
  const logoBuf  = await logoBlob.arrayBuffer()
  const logoId   = wb.addImage({ buffer: logoBuf, extension: 'png' })

  ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 100, height: 80 } })

  // Título y meta
  ws.mergeCells('B1:L1'); ws.getCell('B1').value = 'REPORTE DIARIO — PASS RENT A CAR GUATEMALA'
  ws.mergeCells('B2:L2'); ws.getCell('B2').value = 'Gestión de Daños y Servicios'
  ws.mergeCells('B3:L3'); ws.getCell('B3').value = `Generado: ${new Date().toLocaleString('es-GT')}`
  // ... estilos: negrita, tamaño, color

  // Línea de filtros
  ws.mergeCells('A5:L5')
  ws.getCell('A5').value = `Filtros: ${filtros.tipos} · Mes: ${filtros.mes} · Total: ${filas.length}`

  // Headers
  const headers = ['#','Placa','Tipo veh.','Registro','Ubicación','Taller',
                   'F. Registro','Est. salida','Días','Etapa checking','Motivo','Observaciones']
  ws.getRow(8).values = headers
  ws.getRow(8).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE53935' } }  // rojo Pass
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  // Anchos
  ws.columns = [
    { width: 5 }, { width: 12 }, { width: 14 }, { width: 10 }, { width: 18 },
    { width: 18 }, { width: 14 }, { width: 14 }, { width: 8 },  { width: 22 },
    { width: 40 }, { width: 40 },
  ]

  // Datos
  filas.forEach((f, idx) => {
    const row = ws.addRow([
      idx + 1, f.placa, f.tipoVehiculo,
      f.tipoRegistro === 'dano' ? 'Daño' : 'Servicio',
      f.ubicacion, f.taller,
      f.fechaRegistro, f.fechaEstSalida,
      f.dias, CHECKING_LABELS[f.checking] ?? '',
      f.motivo, f.observaciones,
    ])
    // Color en columna Días según semáforo
    const cellDias = row.getCell(9)
    if (f.dias <= 2)      cellDias.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4ADE80' } }
    else if (f.dias <= 5) cellDias.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBBF24' } }
    else                  cellDias.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } }
    // Word-wrap en motivo y observaciones
    row.getCell(11).alignment = { wrapText: true, vertical: 'top' }
    row.getCell(12).alignment = { wrapText: true, vertical: 'top' }
  })

  // Freeze pane
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 8 }]

  // Bordes en todas las celdas de datos
  // ...

  // Generar buffer y descargar
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  a.click()
  URL.revokeObjectURL(url)
}
```

**Modificación en `ReporteDiario.jsx`**:
- Reemplazar el botón "Exportar CSV" por **"Exportar Excel"**
- O dejar ambos? *Mi recomendación*: reemplazar — el Excel cubre todo el caso de uso del CSV.

```jsx
async function exportarExcel() {
  const filtrosLabel = {
    tipos: [
      incluyeServicios && 'Servicios',
      incluyeDanos && 'Daños',
    ].filter(Boolean).join(' + '),
    mes: mes ? meses.find(m => m.year === mes.year && m.month === mes.month)?.label : 'Ver Todos',
  }
  await exportarReporteExcel({
    filas: filasFiltradas,
    filtros: filtrosLabel,
    nombreArchivo: `reporte-diario-${new Date().toISOString().slice(0,10)}.xlsx`,
  })
}
```

---

## Bloque 1.5 — Nuevo filtro de Año en el Reporte Diario

### Comportamiento

El filtro de mes actual cambia a un combo de **Año + Mes**:

- **Año**: dropdown con los años disponibles
  - Lista dinámica: desde **2026** (inicio del sistema) hasta el año actual
  - Hoy (2026) → solo aparece `2026`
  - Cuando llegue 2027 → aparecen `2027` y `2026`
  - Nunca se muestra `2025` (anterior al inicio del sistema) ni años futuros que aún no han llegado
- **Mes**: dropdown con
  - **Todos** (default — equivalente al actual "Ver Todos")
  - Enero, Febrero, ..., Diciembre

### Implementación

```js
function listarAniosDisponibles() {
  const inicio = 2026
  const fin = new Date().getFullYear()
  const anios = []
  for (let y = fin; y >= inicio; y--) anios.push(y)
  return anios  // [2026] hoy; [2027, 2026] en 2027
}

function rangoFecha({ year, month }) {
  if (month) {
    // Mes específico
    const inicio = new Date(year, month - 1, 1).toISOString().slice(0, 10)
    const fin    = new Date(year, month, 0).toISOString().slice(0, 10)
    return { inicio, fin }
  }
  // Año completo (mes = "Todos")
  return {
    inicio: new Date(year, 0, 1).toISOString().slice(0, 10),
    fin:    new Date(year, 11, 31).toISOString().slice(0, 10),
  }
}
```

Estado:
```js
const [anio, setAnio] = useState(new Date().getFullYear())
const [mes, setMes]   = useState(null)  // null = Todos
```

UI:
```
Año: [2026 ▼]    Mes: [Todos ▼]
```

---

## Bloque 2 — Mejora de impresión

La vista de impresión actual solo oculta el resto de la página y muestra la tabla. Falta:

- **Logo de Pass** en el header
- **Título** del reporte
- **Fecha de generación**
- **Resumen de filtros aplicados**
- **Total de vehículos**

### Solución técnica

Agregar al componente `ReporteDiario` un bloque **solo visible en print** con header de marca:

```jsx
{/* Header solo visible al imprimir */}
<div className="hidden print:block px-5 py-3 border-b border-gray-200">
  <div className="flex items-start gap-4">
    <img src="/pass-35-logo.png" alt="Pass" className="h-12 object-contain" />
    <div className="flex-1">
      <h1 className="text-base font-bold">REPORTE DIARIO — PASS RENT A CAR GUATEMALA</h1>
      <p className="text-xs text-gray-600">Gestión de Daños y Servicios</p>
      <p className="text-xs text-gray-500 mt-0.5">
        Generado: {new Date().toLocaleString('es-GT')} · Filtros: {filtrosLabel} · Total: {filasFiltradas.length}
      </p>
    </div>
  </div>
</div>
```

Con `hidden print:block` solo aparece al imprimir y queda invisible en pantalla.

CSS existente sigue funcionando — solo se agrega esta sección encima de la tabla.

---

## Bloque 3 — Orden descendente

Hoy `ReporteDiario.jsx` ordena ascending: `sort((a, b) => new Date(a.fechaRegistro) - new Date(b.fechaRegistro))`.

Cambiar a **descending**: `sort((a, b) => new Date(b.fechaRegistro) - new Date(a.fechaRegistro))`

Esto aplica al dashboard (visual), al Excel y al print porque comparten la misma fuente de datos (`filasFiltradas`).

---

## Decisiones tomadas

| # | Decisión | Justificación |
|---|----------|---------------|
| 1 | Librería `exceljs` (no `xlsx` SheetJS) | Necesitamos soportar logo embebido |
| 2 | Import dinámico de `exceljs` | Ahorra ~1MB del bundle inicial — se carga solo al exportar |
| 3 | Reemplazar botón "Exportar CSV" por "Exportar Excel" | El Excel es superset del CSV; no tiene sentido mantener ambos |
| 4 | Mismas columnas que el dashboard | El usuario lo pidió explícitamente; consistencia visual |
| 5 | Filtros respetados via `filasFiltradas` | Ya viven en memoria, no requiere segunda query |
| 6 | Orden descendente por fecha en TODOS los lugares (dashboard + Excel + print) | Consistencia entre vista en pantalla y reportes exportados |
| 7 | Logo embebido en Excel + header de print | Marca corporativa visible en cualquier soporte |
| 8 | Conditional formatting del semáforo en celda Días | El Excel mantiene la misma señal visual del dashboard |
| 9 | Word wrap en Motivo y Observaciones | Espejo del comportamiento del dashboard (40ch) |
| 10 | Freeze pane en la fila de headers | UX estándar en reportes Excel |
| 11 | Título sin la palabra "Filtros" — usa "Registro de Daños/Servicios" dinámico | Más limpio y comercial |
| 12 | Nuevo filtro de **Año** separado del mes | Permite navegar histórico una vez pase 2026 |
| 13 | Año arranca en 2026 y crece automáticamente cada año | El sistema comienza en 2026 |
| 14 | Sufijo en nombre del archivo solo si filtro individual (`-danos` / `-servicios`) | Identificación rápida al archivar |

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| `exceljs` aumenta bundle | Dynamic import — solo se carga al hacer click |
| Logo png puede no cargar (404) | Fallback: si falla el fetch del logo, generar Excel sin imagen (no rompe) |
| Excel con 500+ filas puede ser lento | Aceptable; el reporte siempre filtra por estado activo (no incluye cerrados) |
| Caracteres especiales (tildes, ñ) | exceljs maneja UTF-8 nativamente, sin BOM necesario |
| Algunas versiones de Excel no muestran imágenes anchored | Posicionamos sobre celdas (`tl`/`ext`) no inline — formato estándar |

---

## Métricas de éxito

### Excel
- [ ] Existe botón "Exportar Excel" en el Reporte Diario
- [ ] Al click, descarga `reporte-diario-YYYY-MM-DD.xlsx`
- [ ] El archivo abre limpio en Microsoft Excel, LibreOffice y Google Sheets
- [ ] El logo aparece en el header del archivo
- [ ] Aparece título, fecha de generación, filtros aplicados, total
- [ ] Las columnas coinciden EXACTAMENTE con el dashboard
- [ ] El orden es descendente por fecha (más reciente arriba)
- [ ] El filtro de tipos (Servicios/Daños) se respeta
- [ ] El filtro de mes ("Ver Todos" o mes específico) se respeta
- [ ] La columna "Días" tiene fondo verde/ámbar/rojo según semáforo
- [ ] Motivo y Observaciones tienen word wrap (no se truncan)
- [ ] La fila de headers está congelada (freeze)
- [ ] La hoja se imprime correctamente en horizontal A4

### Print mejorado
- [ ] Al imprimir desde el botón Imprimir, aparece logo + título + filtros + total al inicio
- [ ] El logo y el encabezado SOLO aparecen al imprimir (no en pantalla)
- [ ] La tabla mantiene su layout actual (semáforo, columnas)

### Orden descendente
- [ ] El dashboard muestra los registros más recientes arriba
- [ ] El Excel y el print mantienen el mismo orden

---

## Archivos a crear / modificar

### Crear
- `frontend/src/lib/exportarReporteExcel.js` — utility con la lógica de generación

### Modificar
- `frontend/src/components/ReporteDiario.jsx`
  - Reemplazar `exportarCSV()` por `exportarExcel()`
  - Cambiar texto del botón "Exportar CSV" → "Exportar Excel"
  - Agregar header solo-print con logo
  - Cambiar `sort` a descendente
- `frontend/package.json` — agregar `exceljs` como dependencia
- (`package-lock.json` se actualiza solo)

---

## Orden de ejecución sugerido

1. `npm install exceljs --prefix frontend`
2. Crear `lib/exportarReporteExcel.js` con la función
3. Modificar `ReporteDiario.jsx`:
   - Botón "Exportar Excel" en lugar de CSV
   - Header solo-print con logo
   - Sort descendente
4. Probar en navegador: abrir reporte, click "Exportar Excel", verificar archivo
5. Probar imprimir: ver que el header con logo aparece
6. Probar con diferentes combinaciones de filtros (Solo Daños / Solo Servicios / Mes específico / Ver Todos)
7. Commit y push
8. Deploy

---

## Notas para futuro (Fase 3 opcional)

- Programar envío automático del Excel diario por email (oncalls de operaciones)
- Versión PDF del reporte (similar a Excel pero PDF, usando jsPDF)
- Página de "Reportes guardados" con histórico de reportes generados
- Filtros adicionales en el reporte: por taller, por placa, por ubicación
- Reporte semanal/mensual con totales y gráficos en una hoja adicional del Excel
