# ClaudeMant.md — Módulo de Servicios de Mantenimiento

## Contexto

Este documento **complementa** a `CLAUDE.md`. La app "Gestión de Daños Pass" originalmente solo cubría siniestros (daños vehiculares). Ahora se agrega un segundo módulo: **Servicios de Mantenimiento**, que gestiona los servicios preventivos y correctivos de la flota.

Leer primero `CLAUDE.md` para entender la arquitectura base, el stack, la base de datos existente y los patrones de integración con Odoo.

---

## Diferencias clave: Siniestro vs Servicio

| Aspecto | Siniestro (CLAUDE.md) | Servicio (este doc) |
|---------|----------------------|---------------------|
| Origen | Accidente / daño externo | Mantenimiento preventivo o correctivo |
| Cliente involucrado | Sí (el responsable del daño) | No (gasto interno Pass) |
| Autorización | Sí (cliente o aseguradora) | No en la mayoría. Solo si el monto es alto |
| Cotizaciones | 1-3 comparativas de talleres | Usualmente 1 sola (taller directo) |
| Cobro al cliente | Sí (pipeline informado→facturado→pagado) | No. Siempre es gasto Pass |
| Complejidad del flujo | 9 estados | 4 estados |
| Montos típicos | Variables, pueden ser altos (Q185,000 pérdida total) | Menores y predecibles |
| Programable | No (reactivo) | Sí (por km o por tiempo) |
| Odoo status | "En Reparación" | "En Mantenimiento" o "Servicios Varios" |

---

## Tipos de servicio

```
servicio_menor     — Cambio de aceite, filtros, revisión de frenos, niveles de fluidos
servicio_mayor     — Cambio de banda de tiempo, embrague, amortiguadores, tune-up completo
cambio_llantas     — Reemplazo de 1-4 llantas
cambio_bateria     — Reemplazo de batería
alineacion_balanceo — Alineación y/o balanceo
cambio_frenos      — Pastillas, discos, zapatas
otro               — Cualquier servicio no clasificado
```

---

## Cambios en la base de datos

### Nuevos enums

```sql
CREATE TYPE tipo_servicio_mant AS ENUM (
  'servicio_menor',
  'servicio_mayor',
  'cambio_llantas',
  'cambio_bateria',
  'alineacion_balanceo',
  'cambio_frenos',
  'otro'
);

CREATE TYPE estado_orden_servicio AS ENUM (
  'programado',
  'aprobado',
  'en_proceso',
  'completado',
  'cancelado'
);
```

### Nueva tabla: `ordenes_servicio`

Tabla principal de órdenes de mantenimiento. Estructura más simple que `siniestros` porque no hay datos de cliente, severidad ni cobro.

```sql
CREATE TABLE ordenes_servicio (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero            TEXT UNIQUE NOT NULL DEFAULT '',

  -- Datos del vehículo (desde Odoo)
  placa             TEXT NOT NULL,
  tipo_vehiculo     TEXT,
  marca             TEXT,
  linea             TEXT,
  anio              INTEGER,
  odoo_product_id   INTEGER,

  -- Servicio
  tipo_servicio     tipo_servicio_mant NOT NULL DEFAULT 'otro',
  descripcion       TEXT,
  fecha_programada  DATE,
  kilometraje       INTEGER,

  -- Estado
  estado            estado_orden_servicio NOT NULL DEFAULT 'programado',
  requiere_autorizacion BOOLEAN DEFAULT FALSE,
  autorizado_por    TEXT,
  fecha_autorizacion DATE,

  -- Taller
  taller_id         UUID REFERENCES talleres(id),

  -- Montos (más simple: no hay comparación, solo costo directo)
  total_repuestos   NUMERIC(12,2) DEFAULT 0,
  total_mano_obra   NUMERIC(12,2) DEFAULT 0,
  total_otros       NUMERIC(12,2) DEFAULT 0,
  total_general     NUMERIC(12,2) DEFAULT 0,

  -- Metadata
  registrado_por    UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ordenes_servicio_placa ON ordenes_servicio(placa);
CREATE INDEX idx_ordenes_servicio_estado ON ordenes_servicio(estado);
CREATE INDEX idx_ordenes_servicio_fecha ON ordenes_servicio(fecha_programada DESC);
```

**Trigger**: generar número secuencial `SRV-YYYY-NNN` (patrón idéntico a siniestros pero con prefijo SRV).

### Nueva tabla: `orden_servicio_lineas`

