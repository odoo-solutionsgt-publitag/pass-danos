-- ============================================================
-- 008_cotizacion_multiple.sql
-- Soportar dos modos de cotización por daño:
--   - unica:    1 sola aprobada, las demás se rechazan, costo_pass = su total
--   - multiple: varias aprobadas a la vez, costo_pass = SUM de aprobadas
--
-- Implementación:
--   1. Columna siniestros.tipo_cotizacion (TEXT con CHECK)
--   2. Reescritura del trigger sync_costo_pass_from_approved_quote
--      para detectar el modo y recalcular en consecuencia.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. Nueva columna
-- ────────────────────────────────────────────────────────────

ALTER TABLE siniestros
  ADD COLUMN IF NOT EXISTS tipo_cotizacion TEXT
    NOT NULL DEFAULT 'unica';

-- Agregar CHECK (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'siniestros_tipo_cotizacion_check'
  ) THEN
    ALTER TABLE siniestros
      ADD CONSTRAINT siniestros_tipo_cotizacion_check
      CHECK (tipo_cotizacion IN ('unica', 'multiple'));
  END IF;
END $$;

COMMENT ON COLUMN siniestros.tipo_cotizacion IS
  'Modo del proceso de cotización: unica (1 ganadora) o multiple (varias aprobadas, suma de totales). Se bloquea en frontend una vez que existe al menos 1 cotización con líneas.';

-- ────────────────────────────────────────────────────────────
-- 2. Reescritura del trigger
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_costo_pass_from_approved_quote()
RETURNS TRIGGER AS $$
DECLARE
  v_siniestro_id UUID;
  v_tipo         TEXT;
  v_total        NUMERIC;
BEGIN
  -- Resolver el siniestro afectado
  v_siniestro_id := COALESCE(
    (SELECT siniestro_id FROM cotizaciones WHERE id = NEW.cotizacion_id),
    (SELECT siniestro_id FROM cotizaciones WHERE id = OLD.cotizacion_id)
  );

  IF v_siniestro_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Tipo de cotización del siniestro
  SELECT tipo_cotizacion INTO v_tipo
  FROM siniestros
  WHERE id = v_siniestro_id;

  -- Calcular total según modo
  IF v_tipo = 'multiple' THEN
    -- Suma de TODAS las cotizaciones aprobadas
    SELECT COALESCE(SUM(total_general), 0) INTO v_total
    FROM cotizaciones
    WHERE siniestro_id = v_siniestro_id
      AND estado = 'aprobada';
  ELSE
    -- Modo único: total de la (única) aprobada (puede haber 0 si recién se rechazó)
    SELECT COALESCE(total_general, 0) INTO v_total
    FROM cotizaciones
    WHERE siniestro_id = v_siniestro_id
      AND estado = 'aprobada'
    LIMIT 1;

    -- Si no hay aprobada, total queda en 0
    v_total := COALESCE(v_total, 0);
  END IF;

  -- Actualizar siniestro
  UPDATE siniestros
  SET costo_pass = v_total,
      margen     = COALESCE(monto_cliente, 0) - v_total
  WHERE id = v_siniestro_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Nota: el trigger en sí (DROP/CREATE TRIGGER) no se toca — sigue
-- apuntando a esta función reescrita. Las cotizacion_lineas siguen
-- recalculando los totales via su propio trigger (actualizar_totales).

COMMIT;

-- ────────────────────────────────────────────────────────────
-- VALIDACIÓN
-- ────────────────────────────────────────────────────────────

-- 1. Verificar la columna y su default
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'siniestros'
  AND column_name = 'tipo_cotizacion';

-- 2. Verificar el CHECK
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname = 'siniestros_tipo_cotizacion_check';

-- 3. Verificar que la función se actualizó
SELECT proname, pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'sync_costo_pass_from_approved_quote';

-- 4. Distribución actual de tipos en los daños
SELECT tipo_cotizacion, count(*) AS cantidad
FROM siniestros
GROUP BY tipo_cotizacion
ORDER BY tipo_cotizacion;
-- Esperado: todos en 'unica' (default)
