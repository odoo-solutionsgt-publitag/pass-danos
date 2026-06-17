-- ============================================================
-- 010_pase_independiente.sql
-- Permite pases de salida independientes (sin daño ni servicio)
-- para motivos: gasolinera, diligencias, asignado al personal
-- ============================================================

BEGIN;

-- 1. Quitar constraint que exigía exactamente uno de los dos IDs
ALTER TABLE pases_salida DROP CONSTRAINT IF EXISTS chk_pase_origen;

-- 2. Nuevo constraint: permite 3 casos:
--    (a) vinculado a daño     → siniestro_id NOT NULL, orden_servicio_id NULL
--    (b) vinculado a servicio → orden_servicio_id NOT NULL, siniestro_id NULL
--    (c) independiente        → ambos NULL
--    Sigue prohibiendo: ambos NOT NULL al mismo tiempo
ALTER TABLE pases_salida ADD CONSTRAINT chk_pase_origen CHECK (
  NOT (siniestro_id IS NOT NULL AND orden_servicio_id IS NOT NULL)
);

-- 3. contrato_referencia ahora nullable (los pases independientes no tienen referencia)
ALTER TABLE pases_salida ALTER COLUMN contrato_referencia DROP NOT NULL;

-- 4. Flag para saber si este pase cambió el estatus en Odoo
--    → al cerrar el pase, si TRUE se revierte a 'Disponible'
ALTER TABLE pases_salida ADD COLUMN IF NOT EXISTS cambio_status_odoo BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;

-- Verificación
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'pases_salida'
  AND column_name IN ('contrato_referencia', 'cambio_status_odoo')
ORDER BY column_name;

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'pases_salida'::regclass AND contype = 'c';
