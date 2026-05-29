# Cierre de Implementación — Fase 2

**Proyecto**: Pass Daños — Sistema de Gestión de Daños y Mantenimiento Vehicular
**Cliente**: Pass Rent a Car Guatemala (Gold Travel Corps, S.A.)
**Período de desarrollo**: 2026-05-28 → 2026-05-28 (1 sesión intensiva)
**Estado final**: ✅ Fase 2 completada en producción
**Fase anterior**: [Plan_Cierre_Implementacion_Fase1.md](Plan_Cierre_Implementacion_Fase1.md)

---

## Resumen ejecutivo

Fase 2 transformó el sistema de un MVP funcional en una plataforma operacional madura con:
- **Auditoría completa** de toda escritura (audit_log con trigger genérico en 10 tablas)
- **Permisos granulares** por usuario (Crear / Editar / Ver / Eliminar) con UI de administración
- **Cotizaciones con variantes** (mismo taller con Original/Genérico) y edición post-aprobación
- **Talleres multi-contacto** con 7 áreas funcionales
- **Documentación al cierre** con checklist manual
- **Mayor granularidad** en estados de vehículo y tipos de servicio

Se ejecutó en una sola sesión de trabajo intensiva siguiendo el roadmap optimizado del plan general.

---

## Inventario de subplanes ejecutados

| # | Subplan | Status | Notas |
|---|---------|--------|-------|
| A | Auditoría + Roles granulares | ✅ | Trigger genérico + perfiles.permisos JSONB + página /usuarios |
| B | Datos del cliente | ✅ | Endpoint refresh-cliente + línea "Contrato" en card |
| C | Cotizaciones con variantes | ✅ | Sin límite de N + edición post-aprobada + sync automático |
| D | Catálogo Talleres multi-contacto | ✅ | 7 áreas + máx 3 + trigger constraint en DB |
| E | Forma de pago en Daño | ✅ | Cliente / PASS / Seguro como radio cards |
| F | 6 nuevos tipos de servicio | ✅ | Aplicados en todas las pantallas |
| G | 3 fechas adicionales de taller | ✅ | Card editable con semáforo de retraso |
| H | Anulados invisibles | ✅ | Helpers centralizados en lib/queries.js |
| I | Descuento como tipo de línea | ✅ | Simplificado: enum 'descuento', monto manual con signo negativo |
| J | Checklist manual de documentos | ✅ | 3 booleanos por registro, sin bloqueo |
| K | Status vehículo simplificado | ✅ | Todos los servicios → "En Mantenimiento" |

---

## Cambios técnicos por capa

### Base de datos (SQL — `003_fase2.sql`)

**Nuevas tablas**:
- `audit_log` — auditoría universal con índices y RLS
- `taller_contactos` — 3 contactos por taller con 7 áreas

**Nuevas funciones**:
- `audit_changes()` — trigger genérico aplicado a 10 tablas
- `has_permission(text)` — helper para policies basadas en permisos
- `sync_costo_pass_from_approved_quote()` — sincronización automática
- `limit_taller_contactos()` — enforce máx 3 contactos
- `unique_taller_principal()` — solo 1 principal por taller

**Nuevos enums**:
- `area_contacto` — 7 valores
- `forma_pago_dano` — 3 valores
- `tipo_servicio_mant` — +6 valores (extendido)
- `tipo_linea_cotizacion` — +1 valor ('descuento')
- `tipo_documento` — +1 valor implícito ('prefactura' considerado)

**Nuevas columnas**:
- `perfiles.permisos JSONB`
- `siniestros.forma_pago` + 3 fechas + 3 booleanos checklist + `cliente_nit` (de Fase 1)
- `ordenes_servicio.*` paralelo a siniestros para fechas/checklist
- `cotizaciones.variante` + `cotizaciones.total_descuentos`
- `ordenes_servicio.total_descuentos`

**Triggers nuevos o modificados**:
- 10 triggers `audit_*` (uno por tabla)
- `trg_sync_costo_pass` en cotizacion_lineas
- `trg_taller_contactos_updated`, `trg_limit_taller_contactos`, `trg_unique_taller_principal`
- `actualizar_totales_cotizacion()` y `actualizar_totales_orden_servicio()` actualizados (incluyen descuentos)

