# Plan — Revertir estado cerrado (admin)

**Estado**: 📋 Pendiente de aprobación
**Origen**: Requerimiento operacional — al cerrar un registro, frecuentemente surge la necesidad de documentar información adicional (notas en bitácora, agregar documentos, ajustar montos) pero las acciones están bloqueadas
**Prioridad**: Alta (impedimento operativo)
**Estimado**: 1 sesión (1.5 – 2 horas)

---

## Objetivo

Permitir que un usuario **admin** revierta el estado de un daño o servicio que fue cerrado, regresándolo al estado **inmediatamente anterior** al cierre, para poder seguir editándolo y agregando información.

---

## Contexto del problema

### Estados "terminales" actuales

**Daños** (`siniestros.estado`):
- `cerrado` — flujo natural completado (cobrado, absorbido por Pass, cubierto por seguro)
- `anulado` — registro descartado (decisión deliberada)

**Servicios** (`ordenes_servicio.estado`):
- `completado` — flujo natural completado
- `cancelado` — registro descartado

### Síntomas del problema

Cuando un registro queda en estado terminal:
- `puedeEditar` o `puedeCrear` igual permite UI técnicamente, pero el flujo administrativo deja botones de transición ocultos
- La sección de cotizaciones, fechas de taller, info operacional, etc. quedan en modo readonly o de difícil edición
- El usuario tiene que pedir a admin/dev que modifique BD directamente — propenso a errores y sin auditoría limpia

---

## Solución propuesta

### Mecanismo

Agregar un botón **"Revertir cierre"** (icono `Undo2`) visible **solo para admins** en el detalle del daño/servicio cuando el registro está en estado terminal. Al hacer click:

1. Modal de confirmación muestra:
   - El estado actual (ej. `cerrado`)
   - El estado al que va a regresar (calculado desde el timeline)
   - Campo opcional **"Motivo del reverso"** (texto libre)
2. Al confirmar:
   - UPDATE del estado en `siniestros` / `ordenes_servicio`
   - INSERT en `siniestro_timeline` / `orden_servicio_timeline` con `accion = "Reverso de cierre"` y el motivo en `detalle`
   - El trigger de `audit_log` registra el cambio automáticamente con `usuario_id` del admin

### Mapeo fijo del estado destino (revisado)

No se consulta timeline. Mapeo directo y consistente:

| Tipo | Estado actual | Destino del reverso |
|------|---------------|---------------------|
| Daño | `cerrado` o `anulado` | **`cotizando`** |
| Servicio | `completado` o `cancelado` | **`programado`** |

Adicionalmente, en daños se devuelven todas las cotizaciones `aprobada` al estado `recibida` (efecto colateral del reverso). Ver detalles abajo.

---

## Alcance — qué SÍ y qué NO

### ✅ SÍ se hace
- Botón "Revertir cierre" visible solo para `esAdmin`
- Aplica a daños (`cerrado` y `anulado`) → vuelven a `cotizando`
- Aplica a servicios (`completado` y `cancelado`) → vuelven a `programado`
- Modal de confirmación con motivo opcional + warning sobre reportes financieros
- En daños: **se devuelven todas las cotizaciones `aprobada` a `recibida`** y se limpia `taller_id`
- En daños: el `costo_pass` se recalcula a `0` vía trigger SQL existente
- Registro del reverso en el timeline correspondiente
- Auditoría automática vía trigger global `audit_changes()`

### ❌ NO se hace en esta iteración
- **No se borran/modifican `cobros` existentes** — quedan tal cual; si fueron creados con `es_gasto_pass = true` o `es_seguro = true`, permanecen como historial
- **No se restauran `taller_ingresos`** — si el daño/servicio estaba reparado y se revirtió, los ingresos al taller siguen tal cual
- **No se sincroniza Odoo** automáticamente — el `x_studio_status_vehiculo` queda donde estaba (el admin lo ajusta manualmente si aplica)
- **No se afecta `disponible_renta`** (daños) — sigue igual; el admin decide si tocar después
- **No se tocan cotizaciones `rechazada`, `recibida` o `solicitada`** — sólo las que estaban `aprobada` se devuelven a `recibida`
- **No se borran líneas de cotización** — toda la información queda preservada
- **No se ofrece reverso múltiple** — sólo un nivel (terminal → cotizando/programado); para "deshacer" varias transiciones consecutivas, el admin repite el proceso

