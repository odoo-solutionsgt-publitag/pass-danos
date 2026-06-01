-- ============================================================
-- PASS RENT A CAR — Gestión de Daños
-- Migration: 002_servicios_mantenimiento.sql
-- Proyecto: Odoo Gestion Danos (cxoqviwdryvjahykazpb)
-- Agrega módulo de Servicios de Mantenimiento
-- ============================================================

-- ============================================================
-- 1. NUEVOS ENUMS
-- ============================================================

CREATE TYPE tipo_servicio_mant AS ENUM (
  'servicio_menor',
  'servicio_mayor',
  'cambio_llantas',
  'cambio_bateria',
  'alineacion_balanceo',
  'cambio_frenos',
  'otro'
);

CREATE TYPE estado_orden_servicio AS ENUM (
  'programado',
  'aprobado',
  'en_proceso',
  'completado',
  'cancelado'
);

-- ============================================================
-- 2. TABLA PRINCIPAL: ORDENES DE SERVICIO
-- ============================================================

CREATE TABLE ordenes_servicio (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                TEXT UNIQUE NOT NULL DEFAULT '',

  placa                 TEXT NOT NULL,
  tipo_vehiculo         TEXT,
  marca                 TEXT,
  linea                 TEXT,
  anio                  INTEGER,
  odoo_product_id       INTEGER,

  tipo_servicio         tipo_servicio_mant NOT NULL DEFAULT 'otro',
  descripcion           TEXT,
  fecha_programada      DATE,
  kilometraje           INTEGER,

  estado                estado_orden_servicio NOT NULL DEFAULT 'programado',
  requiere_autorizacion BOOLEAN DEFAULT FALSE,
  autorizado_por        TEXT,
  fecha_autorizacion    DATE,

  taller_id             UUID REFERENCES talleres(id),

  total_repuestos       NUMERIC(12,2) DEFAULT 0,
  total_mano_obra       NUMERIC(12,2) DEFAULT 0,
  total_otros           NUMERIC(12,2) DEFAULT 0,
  total_general         NUMERIC(12,2) DEFAULT 0,

  registrado_por        UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ordenes_servicio_placa ON ordenes_servicio(placa);
CREATE INDEX idx_ordenes_servicio_estado ON ordenes_servicio(estado);
CREATE INDEX idx_ordenes_servicio_fecha ON ordenes_servicio(fecha_programada DESC);

-- ============================================================
-- 3. LÍNEAS DE DETALLE
-- ============================================================

CREATE TABLE orden_servicio_lineas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_servicio_id UUID NOT NULL REFERENCES ordenes_servicio(id) ON DELETE CASCADE,

  tipo              tipo_linea_cotizacion NOT NULL DEFAULT 'repuesto',
  descripcion       TEXT NOT NULL,
  repuesto_id       UUID REFERENCES repuestos_catalogo(id),
  cantidad          NUMERIC(10,2) DEFAULT 1,
  precio_unitario   NUMERIC(12,2) DEFAULT 0,
  subtotal          NUMERIC(12,2) DEFAULT 0,

  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_orden_servicio_lineas ON orden_servicio_lineas(orden_servicio_id);

-- ============================================================
-- 4. TIMELINE / AUDITORÍA
-- ============================================================

CREATE TABLE orden_servicio_timeline (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_servicio_id UUID NOT NULL REFERENCES ordenes_servicio(id) ON DELETE CASCADE,

  estado_anterior   estado_orden_servicio,
  estado_nuevo      estado_orden_servicio NOT NULL,
  accion            TEXT NOT NULL,
  detalle           TEXT,

  usuario_id        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_os_timeline ON orden_servicio_timeline(orden_servicio_id);

-- ============================================================
-- 5. MODIFICAR taller_ingresos: soportar siniestros Y servicios
-- ============================================================

ALTER TABLE taller_ingresos ALTER COLUMN siniestro_id DROP NOT NULL;

ALTER TABLE taller_ingresos
  ADD COLUMN orden_servicio_id UUID REFERENCES ordenes_servicio(id) ON DELETE CASCADE;

ALTER TABLE taller_ingresos
  ADD CONSTRAINT chk_taller_ingreso_origen
  CHECK (
    (siniestro_id IS NOT NULL AND orden_servicio_id IS NULL) OR
    (siniestro_id IS NULL AND orden_servicio_id IS NOT NULL)
  );

CREATE INDEX idx_taller_ingresos_orden ON taller_ingresos(orden_servicio_id);

-- ============================================================
-- 6. MODIFICAR documentos: soportar documentos de servicios
-- ============================================================

ALTER TABLE documentos ALTER COLUMN siniestro_id DROP NOT NULL;

ALTER TABLE documentos
  ADD COLUMN orden_servicio_id UUID REFERENCES ordenes_servicio(id) ON DELETE CASCADE;

ALTER TABLE documentos
  ADD CONSTRAINT chk_documento_origen
  CHECK (
    siniestro_id IS NOT NULL OR orden_servicio_id IS NOT NULL
  );

CREATE INDEX idx_documentos_orden ON documentos(orden_servicio_id);

-- ============================================================
-- 7. TRIGGERS
-- ============================================================

-- Número secuencial SRV-YYYY-NNN
-- Variable v_anio (no `anio`) para evitar ambigüedad con la columna anio de ordenes_servicio
CREATE OR REPLACE FUNCTION generar_numero_servicio()
RETURNS TRIGGER AS $$
DECLARE
  v_anio TEXT;
  seq    INTEGER;
BEGIN
  v_anio := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(numero, '-', 3) AS INTEGER)
  ), 0) + 1
  INTO seq
  FROM ordenes_servicio
  WHERE numero LIKE 'SRV-' || v_anio || '-%';

  NEW.numero := 'SRV-' || v_anio || '-' || LPAD(seq::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_numero_servicio
  BEFORE INSERT ON ordenes_servicio
  FOR EACH ROW
  WHEN (NEW.numero IS NULL OR NEW.numero = '')
  EXECUTE FUNCTION generar_numero_servicio();

-- Timeline de cambios de estado
CREATE OR REPLACE FUNCTION registrar_cambio_estado_servicio()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.estado IS DISTINCT FROM NEW.estado THEN
    INSERT INTO orden_servicio_timeline (
      orden_servicio_id, estado_anterior, estado_nuevo, accion, detalle
    ) VALUES (
      NEW.id,
      OLD.estado,
      NEW.estado,
      'Cambio de estado',
      'De ' || OLD.estado || ' a ' || NEW.estado
    );
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orden_servicio_estado_timeline
  BEFORE UPDATE ON ordenes_servicio
  FOR EACH ROW
  EXECUTE FUNCTION registrar_cambio_estado_servicio();

-- Recalcular totales
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
    total_general = COALESCE((
      SELECT SUM(subtotal) FROM orden_servicio_lineas
      WHERE orden_servicio_id = os_id
    ), 0),
    updated_at = now()
  WHERE id = os_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orden_servicio_totales
  AFTER INSERT OR UPDATE OR DELETE ON orden_servicio_lineas
  FOR EACH ROW
  EXECUTE FUNCTION actualizar_totales_orden_servicio();

-- updated_at automático
CREATE TRIGGER trg_ordenes_servicio_updated
  BEFORE UPDATE ON ordenes_servicio
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE ordenes_servicio ENABLE ROW LEVEL SECURITY;
ALTER TABLE orden_servicio_lineas ENABLE ROW LEVEL SECURITY;
ALTER TABLE orden_servicio_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_ordenes" ON ordenes_servicio FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_os_lineas" ON orden_servicio_lineas FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_os_timeline" ON orden_servicio_timeline FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert_ordenes" ON ordenes_servicio FOR INSERT TO authenticated
  WITH CHECK (get_user_rol() IN ('admin', 'agente_senior', 'agente', 'operaciones'));
CREATE POLICY "update_ordenes" ON ordenes_servicio FOR UPDATE TO authenticated
  USING (get_user_rol() IN ('admin', 'agente_senior', 'agente', 'operaciones'));

CREATE POLICY "all_os_lineas" ON orden_servicio_lineas FOR ALL TO authenticated
  USING (get_user_rol() IN ('admin', 'agente_senior', 'agente', 'operaciones'));

CREATE POLICY "insert_os_timeline" ON orden_servicio_timeline FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============================================================
-- 9. GRANTS
-- ============================================================

GRANT SELECT ON ordenes_servicio, orden_servicio_lineas, orden_servicio_timeline TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ordenes_servicio, orden_servicio_lineas, orden_servicio_timeline TO authenticated;
