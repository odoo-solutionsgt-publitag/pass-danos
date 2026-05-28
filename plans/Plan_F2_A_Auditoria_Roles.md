# Fase 2 / A — Auditoría + Roles granulares

**Estado**: 📋 Pendiente
**Prioridad**: **Alta** (bloqueante para sprints posteriores)
**Estimado**: 2-3 sesiones (4-6 horas)

---

## Requerimientos

1. Toda escritura (INSERT, UPDATE, DELETE) sobre daños y servicios debe quedar registrada con `usuario_id`
2. Existe una bitácora consultable de cambios por usuario sobre cada registro
3. Los roles se redefinen como permisos granulares: **Crear / Editar / Ver / Eliminar** (checklist en la ficha del usuario dentro de la app, NO desde Odoo)

---

## Modelo de datos

### Nueva tabla `audit_log`

```sql
CREATE TABLE audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tabla           TEXT NOT NULL,        -- 'siniestros' | 'ordenes_servicio' | 'cotizaciones' | 'cotizacion_lineas' | etc.
  fila_id         UUID NOT NULL,         -- id del registro afectado
  operacion       TEXT NOT NULL,         -- 'INSERT' | 'UPDATE' | 'DELETE'

  campo           TEXT,                  -- nombre del campo modificado (NULL si es INSERT/DELETE)
  valor_anterior  JSONB,                 -- valor previo (NULL si INSERT)
  valor_nuevo     JSONB,                 -- valor nuevo (NULL si DELETE)

  usuario_id      UUID REFERENCES auth.users(id),
  usuario_email   TEXT,                  -- snapshot del email al momento del cambio

  contexto        JSONB,                 -- info adicional opcional (IP, user agent, etc.)
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_tabla_fila ON audit_log(tabla, fila_id, created_at DESC);
CREATE INDEX idx_audit_usuario   ON audit_log(usuario_id, created_at DESC);
CREATE INDEX idx_audit_fecha     ON audit_log(created_at DESC);
```

### Trigger genérico `audit_changes()`

```sql
CREATE OR REPLACE FUNCTION audit_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_old_row JSONB;
  v_new_row JSONB;
  v_changed_field TEXT;
BEGIN
  -- Obtener usuario actual del JWT
  v_user_id := auth.uid();
  v_user_email := (current_setting('request.jwt.claims', true)::jsonb ->> 'email');

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (tabla, fila_id, operacion, valor_nuevo, usuario_id, usuario_email)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), v_user_id, v_user_email);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (tabla, fila_id, operacion, valor_anterior, usuario_id, usuario_email)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), v_user_id, v_user_email);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_row := to_jsonb(OLD);
    v_new_row := to_jsonb(NEW);
    -- Una fila por cada campo modificado
    FOR v_changed_field IN
      SELECT key FROM jsonb_each(v_new_row)
      WHERE v_new_row -> key IS DISTINCT FROM v_old_row -> key
        AND key NOT IN ('updated_at')   -- ignorar el campo de timestamp automático
    LOOP
      INSERT INTO audit_log (tabla, fila_id, operacion, campo, valor_anterior, valor_nuevo, usuario_id, usuario_email)
      VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_changed_field, v_old_row -> v_changed_field, v_new_row -> v_changed_field, v_user_id, v_user_email);
    END LOOP;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

### Aplicar trigger a tablas relevantes

```sql
CREATE TRIGGER audit_siniestros           AFTER INSERT OR UPDATE OR DELETE ON siniestros           FOR EACH ROW EXECUTE FUNCTION audit_changes();
CREATE TRIGGER audit_ordenes_servicio     AFTER INSERT OR UPDATE OR DELETE ON ordenes_servicio     FOR EACH ROW EXECUTE FUNCTION audit_changes();
CREATE TRIGGER audit_cotizaciones         AFTER INSERT OR UPDATE OR DELETE ON cotizaciones         FOR EACH ROW EXECUTE FUNCTION audit_changes();
CREATE TRIGGER audit_cotizacion_lineas    AFTER INSERT OR UPDATE OR DELETE ON cotizacion_lineas    FOR EACH ROW EXECUTE FUNCTION audit_changes();
CREATE TRIGGER audit_orden_servicio_lineas AFTER INSERT OR UPDATE OR DELETE ON orden_servicio_lineas FOR EACH ROW EXECUTE FUNCTION audit_changes();
CREATE TRIGGER audit_taller_ingresos      AFTER INSERT OR UPDATE OR DELETE ON taller_ingresos      FOR EACH ROW EXECUTE FUNCTION audit_changes();
CREATE TRIGGER audit_cobros               AFTER INSERT OR UPDATE OR DELETE ON cobros               FOR EACH ROW EXECUTE FUNCTION audit_changes();
CREATE TRIGGER audit_documentos           AFTER INSERT OR UPDATE OR DELETE ON documentos           FOR EACH ROW EXECUTE FUNCTION audit_changes();
CREATE TRIGGER audit_talleres             AFTER INSERT OR UPDATE OR DELETE ON talleres             FOR EACH ROW EXECUTE FUNCTION audit_changes();
CREATE TRIGGER audit_repuestos_catalogo   AFTER INSERT OR UPDATE OR DELETE ON repuestos_catalogo   FOR EACH ROW EXECUTE FUNCTION audit_changes();
```

### Modificar `perfiles` para roles granulares

```sql
ALTER TABLE perfiles
  ADD COLUMN permisos JSONB DEFAULT '{"crear": false, "editar": false, "ver": true, "eliminar": false}';

