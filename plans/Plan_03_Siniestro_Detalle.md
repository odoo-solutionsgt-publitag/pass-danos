# FASE 3 — Detalle de siniestro: máquina de estados + taller + timeline

**Estado**: ✅ Completado
**Depende de**: Fase 2

---

## Objetivo

Pantalla de detalle del daño que orquesta el ciclo de vida completo (`registrado` → `cerrado`), maneja ingreso/egreso al taller con sincronización a Odoo, y muestra el timeline de auditoría.

---

## Archivos

- [frontend/src/pages/SiniestroDetalle.jsx](../frontend/src/pages/SiniestroDetalle.jsx)

---

## Layout

1. **Header**: número grande, placa, marca/línea, badge de estado, botón "Volver".
2. **Card de cliente**: nombre, DPI, NIT, teléfono, email.
3. **Card del daño**: fecha, lugar, tipo, severidad, descripción.
4. **Sección Cotizaciones** (Fase 4 — visible si `estado === 'cotizando'`).
5. **Sección Proforma** (Fase 4 — visible si estado ≥ `proforma_emitida`).
6. **Sección Taller**: tabla de `taller_ingresos` con semáforo.
7. **Sección Timeline**: historial de `siniestro_timeline`.
8. **Botones de acción**: cambian según el estado actual.

---

## Máquina de estados

`ejecutarTransicion(nuevoEstado, opciones)` orquesta los efectos secundarios:

| De → A | Efectos en Supabase | Efecto en Odoo |
|--------|--------------------|----------------|
| `registrado` → `cotizando` | UPDATE estado | — |
| `proforma_aprobada` → `en_reparacion` | INSERT `taller_ingresos` con `fecha_ingreso=CURRENT_DATE` | PATCH status → **En Reparación** |
| `en_reparacion` → `reparado` | UPDATE `taller_ingresos.fecha_egreso=CURRENT_DATE` | PATCH status → **Disponible** |
| `reparado` → `en_cobro` | INSERT `cobros` con monto_cliente | — |
| `reparado` → `cerrado` (Pass) | INSERT `cobros` con `es_gasto_pass=true` | — |
| `reparado` → `cerrado` (seguro) | INSERT `cobros` con `es_seguro=true` | — |
| `en_cobro` → `cerrado` | — | — |
| cualquier → `anulado` | UPDATE estado | PATCH status → Disponible (si estaba en taller) |

---

## ConfirmModal

Antes de cualquier transición se muestra un modal con:
- Título de la acción
- Descripción de los efectos (qué tablas se tocan, qué pasa en Odoo)
- Botones Cancelar / Confirmar

---

## Sección Taller (semáforo)

Tabla con `fecha_ingreso`, `fecha_egreso`, `dias_en_taller`, `motivo`. El campo `dias_en_taller` se calcula via trigger `set_dias_en_taller()` en Supabase.

Semáforo de color:
- 0-2 días: verde
- 3-5 días: amarillo
- 6+ días: rojo

Vehículo aún en taller (sin `fecha_egreso`) → fondo amarillo claro.

---

## Sección Timeline

Lista los registros de `siniestro_timeline` (poblados por trigger). Cada item: icono según estado nuevo, fecha relativa, acción + detalle, usuario (si está disponible).

---

## Decisiones

- **Estado en frontend = espejo del estado en DB**: no hay máquina de estados en código; las transiciones válidas se determinan por qué botones se muestran (`if estado === 'reparado'`).
- **`useAuth` para gating**: el botón "Anular" solo aparece para `admin`/`agente_senior`.
- **Promise.all para load**: `siniestro + timeline + taller_ingresos` se cargan en paralelo.
- **PATCH Odoo es best-effort**: si falla, no rollback — el estado en Supabase ya cambió. Se loguea pero no se reverte. Para un sistema más estricto haría falta saga/2PC.

---

## Criterio de éxito (cumplido)

- [x] Se puede recorrer el flujo completo de un daño desde registrado hasta cerrado
- [x] Los días en taller se calculan correctamente
- [x] Cada transición pide confirmación
- [x] Odoo refleja los cambios de status del vehículo
- [x] El timeline registra todos los cambios automáticamente