**Policies RLS**:
- Reemplazadas todas las que usaban `get_user_rol() IN (...)` por `has_permission('crear|editar|eliminar')`

### Backend (`backend/index.js`)

**Cambios**:
- `ensureSupabaseUser` ahora crea perfiles con `rol='readonly'` y permisos `{ ver: true, resto: false }`
- Nuevo endpoint `POST /siniestros/:id/refresh-cliente` que re-extrae datos del partner desde Odoo
- Aplicado Plan F2/K: `STATUS_INGRESO_TALLER = 'En Mantenimiento'` (todos los servicios)

### Frontend

**Nuevos componentes reutilizables** (en `src/components/`):
- `HistorialCambios.jsx` — visor colapsable de audit_log
- `ChecklistCierre.jsx` — 3 checkboxes manuales con feedback visual
- `FechasTaller.jsx` — card editable con 3 fechas + semáforo
- `TallerContactosEditor.jsx` — editor inline con form de 7 áreas y máx 3

**Nuevo hook** (`src/hooks/`):
- `usePermisos.js` — wrap de perfiles.permisos con propiedades booleanas

**Nueva librería** (`src/lib/`):
- `queries.js` — helpers `siniestrosQuery()` y `ordenesServicioQuery()` que filtran anulados centralmente

**Nueva página**:
- `Usuarios.jsx` — CRUD de permisos por usuario con 4 presets

**Páginas/componentes modificados** (resumen):
- Layout, Sidebar, useAuth (sin cambios pero conserva carga de permisos)
- Siniestros, Servicios, Dashboard, BitacoraVehiculo, FlotaVehicular, Proformas → usan queries centralizadas
- SiniestroNuevo → agrega forma_pago + redirect si !puedeCrear
- ServicioNuevo → 6 nuevos tipos + redirect si !puedeCrear
- SiniestroDetalle → forma_pago badge + 3 secciones nuevas (Fechas/Checklist/Historial) + botón Refrescar cliente
- ServicioDetalle → 3 secciones nuevas + uso de STATUS_INGRESO_TALLER fijo
- CotizacionesSection → panel de solicitar con variantes, edición post-aprobada, descuentos
- ProformaSection → variante en header, descuentos en breakdown, timestamp
- Catalogos → embebe TallerContactosEditor
- FichaSiniestroPrint y FichaServicioPrint → forma_pago, fechas, checklist, descuentos, variante
- Gating de permisos aplicado en TODOS los botones de acción de toda la app

### Variables de entorno
Sin cambios (mismo set de Fase 1).

---

## Ruta de ejecución

```
Etapa 0 — Decisiones (1 sesión, no código)
   ↓
Etapa 1 — SQL único (003_fase2.sql, ejecutado en Supabase Editor)
   ↓
Etapa 2 — Backend (1 sesión, 1 deploy)
   ↓
Sprint 3A — Hooks + Página Usuarios (1 sesión, 1 deploy frontend)
   ↓
Sprint 3B — Gating de permisos en todos los botones
   ↓
Sprint 3C-1 — Componentes reutilizables + filtros anulados
   ↓
Sprint 3C-2 — Cotizaciones variantes + refresh cliente
   ↓
Sprint 3D — Forma pago + 6 tipos servicio + contactos + fichas
   ↓
Etapa 4 — Pruebas, doc, cierre (este documento)
```

**Total**: 6 sprints + 2 etapas iniciales + 1 cierre = 9 unidades de trabajo. Todo realizado en una sola sesión intensiva.

---

## Matriz de pruebas por rol

### Usuario con preset "Solo lectura" (`permisos: { ver: true }`)

| Acción | Esperado |
|--------|---------|
| Login SSO Odoo (con `x_can_access_danos=true`) | Entra ✅ |
| Sidebar | NO ve "Administración / Usuarios" |
| Header | NO ve botones "+Nueva orden" ni "+Nuevo Daño" |
| Lista Siniestros | Ve datos. NO ve botón "Registrar daño" |
| Detalle daño | NO ve botones transición. NO ve "Anular". NO puede tocar Checklist ni Fechas. Ve Historial cambios. |
| Cotizaciones | Visibles, sin botón "Solicitar a taller" ni "Aprobar". Sin trash. |
| ProformaSection | Input monto_cliente readonly, sin botón Guardar |
| Documentos | Sin "Subir". Sin eliminar. Sí puede descargar. |
| Catálogos | Tab "Solo lectura". Sin botones "+ Nuevo" ni Edit |
| URL directa `/siniestros/nuevo` | Redirect a `/siniestros` |
| URL directa `/usuarios` | Redirect a `/` |

