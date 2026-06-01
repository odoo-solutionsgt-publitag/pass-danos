-- ============================================================
-- PASS RENT A CAR — Gestión de Daños
-- Migration: 003_fase2.sql
-- Proyecto: Odoo Gestion Danos (cxoqviwdryvjahykazpb)
-- Fase 2 — Auditoría, roles granulares, mejoras de cotizaciones,
-- catálogos extendidos, forma de pago, tipos servicio, fechas,
-- descuentos y checklist de cierre.
--
-- IMPORTANTE: ejecutar en Supabase SQL Editor.
-- Recomendado: copiar todo y ejecutar como bloque único.
-- Si falla algún ALTER TYPE por estar en transacción, ejecutar
-- la sección "F. TIPOS DE SERVICIO" e "I. DESCUENTO ENUM" por
-- separado primero, luego el resto.
-- ============================================================


-- ============================================================
-- A. AUDITORÍA + ROLES GRANULARES
-- ============================================================

-- A.1 Tabla audit_log
CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla           TEXT NOT NULL,
  fila_id         UUID NOT NULL,
  operacion       TEXT NOT NULL CHECK (operacion IN ('INSERT', 'UPDATE', 'DELETE')),
  campo           TEXT,
  valor_anterior  JSONB,
  valor_nuevo     JSONB,
  usuario_id      UUID REFERENCES auth.users(id),
  usuario_email   TEXT,
  contexto        JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_tabla_fila ON audit_log(tabla, fila_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_usuario    ON audit_log(usuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_fecha      ON audit_log(created_at DESC);

-- A.2 Función trigger genérica de auditoría
CREATE OR REPLACE FUNCTION audit_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id    UUID;
  v_user_email TEXT;
  v_old_row    JSONB;
  v_new_row    JSONB;
  v_field      TEXT;
BEGIN
  -- usuario actual desde el JWT
  BEGIN
    v_user_id := auth.uid();
    v_user_email := (current_setting('request.jwt.claims', true)::jsonb ->> 'email');
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
    v_user_email := NULL;
  END;

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
    FOR v_field IN
      SELECT key FROM jsonb_each(v_new_row)
      WHERE v_new_row -> key IS DISTINCT FROM v_old_row -> key
        AND key NOT IN ('updated_at')
    LOOP
      INSERT INTO audit_log (tabla, fila_id, operacion, campo, valor_anterior, valor_nuevo, usuario_id, usuario_email)
      VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_field,
              v_old_row -> v_field, v_new_row -> v_field,
              v_user_id, v_user_email);
    END LOOP;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- A.3 Aplicar trigger a todas las tablas operacionales
DROP TRIGGER IF EXISTS audit_siniestros ON siniestros;
CREATE TRIGGER audit_siniestros            AFTER INSERT OR UPDATE OR DELETE ON siniestros            FOR EACH ROW EXECUTE FUNCTION audit_changes();

DROP TRIGGER IF EXISTS audit_ordenes_servicio ON ordenes_servicio;
CREATE TRIGGER audit_ordenes_servicio      AFTER INSERT OR UPDATE OR DELETE ON ordenes_servicio      FOR EACH ROW EXECUTE FUNCTION audit_changes();

DROP TRIGGER IF EXISTS audit_cotizaciones ON cotizaciones;
CREATE TRIGGER audit_cotizaciones          AFTER INSERT OR UPDATE OR DELETE ON cotizaciones          FOR EACH ROW EXECUTE FUNCTION audit_changes();

DROP TRIGGER IF EXISTS audit_cotizacion_lineas ON cotizacion_lineas;
CREATE TRIGGER audit_cotizacion_lineas     AFTER INSERT OR UPDATE OR DELETE ON cotizacion_lineas     FOR EACH ROW EXECUTE FUNCTION audit_changes();

DROP TRIGGER IF EXISTS audit_orden_servicio_lineas ON orden_servicio_lineas;
CREATE TRIGGER audit_orden_servicio_lineas AFTER INSERT OR UPDATE OR DELETE ON orden_servicio_lineas FOR EACH ROW EXECUTE FUNCTION audit_changes();

DROP TRIGGER IF EXISTS audit_taller_ingresos ON taller_ingresos;
CREATE TRIGGER audit_taller_ingresos       AFTER INSERT OR UPDATE OR DELETE ON taller_ingresos       FOR EACH ROW EXECUTE FUNCTION audit_changes();

DROP TRIGGER IF EXISTS audit_cobros ON cobros;
CREATE TRIGGER audit_cobros                AFTER INSERT OR UPDATE OR DELETE ON cobros                FOR EACH ROW EXECUTE FUNCTION audit_changes();

DROP TRIGGER IF EXISTS audit_documentos ON documentos;
CREATE TRIGGER audit_documentos            AFTER INSERT OR UPDATE OR DELETE ON documentos            FOR EACH ROW EXECUTE FUNCTION audit_changes();

DROP TRIGGER IF EXISTS audit_talleres ON talleres;
CREATE TRIGGER audit_talleres              AFTER INSERT OR UPDATE OR DELETE ON talleres              FOR EACH ROW EXECUTE FUNCTION audit_changes();

DROP TRIGGER IF EXISTS audit_repuestos_catalogo ON repuestos_catalogo;
CREATE TRIGGER audit_repuestos_catalogo    AFTER INSERT OR UPDATE OR DELETE ON repuestos_catalogo    FOR EACH ROW EXECUTE FUNCTION audit_changes();

-- A.4 RLS audit_log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_audit_log" ON audit_log;
CREATE POLICY "select_audit_log" ON audit_log FOR SELECT TO authenticated USING (true);

GRANT SELECT ON audit_log TO authenticated;

-- A.5 Permisos granulares en perfiles
ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS permisos JSONB
  DEFAULT '{"crear": false, "editar": false, "ver": true, "eliminar": false}'::jsonb;

-- Migración: poblar permisos según rol actual
UPDATE perfiles
   SET permisos = '{"crear": true, "editar": true, "ver": true, "eliminar": true}'::jsonb
 WHERE rol = 'admin'
   AND (permisos IS NULL OR permisos = '{}'::jsonb OR permisos -> 'crear' IS NULL);

UPDATE perfiles
   SET permisos = '{"crear": true, "editar": true, "ver": true, "eliminar": false}'::jsonb
 WHERE rol IN ('agente_senior', 'agente', 'operaciones')
   AND (permisos IS NULL OR permisos = '{}'::jsonb OR permisos -> 'crear' IS NULL);

UPDATE perfiles
   SET permisos = '{"crear": false, "editar": false, "ver": true, "eliminar": false}'::jsonb
 WHERE rol = 'readonly'
   AND (permisos IS NULL OR permisos = '{}'::jsonb OR permisos -> 'crear' IS NULL);

-- A.6 Helper function: has_permission(text)
CREATE OR REPLACE FUNCTION has_permission(p TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT (permisos ->> p)::BOOLEAN FROM perfiles WHERE id = auth.uid()),
    false
  );
