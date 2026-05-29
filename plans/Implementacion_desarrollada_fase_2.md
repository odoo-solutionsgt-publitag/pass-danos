# Implementación desarrollada — Fase 2

**Audiencia**: equipos de desarrollo que se incorporen al proyecto para continuarlo en Fase 3 o adelante.
**Versión**: 2026-05-28
**Estado del proyecto**: Fase 1 ✅ + Fase 2 ✅ — en producción.

Este documento NO es un changelog. Es una **guía técnica** para que un desarrollador pueda navegar el código, entender las decisiones arquitectónicas y agregar nuevas features sin romper las invariantes existentes.

Para ver el ESTADO de cada feature, ver [Plan_Cierre_Implementacion_Fase2.md](Plan_Cierre_Implementacion_Fase2.md).
Para ver QUÉ está construido en general, ver [CLAUDE.md](../CLAUDE.md).

---

## 1. Cold start — qué es este sistema en 90 segundos

App web externa para Pass Rent a Car Guatemala que reemplaza 4 archivos Excel manuales de daños y mantenimientos vehiculares. La app NO vive en Odoo — es una React + Express + Supabase que se comunica con Odoo 19 via XML-RPC.

```
React frontend (Vite, Tailwind 4)
  → llama directamente a Supabase JS para CRUD (RLS controla acceso)
  → llama al backend Express SOLO para operaciones que tocan Odoo

Express backend (Node 22, Dockerfile, no Nixpacks)
  → XML-RPC con Odoo (lectura de flota, contratos, escritura de status)
  → service_role hacia Supabase Auth Admin (creación de usuarios SSO)
  → firma JWTs HS256 para SSO de Odoo

Supabase
  → 11 tablas operacionales + audit_log
  → RLS con función has_permission() basada en perfiles.permisos JSONB
  → Storage bucket "documentos" privado, signed URLs

Odoo 19
  → product.template (vehículos), sale.order (contratos), res.partner (clientes), res.users (auth+x_can_access_danos)
  → módulo custom pass_gestion_danos (1 modelo extendido, 1 vista, 1 menú, 1 acción URL)
```

---

## 2. Mapa de archivos críticos

Si vas a tocar la parte X, mira aquí primero:

| Tema | Archivo principal |
|------|-------------------|
| Routing y rutas protegidas | [`frontend/src/App.jsx`](../frontend/src/App.jsx) |
| Auth + carga de perfil | [`frontend/src/hooks/useAuth.js`](../frontend/src/hooks/useAuth.js) |
| Permisos granulares | [`frontend/src/hooks/usePermisos.js`](../frontend/src/hooks/usePermisos.js) |
| Filtrado central de anulados | [`frontend/src/lib/queries.js`](../frontend/src/lib/queries.js) |
| Cliente Supabase del frontend | [`frontend/src/lib/supabase.js`](../frontend/src/lib/supabase.js) |
| Wrapper de calls al backend | [`frontend/src/lib/odoo-api.js`](../frontend/src/lib/odoo-api.js) |
| Sidebar con gating de admin | [`frontend/src/components/Sidebar.jsx`](../frontend/src/components/Sidebar.jsx) |
| Auditoría visible | [`frontend/src/components/HistorialCambios.jsx`](../frontend/src/components/HistorialCambios.jsx) |
| Checklist docs cierre | [`frontend/src/components/ChecklistCierre.jsx`](../frontend/src/components/ChecklistCierre.jsx) |
| Fechas taller | [`frontend/src/components/FechasTaller.jsx`](../frontend/src/components/FechasTaller.jsx) |
| Contactos por taller | [`frontend/src/components/TallerContactosEditor.jsx`](../frontend/src/components/TallerContactosEditor.jsx) |
| Documentos contextuales | [`frontend/src/components/DocumentosSection.jsx`](../frontend/src/components/DocumentosSection.jsx) |
| Cotizaciones (variantes, edición post-aprobada) | [`frontend/src/components/CotizacionesSection.jsx`](../frontend/src/components/CotizacionesSection.jsx) |
| Proforma | [`frontend/src/components/ProformaSection.jsx`](../frontend/src/components/ProformaSection.jsx) |
| Backend Express completo | [`backend/index.js`](../backend/index.js) |
| Módulo Odoo | [`odoo_addons/pass_gestion_danos/`](../odoo_addons/pass_gestion_danos/) |
| SQL inicial | [`db/db-esquema-260526.sql`](../db/db-esquema-260526.sql) |
| SQL Fase 1 — servicios | [`002_servicios_mantenimiento.sql`](../002_servicios_mantenimiento.sql) |
| SQL Fase 2 — todo el bloque | [`003_fase2.sql`](../003_fase2.sql) |

