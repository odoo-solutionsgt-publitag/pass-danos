# Fase 2 / G — Fechas adicionales

**Estado**: 📋 Pendiente
**Prioridad**: Media
**Estimado**: 1 sesión (1-2 horas)

---

## Requerimientos

Agregar fechas adicionales a la ficha de daño y servicio:
- **Fecha de entrega al taller** — cuándo se hizo el envío físico del vehículo (distinto de `fecha_ingreso` que es la fecha contable de inicio)
- **Fecha estimada de finalización** — compromiso del taller
- **Fecha real de finalización** — cuándo realmente terminó (≠ egreso si hubo demora interna en Pass)

> El usuario mencionó "Fecha Entrega Taller" explícitamente. Las otras dos se sugieren porque típicamente acompañan ese flujo. **Confirmar con Pass cuáles aplican antes de implementar.**

---

## Modelo de datos

```sql
-- En siniestros
ALTER TABLE siniestros
  ADD COLUMN fecha_entrega_taller       DATE,
  ADD COLUMN fecha_estimada_finalizacion DATE,
  ADD COLUMN fecha_real_finalizacion    DATE;

-- En ordenes_servicio (análogo)
ALTER TABLE ordenes_servicio
  ADD COLUMN fecha_entrega_taller        DATE,
  ADD COLUMN fecha_estimada_finalizacion DATE,
  ADD COLUMN fecha_real_finalizacion     DATE;
```

---

## Lógica

### Cuando se llena cada fecha

| Campo | Cuándo se llena |
|-------|----------------|
| `fecha_entrega_taller` | Cuando el usuario confirma "Vehículo entregado al taller" (puede ser después de pasar a `en_reparacion`) |
| `fecha_estimada_finalizacion` | Cuando se aprueba la proforma; el taller suele dar un compromiso |
| `fecha_real_finalizacion` | Cuando se pasa a `reparado` / `completado` |

Estas no reemplazan a `taller_ingresos.fecha_ingreso` / `fecha_egreso` que siguen funcionando como están. Son fechas adicionales más operativas.

### Visualización

En la sección "Taller" del detalle, mostrar línea de tiempo:
```
Entregado al taller: 15 may 2026
Estimado finalización: 22 may 2026
Real finalización: 24 may 2026   ⚠ 2 días de retraso
```

Calcular y mostrar diferencias en días entre estimado y real (con color: verde si igual o antes, amarillo 1-3 días, rojo >3).

---

## Frontend

### Card "Taller" en `SiniestroDetalle.jsx` y `ServicioDetalle.jsx`

Agregar inputs editables (admin/agente_senior) con date picker:
- Fecha entrega al taller
- Fecha estimada finalización
- Fecha real finalización

### Reportes

Agregar KPI: "Promedio de cumplimiento" = % de servicios que terminaron en o antes de la fecha estimada.

```sql
SELECT
  COUNT(*) FILTER (WHERE fecha_real_finalizacion <= fecha_estimada_finalizacion)::float
  / NULLIF(COUNT(*) FILTER (WHERE fecha_real_finalizacion IS NOT NULL), 0) AS pct_cumplimiento
FROM ordenes_servicio
WHERE fecha_estimada_finalizacion IS NOT NULL;
```

### Ficha imprimible

Incluir las 3 fechas adicionales en la sección "Tracking de taller".

---

## Pasos de implementación

1. **Confirmar con Pass** cuáles fechas aplican exactamente (¿solo entrega? ¿también estimada/real?)
2. SQL: ALTER TABLE para los campos confirmados
3. Card "Taller" en detalles con inputs date
4. Línea de tiempo visual con cálculo de retraso
5. KPI de cumplimiento en Reportes
6. Ficha imprimible: agregar campos

---

## Criterios de éxito

- [ ] Las nuevas fechas se capturan y persisten
- [ ] La línea de tiempo en el detalle muestra retraso/cumplimiento
- [ ] El reporte calcula % de cumplimiento de fechas estimadas
- [ ] La ficha imprimible incluye las fechas adicionales
