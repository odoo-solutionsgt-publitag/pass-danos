# FASE 1 — Dashboard (KPIs + actividad reciente)

**Estado**: ✅ Completado
**Depende de**: Fase 0

---

## Objetivo

Pantalla de inicio con vista panorámica del sistema: KPIs en vivo, últimos daños registrados y actividad reciente.

---

## Archivos

- [frontend/src/pages/Dashboard.jsx](../frontend/src/pages/Dashboard.jsx)

---

## Componentes implementados

### 4 KPI cards
| KPI | Query Supabase |
|-----|----------------|
| Daños activos | `siniestros` count, `estado NOT IN (cerrado, anulado)` |
| Proformas pendientes | `siniestros` count, `estado = 'proforma_emitida'` |
| Vehículos en reparación | `taller_ingresos` count, `fecha_egreso IS NULL` |
| Servicios en curso | `ordenes_servicio` count, `estado = 'en_proceso'` |

Cada card: ícono Lucide + color + valor grande. Skeleton de carga con `animate-pulse`.

### Tabla "Últimos daños" (5 más recientes)
Columnas: No., Vehículo (placa), Cliente, Estado (badge), Fecha. Click en fila → `navigate('/siniestros/:id')`. Botón "Ver todos" → `/siniestros`.

### Feed "Actividad reciente"
Últimos 10 registros de `siniestro_timeline`, join con `siniestros(numero, placa)`. Cada entrada: ícono + número de daño + acción + detalle + fecha.

---

## Decisiones de diseño

- **Sin store global**: todas las queries se ejecutan en paralelo con `Promise.all` en `useEffect` y se guardan en `useState` local. No hace falta Redux/Zustand para 6 queries.
- **Conteos con `head: true`**: cuando solo se necesita el `count`, se usa `select('*', { count: 'exact', head: true })` para no transferir filas.
- **Loading granular**: el `loading` es global por simplicidad — un único spinner para todo el dashboard. Si en el futuro alguna query es lenta, separar.

---

## Cómo probar

1. Loguear como cualquier usuario.
2. Verificar que los 4 KPIs muestran números (0 si la base está vacía).
3. Click en una fila de "Últimos daños" → debe navegar al detalle.
4. Click "Ver todos" → debe ir a `/siniestros`.
5. La actividad reciente debe mostrar los cambios de estado más recientes con timestamps en formato `dd MMM yyyy`.

---

## Criterio de éxito (cumplido)

- [x] Dashboard carga sin errores
- [x] KPIs reflejan el estado real de la base
- [x] Click en fila navega al detalle correspondiente
- [x] Estado vacío muestra mensajes claros