---

## 3. Decisiones arquitectónicas clave de Fase 2

### 3.1 Auditoría como trigger genérico — no como código aplicativo

**Decisión**: La auditoría vive en PostgreSQL como trigger genérico (`audit_changes()`), no en el código JavaScript.

**Por qué**:
- Un trigger en DB es imposible de evadir desde el cliente. Si alguien hace UPDATE directo en Supabase, el log queda igual.
- Centraliza en un solo punto: hay 1 función y 10 triggers, no 10 lugares con lógica de log.
- El JWT del usuario fluye al trigger via `auth.uid()` y `current_setting('request.jwt.claims')`, así que sabe quién hace el cambio.

**Cómo extender a una nueva tabla**:
```sql
CREATE TRIGGER audit_<tabla> AFTER INSERT OR UPDATE OR DELETE ON <tabla>
  FOR EACH ROW EXECUTE FUNCTION audit_changes();
```
Eso es todo. El trigger funciona reflexivamente con `to_jsonb(NEW)`.

**Gotcha**:
- El trigger ignora cambios al campo `updated_at` para no spam el log con cambios automáticos.
- Si quieres ignorar otros campos (ej. `last_login`), modifica la condición `key NOT IN ('updated_at')` en `audit_changes()`.
- El trigger es `SECURITY DEFINER` — corre con permisos del owner, así que puede escribir en `audit_log` aunque el usuario no tenga GRANT INSERT explícito ahí. Esto es intencional.

**Visualización**:
El componente `HistorialCambios` lo lee filtrando `tabla` + `fila_id`. Se renderiza colapsado por default y carga lazy al abrir.

### 3.2 Permisos granulares vs roles

**Decisión**: Reemplazamos el modelo "5 roles fijos" por un modelo de "4 flags booleanos por usuario".

**Por qué**:
- El cliente pidió flexibilidad: "Juan puede crear pero no eliminar, María puede ver y editar pero no crear".
- Los roles se quedan como **etiqueta visual** (admin / agente_senior / agente / operaciones / readonly) pero la autoridad real son los flags.

**Esquema**:
```sql
perfiles.permisos JSONB DEFAULT '{"crear": false, "editar": false, "ver": true, "eliminar": false}'
```

**Helper SQL**:
```sql
has_permission('crear') → BOOLEAN
```
Reemplaza el viejo `get_user_rol() IN ('admin', 'agente_senior', ...)` en las policies RLS.

**Hook frontend**:
```jsx
const { puedeCrear, puedeEditar, puedeVer, puedeEliminar, esAdmin } = usePermisos()
```

**Patrón de gating**:
```jsx
{puedeCrear && <button>+ Nuevo</button>}
```

**Importante para futuras features**:
- Si agregas una tabla nueva, las policies RLS deben usar `has_permission()`, NO el rol.
- Si agregas un botón nuevo de acción, envuélvelo con el flag correspondiente.
- Si agregas un nuevo concepto de permiso (ej. "exportar"), el sub-plan natural es agregar una clave más al JSONB de `permisos`. NO crear un sistema paralelo.

### 3.3 Anulados invisibles via helpers, no vistas SQL

**Decisión**: En lugar de crear VIEWs `siniestros_visibles` y refactorizar todas las queries, creamos helpers JavaScript en `lib/queries.js` que aplican `.neq('estado', 'anulado')` por defecto.

**Por qué**:
- Las vistas SQL no soportan bien INSERT/UPDATE desde Supabase JS — habría que dualizar tabla para escritura y vista para lectura.
- Los helpers permiten al desarrollador SABER cuándo está filtrando vs cuándo no (URL directa al detalle accede a la tabla cruda).
- Reportes y audit_log necesitan acceso completo — los helpers se SALTAN para esos casos.

**Patrón**:
```js
// En lugar de:
supabase.from('siniestros').select('*')

// Usar (para listas / KPIs / dashboards):
import { siniestrosQuery } from '../lib/queries'
siniestrosQuery('id,numero,placa')
```

