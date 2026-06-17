-- ============================================================
-- 009_pases_salida.sql
-- Módulo Pase de Salida Interno (PASI-YYYY-NNNN)
--
-- Implementación:
--   1. Enum motivo_pase_salida (5 motivos)
--   2. Enum estado_pase_salida  (abierto | cerrado | anulado)
--   3. Tabla pases_salida con constraint origen exclusivo
--   4. Índices únicos parciales (1 pase activo por Daño/Servicio)
--   5. Trigger: correlativo PASI-YYYY-NNNN
--   6. Trigger: updated_at automático
--   7. RLS: SELECT todos autenticados, INSERT/UPDATE roles con puedeEditar
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. Enums
-- ────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE motivo_pase_salida AS ENUM (
    'taller_reparacion',
    'taller_servicio',
    'gasolinera',
    'diligencias',
    'asignado_personal'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE estado_pase_salida AS ENUM (
    'abierto',
    'cerrado',
    'anulado'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. Tabla principal
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pases_salida (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero              TEXT UNIQUE NOT NULL,        -- PASI-YYYY-NNNN (trigger)

  -- Vínculo al origen (exactamente uno de los dos)
  siniestro_id        UUID REFERENCES siniestros(id) ON DELETE SET NULL,
  orden_servicio_id   UUID REFERENCES ordenes_servicio(id) ON DELETE SET NULL,
  contrato_referencia TEXT NOT NULL,               -- "SIN-2026-042" ó "SRV-2026-017"

  -- Estado
  estado              estado_pase_salida NOT NULL DEFAULT 'abierto',

  -- Datos del vehículo (snapshot al momento de crear)
  vehiculo_placa      TEXT NOT NULL,
  vehiculo_tipo       TEXT,                        -- "TOYOTA PICK UP HI LUX 2025"
  vehiculo_color      TEXT,
  odoo_product_id     INTEGER,                     -- para futuras consultas a Odoo

  -- Destino y piloto
  lugar_taller        TEXT,
  motivo_salida       motivo_pase_salida NOT NULL,
  piloto_pass         TEXT NOT NULL,

  -- Datos de SALIDA
  combustible_salida  TEXT NOT NULL,               -- 'Full','7/8','6/8','5/8','1/2','3/8','1/8'
  kilometraje_salida  NUMERIC(10,0),
  fecha_salida        DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_salida         TEXT NOT NULL,               -- 'HH:MM'

  -- Datos de ENTRADA (se completan al cerrar)
  combustible_entrada TEXT,
  kilometraje_entrada NUMERIC(10,0),
  fecha_entrada       DATE,
  hora_entrada        TEXT,

  -- Autorización
  usuario_responsable TEXT,                        -- nombre del usuario que creó el Daño/Servicio
  registrado_por      UUID REFERENCES auth.users(id),

  -- Metadata
  fecha_hora_sistema  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_pase_origen CHECK (
    (siniestro_id IS NOT NULL AND orden_servicio_id IS NULL) OR
    (siniestro_id IS NULL AND orden_servicio_id IS NOT NULL)
  )
);

COMMENT ON TABLE pases_salida IS
  'Documento interno que autoriza el retiro de un vehículo de la flota. Generado desde un Daño o Servicio. Correlativo PASI-YYYY-NNNN.';

-- ────────────────────────────────────────────────────────────
-- 3. Índices únicos parciales
--    Un solo pase activo (no anulado) por Daño o Servicio
-- ────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_pase_siniestro
  ON pases_salida(siniestro_id)
  WHERE siniestro_id IS NOT NULL AND estado != 'anulado';

CREATE UNIQUE INDEX IF NOT EXISTS uq_pase_servicio
  ON pases_salida(orden_servicio_id)
  WHERE orden_servicio_id IS NOT NULL AND estado != 'anulado';

-- Índice de apoyo para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_pases_salida_estado
  ON pases_salida(estado);

CREATE INDEX IF NOT EXISTS idx_pases_salida_placa
  ON pases_salida(vehiculo_placa);

-- ────────────────────────────────────────────────────────────
-- 4. Trigger: correlativo PASI-YYYY-NNNN
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generar_numero_pase_salida()
RETURNS TRIGGER AS $$
DECLARE
  yr   TEXT := TO_CHAR(NOW(), 'YYYY');
  seq  INTEGER;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(numero, '-', 3) AS INTEGER)
  ), 0) + 1
  INTO seq
  FROM pases_salida
  WHERE numero LIKE 'PASI-' || yr || '-%';

  NEW.numero := 'PASI-' || yr || '-' || LPAD(seq::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_numero_pase_salida ON pases_salida;
CREATE TRIGGER trg_numero_pase_salida
  BEFORE INSERT ON pases_salida
  FOR EACH ROW EXECUTE FUNCTION generar_numero_pase_salida();

-- ────────────────────────────────────────────────────────────
-- 5. Trigger: updated_at automático
--    Reutiliza set_updated_at() que ya existe en el esquema
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_pases_salida_updated_at ON pases_salida;
CREATE TRIGGER trg_pases_salida_updated_at
  BEFORE UPDATE ON pases_salida
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 6. Row Level Security
-- ────────────────────────────────────────────────────────────

ALTER TABLE pases_salida ENABLE ROW LEVEL SECURITY;

-- SELECT: todos los usuarios autenticados
DROP POLICY IF EXISTS pases_salida_select ON pases_salida;
CREATE POLICY pases_salida_select
  ON pases_salida FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: roles con puedeEditar
DROP POLICY IF EXISTS pases_salida_insert ON pases_salida;
CREATE POLICY pases_salida_insert
  ON pases_salida FOR INSERT
  TO authenticated
  WITH CHECK (has_permission('crear'));

-- UPDATE: roles con puedeEditar (cierre y anulación)
DROP POLICY IF EXISTS pases_salida_update ON pases_salida;
CREATE POLICY pases_salida_update
  ON pases_salida FOR UPDATE
  TO authenticated
  USING (has_permission('editar'))
  WITH CHECK (has_permission('editar'));

-- No se permite DELETE — solo anular vía UPDATE estado='anulado'

-- ────────────────────────────────────────────────────────────
-- 7. Permisos service_role (por si acaso)
-- ────────────────────────────────────────────────────────────

GRANT ALL ON TABLE pases_salida TO service_role;
GRANT ALL ON TABLE pases_salida TO authenticated;

COMMIT;

-- ────────────────────────────────────────────────────────────
-- VALIDACIÓN
-- ────────────────────────────────────────────────────────────

-- 1. Verificar tabla y columnas
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'pases_salida'
ORDER BY ordinal_position;

-- 2. Verificar enums
SELECT typname, enumlabel
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE typname IN ('motivo_pase_salida', 'estado_pase_salida')
ORDER BY typname, enumsortorder;

-- 3. Verificar índices únicos parciales
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'pases_salida'
  AND indexname LIKE 'uq_%';

-- 4. Verificar triggers
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'pases_salida'
ORDER BY trigger_name;

-- 5. Verificar RLS
SELECT polname, polcmd, polroles::text
FROM pg_policy
WHERE polrelid = 'pases_salida'::regclass
ORDER BY polname;