### Razones del enfoque
- Volver a `cotizando`/`programado` es el **punto natural** para reanalizar la propuesta o agregar documentación faltante
- Devolver aprobaciones a `recibida` permite al operador **reseleccionar la propuesta** sin tener que anular manualmente cotización por cotización
- No tocar side effects (cobros, taller_ingresos, Odoo) mantiene la trazabilidad histórica
- Líneas y datos de cotización **nunca se borran** — toda la información queda disponible

---

## Modelo de datos — sin cambios estructurales

No hay columnas nuevas. Todo se hace con tablas existentes:
- `siniestros.estado` / `ordenes_servicio.estado` — UPDATE
- `siniestro_timeline` / `orden_servicio_timeline` — INSERT
- `audit_log` — automático vía trigger

---

## UI — cambios en frontend

### A. `SiniestroDetalle.jsx` — botón "Revertir cierre"

En la barra de acciones (top right del detalle), debajo de los botones de transición existentes:

```jsx
{esAdmin && ['cerrado', 'anulado'].includes(estado) && (
  <button
    onClick={() => pedirConfirm({
      titulo: 'Revertir cierre',
      mensaje: ...,
      confirmLabel: 'Revertir',
      danger: true,
      onConfirm: handleRevertirCierre,
    })}
    className="flex items-center gap-1.5 px-3 py-2 border border-amber-300 text-amber-700 hover:bg-amber-50 text-sm rounded-lg"
  >
    <Undo2 size={14} />
    Revertir cierre
  </button>
)}
```

### B. `ServicioDetalle.jsx` — botón equivalente

Mismo patrón, pero para los estados `completado` y `cancelado`.

### C. Modal de confirmación con motivo

Ampliar el `ConfirmModal` existente para aceptar un campo de texto opcional, o crear un `ConfirmModalConMotivo` específico para este caso. Decisión: ampliar el existente con un prop `pedirMotivo`.

### D. Handler `handleRevertirCierre` para daños

```js
async function handleRevertirCierre(motivo) {
  const estadoActual = siniestro.estado

  // 1. Revertir todas las cotizaciones aprobadas a 'recibida'
  //    (el trigger sync_costo_pass_from_approved_quote recalcula costo_pass = 0)
  await supabase
    .from('cotizaciones')
    .update({ estado: 'recibida' })
    .eq('siniestro_id', siniestro.id)
    .eq('estado', 'aprobada')

  // 2. UPDATE del daño: estado = 'cotizando', limpiar taller_id
  await supabase
    .from('siniestros')
    .update({
      estado:    'cotizando',
      taller_id: null,
    })
    .eq('id', siniestro.id)

  // 3. INSERT en timeline con el motivo
  await supabase.from('siniestro_timeline').insert({
    siniestro_id:    siniestro.id,
    estado_anterior: estadoActual,
    estado_nuevo:    'cotizando',
    accion:          'Reverso de cierre (admin)',
    detalle:         motivo || null,
    usuario_id:      user.id,
  })

  await loadAll()
}
```

### E. Handler `handleRevertirCierre` para servicios

```js
async function handleRevertirCierre(motivo) {
  const estadoActual = orden.estado

  // 1. UPDATE del servicio: estado = 'programado'
  await supabase
    .from('ordenes_servicio')
    .update({ estado: 'programado' })
    .eq('id', id)

  // 2. INSERT en timeline con el motivo
  await supabase.from('orden_servicio_timeline').insert({
    orden_servicio_id: id,
    estado_anterior:   estadoActual,
    estado_nuevo:      'programado',
    accion:            'Reverso de cierre (admin)',
    detalle:           motivo || null,
    usuario_id:        user.id,
  })

  await loadAll()
}
```