**Casos donde NO usar el helper**:
- Detalle individual por ID (queremos accederlo aunque esté anulado, para preservar auditoría)
- Reportes que explícitamente quieran incluir anulados
- Backend admin queries en Supabase Studio

### 3.4 Cotizaciones editables tras aprobación

**Decisión**: Una cotización aprobada SÍ puede editarse. Su `costo_pass` y `margen` en el siniestro padre se sincronizan automáticamente via trigger.

**Por qué**:
- Caso de uso real de Pass: el taller cambia precios de última hora antes de empezar el trabajo. Forzar una nueva cotización es burocracia innecesaria.

**Trigger crítico** (en `003_fase2.sql`):
```sql
CREATE FUNCTION sync_costo_pass_from_approved_quote() ...
```
Se dispara en INSERT/UPDATE/DELETE de `cotizacion_lineas`. Si la cotización padre tiene `estado='aprobada'`, recalcula `siniestros.costo_pass = total_general` y `margen = monto_cliente - costo_pass`.

**Frontend**: muestra banner ámbar de advertencia cuando se edita una cotización aprobada para que el usuario entienda el side-effect.

**Gotcha**:
- Si en el futuro cambias el flujo de cotización para tener "histórico de versiones", deberás bypasear este trigger en el versionado.
- Si haces un INSERT bulk de cotización_lineas con muchas filas, el trigger se dispara por cada una. Considera batch update si el volumen es alto.

### 3.5 Variantes en cotizaciones (mismo taller × N)

**Decisión**: La columna `cotizaciones.variante TEXT` permite que el mismo `taller_id` aparezca múltiples veces en un mismo siniestro.

**Por qué**:
- Pass pide al mismo taller dos cotizaciones: una con repuestos Originales y otra con Genéricos. Eligen según presupuesto.

**Levantamos**: la restricción de unicidad `(siniestro_id, taller_id)` y el límite de "máx 3 cotizaciones". Ahora son N libres.

**UI**: el panel de solicitar es una lista de filas `{ taller_id, variante }`. El usuario puede agregar tantas filas como quiera.

**Comparador**: muestra todas las variantes lado a lado. La estrella ★ va siempre al `total_general` mínimo.

### 3.6 Descuento como ENUM, no como columna

**Decisión**: Agregamos `'descuento'` al enum `tipo_linea_cotizacion`. NO agregamos columna `descuento` separada.

**Por qué**:
- Pass dijo "quiero algo simple, el monto va a mano con signo negativo".
- Mantener un solo modelo de línea es más limpio que tener `subtotal - descuento`.
- El trigger de totales suma las líneas con tipo='descuento' en un campo separado (`total_descuentos`) para visualizar el desglose, pero el `total_general` ya las incluye correctamente porque sus subtotales son negativos.

**Convención**:
- En frontend, el `Plus` del editor no hace validación de signo. El usuario es responsable de escribir `-100`.
- El display en breakdown usa color rojo para que sea visualmente obvio.

### 3.7 Status del vehículo en Odoo — 3 valores únicamente

**Decisión** (Plan F2/K): la app solo emite 3 valores hacia `x_studio_status_vehiculo`:
- `'En Reparación'` — al ingresar un daño al taller
- `'En Mantenimiento'` — al ingresar cualquier servicio al taller
- `'Disponible'` — al salir del taller (cualquier motivo)

**Por qué**:
- El mapeo anterior por tipo de servicio era confuso (5/7 caían en "Servicios Varios").
- Pass quiere un dashboard de flota simple.

**Implementación**:
- `ServicioDetalle.jsx` exporta `STATUS_INGRESO_TALLER = 'En Mantenimiento'` constante.
- `SiniestroDetalle.jsx` usa `'En Reparación'` inline.
- Backend `/vehiculo/:id/status` valida el set ampliado de status (incluyendo "Servicios Varios" para retro-compat con valores ya seteados manualmente en Odoo), pero la app solo emite los 3.

### 3.8 SSO Odoo → Supabase con JWT firmado

**Decisión**: el backend firma un JWT compatible con Supabase (HS256 con `SUPABASE_JWT_SECRET`) y el frontend lo instala con `supabase.auth.setSession(jwt)`.

