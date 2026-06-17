# Plan: Actualización tipos de vehículo y sincronización de disponibilidad con Odoo

**Fecha**: 2026-06-16  
**Estado**: Pendiente de implementación

---

## Contexto

Dos ajustes operacionales solicitados después de revisar el estado actual del campo `x_studio_status_vehiculo` y los tipos de vehículo reales en Odoo:

1. **Tipos de vehículo**: "Económico" ya no existe en Odoo — eliminar del frontend.
2. **Sincronización de disponibilidad**: cuando un vehículo entra a reparación/servicio se deben actualizar **dos campos** en Odoo (`x_studio_status_vehiculo` + `qty_available`), y dejar traza en el **chatter** del producto.

---

## Cambio 1 — Tipos de vehículo (frontend únicamente)

### Problema

`TIPO_VEHICULO_ORDER` en `FlotaVehicular.jsx` incluye `'Económico'` pero ese tipo ya no existe en Odoo. Vehículos que antes eran "Económico" ahora aparecen como "Sedán".

### Cambio en `frontend/src/pages/FlotaVehicular.jsx`

**Antes:**
```js
const TIPO_VEHICULO_ORDER = ['Económico', 'Sedán', 'Pickup', 'SUV/Camioneta', 'Microbus', 'Camión', 'Cotización', 'N/A']
const TIPO_VEHICULO_COLORS = {
  'Económico':    'bg-emerald-100 text-emerald-700',
  'Sedán':        'bg-sky-100 text-sky-700',
  ...
}
```

**Después:**
```js
const TIPO_VEHICULO_ORDER = ['Sedán', 'Pickup', 'SUV/Camioneta', 'Microbus', 'Camión', 'N/A']
const TIPO_VEHICULO_COLORS = {
  'Sedán':        'bg-sky-100 text-sky-700',
  'Pickup':       'bg-orange-100 text-orange-700',
  'SUV/Camioneta':'bg-purple-100 text-purple-700',
  'Microbus':     'bg-pink-100 text-pink-700',
  'Camión':       'bg-amber-100 text-amber-700',
  'N/A':          'bg-gray-100 text-gray-600',
}
```

- Eliminar entrada `'Cotización'` también (el backend ya filtra `x_studio_tipo_de_vehiculo != 'Cotización'`, nunca llega al frontend — código muerto).
- El color de `'Económico'` (emerald) queda libre; reasignarlo si llega un nuevo tipo.
- `'N/A'` se mantiene como fallback para valores no reconocidos.

---

## Cambio 2 — Sincronización de disponibilidad con Odoo

### Comportamiento esperado

| Evento | `x_studio_status_vehiculo` | `qty_available` | Chatter |
|--------|---------------------------|-----------------|---------|
| Daño "No Disponible" al crear | `Reparación` | `0` | Sí |
| Daño `proforma_aprobada → en_reparacion` | `Reparación` | `0` | Sí |
| Daño `InfoOperacional.disponible_renta = false` | `Reparación` | `0` | Sí |
| Daño `en_reparacion → reparado` | `Disponible` | `1` | Sí |
| Daño `* → anulado` (con taller abierto) | `Disponible` | `1` | Sí |
| Servicio `aprobado → en_proceso` | `Servicio` | `0` | Sí |
| Servicio `en_proceso → completado` | `Disponible` | `1` | Sí |
| Servicio `* → cancelado` (con taller abierto) | `Disponible` | `1` | Sí |

> **Nota**: `qty_available` en `product.template` es un campo calculado (solo lectura). Se escribe a través del modelo `stock.quant` que es la fuente real del stock físico.

---

### Cambio A — Backend `PATCH /vehiculo/:id/status`

**Archivo**: `backend/index.js`

El endpoint pasa de aceptar solo `{ status }` a aceptar también `{ userName }` para el mensaje del chatter.

#### Nuevo body del request
```json
{
  "status": "Reparación",
  "userName": "Carlos García"
}
```

#### Lógica añadida al endpoint

