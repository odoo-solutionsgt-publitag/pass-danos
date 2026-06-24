-- Migración 011: Nuevos campos en repuestos_catalogo
-- Plan: docs/Plan_Implementacion_Nuevo_Formulario_Repuestos.md
-- Agrega: precio_mano_obra, precio_total, categoria
-- precio_ref existente pasa a ser "Precio Lista" en la UI (columna intacta)

ALTER TABLE repuestos_catalogo
  ADD COLUMN IF NOT EXISTS precio_mano_obra NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS categoria        TEXT NOT NULL DEFAULT 'repuesto'
    CHECK (categoria IN ('repuesto', 'rayones_golpes_leves', 'otro'));

-- Recalcular precio_total en registros existentes
UPDATE repuestos_catalogo
SET precio_total = COALESCE(precio_ref, 0)
WHERE precio_total = 0;

-- Trigger: mantener precio_total = precio_ref + precio_mano_obra automáticamente
CREATE OR REPLACE FUNCTION sync_precio_total_repuesto()
RETURNS TRIGGER AS $$
BEGIN
  NEW.precio_total := COALESCE(NEW.precio_ref, 0) + COALESCE(NEW.precio_mano_obra, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_precio_total_repuesto ON repuestos_catalogo;

CREATE TRIGGER trg_sync_precio_total_repuesto
  BEFORE INSERT OR UPDATE OF precio_ref, precio_mano_obra
  ON repuestos_catalogo
  FOR EACH ROW EXECUTE FUNCTION sync_precio_total_repuesto();

-- Permisos service_role (por si acaso)
GRANT ALL ON repuestos_catalogo TO service_role;