-- Migración: poblar permisos según rol actual
UPDATE perfiles SET permisos = '{"crear": true, "editar": true, "ver": true, "eliminar": true}'
  WHERE rol = 'admin';
UPDATE perfiles SET permisos = '{"crear": true, "editar": true, "ver": true, "eliminar": false}'
  WHERE rol IN ('agente_senior', 'agente', 'operaciones');
UPDATE perfiles SET permisos = '{"crear": false, "editar": false, "ver": true, "eliminar": false}'
  WHERE rol = 'readonly';
```

### Funciones helper en SQL

```sql
CREATE OR REPLACE FUNCTION has_permission(p TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT permisos -> p FROM perfiles WHERE id = auth.uid())::TEXT::BOOLEAN,
    false
  );
$$;
```

### Actualizar RLS policies

Reemplazar policies que usan `get_user_rol() IN (...)` por `has_permission('crear')`, etc.

```sql
DROP POLICY IF EXISTS insert_siniestros ON siniestros;
CREATE POLICY insert_siniestros ON siniestros FOR INSERT TO authenticated
  WITH CHECK (has_permission('crear'));

DROP POLICY IF EXISTS update_siniestros ON siniestros;
CREATE POLICY update_siniestros ON siniestros FOR UPDATE TO authenticated
  USING (has_permission('editar'));

CREATE POLICY delete_siniestros ON siniestros FOR DELETE TO authenticated
  USING (has_permission('eliminar'));

-- Repetir patrón para ordenes_servicio, cotizaciones, etc.
```

---

## Frontend

### Hook `usePermisos`

```jsx
// hooks/usePermisos.js
import { useAuth } from './useAuth'

export function usePermisos() {
  const { perfil } = useAuth()
  const p = perfil?.permisos ?? { crear: false, editar: false, ver: true, eliminar: false }
  return {
    puedeCrear: p.crear,
    puedeEditar: p.editar,
    puedeVer: p.ver,
    puedeEliminar: p.eliminar,
    esAdmin: perfil?.rol === 'admin',
  }
}
```

### Aplicar a botones y formularios

```jsx
const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos()

{puedeCrear && <button>+ Nuevo</button>}
{puedeEditar && <button>Editar</button>}
{puedeEliminar && <button>Eliminar</button>}
```

### Página nueva: `/usuarios` (solo admin)

- Lista de perfiles con: nombre, email, rol etiqueta, 4 checkboxes (crear/editar/ver/eliminar), activo
- Edit inline o modal con los 4 toggles
- Botón "Aplicar preset" con opciones: "Solo lectura", "Operación", "Supervisor", "Admin"
- Filtros: por permiso, por activo

### Página nueva: bitácora dentro de cada Detalle

- Nueva sección "Historial de cambios" en `SiniestroDetalle` y `ServicioDetalle`
- Tabla compacta de `audit_log` filtrado por `tabla + fila_id`
- Columnas: Fecha, Usuario, Operación, Campo, Anterior → Nuevo
- Bloque colapsable, no se expande por default

---

## Pasos de implementación

1. SQL: crear `audit_log` + función `audit_changes()` + triggers en 10 tablas
2. SQL: ALTER `perfiles` con `permisos JSONB` + migración de valores
3. SQL: función `has_permission()` + reemplazo de policies RLS
4. Backend: en `ensureSupabaseUser`, setear permisos por defecto en `{ crear: false, editar: false, ver: true, eliminar: false }`
5. Frontend: hook `usePermisos()` + gating en todos los botones de acción
6. Frontend: página `/usuarios` con CRUD de permisos (solo admin)
7. Frontend: sección "Historial de cambios" embebida en detalles
8. Probar con usuario "ver" — no debería poder crear/editar nada
9. Probar audit_log llenándose en todas las operaciones

---

## Criterios de éxito

- [ ] Cualquier INSERT/UPDATE/DELETE inserta filas en `audit_log` con `usuario_id` correcto
- [ ] Admin puede asignar/quitar permisos individuales desde `/usuarios`
- [ ] Un usuario sin `crear` no ve botones "+ Nuevo" ni puede hacer INSERT
- [ ] Un usuario sin `editar` no puede hacer UPDATE (RLS lo bloquea)
- [ ] Cada detalle muestra el historial de cambios con quién, cuándo y qué
- [ ] El rol legacy queda como etiqueta pero la autoridad real son los flags