### Usuario con preset "Operación" (`{ crear, editar, ver }`)

| Acción | Esperado |
|--------|---------|
| Header | Ve botones de crear |
| Lista | Ve botón "Registrar daño" |
| Detalle daño | Ve botones transición de estado. NO ve "Anular". Edita líneas. NO ve trash. |
| Cotizaciones | Solicita + agrega líneas. NO elimina líneas existentes. Aprueba. |
| ProformaSection | Edita monto_cliente |
| Documentos | Sube. NO elimina. Descarga. |
| Catálogos | Ve botones "+ Nuevo" y Editar |

### Usuario con preset "Supervisor" (`todos los permisos`)

Igual que Operación + puede Anular daños, Cancelar servicios, eliminar líneas, eliminar documentos, eliminar talleres/repuestos.

### Usuario `admin`

Todo + página `/usuarios` accesible + gestión de permisos de otros usuarios.

---

## Pruebas funcionales clave

### Auditoría
1. Crear un daño → debe aparecer una fila INSERT en `audit_log` con tabla='siniestros'
2. Editar el `monto_cliente` desde proforma → UPDATE registrado con campo='monto_cliente' y valor anterior/nuevo
3. Anular un daño → UPDATE con campo='estado'
4. En el detalle del daño, abrir "Historial de cambios" → debe mostrar los eventos en orden inverso

### Cotizaciones con variantes
1. Crear un daño en `cotizando`
2. Solicitar a GRUPO Q (variante "Original") + GRUPO Q (variante "Genérico") + REASA
3. Verificar 3 cards separadas con badges índigo de variantes
4. Agregar líneas a cada una (incluir una línea tipo "Descuento" con monto negativo)
5. Aprobar GRUPO Q "Original" → otras pasan a rechazada
6. Editar una línea de la aprobada → el `costo_pass` del siniestro se actualiza automáticamente (verificar en proforma)

### Anulados invisibles
1. Anular un daño
2. Verificar que desaparece de: Dashboard, Lista Daños, BitacoraVehiculo, Drawer Flota, Proformas, Reportes
3. URL directa al detalle del daño anulado → debe seguir abriendo (auditoría preservada)
4. Confirmar en Supabase Studio que el registro existe con `estado='anulado'`

### Permisos granulares
1. Admin entra a `/usuarios`
2. Edita un usuario, aplica preset "Solo lectura", guarda
3. Ese usuario al entrar no ve botones de crear/editar
4. Admin lo cambia a "Operación", el usuario al recargar ya ve los botones

### Multi-contacto en talleres
1. Catálogos → editar COFIÑO / CAES
2. Agregar 1er contacto (Mecánica, principal) → 2do (Facturas) → 3ro (Gerencia)
3. Intentar agregar 4to → debe rechazar con error claro

### Forma de pago + flujo de cierre
1. Crear daño con forma_pago="PASS"
2. Llevarlo a estado `reparado`
3. Aparece la sección Checklist de cierre vacía
4. Marcar Prefactura → guarda automáticamente
5. Imprimir ficha → ver badge "Paga: PASS" + checklist con marca verde en Prefactura

### Tipos de servicio
1. Crear servicio tipo "Enderezado / Pintura" → debe marcar requiere_autorizacion=true
2. Capturar `autorizado_por` y enviar a taller
3. Status del vehículo en Odoo cambia a "En Mantenimiento"
4. Completar servicio → status vehículo → "Disponible"

---

## Métricas de Fase 2

| Métrica | Valor |
|---------|-------|
| Commits totales | ~15 |
| Líneas SQL agregadas | ~580 (`003_fase2.sql`) |
| Componentes nuevos | 4 reutilizables + 1 página |
| Hooks nuevos | 1 |
| Endpoints backend agregados | 1 |
| Triggers DB agregados | 14 |
| Tablas nuevas | 2 |
| Páginas/componentes modificados | 18 |
| Tiempo de desarrollo | 1 sesión intensiva |

