# Plan — Actualización del criterio de monto en listas de Daños y Servicios

**Estado**: 📋 Pendiente de aprobación
**Origen**: El usuario observó que muchos registros aparecen sin monto (`—`) en las listas, lo cual genera confusión gerencial
**Prioridad**: Alta
**Estimado**: 1 sesión (1.5 – 2 horas)

---

## Problema actual

### Daños (`Siniestros.jsx`)
- Columna "Total Q." muestra `siniestros.monto_cliente`
- `monto_cliente` se llena **manualmente** por el usuario en `ProformaSection` (campo "Monto a cobrar al cliente")
- Default `0` cuando se crea el daño
- **Síntoma**: si el operador no llena el campo, la fila aparece con `—` aunque ya haya cotizaciones aprobadas con sus montos

### Servicios (`Servicios.jsx`)
- Columna "Total Q." muestra `ordenes_servicio.total_general`
- `total_general` se calcula automáticamente por trigger SQL sumando `orden_servicio_lineas.subtotal`
- **Síntoma**: aparece `—` cuando no hay líneas registradas, pero ya hay taller asignado

---

## Nueva lógica solicitada

### Daños
| Modo cotización | Monto a mostrar |
|----------------|-----------------|
| `unica` | **El más económico** (MIN) de los `total_general` de cotizaciones con líneas, sin importar si fue aprobado o no |
| `multiple` | **SUMA** de los `total_general` de todas las cotizaciones con líneas, sin importar si fueron aprobadas o no |

- Las cotizaciones en estado **`rechazada` se excluyen** del cálculo (fueron explícitamente descartadas)
- Las cotizaciones `solicitada` sin líneas también se excluyen (no tienen monto)
- Si no hay ninguna cotización válida con monto → mostrar `—`
- El monto se considera **propuesto / temporal** cuando ninguna está aprobada todavía; el cálculo es el mismo

### Servicios
- Mantener `total_general` actual (suma automática de líneas)
- **Nota**: los servicios no tienen tabla de cotizaciones, las "líneas" cumplen el rol de propuesta del taller. El criterio "al menos un taller" se cumple cuando hay al menos una línea registrada.

---

## Marcador visual del estado del monto

Para que el operador identifique si el monto es **definitivo** (basado en cotización aprobada) o **propuesto temporal** (basado en cotizaciones sin aprobar):

| Situación | Display |
|-----------|---------|
| Daño con cotización(es) **aprobada(s)** | `Q 3,375.00` en color normal |
| Daño con cotizaciones **sin aprobar** (sólo propuestas) | `Q 3,375.00*` en cursiva gris (asterisco indica temporal) |
| Sin cotizaciones con monto | `—` |

Servicios: sin marcador, solo el monto plano.

(Decisión a confirmar: añadir asterisco/cursiva, o dejar el monto plano sin distinción.)

---

## Implementación

### A. `Siniestros.jsx` — query y cálculo

**Query Supabase actualizada**:

```js
let q = siniestrosQuery(`
  id, numero, fecha_dano, placa, cliente_nombre, tipo_dano, severidad,
  estado, estado_checking, tipo_cotizacion, created_at,
  cotizaciones(estado, total_general)
`)
```

Esto trae cada daño con un array de sus cotizaciones (`estado`, `total_general`).

**Helper de cálculo**:

```js
function calcularMontoDano(daño) {
  const cots = (daño.cotizaciones ?? []).filter(c =>
    c.estado !== 'rechazada' && Number(c.total_general) > 0
  )
  if (cots.length === 0) return { monto: null, esTemporal: false }

  const hayAprobada = cots.some(c => c.estado === 'aprobada')

  if (daño.tipo_cotizacion === 'multiple') {
    return {
      monto: cots.reduce((acc, c) => acc + Number(c.total_general), 0),
      esTemporal: !hayAprobada,
    }
  }
  // unica: mostrar la más económica
  return {
    monto: Math.min(...cots.map(c => Number(c.total_general))),
    esTemporal: !hayAprobada,
  }
}
```

**En el render** (línea 192 actual):

```jsx
<td className="px-5 py-3.5 whitespace-nowrap">
  {(() => {
    const { monto, esTemporal } = calcularMontoDano(s)
    if (monto === null) return <span className="text-gray-300">—</span>
    return (
      <span className={esTemporal ? 'text-gray-500 italic' : 'text-gray-700'}>
        {formatMonto(monto)}
        {esTemporal && '*'}
      </span>
    )
  })()}
</td>
```

Y agregar nota al pie de la tabla: `* monto propuesto, basado en cotizaciones sin aprobar`.

### B. `Servicios.jsx` — sin cambios

La columna sigue mostrando `total_general` que viene de la suma de líneas. No requiere cambios.

(Aunque si más adelante quieres extender el modelo de servicios para soportar cotizaciones de talleres, sería otro plan.)

### C. ¿Aplicar también al Reporte Diario?

El Reporte Diario muestra:
- **Cliente paga** → `siniestros.monto_cliente` (manual)
- **Pass paga** → `siniestros.costo_pass` (sólo se actualiza con aprobaciones, vía trigger)
- **Margen** → `monto_cliente - costo_pass`