$$;

-- A.7 Reemplazar policies RLS — siniestros
DROP POLICY IF EXISTS "insert_siniestros" ON siniestros;
DROP POLICY IF EXISTS "update_siniestros" ON siniestros;
DROP POLICY IF EXISTS "delete_siniestros" ON siniestros;
CREATE POLICY "insert_siniestros" ON siniestros FOR INSERT TO authenticated WITH CHECK (has_permission('crear'));
CREATE POLICY "update_siniestros" ON siniestros FOR UPDATE TO authenticated USING (has_permission('editar'));
CREATE POLICY "delete_siniestros" ON siniestros FOR DELETE TO authenticated USING (has_permission('eliminar'));

-- A.7 Policies — ordenes_servicio
DROP POLICY IF EXISTS "insert_ordenes" ON ordenes_servicio;
DROP POLICY IF EXISTS "update_ordenes" ON ordenes_servicio;
DROP POLICY IF EXISTS "delete_ordenes" ON ordenes_servicio;
CREATE POLICY "insert_ordenes" ON ordenes_servicio FOR INSERT TO authenticated WITH CHECK (has_permission('crear'));
CREATE POLICY "update_ordenes" ON ordenes_servicio FOR UPDATE TO authenticated USING (has_permission('editar'));
CREATE POLICY "delete_ordenes" ON ordenes_servicio FOR DELETE TO authenticated USING (has_permission('eliminar'));

