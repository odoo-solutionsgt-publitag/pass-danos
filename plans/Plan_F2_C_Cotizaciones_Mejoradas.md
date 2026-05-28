# Fase 2 / C — Cotizaciones mejoradas

**Estado**: 📋 Pendiente
**Prioridad**: Alta
**Estimado**: 2 sesiones (4-6 horas)

---

## Requerimientos

1. Permitir solicitar el **mismo taller** en múltiples cotizaciones (variantes: original vs genérico)
2. Permitir **editar líneas** de una cotización después de aprobada (el proveedor a veces ajusta el precio de última hora)

---

## Modelo de datos

### 1. Agregar `variante` a `cotizaciones`

```sql
ALTER TABLE cotizaciones
  ADD COLUMN variante TEXT;

COMMENT ON COLUMN cotizaciones.variante IS
  'Etiqueta opcional para distinguir cotizaciones del mismo taller, ej: "Original", "Genérico", "Sin pintar"';
```

### 2. Levantar restricción de unicidad (si existe)

Verificar si hay UNIQUE constraint sobre `(siniestro_id, taller_id)`. Si existe, eliminarla:
```sql
ALTER TABLE cotizaciones DROP CONSTRAINT IF EXISTS uniq_siniestro_taller;
```

### 3. Re-sincronización del `costo_pass` cuando se edita una cotización aprobada

Crear trigger que mantenga `siniestros.costo_pass` sincronizado:

```sql
CREATE OR REPLACE FUNCTION sync_costo_pass_from_approved_quote()
RETURNS TRIGGER AS $$
DECLARE
  v_siniestro_id UUID;
  v_total NUMERIC;
BEGIN
  -- Obtener el siniestro afectado
  SELECT siniestro_id INTO v_siniestro_id
  FROM cotizaciones WHERE id = COALESCE(NEW.cotizacion_id, OLD.cotizacion_id);

  -- Solo sincronizar si la cotización está aprobada
  IF EXISTS (
    SELECT 1 FROM cotizaciones
    WHERE id = COALESCE(NEW.cotizacion_id, OLD.cotizacion_id)
      AND estado = 'aprobada'
  ) THEN
    SELECT total_general INTO v_total FROM cotizaciones WHERE id = COALESCE(NEW.cotizacion_id, OLD.cotizacion_id);
    UPDATE siniestros
       SET costo_pass = v_total,
           margen = monto_cliente - v_total,
           updated_at = now()
     WHERE id = v_siniestro_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_costo_pass
  AFTER INSERT OR UPDATE OR DELETE ON cotizacion_lineas
  FOR EACH ROW
  EXECUTE FUNCTION sync_costo_pass_from_approved_quote();
```

---

## Frontend

### CotizacionesSection.jsx

Cambios al solicitar:
- En vez de checkbox por taller, ahora **multi-select repetible**:
  - Botón "+ Agregar taller a esta solicitud"
  - Cada fila tiene: select taller + input opcional "Variante" (ej: "Original", "Genérico")
  - No hay límite a 3 — permitir N
- Al guardar: INSERT en `cotizaciones` por cada combinación taller+variante

Ya aprobada, permitir re-edición:
- El bloque de líneas sigue siendo editable después de `aprobada`
- Aclarar visualmente: badge ámbar "Edición permitida — al guardar se actualizará el costo Pass"
- Cada cambio dispara el trigger que actualiza `siniestros.costo_pass` y `margen`

### Comparador

Agrupar por taller mostrando la variante en el header:
```
GRUPO Q (Original) | GRUPO Q (Genérico) | REASA (Original)
       Q 3,500     |     Q 2,800        |     Q 3,200 ★
```

Mostrar ★ siempre al menor total entre todas las variantes.

### ProformaSection

- Si la cotización aprobada tiene `variante`, mostrarla bajo el nombre del taller:
  ```
  Proforma — GRUPO Q
  Variante: Original · Cotización aprobada
  ```
- Mostrar timestamp de "última actualización" si hay cambios después de aprobada

---

## Auditoría adicional

Aprovechar el `audit_log` de Plan F2/A: cada modificación de `cotizacion_lineas` quedará registrada automáticamente. En el detalle de la cotización, agregar una sub-sección colapsable "Historial de modificaciones" que filtre `audit_log` por la cotización.

---

## Casos de prueba

| Caso | Resultado esperado |
|------|-------------------|
| Pedir 2 cotizaciones a GRUPO Q (Original + Genérico) | Aparecen 2 cards separadas |
| Comparador con 3 talleres × 2 variantes | 6 columnas con ★ al menor |
| Editar línea en cotización aprobada | `siniestros.costo_pass` se recalcula automáticamente |
| Editar línea y bajar el precio | `margen` se recalcula y cambia de color si ahora es positivo |
| Eliminar línea de cotización aprobada | Trigger re-suma totales; auditoría registra DELETE |

---

## Pasos de implementación

1. SQL: ALTER cotizaciones + DROP unique constraint + trigger sync costo_pass
2. Frontend: modal "Solicitar cotización" rediseñado con multi-fila
3. Frontend: badge de variante en cada card de cotización
4. Frontend: permitir edición tras aprobada con warning visual
5. Frontend: comparador agrupado por taller+variante
6. Frontend: histórico colapsable en cada cotización (usa audit_log)
7. Pruebas con casos de la tabla

---

## Criterios de éxito

- [ ] GRUPO Q puede aparecer 2 veces con variantes distintas
- [ ] Tras aprobar, las líneas siguen editables
- [ ] Cambios en líneas aprobadas sincronizan `costo_pass` automáticamente
- [ ] El margen se recalcula sin intervención manual
- [ ] El comparador muestra todas las variantes lado a lado
