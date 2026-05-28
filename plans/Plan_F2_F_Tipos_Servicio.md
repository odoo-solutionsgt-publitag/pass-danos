# Fase 2 / F — Tipos de servicio adicionales

**Estado**: 📋 Pendiente
**Prioridad**: Baja
**Estimado**: 30 min — 1 sesión

---

## Requerimientos

Agregar 6 nuevos tipos al enum `tipo_servicio_mant`:
- Revisión General
- Enderezado / Pintura
- Reposición Llave
- Sistema Eléctrico
- Revisión A/C
- Revisión Inyección

---

## Modelo de datos

```sql
-- Agregar valores al enum existente
ALTER TYPE tipo_servicio_mant ADD VALUE IF NOT EXISTS 'revision_general';
ALTER TYPE tipo_servicio_mant ADD VALUE IF NOT EXISTS 'enderezado_pintura';
ALTER TYPE tipo_servicio_mant ADD VALUE IF NOT EXISTS 'reposicion_llave';
ALTER TYPE tipo_servicio_mant ADD VALUE IF NOT EXISTS 'sistema_electrico';
ALTER TYPE tipo_servicio_mant ADD VALUE IF NOT EXISTS 'revision_ac';
ALTER TYPE tipo_servicio_mant ADD VALUE IF NOT EXISTS 'revision_inyeccion';
```

> Nota: `ALTER TYPE ... ADD VALUE` debe correr **fuera de transacción** en PostgreSQL. Ejecutar uno a uno en SQL Editor.

---

## Frontend

### `ServicioNuevo.jsx`

Actualizar `TIPOS_SERVICIO`:

```js
const TIPOS_SERVICIO = [
  { value: 'servicio_menor',      label: 'Servicio menor',         requiereAuth: false },
  { value: 'servicio_mayor',      label: 'Servicio mayor',         requiereAuth: true  },
  { value: 'cambio_llantas',      label: 'Cambio de llantas',      requiereAuth: false },
  { value: 'cambio_bateria',      label: 'Cambio de batería',      requiereAuth: false },
  { value: 'alineacion_balanceo', label: 'Alineación / balanceo',  requiereAuth: false },
  { value: 'cambio_frenos',       label: 'Cambio de frenos',       requiereAuth: false },
  { value: 'revision_general',    label: 'Revisión general',       requiereAuth: false },
  { value: 'enderezado_pintura',  label: 'Enderezado / pintura',   requiereAuth: true  },
  { value: 'reposicion_llave',    label: 'Reposición de llave',    requiereAuth: false },
  { value: 'sistema_electrico',   label: 'Sistema eléctrico',      requiereAuth: false },
  { value: 'revision_ac',         label: 'Revisión A/C',           requiereAuth: false },
  { value: 'revision_inyeccion',  label: 'Revisión inyección',     requiereAuth: false },
  { value: 'otro',                label: 'Otro',                   requiereAuth: false },
]
```

### `Servicios.jsx` y `ServicioDetalle.jsx`

Agregar labels y colores para los 6 nuevos tipos:

```js
const TIPO_LABELS = {
  // existentes...
  revision_general:    'Revisión gral.',
  enderezado_pintura:  'Enderezado/Pintura',
  reposicion_llave:    'Llave',
  sistema_electrico:   'Eléctrico',
  revision_ac:         'A/C',
  revision_inyeccion:  'Inyección',
}

const TIPO_COLORS = {
  // existentes...
  revision_general:    'bg-cyan-100 text-cyan-700',
  enderezado_pintura:  'bg-purple-100 text-purple-700',
  reposicion_llave:    'bg-yellow-100 text-yellow-700',
  sistema_electrico:   'bg-orange-100 text-orange-700',
  revision_ac:         'bg-sky-100 text-sky-700',
  revision_inyeccion:  'bg-rose-100 text-rose-700',
}
```

### Mapeo a status Odoo en `ServicioDetalle.jsx`

```js
const ODOO_STATUS = {
  servicio_menor:      'Servicios Varios',
  servicio_mayor:      'En Mantenimiento',
  cambio_llantas:      'Servicios Varios',
  cambio_bateria:      'Servicios Varios',
  alineacion_balanceo: 'Servicios Varios',
  cambio_frenos:       'En Mantenimiento',
  revision_general:    'Servicios Varios',
  enderezado_pintura:  'En Mantenimiento',
  reposicion_llave:    'Servicios Varios',
  sistema_electrico:   'Servicios Varios',
  revision_ac:         'Servicios Varios',
  revision_inyeccion:  'Servicios Varios',
  otro:                'Servicios Varios',
}
```

`enderezado_pintura` se marca como "En Mantenimiento" porque típicamente toma varios días.

### Reportes

En `Reportes.jsx`, el `TIPO_SERVICIO_LABELS` debe agregar los nuevos para que la distribución por tipo los muestre.

---

## Pasos de implementación

1. SQL: 6 ALTER TYPE individuales
2. Actualizar `TIPOS_SERVICIO` en ServicioNuevo
3. Actualizar `TIPO_LABELS` y `TIPO_COLORS` en Servicios, ServicioDetalle, BitacoraVehiculo, Reportes, FichaServicioPrint
4. Actualizar `ODOO_STATUS` mapping
5. Probar creando una orden de cada nuevo tipo

---

## Criterios de éxito

- [ ] Los 6 nuevos tipos aparecen en el select del wizard
- [ ] Cada tipo tiene su badge de color distintivo
- [ ] `enderezado_pintura` y `servicio_mayor` requieren autorización; los demás no
- [ ] El status Odoo se actualiza correctamente según el tipo
- [ ] Los reportes incluyen los nuevos tipos en la distribución