---

## Permisos y guardas

| Quién | Puede revertir |
|-------|----------------|
| `admin` con `rol = 'admin'` | ✅ |
| `agente_senior` | ❌ (aunque tenga `eliminar = true`) |
| Resto | ❌ |

La validación vive en frontend (botón solo visible si `esAdmin`), pero también deberíamos blindar via RLS o trigger SQL si queremos garantía total. **Decisión por defecto**: blindaje solo en frontend. Si en el futuro hay riesgo de bypass, agregamos política RLS.

---

## Decisiones tomadas

| # | Decisión | Justificación |
|---|----------|---------------|
| 1 | Solo `admin` puede revertir | Es una acción excepcional, no operacional rutinaria |
| 2 | Aplica a daños (`cerrado` + `anulado`) y servicios (`completado` + `cancelado`) | Comportamiento simétrico evita confusión |
| 3 | Mapeo fijo del destino: daños → `cotizando`, servicios → `programado` | Punto natural para reanalizar propuesta o agregar documentación |
| 4 | En daños: las cotizaciones `aprobada` se devuelven a `recibida` | Permite reseleccionar propuesta sin tener que anular cotización por cotización |
| 5 | En daños: `taller_id` se limpia a `NULL` | Coherente con el desbloqueo de aprobaciones — ya no hay taller ganador |
| 6 | `costo_pass` se recalcula vía trigger SQL existente | Sin código adicional; el trigger `sync_costo_pass_from_approved_quote` ya maneja el caso |
| 7 | NO se tocan side effects (cobros, taller_ingresos, Odoo status) | Limita el alcance del cambio; menos riesgo de inconsistencia |
| 8 | Líneas y datos de cotización se preservan | Toda la información queda disponible; sólo se "des-aprueba" |
| 9 | Motivo del reverso es **opcional** pero recomendado | El admin sabe cuándo es relevante documentar |
| 10 | Validación en frontend, sin RLS específica | Suficiente para el caso de uso; admins son confiables |
| 11 | Sin cambios en BD ni backend | Toda la lógica vive en el frontend con queries directas a Supabase |
| 12 | Reverso queda registrado en timeline y `audit_log` | Auditoría completa sin código extra (el trigger genérico ya lo captura) |
| 13 | Botón ámbar/naranja (no rojo) | Acción reversible y deliberada, no destructiva — el rojo se reserva para anular/eliminar |
| 14 | Warning sobre reportes financieros previos | El admin sabe que tendrá que regenerar reportes para reflejar cambios de monto |

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Admin revierte por error un cierre legítimo | Modal de confirmación + auditoría completa permite rastrear y volver a cerrar |
| Después del reverso, el daño tiene un cobro creado que ya no aplica | El admin debe revisar y eliminar/ajustar manualmente el cobro si es necesario |
| Si el daño estaba en `cerrado` por Absorbe Pass o Seguro, el `cobros.es_gasto_pass` queda como historial | Aceptable — refleja la intención original; si quiere revertir esa decisión, el admin lo edita |
| Reverso desde un estado muy avanzado (ej. `cerrado` con 3 cotizaciones aprobadas en modo múltiple) deshace todas | Es el comportamiento deseado — todas vuelven a `recibida` y el operador reaprueba las que sigan vigentes |
| Vehículo en Odoo quedó "Disponible" tras el cierre — al reabrir el daño no se vuelve a "En Reparación" | El admin decide manualmente si modificar `disponible_renta` (que sí sincroniza Odoo) |
| Reportes financieros mensuales / gerenciales generados antes del reverso quedan desactualizados | Warning explícito en el modal advierte sobre esto; el admin sabe que debe regenerar |
| Servicio en estado `programado` ya no tiene los registros de `taller_ingresos` consistentes con su workflow | Los `taller_ingresos` permanecen como historial; si el servicio vuelve a `en_proceso`, se crearía un nuevo registro |
| Usuario admin malicioso puede revertir cierres indebidamente | Auditoría completa permite detectar el patrón y volver a cerrar |