-- A.7 Policies — cotizaciones
DROP POLICY IF EXISTS "all_cotizaciones" ON cotizaciones;
DROP POLICY IF EXISTS "select_cotizaciones" ON cotizaciones;
DROP POLICY IF EXISTS "insert_cotizaciones" ON cotizaciones;
DROP POLICY IF EXISTS "update_cotizaciones" ON cotizaciones;
DROP POLICY IF EXISTS "delete_cotizaciones" ON cotizaciones;
CREATE POLICY "select_cotizaciones" ON cotizaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_cotizaciones" ON cotizaciones FOR INSERT TO authenticated WITH CHECK (has_permission('crear'));
CREATE POLICY "update_cotizaciones" ON cotizaciones FOR UPDATE TO authenticated USING (has_permission('editar'));
CREATE POLICY "delete_cotizaciones" ON cotizaciones FOR DELETE TO authenticated USING (has_permission('eliminar'));

-- A.7 Policies — cotizacion_lineas
DROP POLICY IF EXISTS "all_cot_lineas" ON cotizacion_lineas;
DROP POLICY IF EXISTS "select_cot_lineas" ON cotizacion_lineas;
DROP POLICY IF EXISTS "insert_cot_lineas" ON cotizacion_lineas;
DROP POLICY IF EXISTS "update_cot_lineas" ON cotizacion_lineas;
DROP POLICY IF EXISTS "delete_cot_lineas" ON cotizacion_lineas;
CREATE POLICY "select_cot_lineas" ON cotizacion_lineas FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_cot_lineas" ON cotizacion_lineas FOR INSERT TO authenticated WITH CHECK (has_permission('crear'));
CREATE POLICY "update_cot_lineas" ON cotizacion_lineas FOR UPDATE TO authenticated USING (has_permission('editar'));
CREATE POLICY "delete_cot_lineas" ON cotizacion_lineas FOR DELETE TO authenticated USING (has_permission('eliminar'));

-- A.7 Policies — orden_servicio_lineas
DROP POLICY IF EXISTS "all_os_lineas" ON orden_servicio_lineas;
DROP POLICY IF EXISTS "select_os_lineas" ON orden_servicio_lineas;
DROP POLICY IF EXISTS "insert_os_lineas" ON orden_servicio_lineas;
DROP POLICY IF EXISTS "update_os_lineas" ON orden_servicio_lineas;
DROP POLICY IF EXISTS "delete_os_lineas" ON orden_servicio_lineas;
CREATE POLICY "select_os_lineas" ON orden_servicio_lineas FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_os_lineas" ON orden_servicio_lineas FOR INSERT TO authenticated WITH CHECK (has_permission('crear'));
CREATE POLICY "update_os_lineas" ON orden_servicio_lineas FOR UPDATE TO authenticated USING (has_permission('editar'));
CREATE POLICY "delete_os_lineas" ON orden_servicio_lineas FOR DELETE TO authenticated USING (has_permission('eliminar'));

-- A.7 Policies — talleres y repuestos (solo crear/editar/eliminar gates con permisos)
DROP POLICY IF EXISTS "modify_talleres" ON talleres;
DROP POLICY IF EXISTS "insert_talleres" ON talleres;
DROP POLICY IF EXISTS "update_talleres" ON talleres;
DROP POLICY IF EXISTS "delete_talleres" ON talleres;
CREATE POLICY "insert_talleres" ON talleres FOR INSERT TO authenticated WITH CHECK (has_permission('crear'));
CREATE POLICY "update_talleres" ON talleres FOR UPDATE TO authenticated USING (has_permission('editar'));
CREATE POLICY "delete_talleres" ON talleres FOR DELETE TO authenticated USING (has_permission('eliminar'));

