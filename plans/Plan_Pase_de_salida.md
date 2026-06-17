# Plan: Módulo "Pase de Salida Interno"

**Fecha inicio**: 2026-06-16  
**Estado**: Aprobado — listo para implementar

---

## Descripción del módulo

El **Pase de Salida Interno** es un documento que autoriza a empleados de Pass Rent a Car a retirar un vehículo del parque vehicular. Cada pase tiene un correlativo único (`PASI-2026-0001`), similar al patrón usado en Daños (`SIN-YYYY-NNN`) y Servicios.

El pase se genera desde el detalle de un Daño o un Servicio, capturando datos adicionales (piloto, combustible, motivo) y produciendo el PDF AcroForm del documento oficial. Cuando el vehículo regresa, el pase se "cierra" registrando los datos de entrada.

---

## Campos AcroForm del PDF base

Archivo fuente: `public/pdfs/Pase-Salida-Interno-Pass.pdf`

| Campo AcroForm | Corresponde a | Origen |
|----------------|--------------|--------|
| `no_pase_salida_interno` | Número del pase (correlativo) | Auto-generado (PASI-YYYY-NNNN) |
| `contrato_referencia` | Referencia del Daño o Servicio | `siniestros.numero` ó `ordenes_servicio.numero` |
| `vehiculo_placa` | No. Placa | `siniestros.placa` ó `ordenes_servicio.placa` |
| `vehiculo_tipo` | Tipo + Marca + Línea + Año | Construido: `"TOYOTA PICK UP HI LUX 2025"` |
| `vehiculo_color` | Color del vehículo | `x_studio_color_vehiculo` en Odoo (campo nuevo a leer) |
| `lugar_taller` | Lugar/Taller a trasladarse | Capturado al generar el pase |
| `piloto_pass` | Piloto interno de Pass | Capturado al generar el pase |
| `combustible_salida` | Combustible al salir | Capturado al generar el pase |
| `kilometraje_salida` | Kilometraje al salir | Capturado al generar el pase |
| `fecha_salida` | Fecha de generación del pase | Auto: fecha del sistema |
| `hora_salida` | Hora de generación del pase | Auto: hora del sistema |
| `combustible_entrada` | Combustible al entrar | Capturado al cerrar el pase |
| `kilometraje_entrada` | Kilometraje al entrar | Capturado al cerrar el pase |
| `fecha_entrada` | Fecha de cierre del pase | Auto: fecha del sistema al cerrar |
| `hora_entrada` | Hora de cierre del pase | Auto: hora del sistema al cerrar |
| `usuario_responsable` | Quien autoriza | Usuario que creó el Daño o Servicio |
| `motivo_salida` | Motivo de salida | Capturado al generar el pase |
| `fecha_hora_sistema` | Timestamp del sistema | Auto: `NOW()` al generar |

---

## Motivos de salida y sincronización con Odoo

| Motivo (UI) | Valor interno | `x_studio_status_vehiculo` enviado a Odoo |
|-------------|--------------|-------------------------------------------|
| Taller x Reparación | `taller_reparacion` | `Reparación` |
| Taller x Servicio | `taller_servicio` | `Servicio` |
| Gasolinera | `gasolinera` | `Servicios Varios` |
| Diligencias administrativas | `diligencias` | `Servicios Varios` |
| Asignado al personal | `asignado_personal` | `Asignado al personal` |

**El pase de salida no sincroniza Odoo directamente.** Todo cambio de `x_studio_status_vehiculo` y `qty_available` lo maneja exclusivamente el flujo del Daño o Servicio al que está vinculado el pase. La tabla de motivos es solo informativa para que el operador sepa qué estado quedará en Odoo como resultado del proceso completo.

---

## Estados del pase de salida

```
abierto  →  cerrado
    ↓
  anulado
```

| Estado | Descripción |
|--------|------------|
| `abierto` | Recién creado. El vehículo está fuera. |
| `cerrado` | El vehículo regresó. Se registraron combustible y km de entrada. |
| `anulado` | Cancelado. Terminal — no puede reabrirse. No se muestra en el dashboard. Accesible por URL directa (auditoría). |

---

## Modelo de datos — nueva tabla `pases_salida`

