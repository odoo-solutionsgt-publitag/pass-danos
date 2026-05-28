# Fase 2 / H — Anulados invisibles para usuarios

**Estado**: 📋 Pendiente
**Prioridad**: Baja
**Estimado**: 1 sesión (1-2 horas)

---

## Requerimientos

Los registros con `estado='anulado'` deben **desaparecer por completo** de la UI:
- No aparecer en listas (Daños, Servicios, Proformas, etc.)
- No aparecer en historiales del vehículo (bitácora, drawer de flota)
- No contar en KPIs ni reportes
- No aparecer en el repositorio de documentos
- **Solo el admin Supabase** (no el admin de la app) puede verlos desde Supabase Studio directamente

---

## Estrategia

**NO eliminar físicamente**. Mantener el registro con `estado='anulado'` para:
- Conservar integridad referencial (cotizaciones, documentos, taller_ingresos)
- Mantener el audit log (Plan F2/A)
- Posibilidad de auditoría posterior si hay duda

**Aplicar filtro centralizado** en todas las queries del frontend.

---

## Implementación

### Opción A — Filtro en cada query del frontend (manual)

Agregar `.neq('estado', 'anulado')` en cada `.from('siniestros').select(...)` y `.from('ordenes_servicio').select(...)`.

**Riesgo**: olvidar filtrarlo en algún componente nuevo.

### Opción B — Vistas SQL filtradas (recomendado)

Crear vistas que ocultan los anulados:

```sql
CREATE OR REPLACE VIEW siniestros_visibles AS
  SELECT * FROM siniestros WHERE estado != 'anulado';

CREATE OR REPLACE VIEW ordenes_servicio_visibles AS
  SELECT * FROM ordenes_servicio WHERE estado != 'cancelado';

GRANT SELECT ON siniestros_visibles, ordenes_servicio_visibles TO authenticated, anon;
```

Y cambiar todas las queries del frontend a leer de las vistas en vez de las tablas.

**Problema**: Supabase JS no permite hacer UPDATE/INSERT a vistas fácilmente. Habría que mantener tabla para escritura y vista para lectura, lo que complica el código.

### Opción C — Helper hooks personalizados (mejor balance)

Crear hooks `useSiniestros()` y `useOrdenesServicio()` que centralizan la query y aplican el filtro:

```jsx
// hooks/useSiniestros.js
import { supabase } from '../lib/supabase'

export function siniestrosQuery() {
  return supabase.from('siniestros').select('*').neq('estado', 'anulado')
}

export function ordenesServicioQuery() {
  return supabase.from('ordenes_servicio').select('*').neq('estado', 'cancelado')
}
```

En cada componente:
```jsx
import { siniestrosQuery } from '../hooks/useSiniestros'

const { data } = await siniestrosQuery()
  .order('created_at', { ascending: false })
  .limit(200)
```

**Mejor opción** porque mantiene SDK directo de Supabase y la lectura es declarativa.

---

## Cambios necesarios en código

### Listas con filtro de anulados

| Archivo | Cambio |
|---------|--------|
| `Siniestros.jsx` | Agregar `.neq('estado', 'anulado')` |
| `Servicios.jsx` | Agregar `.neq('estado', 'cancelado')` |
| `Proformas.jsx` | Ya filtra cotizaciones aprobadas, agregar también `.not('siniestros.estado', 'eq', 'anulado')` |
| `Dashboard.jsx` | Los KPIs ya filtran (siniestros activos = `not estado in (cerrado, anulado)`) — verificar todos |
| `BitacoraVehiculo.jsx` | Filtrar daños y servicios anulados/cancelados |
| `Repositorio.jsx` | Filtrar documentos cuyo origen está anulado (más complejo, requiere join) |
| `Reportes.jsx` | Ya excluye `anulado`/`cancelado` desde Fase 1 — verificar |
| `FlotaVehicular.jsx` (drawer) | Filtrar historial |

### Lista de daños anulados para admin (futuro, no en esta fase)

Si en el futuro el admin necesita ver anulados, agregar pestaña aparte en algún reporte. Por ahora **solo Supabase Studio**.

### Filtro en el dropdown de estados

En `Siniestros.jsx`, quitar "Anulado" del select de filtro de estado (ya no debe ser una opción visible).

```js
// antes: ['todos', 'registrado', ..., 'cerrado', 'anulado']
// después: ['todos', 'registrado', ..., 'cerrado']  (sin anulado)
```

---

## Comunicación al usuario

Cuando se anula un daño/servicio:
- Ya no aparece en ninguna lista
- Aparece toast: "Daño SIN-2026-006 anulado. Ya no aparecerá en las listas."
- En el detalle abierto, sí se sigue mostrando (porque el usuario llegó directo via URL) con badge "Anulado" y todas las acciones deshabilitadas

---

## Pasos de implementación

1. Crear `lib/queries.js` con helpers `siniestrosQuery()` y `ordenesServicioQuery()`
2. Refactorizar todas las listas para usarlos
3. Verificar Reportes (ya filtraba — confirmar)
4. Quitar "Anulado" del dropdown de filtros
5. Ajustar drawer de Flota y Bitácora del vehículo
6. Mensaje toast al anular
7. Probar: anular un daño y verificar que desaparece de TODOS los lugares

---

## Criterios de éxito

- [ ] Anular un daño lo elimina de Lista, Dashboard, Bitácora, Flota drawer
- [ ] Los KPIs y reportes no cuentan anulados
- [ ] El daño anulado sigue accesible vía URL directa (no se pierde la auditoría)
- [ ] El admin puede consultar anulados desde Supabase Studio
- [ ] El dropdown de filtro de estado ya no muestra "Anulado"