**Por qué**:
- Pass quiere que los usuarios entren con sus credenciales de Odoo (no manejar passwords paralelos).
- Mantener `supabase-js` directo desde el frontend (no mover todo el CRUD al backend).
- RLS sigue funcionando porque `auth.uid()` retorna el `sub` del JWT.

**Flujo**:
1. Usuario entra email+password en login
2. Backend `POST /auth/odoo` autentica con XML-RPC contra Odoo
3. Lee `res.users.x_can_access_danos` — si false, 403
4. Calcula UUID determinístico: `uuidv5("odoo:" + odoo_uid, NAMESPACE)`
5. Si es 1ra vez: crea `auth.users` y `perfiles` con rol readonly default
6. Firma JWT con `sub=userId`, `aud=authenticated`, exp=1h
7. Frontend llama `supabase.auth.setSession()` → la sesión queda instalada y `useAuth` la levanta

**Critical envs**:
- `SUPABASE_JWT_SECRET` debe ser el **Legacy JWT Secret** de Supabase (la tab "Legacy JWT Secret" en API Settings), NO una API key. Sin esto la firma no se valida.
- `SUPABASE_SERVICE_KEY` debe ser un `sb_secret_*` con permisos admin. Sin esto `auth.admin.createUser` falla con "Bearer token required".

**Gotcha**:
- Si Supabase migra completamente a ECC y revoca la legacy HS256, hay que reescribir esto usando el flujo de magic link (`admin.generateLink` + `verifyOtp`).
- El token vive 1 hora. No hay refresh real — al expirar, el usuario debe re-loguearse. Es a propósito (revocación rápida si Pass quita el checkbox en Odoo).

### 3.9 Filtro de flota (categ_id + tipo Cotización)

**Decisión**: `GET /vehiculos` filtra `categ_id=2 AND x_studio_tipo_de_vehiculo != 'Cotización'`.

**Por qué**:
- Odoo tiene otros productos que NO son vehículos.
- "Cotización" es un tipo de producto interno que no debe aparecer en Flota.

**Importante**:
- Si Pass agrega nuevas categorías de productos en Odoo, este filtro puede dejar de funcionar bien. Verificar `categ_id` cada vez que se agregue una categoría.
- El parseo del nombre del producto (`"P-006KXB TOYOTA PICK UP HI LUX 2025"`) asume un formato. Si el formato cambia en Odoo, el parser en `backend/index.js` debe actualizarse.

---

## 4. Patrones de código a respetar

### 4.1 Hooks composition para gating

```jsx
import { usePermisos } from '../hooks/usePermisos'

function MiComponente() {
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos()
  // ...
  return (
    <>
      {puedeCrear && <button>+ Nuevo</button>}
      {puedeEditar && <button>Editar</button>}
      {puedeEliminar && <button>Eliminar</button>}
    </>
  )
}
```

NO uses `perfil.rol === 'admin'` para gating de operaciones. Eso es etiqueta. Usa los flags.

### 4.2 Carga de datos con queries centralizadas

```jsx
// CORRECTO (listas)
import { siniestrosQuery } from '../lib/queries'
const { data } = await siniestrosQuery('id,numero,placa').order('created_at').limit(100)

// INCORRECTO (filtra anulados a mano cada vez — error-prone)
const { data } = await supabase.from('siniestros').select('id,numero,placa').neq('estado', 'anulado')

// CORRECTO (detalle por ID — queremos acceder aunque esté anulado)
const { data } = await supabase.from('siniestros').select('*').eq('id', id).single()
```

### 4.3 Componentes contextuales reutilizables

Los componentes de Fase 2 (`HistorialCambios`, `ChecklistCierre`, `FechasTaller`, `DocumentosSection`, `TallerContactosEditor`) reciben **props mínimas** y manejan su propio CRUD via Supabase JS.

Patrón general:
```jsx
<MiComponenteContextual
  tabla="siniestros"
  registroId={siniestro.id}
  valores={{ /* solo los campos relevantes */ }}
  onUpdate={() => loadAll()}  // callback opcional
/>
```

Este patrón:
- Aísla la lógica del componente padre
- Permite reuso en detail de daño Y de servicio sin duplicar
- Cada componente sabe leer/escribir SUS campos
- El padre solo decide DÓNDE renderizarlo

### 4.4 RLS y service_role