Líneas de detalle del servicio (repuestos, mano de obra, otros). Misma estructura que `cotizacion_lineas` pero vinculada a `ordenes_servicio`.

```sql
CREATE TABLE orden_servicio_lineas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_servicio_id UUID NOT NULL REFERENCES ordenes_servicio(id) ON DELETE CASCADE,

  tipo              tipo_linea_cotizacion NOT NULL DEFAULT 'repuesto',
  descripcion       TEXT NOT NULL,
  repuesto_id       UUID REFERENCES repuestos_catalogo(id),
  cantidad          NUMERIC(10,2) DEFAULT 1,
  precio_unitario   NUMERIC(12,2) DEFAULT 0,
  subtotal          NUMERIC(12,2) DEFAULT 0,

  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_orden_servicio_lineas ON orden_servicio_lineas(orden_servicio_id);
```

**Trigger**: recalcular totales en `ordenes_servicio` al INSERT/UPDATE/DELETE en líneas (mismo patrón que `actualizar_totales_cotizacion`).

### Nueva tabla: `orden_servicio_timeline`

Auditoría de cambios de estado, mismo patrón que `siniestro_timeline`.

```sql
CREATE TABLE orden_servicio_timeline (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_servicio_id UUID NOT NULL REFERENCES ordenes_servicio(id) ON DELETE CASCADE,

  estado_anterior   estado_orden_servicio,
  estado_nuevo      estado_orden_servicio NOT NULL,
  accion            TEXT NOT NULL,
  detalle           TEXT,

  usuario_id        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_os_timeline ON orden_servicio_timeline(orden_servicio_id);
```

### Tablas existentes que se modifican

#### `taller_ingresos` — Ahora soporta siniestros Y servicios

Actualmente `siniestro_id` es NOT NULL. Debe volverse nullable y agregar `orden_servicio_id`. Un ingreso a taller puede ser por daño O por servicio, nunca ambos.

```sql
-- Hacer siniestro_id nullable
ALTER TABLE taller_ingresos ALTER COLUMN siniestro_id DROP NOT NULL;

-- Agregar FK a ordenes_servicio
ALTER TABLE taller_ingresos
  ADD COLUMN orden_servicio_id UUID REFERENCES ordenes_servicio(id) ON DELETE CASCADE;

-- Constraint: al menos uno debe estar presente
ALTER TABLE taller_ingresos
  ADD CONSTRAINT chk_taller_ingreso_origen
  CHECK (
    (siniestro_id IS NOT NULL AND orden_servicio_id IS NULL) OR
    (siniestro_id IS NULL AND orden_servicio_id IS NOT NULL)
  );

CREATE INDEX idx_taller_ingresos_orden ON taller_ingresos(orden_servicio_id);
```

#### `documentos` — Ahora soporta documentos de servicios

Actualmente `siniestro_id` es NOT NULL. Debe volverse nullable y agregar `orden_servicio_id`.

```sql
-- Hacer siniestro_id nullable
ALTER TABLE documentos ALTER COLUMN siniestro_id DROP NOT NULL;

-- Agregar FK a ordenes_servicio
ALTER TABLE documentos
  ADD COLUMN orden_servicio_id UUID REFERENCES ordenes_servicio(id) ON DELETE CASCADE;

-- Constraint: al menos uno debe estar presente
ALTER TABLE documentos
  ADD CONSTRAINT chk_documento_origen
  CHECK (
    siniestro_id IS NOT NULL OR orden_servicio_id IS NOT NULL
  );

CREATE INDEX idx_documentos_orden ON documentos(orden_servicio_id);
```

### RLS para nuevas tablas

```sql
ALTER TABLE ordenes_servicio ENABLE ROW LEVEL SECURITY;
ALTER TABLE orden_servicio_lineas ENABLE ROW LEVEL SECURITY;
ALTER TABLE orden_servicio_timeline ENABLE ROW LEVEL SECURITY;

-- SELECT: todos los autenticados
CREATE POLICY "select_ordenes" ON ordenes_servicio FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_os_lineas" ON orden_servicio_lineas FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_os_timeline" ON orden_servicio_timeline FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE: agentes y admins
CREATE POLICY "insert_ordenes" ON ordenes_servicio FOR INSERT TO authenticated
  WITH CHECK (get_user_rol() IN ('admin', 'agente_senior', 'agente', 'operaciones'));
CREATE POLICY "update_ordenes" ON ordenes_servicio FOR UPDATE TO authenticated
  USING (get_user_rol() IN ('admin', 'agente_senior', 'agente', 'operaciones'));

CREATE POLICY "all_os_lineas" ON orden_servicio_lineas FOR ALL TO authenticated
  USING (get_user_rol() IN ('admin', 'agente_senior', 'agente', 'operaciones'));

CREATE POLICY "insert_os_timeline" ON orden_servicio_timeline FOR INSERT TO authenticated
  WITH CHECK (true);

-- GRANTS
GRANT SELECT ON ordenes_servicio, orden_servicio_lineas, orden_servicio_timeline TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ordenes_servicio, orden_servicio_lineas, orden_servicio_timeline TO authenticated;
```

