# Plan — Reporte Diario + Bitácora de Actualización

**Estado**: 📋 Pendiente de aprobación
**Origen**: Replicar reporte operacional Excel (`docs/control-reporte-servicios-daños.xlsx`)
**Prioridad**: Alta (uso diario por operaciones)
**Estimado**: 1 sesión larga (3 – 4 horas)
**Fase relacionada**: Post-Fase 2 — mejora operacional

---

## Objetivo

Reemplazar el archivo Excel manual de control diario por una **sección "Reporte Diario"** en el Dashboard, alimentada en tiempo real desde la base de datos, con:
- Filtros por tipo (Servicios / Daños) y por mes
- Semáforo visual por días en taller (1-2 verde · 3-5 amarillo · 6+ rojo)
- Exportable a CSV e imprimible para impresión / PDF
- Columna "Observaciones" alimentada por una **bitácora de actualización manual** nueva por registro

---

## Bloques de trabajo

| # | Bloque | Alcance |
|---|--------|---------|
| 1 | Modelo de datos — Bitácora | Tabla nueva + RLS + auditoría |
| 2 | Componente `BitacoraActualizaciones` | UI embebida en `SiniestroDetalle` y `ServicioDetalle` |
| 3 | Reporte Diario en Dashboard | Tabla con filtros, semáforo, totales, export |

---

## Bloque 1 — Modelo de datos: bitácora de actualización

### Estructura propuesta

Tabla **`bitacora_actualizaciones`** — una sola tabla compartida entre daños y servicios.

```sql
CREATE TABLE bitacora_actualizaciones (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vínculo: exactamente uno debe estar lleno
  siniestro_id      UUID REFERENCES siniestros(id) ON DELETE CASCADE,
  orden_servicio_id UUID REFERENCES ordenes_servicio(id) ON DELETE CASCADE,

  nota              TEXT NOT NULL CHECK (length(trim(nota)) > 0),

  -- Autor
  usuario_id        UUID REFERENCES auth.users(id),
  usuario_email     TEXT,
  usuario_nombre    TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_un_origen CHECK (
    (siniestro_id IS NOT NULL AND orden_servicio_id IS NULL) OR
    (siniestro_id IS NULL AND orden_servicio_id IS NOT NULL)
  )
);

CREATE INDEX idx_bitacora_siniestro ON bitacora_actualizaciones(siniestro_id) WHERE siniestro_id IS NOT NULL;
CREATE INDEX idx_bitacora_orden     ON bitacora_actualizaciones(orden_servicio_id) WHERE orden_servicio_id IS NOT NULL;
CREATE INDEX idx_bitacora_created   ON bitacora_actualizaciones(created_at DESC);
```

### Reglas
- **Append-only**: no se permite UPDATE ni DELETE (RLS bloquea ambas operaciones).
- **Lectura**: cualquier usuario autenticado.
- **Inserción**: usuarios con `puedeEditar = true` (via función `has_permission('editar')`).
- **Auditoría**: aplicar trigger `audit_changes()` ya existente (registra solo INSERT en este caso por la regla append-only, pero mantiene consistencia).

### RLS

```sql
ALTER TABLE bitacora_actualizaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY bitacora_select_all
  ON bitacora_actualizaciones FOR SELECT
  TO authenticated USING (true);

CREATE POLICY bitacora_insert_with_permission
  ON bitacora_actualizaciones FOR INSERT
  TO authenticated WITH CHECK (has_permission('editar'));

-- Sin policies para UPDATE/DELETE → bloqueado por defecto (append-only)
```

### Trigger de auditoría

```sql
CREATE TRIGGER audit_bitacora_actualizaciones
  AFTER INSERT OR UPDATE OR DELETE ON bitacora_actualizaciones
  FOR EACH ROW EXECUTE FUNCTION audit_changes();
```

---

## Bloque 2 — Componente `BitacoraActualizaciones`

### Ubicación
- `SiniestroDetalle.jsx` → antes del bloque "Historial de estados"
- `ServicioDetalle.jsx` → antes del bloque "Historial de estados"

### Interfaz visual

```
┌─────────────────────────────────────────────────────────────┐
│ 📝 Bitácora de actualización                                │
├─────────────────────────────────────────────────────────────┤
│ [Agregar actualización...]                  [+ Agregar]     │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│ 28 may 2026, 14:32 · Carlos R.                              │
│ Vehículo entregado en COFIÑO. Espera repuesto.              │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│ 27 may 2026, 09:15 · José J. (más reciente arriba)          │
│ Confirmada cotización de Q 5,700.                           │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│ 26 may 2026, 17:00 · José J.                                │
│ Ingreso al taller para enderezado.                          │
└─────────────────────────────────────────────────────────────┘
```

