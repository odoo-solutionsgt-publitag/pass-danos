# FASE 10 — Reportes y KPIs

**Estado**: ✅ Completado
**Depende de**: todas las fases anteriores

---

## Objetivo

Pantalla analítica con KPIs financieros, distribución por categorías, ranking de vehículos y export a CSV. Toggle Daños/Servicios para alternar entre ambos datasets sin recargar.

---

## Archivos

- [frontend/src/pages/Reportes.jsx](../frontend/src/pages/Reportes.jsx)

---

## Layout

### Header
- Título + contador de registros en el período
- Botón **Exportar CSV**

### Filtros
- Toggle Daños / Servicios (pill switcher)
- Date pickers Desde / Hasta
- Shortcuts: 30d / 90d / 12m
- Default: últimos 12 meses (desde el día 1 del mes hace 11 meses)

### 4 KPI cards (cambian según la vista)
**Daños**: Total / Costo Pass total / Promedio por daño / Margen acumulado (verde si ≥0, rojo si <0)
**Servicios**: Total / Gasto total / Promedio por servicio / En proceso (cuántas órdenes activas)

### Bar chart por mes (12 meses rolling)
- Barras horizontales con CSS puro (sin librería externa)
- Cada fila: label del mes, barra proporcional, conteo, monto Q.
- Color: rojo para daños, azul para servicios
- Calculado en cliente desde el dataset filtrado

### Distribución por categoría
- **Daños**: distribución por severidad (leve / medio / severo / pérdida_total) con color específico
- **Servicios**: distribución por tipo de servicio (servicio_menor, cambio_llantas, etc.)
- Barras horizontales con porcentaje

### Top 5 vehículos
Ranking por cantidad de registros (daños o servicios). Columnas: Placa, Vehículo (marca + línea + tipo), Cantidad, Total Q.

### Resumen por tipo de vehículo
Agrupado por `tipo_vehiculo` (Sedán, SUV, Pickup, Microbús). Columnas: Tipo, Cantidad, Total Q, Promedio.

---

## Cálculos (función `computeStats`)

Todos los cálculos se hacen en cliente sobre el dataset ya filtrado por fechas:

```js
const montoOf = (r) => vista === 'danos' ? r.costo_pass : r.total_general
const fechaOf = (r) => vista === 'danos' ? r.fecha_dano : r.fecha_programada
```

- **Por mes**: pre-genera 12 slots (mes/año) y acumula por match de YYYY-MM.
- **Distribución**: agrupa por campo discriminador (severidad o tipo_servicio).
- **Top vehículos**: agrupa por placa, ordena por count desc, slice 5.
- **Por tipo vehículo**: agrupa por tipo_vehiculo, mantiene cantidad y suma.

---

## Export CSV

```js
const csv = rows.map(r => r.map(c => `"${...}"`).join(',')).join('\n')
const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })  // BOM UTF-8
```

El BOM `﻿` al inicio fuerza Excel a abrir el archivo con UTF-8 (de lo contrario muestra mojibake con tildes y ñ).

Nombre del archivo: `reporte_{vista}_{desde}_{hasta}.csv`

---

## Decisiones

- **Sin librería de charts**: Recharts pesaría ~150KB. Para gráficos simples (barras horizontales con %), CSS basta y es más rápido. Si en el futuro se requieren pies/líneas/áreas se puede agregar.
- **Cálculos en cliente, no en SQL**: el dataset por período cabe en memoria sin problema (~cientos de filas máximo en años). Mantener todo en cliente evita ida y vuelta y permite filtros instantáneos.
- **`useMemo` para stats**: recalcula solo cuando cambia el dataset o la vista.
- **BOM UTF-8**: detalle crítico para que el CSV se abra bien en Excel guatemalteco (idioma español).

---

## Criterio de éxito (cumplido)

- [x] Los KPIs reflejan correctamente el período seleccionado
- [x] El bar chart muestra los últimos 12 meses con datos
- [x] La distribución suma 100% sobre el total filtrado
- [x] El top 5 ordena correctamente por cantidad
- [x] El CSV se descarga y se abre correctamente en Excel con tildes/ñ
- [x] Cambiar Daños/Servicios actualiza todo sin recargar la página
