-- ============================================================
-- 005_contrato_reservacion_direccion.sql
-- Separar contrato (x_studio_no_contrato) de reservación (sale.order.name)
-- + nueva columna cliente_direccion
--
-- NOTA: solo aplica a siniestros. ordenes_servicio no tiene campos
-- de contrato ni cliente (los servicios son mantenimiento interno
-- de Pass, no están atados a un contrato de renta).
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. Agregar columnas nuevas a siniestros
-- ────────────────────────────────────────────────────────────

ALTER TABLE siniestros
  ADD COLUMN IF NOT EXISTS reservacion_numero TEXT,
  ADD COLUMN IF NOT EXISTS cliente_direccion  TEXT;

COMMENT ON COLUMN siniestros.reservacion_numero IS
  'Número de reservación de Odoo (sale.order.name, ej: RSV-00403)';
COMMENT ON COLUMN siniestros.cliente_direccion IS
  'Dirección del cliente desde res.partner.street/street2/city';
COMMENT ON COLUMN siniestros.contrato_numero IS
  'Número de contrato real de Pass (sale.order.x_studio_no_contrato). Puede ser NULL si Odoo no lo tiene aún.';

-- ────────────────────────────────────────────────────────────
-- 2. Migración de datos viejos en siniestros
--
--    Históricamente, contrato_numero almacenaba el sale.order.name
--    (que en realidad es la reservación). Movemos ese contenido a
--    reservacion_numero y limpiamos contrato_numero para que el
--    botón "Refrescar" lo llene con el contrato real desde Odoo.
--
--    Solo migra filas donde reservacion_numero está NULL (idempotente).
-- ────────────────────────────────────────────────────────────

UPDATE siniestros
SET reservacion_numero = contrato_numero,
    contrato_numero    = NULL
WHERE reservacion_numero IS NULL
  AND contrato_numero IS NOT NULL;

COMMIT;

-- ────────────────────────────────────────────────────────────
-- VALIDACIÓN
-- ────────────────────────────────────────────────────────────

-- Estructura: deben aparecer las 3 columnas en siniestros
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'siniestros'
  AND column_name IN ('reservacion_numero', 'cliente_direccion', 'contrato_numero')
ORDER BY column_name;

-- Datos: ver cuántas filas se migraron
SELECT
  count(*) FILTER (WHERE reservacion_numero IS NOT NULL) AS con_reservacion,
  count(*) FILTER (WHERE contrato_numero    IS NOT NULL) AS con_contrato_real,
  count(*) FILTER (WHERE cliente_direccion  IS NOT NULL) AS con_direccion,
  count(*) AS total
FROM siniestros;