```sql
CREATE TYPE motivo_pase_salida AS ENUM (
  'taller_reparacion',
  'taller_servicio',
  'gasolinera',
  'diligencias',
  'asignado_personal'
);

CREATE TYPE estado_pase_salida AS ENUM (
  'abierto',
  'cerrado',
  'anulado'
);

CREATE TABLE pases_salida (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero              TEXT UNIQUE NOT NULL,     -- PASI-YYYY-NNNN (trigger)

  -- Vínculo al origen (exactamente uno de los dos)
  siniestro_id        UUID REFERENCES siniestros(id) ON DELETE SET NULL,
  orden_servicio_id   UUID REFERENCES ordenes_servicio(id) ON DELETE SET NULL,
  contrato_referencia TEXT NOT NULL,            -- "SIN-2026-042" ó "SRV-2026-017"

  -- Estado
  estado              estado_pase_salida NOT NULL DEFAULT 'abierto',

  -- Datos del vehículo
  vehiculo_placa      TEXT NOT NULL,
  vehiculo_tipo       TEXT,                     -- "TOYOTA PICK UP HI LUX 2025"
  vehiculo_color      TEXT,
  odoo_product_id     INTEGER,                  -- para sincronizar Odoo

  -- Destino y piloto
  lugar_taller        TEXT,
  motivo_salida       motivo_pase_salida NOT NULL,
  piloto_pass         TEXT NOT NULL,

  -- Datos de SALIDA
  combustible_salida  TEXT NOT NULL,            -- 'Full','7/8','6/8','5/8','1/2','3/8','1/8'
  kilometraje_salida  NUMERIC(10,0),
  fecha_salida        DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_salida         TEXT NOT NULL,            -- 'HH:MM'

  -- Datos de ENTRADA (se completan al cerrar)
  combustible_entrada TEXT,
  kilometraje_entrada NUMERIC(10,0),
  fecha_entrada       DATE,
  hora_entrada        TEXT,

  -- Autorización
  usuario_responsable TEXT,                     -- nombre del usuario que creó el Daño/Servicio
  registrado_por      UUID REFERENCES auth.users(id),

  -- Metadata
  fecha_hora_sistema  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_origen CHECK (
    (siniestro_id IS NOT NULL AND orden_servicio_id IS NULL) OR
    (siniestro_id IS NULL AND orden_servicio_id IS NOT NULL)
  )
);

-- Un solo pase activo por Daño o Servicio (no anulados)
CREATE UNIQUE INDEX uq_pase_siniestro
  ON pases_salida(siniestro_id)
  WHERE siniestro_id IS NOT NULL AND estado != 'anulado';

CREATE UNIQUE INDEX uq_pase_servicio
  ON pases_salida(orden_servicio_id)
  WHERE orden_servicio_id IS NOT NULL AND estado != 'anulado';
```

### Trigger: correlativo `PASI-YYYY-NNNN`

```sql
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

CREATE TRIGGER trg_numero_pase_salida
  BEFORE INSERT ON pases_salida
  FOR EACH ROW EXECUTE FUNCTION generar_numero_pase_salida();
```

### Trigger: `updated_at` automático

Usar la misma función `set_updated_at()` que el resto de tablas.

### RLS

- SELECT: todos los usuarios autenticados.
- INSERT/UPDATE: roles con `puedeEditar` (admin, agente_senior, agente, operaciones).
- No se puede eliminar — solo anular.

---

## Campo nuevo en Odoo

`x_studio_color_vehiculo` en `product.template` — el color del vehículo (ej: `"PLATEADO METALICO"`). Actualmente no se lee desde el backend. Se debe agregar al listado de campos en:

- `GET /vehiculos` → añadir `x_studio_color_vehiculo` al `fields` del `search_read`
- `GET /vehiculo/:placa` → idem
- Frontend: mapear `v.x_studio_color_vehiculo` al guardar el pase

---

## Cambios en formulario de Daño (`SiniestroNuevo.jsx` / `SiniestroDetalle.jsx`)

### Sección nueva "Pase de Salida" en el detalle del Daño

Se agrega una tarjeta colapsable en `SiniestroDetalle.jsx`, debajo de Información Operacional, con tres campos de captura previa al generado del pase:

| Campo UI | Tipo | Destino |
|----------|------|---------|
| Nombre del Piloto | Text input | `piloto_pass` |
| Motivo de salida | Radio cards (5 opciones) | `motivo_salida` |
| Combustible actual | Radio cards (7 niveles) | `combustible_salida` |

> Estos datos se guardan en el siniestro o en el pase al momento de generar. No bloquean el flujo del daño.

### Botón "Pase de Salida" en `SiniestroDetalle.jsx`

- Ícono: `Printer` (Lucide)
- Posición: header de acciones, junto a "Imprimir ficha"
- Condición: visible en estados `registrado`, `cotizando`, `proforma_emitida`, `proforma_aprobada`, `en_reparacion` (no en `reparado`, `cerrado`, `anulado`)
- Al hacer clic: abre modal de generación → crea registro en `pases_salida` → abre el PDF relleno en nueva pestaña

