# Implementación — Cotización Múltiple (guía técnica)

**Fecha de cierre**: 2026-06-02
**Estado**: ✅ Implementado en producción
**Plan original**: [Plan_desarrollo_cotizacion_multiple.md](Plan_desarrollo_cotizacion_multiple.md)
**Commits relevantes**: `9e20333` (feature inicial) · `709be59` (fix visibilidad en proforma_emitida)

---

## Objetivo de este documento

Servir de hand-off técnico para futuros equipos. Mientras que el plan describe **qué se quería construir**, este documento describe **cómo quedó realmente construido** después de la iteración con el usuario en producción.

Si en el futuro quieres extender el flujo de cotización (ej. agregar un tercer modo, cambiar la lógica de aprobación, modificar el cálculo del costo Pass), empieza por leer este documento — describe el contrato implícito entre componentes, los puntos de extensión y los gotchas.

---

## Resumen ejecutivo

| Modo | Selector | Aprobación | Costo Pass | UI distintiva |
|------|----------|-----------|------------|---------------|
| `unica` | Radio card ámbar 🎯 | 1 aprobada → resto rechazadas | `total_general` de la aprobada | Comparador + ★ visible |
| `multiple` | Radio card morado 🎚 | Aprobadas en paralelo, sin rechazo | `SUM(total_general)` de aprobadas | Sin comparador, sin ★, con "Quitar aprobación" |

El default para daños nuevos y existentes es `unica`. La migración SQL no toca datos viejos — solo agrega la columna con default.

---

## Archivos creados o modificados

### Backend
**Sin cambios.** El backend Node.js no interviene en este feature. Toda la lógica está en SQL (trigger) + frontend.

### Base de datos
| Archivo | Tipo | Acción |
|---------|------|--------|
| `db/008_cotizacion_multiple.sql` | Nuevo | ALTER + reescritura de trigger |

### Frontend
| Archivo | Tipo | Acción |
|---------|------|--------|
| `frontend/src/components/CotizacionesSection.jsx` | Modificado | Selector de modo + handleAprobar dual + handleQuitarAprobacion + ocultar comparador en múltiple + botón quitar aprobación + suma de aprobadas |
| `frontend/src/components/ProformaSection.jsx` | Reescrito | Carga todas las aprobadas, no solo una. Render dual (única/múltiple) con subcomponente `CotizacionDetalle` reutilizable |
| `frontend/src/components/CotizacionesHistorico.jsx` | Modificado | Oculta ★ y comparador en modo múltiple, ajusta descripción |
| `frontend/src/pages/SiniestroDetalle.jsx` | Modificado | Mantiene `CotizacionesSection` visible durante `proforma_emitida` en modo múltiple. Oculta `CotizacionesHistorico` durante esa fase para evitar duplicación |
| `frontend/src/pages/FichaSiniestroPrint.jsx` | Modificado | Carga `aprobadas` (lista) en lugar de `cotizacion` (una). Render dual con "Proforma combinada — N cotizaciones aprobadas" y gran total |

### Documentación
| Archivo | Tipo |
|---------|------|
| `plans/Plan_desarrollo_cotizacion_multiple.md` | Plan original |
| `plans/Implementacion_cotizacion_multiple.md` | Este documento |
| `CLAUDE.md` | Actualizado con la nueva sección en post-Fase 2 |

---

## Modelo de datos — contrato implícito

### `siniestros.tipo_cotizacion`
- Tipo: `TEXT` con `CHECK (tipo_cotizacion IN ('unica', 'multiple'))`
- Default: `'unica'`
- NOT NULL
- Decisión: NO usar enum PostgreSQL porque era más fácil agregar otros modos en el futuro sin migración de enum
- **Locking conceptual**: la lógica de bloqueo (no permitir cambiar de modo cuando ya hay cotizaciones con líneas) vive **en el frontend**, no en BD. La BD permite cambiar libremente — el frontend solo deshabilita el botón. Esto es intencional: si alguna vez admin necesita corregir desde Supabase Studio, puede.

### Trigger `sync_costo_pass_from_approved_quote`
Antes era simple: leer `total_general` de la aprobada y escribirlo a `siniestros.costo_pass`.

Ahora es un router:

```
trigger en cotizaciones (INSERT/UPDATE/DELETE)
   │
   ├── resolver v_siniestro_id desde NEW o OLD
   │
   ├── leer v_tipo desde siniestros
   │
   ├── if v_tipo = 'multiple':
   │       v_total = SUM(total_general) WHERE estado = 'aprobada'
   │   else:
   │       v_total = total_general WHERE estado = 'aprobada' LIMIT 1 (o 0)
   │
   └── UPDATE siniestros SET costo_pass = v_total, margen = monto_cliente - v_total
```

**Punto clave**: el trigger NUNCA mira `tipo_cotizacion` directamente al recibir un cambio en `cotizacion_lineas` — lo lee desde `siniestros` cada vez. Esto significa que cambios en `tipo_cotizacion` se reflejan automáticamente la próxima vez que se mueve una cotización (no requiere recalcular en cascada).

---

## Patrones de código en frontend

### Detección del modo
En cualquier componente que reciba `siniestro` como prop:

```js
const esModoMultiple = siniestro.tipo_cotizacion === 'multiple'
```

Usar siempre el fallback implícito a `'unica'` (cualquier valor distinto de `'multiple'` se trata como única). Esto cubre daños viejos donde la columna podría no estar disponible aún (raro pero defensivo).

### Cálculo de la suma de aprobadas (frontend)

El cálculo de la suma vive en **dos lugares** y debe coincidir:
1. **Trigger SQL** (`sync_costo_pass_from_approved_quote`) — fuente de verdad, persistida en `siniestros.costo_pass`
2. **Frontend** (`CotizacionesSection`, `ProformaSection`) — cálculo local para UI inmediata

Patrón frontend:
```js
const sumaAprobadas = cotizaciones
  .filter(c => c.estado === 'aprobada')
  .reduce((acc, c) => acc + (Number(c.total_general) || 0), 0)
```

El frontend NO espera al trigger para mostrar — calcula localmente. El trigger SQL es la fuente de verdad para reportes, KPIs y el `costo_pass` persistido.

### Lógica de aprobación

```js
async function handleAprobar(cotId, tallerId) {
  await supabase.from('cotizaciones').update({ estado: 'aprobada' }).eq('id', cotId)

  if (tipoCotizacion === 'unica') {
    // Rechazar las demás
    const otrosIds = cotizaciones.filter(c => c.id !== cotId).map(c => c.id)
    if (otrosIds.length) {
      await supabase.from('cotizaciones').update({ estado: 'rechazada' }).in('id', otrosIds)
    }
    // Asignar taller único + avanzar estado si aplica
    const updates = { taller_id: tallerId }
    if (siniestro.estado === 'cotizando') updates.estado = 'proforma_emitida'
    await supabase.from('siniestros').update(updates).eq('id', siniestro.id)
  } else {
    // Múltiple: no tocar las demás. Solo avanzar estado si es el primer aprobado.
    if (siniestro.estado === 'cotizando') {
      await supabase.from('siniestros').update({
        estado: 'proforma_emitida',
        taller_id: null,  // ← no hay taller único
      }).eq('id', siniestro.id)
    }
  }
}
```

**Punto crítico**: en modo múltiple, `siniestros.taller_id` se deja explícitamente en `NULL`. Cualquier query que asuma `taller_id IS NOT NULL` debe manejar el NULL graciosamente.

### Quitar aprobación (solo múltiple)

```js
async function handleQuitarAprobacion(cotId) {
  await supabase.from('cotizaciones').update({ estado: 'recibida' }).eq('id', cotId)
  // El trigger SQL recalcula costo_pass automáticamente
}
```

No se expone esta opción en modo única porque el sistema asume que la única aprobada es la elegida. Si quieres "des-aprobar" en modo única, debes anular el daño y empezar de nuevo.

### Visibilidad de secciones según estado y modo

La lógica vive en `SiniestroDetalle.jsx`:

```jsx
// CotizacionesSection: activa para gestión
{(estado === 'cotizando' ||
  (siniestro.tipo_cotizacion === 'multiple' && estado === 'proforma_emitida')) && (
  <CotizacionesSection siniestro={siniestro} onUpdate={loadAll} />
)}

// ProformaSection: financiero
{['proforma_emitida', 'proforma_aprobada', ...].includes(estado) && (
  <ProformaSection siniestro={siniestro} onUpdate={loadAll} />
)}

// CotizacionesHistorico: readonly
{['proforma_emitida', 'proforma_aprobada', ...].includes(estado) &&
 !(siniestro.tipo_cotizacion === 'multiple' && estado === 'proforma_emitida') && (
  <CotizacionesHistorico siniestro={siniestro} />
)}
```