---

## Hand-off operacional (qué saber para mantener)

### Asignar permisos a un usuario
- Admin → menú "Usuarios" → ✏ junto al usuario → modal con presets o checklist individual → Guardar

### Quitar acceso a un usuario
- En Odoo: desactivar checkbox `x_can_access_danos` en su ficha → no puede volver a entrar
- En la app: desactivar perfil en `/usuarios` (toggle Activo)
- Para forzar cierre inmediato de sesión: en Supabase Auth → users → revocar/banear

### Crear un taller con sus contactos
- Catálogos → tab Talleres → "+ Nuevo taller"
- Guardar el taller (con datos básicos: nombre, dirección, etc.)
- Vuelve a abrir el taller (Editar) → ahora el bloque "Contactos" aparece al final
- Agregar hasta 3 contactos con sus áreas

### Marcar el checklist de documentos
- En cualquier daño/servicio cerrado (o casi), el checklist aparece sobre los documentos
- El responsable marca cada item conforme va subiendo los PDFs
- Es marcado MANUAL — el sistema no detecta automáticamente uploads
- Si todos marcados: fondo verde. Si falta alguno: ámbar.

### Re-extraer datos del cliente
- En detalle de daño → card Cliente → botón "Refrescar"
- Si los datos del partner cambiaron en Odoo después de registrar el daño, esta acción los actualiza

### Auditar quién hizo qué
- En cualquier detalle de daño/servicio, scroll al final → "Historial de cambios"
- Expandir → ver todas las modificaciones con usuario + timestamp
- Para auditoría más amplia: query directa a `audit_log` en Supabase Studio

---

## Decisiones registradas para mantenimiento futuro

1. **Anulados NUNCA se borran físicamente**. Solo invisibles en UI. Para limpieza, hacer query desde Supabase Studio.
2. **`audit_log` puede crecer significativamente**. Considerar partición por fecha o limpieza periódica de entradas > 1 año si la tabla se vuelve grande.
3. **El `usuario_email` en audit_log es snapshot**. Si el usuario cambia su email después, el log mantiene el email histórico.
4. **El rol legacy en perfiles** queda solo como etiqueta visual. La autoridad real son los `permisos`.
5. **Cuando se edita una cotización aprobada**, el `costo_pass` del siniestro se sincroniza automáticamente vía trigger. El `monto_cliente` y `margen` también. No tocar manualmente.
6. **Descuento como tipo de línea**: el monto se ingresa MANUALMENTE con signo negativo. El trigger no lo invierte automáticamente. Decisión deliberada por simplicidad.
7. **Los servicios siempre marcan "En Mantenimiento"** en Odoo (cualquier tipo). No hay diferenciación por tipo después de Plan F2/K.
8. **El SSO de Odoo crea usuarios como readonly** por defecto. El admin debe promoverlos individualmente.

---

## Roadmap potencial Fase 3 (no planificada aún)

Puntos no abordados que podrían entrar en una siguiente fase:
- Notificaciones (email/push cuando un daño cambia de estado)
- Conciliación FEL real (integración con Infile API)
- Reportes avanzados (predicciones, comparativos entre talleres)
- Mobile-first responsivo más profundo
- Bulk operations (ej. marcar múltiples documentos)
- Export PDF nativo (sin window.print())
- Búsqueda full-text en audit_log con filtros avanzados
- Workflow de aprobación multinivel para servicios mayores

Pero todas son mejoras, NO requerimientos críticos. El sistema actual es operacional al 100%.

---

## Cierre

**Fase 2 cerrada exitosamente**. El sistema está en producción con todas las características planificadas. Pass Rent a Car puede:
- Registrar daños y servicios con trazabilidad completa
- Aprobar y editar cotizaciones (incluso después de aprobadas)
- Gestionar talleres con multi-contacto y áreas
- Asignar permisos granulares a su equipo
- Auditar quién hizo qué cuándo
- Imprimir fichas completas con toda la información financiera
- Ocultar registros anulados sin perder la auditoría

El sistema está listo para uso pleno en producción.
