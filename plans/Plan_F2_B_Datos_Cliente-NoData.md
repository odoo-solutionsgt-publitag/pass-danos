# Plan — Datos de Cliente · Contrato vs Reservación · Campos faltantes

**Estado**: 📋 Pendiente de aprobación
**Origen**: Seguimiento de [Plan_F2_B_Datos_Cliente.md](Plan_F2_B_Datos_Cliente.md) — siguen apareciendo datos vacíos en producción + confusión semántica entre Contrato y Reservación
**Prioridad**: Alta (operacional)
**Estimado**: 1 sesión (2 – 3 horas)

---

## Problemas detectados en producción

1. **El campo "Contrato" actualmente muestra el número de reservación** (ej. `RSV-00403`). En Odoo, "Contrato" y "Reservación" son dos cosas distintas:
   - `sale.order.name` → número interno (RSV-XXXXX) = **reservación**
   - `sale.order.x_studio_no_contrato` → número real del contrato firmado con el cliente

   Hoy el backend asume `name === contrato`, lo cual es semánticamente incorrecto.

2. **Datos del cliente vienen vacíos** (NIT, Dirección, Teléfono, Correo) aunque el partner sí exista en Odoo:
   - Captura real: cliente "DISTRIBUIDORA DE ELECTRICIDAD DE OCCIDENTE S.A." con reservación RSV-00403 → todos los campos cliente en blanco (—)

3. **No se está leyendo la dirección** del cliente — el modelo no la tiene ni el backend la consulta.

---

## Análisis técnico

### Para el problema 1 (Contrato vs Reservación)