Resumen visual:

| Estado | Modo Única | Modo Múltiple |
|--------|-----------|---------------|
| `cotizando` | CotizacionesSection ✅ | CotizacionesSection ✅ |
| `proforma_emitida` | ProformaSection + Histórico | **CotizacionesSection + ProformaSection** (sin Histórico) |
| `proforma_aprobada` y posteriores | ProformaSection + Histórico | ProformaSection + Histórico |

La transición de "puedo seguir aprobando" a "ya cerrado" ocurre cuando el usuario hace click en **"Aprobar proforma"** (botón en la barra superior del detalle).

---

## Decisiones tomadas durante implementación

### Decisión: NO automatizar el cierre del proceso múltiple
Inicialmente pensé en un botón "Cerrar cotizaciones" exclusivo del modo múltiple para transicionar a `proforma_aprobada`. Lo descarté: el botón "Aprobar proforma" existente ya sirve para eso, y agregar otro botón confundiría más que ayudar.

### Decisión: `taller_id` queda NULL en múltiple
Alternativas consideradas:
- Asignar el del primer aprobado → engañoso, no representa la realidad
- Crear una tabla `siniestro_talleres` para soportar N talleres → over-engineering para el caso actual
- NULL → cumple la realidad: no hay un único taller del daño

Resultado: NULL. Si alguna query rompe, manejarla con `?.` o COALESCE.

### Decisión: Mantener `cotizaciones.taller_id` siempre lleno
Cada cotización individual SÍ tiene su taller_id (es de quién es la cotización). Solo el `siniestros.taller_id` agregado queda NULL en múltiple. Esto significa que reportes y KPIs por taller funcionan a través de las cotizaciones aprobadas, no del taller agregado del daño.

### Decisión: El selector se bloquea por presencia de líneas, no de cotizaciones
Reglas exactas:
- Si NO hay cotizaciones, el selector es editable
- Si hay cotizaciones pero TODAS están en estado `'solicitada'` sin líneas, el selector sigue editable
- En cuanto se agrega la primera línea a cualquier cotización, el selector se bloquea

Razón: las cotizaciones en estado `solicitada` son solo "pedimos a este taller" — no representan compromiso real. Las líneas son el punto donde el modo empieza a importar (porque el comparador/suma se calcula sobre ellas).

### Decisión: Sin migración de datos viejos
Todos los daños existentes quedan con `tipo_cotizacion = 'unica'` por el default. Ninguno se toca. El comportamiento legacy es 100% preservado.

### Decisión: Comparador y ★ no se ven en múltiple
Alternativa considerada: mostrar el comparador como informativo (no aprobación). Descartada porque confunde — el usuario podría pensar que tiene que elegir uno. En múltiple no hay comparación, son complementarios.

### Decisión: La fila CotizacionesSection en proforma_emitida (modo múltiple) no oculta otras acciones
Cuando el daño está en `proforma_emitida` modo múltiple, el usuario ve:
- CotizacionesSection activa (puede seguir aprobando)
- ProformaSection (con el total parcial)
- Botón "Aprobar proforma" en la barra superior (para cerrar el proceso)

Todo coexiste. El usuario decide cuándo cerrar.

---

## Cosas que NO se hicieron (deliberadamente)

- **Workflow de autorización** para aprobaciones múltiples → no se requirió, queda para futuro
- **Tipo de cada cotización** (etiqueta "mano de obra", "repuestos", etc.) → se infiere por las líneas; un campo dedicado sería un nuevo feature
- **Agrupar cotizaciones por tipo de aporte** visualmente → la UI las muestra en orden de creación
- **Reglas de validación** del lado del trigger (ej. "no se puede aprobar más de N cotizaciones") → ninguna, total libertad
- **Sincronización de `taller_id` con Odoo** → no aplica, el campo de Odoo es del daño completo
- **Soporte para servicios** (`ordenes_servicio`) → fuera de alcance, los servicios siguen siendo simples

---

## Gotchas y trampas conocidas

