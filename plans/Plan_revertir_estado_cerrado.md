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

### Cálculo del "estado anterior"

Se consulta el timeline correspondiente, buscando la fila más reciente cuyo `estado_nuevo` coincide con el estado actual cerrado. Su `estado_anterior` es el destino del reverso.

```sql
-- Para daños
SELECT estado_anterior
FROM siniestro_timeline
WHERE siniestro_id = ?
  AND estado_nuevo IN ('cerrado', 'anulado')
ORDER BY created_at DESC
LIMIT 1;
```

Si no hay registro en timeline (edge case con daños viejos pre-trigger), fallback razonable:
- `cerrado` → `en_cobro`
- `anulado` → `registrado`
- `completado` (servicios) → `en_proceso`
- `cancelado` (servicios) → `programado`

---

## Alcance — qué SÍ y qué NO

### ✅ SÍ se hace
- Botón "Revertir cierre" visible solo para `esAdmin`
- Aplica a daños (`cerrado` y `anulado`)
- Aplica a servicios (`completado` y `cancelado`)
- Modal de confirmación con motivo opcional
- Registro del reverso en el timeline correspondiente
- Auditoría automática vía trigger global `audit_changes()`

### ❌ NO se hace en esta iteración
- **No se borran/modifican `cobros` existentes** — quedan tal cual; si fueron creados con `es_gasto_pass = true` o `es_seguro = true`, permanecen
- **No se restauran `taller_ingresos`** — si el daño/servicio estaba reparado y se revirtió, los ingresos al taller siguen tal cual
- **No se sincroniza Odoo** automáticamente — el `x_studio_status_vehiculo` queda donde estaba (el admin lo ajusta manualmente si aplica)
- **No se afecta `disponible_renta`** (daños) — sigue igual; el admin decide si tocar después
- **No se ofrece reverso múltiple** — solo un nivel (cerrado → estado anterior); para "deshacer" varias transiciones consecutivas, el admin repite el proceso

### Razones del enfoque conservador
- El propósito es **agregar información**, no rehacer el workflow completo
- Tocar side effects en cascada multiplica el riesgo de inconsistencias
- El admin tiene visibilidad para revisar y arreglar manualmente lo que sobre

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

### D. Handler `handleRevertirCierre`

