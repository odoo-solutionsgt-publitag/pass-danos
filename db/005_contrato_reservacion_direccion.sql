-- ============================================================
-- 005_contrato_reservacion_direccion.sql
-- Separar contrato (x_studio_no_contrato) de reservación (sale.order.name)
-- + nueva columna cliente_direccion
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. Agregar columnas nuevas
-- ────────────────────────────────────────────────────────────

ALTER TABLE siniestros
  ADD COLUMN IF NOT EXISTS reservacion_numero TEXT,
  ADD COLUMN IF NOT EXISTS cliente_direccion  TEXT;

ALTER TABLE ordenes_servicio
  ADD COLUMN IF NOT EXISTS reservacion_numero TEXT,
  ADD COLUMN IF NOT EXISTS cliente_direccion  TEXT;

COMMENT ON COLUMN siniestros.reservacion_numero IS
  'Número de reservación de Odoo (sale.order.name, ej: RSV-00403)';
COMMENT ON COLUMN siniestros.cliente_direccion IS
  'Dirección del cliente desde res.partner.street/street2/city';
COMMENT ON COLUMN siniestros.contrato_numero IS
  'Número de contrato real de Pass (sale.order.x_studio_no_contrato). Puede ser NULL si Odoo no lo tiene aún.';

COMMENT ON COLUMN ordenes_servicio.reservacion_numero IS
  'Número de reservación de Odoo (sale.order.name, ej: RSV-00403)';
COMMENT ON COLUMN ordenes_servicio.cliente_direccion IS
  'Dirección del cliente desde res.partner.street/street2/city';
COMMENT ON COLUMN ordenes_servicio.contrato_numero IS
  'Número de contrato real de Pass (sale.order.x_studio_no_contrato). Puede ser NULL.';

-- ────────────────────────────────────────────────────────────
-- 2. Migración de datos viejos
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

UPDATE ordenes_servicio
SET reservacion_numero = contrato_numero,
    contrato_numero    = NULL
WHERE reservacion_numero IS NULL
  AND contrato_numero IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 3. Permisos
-- ────────────────────────────────────────────────────────────

-- Las nuevas columnas heredan los permisos de la tabla.
-- Sin acción adicional necesaria.

COMMIT;

-- ────────────────────────────────────────────────────────────
-- VALIDACIÓN
-- ────────────────────────────────────────────────────────────

-- Estructura: deben aparecer las 2 columnas nuevas en cada tabla
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('siniestros', 'ordenes_servicio')
  AND column_name IN ('reservacion_numero', 'cliente_direccion', 'contrato_numero')
ORDER BY table_name, column_name;

-- Datos: ver cuántas filas se migraron
SELECT
  'siniestros' AS tabla,
  count(*) FILTER (WHERE reservacion_numero IS NOT NULL) AS con_reservacion,
  count(*) FILTER (WHERE contrato_numero    IS NOT NULL) AS con_contrato_real,
  count(*) FILTER (WHERE cliente_direccion  IS NOT NULL) AS con_direccion,
  count(*) AS total
FROM siniestros
UNION ALL
SELECT
  'ordenes_servicio',
  count(*) FILTER (WHERE reservacion_numero IS NOT NULL),
  count(*) FILTER (WHERE contrato_numero    IS NOT NULL),
  count(*) FILTER (WHERE cliente_direccion  IS NOT NULL),
  count(*)
FROM ordenes_servicio;