**Cuándo usar cada uno**:
- Frontend (con sesión de usuario) → siempre Supabase JS directo. RLS controla acceso.
- Backend cron/admin → `SUPABASE_SERVICE_KEY` con `supabase.auth.admin.*` para bypassear RLS.
- Backend acciones por cuenta del usuario → service_role + escribir como si fuera el usuario (passing JWT). Por ahora no lo hacemos.

**Importante**: el endpoint `/auth/odoo` usa service_role para crear `auth.users` porque solo admin puede crear usuarios. Pero los datos subsecuentes (lectura/escritura) los hace el frontend con la sesión del usuario.

### 4.5 Cuando hacer cambio a Odoo

Patrón actual:
1. Frontend toca Supabase (INSERT/UPDATE)
2. Si la acción requiere reflejarse en Odoo, llama al backend con `updateVehiculoStatus()` o `syncBitacora()`
3. Llamada al backend es **best-effort** (`.catch(console.warn)`) — si Odoo está caído, la app sigue funcionando

**Por qué best-effort**: Odoo a veces es lento. No queremos bloquear al usuario en una llamada de 5 segundos para actualizar un campo secundario.

**Si en Fase 3 necesitas garantizar consistencia**, considera:
- Webhook que reintenta
- Cola en tabla `pending_odoo_sync` con job de Express
- Outbox pattern

Pero hoy no es necesario; los casos de uso lo aguantan.

---

## 5. Cosas a NO hacer (pitfalls aprendidos)

### 5.1 No agregar policies sin GRANT explícito al service_role
En proyectos nuevos de Supabase (con sb_secret_*), el service_role NO bypassea automáticamente. Hay que correr:
```sql
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
```
Si una tabla nueva no tiene GRANT, el backend con service_role la verá como "permission denied for table X".

### 5.2 No mezclar SUPABASE_JWT_SECRET con SUPABASE_SERVICE_KEY
Son cosas distintas:
- `SUPABASE_JWT_SECRET` = Legacy JWT Secret, para firmar tokens (HS256)
- `SUPABASE_SERVICE_KEY` = `sb_secret_*`, para llamadas admin

Si los confundes, ves errores tipo "invalid JWT signature" o "Bearer token required". Diagnóstico estándar: el primero NUNCA empieza con `sb_`, el segundo SIEMPRE empieza con `sb_secret_`.

### 5.3 No olvidar updated_at al hacer UPDATE manual
Las tablas tienen trigger `trg_<tabla>_updated` BEFORE UPDATE que setea `updated_at = now()`. Si por error desactivas el trigger en una migración, se descalibra.

### 5.4 No filtrar anulados en queries de admin
Si el admin quiere VER los anulados en Supabase Studio, debe usar la tabla cruda (no las queries centralizadas del frontend). Esto es a propósito — el frontend siempre filtra, el admin elige.

### 5.5 No emitir status no soportados a Odoo
El campo `x_studio_status_vehiculo` es selection con valores específicos. Si emites un valor que no existe, Odoo lo rechaza silenciosamente y el campo no cambia. Lista válida:
- Disponible, Rentado, En Reparación, En Mantenimiento, Servicios Varios, Vehículo No Asegurado, Asignado al personal, No aplica

Plan F2/K limita lo que la app emite a 3, pero la lista válida sigue siendo más amplia.

### 5.6 No olvidar el filtro de categoría en `/vehiculos`
El endpoint filtra `categ_id=2` (categoría Vehículos). Si Pass crea nuevas categorías, este número podría cambiar. Verificar en Odoo Settings → Products → Categories.

### 5.7 ALTER TYPE ADD VALUE no se puede usar inmediatamente en la misma transacción
PostgreSQL impide:
```sql
ALTER TYPE tipo_servicio_mant ADD VALUE 'nuevo_tipo';
INSERT INTO ordenes_servicio (tipo_servicio) VALUES ('nuevo_tipo');  -- FALLA
```
Hay que ejecutar el ALTER en un transacción separada (Supabase Editor lo hace bien si los ejecutas como statements separados).

### 5.8 El trigger de auditoría se dispara también en migraciones
Si haces UPDATE masivo en una migración (ej. backfill de un campo), el `audit_log` se llena con N filas por UPDATE. Para migraciones grandes, desactivar el trigger temporalmente:
```sql
ALTER TABLE siniestros DISABLE TRIGGER audit_siniestros;
-- ... bulk update ...
ALTER TABLE siniestros ENABLE TRIGGER audit_siniestros;
```

