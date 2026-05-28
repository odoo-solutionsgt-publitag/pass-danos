# Fase 2 / I — Descuento en líneas de detalle

**Estado**: 📋 Pendiente
**Prioridad**: Media
**Estimado**: 1 sesión (2-3 horas)

---

## Requerimientos

En las líneas de detalle (`cotizacion_lineas` y `orden_servicio_lineas`), agregar **Descuento** como un cuarto componente además de Repuestos, Mano de Obra y Otros.

El descuento puede ser:
- Por línea (un descuento específico al ítem)
- O por tipo agregado (descuento global a aplicar al subtotal)

Decisión: **por línea** porque permite mayor flexibilidad y se totaliza en el grupo "Descuentos" en la sumatoria.

---

## Modelo de datos

### Opción A — Campo `descuento` por línea (recomendado)

```sql
-- cotizacion_lineas
ALTER TABLE cotizacion_lineas
  ADD COLUMN descuento NUMERIC(12,2) DEFAULT 0;

-- orden_servicio_lineas
ALTER TABLE orden_servicio_lineas
  ADD COLUMN descuento NUMERIC(12,2) DEFAULT 0;

-- Recalcular subtotal: (cantidad * precio_unitario) - descuento
```

### Actualizar trigger de subtotales

```sql
-- El subtotal de la línea ahora considera descuento
-- Cambio: subtotal = (cantidad * precio_unitario) - COALESCE(descuento, 0)

-- En cotizaciones, agregar columna total_descuentos
ALTER TABLE cotizaciones
  ADD COLUMN total_descuentos NUMERIC(12,2) DEFAULT 0;

-- Recalcular trigger actualizar_totales_cotizacion()
CREATE OR REPLACE FUNCTION actualizar_totales_cotizacion()
RETURNS TRIGGER AS $$
DECLARE
  v_cot_id UUID;
BEGIN
  v_cot_id := COALESCE(NEW.cotizacion_id, OLD.cotizacion_id);

  UPDATE cotizaciones SET
    total_repuestos = COALESCE((
      SELECT SUM(cantidad * precio_unitario) FROM cotizacion_lineas
      WHERE cotizacion_id = v_cot_id AND tipo = 'repuesto'
    ), 0),
    total_mano_obra = COALESCE((
      SELECT SUM(cantidad * precio_unitario) FROM cotizacion_lineas
      WHERE cotizacion_id = v_cot_id AND tipo = 'mano_obra'
    ), 0),
    total_otros = COALESCE((
      SELECT SUM(cantidad * precio_unitario) FROM cotizacion_lineas
      WHERE cotizacion_id = v_cot_id AND tipo = 'otro'
    ), 0),
    total_descuentos = COALESCE((
      SELECT SUM(descuento) FROM cotizacion_lineas WHERE cotizacion_id = v_cot_id
    ), 0),
    total_general = COALESCE((
      SELECT SUM((cantidad * precio_unitario) - COALESCE(descuento, 0))
      FROM cotizacion_lineas WHERE cotizacion_id = v_cot_id
    ), 0),
    updated_at = now()
  WHERE id = v_cot_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
```

Análogo para `actualizar_totales_orden_servicio()`.

---

## Frontend

### Editor de líneas (`CotizacionesSection.jsx`, `ServicioDetalle.jsx`, `ServicioNuevo.jsx`)

Cambiar el grid del editor inline a 14 columnas (estaba en 12):

```
[Tipo] [Descripción ............] [Cant] [P.Unit] [Descuento] [Subtotal] [+]
```

El `Subtotal` ahora se calcula como `(cant * p.unit) - descuento`.

Validación: descuento no puede ser mayor a `cantidad * precio_unitario`.

### Sumatoria de cotización / orden

Agregar línea nueva en el desglose:
```
Repuestos:         Q 2,500
Mano de obra:      Q 1,250
Otros:             Q   250
Descuentos:        Q  (150)   ← en rojo o entre paréntesis
─────────────────────────
Total:             Q 3,850
```

### Comparador

Las columnas del comparador suman los descuentos al desglose por taller.

### Ficha imprimible

Mostrar columna "Descuento" en la tabla de líneas, y línea de "Descuentos" en el resumen.

---

## Casos de prueba

| Caso | Resultado esperado |
|------|-------------------|
| Línea de Q500 con descuento Q100 | Subtotal Q400 |
| Línea sin descuento | Subtotal igual a cantidad × precio_unitario |
| Descuento > subtotal bruto | Validación bloquea (error en frontend) |
| Suma de descuentos en una cotización | Visible como línea separada en el desglose |
| Edición de descuento después de aprobada | Trigger sincroniza `costo_pass` (depende de Plan F2/C) |

---

## Pasos de implementación

1. SQL: ALTER TABLE (2 tablas) + ALTER cotizaciones (`total_descuentos`)
2. SQL: actualizar trigger `actualizar_totales_cotizacion` y `actualizar_totales_orden_servicio`
3. Frontend: agregar columna `Descuento` en editor inline (3 archivos)
4. Frontend: agregar fila "Descuentos" en sumatoria de cotización (CotizacionesSection)
5. Frontend: agregar fila "Descuentos" en sumatoria de servicio (ServicioDetalle)
6. Frontend: actualizar comparador
7. Ficha imprimible: incluir columna y fila
8. Validación: descuento ≤ subtotal bruto

---

## Criterios de éxito

- [ ] Cada línea acepta descuento opcional
- [ ] El subtotal de la línea refleja el descuento
- [ ] Los totales de cotización/orden incluyen `total_descuentos` por separado
- [ ] El comparador resalta correctamente con descuentos aplicados
- [ ] La ficha imprimible muestra los descuentos
