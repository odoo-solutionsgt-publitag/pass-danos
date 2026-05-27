# FASE 4 — Cotizaciones, comparador y proforma

**Estado**: ✅ Completado
**Depende de**: Fase 3

---

## Objetivo

Permitir solicitar 1-3 cotizaciones a talleres del catálogo, capturar líneas de detalle por taller, comparar lado a lado y aprobar una → genera la proforma con monto al cliente.

---

## Archivos

- [frontend/src/components/CotizacionesSection.jsx](../frontend/src/components/CotizacionesSection.jsx)
- [frontend/src/components/ProformaSection.jsx](../frontend/src/components/ProformaSection.jsx)
- Embebidos en [SiniestroDetalle.jsx](../frontend/src/pages/SiniestroDetalle.jsx)

---

## CotizacionesSection

Visible cuando `siniestro.estado === 'cotizando'`.

### Solicitar cotizaciones
- Selector múltiple de talleres del catálogo (máx 3).
- `INSERT` en `cotizaciones` una fila por taller con `estado='solicitada'`.

### Editor de líneas inline
Por cada cotización, una tabla con grid de 12 columnas:
- Tipo (repuesto / mano de obra / otro)
- Descripción (autocomplete sobre `repuestos_catalogo`)
- Cantidad / Precio unitario / Subtotal calculado
- Botón eliminar línea

`handleAddLinea(cotId)` hace INSERT en `cotizacion_lineas`. Al primer INSERT, la cotización pasa automáticamente de `solicitada` → `recibida`.

Los totales (`total_repuestos`, `total_mano_obra`, `total_otros`, `total_general`) se recalculan via trigger `actualizar_totales_cotizacion()` en Supabase.

### Comparador
Cuando hay 2+ cotizaciones con líneas, se muestra una tabla lado a lado con totales. Una estrella ★ marca el `total_general` mínimo.

### Aprobar cotización
`handleAprobar(cotId, tallerId)`:
1. UPDATE cotización ganadora → `aprobada`
2. UPDATE las demás → `rechazada`
3. UPDATE siniestro: `taller_id`, `costo_pass = total_general`, `estado = 'proforma_emitida'`

---

## ProformaSection

Visible cuando `estado IN ('proforma_emitida', 'proforma_aprobada', 'en_reparacion', 'reparado', 'en_cobro', 'cerrado')`.

### Contenido
- Cabecera con datos del siniestro y taller asignado
- Tabla de líneas de la cotización aprobada
- Totales (repuestos, mano de obra, otros, general)
- **Campo editable `monto_cliente`**: lo que se le cobra al cliente (puede ser diferente al costo Pass)
- Grid financiero: Cliente paga / Pass paga / Margen (verde si ≥0, rojo si <0)

### Guardado
Al editar `monto_cliente` se guarda en el siniestro junto con `margen = monto_cliente - costo_pass`.

### Imprimir
Botón "Imprimir / PDF" usa `window.print()`. CSS print-friendly (oculta sidebar/header en `@media print`).

---

## Decisiones

- **Comparador siempre visible cuando útil**: aparece automáticamente al tener ≥2 cotizaciones con líneas, no requiere botón.
- **Autocomplete de repuestos**: cuando el usuario escribe en "Descripción" se sugieren repuestos del catálogo. Al seleccionar, el precio_unitario se pre-llena con `precio_ref`.
- **Sin "borrar cotización"**: si una cotización se solicitó por error, se queda como `rechazada` al aprobar otra. No hay DELETE para conservar auditoría.
- **Trigger en DB, no en frontend**: los totales NUNCA se calculan en frontend para evitar drift. Después de un INSERT/UPDATE de líneas, se vuelve a cargar la cotización para mostrar totales correctos.

---

## Criterio de éxito (cumplido)

- [x] Se solicitan cotizaciones a 1-3 talleres simultáneamente
- [x] Las líneas se agregan inline con Enter
- [x] El comparador resalta el menor total
- [x] Al aprobar, el siniestro pasa a `proforma_emitida` automáticamente
- [x] El margen se calcula y muestra (verde/rojo según signo)
- [x] Imprimir genera una vista limpia