---

## 6. Cómo agregar features sin romper invariantes

### Agregar una nueva tabla operacional

1. SQL: crear la tabla + ENABLE RLS + policies basadas en `has_permission()`
2. SQL: agregar trigger de auditoría
3. SQL: GRANT al service_role
4. SQL: trigger de updated_at si tiene ese campo
5. Frontend: si la tabla tiene "registro anulado", agregar helper en `lib/queries.js`
6. Frontend: si tiene historial, embeber `<HistorialCambios tabla="nueva" filaId={r.id} />`
7. Si requiere reflejar en Odoo, helper en `backend/index.js` + cliente en `lib/odoo-api.js`

### Agregar un nuevo permiso

1. Inventar la clave del flag (ej. "exportar")
2. Migrar `perfiles.permisos` para agregar la clave con default false
3. Actualizar las policies RLS afectadas con `has_permission('exportar')`
4. Actualizar `usePermisos.js` para exponer la prop
5. Agregar al editor de permisos en `Usuarios.jsx`
6. Aplicar gating donde corresponda

### Agregar un nuevo estado

1. SQL: `ALTER TYPE estado_X ADD VALUE 'nuevo'` en transacción separada
2. Actualizar `ESTADO_LABELS`, `ESTADO_COLORS` y `ESTADO_ICON` en TODOS los archivos:
   - `Siniestros.jsx`, `SiniestroDetalle.jsx`, `BitacoraVehiculo.jsx`, `Reportes.jsx`, `FichaSiniestroPrint.jsx`, `Proformas.jsx`, `Dashboard.jsx`
   - (análogos para servicios)
3. Si tiene reglas de transición, actualizar la lógica de botones en el Detalle
4. Si tiene efecto en Odoo, actualizar el handler de transición

### Agregar una nueva integración con Odoo

1. Helper en `backend/index.js` que use `odooExecute(uid, model, method, args)` (usa el API user por default)
2. Si necesita autenticar con el usuario final, usar `odooAuthenticateAs(login, password)`
3. Exponer endpoint en Express
4. Wrapper en `frontend/src/lib/odoo-api.js`
5. Llamada desde el componente con `.catch(console.warn)` si es best-effort

---

## 7. Cosas que NO están construidas (oportunidades de Fase 3)

### Funcionalidad
- **Notificaciones**: cuando un daño cambia de estado, no se notifica a nadie. Habría que agregar email/push.
- **Workflow de aprobación multinivel**: hoy `requiere_autorizacion` es boolean; podría escalarse a un workflow de 2-3 niveles.
- **FEL real con Infile**: hoy `cobros` es solo bitácora. La emisión real de factura electrónica se hace en Odoo separadamente.
- **Bulk operations**: no se pueden marcar múltiples documentos a la vez, ni anular varios daños.
- **Export PDF nativo**: hoy es `window.print()`. Una librería como react-pdf daría más control.
- **Mobile primero**: la app es desktop-first con responsive básico. UX mobile podría mejorar.

### Técnico
- **Refresh token real para SSO**: hoy el JWT muere a la hora y obliga re-login. Habría que implementar refresh.
- **Realtime con Supabase Realtime**: cuando alguien cambia algo, otros usuarios no ven el cambio hasta que recargan.
- **i18n**: la app está hardcoded en español. Pass podría querer inglés para reportes a HQ.
- **Tests automatizados**: no hay tests. Cualquier refactor profundo se beneficiaría de E2E con Playwright al menos en los flujos críticos.
- **TypeScript**: el frontend es JS. Migrar a TS daría mejor seguridad en componentes que reciben muchas props.
- **CI/CD**: hoy el deploy es manual via Coolify. Un GitHub Action con auto-deploy en main estaría bien.
- **Observabilidad**: no hay APM ni log centralizado. Errores del backend solo se ven en logs de Coolify.

### Datos
- **audit_log particionado por fecha**: si crece a millones de filas, queries lentas.
- **Snapshot de cotizaciones aprobadas**: hoy si editas una aprobada, pierdes la versión anterior. Para auditoría más rica, considerar tabla `cotizacion_versiones`.
- **Indicador de "anulados visibles"**: hoy ese registro está oculto al 100%. El admin podría querer ver una "papelera" desde la UI.