```js
app.patch('/vehiculo/:id/status', async (req, res) => {
  try {
    const uid = await getUid();
    const productId = parseInt(req.params.id);
    const { status, userName } = req.body;

    // ... validación VALID_STATUS igual que antes ...

    // 1. Actualizar x_studio_status_vehiculo (igual que antes)
    const result = await odooExecute(uid, 'product.template', 'write', [
      [productId], { x_studio_status_vehiculo: status },
    ]);
    if (!result) return res.status(500).json({ error: 'Odoo no confirmó la escritura' });

    // 2. Actualizar qty_available vía stock.quant
    const targetQty = (status === 'Disponible') ? 1 : 0;
    try {
      await syncQtyAvailable(uid, productId, targetQty);
    } catch (qtyErr) {
      // No falla el endpoint completo; loguea advertencia
      console.warn(`[PATCH /vehiculo/${productId}/status] qty sync falló:`, qtyErr.message);
    }

    // 3. Registrar en chatter de Odoo
    try {
      const actor = userName || 'Sistema de Gestión de Daños';
      const body = `<p>Estado del vehículo actualizado a <strong>${status}</strong> por <strong>${actor}</strong> desde la app de Gestión de Daños/Mantenimiento.</p>`;
      await odooExecute(uid, 'product.template', 'message_post', [[productId]], {
        body,
        message_type: 'comment',
        subtype_xmlid: 'mail.mt_note',
      });
    } catch (chatErr) {
      console.warn(`[PATCH /vehiculo/${productId}/status] chatter falló:`, chatErr.message);
    }

    console.log(`[PATCH /vehiculo/${productId}/status] → ${status} (qty=${targetQty}) por ${userName || 'sistema'}`);
    res.json({ success: true, odoo_id: productId, status, updated_at: new Date().toISOString() });

  } catch (err) {
    console.error('[PATCH /vehiculo/:id/status]', err.message);
    res.status(500).json({ error: err.message });
  }
});
```

#### Nueva función `syncQtyAvailable`

```js
async function syncQtyAvailable(uid, templateId, targetQty) {
  // 1. Obtener el product.product (variante) del product.template
  const tmpls = await odooExecute(uid, 'product.template', 'read', [[templateId]], {
    fields: ['product_variant_ids'],
  });
  const variantId = tmpls[0]?.product_variant_ids?.[0];
  if (!variantId) throw new Error(`No se encontró variante para template ${templateId}`);

  // 2. Buscar stock.quant existente en ubicación interna
  const quants = await odooExecute(uid, 'stock.quant', 'search_read', [
    [['product_id', '=', variantId], ['location_id.usage', '=', 'internal']],
  ], { fields: ['id', 'quantity', 'location_id'], limit: 5 });

  if (quants.length > 0) {
    // 3a. Actualizar el quant existente
    // En Odoo 17+ se usa inventory_quantity + action_apply_inventory
    await odooExecute(uid, 'stock.quant', 'write', [
      [quants[0].id], { inventory_quantity: targetQty },
    ]);
    await odooExecute(uid, 'stock.quant', 'action_apply_inventory', [[quants[0].id]]);
  } else {
    // 3b. No hay quant aún (qty nunca se ha establecido) — crear uno
    // Primero encontrar la ubicación interna principal (WH/Stock)
    const locs = await odooExecute(uid, 'stock.location', 'search_read', [
      [['usage', '=', 'internal'], ['active', '=', true]],
    ], { fields: ['id', 'complete_name'], limit: 10 });

    // Preferir la ubicación que tenga "Stock" en el nombre
    const loc = locs.find(l => /stock/i.test(l.complete_name)) || locs[0];
    if (!loc) throw new Error('No se encontró ubicación interna en Odoo');

    const quantId = await odooExecute(uid, 'stock.quant', 'create', [{
      product_id: variantId,
      location_id: loc.id,
      inventory_quantity: targetQty,
    }]);
    await odooExecute(uid, 'stock.quant', 'action_apply_inventory', [[quantId]]);
  }
}
```

> **Riesgo**: `action_apply_inventory` puede requerir permisos de inventario para el usuario API de Odoo. Verificar en el primer deploy. Si falla, alternativa: escribir `quantity` directamente si el usuario tiene permisos de service (menos limpio pero más simple).

---

### Cambio B — Frontend: pasar `userName` al endpoint

El frontend debe incluir `userName` en cada llamada a `updateVehiculoStatus`. Se obtiene del perfil Supabase del usuario autenticado.

#### `frontend/src/lib/odoo-api.js`

