# FASE 8 — Catálogos (Talleres + Repuestos)

**Estado**: ✅ Completado
**Depende de**: Fase 0

---

## Objetivo

CRUD para los dos catálogos maestros: talleres proveedores y repuestos de referencia. Solo `admin` y `agente_senior` pueden modificar; el resto ve solo lectura.

---

## Archivos

- [frontend/src/pages/Catalogos.jsx](../frontend/src/pages/Catalogos.jsx)

Página única con tabs para ambos catálogos.

---

## Tab Talleres

### Tabla
Columnas: Nombre, Contacto, Teléfono, Dirección, Estado (Activo/Inactivo), acciones.

### Filtros
- Búsqueda libre (nombre / contacto / teléfono)
- Toggle "solo activos"

### Modal CRUD
Campos: nombre, contacto, teléfono, dirección, notas, checkbox activo.

Validación: nombre obligatorio.

INSERT/UPDATE en `talleres`. No hay DELETE (solo soft-delete vía `activo=false`).

---

## Tab Repuestos

### Tabla
Columnas: Código (mono), Repuesto, Marca/Modelo, Años, Precio ref. Q, Vigencia (badge), acciones.

### Filtros
- Búsqueda libre (código / nombre / marca / línea_modelo)
- Dropdown vigencia (Vigente / Revisar / Desactualizado / Sin precio)
- Toggle "solo activos"

### Indicador de vigencia
```js
function vigenciaRepuesto(precio_actualizado_at) {
  if (!precio_actualizado_at) return { label: 'Sin precio', color: 'gray' }
  const dias = floor((now - precio_actualizado_at) / 86400000)
  if (dias <= 30)  return { label: 'Vigente',        color: 'green' }
  if (dias <= 90)  return { label: 'Revisar',        color: 'amber' }
  return                   { label: 'Desactualizado', color: 'red'   }
}
```

Cada fila muestra el badge + "hace Nd" (días desde la última actualización).

### Modal CRUD
Campos: código (forzado UPPERCASE, mono), nombre, marca, línea_modelo, años, precio_ref, checkbox activo.

**Checkbox "Marcar como precio actualizado hoy"**: en edición, permite resetear `precio_actualizado_at` sin tener que cambiar el precio. En creación, se setea automáticamente.

Al guardar:
```js
if (actualizarPrecio || esNuevo) payload.precio_actualizado_at = new Date().toISOString()
```

---

## Gating por rol

```js
const esAdmin = perfil?.rol === 'admin' || perfil?.rol === 'agente_senior'
```

- Si `!esAdmin`: el botón "+ Nuevo" no se renderiza, la columna de acciones tampoco.
- RLS en Supabase es la defensa real (solo admin/agente_senior pueden INSERT/UPDATE en `talleres` y `repuestos_catalogo`).

---

## Decisiones

- **Tabs en vez de páginas separadas**: ambos catálogos son cortos y se manejan parecido, un toggle ahorra navegación.
- **Soft-delete con `activo`**: nunca se borran filas — un repuesto/taller usado en cotizaciones rotas debe seguir existiendo para no romper integridad referencial.
- **Código UPPERCASE automático**: para mantener consistencia (REP-001 no rep-001).
- **No autocompleta REP-NNN**: el usuario escribe el código manualmente. Si se necesita, se puede agregar un trigger en Supabase.

---

## Criterio de éxito (cumplido)

- [x] Admin puede crear/editar/desactivar talleres y repuestos
- [x] Roles inferiores ven solo lectura
- [x] Indicador de vigencia se calcula correctamente
- [x] Filtros funcionan en cliente sin recargar