### Props
```jsx
<BitacoraActualizaciones
  tipo="dano"            // o "servicio"
  registroId={siniestro.id}
/>
```

### Comportamiento
- Query: `bitacora_actualizaciones WHERE siniestro_id = ? OR orden_servicio_id = ?` ordenado por `created_at DESC`.
- Input multilínea con `maxLength={500}` y contador visible al usuario.
- Botón "Agregar" inserta con `usuario_id`, `usuario_email`, `usuario_nombre` desde `useAuth()`.
- Tras insertar: limpia el input, refresca la lista.
- Sin botones de editar/eliminar (append-only enforzado en BD).
- Si el usuario no tiene `puedeEditar`, el input se oculta y solo lee.

---

## Bloque 3 — Reporte Diario en Dashboard

### Ubicación
Nueva sección dentro de `Dashboard.jsx`, debajo de las KPIs y antes de "Últimos siniestros".

### Layout visual

```
┌───────────────────────────────────────────────────────────────────────────┐
│ 📋 Reporte Diario                                                          │
│ Vehículos actualmente en taller                                            │
├───────────────────────────────────────────────────────────────────────────┤
│ Filtros:  ☑ Servicios   ☑ Daños    Mes: [Mayo 2026 ▼]                     │
│ Total: 12 vehículos     [🖨 Imprimir]  [⬇ Exportar CSV]                    │
├───────────────────────────────────────────────────────────────────────────┤
│ Leyenda:  🟢 1-2 días   🟡 3-5 días   🔴 6+ días                          │
├──┬──────────┬───────┬─────────┬──────┬─────────┬─────────┬───────┬──────┬─────────────────────┬──────────────────┤
│ #│ PLACA    │ TIPO  │ REGISTRO│ TALL │ INGRESO │ EST.SAL │ DÍAS  │ SEM  │ MOTIVO              │ OBSERVACIONES    │
├──┼──────────┼───────┼─────────┼──────┼─────────┼─────────┼───────┼──────┼─────────────────────┼──────────────────┤
│ 1│ P726LKD  │ L200  │ Servicio│ VICO │ 25 may  │ 26 may  │  3    │  🟡  │ Servicio menor      │ Espera repuesto  │
│ 2│ P189KMB  │ HILUX │ Daño    │ STAR │ 23 may  │ 26 may  │  6    │  🔴  │ Enderezado y pint.  │ Cubre seguro     │
│ 3│ P352KSP  │ STAR  │ Servicio│ GRP Q│ 26 may  │ 26 may  │  1    │  🟢  │ Alineación          │ Gastos de Pass   │
│ 4│ P523KQB  │ COR.  │ Servicio│ COFI │ 25 may  │ 26 may  │  3    │  🟡  │ Vibración acelerar  │ Última nota...   │
└──┴──────────┴───────┴─────────┴──────┴─────────┴─────────┴───────┴──────┴─────────────────────┴──────────────────┘
```

### Columnas

| Columna UI | Origen |
|------------|--------|
| `#` | Correlativo (1-based en orden de fecha de ingreso ASC) |
| `PLACA` | `placa` |
| `TIPO` | `tipo_vehiculo` |
| `REGISTRO` | Badge: `Servicio` (slate) o `Daño` (red) — derivado del origen |
| `TALLER` | `talleres.nombre` (del `taller_ingresos.taller_id`) |
| `INGRESO` | `taller_ingresos.fecha_ingreso` |
| `EST. SALIDA` | `fecha_estimada_entrega` del daño/servicio |
| `DÍAS` | `taller_ingresos.dias_en_taller` |
| `SEM` | Círculo verde/ámbar/rojo según semáforo |
| `MOTIVO` | Para daños: `TIPO_DANO_LABELS[tipo_dano]` + corte de `descripcion`. Para servicios: `TIPO_SERVICIO_LABELS[tipo_servicio]` + corte de `descripcion` |
| `OBSERVACIONES` | Última `bitacora_actualizaciones.nota` del registro, truncada a 80 chars (fallback: forma de pago si daño, "Gastos de Pass" si servicio) |

### Filtros