---

## Métricas de éxito

### Comunes (daños y servicios)
- [ ] Botón "Revertir cierre" visible solo para `esAdmin` en daños `cerrado`/`anulado` y servicios `completado`/`cancelado`
- [ ] No visible para agentes (incluso agente_senior con `eliminar = true`)
- [ ] Click muestra modal de confirmación con el estado destino correcto
- [ ] Campo motivo opcional aparece y se guarda en el timeline correspondiente
- [ ] Warning ámbar sobre reportes financieros previos se muestra en el modal
- [ ] El nuevo evento aparece en el historial de estados visual
- [ ] El cambio queda en `audit_log` con `usuario_id` del admin
- [ ] Los botones de transición del estado nuevo reaparecen
- [ ] Los `cobros` existentes siguen intactos (no se borran)
- [ ] Los `taller_ingresos` siguen intactos
- [ ] `disponible_renta` y Odoo status NO cambian automáticamente

### Específicas para daños
- [ ] Tras revertir, el daño regresa SIEMPRE a estado **`cotizando`** (no importa si venía de `cerrado` o `anulado`)
- [ ] Todas las cotizaciones que estaban en `aprobada` pasan a `recibida`
- [ ] Las cotizaciones `rechazada`, `recibida` o `solicitada` NO se tocan
- [ ] Las líneas de cotización quedan intactas (no se borra información)
- [ ] `siniestros.taller_id` queda en `NULL` (ya no hay taller único)
- [ ] `siniestros.costo_pass` se recalcula a `0` automáticamente vía trigger SQL (porque no hay aprobadas)
- [ ] `siniestros.monto_cliente` y `margen` permanecen como estaban (no se tocan)
- [ ] La sección `CotizacionesSection` vuelve a aparecer activa para que el operador continúe el flujo

### Específicas para servicios
- [ ] Tras revertir, el servicio regresa SIEMPRE a estado **`programado`** (no importa si venía de `completado` o `cancelado`)
- [ ] Las líneas del servicio (`orden_servicio_lineas`) quedan intactas
- [ ] La autorización (si existía) se mantiene como información histórica

---

## Archivos a crear / modificar

### Modificar
- `frontend/src/pages/SiniestroDetalle.jsx`
  - Importar `Undo2` de lucide-react
  - Agregar `handleRevertirCierre()`
  - Agregar botón en la barra de acciones (gated por `esAdmin` + estado terminal)
  - Ampliar `ConfirmModal` o agregar variante con campo motivo
- `frontend/src/pages/ServicioDetalle.jsx`
  - Mismo patrón pero para `completado`/`cancelado`
- Posiblemente `frontend/src/components/HistorialCambios.jsx` si queremos resaltar visualmente los eventos de reverso (opcional)

### Sin tocar
- BD: ninguna migración
- Backend: ningún cambio
- `db/`: nada
- RLS: nada

---

## Orden de ejecución

1. **SiniestroDetalle**:
   - Agregar imports (`Undo2`)
   - Ampliar `ConfirmModal` para aceptar campo motivo (opcional)
   - Implementar `handleRevertirCierre()`
   - Agregar botón con guarda `esAdmin && ['cerrado','anulado'].includes(estado)`
2. **ServicioDetalle**: mismo patrón pero estados `completado`/`cancelado` y tabla `orden_servicio_timeline`
3. **Pruebas locales**:
   - Daño en estado `cerrado` con un usuario admin → revertir → verificar estado, timeline, audit_log
   - Daño en `cerrado` con usuario no-admin → botón NO debe verse
   - Daño en `anulado` → revertir → debe regresar al estado anterior (que podría ser cualquiera)
   - Servicio en `completado` y `cancelado` análogos
4. Commit y push

---

## Decisiones confirmadas con el usuario

### Q1 — ¿Solo `cerrado` o también `anulado`? ✅ AMBOS
Tanto los cierres naturales como las anulaciones/cancelaciones son revertibles por admin.