```js
async function handleRevertirCierre(motivo) {
  // 1. Buscar estado anterior en timeline
  const { data: tl } = await supabase
    .from('siniestro_timeline')
    .select('estado_anterior')
    .eq('siniestro_id', siniestro.id)
    .in('estado_nuevo', ['cerrado', 'anulado'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const estadoAnterior = tl?.estado_anterior ?? fallbackEstado(estado)

  // 2. UPDATE del estado
  await supabase.from('siniestros').update({ estado: estadoAnterior }).eq('id', siniestro.id)

  // 3. INSERT en timeline (el trigger genérico ya hace su parte; aquí agregamos
  //    la entrada manual con el motivo)
  await supabase.from('siniestro_timeline').insert({
    siniestro_id:   siniestro.id,
    estado_anterior: estado,
    estado_nuevo:    estadoAnterior,
    accion:          'Reverso de cierre',
    detalle:         motivo || null,
    usuario_id:      user.id,
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
| 3 | Vuelve al **estado inmediatamente anterior** (no a uno arbitrario) | Mantiene linealidad del workflow; admin puede repetir para retroceder más |
| 4 | NO se tocan side effects (cobros, taller_ingresos, Odoo status) | Limita el alcance del cambio; menos riesgo de inconsistencia |
| 5 | Motivo del reverso es **opcional** pero recomendado | El admin sabe cuándo es relevante documentar |
| 6 | Validación en frontend, sin RLS específica | Suficiente para el caso de uso; admins son confiables |
| 7 | Sin cambios en BD ni backend | Toda la lógica vive en el frontend con queries directas a Supabase |
| 8 | Reverso queda registrado en timeline y `audit_log` | Auditoría completa sin código extra (el trigger genérico ya lo captura) |
| 9 | Fallback de estado si no hay timeline | Daños/servicios viejos podrían no tener timeline completo |
| 10 | Botón ámbar/naranja (no rojo) | Acción reversible y deliberada, no destructiva — el rojo se reserva para anular/eliminar |

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Admin revierte por error un cierre legítimo | Modal de confirmación + auditoría completa permite rastrear y volver a cerrar |
| Después del reverso, el daño tiene un cobro creado que ya no aplica | El admin debe revisar y eliminar/ajustar manualmente el cobro si es necesario |
| Si el daño estaba en `cerrado` por absorbe Pass o seguro, el `cobros.es_gasto_pass` queda como historial | Aceptable — refleja la intención original; si quiere revertir esa decisión, el admin lo edita |
| Reverso de `anulado` en daños viejos sin timeline → fallback a `registrado` puede ser raro | Aceptable como fallback; el admin verá el resultado y puede ajustar manualmente |
| Vehículo en Odoo quedó "Disponible" tras el cierre — al reabrir el daño, no se vuelve a "En Reparación" | El admin decide manualmente si modificar `disponible_renta` (que sí sincroniza Odoo) |
| Usuario admin malicioso puede revertir cierres indebidamente | Auditoría completa permite detectar el patrón y revertir nuevamente |

---

## Métricas de éxito

- [ ] Botón "Revertir cierre" visible solo para `esAdmin` en daños `cerrado`/`anulado` y servicios `completado`/`cancelado`
- [ ] No visible para agentes (incluso agente_senior con `eliminar = true`)
- [ ] Click muestra modal de confirmación con el estado destino correcto
- [ ] Campo motivo opcional aparece y se guarda en `siniestro_timeline.detalle`
- [ ] Tras confirmar, el daño regresa al estado anterior (ej. `cerrado` → `en_cobro`)
- [ ] El nuevo evento aparece en el historial de estados visual
- [ ] El cambio queda en `audit_log` con `usuario_id` del admin
- [ ] Los botones de transición del estado nuevo reaparecen (ej. "Cerrar expediente" disponible de nuevo)
- [ ] Los `cobros` existentes siguen intactos (no se borran)
- [ ] Los `taller_ingresos` siguen intactos
- [ ] `disponible_renta` y Odoo status NO cambian automáticamente
- [ ] Servicios: mismo comportamiento simétrico

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

### Q5 — Estado destino del reverso ✅ MAPEO FIJO
Sin consultar timeline. Mapeo simple y directo:

| Estado actual | Tipo | Destino del reverso |
|--------------|------|---------------------|
| `cerrado` | Daño | `en_cobro` |
| `anulado` | Daño | `registrado` (fallback razonable — anulación puede venir de cualquier estado) |
| `completado` | Servicio | `en_proceso` |
| `cancelado` | Servicio | `programado` (fallback razonable — cancelación puede venir de cualquier estado) |

**Nota técnica**: el modal muestra explícitamente el estado destino antes de confirmar, así que el admin lo verifica visualmente. Si en algún caso el destino no es el adecuado (ej. daño cerrado por "Absorbe Pass" que iría a `en_cobro` aunque no haya cobro abierto), el admin puede ajustar el estado manualmente desde la BD después del reverso, o aplicar otra transición.

---

## Notas para futuro (no en este alcance)

- **Reverso múltiple**: poder retroceder varios estados de una vez con un selector
- **RLS adicional**: política de Supabase que también valide `rol = 'admin'` para garantía a nivel BD
- **Notificación**: email/alerta al supervisor cuando un admin revierte un cierre
- **Restaurar side effects opcionales**: checkbox "También eliminar cobro asociado" en el modal
- **Reverso de servicios mayores con autorización**: si el servicio estaba autorizado y se revierte, ¿qué pasa con la autorización?
- **Limitar a un # de reversos por registro** (ej. máximo 3 reaperturas) para evitar abuso
