# FASE 6 — Servicios de Mantenimiento

**Estado**: ✅ Completado
**Depende de**: Fase 0 (migration 002 ejecutada)

---

## Objetivo

Módulo paralelo al de Daños para gestionar mantenimientos programados (servicio menor/mayor, cambio de llantas, batería, alineación, frenos). Reusa patrones de Daños pero más simple: sin cliente, sin cotizaciones, un solo taller, 4 estados.

---

## Archivos

- [frontend/src/pages/Servicios.jsx](../frontend/src/pages/Servicios.jsx) — lista
- [frontend/src/pages/ServicioNuevo.jsx](../frontend/src/pages/ServicioNuevo.jsx) — formulario
- [frontend/src/pages/ServicioDetalle.jsx](../frontend/src/pages/ServicioDetalle.jsx) — detalle + máquina estados
- SQL: [002_servicios_mantenimiento.sql](../002_servicios_mantenimiento.sql)

---

## Schema (migration 002)

Tablas nuevas:
- `ordenes_servicio` — equivalente a `siniestros` pero más simple
- `orden_servicio_lineas` — equivalente a `cotizacion_lineas`
- `orden_servicio_timeline` — auditoría

Modificaciones:
- `taller_ingresos.siniestro_id` ahora es NULLABLE + nueva columna `orden_servicio_id`. CHECK constraint exige uno de los dos.
- `documentos.siniestro_id` también NULLABLE + nueva columna `orden_servicio_id`.

Enums:
- `tipo_servicio_mant`: servicio_menor, servicio_mayor, cambio_llantas, cambio_bateria, alineacion_balanceo, cambio_frenos, otro
- `estado_orden_servicio`: programado, aprobado, en_proceso, completado, cancelado

Triggers análogos a siniestros: numeración (`SRV-YYYY-NNN`), timeline, recálculo de totales.

---

## Lista (`Servicios.jsx`)

Columnas: No. Orden, Fecha programada, Vehículo, Tipo servicio (badge), Taller, Total Q., Estado (badge). Búsqueda por placa/número, filtro por estado.

`TIPO_LABELS` y `ESTADO_LABELS` traducen los enum keys a texto legible en español.

---

## Nuevo servicio (`ServicioNuevo.jsx`)

- Selector de placa (mismo patrón que `SiniestroNuevo` "Por placa")
- Tipo de servicio (select)
- Taller (select desde catálogo)
- Fecha programada + kilometraje
- Descripción
- Editor de líneas inline (grid-cols-12, igual a Cotizaciones)

### Lógica `requiere_autorizacion`
```js
const requiereAuth = tipo === 'servicio_mayor' || totalLineas > 5000
```
Muestra un warning ambar si aplica. Al guardar, se persiste en `ordenes_servicio.requiere_autorizacion`.

### Guardado
1. INSERT en `ordenes_servicio` con estado `programado`
2. INSERT bulk en `orden_servicio_lineas`
3. Redirect a `/servicios/:id`

---

## Detalle (`ServicioDetalle.jsx`)

### Estados y botones
| Estado | Botón visible |
|--------|---------------|
| `programado` + `requiere_autorizacion` | **Autorizar** (captura `autorizado_por` en modal) |
| `programado` (no requiere auth) | **Enviar a taller** |
| `aprobado` | **Enviar a taller** |
| `en_proceso` | **Completar servicio** |
| Cualquier no-terminal (admin) | **Cancelar** |

### Mapeo a status Odoo

```js
const ODOO_STATUS = {
  servicio_menor:      'Servicios Varios',
  servicio_mayor:      'En Mantenimiento',
  cambio_llantas:      'Servicios Varios',
  cambio_bateria:      'Servicios Varios',
  alineacion_balanceo: 'Servicios Varios',
  cambio_frenos:       'En Mantenimiento',
  otro:                'Servicios Varios',
}
```

Al pasar a `en_proceso`: PATCH Odoo con `ODOO_STATUS[tipo_servicio]`.
Al pasar a `completado`: PATCH Odoo → `Disponible`.

### Card de autorización
Si `requiere_autorizacion=true` y ya fue autorizado, se muestra:
> ✓ Autorizado por {autorizado_por} el {fecha_autorizacion}

---

## Decisiones

- **Reuso máximo del patrón de Daños**: ConfirmModal, editor de líneas, semáforo de taller, timeline — todo es el mismo componente conceptual con leves variaciones.
- **Sin cliente**: los servicios de mantenimiento son internos a Pass, no se cobran a un cliente final.
- **Sin cotizaciones**: el taller se elige directamente al crear la orden; no hay comparador.
- **Autorización gating**: `servicio_mayor` siempre requiere; el resto solo si total > Q5,000. La lógica vive en frontend (también podría estar en DB).

---

## Criterio de éxito (cumplido)

- [x] Se crea una orden de servicio con líneas
- [x] La autorización se activa correctamente cuando aplica
- [x] El flujo programado → en_proceso → completado actualiza Odoo
- [x] El taller_ingresos se crea y cierra al completar