### Triggers para nuevas tablas

```sql
-- Número secuencial SRV-YYYY-NNN
CREATE OR REPLACE FUNCTION generar_numero_servicio()
RETURNS TRIGGER AS $$
DECLARE
  anio TEXT;
  seq INTEGER;
BEGIN
  anio := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(numero, '-', 3) AS INTEGER)
  ), 0) + 1
  INTO seq
  FROM ordenes_servicio
  WHERE numero LIKE 'SRV-' || anio || '-%';

  NEW.numero := 'SRV-' || anio || '-' || LPAD(seq::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_numero_servicio
  BEFORE INSERT ON ordenes_servicio
  FOR EACH ROW
  WHEN (NEW.numero IS NULL OR NEW.numero = '')
  EXECUTE FUNCTION generar_numero_servicio();

-- Timeline de cambios de estado
CREATE OR REPLACE FUNCTION registrar_cambio_estado_servicio()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.estado IS DISTINCT FROM NEW.estado THEN
    INSERT INTO orden_servicio_timeline (
      orden_servicio_id, estado_anterior, estado_nuevo, accion, detalle
    ) VALUES (
      NEW.id,
      OLD.estado,
      NEW.estado,
      'Cambio de estado',
      'De ' || OLD.estado || ' a ' || NEW.estado
    );
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orden_servicio_estado_timeline
  BEFORE UPDATE ON ordenes_servicio
  FOR EACH ROW
  EXECUTE FUNCTION registrar_cambio_estado_servicio();

-- Recalcular totales de orden de servicio
CREATE OR REPLACE FUNCTION actualizar_totales_orden_servicio()
RETURNS TRIGGER AS $$
DECLARE
  os_id UUID;
BEGIN
  os_id := COALESCE(NEW.orden_servicio_id, OLD.orden_servicio_id);

  UPDATE ordenes_servicio SET
    total_repuestos = COALESCE((
      SELECT SUM(subtotal) FROM orden_servicio_lineas
      WHERE orden_servicio_id = os_id AND tipo = 'repuesto'
    ), 0),
    total_mano_obra = COALESCE((
      SELECT SUM(subtotal) FROM orden_servicio_lineas
      WHERE orden_servicio_id = os_id AND tipo = 'mano_obra'
    ), 0),
    total_otros = COALESCE((
      SELECT SUM(subtotal) FROM orden_servicio_lineas
      WHERE orden_servicio_id = os_id AND tipo = 'otro'
    ), 0),
    total_general = COALESCE((
      SELECT SUM(subtotal) FROM orden_servicio_lineas
      WHERE orden_servicio_id = os_id
    ), 0),
    updated_at = now()
  WHERE id = os_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orden_servicio_totales
  AFTER INSERT OR UPDATE OR DELETE ON orden_servicio_lineas
  FOR EACH ROW
  EXECUTE FUNCTION actualizar_totales_orden_servicio();

-- updated_at automático
CREATE TRIGGER trg_ordenes_servicio_updated BEFORE UPDATE ON ordenes_servicio
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## Ciclo de vida del servicio

```
programado → aprobado → en_proceso → completado
                ↓
            cancelado
