# FASE 2 — Siniestros: lista + wizard de registro

**Estado**: ✅ Completado
**Depende de**: Fase 0

---

## Objetivo

CRUD inicial de daños: tabla de búsqueda + wizard de 3 pasos para registrar un nuevo daño, integrado con Odoo para placa y datos del contrato.

---

## Archivos

- [frontend/src/pages/Siniestros.jsx](../frontend/src/pages/Siniestros.jsx) — lista
- [frontend/src/pages/SiniestroNuevo.jsx](../frontend/src/pages/SiniestroNuevo.jsx) — wizard
- [backend/index.js](../backend/index.js) — endpoints `/vehiculos`, `/vehiculo/:placa`, `/contratos`, `/contratos/:id`
- [frontend/src/lib/odoo-api.js](../frontend/src/lib/odoo-api.js) — wrapper de fetch al backend

---

## Lista de daños

### Tabla
Columnas: No. siniestro, Fecha, Vehículo (placa), Cliente, Tipo Daño, Severidad, Total Q., Estado. Click en fila → detalle.

### Filtros
- Búsqueda libre por placa / número / cliente (lado cliente, sobre dataset cargado)
- Dropdown filtro por estado (8 estados de `estado_siniestro` + anulado)
- Dropdown filtro por severidad (4 niveles)

### Badges de color
- **Severidad**: leve=green, medio=amber, severo=red, perdida_total=red-dark
- **Estado**: registrado=gray, cotizando/proforma_emitida=amber, proforma_aprobada=blue, en_reparacion=red, reparado=teal, en_cobro=purple, cerrado=green, anulado=gray

---

## Wizard de nuevo daño

### Paso 0 — Datos del vehículo
Dos modos de búsqueda con tabs:

**Por placa** (autocomplete debounced):
- Llama `GET /vehiculos` y filtra en cliente por substring del campo `default_code` (placa).
- Al seleccionar: auto-completa marca, línea, año, tipo_vehiculo, odoo_product_id.

**Por contrato** (autocomplete debounced):
- Llama `GET /contratos?q=` (busca en `sale.order.name`, ej. `RSV-00394`).
- Al seleccionar: carga `GET /contratos/:id` → trae vehículo asociado + datos completos del cliente (`res.partner`).

### Paso 1 — Datos del cliente
Pre-llenado desde Odoo (todos los campos `readOnly`, bg gris):
- Nombre, DPI (`x_studio_dpipasaporte_cliente`), NIT (`vat`), teléfono, correo.

### Paso 2 — Datos del daño
- Fecha del siniestro (default: hoy)
- Lugar del accidente
- Tipo de daño (select de 10 valores)
- Severidad (select de 4 valores)
- Descripción libre

### Guardado
`INSERT` en `siniestros`. El trigger `generar_numero_siniestro()` genera `SIN-YYYY-NNN`. Redirect a `/siniestros/:id`.

---

## Endpoints backend usados

| Endpoint | Origen Odoo |
|----------|-------------|
| `GET /vehiculos` | `product.template` con `rent_ok=true`, campo placa = `default_code` |
| `GET /vehiculo/:placa` | search por `default_code` + busca contrato activo |
| `GET /contratos?q=` | `sale.order` ilike `name` |
| `GET /contratos/:id` | detalle de contrato + vehículo + cliente |

---

## Decisiones / fixes

- **Placa en `default_code`**: el campo correcto en Odoo es `default_code` ("Referencia interna"), NO el campo custom `x_studio_placa_vehiculo_id`. Todo el backend lo refleja.
- **`canProceedStep0` no exige placa**: algunos contratos no tienen vehículo vinculado en Odoo; permitir avanzar sin él.
- **Cliente readonly**: los datos vienen de Odoo (fuente única de verdad); no se editan aquí — si están mal, se corrigen en Odoo.
- **NIT separado del DPI**: se agregó columna `cliente_nit` a `siniestros` después del primer despliegue.

---

## Criterio de éxito (cumplido)

- [x] La lista carga, filtra y busca correctamente
- [x] Se puede registrar un daño completo desde placa o desde contrato
- [x] El número SIN-YYYY-NNN se genera automáticamente
- [x] Los datos del cliente llegan correctamente desde Odoo (DPI, NIT, teléfono, email)
