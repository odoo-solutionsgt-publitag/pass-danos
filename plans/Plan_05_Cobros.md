# FASE 5 — Cobros

**Estado**: ⏭️ Omitida — se gestiona en Odoo

---

## Decisión de scope

Durante el desarrollo se decidió que la facturación FEL (Infile), el registro de cobros y la conciliación bancaria viven en Odoo, no en esta app. Pass Rent a Car ya tiene flujo establecido en Odoo para emitir facturas FEL contra `sale.order`, y duplicar ese flujo en esta app crearía dos fuentes de verdad sobre el cobro.

**Esta app solo registra**:
- El monto que Pass cobra al cliente (`siniestros.monto_cliente`)
- El costo que Pass paga al taller (`siniestros.costo_pass`)
- El margen calculado (`siniestros.margen`)
- Si Pass absorbe el costo (`cobros.es_gasto_pass`)
- Si lo cubre el seguro (`cobros.es_seguro`)

**La facturación FEL se hace en Odoo** vinculada al contrato de renta.

---

## Implementación mínima conservada

La tabla `cobros` existe en Supabase y se sigue usando, pero solo como bitácora:
- Cuando el daño pasa a `en_cobro`: se hace INSERT en `cobros` con `monto_total = monto_cliente`, `estado='pendiente'`.
- Cuando se elige "Absorbe Pass": INSERT con `es_gasto_pass=true`.
- Cuando se elige "Cubre seguro": INSERT con `es_seguro=true`.

Los campos `factura_numero`, `factura_serie`, `factura_fecha`, `boleta_pago`, `fecha_pago` quedan opcionales y no se llenan desde el frontend.

---

## Flujo final del cobro en la app

Desde `SiniestroDetalle.jsx`, cuando el siniestro está en `reparado`, hay 3 botones:

1. **Registrar cobro** → INSERT en `cobros`, estado `en_cobro`.
2. **Absorbe Pass** → INSERT con `es_gasto_pass=true`, estado `cerrado`.
3. **Cubre seguro** → INSERT con `es_seguro=true`, estado `cerrado`.

Desde `en_cobro` solo queda el botón "Cerrar siniestro" que pasa a `cerrado` sin tocar Odoo.

---

## Si en el futuro se necesita facturación nativa

Habría que:
- Agregar formulario completo en `SiniestroDetalle` con campos FEL (serie, número, fecha)
- Integrar con el API de Infile (no es Odoo XML-RPC, es un servicio distinto de Pass)
- Implementar pipeline de estados del cobro: pendiente → informado → facturado → pagado
- Sincronizar con Odoo (crear `account.move` o registrar pago contra contrato)

Por ahora no hay urgencia ni requerimiento de Pass para esto.