```js
// Cambiar firma:
export async function updateVehiculoStatus(odooId, status, userName = '') {
  const res = await fetch(`${API_URL}/vehiculo/${odooId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, userName }),
  });
  if (!res.ok) throw new Error('Error updating status');
  return res.json();
}
```

#### Fuente del `userName`

En los componentes que llaman `updateVehiculoStatus`, el nombre del usuario ya está disponible:

- `SiniestroDetalle.jsx` — tiene `perfil.nombre_completo` en el estado del componente
- `InfoOperacional.jsx` — recibe `siniestro` como prop; necesita recibir también `perfil` o leerlo de un contexto/hook
- `SiniestroNuevo.jsx` — tiene acceso a `perfil` via hook `useAuth` o Supabase
- `ServicioDetalle.jsx` — tiene `perfil.nombre_completo` en el estado

Si algún componente no tiene el nombre cargado, pasar `''` — el backend usa `'Sistema de Gestión de Daños'` como fallback.

---

---

## Cambio 3 — Sincronización de disponibilidad para Servicios

### Contexto

`ServicioDetalle.jsx` ya llama `updateVehiculoStatus` en las transiciones de estado, pero solo actualiza `x_studio_status_vehiculo`. Con este cambio, el endpoint ampliado (Cambio 2-A) **automáticamente** también ajustará `qty_available` y registrará en el chatter — sin necesidad de cambiar la lógica de negocio del componente. Solo hay que pasar `userName`.

### Comportamiento esperado por transición

| Transición | `x_studio_status_vehiculo` | `qty_available` | Chatter |
|------------|---------------------------|-----------------|---------|
| `aprobado → en_proceso` ("Enviar a taller") | `Servicio` | `0` | Sí |
| `en_proceso → completado` ("Completar servicio") | `Disponible` | `1` | Sí |
| `* → cancelado` (con ingreso a taller abierto) | `Disponible` | `1` | Sí |

> No hay cambio de status en: `programado → aprobado` (el vehículo aún no está en taller).

### Puntos de cambio en `frontend/src/pages/ServicioDetalle.jsx`

El componente ya tiene `perfil.nombre_completo` disponible en su estado. Solo hay que agregar el tercer argumento en cada llamada existente:

**Transición `en_proceso` (botón "Enviar a taller")**
```js
// Antes:
await updateVehiculoStatus(orden.odoo_product_id, STATUS_INGRESO_TALLER)
// Después:
await updateVehiculoStatus(orden.odoo_product_id, STATUS_INGRESO_TALLER, perfil?.nombre_completo)
```

**Transición `completado` (botón "Completar servicio")**
```js
// Antes:
await updateVehiculoStatus(orden.odoo_product_id, 'Disponible')
// Después:
await updateVehiculoStatus(orden.odoo_product_id, 'Disponible', perfil?.nombre_completo)
```

**Transición `cancelado` (cuando hay taller abierto)**
```js
// Antes:
await updateVehiculoStatus(orden.odoo_product_id, 'Disponible')
// Después:
await updateVehiculoStatus(orden.odoo_product_id, 'Disponible', perfil?.nombre_completo)
```

### Diferencia clave entre Servicios y Daños

| Aspecto | Daños | Servicios |
|---------|-------|-----------|
| Control manual de disponibilidad | Sí — `disponible_renta` toggle en `InfoOperacional` | No — solo por transición de estado |
| Campo en Supabase | `siniestros.disponible_renta` BOOLEAN | No existe — `ordenes_servicio.estado` es la única fuente |
| Estado Odoo al entrar | `Reparación` | `Servicio` |
| Estado Odoo al salir | `Disponible` | `Disponible` |

> **No se agrega** un `disponible_renta` a `ordenes_servicio`. El flujo de servicios es más directo y el estado del taller (`en_proceso`) es suficiente para determinar disponibilidad.

---

### Archivos afectados (resumen global)

| Archivo | Tipo de cambio |
|---------|---------------|
| `backend/index.js` | Añadir `syncQtyAvailable()` + ampliar PATCH endpoint |
| `frontend/src/lib/odoo-api.js` | Añadir `userName` a `updateVehiculoStatus` |
| `frontend/src/pages/FlotaVehicular.jsx` | Eliminar 'Económico', 'Cotización' de TIPO_VEHICULO_ORDER |
| `frontend/src/pages/SiniestroDetalle.jsx` | Pasar `perfil.nombre_completo` a `updateVehiculoStatus` (3 puntos) |
| `frontend/src/pages/SiniestroNuevo.jsx` | Pasar nombre usuario a `updateVehiculoStatus` (1 punto) |
| `frontend/src/components/InfoOperacional.jsx` | Recibir prop `userName` y pasarla a `updateVehiculoStatus` (1 punto) |
| `frontend/src/pages/ServicioDetalle.jsx` | Pasar `perfil.nombre_completo` a `updateVehiculoStatus` (3 puntos) |

---

## Orden de implementación

1. `backend/index.js` — añadir `syncQtyAvailable`, ampliar PATCH. **Deploy y verificar con Postman que chatter y qty funcionan antes de tocar el frontend.**
2. `frontend/src/lib/odoo-api.js` — añadir `userName` al body.
3. `frontend/src/pages/FlotaVehicular.jsx` — eliminar tipos obsoletos.
4. `frontend/src/pages/SiniestroDetalle.jsx` — pasar `userName` (Cambio 2).
5. `frontend/src/pages/SiniestroNuevo.jsx` — pasar `userName` (Cambio 2).
6. `frontend/src/components/InfoOperacional.jsx` — pasar `userName` (Cambio 2).
7. `frontend/src/pages/ServicioDetalle.jsx` — pasar `userName` (Cambio 3).

> Los pasos 4-7 son independientes entre sí y pueden implementarse en paralelo.

---

## Preguntas abiertas

- ¿El usuario API de Odoo (`ODOO_API_USER`) tiene permisos para `stock.quant` y `message_post`? Si no, hay que otorgarlos en Odoo (Settings → Users → permisos de inventario). **Verificar antes del deploy.**
- ¿`'Económico'` existe en algún registro de Supabase como `tipo_vehiculo` almacenado? Si sí, no afecta — la app guarda el tipo en el momento del registro y no lo re-renderiza desde Odoo.