### El trigger no se dispara desde cambios en `siniestros.tipo_cotizacion`
Si cambias `tipo_cotizacion` desde Supabase Studio, el `costo_pass` no se recalcula automáticamente. Para forzar recálculo: hacer un UPDATE de alguna `cotizacion` (incluso a sí misma), y el trigger se dispara. O recalcular manualmente:
```sql
UPDATE siniestros SET costo_pass = (
  SELECT COALESCE(SUM(total_general), 0) FROM cotizaciones
  WHERE siniestro_id = siniestros.id AND estado = 'aprobada'
) WHERE id = '...';
```

### En modo múltiple no se valida que haya al menos 1 aprobada antes de "Aprobar proforma"
El botón existe siempre que `estado = 'proforma_emitida'`. Si nadie ha sido aprobado todavía, el daño avanzará igual a `proforma_aprobada` con `costo_pass = 0`. UX issue menor; mitigable con validación frontend si se vuelve un problema.

### Quitar aprobación recalcula el trigger, pero la UI necesita un `loadAll()` para reflejarlo
Por eso `handleQuitarAprobacion` siempre llama a `loadAll()` y `onUpdate()` al final. Si añades un nuevo handler que modifique cotizaciones, asegúrate de hacer lo mismo.

### `ProformaSection` ahora carga TODAS las aprobadas, no `maybeSingle()`
Si en algún momento ves un componente que asume "hay solo una cotización aprobada", revísalo — en modo múltiple puede haber muchas. Patrón actual:
```js
.select('*, talleres(nombre), cotizacion_lineas(*)')
.eq('siniestro_id', siniestro.id)
.eq('estado', 'aprobada')
.order('created_at')
// (NO `.maybeSingle()` — devuelve array)
```

### `siniestros.taller_id` puede ser NULL en daños modo múltiple
Cualquier código que asuma "el taller del daño" debe usar `siniestro.talleres?.nombre || 'Múltiples talleres'` o similar fallback.

---

## Cómo extender el feature

### Agregar un tercer modo (ej. "mixto")
1. SQL: cambiar el CHECK a `IN ('unica', 'multiple', 'mixto')`
2. Trigger: agregar una rama `IF v_tipo = 'mixto' THEN ...` con el cálculo deseado
3. Frontend: agregar la opción en el selector, definir comportamiento de `handleAprobar`, ajustar visualización

### Agregar workflow de autorización (montos altos requieren visto bueno)
1. SQL: agregar columna `siniestros.requiere_autorizacion_proforma BOOLEAN` o similar
2. Trigger: al hacer SUM, si supera umbral, set `requiere_autorizacion = true`
3. Frontend: bloquear "Aprobar proforma" cuando `requiere_autorizacion = true` hasta que admin lo destrabe

### Agregar tipo explícito por cotización
1. SQL: agregar columna `cotizaciones.tipo_aporte TEXT` (mano_obra, repuestos, vidrios, otro)
2. Frontend: dropdown en el panel de solicitar + badge en cada tarjeta + agrupación visual opcional

---

## Métricas de éxito alcanzadas

- [x] Daños existentes en `unica` se comportan idéntico a antes (regression OK)
- [x] Modo múltiple soporta aprobar varias sin rechazar las demás
- [x] `costo_pass` refleja la suma en tiempo real (trigger SQL)
- [x] Botón "Quitar aprobación" funcional y recalcula
- [x] Comparador y ★ ocultos en modo múltiple
- [x] ProformaSection y FichaSiniestroPrint con render dual
- [x] CotizacionesSection sigue visible en `proforma_emitida` modo múltiple (fix iterativo aplicado tras detectarse en producción)
- [x] Selector de modo bloqueado tras crear cotizaciones con líneas

---

## Resumen de 30 segundos para alguien que llega frío

1. La columna `siniestros.tipo_cotizacion` decide si una cotización es competencia (única) o suma (múltiple)
2. El trigger SQL `sync_costo_pass_from_approved_quote` es el cálculo central — TODO el `costo_pass` se persiste desde ahí
3. El frontend respeta el modo: comparador y ★ solo en única; quitar-aprobación solo en múltiple
4. En modo múltiple, `CotizacionesSection` sigue visible en `proforma_emitida` para seguir aprobando; el cierre formal es el botón "Aprobar proforma"
5. `siniestros.taller_id` queda NULL en modo múltiple — manejarlo con `?.` en componentes downstream
6. La migración SQL no toca datos viejos — todo el comportamiento legacy queda preservado por el default `'unica'`
