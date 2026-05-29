# Fase 2 / K — Simplificar Status del Vehículo en Odoo a 3 valores

**Estado**: 📋 Pendiente
**Prioridad**: Media
**Estimado**: 30 min – 1 sesión

---

## Requerimiento del usuario

> "Ajustar a Odoo el campo tipo Select llamado 'Status del vehículo' = `x_studio_status_vehiculo` que envíe los siguientes estatus:
>
> - **Disponible** — cuando el vehículo regresa del Taller (ya sea por daño o mantenimiento)
> - **En Mantenimiento** — cuando el vehículo ingresa a servicio
> - **En Reparación** — cuando el vehículo ingresa por reparación"

---

## Aclaración importante

### 1. Modelo correcto
El campo `x_studio_status_vehiculo` está en el modelo **`product.template`** (cada vehículo es un producto), NO en `res.partner` (que son los clientes). El plan ya lo asume así porque es lo que la app está usando actualmente.

### 2. Mapeo daño/servicio → estatus
Las dos descripciones del requerimiento podrían leerse de dos formas distintas. El mapeo natural en español que asumimos es:

| Tipo de registro en la app | Status en Odoo |
|----------------------------|----------------|
| **Daño / Siniestro** (vehículo dañado, ingresa al taller a reparar) | **En Reparación** |
| **Servicio / Mantenimiento** (vehículo en revisión / mantenimiento) | **En Mantenimiento** |
| Cualquiera de los dos finaliza y sale del taller | **Disponible** |

**Si el mapeo deseado fuera al revés** (siniestro → En Mantenimiento, servicio → En Reparación), avisar antes de aplicar. El resto del plan asume el mapeo de la tabla.

---

## Estado actual en la app

### `SiniestroDetalle.jsx` — al ingresar a taller
```js
// Cuando estado pasa a 'en_reparacion':
await updateVehiculoStatus(siniestro.odoo_product_id, 'En Reparación')
```
✅ Ya está correcto.

### `SiniestroDetalle.jsx` — al salir del taller
```js
// Cuando estado pasa a 'reparado':
await updateVehiculoStatus(siniestro.odoo_product_id, 'Disponible')
```
✅ Ya está correcto.

### `ServicioDetalle.jsx` — al ingresar a taller (problema actual)
```js
const ODOO_STATUS = {
  servicio_menor:      'Servicios Varios',    // ← INCONSISTENTE
  servicio_mayor:      'En Mantenimiento',
  cambio_llantas:      'Servicios Varios',    // ← INCONSISTENTE
  cambio_bateria:      'Servicios Varios',    // ← INCONSISTENTE
  alineacion_balanceo: 'Servicios Varios',    // ← INCONSISTENTE
  cambio_frenos:       'En Mantenimiento',
  otro:                'Servicios Varios',    // ← INCONSISTENTE
}
// PATCH Odoo con ODOO_STATUS[orden.tipo_servicio]
```
❌ **Problema**: hoy el 70% de los servicios mandan "Servicios Varios" en lugar de "En Mantenimiento". Esto contradice el requerimiento de usar solo 3 valores.

### `ServicioDetalle.jsx` — al salir del taller
```js
await updateVehiculoStatus(orden.odoo_product_id, 'Disponible')
```
✅ Ya está correcto.

### `backend/index.js` PATCH endpoint
```js
const VALID_STATUS = ['Disponible', 'Rentado', 'En Reparación', 'En Mantenimiento',
                      'Servicios Varios', 'Vehículo No Asegurado', 'Asignado al personal', 'No aplica'];
```
La validación acepta todos los valores actuales. Para el nuevo modelo, restringir a solo 3 (mantener compatibilidad con valores externos seteados manualmente en Odoo).

---

## Cambios a implementar

### 1. `frontend/src/pages/ServicioDetalle.jsx`

Reemplazar el `ODOO_STATUS` map por una constante simple:

```js
// Antes:
const ODOO_STATUS = { servicio_menor: 'Servicios Varios', servicio_mayor: 'En Mantenimiento', ... }

// Después:
const STATUS_INGRESO_TALLER = 'En Mantenimiento'  // todos los servicios → En Mantenimiento
```

Y donde se llama:
```js
// Antes:
await updateVehiculoStatus(orden.odoo_product_id, ODOO_STATUS[orden.tipo_servicio] ?? 'Servicios Varios')

// Después:
await updateVehiculoStatus(orden.odoo_product_id, STATUS_INGRESO_TALLER)
```

### 2. `backend/index.js` PATCH `/vehiculo/:id/status`

Opcional pero recomendado para defensa en profundidad:

```js
// Validar contra los 3 estados activamente usados por la app
const APP_STATUS = ['Disponible', 'En Reparación', 'En Mantenimiento'];
// (mantener los otros como valores aceptables si Odoo los puede tener, pero la app solo emite estos 3)
```

### 3. (Sin cambios) `SiniestroDetalle.jsx`
Las transiciones ya emiten los valores correctos:
- `proforma_aprobada → en_reparacion` → PATCH `'En Reparación'`
- `en_reparacion → reparado` → PATCH `'Disponible'`
- `anulado` con vehículo en taller → PATCH `'Disponible'`

### 4. (Sin cambios) `Plan_F2_F_Tipos_Servicio.md`

Los 6 tipos nuevos de servicio también van todos a `'En Mantenimiento'`. No requiere mantener el mapeo por tipo (queda obsoleto el `ODOO_STATUS` map).

---

## Flujo final de estados Odoo desde la app

```
                     ┌───────────────────────┐
                     │  Disponible (default) │
                     └──────────┬────────────┘
                                │
            ┌───────────────────┴──────────────────────┐
            │                                          │
   Daño/Siniestro creado                   Servicio creado
   y pasa a "en_reparacion"                y pasa a "en_proceso"
            │                                          │
            ▼                                          ▼
   ┌────────────────┐                        ┌──────────────────┐
   │ En Reparación  │                        │ En Mantenimiento │
   └────────┬───────┘                        └─────────┬────────┘
            │                                          │
   "reparado" / "anulado"                  "completado" / "cancelado"
            │                                          │
            └──────────────────┬───────────────────────┘
                               ▼
                     ┌───────────────────────┐
                     │      Disponible       │
                     └───────────────────────┘
```

---

## Pasos de implementación

1. Confirmar mapeo (daño → En Reparación, servicio → En Mantenimiento)
2. Modificar `ServicioDetalle.jsx`:
   - Eliminar `ODOO_STATUS` map
   - Cambiar la llamada a `updateVehiculoStatus` para usar `'En Mantenimiento'` fijo al ingresar
3. (Opcional) Limitar `VALID_STATUS` en backend al subset de 3
4. Probar:
   - Crear servicio cualquier tipo → pasar a en_proceso → confirmar Odoo = "En Mantenimiento"
   - Crear daño → pasar a en_reparacion → confirmar Odoo = "En Reparación"
   - Completar/reparar → confirmar Odoo = "Disponible"

---

## Criterios de éxito

- [ ] Todos los servicios (cualquier tipo) ponen el vehículo en "En Mantenimiento" al entrar al taller
- [ ] Todos los daños ponen el vehículo en "En Reparación" al entrar al taller
- [ ] Al salir del taller (completado / reparado / cancelado / anulado), el vehículo regresa a "Disponible"
- [ ] El campo `x_studio_status_vehiculo` en Odoo refleja solo estos 3 valores cuando los cambios provienen de la app
- [ ] La Flota Vehicular muestra el conteo correcto por estado