### Q2 — ¿Motivo obligatorio u opcional? ✅ OPCIONAL
Campo de texto libre opcional en el modal. Si se llena, se guarda en `siniestro_timeline.detalle`.

### Q3 — ¿Limitar a registros cerrados en los últimos N días? ✅ SIN LÍMITE
Sin restricción de fecha. Pero el modal mostrará un **Warning** sobre el impacto en reportes previos:

> ⚠ **Atención**: Este registro ya pudo haber aparecido en reportes financieros previos (mensuales, gerenciales). Al reabrirlo y modificar montos, esos reportes quedarán desactualizados. **Se recomienda generar nuevos reportes** después del reverso para reflejar los cambios.

### Q4 — Ubicación del botón ✅ BARRA SUPERIOR, JUNTO A "ANULAR"
Se ubica en la barra de acciones del top, al lado del botón "Anular", con estilo ámbar (no rojo). **Solo aparece** cuando el registro está en estado terminal (`cerrado`/`anulado` para daños, `completado`/`cancelado` para servicios) **Y** el usuario es admin.

### Q5 — Estado destino del reverso ✅ MAPEO FIJO (REVISADO)

**Decisión actualizada**: el reverso lleva el registro de vuelta a la etapa de cotización/programación. Esto significa que también se deshace la aprobación de cotizaciones (en daños) para que el operador pueda redefinir la propuesta.

| Estado actual | Tipo | Destino del reverso | Acción adicional |
|--------------|------|---------------------|------------------|
| `cerrado` | Daño | **`cotizando`** | Todas las cotizaciones `aprobada` se devuelven a `recibida` |
| `anulado` | Daño | **`cotizando`** | Todas las cotizaciones `aprobada` se devuelven a `recibida` |
| `completado` | Servicio | **`programado`** | (servicios no tienen cotizaciones — sólo cambia el estado) |
| `cancelado` | Servicio | **`programado`** | (servicios no tienen cotizaciones — sólo cambia el estado) |

**Efectos colaterales del reverso de daños**:
- Las cotizaciones quedan con todas sus líneas intactas (no se borra información)
- Ninguna queda como `aprobada` — el operador puede volver a aprobar/elegir
- El trigger SQL `sync_costo_pass_from_approved_quote` recalcula `siniestros.costo_pass = 0` automáticamente (porque no hay aprobadas)
- `siniestros.taller_id` se limpia a `NULL` (porque no hay aprobada que defina taller único)
- `siniestros.monto_cliente` y `margen` quedan donde estaban (el admin decide si tocar)

**Por qué este enfoque**:
- El admin típicamente reabre un registro para **reanalizar la propuesta** o agregar documentación
- Si tuviera que mantener la aprobación previa, la sección de cotizaciones quedaría parcialmente activa (raro UX)
- Volver a `cotizando` y deshacer aprobaciones permite al operador continuar el flujo normal sin tener que "anular cotización" manualmente
- Es la forma más limpia de "resetear el proceso de propuesta" sin perder datos

**Lo que NO se toca**:
- Las cotizaciones rechazadas siguen rechazadas (el operador las pasa a recibida manualmente si las quiere reactivar)
- `cobros` existentes — quedan como historial
- `taller_ingresos` — quedan como historial
- `disponible_renta` y status Odoo — admin decide manualmente
- Líneas de cotización — intactas

---

## Notas para futuro (no en este alcance)

- **Reverso múltiple**: poder retroceder varios estados de una vez con un selector
- **RLS adicional**: política de Supabase que también valide `rol = 'admin'` para garantía a nivel BD
- **Notificación**: email/alerta al supervisor cuando un admin revierte un cierre
- **Restaurar side effects opcionales**: checkbox "También eliminar cobro asociado" en el modal
- **Reverso de servicios mayores con autorización**: si el servicio estaba autorizado y se revierte, ¿qué pasa con la autorización?
- **Limitar a un # de reversos por registro** (ej. máximo 3 reaperturas) para evitar abuso