DROP POLICY IF EXISTS "modify_repuestos" ON repuestos_catalogo;
DROP POLICY IF EXISTS "insert_repuestos" ON repuestos_catalogo;
DROP POLICY IF EXISTS "update_repuestos" ON repuestos_catalogo;
DROP POLICY IF EXISTS "delete_repuestos" ON repuestos_catalogo;
CREATE POLICY "insert_repuestos" ON repuestos_catalogo FOR INSERT TO authenticated WITH CHECK (has_permission('crear'));
CREATE POLICY "update_repuestos" ON repuestos_catalogo FOR UPDATE TO authenticated USING (has_permission('editar'));
CREATE POLICY "delete_repuestos" ON repuestos_catalogo FOR DELETE TO authenticated USING (has_permission('eliminar'));


-- ============================================================
-- C. COTIZACIONES — variantes + sync de costo_pass al editar
-- ============================================================

ALTER TABLE cotizaciones
  ADD COLUMN IF NOT EXISTS variante TEXT;

COMMENT ON COLUMN cotizaciones.variante IS
  'Etiqueta opcional para distinguir cotizaciones del mismo taller, ej: "Original", "Genérico"';

-- Quitar restricción de unicidad (taller_id, siniestro_id) si existe
DO $$
DECLARE
  c_name TEXT;
BEGIN
  FOR c_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'cotizaciones'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%siniestro_id%taller_id%'
  LOOP
    EXECUTE 'ALTER TABLE cotizaciones DROP CONSTRAINT ' || c_name;
  END LOOP;
END $$;

-- Trigger: si la cotización aprobada cambia totales, sincronizar siniestros.costo_pass
CREATE OR REPLACE FUNCTION sync_costo_pass_from_approved_quote()
RETURNS TRIGGER AS $$
DECLARE
  v_cot_id       UUID;
  v_siniestro_id UUID;
  v_estado       TEXT;
  v_total        NUMERIC;
BEGIN
  v_cot_id := COALESCE(NEW.cotizacion_id, OLD.cotizacion_id);

  SELECT siniestro_id, estado::TEXT, total_general
    INTO v_siniestro_id, v_estado, v_total
  FROM cotizaciones
  WHERE id = v_cot_id;

  IF v_estado = 'aprobada' AND v_siniestro_id IS NOT NULL THEN
    UPDATE siniestros
       SET costo_pass = v_total,
           margen     = COALESCE(monto_cliente, 0) - v_total,
           updated_at = now()
     WHERE id = v_siniestro_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_costo_pass ON cotizacion_lineas;
CREATE TRIGGER trg_sync_costo_pass
  AFTER INSERT OR UPDATE OR DELETE ON cotizacion_lineas
  FOR EACH ROW EXECUTE FUNCTION sync_costo_pass_from_approved_quote();


-- ============================================================
-- D. TALLERES — multi-contacto (máx 3 activos por taller)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE area_contacto AS ENUM (
    'taller',
    'mecanica',
    'pintura',
    'servicio',
    'facturas_pagos',
    'contabilidad',
    'gerencia'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS taller_contactos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id      UUID NOT NULL REFERENCES talleres(id) ON DELETE CASCADE,

  nombre         TEXT NOT NULL,
  puesto         TEXT,
  area           area_contacto NOT NULL DEFAULT 'taller',

  telefono       TEXT,
  whatsapp       TEXT,
  email          TEXT,

  es_principal   BOOLEAN DEFAULT false,
  activo         BOOLEAN DEFAULT true,
  notas          TEXT,

  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taller_contactos_taller
  ON taller_contactos(taller_id) WHERE activo = true;

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_taller_contactos_updated ON taller_contactos;
CREATE TRIGGER trg_taller_contactos_updated
  BEFORE UPDATE ON taller_contactos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Constraint: máximo 3 contactos activos por taller
CREATE OR REPLACE FUNCTION limit_taller_contactos()
RETURNS TRIGGER AS $$
DECLARE
  v_count INT;
BEGIN
  IF NEW.activo = true THEN
    SELECT COUNT(*) INTO v_count
      FROM taller_contactos
     WHERE taller_id = NEW.taller_id
       AND activo = true
       AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);
    IF v_count >= 3 THEN
      RAISE EXCEPTION 'Solo se permiten 3 contactos activos por taller (taller_id=%)', NEW.taller_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_limit_taller_contactos ON taller_contactos;