```

Flujo mucho más simple que siniestros (4 estados vs 9).

### Cuándo se necesita autorización

| Tipo de servicio | Autorización | Motivo |
|-----------------|-------------|--------|
| Servicio menor | No | Rutinario, bajo costo |
| Cambio de llantas | No | Desgaste normal |
| Cambio de batería | No | Desgaste normal |
| Alineación/balanceo | No | Rutinario |
| Cambio de frenos | No | Desgaste normal |
| Servicio mayor | **Sí** | Costo alto, requiere evaluación |
| Otro > Q5,000 | **Sí** | Monto supera umbral |

Cuando `requiere_autorizacion = true`, el servicio no puede pasar de `programado` a `en_proceso` sin antes pasar por `aprobado`.

Cuando `requiere_autorizacion = false`, se puede saltar directamente de `programado` a `en_proceso`.

### Acciones por transición de estado

| De → A | Acción en Supabase | Acción en Odoo |
|--------|-------------------|----------------|
| → programado | INSERT orden_servicio | — |
| programado → aprobado | UPDATE estado, autorizado_por, fecha_autorizacion | — |
| programado → en_proceso | INSERT taller_ingresos (si no requiere autorización) | PATCH status → "En Mantenimiento" o "Servicios Varios" |
| aprobado → en_proceso | INSERT taller_ingresos | PATCH status → "En Mantenimiento" o "Servicios Varios" |
| en_proceso → completado | UPDATE taller_ingresos.fecha_egreso | PATCH status → "Disponible" |
| cualquier → cancelado | UPDATE estado | PATCH status → "Disponible" (si estaba en taller) |

### Mapeo a Odoo `x_studio_status_vehiculo`

| Tipo servicio | Status Odoo |
|--------------|------------|
| Servicio menor | "Servicios Varios" |
| Servicio mayor | "En Mantenimiento" |
| Cambio de llantas | "Servicios Varios" |
| Cambio de batería | "Servicios Varios" |
| Alineación/balanceo | "Servicios Varios" |
| Cambio de frenos | "En Mantenimiento" |
| Otro | "Servicios Varios" |

---

## Cambios en el backend API

Agregar 2 nuevos endpoints al `/backend/index.js`:

### PATCH /vehiculo/:id/status (ya existe, sin cambios)

Ya soporta los valores "En Mantenimiento" y "Servicios Varios" en el array `VALID_STATUS`.

### Nuevos endpoints (sugeridos, no obligatorios)

El frontend puede hablar directo con Supabase para el CRUD de ordenes_servicio. El backend solo se necesita para cambiar el status en Odoo, que ya está cubierto por el endpoint existente `PATCH /vehiculo/:id/status`.

No se necesitan endpoints adicionales en el backend para servicios.

---

## Cambios en el frontend

### Sidebar actualizado

```
PRINCIPAL
├── Dashboard              ← ya incluye KPIs de servicios
├── Siniestros             ← sin cambios
├── Servicios              ← NUEVO
├── Proformas              ← sin cambios
├── Flota Vehicular        ← sin cambios

CONFIGURACIÓN
├── Catálogos              ← sin cambios
├── Repositorio            ← ahora muestra docs de servicios también
├── Reportes               ← ahora incluye costos de mantenimiento
```

### Nuevas páginas

#### Servicios (lista)
- Tabla con columnas: No. Orden, Fecha programada, Vehículo, Tipo servicio, Taller, Total Q., Estado, Acción
- Filtros: búsqueda por placa/número, dropdown tipo servicio, dropdown estado
- Badges de tipo servicio: menor=green, mayor=amber, llantas=blue, batería=blue, frenos=amber
- Badges de estado: programado=gray, aprobado=blue, en_proceso=amber, completado=green, cancelado=red
- Botón "+ Nuevo servicio"

#### Nuevo servicio (modal o página)
- **Selección de vehículo**: Select de placa (misma API `/vehiculos`), auto-completa datos
- **Tipo de servicio**: Select con los tipos definidos
- **Taller**: Select de talleres del catálogo (un solo taller, no comparación)
- **Fecha programada**: Date picker
- **Kilometraje actual**: Input numérico (opcional)
- **Descripción**: Textarea para observaciones
- **Líneas de detalle**: Agregar repuestos, mano de obra, otros con precios
- Al guardar: INSERT en `ordenes_servicio` con estado `programado`
- Si `requiere_autorizacion` es false y se quiere enviar directo, puede ir a `en_proceso`

#### Detalle de servicio
- Header con número, placa, tipo servicio, estado actual
- Timeline visual de cambios de estado
- Sección "Detalle del servicio" — líneas con totales
- Sección "Taller" — tracking ingreso/egreso con días en taller
- Sección "Documentos" — facturas del taller, fotos
- Botones de acción según estado:
  - `programado` + requiere_autorizacion → "Autorizar" (→ aprobado)
  - `programado` + no requiere → "Enviar a taller" (→ en_proceso, PATCH Odoo)
  - `aprobado` → "Enviar a taller" (→ en_proceso, PATCH Odoo)
  - `en_proceso` → "Completar servicio" (→ completado, PATCH Odoo → "Disponible")

### Dashboard actualizado

Agregar un 5to KPI card: "Servicios en curso" (ordenes_servicio donde estado = 'en_proceso').

Agregar sección "Próximos servicios" debajo de la tabla de siniestros: lista de ordenes_servicio donde estado = 'programado' ordenadas por fecha_programada.

### Reportes actualizados

Agregar sección "Costos de mantenimiento":
- Total gastado en servicios (mes / año)
- Desglose por tipo de servicio
- Top 5 vehículos con más gasto en mantenimiento
- Comparativa: costo reparaciones (daños) vs costo mantenimiento (servicios)

---

## Queries Supabase para servicios

```javascript
// Listar servicios con taller
const { data } = await supabase
  .from('ordenes_servicio')
  .select('*, talleres(nombre)')
  .order('created_at', { ascending: false });

