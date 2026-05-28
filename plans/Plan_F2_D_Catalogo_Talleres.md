# Fase 2 / D — Catálogo de Talleres ampliado

**Estado**: 📋 Pendiente
**Prioridad**: Media
**Estimado**: 1-2 sesiones (2-4 horas)

---

## Requerimientos

1. Cada taller puede tener **múltiples contactos** (mínimo 3)
2. Cada contacto tiene un **puesto/área** para enrutar comunicaciones según el tema:
   - Taller (jefe general)
   - Mecánica
   - Pintura
   - Servicio (Menor/Mayor)
   - Facturas/Pagos
   - Contabilidad
   - Gerencia

---

## Modelo de datos

### Nueva tabla `taller_contactos`

```sql
CREATE TYPE area_contacto AS ENUM (
  'taller',
  'mecanica',
  'pintura',
  'servicio',
  'facturas_pagos',
  'contabilidad',
  'gerencia'
);

CREATE TABLE taller_contactos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id       UUID NOT NULL REFERENCES talleres(id) ON DELETE CASCADE,

  nombre          TEXT NOT NULL,
  puesto          TEXT,                  -- texto libre adicional al área
  area            area_contacto NOT NULL DEFAULT 'taller',

  telefono        TEXT,
  whatsapp        TEXT,                  -- separado de teléfono porque pueden ser distintos
  email           TEXT,

  es_principal    BOOLEAN DEFAULT false, -- marca al contacto principal del taller
  activo          BOOLEAN DEFAULT true,
  notas           TEXT,

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_taller_contactos_taller ON taller_contactos(taller_id) WHERE activo = true;
CREATE INDEX idx_taller_contactos_area ON taller_contactos(taller_id, area) WHERE activo = true;

-- Trigger updated_at
CREATE TRIGGER trg_taller_contactos_updated
  BEFORE UPDATE ON taller_contactos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### Migración: convertir contacto/teléfono actual en primer contacto

```sql
-- Por cada taller, crear su contacto existente como "principal" en area=taller
INSERT INTO taller_contactos (taller_id, nombre, area, telefono, es_principal)
SELECT id, COALESCE(contacto, 'Contacto principal'), 'taller', telefono, true
FROM talleres
WHERE contacto IS NOT NULL OR telefono IS NOT NULL;

-- Las columnas viejas (contacto, telefono) se conservan por compat, eventualmente DEPRECATED
```

### RLS

```sql
ALTER TABLE taller_contactos ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_taller_contactos ON taller_contactos FOR SELECT TO authenticated USING (true);
CREATE POLICY modify_taller_contactos ON taller_contactos FOR ALL TO authenticated
  USING (has_permission('editar') OR has_permission('crear'));

GRANT SELECT ON taller_contactos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON taller_contactos TO authenticated;
```

---

## Frontend

### Catálogo de Talleres (`Catalogos.jsx`)

Modificar el modal de edición/creación de taller:

**Sección "Información general"** (existente, sin cambios):
- Nombre, dirección, notas, activo

**Sección "Contactos"** (nueva):
- Tabla compacta con filas editables inline
- Columnas: ⭐ (principal), Nombre, Área (select 7 opciones), Puesto, Teléfono, WhatsApp, Email, ⋮
- Botón "+ Agregar contacto"
- Al menos un contacto debe existir
- Solo uno puede ser `es_principal=true` por taller (validar)

### Componente nuevo: `TallerContactosEditor.jsx`

```jsx
function TallerContactosEditor({ tallerId, contactos, onChange }) {
  // Lista editable con drag-drop opcional para reordenar
  // Validaciones:
  //  - Mínimo 1 contacto
  //  - Solo 1 puede ser principal
  //  - Email válido si se llena
}
```

### Vista de contactos en detalles

Donde aparece el nombre del taller (proforma, detalle daño, detalle servicio), agregar pequeño botón ℹ:
- Hover/click → tooltip con los contactos del taller agrupados por área
- Útil cuando el agente necesita contactar al taller por un tema específico

### Modal `ContactoTaller`

En contextos donde se interactúa con el taller (ej. aprobar cotización), mostrar:
> "Para confirmar con GRUPO Q:
> - Mecánica: Juan Pérez · 5555-1234 · juan@grupoq.com
> - Facturas: María González · 5555-5678"

---

## Pasos de implementación

1. SQL: enum + tabla + índices + RLS + migración de datos existentes
2. Componente `TallerContactosEditor` con validaciones
3. Integrar en modal de edición de taller en `Catalogos.jsx`
4. Tooltip de contactos en cards de cotización y proforma
5. Eventualmente: deprecar campos `talleres.contacto` y `talleres.telefono` (mantener pero marcar como legacy)

---

## Criterios de éxito

- [ ] Cada taller acepta N contactos con área asignada
- [ ] Solo un contacto por taller puede ser principal
- [ ] Las 7 áreas están disponibles en el select
- [ ] El comparador / proforma muestra el contacto relevante según el área (mínimo el principal)
- [ ] La migración respeta los datos existentes (no se pierde info)