CREATE TRIGGER trg_limit_taller_contactos
  BEFORE INSERT OR UPDATE ON taller_contactos
  FOR EACH ROW EXECUTE FUNCTION limit_taller_contactos();

-- Constraint: solo un contacto principal por taller
CREATE OR REPLACE FUNCTION unique_taller_principal()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.es_principal = true THEN
    UPDATE taller_contactos
       SET es_principal = false
     WHERE taller_id = NEW.taller_id
       AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
       AND es_principal = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_unique_taller_principal ON taller_contactos;
CREATE TRIGGER trg_unique_taller_principal
  BEFORE INSERT OR UPDATE ON taller_contactos
  FOR EACH ROW EXECUTE FUNCTION unique_taller_principal();

-- Migración: poblar primer contacto desde columnas legacy si aún no existen
INSERT INTO taller_contactos (taller_id, nombre, area, telefono, es_principal)
SELECT t.id,
       COALESCE(NULLIF(t.contacto, ''), 'Contacto principal'),
       'taller'::area_contacto,
       t.telefono,
       true
  FROM talleres t
 WHERE NOT EXISTS (
   SELECT 1 FROM taller_contactos tc WHERE tc.taller_id = t.id
 )
   AND ((t.contacto IS NOT NULL AND t.contacto != '') OR (t.telefono IS NOT NULL AND t.telefono != ''));

-- RLS
ALTER TABLE taller_contactos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_taller_contactos" ON taller_contactos;
DROP POLICY IF EXISTS "insert_taller_contactos" ON taller_contactos;
DROP POLICY IF EXISTS "update_taller_contactos" ON taller_contactos;
DROP POLICY IF EXISTS "delete_taller_contactos" ON taller_contactos;
CREATE POLICY "select_taller_contactos" ON taller_contactos FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_taller_contactos" ON taller_contactos FOR INSERT TO authenticated WITH CHECK (has_permission('crear'));
CREATE POLICY "update_taller_contactos" ON taller_contactos FOR UPDATE TO authenticated USING (has_permission('editar'));
CREATE POLICY "delete_taller_contactos" ON taller_contactos FOR DELETE TO authenticated USING (has_permission('eliminar'));

GRANT SELECT ON taller_contactos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON taller_contactos TO authenticated;


-- ============================================================
-- E. FORMA DE PAGO EN DAÑO
-- ============================================================

DO $$ BEGIN
  CREATE TYPE forma_pago_dano AS ENUM ('cliente', 'pass', 'seguro');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE siniestros
  ADD COLUMN IF NOT EXISTS forma_pago forma_pago_dano DEFAULT 'cliente';


-- ============================================================
-- F. 6 TIPOS DE SERVICIO ADICIONALES
-- ============================================================

ALTER TYPE tipo_servicio_mant ADD VALUE IF NOT EXISTS 'revision_general';
ALTER TYPE tipo_servicio_mant ADD VALUE IF NOT EXISTS 'enderezado_pintura';
ALTER TYPE tipo_servicio_mant ADD VALUE IF NOT EXISTS 'reposicion_llave';
ALTER TYPE tipo_servicio_mant ADD VALUE IF NOT EXISTS 'sistema_electrico';
ALTER TYPE tipo_servicio_mant ADD VALUE IF NOT EXISTS 'revision_ac';
ALTER TYPE tipo_servicio_mant ADD VALUE IF NOT EXISTS 'revision_inyeccion';


-- ============================================================
-- G. 3 FECHAS ADICIONALES (entrega taller, estimada y real)
-- ============================================================

ALTER TABLE siniestros
  ADD COLUMN IF NOT EXISTS fecha_entrega_taller   DATE,
  ADD COLUMN IF NOT EXISTS fecha_estimada_entrega DATE,
  ADD COLUMN IF NOT EXISTS fecha_real_entrega     DATE;

ALTER TABLE ordenes_servicio
  ADD COLUMN IF NOT EXISTS fecha_entrega_taller   DATE,
  ADD COLUMN IF NOT EXISTS fecha_estimada_entrega DATE,
  ADD COLUMN IF NOT EXISTS fecha_real_entrega     DATE;


