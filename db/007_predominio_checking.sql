-- ============================================================
-- 007_predominio_checking.sql
-- 3 campos operacionales nuevos para daños:
--   1. ubicacion_vehiculo  (pass | taller | otro)
--   2. estado_checking     (workflow operacional de 6 estados)
--   3. disponible_renta    (BOOLEAN, sincroniza con Odoo)
--
-- NOTA: solo aplica a siniestros (no a ordenes_servicio).
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. Enums
-- ────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE ubicacion_vehiculo AS ENUM ('pass', 'taller', 'otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_checking_dano AS ENUM (
    'pre_diagnostico',
    'diagnostico_cotizacion',
    'reparacion',
    'revision_final',
    'entrega_proveedor',
    'dano_completo'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────
-- 2. Columnas en siniestros
-- ────────────────────────────────────────────────────────────

ALTER TABLE siniestros
  ADD COLUMN IF NOT EXISTS ubicacion_vehiculo ubicacion_vehiculo   NOT NULL DEFAULT 'pass',
  ADD COLUMN IF NOT EXISTS ubicacion_detalle  TEXT,
  ADD COLUMN IF NOT EXISTS estado_checking    estado_checking_dano NOT NULL DEFAULT 'pre_diagnostico',
  ADD COLUMN IF NOT EXISTS disponible_renta   BOOLEAN              NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN siniestros.ubicacion_vehiculo IS
  'Ubicación física actual del vehículo: pass | taller | otro';
COMMENT ON COLUMN siniestros.ubicacion_detalle IS
  'Texto libre opcional (típicamente se llena cuando ubicacion=otro).';
COMMENT ON COLUMN siniestros.estado_checking IS
  'Etapa operacional del proceso de inspección/reparación. Ortogonal a estado admin. dano_completo = pérdida total.';
COMMENT ON COLUMN siniestros.disponible_renta IS
  'Si Pass puede o no rentar el vehículo. FALSE→Odoo "En Reparación", TRUE→Odoo "Disponible".';

COMMIT;

-- ────────────────────────────────────────────────────────────
-- VALIDACIÓN
-- ────────────────────────────────────────────────────────────

SELECT column_name, data_type, udt_name, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'siniestros'
  AND column_name IN ('ubicacion_vehiculo', 'ubicacion_detalle', 'estado_checking', 'disponible_renta')
ORDER BY column_name;

SELECT typname, enumlabel
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE typname IN ('ubicacion_vehiculo', 'estado_checking_dano')
ORDER BY typname, e.enumsortorder;
