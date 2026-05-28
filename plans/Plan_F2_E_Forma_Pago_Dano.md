# Fase 2 / E — Forma de pago en Registro de Daño

**Estado**: 📋 Pendiente
**Prioridad**: Media
**Estimado**: 1 sesión (1-2 horas)

---

## Requerimientos

Al registrar un daño, capturar la forma de pago anticipada (decisión preliminar de quién cubre):
- **Cliente** — el cliente paga el daño
- **PASS** — Pass absorbe el costo (cortesía o asunción interna)
- **Seguro** — lo cubre el seguro contratado

La opción debe ubicarse **después del campo "Descripción del daño"** en el wizard de nuevo daño.

---

## Modelo de datos

```sql
CREATE TYPE forma_pago_dano AS ENUM ('cliente', 'pass', 'seguro');

ALTER TABLE siniestros
  ADD COLUMN forma_pago forma_pago_dano DEFAULT 'cliente';

-- Migración: los daños existentes quedan como 'cliente' (default razonable)
```

---

## Frontend

### Wizard `SiniestroNuevo.jsx` — Paso 3 (Daño)

Después del `<textarea>` de descripción, agregar grupo de radio buttons:

```jsx
<div>
  <label className="block text-sm font-medium text-gray-700 mb-2">
    Forma de pago anticipada *
  </label>
  <div className="grid grid-cols-3 gap-2">
    <RadioCard
      checked={form.forma_pago === 'cliente'}
      onClick={() => set('forma_pago', 'cliente')}
      icon={User}
      label="Cliente"
      description="El cliente paga"
      color="blue"
    />
    <RadioCard
      checked={form.forma_pago === 'pass'}
      onClick={() => set('forma_pago', 'pass')}
      icon={Building2}
      label="PASS"
      description="Cortesía / asume Pass"
      color="gray"
    />
    <RadioCard
      checked={form.forma_pago === 'seguro'}
      onClick={() => set('forma_pago', 'seguro')}
      icon={Shield}
      label="Seguro"
      description="Cobertura de póliza"
      color="green"
    />
  </div>
</div>
```

### Validación

- Obligatorio en el wizard
- En el INSERT, incluir `forma_pago`

### Mostrar en detalle

- En `SiniestroDetalle.jsx` card "Detalle del daño", agregar línea "Forma de pago: <badge>"
- En la ficha imprimible, agregar bajo Severidad

### Sincronización con cobros

Al momento de pasar el daño a estado `cerrado`:
- Si `forma_pago = 'pass'` → INSERT cobros con `es_gasto_pass=true`
- Si `forma_pago = 'seguro'` → INSERT cobros con `es_seguro=true`
- Si `forma_pago = 'cliente'` → flujo normal de cobro

Esto reemplaza el botón actual de 3 opciones en el estado `reparado` con la decisión ya tomada al registrar.

---

## Pasos de implementación

1. SQL: enum + ALTER TABLE
2. Wizard: agregar paso/radio grupo después de descripción
3. Componente `RadioCard` reusable con icon + label + description
4. Validación en `canProceedStep2` para exigir forma_pago
5. INSERT: incluir el campo
6. Detalle del daño: mostrar forma_pago como badge
7. Lógica de cierre: usar `forma_pago` para decidir qué INSERT en cobros
8. Ficha imprimible: incluir el campo

---

## Criterios de éxito

- [ ] El wizard exige forma_pago antes de guardar
- [ ] El detalle del daño muestra claramente quién paga
- [ ] La forma_pago condiciona automáticamente el flujo de cierre/cobro
- [ ] La ficha imprimible incluye la forma de pago