Aplicar el nuevo criterio a "Pass paga" implicaría calcular el costo Pass propuesto incluso sin aprobaciones (igual que esta lógica). Pero el `costo_pass` es un campo persistido, no calculado al vuelo.

**Pregunta para confirmar**: ¿extender el nuevo criterio también a "Pass paga" del Reporte Diario, o lo dejamos sólo en las listas de Daños/Servicios? Mi recomendación: aplicarlo también al Reporte (consistencia visual), calculando la columna al vuelo desde las cotizaciones. Sin necesidad de cambiar `costo_pass` en BD.

---

## Decisiones tomadas

| # | Decisión | Justificación |
|---|----------|---------------|
| 1 | Sin cambios en BD | Todo se calcula al vuelo en frontend desde las cotizaciones |
| 2 | Sin cambios en backend | No interviene |
| 3 | Filtrar cotizaciones `rechazada` | Fueron explícitamente descartadas, no son "propuesta válida" |
| 4 | Servicios usan `total_general` existente | Su modelo no tiene cotizaciones — las líneas son la propuesta |
| 5 | Marcador visual `*` + cursiva para temporal | Permite distinguir propuesta vs final sin saturar la UI |
| 6 | El campo `monto_cliente` sigue existiendo | Lo usa la `ProformaSection` para definir el cobro al cliente final |
| 7 | Lista de daños deja de mostrar `monto_cliente` | Ese campo es para el cobro, no para visualización gerencial |

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Daños sin cotizaciones siguen mostrando `—` | Es esperado — sin propuestas no hay monto. Consistente con el resto. |
| El cálculo al vuelo con muchas cotizaciones agrega ms al render | El número típico es <10 por daño; impacto despreciable |
| Confusión entre "monto propuesto" vs "monto final cobro" | El marcador `*` y la nota al pie aclaran |
| Cambio de comportamiento histórico afecta reportes preexistentes | Ningún reporte se rompe — sólo cambia la columna del listado |

---

## Métricas de éxito

- [ ] Lista de daños muestra monto **siempre que haya 1+ cotización válida con líneas**, sin requerir aprobación
- [ ] Daños modo `unica`: muestra MIN de las cotizaciones válidas
- [ ] Daños modo `multiple`: muestra SUM de las cotizaciones válidas
- [ ] Cotizaciones `rechazada` se excluyen del cálculo
- [ ] Marcador visual (`*` y cursiva) cuando ninguna aprobada
- [ ] Lista de servicios sin cambios (sigue mostrando `total_general`)
- [ ] No se rompen las páginas relacionadas (detalle, proforma, ficha imprimible)

---

## Archivos a modificar

### Modificar
- `frontend/src/pages/Siniestros.jsx`
  - Ampliar el select para traer `tipo_cotizacion` + `cotizaciones(estado, total_general)`
  - Helper `calcularMontoDano()`
  - Render condicional con marcador visual
  - Nota al pie de tabla

### (Opcional, si se confirma extensión)
- `frontend/src/components/ReporteDiario.jsx` — aplicar mismo helper para columna "Pass paga"

### Sin tocar
- BD, backend, `ProformaSection`, `Servicios.jsx`, otros componentes

---

## Preguntas para confirmar antes de implementar

### Q1 — ¿Marcador visual `*` para monto propuesto?
**Mi recomendación**: sí, con leyenda al pie. Permite saber si el monto es "tentativo".
Alternativa: monto plano sin distinción (más simple, menos información).

### Q2 — ¿Extender el mismo criterio a "Pass paga" del Reporte Diario?
**Mi recomendación**: sí, por consistencia. Calcular al vuelo desde cotizaciones (sin tocar `costo_pass` en BD).

### Q3 — ¿Excluir cotizaciones `rechazada` del cálculo?
**Mi recomendación**: sí (mi default). Una cotización rechazada fue descartada; no debería contar en propuesta.

### Q4 — ¿Cambiar el header de la columna?
Hoy dice "Total Q.". Quizá cambiar a "Monto cotización" para reflejar el nuevo significado.
**Mi recomendación**: cambiar a **"Monto"** (más limpio) o **"Monto cotización"** (más explícito).

---

## Orden de ejecución sugerido

1. Confirmar Q1-Q4
2. Modificar `Siniestros.jsx` (query, helper, render)
3. Si Q2 = sí: modificar `ReporteDiario.jsx` (helper similar para Pass paga)
4. Pruebas en navegador:
   - Daño sin cotizaciones → `—`
   - Daño con 1 cotización con líneas sin aprobar (modo única) → muestra esa con `*`
   - Daño con 3 cotizaciones modo única, 1 aprobada → muestra MIN sin `*` si la MIN es la aprobada
   - Daño con 3 cotizaciones modo única, 1 aprobada que NO es la más económica → muestra MIN con `*` (porque no es la aprobada)
   - Daño con 3 cotizaciones modo múltiple, 1 aprobada → muestra SUM de las 3 con `*`
5. Commit y push
