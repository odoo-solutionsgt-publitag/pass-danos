# Plan General — Fase 2

**Inicio**: 2026-05-28
**Cierre**: 2026-05-28
**Estado**: ✅ Completada en producción — ver [Plan_Cierre_Implementacion_Fase2.md](Plan_Cierre_Implementacion_Fase2.md)
**Fase anterior**: [Plan_Cierre_Implementacion_Fase1.md](Plan_Cierre_Implementacion_Fase1.md)

---

## Objetivo de Fase 2

Profundizar el control operacional del sistema: auditoría completa de todos los cambios, roles granulares por permiso, mejoras al flujo de cotizaciones, ampliación de catálogos y campos, gestión de anulados y un cierre formal con checklist de documentos.

---

## Subplanes de Fase 2

| # | Tema | Subplan | Status |
|---|------|---------|--------|
| A | Auditoría + Roles granulares (crear/editar/ver/eliminar) | [Plan_F2_A_Auditoria_Roles.md](Plan_F2_A_Auditoria_Roles.md) | ✅ |
| B | Datos del cliente (Contrato + fix DPI/NIT/teléfono/correo) | [Plan_F2_B_Datos_Cliente.md](Plan_F2_B_Datos_Cliente.md) | ✅ |
| C | Cotizaciones — re-agregar proveedor y editar después de aprobar | [Plan_F2_C_Cotizaciones_Mejoradas.md](Plan_F2_C_Cotizaciones_Mejoradas.md) | ✅ |
| D | Catálogo Talleres — multi-contacto + puesto por área | [Plan_F2_D_Catalogo_Talleres.md](Plan_F2_D_Catalogo_Talleres.md) | ✅ |
| E | Forma de pago en Daño (Cliente / PASS / Seguro) | [Plan_F2_E_Forma_Pago_Dano.md](Plan_F2_E_Forma_Pago_Dano.md) | ✅ |
| F | Tipos de servicio adicionales (6 nuevos) | [Plan_F2_F_Tipos_Servicio.md](Plan_F2_F_Tipos_Servicio.md) | ✅ |
| G | Fechas adicionales (Fecha Entrega Taller, etc.) | [Plan_F2_G_Fechas_Adicionales.md](Plan_F2_G_Fechas_Adicionales.md) | ✅ |
| H | Anulados invisibles para usuarios | [Plan_F2_H_Anulados_Invisibles.md](Plan_F2_H_Anulados_Invisibles.md) | ✅ |
| I | Descuento en líneas de detalle | [Plan_F2_I_Descuento_Lineas.md](Plan_F2_I_Descuento_Lineas.md) | ✅ |
| J | Checklist de documentos al cierre (Prefactura/Proforma/Factura) | [Plan_F2_J_Checklist_Documentos.md](Plan_F2_J_Checklist_Documentos.md) | ✅ |
| K | Simplificar `x_studio_status_vehiculo` a 3 valores (Disponible / En Mantenimiento / En Reparación) | [Plan_F2_K_Status_Vehiculo_Odoo.md](Plan_F2_K_Status_Vehiculo_Odoo.md) | ✅ |

---

## Orden recomendado de ejecución

```
Sprint 1 (foundation):
  → A. Auditoría + Roles  (bloqueante: define cómo se registra todo)
  → B. Datos del cliente  (corrección + extensión)

Sprint 2 (operacional):
  → C. Cotizaciones      (impacto diario alto)
  → I. Descuento líneas  (relacionado con C)
  → E. Forma de pago     (relacionado con cobro)

Sprint 3 (catálogos):
  → D. Talleres          (puesto por área para enrutar contactos)
  → F. Tipos de servicio (configuración)
  → G. Fechas adicionales

Sprint 4 (cierre):
  → J. Checklist documentos
  → H. Anulados invisibles
```

**Estimado total**: 8-12 sesiones de desarrollo (16-30 horas)

---

## Decisiones arquitectónicas para Fase 2

### Auditoría como pilar
Toda escritura (INSERT/UPDATE/DELETE) debe quedar registrada con:
- Quién (usuario_id de auth.users)
- Cuándo (timestamp)
- Qué cambió (campo, valor anterior, valor nuevo)
- Sobre qué tabla y qué fila

