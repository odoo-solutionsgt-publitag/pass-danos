-- ============================================================
-- 006_reset_datos_produccion.sql
-- Limpia datos operacionales para comenzar producción "en limpio".
--
-- CONSERVA:
--   ✅ Estructura completa de tablas, enums, triggers, RLS, funciones
--   ✅ auth.users + perfiles (cuentas y permisos)
--   ✅ Catálogos: talleres, taller_contactos, repuestos_catalogo
--
-- BORRA:
--   ❌ Todos los siniestros (y sus cotizaciones, líneas, cobros,
--      documentos, timeline, bitácoras vía ON DELETE CASCADE)
--   ❌ Todas las órdenes de servicio (y sus líneas, timeline, etc.)
--   ❌ taller_ingresos (cascada desde ambas)
--   ❌ audit_log completo (limpia ruido de pruebas)
--
-- REQUIERE PASO APARTE:
--   ⚠️  Archivos físicos en Storage bucket "documentos" — borrar
--      manualmente desde Supabase Studio → Storage.
--
-- ANTES DE EJECUTAR: Toma backup desde Supabase Studio
--   (Database → Backups → Create backup) si quieres reversibilidad.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 0. Verificar estado actual (no destructivo)
-- ────────────────────────────────────────────────────────────

SELECT 'siniestros'              AS tabla, count(*) AS filas FROM siniestros
UNION ALL SELECT 'ordenes_servicio',                 count(*) FROM ordenes_servicio
UNION ALL SELECT 'cotizaciones',                     count(*) FROM cotizaciones
UNION ALL SELECT 'cotizacion_lineas',                count(*) FROM cotizacion_lineas
UNION ALL SELECT 'orden_servicio_lineas',            count(*) FROM orden_servicio_lineas
UNION ALL SELECT 'taller_ingresos',                  count(*) FROM taller_ingresos
UNION ALL SELECT 'cobros',                           count(*) FROM cobros
UNION ALL SELECT 'documentos',                       count(*) FROM documentos
UNION ALL SELECT 'siniestro_timeline',               count(*) FROM siniestro_timeline
UNION ALL SELECT 'orden_servicio_timeline',          count(*) FROM orden_servicio_timeline
UNION ALL SELECT 'bitacora_actualizaciones',         count(*) FROM bitacora_actualizaciones
UNION ALL SELECT 'audit_log',                        count(*) FROM audit_log
UNION ALL SELECT '---catálogos (NO se tocan)---',    NULL
UNION ALL SELECT 'talleres',                         count(*) FROM talleres
UNION ALL SELECT 'taller_contactos',                 count(*) FROM taller_contactos
UNION ALL SELECT 'repuestos_catalogo',               count(*) FROM repuestos_catalogo
UNION ALL SELECT 'perfiles',                         count(*) FROM perfiles;

-- ────────────────────────────────────────────────────────────
-- 1. Borrado transaccional
--
-- Todo dentro de un BEGIN/COMMIT — si algo falla, se hace rollback
-- completo y la base queda como estaba.
-- ────────────────────────────────────────────────────────────

BEGIN;

-- Daños (cascada a cotizaciones, lineas, cobros, documentos,
-- siniestro_timeline, bitacora donde siniestro_id, taller_ingresos
-- donde siniestro_id)
DELETE FROM siniestros;

-- Servicios (cascada a orden_servicio_lineas, orden_servicio_timeline,
-- documentos donde orden_servicio_id, bitacora donde orden_servicio_id,
-- taller_ingresos donde orden_servicio_id)
DELETE FROM ordenes_servicio;

-- Defensa en profundidad: si quedara algún registro huérfano por
-- un CASCADE no configurado, lo borramos explícitamente.
DELETE FROM cotizacion_lineas;
DELETE FROM cotizaciones;
DELETE FROM orden_servicio_lineas;
DELETE FROM orden_servicio_timeline;
DELETE FROM siniestro_timeline;
DELETE FROM taller_ingresos;
DELETE FROM cobros;
DELETE FROM documentos;
DELETE FROM bitacora_actualizaciones;

-- Limpiar bitácora de auditoría (incluye los DELETEs que acabamos
-- de hacer, los cuales generaron filas en audit_log)
TRUNCATE TABLE audit_log RESTART IDENTITY;

COMMIT;

-- ────────────────────────────────────────────────────────────
-- 2. Verificación final
--    Todas las filas deben mostrar resultado = "OK" y filas = 0.
-- ────────────────────────────────────────────────────────────

SELECT
  tabla,
  filas,
  CASE WHEN filas = 0 THEN 'OK' ELSE 'PENDIENTE LIMPIAR' END AS resultado
FROM (
            SELECT 'siniestros'               AS tabla, count(*) AS filas FROM siniestros
  UNION ALL SELECT 'ordenes_servicio',                  count(*)          FROM ordenes_servicio
  UNION ALL SELECT 'cotizaciones',                      count(*)          FROM cotizaciones
  UNION ALL SELECT 'cotizacion_lineas',                 count(*)          FROM cotizacion_lineas
  UNION ALL SELECT 'orden_servicio_lineas',             count(*)          FROM orden_servicio_lineas
  UNION ALL SELECT 'orden_servicio_timeline',           count(*)          FROM orden_servicio_timeline
  UNION ALL SELECT 'siniestro_timeline',                count(*)          FROM siniestro_timeline
  UNION ALL SELECT 'taller_ingresos',                   count(*)          FROM taller_ingresos
  UNION ALL SELECT 'cobros',                            count(*)          FROM cobros
  UNION ALL SELECT 'documentos',                        count(*)          FROM documentos
  UNION ALL SELECT 'bitacora_actualizaciones',          count(*)          FROM bitacora_actualizaciones
  UNION ALL SELECT 'audit_log',                         count(*)          FROM audit_log
) t
ORDER BY tabla;