- **☑ Servicios**: incluye filas que vienen de `ordenes_servicio` (toggle independiente, ON por defecto)
- **☑ Daños**: incluye filas que vienen de `siniestros` (toggle independiente, ON por defecto)
- **Mes**: dropdown con los últimos 12 meses. Filtra por `taller_ingresos.fecha_ingreso` dentro del mes seleccionado. Por defecto: mes en curso.

### Query

```javascript
// Daños activos en taller
const danosQ = supabase
  .from('taller_ingresos')
  .select(`
    id, fecha_ingreso, fecha_egreso, dias_en_taller,
    talleres(nombre),
    siniestros!inner(
      id, numero, placa, tipo_vehiculo, tipo_dano, descripcion, forma_pago,
      fecha_estimada_entrega, estado
    )
  `)
  .is('fecha_egreso', null)
  .not('siniestro_id', 'is', null)
  .gte('fecha_ingreso', mesInicio)
  .lte('fecha_ingreso', mesFin)
  .order('fecha_ingreso')

// Servicios activos en taller
const serviciosQ = supabase
  .from('taller_ingresos')
  .select(`
    id, fecha_ingreso, fecha_egreso, dias_en_taller,
    talleres(nombre),
    ordenes_servicio!inner(
      id, numero, placa, tipo_vehiculo, tipo_servicio, descripcion,
      fecha_estimada_entrega, estado
    )
  `)
  .is('fecha_egreso', null)
  .not('orden_servicio_id', 'is', null)
  .gte('fecha_ingreso', mesInicio)
  .lte('fecha_ingreso', mesFin)
  .order('fecha_ingreso')
```

Luego, **un segundo query** para traer la última nota de cada registro:

```javascript
// Últimas notas (1 por registro)
const ids = [...danos.map(d => d.siniestros.id), ...servicios.map(s => s.ordenes_servicio.id)]
const { data: notas } = await supabase
  .from('bitacora_actualizaciones')
  .select('siniestro_id, orden_servicio_id, nota, created_at')
  .or(`siniestro_id.in.(${danosIds.join(',')}),orden_servicio_id.in.(${serviciosIds.join(',')})`)
  .order('created_at', { ascending: false })

// Reducir: agrupar por id y quedarse con la primera (más reciente)
```

### Export CSV

```javascript
function exportarCSV(rows) {
  const headers = ['No','Placa','Tipo','Registro','Taller','Ingreso','Est. Salida','Días','Motivo','Observaciones']
  const csv = [
    headers.join(','),
    ...rows.map((r, idx) => [
      idx + 1,
      r.placa,
      r.tipo,
      r.tipoRegistro,
      r.taller,
      r.fechaIngreso,
      r.fechaEstSalida,
      r.dias,
      `"${r.motivo.replace(/"/g,'""')}"`,
      `"${r.observaciones.replace(/"/g,'""')}"`,
    ].join(','))
  ].join('\n')

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `reporte-diario-${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
```

### Imprimir

`window.print()` con CSS dedicado:

```css
@media print {
  .no-print { display: none !important; }
  .reporte-diario { font-size: 11px; }
  .reporte-diario table { page-break-inside: auto; }
  .reporte-diario tr { page-break-inside: avoid; }
}
```

Orientación recomendada: **horizontal A4** (el usuario lo selecciona en el diálogo de impresión).

---

## Decisiones tomadas

| # | Decisión | Justificación |
|---|----------|---------------|
| 1 | Tabla única `bitacora_actualizaciones` (no una por tipo) | Mismo schema, mismo comportamiento; reduce código duplicado |
| 2 | Append-only enforzado vía RLS (sin UPDATE/DELETE) | Garantiza auditoría inmutable; refuerza al `audit_log` |
| 3 | Sin límite hard de longitud en BD; UI limita a 500 chars | Suficiente para nota operacional; evita abusos |
| 4 | Reporte Diario embebido en Dashboard, no página aparte | Es lo que el usuario ve apenas entra; uso diario alto |
| 5 | Filtros toggle por tipo (Servicios/Daños) más mes | Replica el Excel, fácil de entender |
| 6 | Solo "actualmente en taller" (`fecha_egreso IS NULL`) | El propósito es operacional: qué está fuera HOY |
| 7 | Última nota de bitácora como OBSERVACIONES | Reemplaza el campo libre del Excel con algo trazable |
| 8 | Fallback de OBSERVACIONES si no hay bitácora | Para daños: `forma_pago`. Para servicios: "Gastos de Pass" |
| 9 | Bitácora visible para todos los autenticados | Trazabilidad transversal; sensibilidad baja |
| 10 | Solo `puedeEditar` puede agregar bitácora | Mismo gating que el resto de campos editables |

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Si hay muchos registros en taller, el query JOIN puede ser pesado | Filtro de mes obligatorio + índices en `fecha_ingreso` y `fecha_egreso` |
| Notas largas rompen el layout de la tabla | Truncar a 80 chars con tooltip al hover mostrando completa |
| Bitácora añade trabajo manual al operador | Es opcional; si no hay nota, se usa fallback automático |
| Imprimir en A4 vertical corta columnas | Default a horizontal en CSS print + instrucción en pantalla |
| El conteo de días que mostraba -1 en Excel | Nuestro `dias_en_taller` siempre es ≥ 0, ya correcto |