Mecanismo: trigger PostgreSQL genérico `audit_changes()` aplicado a todas las tablas relevantes, escribiendo en `audit_log` único.

### Roles granulares por permiso, no por categoría
Cambio del modelo actual (5 roles fijos) a modelo de permisos:
- `perfiles.permisos` → JSON con flags: `{ crear: true, editar: true, ver: true, eliminar: false }`
- Por defecto al crear vía SSO: `{ crear: false, editar: false, ver: true, eliminar: false }` (readonly)
- Solo `admin` puede modificar permisos de otros usuarios
- Conserva el campo `rol` para etiquetar pero la autoridad real son los flags

### Anulado = soft-delete con visibilidad cero
- El campo `estado = 'anulado'` sigue existiendo
- En frontend: TODAS las queries filtran `estado != 'anulado'`
- En reportes / KPIs: nunca cuenta anulados
- Solo el admin Supabase puede consultar anulados desde Supabase Studio
- No se hace DELETE físico para no romper integridad referencial ni perder auditoría

### Cotizaciones repetibles
- Levantar la restricción de "1 taller = 1 cotización por daño"
- Permitir N cotizaciones del mismo taller con diferentes "variantes" (Original / Genérico)
- Nuevo campo `cotizaciones.variante` con enum o text libre
- El comparador agrupa por taller + variante

### Edición de cotizaciones aprobadas
- Una cotización aprobada se puede re-editar líneas
- Cada edición registra en audit_log + opcionalmente versionado
- Cambios en `total_general` re-sincronizan `siniestros.costo_pass` automáticamente

---

## Cambios al modelo de datos previstos

### Nuevas tablas
- `audit_log` — auditoría universal
- `taller_contactos` — múltiples contactos por taller con puesto/área

### Modificaciones a tablas existentes
- `perfiles` — agregar `permisos JSONB`
- `siniestros` — agregar `forma_pago`, `fecha_entrega_taller`
- `ordenes_servicio` — agregar `fecha_entrega_taller`
- `cotizaciones` — agregar `variante`
- `cotizacion_lineas` — agregar `descuento NUMERIC(12,2)`, `tipo` enum extendido
- `orden_servicio_lineas` — análogo
- `cobros` / `ordenes_servicio` — flags `tiene_prefactura`, `tiene_proforma`, `tiene_factura` (auto-calculados desde documentos)

### Nuevos valores de enum
- `tipo_servicio_mant`: + `revision_general`, `enderezado_pintura`, `reposicion_llave`, `sistema_electrico`, `revision_ac`, `revision_inyeccion`

### Nuevas funciones SQL
- `audit_changes()` — trigger genérico
- `tiene_documento_de_tipo(orden_id, tipo)` — para checklist

---

## Riesgos identificados

| Riesgo | Mitigación |
|--------|------------|
| Audit_log crece sin control | TTL de 1 año + archivado mensual a tabla cold |
| Permisos granulares confunden al admin | UI clara con presets ("Solo lectura", "Operación completa", etc.) |
| Cotizaciones re-editables rompen historial financiero | Versionado opcional + snapshot al aprobar |
| Mezcla de "anulado oculto" con queries existentes | Aplicar filtro centralmente en helper hook `useSiniestros` / `useServicios` |
| Checklist documentos genera inconsistencias | Auto-calcular desde `documentos.tipo` en vez de flags manuales |

---

## Métricas de éxito Fase 2

- [ ] Todo cambio en daño/servicio queda en `audit_log` con usuario_id correcto
- [ ] Admin puede definir permisos granulares por usuario desde UI
- [ ] Los datos del cliente cargan completos (DPI/NIT/teléfono/correo) en el wizard
- [ ] Se puede pedir 2 cotizaciones al mismo taller (Original vs Genérico)
- [ ] Cotizaciones aprobadas se editan y el `costo_pass` se actualiza
- [ ] El catálogo de talleres tiene 3 contactos con puesto/área
- [ ] El registro de daño captura forma de pago
- [ ] La ficha de servicio acepta los 6 nuevos tipos
- [ ] Existe campo `fecha_entrega_taller` en daños y servicios
- [ ] Los anulados no aparecen en ninguna lista ni reporte
- [ ] Las líneas tienen subtotal con descuento aplicado
- [ ] Al cerrar un servicio, el checklist de documentos refleja la realidad