-- ============================================================
-- I. DESCUENTO COMO TIPO DE LÍNEA
-- ============================================================
-- Decisión: agregar 'descuento' al enum tipo_linea_cotizacion.
-- El usuario digita el monto a mano con signo negativo.
-- Se mantiene total_descuentos separado para mostrar en breakdown.

ALTER TYPE tipo_linea_cotizacion ADD VALUE IF NOT EXISTS 'descuento';

ALTER TABLE cotizaciones
  ADD COLUMN IF NOT EXISTS total_descuentos NUMERIC(12,2) DEFAULT 0;

ALTER TABLE ordenes_servicio
  ADD COLUMN IF NOT EXISTS total_descuentos NUMERIC(12,2) DEFAULT 0;

-- Actualizar trigger de totales — cotizaciones
CREATE OR REPLACE FUNCTION actualizar_totales_cotizacion()
RETURNS TRIGGER AS $$
DECLARE
  v_cot_id UUID;
BEGIN
  v_cot_id := COALESCE(NEW.cotizacion_id, OLD.cotizacion_id);

  UPDATE cotizaciones SET
    total_repuestos = COALESCE((
      SELECT SUM(subtotal) FROM cotizacion_lineas
      WHERE cotizacion_id = v_cot_id AND tipo = 'repuesto'
    ), 0),
    total_mano_obra = COALESCE((
      SELECT SUM(subtotal) FROM cotizacion_lineas
      WHERE cotizacion_id = v_cot_id AND tipo = 'mano_obra'
    ), 0),
    total_otros = COALESCE((
      SELECT SUM(subtotal) FROM cotizacion_lineas
      WHERE cotizacion_id = v_cot_id AND tipo = 'otro'
    ), 0),
    total_descuentos = COALESCE((
      SELECT SUM(subtotal) FROM cotizacion_lineas
      WHERE cotizacion_id = v_cot_id AND tipo = 'descuento'
    ), 0),
    total_general = COALESCE((
      SELECT SUM(subtotal) FROM cotizacion_lineas
      WHERE cotizacion_id = v_cot_id
    ), 0),
    updated_at = now()
  WHERE id = v_cot_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Actualizar trigger de totales — ordenes_servicio
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
    total_descuentos = COALESCE((
      SELECT SUM(subtotal) FROM orden_servicio_lineas
      WHERE orden_servicio_id = os_id AND tipo = 'descuento'
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


-- ============================================================
-- J. CHECKLIST MANUAL DE DOCUMENTOS (3 booleanos por registro)
-- ============================================================
-- Marcados manualmente por el encargado. Solo warning al cerrar
-- si alguno está desmarcado. NO bloquea el cierre.

ALTER TABLE siniestros
  ADD COLUMN IF NOT EXISTS tiene_prefactura BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tiene_proforma   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tiene_factura    BOOLEAN DEFAULT false;

ALTER TABLE ordenes_servicio
  ADD COLUMN IF NOT EXISTS tiene_prefactura BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tiene_proforma   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tiene_factura    BOOLEAN DEFAULT false;


-- ============================================================
-- ASEGURAR GRANTS DE service_role (idempotente)
-- ============================================================

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;


-- ============================================================
-- VERIFICACIONES (consultas de control para correr al final)
-- ============================================================
-- Descomentar para validar después de la ejecución:

-- SELECT COUNT(*) AS audit_triggers FROM pg_trigger WHERE tgname LIKE 'audit_%';
--   -- esperado: 10

-- SELECT id, rol, permisos FROM perfiles ORDER BY rol;
--   -- todos los rows deben tener permisos con los 4 flags

-- SELECT unnest(enum_range(NULL::tipo_servicio_mant));
--   -- debe incluir los 13 tipos (7 originales + 6 nuevos)

-- SELECT unnest(enum_range(NULL::tipo_linea_cotizacion));
--   -- debe incluir: repuesto, mano_obra, otro, descuento

-- SELECT count(*) AS contactos_migrados FROM taller_contactos WHERE es_principal = true;
--   -- esperado: cantidad de talleres con contacto/telefono llenos

-- FIN