---

## Métricas de éxito

### Bloque 1 — Bitácora (modelo)
- [ ] Existe tabla `bitacora_actualizaciones` con RLS habilitado
- [ ] INSERT funciona con usuario autenticado y `puedeEditar = true`
- [ ] UPDATE y DELETE están bloqueados para todos (incluido admin) excepto vía service_role
- [ ] El trigger `audit_changes` registra cada INSERT en `audit_log`

### Bloque 2 — Bitácora (UI)
- [ ] Aparece sección colapsable en detalle de daño y de servicio, antes de "Historial de estados"
- [ ] Usuario con `puedeEditar` ve el input y botón "Agregar"
- [ ] Usuario sin `puedeEditar` solo ve el historial readonly
- [ ] Tras agregar, la nota aparece en la lista sin recargar
- [ ] Las notas se muestran en orden DESC (más reciente arriba)
- [ ] El contador de chars (0/500) se actualiza al escribir

### Bloque 3 — Reporte Diario
- [ ] Sección "Reporte Diario" aparece en el Dashboard
- [ ] Filtros toggle Servicios/Daños funcionan independientemente
- [ ] Filtro de mes cambia el conjunto mostrado
- [ ] Semáforo se pinta verde/ámbar/rojo según días
- [ ] Botón "Imprimir" abre el diálogo nativo con vista limpia
- [ ] Botón "Exportar CSV" descarga archivo con codificación correcta para tildes/eñes
- [ ] El total de filas refleja la realidad de Supabase
- [ ] Si un registro no tiene bitácora, OBSERVACIONES muestra el fallback

---

## Archivos a crear / modificar

### Crear
- `004_bitacora_actualizaciones.sql` — SQL del bloque 1
- `frontend/src/components/BitacoraActualizaciones.jsx`
- `frontend/src/components/ReporteDiario.jsx`

### Modificar
- `frontend/src/pages/Dashboard.jsx` — embeber `ReporteDiario`
- `frontend/src/pages/SiniestroDetalle.jsx` — embeber `BitacoraActualizaciones`
- `frontend/src/pages/ServicioDetalle.jsx` — embeber `BitacoraActualizaciones`
- `frontend/src/index.css` — reglas `@media print` específicas para `.reporte-diario`

---

## Orden de ejecución sugerido

1. **Bloque 1 (SQL)** — Crear `004_bitacora_actualizaciones.sql` y ejecutarlo en Supabase Studio. Verificar RLS y trigger.
2. **Bloque 2 (UI Bitácora)** — Crear `BitacoraActualizaciones.jsx`. Embeber en `SiniestroDetalle` y `ServicioDetalle`. Probar añadir y leer notas.
3. **Bloque 3 (Reporte Diario)** — Crear `ReporteDiario.jsx`. Embeber en `Dashboard`. Probar filtros, totales, CSV y print.
4. **Pruebas integrales**: dejar un daño y un servicio en taller, agregar notas, ver que aparezcan en el Reporte Diario.
5. Commit por bloque y push.

---

## Notas para futuro (Fase 3 opcional)

- Notificaciones automáticas cuando un vehículo lleva >5 días en taller
- Auto-actualización de bitácora cuando se cambia de estado (entrada con texto canned: "Vehículo ingresó a taller", "Vehículo egresó del taller")
- Filtros adicionales: por taller, por placa, por forma de pago
- Vista Kanban del Reporte Diario por taller
- Reporte semanal/mensual histórico (no solo actuales)
- Permitir editar la última nota de la bitácora durante los primeros 5 minutos tras crearla (curva de error humano)