Backend actual ([backend/index.js:634-660](../backend/index.js#L634-L660) y [:733-755](../backend/index.js#L733-L755)):

```javascript
const orders = await odooExecute(uid, 'sale.order', 'read', [[orderId]], {
  fields: ['id', 'name', 'partner_id', 'date_order', 'state', 'order_line'],
});
// ...
contrato = {
  odoo_id: order.id,
  numero: order.name,            // ← este es RSV-XXXXX (reservación)
  contrato_numero: order.name,   // ← MAL: debería ser x_studio_no_contrato
  ...
}
```

**Frontend** ([SiniestroNuevo.jsx:172](../frontend/src/pages/SiniestroNuevo.jsx#L172)):
```javascript
contrato_numero: data.contrato?.numero ?? '',
```

Recibe `numero` (que es el RSV) y lo guarda como `contrato_numero`. Confusión confirmada.

### Para el problema 2 (Campos cliente vacíos)

Backend `getClienteFromPartner` ([backend/index.js:172-190](../backend/index.js#L172-L190)):

```javascript
const partners = await odooExecute(uid, 'res.partner', 'read', [[partnerId]], {
  fields: ['phone', 'mobile', 'email', 'vat', 'x_studio_dpipasaporte_cliente'],
});
```

Campos leídos: ✅ phone, mobile, email, vat, x_studio_dpipasaporte_cliente
Campos NO leídos: ❌ street, street2, city, state_id, country_id, x_studio_telefono_*, x_studio_email_*, x_studio_nit_*

**Hipótesis posibles** (a verificar caso a caso en Odoo):

| Hipótesis | Cómo verificar |
|-----------|----------------|
| H1: El partner sí tiene los datos pero en campos distintos a los que leemos | Abrir partner_id en Odoo → revisar qué campos están llenos |
| H2: El partner tiene los datos pero en campos `x_studio_*` custom de Pass | Buscar en res.partner los campos x_studio_* relevantes |
| H3: El partner es genérico (sin datos) y los datos están en el sale.order o en el partner del **invoice address** | Verificar `partner_invoice_id` y `partner_shipping_id` |
| H4: El partner es una **empresa** y los contactos están en sus partners hijos | `child_ids` del res.partner contiene los contactos relevantes |

La hipótesis H4 es la más fuerte para el caso "DISTRIBUIDORA DE ELECTRICIDAD DE OCCIDENTE S.A." — es una empresa, y los datos de contacto (teléfono, email, NIT) suelen estar en un **contacto persona** que es child del partner empresa.

### Para el problema 3 (Dirección)

Campo `res.partner.street` existe en todos los partners de Odoo nativamente. Solo hay que agregarlo a la query y a la BD.

---

## Cambios propuestos

### Cambio 1 — Modelo de datos

Agregar dos columnas a `siniestros` y `ordenes_servicio`:

```sql
ALTER TABLE siniestros
  ADD COLUMN IF NOT EXISTS reservacion_numero TEXT,
  ADD COLUMN IF NOT EXISTS cliente_direccion  TEXT;

ALTER TABLE ordenes_servicio
  ADD COLUMN IF NOT EXISTS reservacion_numero TEXT,
  ADD COLUMN IF NOT EXISTS cliente_direccion  TEXT;
```

- **`reservacion_numero`**: contendrá el `sale.order.name` (ej. RSV-00403)
- **`contrato_numero`**: contendrá el `sale.order.x_studio_no_contrato` (ej. CT-2026-001)
- **`cliente_direccion`**: contendrá `res.partner.street` + opcionalmente `street2`, `city`

### Cambio 2 — Backend: enriquecer reads de `sale.order` y `res.partner`

**Helper `getClienteFromPartner`** — agregar campos:

```javascript
async function getClienteFromPartner(uid, partnerId, partnerName) {
  if (!partnerId) return { /* todos vacíos */ };
  const partners = await odooExecute(uid, 'res.partner', 'read', [[partnerId]], {
    fields: [
      'phone', 'mobile', 'email', 'vat',
      'x_studio_dpipasaporte_cliente',
      'street', 'street2', 'city',           // ← nuevo: dirección
      'is_company',                            // ← nuevo: para decidir si buscar en hijos
      'child_ids',                             // ← nuevo: contactos persona de la empresa
    ],
  });
  const p = partners[0];

  let resultado = {
    nombre:    partnerName || p.name || '',
    telefono:  p.phone || p.mobile || '',
    email:     p.email || '',
    dpi:       p.x_studio_dpipasaporte_cliente || '',
    nit:       p.vat || '',
    direccion: [p.street, p.street2, p.city].filter(Boolean).join(', '),
  };

  // Fallback H4: si es empresa y faltan teléfono/email, buscar en el primer contacto persona
  if (p.is_company && p.child_ids?.length && (!resultado.telefono || !resultado.email)) {
    const hijos = await odooExecute(uid, 'res.partner', 'read', [p.child_ids], {
      fields: ['name', 'phone', 'mobile', 'email', 'function'],
    });
    const contacto = hijos.find(h => h.phone || h.mobile || h.email);
    if (contacto) {
      resultado.telefono = resultado.telefono || contacto.phone || contacto.mobile || '';
      resultado.email    = resultado.email    || contacto.email                       || '';
    }
  }

  return resultado;
}
```

**Reads de `sale.order`** — agregar `x_studio_no_contrato`:

```javascript
// En GET /vehiculo/:placa
const orders = await odooExecute(uid, 'sale.order', 'search_read', [...], {
  fields: ['id', 'name', 'x_studio_no_contrato', 'partner_id', 'date_order', 'state', 'order_line'],
});

// En GET /contratos/:id y POST /siniestros/:id/refresh-cliente
const orders = await odooExecute(uid, 'sale.order', 'read', [[orderId]], {
  fields: ['id', 'name', 'x_studio_no_contrato', 'partner_id', 'date_order', 'state', 'order_line'],
});
```

**Response shape** del backend cambia a:

```javascript
contrato = {
  odoo_id:             order.id,
  numero:              order.name,                          // compatibilidad legacy
  reservacion_numero:  order.name,                          // ← nuevo
  contrato_numero:     order.x_studio_no_contrato || null,  // ← real ahora
  // ...resto
}
```

**Endpoint `POST /siniestros/:id/refresh-cliente`** — incluir los campos nuevos en el UPDATE:

```javascript
const updateData = {
  cliente_nombre:    cliente.nombre || sin.cliente_nombre,
  cliente_dpi:       cliente.dpi       || null,
  cliente_nit:       cliente.nit       || null,
  cliente_telefono:  cliente.telefono  || null,
  cliente_email:     cliente.email     || null,
  cliente_direccion: cliente.direccion || null,           // ← nuevo
  reservacion_numero: order.name,                         // ← nuevo
  contrato_numero:   order.x_studio_no_contrato || null,  // ← actualizado
};
```

### Cambio 3 — Frontend

**Wizard `SiniestroNuevo`** — al recibir contrato:
```javascript
contrato_id:        data.contrato?.odoo_id ?? null,
contrato_numero:    data.contrato?.contrato_numero ?? '',   // ← usar el campo correcto
reservacion_numero: data.contrato?.reservacion_numero ?? '',
cliente_direccion:  data.cliente?.direccion ?? '',
```

**Detalle de daño y servicio** — card de Cliente y card de Vehículo:
- Card Vehículo:
  - "Contrato": `siniestro.contrato_numero` (puede mostrar "—" si Odoo no lo tiene)
  - "Reservación": `siniestro.reservacion_numero` (siempre debería tener algo)
- Card Cliente:
  - Agregar fila "Dirección": `siniestro.cliente_direccion`

**Fichas imprimibles** (`FichaSiniestroPrint`, `FichaServicioPrint`):
- En el bloque del cliente, agregar línea con dirección
- Diferenciar visualmente Contrato vs Reservación (no confundir al lector del PDF)

### Cambio 4 — Migración de datos existentes (opcional pero recomendable)

Para los daños y servicios YA creados antes de este cambio, sus campos `contrato_numero` actualmente contienen el número de reservación. Hay dos opciones:

**Opción A** — Migrar de un saque:
```sql
-- Mover contenido viejo de contrato_numero a reservacion_numero
UPDATE siniestros
SET reservacion_numero = contrato_numero, contrato_numero = NULL
WHERE reservacion_numero IS NULL;

-- Análogo para ordenes_servicio
UPDATE ordenes_servicio
SET reservacion_numero = contrato_numero, contrato_numero = NULL
WHERE reservacion_numero IS NULL;
```

Luego con el botón "Refrescar cliente" en cada registro, se obtiene el contrato real desde Odoo.

**Opción B** — Dejar como está:
- Los daños viejos conservan su `contrato_numero` mostrando RSV-XXXXX (lo que ya está bien para legacy)
- Los nuevos toman la convención correcta
- Asumir que el costo de inconsistencia histórica es bajo

**Recomendación**: Opción A. Es un script único de minutos y deja todo consistente.

---

## Decisiones tomadas

| # | Decisión | Justificación |
|---|----------|---------------|
| 1 | Campo `reservacion_numero` como TEXT, opcional | Algunos casos internos (placas sin contrato) no tienen reservación |
| 2 | `contrato_numero` queda como TEXT opcional y deja de ser obligatorio | En Odoo puede no estar lleno; no bloqueamos la creación del daño por eso |
| 3 | `cliente_direccion` es un solo TEXT (no split en street/city/state) | Para visualización es suficiente; si necesitamos análisis geográfico se normaliza después |
| 4 | Fallback empresa → hijos solo para teléfono y email | El NIT y dirección normalmente están en el record empresa, no en los hijos |
| 5 | NO se renombra `contrato_numero` a otro nombre, solo cambia su origen | Evita cascada de refactor en frontend y SQL existentes |
| 6 | Migración de datos viejos (Opción A) | Consistencia futura > pequeña pérdida histórica de visibilidad |
| 7 | Refrescar cliente trae también contrato y reservación, no solo datos del cliente | Si Odoo agrega tarde el `x_studio_no_contrato`, basta con un click |

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| `x_studio_no_contrato` no existe en algunas instancias de Odoo (ej. dev/staging) | Si Odoo retorna error de campo desconocido → caer en NULL, logear warning |
| Migración de datos rompe la integridad histórica | Hacer la migración dentro de transacción + tomar backup previo desde Supabase Studio |
| Los partners hijo no siempre son personas (pueden ser direcciones de despacho) | Filtrar por `type = 'contact'` o `function != false` en el fallback de hijos |
| El campo NIT (`vat`) viene en formato Odoo (con guiones) y el operador lo escribe sin guiones | No transformar — mostrar tal cual viene; si hay queja, normalizar después |
| Refrescar cliente puede sobrescribir un dato manual editado en la app | El UPDATE solo sobrescribe si la nueva data viene NO vacía (`||` en el code actual) |

---

## Verificación manual recomendada antes de implementar

Para confirmar las hipótesis del problema 2, **antes de codificar**:

1. Loguearse en Odoo
2. Tomar el sale.order **RSV-00403** (DISTRIBUIDORA DE ELECTRICIDAD)
3. Anotar:
   - ¿Tiene `x_studio_no_contrato` lleno? Si no → entender si Pass realmente lo usa
   - El partner asociado: ¿es empresa (`is_company=true`)?
   - El partner empresa: ¿tiene NIT (`vat`)? ¿Dirección (`street`)?
   - El partner empresa: ¿qué `child_ids` tiene?
   - Cada hijo: ¿tiene teléfono/email?
4. Documentar hallazgos para iterar el código si es necesario

Esto toma 5 minutos y evita codear contra suposiciones equivocadas.

---

## Archivos a modificar

### Crear
- `005_contrato_reservacion_direccion.sql` — ALTER TABLE + (opcional) script de migración

### Modificar
- `backend/index.js` — `getClienteFromPartner` + reads de sale.order + endpoint refresh
- `frontend/src/pages/SiniestroNuevo.jsx` — usar nuevos campos del contrato
- `frontend/src/pages/SiniestroDetalle.jsx` — mostrar Contrato vs Reservación + Dirección
- `frontend/src/pages/ServicioDetalle.jsx` — análogo
- `frontend/src/pages/ServicioNuevo.jsx` — análogo
- `frontend/src/pages/FichaSiniestroPrint.jsx` — diferenciar visualmente + dirección
- `frontend/src/pages/FichaServicioPrint.jsx` — análogo
- `frontend/src/lib/odoo-api.js` — si hay tipos/normalización del response

---

## Métricas de éxito

- [ ] La query a `sale.order` retorna `x_studio_no_contrato`
- [ ] Un daño nuevo guarda `reservacion_numero` y `contrato_numero` separadamente
- [ ] Si el contrato real (CT-XXXX) no existe en Odoo, `contrato_numero` queda en NULL (no en RSV-XXXX)
- [ ] El detalle de daño muestra ambos campos: "Contrato: CT-XXXX" y "Reservación: RSV-XXXX"
- [ ] El campo Dirección aparece en card de Cliente con la dirección del partner
- [ ] Si el partner es empresa sin teléfono/email, el sistema cae al primer contacto persona hijo
- [ ] El botón "Refrescar desde Odoo" actualiza también contrato + dirección, no solo cliente
- [ ] Los daños viejos migrados muestran correctamente su reservación
- [ ] La ficha imprimible diferencia visualmente contrato y reservación
- [ ] El log del backend NO arroja errores de campo desconocido al consultar Odoo

---

## Orden de ejecución sugerido

1. **Verificación manual en Odoo** (5 min, antes de codificar) — ver sección arriba
2. **SQL**: crear `005_contrato_reservacion_direccion.sql` con ALTER TABLE y ejecutar en Supabase
3. **Backend**: actualizar `getClienteFromPartner` + reads de sale.order + endpoint refresh
4. **Frontend**: ajustar el wizard nuevo de daños/servicios para usar los nuevos campos del response
5. **Frontend**: ajustar detalles y fichas para mostrar contrato vs reservación y dirección
6. **Migración de datos viejos** (opcional, recomendado): correr el UPDATE de migración
7. **Pruebas**: crear 1 daño nuevo y refrescar 1 existente con el botón "Refrescar"
8. Commit/push para deploy

---

## Notas para futuro (Fase 3 opcional)

- Botón "Refrescar todos los datos del cliente y contrato" masivo desde una página admin
- Detección automática de cambios en Odoo vía webhook (no requeriría refresh manual)
- Mostrar el contacto persona elegido en el fallback con un tooltip ("Datos tomados de: Juan Pérez — Gerente")
- Soporte para múltiples contactos por cliente (admin elige cuál es el "principal" para daños)
