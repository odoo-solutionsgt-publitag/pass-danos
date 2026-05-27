# FASE 7 — Flota Vehicular

**Estado**: ✅ Completado
**Depende de**: Fase 0 (backend con Odoo conectado)

---

## Objetivo

Vista panorámica de toda la flota (lectura desde Odoo) agrupada por status, con drawer de detalle que combina datos de Odoo (contrato activo + cliente) y de Supabase (historial de daños/servicios del vehículo).

---

## Archivos

- [frontend/src/pages/FlotaVehicular.jsx](../frontend/src/pages/FlotaVehicular.jsx)

---

## Layout

### Header
- Título "Flota Vehicular"
- Contador total + cuántos están filtrados (si hay filtros activos)
- Botón "Actualizar" (re-fetch)

### 4 KPI cards
| KPI | Significado |
|-----|-------------|
| Disponible | Listos para rentar |
| Rentado | Con contrato activo |
| En Reparación | En taller por un daño |
| En Mantenimiento | En taller por servicio |

Cada card tiene dot de color + número grande.

### Filtros
- Búsqueda libre por placa
- Dropdown por `tipo_vehiculo` (Sedán, SUV, Pickup, Microbús — derivado del dataset)
- Botón "Limpiar"

### Kanban
Vehículos agrupados por `x_studio_status_vehiculo`. Cada grupo es una sección con su badge de color y conteo. Grid responsivo de cards por vehículo (placa + tipo).

---

## VehiculoDrawer (al click en una card)

Drawer fixed a la derecha con:
- Header: placa + tipo + botón cerrar
- Badge de status
- **Contrato activo** (si lo hay): número, cliente, teléfono, email, fecha. Carga vía `GET /vehiculo/:placa`.
- **Historial de daños**: últimos 10 registros de `siniestros` con la placa, click → navega al detalle.
- **Historial de servicios**: últimos 10 registros de `ordenes_servicio` con la placa, click → navega al detalle.
- **Shortcuts**: botones "+ Daño" y "+ Servicio" que navegan al wizard correspondiente.

---

## Datos del backend

| Endpoint | Uso |
|----------|-----|
| `GET /vehiculos` | Lista completa (en una sola llamada al cargar) |
| `GET /vehiculo/:placa` | Detalle + contrato activo + cliente (al abrir drawer) |

El estado del vehículo viene de Odoo en `x_studio_status_vehiculo`. La placa es `default_code`.

---

## Decisiones

- **Sin Kanban drag&drop**: cambiar el status de un vehículo manualmente no tiene caso de uso — el status se cambia automáticamente cuando un daño/servicio entra o sale del taller. La vista es de **lectura**.
- **Carga única al inicio**: `fetchVehiculos()` trae todos (~50 vehículos), se filtran/agrupan en cliente. Sin paginación porque el dataset es chico.
- **Drawer en vez de modal**: experiencia más fluida; el fondo sigue visible y el drawer se abre lateralmente.
- **Promise.all en el drawer**: tres queries en paralelo (Odoo detalle + Supabase daños + Supabase servicios). Si una falla, las otras siguen.

---

## Criterio de éxito (cumplido)

- [x] Todos los vehículos cargan agrupados por status
- [x] Los contadores de KPI son consistentes con la lista
- [x] El drawer muestra contrato + historial sin retrasos perceptibles
- [x] Los shortcuts navegan correctamente al wizard de Daño/Servicio