// Servicios en proceso (para KPI)
const { count } = await supabase
  .from('ordenes_servicio')
  .select('*', { count: 'exact', head: true })
  .eq('estado', 'en_proceso');

// Próximos servicios programados
const { data } = await supabase
  .from('ordenes_servicio')
  .select('*')
  .eq('estado', 'programado')
  .order('fecha_programada', { ascending: true })
  .limit(5);

// Detalle con líneas y timeline
const { data } = await supabase
  .from('ordenes_servicio')
  .select(`
    *,
    talleres(nombre, telefono),
    orden_servicio_lineas(*),
    orden_servicio_timeline(*)
  `)
  .eq('id', ordenId)
  .single();

// Taller ingresos para un servicio
const { data } = await supabase
  .from('taller_ingresos')
  .select('*, talleres(nombre)')
  .eq('orden_servicio_id', ordenId);

// Documentos del servicio
const { data } = await supabase
  .from('documentos')
  .select('*')
  .eq('orden_servicio_id', ordenId);

// Costo total mantenimiento del mes
const { data } = await supabase
  .from('ordenes_servicio')
  .select('total_general')
  .eq('estado', 'completado')
  .gte('created_at', inicioMes)
  .lte('created_at', finMes);
```

---

## Relación entre módulos

```
                    ┌──────────────────┐
                    │   Vehículo       │
                    │   (Odoo)         │
                    └────┬────────┬────┘
                         │        │
              ┌──────────▼──┐  ┌──▼──────────┐
              │ Siniestro   │  │ Servicio    │
              │ (CLAUDE.md) │  │ (este doc)  │
              └──────┬──────┘  └──────┬──────┘
                     │                │
                     ▼                ▼
              ┌──────────────────────────────┐
              │      taller_ingresos         │
              │  (compartido, FK exclusivo)   │
              └──────────────────────────────┘
                     │                │
                     ▼                ▼
              ┌──────────────────────────────┐
              │        documentos            │
              │  (compartido, FK nullable)    │
              └──────────────────────────────┘
                     │                │
                     ▼                ▼
              ┌──────────────────────────────┐
              │         talleres             │
              │      (catálogo compartido)    │
              └──────────────────────────────┘
```

Las tablas `taller_ingresos`, `documentos` y `talleres` son compartidas entre ambos módulos. El constraint `CHECK` en `taller_ingresos` garantiza que un ingreso pertenece a un siniestro O a un servicio, nunca a ambos.

---

## Resumen de impacto en la base de datos

### Nuevos objetos
- 2 enums: `tipo_servicio_mant`, `estado_orden_servicio`
- 3 tablas: `ordenes_servicio`, `orden_servicio_lineas`, `orden_servicio_timeline`
- 4 triggers: número secuencial, timeline, totales, updated_at
- 6 RLS policies

### Tablas modificadas
- `taller_ingresos`: `siniestro_id` → nullable, agregar `orden_servicio_id` nullable, agregar CHECK constraint
- `documentos`: `siniestro_id` → nullable, agregar `orden_servicio_id` nullable, agregar CHECK constraint

### Sin cambios
- `siniestros`, `cotizaciones`, `cotizacion_lineas`, `cobros`, `siniestro_timeline` (intocados)
- `talleres`, `repuestos_catalogo`, `perfiles` (compartidos, sin cambios de esquema)
- Backend `index.js` (el endpoint PATCH ya soporta "En Mantenimiento" y "Servicios Varios")
