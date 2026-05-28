# Fase 2 / B — Datos del cliente

**Estado**: 📋 Pendiente
**Prioridad**: Alta
**Estimado**: 1 sesión (2-3 horas)

---

## Requerimientos

1. Mostrar el número de contrato en la ficha del cliente del daño
2. Investigar y corregir por qué los campos DPI/Pasaporte, NIT, Teléfono y Correo a veces no se cargan desde Odoo

---

## Diagnóstico

El backend ya extrae estos campos desde `res.partner`:

```javascript
async function getClienteFromPartner(uid, partnerId, partnerName) {
  // ...
  const partners = await odooExecute(uid, 'res.partner', 'read', [[partnerId]], {
    fields: ['phone', 'mobile', 'email', 'vat', 'x_studio_dpipasaporte_cliente'],
  });
  return {
    nombre: partnerName || '',
    telefono: partners[0].phone || partners[0].mobile || '',
    email: partners[0].email || '',
    dpi: partners[0].x_studio_dpipasaporte_cliente || '',
    nit: partners[0].vat || '',
  };
}
```

**Causa más probable de campos vacíos**:
- El cliente en Odoo (`res.partner`) NO tiene esos campos llenos
- La app guarda lo que recibe (vacío) en el momento del INSERT
- Después, si en Odoo llenan los campos, la app NO se actualiza (el snapshot fue al momento de crear)

**Hipótesis a verificar**:
- ¿El partner asociado al contrato (RSV-XXXXX) realmente tiene esos datos?
- ¿O el partner es uno genérico tipo "Walk-in" sin info?

---

## Plan

### Parte 1 — Auditoría en producción

1. Tomar 5 daños existentes con campos cliente vacíos
2. Para cada uno, abrir el `partner_id` en Odoo y verificar manualmente si tiene DPI/NIT/teléfono/email
3. Si en Odoo SÍ están llenos pero en la app vacíos → bug de mapeo
4. Si en Odoo TAMBIÉN están vacíos → solo es captura faltante en Odoo, no es bug

### Parte 2 — Mejora: re-fetch del cliente bajo demanda

Independiente de la causa, agregar un botón "Refrescar datos del cliente desde Odoo" en `SiniestroDetalle`:

**Backend**: nuevo endpoint
```javascript
app.post('/siniestros/:id/refresh-cliente', async (req, res) => {
  const { id } = req.params;
  // Lee siniestros.contrato_id + odoo_product_id
  // Llama Odoo, obtiene partner data fresca
  // UPDATE siniestros con los campos del cliente
  // Devuelve el siniestro actualizado
});
```

**Frontend**: botón en la card de Cliente del detalle.

### Parte 3 — Mostrar Contrato en ficha

Ya existe `siniestros.contrato_numero`. Asegurar que se muestre en:
- Card de Vehículo en `SiniestroDetalle` (ya está como "Contrato: RSV-XXXXX")
- Card de Cliente — agregar línea "Contrato asociado" (nuevo)
- Ficha imprimible de daño — agregar bajo el nombre del cliente

### Parte 4 — Validación en wizard

En `SiniestroNuevo`, después de seleccionar contrato:
- Si DPI / NIT / teléfono / correo vienen vacíos del backend, mostrar warning amber:
  > "⚠ Faltan datos del cliente en Odoo (DPI, NIT, teléfono o correo). Considere actualizar la ficha en Odoo antes de continuar."
- No bloquear, solo advertir

---

## Modelo de datos — sin cambios estructurales

Los campos ya existen:
- `siniestros.cliente_nombre`, `cliente_dpi`, `cliente_nit`, `cliente_telefono`, `cliente_email`, `contrato_numero`

Solo se ajustan UI y se agrega el endpoint de refresh.

---

## Pasos de implementación

1. Verificar manualmente 5 partners en Odoo para confirmar hipótesis
2. Backend: agregar endpoint `POST /siniestros/:id/refresh-cliente`
3. Frontend: agregar botón "Refrescar desde Odoo" en card de Cliente
4. Frontend: agregar línea "Contrato asociado" en card de Cliente
5. Frontend: agregar warning en wizard si datos vienen vacíos
6. Ficha imprimible: incluir contrato bajo el cliente
7. Documentar para Pass: "Si los datos del cliente faltan, llenarlos en Odoo y luego usar el botón Refrescar"

---

## Criterios de éxito

- [ ] El campo "Contrato" aparece en card de Cliente del detalle y en la ficha imprimible
- [ ] Existe botón "Refrescar desde Odoo" funcional
- [ ] El wizard avisa cuando los datos del cliente están incompletos
- [ ] Si en Odoo se actualizan los datos, el botón Refrescar los trae correctamente