---

## 8. Cómo bootear el proyecto en local (si Fase 3 lo necesita)

Hoy todo se desarrolla contra producción. Para un dev local serio:

### Backend
```bash
cd backend
npm install
# Crear .env con las variables de Coolify
node index.js
```

### Frontend
```bash
cd frontend
npm install
# Crear .env.local con VITE_*
npm run dev
```

### Supabase
- Hoy todos los devs comparten la BD de producción.
- Para Fase 3, recomiendo crear un proyecto Supabase de staging y replicar:
  - `db/db-esquema-260526.sql` → schema base
  - `002_servicios_mantenimiento.sql` → servicios
  - `003_fase2.sql` → Fase 2
  - GRANTs explícitos
  - Bucket `documentos` con MIME types
  - Datos seed mínimos (1 admin user en perfiles + 1-2 talleres)

### Odoo
- Imposible replicar para dev local. Usar el de producción con un usuario API de pruebas.
- Para test de SSO, crear un usuario de prueba con `x_can_access_danos=true`.

---

## 9. Glosario rápido

| Término | Significado |
|---------|-------------|
| Siniestro / Daño | Mismo concepto. La tabla se llama `siniestros`, en UI se muestra como "Daños" |
| Orden de servicio | Servicio de mantenimiento. Tabla `ordenes_servicio` |
| Bitácora del vehículo | URL única por placa con el expediente: `/bitacora/<placa>` |
| SSO | Single Sign-On contra Odoo via `/auth/odoo` |
| RLS | Row Level Security de PostgreSQL/Supabase |
| Variante | Etiqueta de cotización para distinguir misma combinación taller+siniestro (Original/Genérico) |
| `audit_log` | Bitácora universal de cambios. Lo poblan los triggers `audit_*` |
| `has_permission('crear')` | Función SQL que retorna si el usuario actual tiene ese permiso |
| `usePermisos()` | Hook React que envuelve `perfiles.permisos` |
| Bloqueada (cotización) | `cot.estado === 'rechazada'` — no editable. Aprobada SÍ es editable |
| Anulado | `estado='anulado'` en siniestros o `'cancelado'` en ordenes_servicio — invisible en UI |

---

## 10. Contactos y referencias

- **Repo**: `odoo-solutionsgt-publitag/pass-danos`
- **Frontend prod**: https://gestion-danos.odoo-server.online
- **Backend prod**: https://api-danos.odoo-server.online
- **Supabase**: proyecto `cxoqviwdryvjahykazpb`
- **Odoo prod**: https://odoo-server.online (DB `odoo19server`)
- **Coolify**: VPS Contabo (mismo que `pass-ficha-digital`)

Si necesitas el patrón de referencia inicial (cómo Pass desarrolla apps externas), ver el proyecto hermano `pass_ficha_digital` en el mismo `odoo-dev/`.

---

## 11. Resumen para un nuevo dev en 30 segundos

1. **Es React + Express + Supabase**, NO Odoo. Odoo es la fuente de verdad de flota y clientes.
2. **Auth es SSO desde Odoo** vía backend que firma JWT compatible con Supabase. El admin tiene cuenta nativa Supabase como break-glass.
3. **Permisos son flags JSONB** (`crear/editar/ver/eliminar`), NO roles. El rol es solo etiqueta.
4. **Auditoría es automática** via trigger PostgreSQL. NO escribir manualmente en `audit_log`.
5. **Anulados son invisibles** en UI via helpers en `lib/queries.js`. Detalle por URL directa SÍ funciona.
6. **Cotizaciones aprobadas son editables** — el trigger sincroniza `costo_pass` automáticamente.
7. **Para listas usa helpers de queries; para detalle por ID usa supabase-js directo**.
8. **Para cambios en Odoo, llama al backend** vía `lib/odoo-api.js`. Best-effort, no bloquees al usuario.
9. **Los componentes Fase 2 son reutilizables** y manejan su propio CRUD — solo pasa `tabla`, `registroId` y `valores`.
10. **NUNCA crees roles paralelos ni filtros paralelos**. Extiende lo que existe.

Suerte. El sistema está limpio y la arquitectura aguanta crecimiento si se respetan los patrones de arriba.
