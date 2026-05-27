# FASE 0 — Entorno y configuración inicial

**Estado**: ✅ Completado
**Bloqueante para**: todas las fases siguientes

---

## Objetivo

Dejar el entorno completo de desarrollo y producción listo: Supabase con schema cargado, backend Express deployado, frontend React deployado, autenticación funcionando y al menos un usuario admin operativo.

---

## Infraestructura desplegada

| Componente | URL / Identificador |
|-----------|---------------------|
| Repo GitHub | `odoo-solutionsgt-publitag/pass-danos` |
| Backend | https://api-danos.odoo-server.online |
| Frontend | https://gestion-danos.odoo-server.online |
| Supabase | `cxoqviwdryvjahykazpb` (us-west-2, plan NANO) |
| Odoo 19 | https://odoo-server.online (DB `odoo19server`) |
| Storage bucket | `documentos` — privado, 10MB, PDF/JPG/PNG/WebP |

---

## SQL ejecutado en Supabase

### Migration 001 (base — ejecutada en sesión inicial)
Tablas: `talleres`, `repuestos_catalogo`, `siniestros`, `cotizaciones`, `cotizacion_lineas`, `taller_ingresos`, `cobros`, `documentos`, `siniestro_timeline`, `perfiles`. Enums, triggers, RLS y seed de 9 talleres.

### Migration 002 — Servicios de mantenimiento
Archivo: `002_servicios_mantenimiento.sql`
Agrega: enums `tipo_servicio_mant`, `estado_orden_servicio`, tablas `ordenes_servicio`, `orden_servicio_lineas`, `orden_servicio_timeline`. Modifica `taller_ingresos` y `documentos` para aceptar `orden_servicio_id` además de `siniestro_id`. Triggers de número (SRV-YYYY-NNN), timeline y recálculo de totales.

### Fixes posteriores
```sql
-- Fix ambigüedad "anio" en trigger de numeración
CREATE OR REPLACE FUNCTION generar_numero_siniestro()
RETURNS TRIGGER AS $$
DECLARE v_anio TEXT; seq INTEGER;
BEGIN
  v_anio := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  SELECT COALESCE(MAX(CAST(SPLIT_PART(numero, '-', 3) AS INTEGER)), 0) + 1
  INTO seq FROM siniestros WHERE numero LIKE 'SIN-' || v_anio || '-%';
  NEW.numero := 'SIN-' || v_anio || '-' || LPAD(seq::TEXT, 3, '0');
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- Campo NIT del cliente
ALTER TABLE siniestros ADD COLUMN IF NOT EXISTS cliente_nit TEXT;
```

---

## Variables de entorno

### Backend (Coolify → pass-danos-backend)
```
PORT=3000
NODE_ENV=production
TZ=America/Guatemala
CORS_ORIGIN=https://gestion-danos.odoo-server.online
ODOO_URL=https://odoo-server.online
ODOO_DB=odoo19server
ODOO_API_USER=<usuario API Odoo>
ODOO_API_PASSWORD=<API key Odoo>
SUPABASE_URL=https://cxoqviwdryvjahykazpb.supabase.co
SUPABASE_SERVICE_KEY=<service_role key>
```

### Frontend (Coolify → pass-danos-frontend)
```
VITE_SUPABASE_URL=https://cxoqviwdryvjahykazpb.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable anon key>
VITE_API_URL=https://api-danos.odoo-server.online
```

---

## Coolify — configuración crítica

- **Backend**: Build Pack = **Dockerfile** (no Nixpacks, por timeouts del nix-env). Base Directory = `/backend`, Dockerfile Location = `Dockerfile` (relativo).
- **Frontend**: Build Pack = Nixpacks. Base Directory = `/frontend`. El `nixpacks.toml` fuerza `npm install --include=dev` para que Vite esté disponible en build.
- Si falla "exporting to image": ejecutar `docker system prune -a --volumes -f` en el VPS y reintentar.

---

## Usuario admin inicial

Creado en Supabase Auth + fila en `perfiles`:
```sql
INSERT INTO perfiles (id, nombre_completo, rol, activo)
VALUES ('<uuid del auth.users>', 'Admin Pass', 'admin', true);
```

---

## Criterio de éxito (cumplido)

- [x] `GET /health` retorna 200 con `odoo.connected=true` y `supabase.connected=true`
- [x] Login funciona en producción
- [x] El usuario admin entra al Dashboard
- [x] Migration 002 ejecutada y verificada