---

## Cambios en formulario de Servicio (`ServicioDetalle.jsx`)

Misma estructura que en Daño — sección "Pase de Salida" con los mismos 3 campos de captura y botón "Pase de Salida" en el header.

---

## Nuevo menú en Sidebar

Agregar en `Sidebar.jsx` una entrada "Pase de Salida" (ícono `ClipboardCheck` o `FileOutput`) en la sección principal, entre Servicios y Flota Vehicular.

---

## Nueva página: lista de pases (`PaseSalida.jsx`)

**Ruta**: `/pases-salida`

- Tabla con columnas: No. Pase, Referencia, Placa, Vehículo, Piloto, Motivo, Estado, Fecha Salida, Acción
- Filtros: estado (abierto/cerrado/anulado), búsqueda por placa o número
- Badge de estado: abierto=amber, cerrado=green, anulado=gray
- Botón "Cerrar pase" en los pases abiertos → modal de cierre
- Botón "Ver PDF" → abre el PDF AcroForm relleno

---

## Llenado del PDF AcroForm

**Librería**: `pdf-lib` (ya disponible en el ecosistema; carga dinámica para no inflar bundle)

**Proceso**:
1. Fetch del PDF base desde `/pdfs/Pase-Salida-Interno-Pass.pdf`
2. Cargar con `PDFDocument.load()`
3. Obtener `form = pdfDoc.getForm()`
4. `form.getTextField('nombre_campo').setText(valor)`
5. `form.flatten()` para bloquear los campos
6. Descargar / abrir en nueva pestaña como blob URL

**Niveles de combustible** (escala visual):
`Full | 7/8 | 6/8 | 5/8 | 1/2 | 3/8 | 1/8`

---

## Flujo completo

```
[SiniestroDetalle / ServicioDetalle]
    │
    ├─ Usuario llena: Piloto, Motivo, Combustible salida, Km salida, Lugar/Taller
    │
    └─ Clic "Pase de Salida" (Printer)
           │
           ├─ INSERT pases_salida (estado=abierto)
           ├─ Rellenar PDF AcroForm con los datos del pase
           └─ Abrir PDF en nueva pestaña para imprimir (no se guarda en Storage)

[PaseSalida.jsx — lista]
    │
    └─ Clic "Cerrar pase" (pase abierto)
           │
           ├─ Modal: Combustible entrada, Km entrada
           └─ UPDATE pases_salida → estado=cerrado + datos entrada + fecha/hora automática
              (sin sincronización a Odoo — lo maneja el flujo del Daño/Servicio)
```

---

## Archivos a crear / modificar

| Archivo | Acción |
|---------|--------|
| `db/009_pases_salida.sql` | Nueva tabla, enums, trigger correlativo, RLS |
| `backend/index.js` | Añadir `x_studio_color_vehiculo` a los reads de vehículo |
| `frontend/src/pages/PaseSalida.jsx` | Nueva página (lista + filtros) |
| `frontend/src/pages/PaseSalidaDetalle.jsx` | Detalle + cierre del pase (opcional, o modal en lista) |
| `frontend/src/lib/pase-pdf.js` | Lógica de llenado AcroForm con `pdf-lib` |
| `frontend/src/components/PaseSalidaSection.jsx` | Card con los 3 campos + botón, embebida en Daño y Servicio |
| `frontend/src/pages/SiniestroDetalle.jsx` | Importar y renderizar `PaseSalidaSection` |
| `frontend/src/pages/ServicioDetalle.jsx` | Importar y renderizar `PaseSalidaSection` |
| `frontend/src/components/Sidebar.jsx` | Nuevo ítem de menú "Pase de Salida" |

---

## Decisiones de diseño

| # | Decisión |
|---|----------|
| 1 | `x_studio_color_vehiculo` ya existe en Odoo (`product.template`) con ese nombre exacto. Solo hay que añadirlo a los `fields` del backend. |
| 2 | El pase **no sincroniza Odoo** en ningún momento (ni al crear ni al cerrar). Todo cambio de status y qty es responsabilidad del flujo del Daño o Servicio vinculado. |
| 3 | El PDF **no se guarda en Supabase Storage**. Se genera al vuelo con `pdf-lib` y se abre en una nueva pestaña para imprimir. Si se necesita reimprimir, se genera nuevamente desde el detalle del pase. |
| 4 | El estado `anulado` es **terminal**. Un pase anulado no puede reabrirse. |
| 5 | **Un solo pase por Daño/Servicio** (no anulado). Garantizado por índices únicos parciales en la BD. Si el pase existente está anulado, se puede crear uno nuevo. |
