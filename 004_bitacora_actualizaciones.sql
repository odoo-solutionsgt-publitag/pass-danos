-- ============================================================
-- 004_bitacora_actualizaciones.sql
-- Bitácora de actualización manual por daño o servicio
-- Append-only · auditada · alimenta el Reporte Diario
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. Tabla
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bitacora_actualizaciones (
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

  CONSTRAINT chk_bitacora_un_origen CHECK (
    (siniestro_id IS NOT NULL AND orden_servicio_id IS NULL) OR
    (siniestro_id IS NULL AND orden_servicio_id IS NOT NULL)
  )
);

COMMENT ON TABLE  bitacora_actualizaciones IS
  'Notas manuales append-only por daño o servicio. La última nota alimenta la columna Observaciones del Reporte Diario.';
COMMENT ON COLUMN bitacora_actualizaciones.siniestro_id IS
  'FK a siniestros; NULL si la nota es de un servicio.';
COMMENT ON COLUMN bitacora_actualizaciones.orden_servicio_id IS
  'FK a ordenes_servicio; NULL si la nota es de un daño.';

-- ────────────────────────────────────────────────────────────
-- 2. Índices
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bitacora_siniestro
  ON bitacora_actualizaciones(siniestro_id)
  WHERE siniestro_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bitacora_orden
  ON bitacora_actualizaciones(orden_servicio_id)
  WHERE orden_servicio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bitacora_created
  ON bitacora_actualizaciones(created_at DESC);

-- ────────────────────────────────────────────────────────────
-- 3. RLS — append-only para usuarios con permiso de editar
-- ────────────────────────────────────────────────────────────

ALTER TABLE bitacora_actualizaciones ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado
DROP POLICY IF EXISTS bitacora_select_all ON bitacora_actualizaciones;
CREATE POLICY bitacora_select_all
  ON bitacora_actualizaciones FOR SELECT
  TO authenticated
  USING (true);

-- Inserción: solo si tiene permiso 'editar'
DROP POLICY IF EXISTS bitacora_insert_with_permission ON bitacora_actualizaciones;
CREATE POLICY bitacora_insert_with_permission
  ON bitacora_actualizaciones FOR INSERT
  TO authenticated
  WITH CHECK (has_permission('editar'));

-- UPDATE y DELETE: sin policy → bloqueados por defecto (append-only)
-- (service_role bypassa RLS, mantiene capacidad de soporte / correcciones excepcionales)

-- ────────────────────────────────────────────────────────────
-- 4. Auditoría
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS audit_bitacora_actualizaciones ON bitacora_actualizaciones;
CREATE TRIGGER audit_bitacora_actualizaciones
  AFTER INSERT OR UPDATE OR DELETE ON bitacora_actualizaciones
  FOR EACH ROW
  EXECUTE FUNCTION audit_changes();

-- ────────────────────────────────────────────────────────────
-- 5. Permisos a nivel Postgres (GRANTs)
--    Necesarios además de RLS — sin esto, da "permission denied for table".
--    Las RLS policies controlan QUÉ filas; los GRANT controlan SI el rol
--    puede tocar la tabla del todo.
-- ────────────────────────────────────────────────────────────

GRANT ALL                ON bitacora_actualizaciones TO service_role;
GRANT SELECT, INSERT     ON bitacora_actualizaciones TO authenticated;
GRANT SELECT             ON bitacora_actualizaciones TO anon;

COMMIT;

-- ────────────────────────────────────────────────────────────
-- VALIDACIÓN (no se ejecuta dentro de la transacción)
-- ────────────────────────────────────────────────────────────

-- Verificar estructura
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'bitacora_actualizaciones'
ORDER BY ordinal_position;

-- Verificar policies
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'bitacora_actualizaciones';

-- Verificar trigger
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'bitacora_actualizaciones';
