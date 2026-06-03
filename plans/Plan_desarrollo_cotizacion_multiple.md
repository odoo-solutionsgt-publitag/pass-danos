# Plan — Cotización Múltiple (solución integral con varios proveedores)

**Estado**: 📋 Pendiente de aprobación
**Origen**: Requerimiento operacional — algunas reparaciones requieren combinar varios proveedores (uno aporta mano de obra, otro repuestos, otro polarizado, etc.)
**Prioridad**: Alta
**Estimado**: 1 sesión (3 – 4 horas)

---

## Contexto

Hoy el sistema solo maneja **cotización única**: se piden varias cotizaciones a distintos talleres, se comparan, **se elige UNA ganadora** y las demás quedan rechazadas. El monto aprobado define el `costo_pass` del daño.

El nuevo requerimiento es soportar también **cotización múltiple**: cuando una reparación requiere aportes complementarios de varios proveedores (ej. taller A hace la mano de obra, proveedor B vende los repuestos, proveedor C el polarizado). En este caso **NO hay competencia** — se aprueban varias cotizaciones a la vez y sus totales se SUMAN para definir el `costo_pass`.

---

## Objetivo

1. Agregar al daño un nuevo campo **`tipo_cotizacion`** (única / múltiple) que el usuario elige al iniciar el proceso de cotización
2. Adaptar el comportamiento de la sección de cotizaciones según el modo:
   - **Única**: comportamiento actual (comparador, una aprobada → resto rechazadas)
   - **Múltiple**: sin competencia, varias aprobadas a la vez, suma de totales
3. Adaptar la sección Proforma, Histórico, lista de daños, ficha imprimible y backend

---

## Modelo conceptual

### Modo Cotización Única (actual)

```
       ┌── Cotización Taller A (Q 5,700) [APROBADA ✓]
Daño ──┼── Cotización Taller B (Q 5,200) [Rechazada]
       └── Cotización Taller C (Q 6,100) [Rechazada]

→ costo_pass = 5,700  (solo el total de la aprobada)
```

### Modo Cotización Múltiple (nuevo)

```
       ┌── Cotización Taller A: Mano de obra (Q 1,500) [APROBADA ✓]
Daño ──┼── Cotización Repuestos GTM:  Faros + tablero (Q 3,200) [APROBADA ✓]
       ├── Cotización Polarizado:     Vidrios (Q 1,800) [APROBADA ✓]
       └── Cotización Taller D: alternativa (Q 700)  [Rechazada / sin aprobar]

→ costo_pass = 1,500 + 3,200 + 1,800 = 6,500  (suma de TODAS las aprobadas)
```

---

## Modelo de datos

### Nueva columna en `siniestros`

```sql
ALTER TABLE siniestros
  ADD COLUMN IF NOT EXISTS tipo_cotizacion TEXT
    NOT NULL DEFAULT 'unica'
    CHECK (tipo_cotizacion IN ('unica', 'multiple'));

COMMENT ON COLUMN siniestros.tipo_cotizacion IS
  'Modo del proceso de cotización: unica (una ganadora) o multiple (varias aprobadas, suma de totales). Default: unica. Se bloquea una vez que existe al menos 1 cotización con líneas.';
```

**Por qué TEXT con CHECK y no ENUM**:
- Más fácil agregar otros modos en el futuro sin migración de enum
- Permite que la lógica de validación viva en la app o en triggers según convenga

### Trigger `sync_costo_pass_from_approved_quote` — reescritura

Hoy: actualiza `siniestros.costo_pass = total_general` de la única cotización aprobada.

**Nuevo**: detectar `tipo_cotizacion` y calcular en consecuencia.

```sql
CREATE OR REPLACE FUNCTION sync_costo_pass_from_approved_quote()
RETURNS TRIGGER AS $$
DECLARE
  v_siniestro_id UUID;
  v_tipo         TEXT;
  v_total        NUMERIC;
BEGIN
  -- 1. Resolver el siniestro afectado y su tipo de cotización
  v_siniestro_id := COALESCE(
    (SELECT siniestro_id FROM cotizaciones WHERE id = NEW.cotizacion_id),
    (SELECT siniestro_id FROM cotizaciones WHERE id = OLD.cotizacion_id)
  );
  IF v_siniestro_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT tipo_cotizacion INTO v_tipo FROM siniestros WHERE id = v_siniestro_id;

  -- 2. Calcular total según modo
  IF v_tipo = 'multiple' THEN
    -- Suma de todas las aprobadas
    SELECT COALESCE(SUM(total_general), 0) INTO v_total
    FROM cotizaciones
    WHERE siniestro_id = v_siniestro_id AND estado = 'aprobada';
  ELSE
    -- Modo único: total de la (única) aprobada
    SELECT COALESCE(total_general, 0) INTO v_total
    FROM cotizaciones
    WHERE siniestro_id = v_siniestro_id AND estado = 'aprobada'
    LIMIT 1;
  END IF;

  -- 3. Actualizar
  UPDATE siniestros
  SET costo_pass = v_total,
      margen     = COALESCE(monto_cliente, 0) - v_total
  WHERE id = v_siniestro_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
```

El trigger existente sobre `cotizacion_lineas` (recalcular totales) sigue igual.

---

## UI — cambios en el frontend

### A. Selector de modo en `CotizacionesSection`

Agregar al inicio de la sección (visible solo cuando NO hay cotizaciones todavía, o cuando todas están en estado "solicitada" sin líneas):

```
┌─────────────────────────────────────────────────────────────────┐
│ Modo de cotización                                              │
│ ● Cotización Única                                              │
│   Se piden a varios talleres, se elige UNA ganadora y las       │
│   demás quedan rechazadas. El total de la ganadora es el costo. │
│                                                                 │
│ ○ Cotización Múltiple                                           │
│   Se aprueban varias cotizaciones que se complementan           │
│   (mano de obra + repuestos + polarizado, etc.). El costo Pass  │
│   es la SUMA de todas las cotizaciones aprobadas.               │
└─────────────────────────────────────────────────────────────────┘
```

**Reglas de bloqueo**:
- Mientras no exista NINGUNA cotización con líneas → el modo es editable
- Cuando ya hay 1+ cotización con líneas → el modo queda **bloqueado** con tooltip "Para cambiar el modo, anule todas las cotizaciones existentes"
- Visualmente queda un badge "Modo: Única" o "Modo: Múltiple" en el header de la sección

### B. Comportamiento al aprobar — diferencias por modo

| Acción | Modo Única (actual) | Modo Múltiple (nuevo) |
|--------|---------------------|----------------------|
| Click "Aprobar esta cotización" | La aprobada pasa a `aprobada`, **todas las demás** pasan a `rechazada` | Solo esa cotización pasa a `aprobada`. Las demás quedan en su estado actual |
| Trigger SQL recalcula `costo_pass` | = total de la aprobada | = SUMA de todas las aprobadas |
| Estado del siniestro | `cotizando` → `proforma_emitida` | `cotizando` → `proforma_emitida` al aprobar la PRIMERA; sigue ahí al aprobar más |
| Asignar `siniestros.taller_id` | Sí, al taller aprobado | No tiene sentido un único taller — dejar NULL o usar el del primer aprobado |
| Comparador lado a lado | Se muestra (current) | **No se muestra** — no se compite, se complementa |

### C. Nuevo botón "Quitar aprobación" (solo modo múltiple)

Si en modo múltiple aprobas una cotización por error, necesitas poder volverla atrás. Aparece un botón en cada cotización aprobada para regresarla a `recibida`. Esto recalcula el `costo_pass`.

### D. `ProformaSection` adaptada

| Modo | Render |
|------|--------|
| Única | La única cotización aprobada + líneas + total + monto cliente (current) |
| Múltiple | **Lista colapsable** de TODAS las cotizaciones aprobadas con sus líneas; al final, **gran total = suma de aprobadas** + monto cliente + margen |

Visualmente:
```
Proforma — 3 cotizaciones aprobadas (Múltiple)
┌──────────────────────────────────────────────────────────────┐
│ ▶ Taller A — Mano de obra ........................ Q 1,500  │
│ ▶ Repuestos GTM — Faros + tablero ................. Q 3,200  │
│ ▶ Polarizado Express — Vidrios .................... Q 1,800  │
├──────────────────────────────────────────────────────────────┤
│ GRAN TOTAL (Costo Pass).......................... Q 6,500    │
│ Monto cliente: [Q 8,000]                                     │
│ Margen: Q 1,500                                              │
└──────────────────────────────────────────────────────────────┘
```

Cada cotización expandible muestra sus líneas en una mini-tabla readonly.

### E. `CotizacionesHistorico` (sección colapsable post-aprobación)

| Modo | Comportamiento |
|------|----------------|
| Única | ★ sobre la más económica + ✓ sobre la aprobada (current) |
| Múltiple | ✓ sobre cada aprobada. **NO se muestra ★ — no hay competencia** |

### F. Lista de daños

Opcional: badge pequeño "Múltiple" al lado del costo_pass cuando aplica, para identificar de un vistazo.

### G. Ficha imprimible

En el bloque de Proforma:
- Modo Única: igual que hoy
- Modo Múltiple: header dice "Proforma combinada — N cotizaciones aprobadas" + cada una con su mini-tabla + gran total

---

## Decisiones tomadas

| # | Decisión | Justificación |
|---|----------|---------------|
| 1 | `tipo_cotizacion` se decide al iniciar la cotización (no al crear el daño) | El operador a veces no sabe al registrar el daño si requerirá un solo taller o varios |
| 2 | El modo queda bloqueado una vez existe 1+ cotización con líneas | Cambiar a media calle dejaría datos inconsistentes; mejor forzar limpieza explícita |
| 3 | En modo múltiple NO se rechazan las otras al aprobar una | El sentido del modo es complementar, no competir |
| 4 | En modo múltiple `siniestros.taller_id` = NULL (o el del primer aprobado, opcional) | No hay un "taller único" del daño; la asignación pierde sentido |
| 5 | El comparador lado a lado SOLO en modo única | En múltiple confunde: no estás comparando, estás sumando |
| 6 | La estrella ★ (más económica) SOLO en modo única | En múltiple no hay "ganador por economía" |
| 7 | Botón "Quitar aprobación" disponible en modo múltiple | Necesario para corregir aprobaciones erróneas sin tener que anular y reempezar |
| 8 | El siniestro pasa a `proforma_emitida` al aprobar la PRIMERA cotización (ambos modos) | Consistencia + se permite seguir aprobando más en múltiple sin retroceder estado |
| 9 | Trigger SQL hace el recálculo automático del `costo_pass` | Garantiza que la suma siempre esté actualizada sin lógica en el frontend |
| 10 | Default `tipo_cotizacion = 'unica'` para daños nuevos y migración de existentes | Mantiene compatibilidad — todos los daños actuales siguen funcionando igual |

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Daños existentes con cotizaciones aprobadas asumen modo "unica" | OK — el default mantiene su comportamiento; nadie tiene que actualizar nada |
| El trigger SQL es más complejo, podría fallar en edge cases | Mantener el código simple, con conteo explícito y fallback a 0; tests manuales en Supabase Studio |
| Usuario aprueba múltiples cotizaciones sin querer en modo única | Bloqueo natural del modo "unica": al aprobar una, las demás se rechazan automáticamente |
| Usuario olvida cambiar a modo "multiple" antes de empezar | UI con selector prominente al inicio + bloqueo explícito + mensaje claro al intentar aprobar varias en modo única |
| El campo `taller_id` del siniestro queda NULL en modo múltiple — puede romper queries que asumen taller asignado | Revisar que todas las queries del frontend manejen NULL graciosamente; ya lo hacen para casos sin asignar |

---

## Métricas de éxito

### Modelo
- [ ] Existe columna `siniestros.tipo_cotizacion TEXT NOT NULL DEFAULT 'unica'` con CHECK
- [ ] El trigger `sync_costo_pass_from_approved_quote` reescrito funciona en ambos modos
- [ ] En modo única: aprobar una cotización pone `costo_pass = total_general` de esa
- [ ] En modo múltiple: aprobar varias cotizaciones pone `costo_pass = SUM(total_general)` de las aprobadas
- [ ] Quitar aprobación de una en modo múltiple recalcula correctamente la suma

### UI — Modo Única (regression)
- [ ] Todo lo que funciona hoy sigue funcionando idéntico cuando `tipo_cotizacion = 'unica'`
- [ ] Aprobar una cotización rechaza las demás (igual que hoy)
- [ ] Comparador y estrella visibles (igual que hoy)

### UI — Modo Múltiple (nuevo)
- [ ] Selector radio al inicio de `CotizacionesSection` cuando no hay cotizaciones con líneas
- [ ] El selector queda bloqueado una vez existe 1+ cotización con líneas
- [ ] Aprobar varias cotizaciones funciona: cada una pasa a `aprobada` sin afectar las otras
- [ ] El `costo_pass` refleja la suma en tiempo real
- [ ] No aparece el comparador lado a lado
- [ ] Botón "Quitar aprobación" funcional
- [ ] `ProformaSection` muestra todas las aprobadas con gran total
- [ ] `CotizacionesHistorico` muestra ✓ en cada aprobada, sin ★
- [ ] Ficha imprimible muestra "Proforma combinada — N cotizaciones aprobadas"

### Migración
- [ ] Daños existentes mantienen `tipo_cotizacion = 'unica'` y se comportan idéntico a antes
- [ ] No se requiere intervención manual sobre datos viejos

---

## Archivos a crear / modificar

### Crear
- `db/008_cotizacion_multiple.sql` — ALTER TABLE + reescritura del trigger

### Modificar
- `frontend/src/components/CotizacionesSection.jsx`
  - Agregar selector de modo (radios)
  - Mostrar/ocultar comparador según modo
  - Cambiar lógica de aprobación: modo única (rechaza otras) vs modo múltiple (aprueba solo esa)
  - Botón "Quitar aprobación" en modo múltiple
- `frontend/src/components/ProformaSection.jsx`
  - Modo única: render actual
  - Modo múltiple: lista de aprobadas con gran total
- `frontend/src/components/CotizacionesHistorico.jsx`
  - Ocultar ★ en modo múltiple
- `frontend/src/pages/SiniestroDetalle.jsx`
  - Cargar `tipo_cotizacion` en el select de siniestros
  - Pasarlo a los componentes hijos
- `frontend/src/pages/FichaSiniestroPrint.jsx`
  - Adaptar bloque de proforma según modo
- `frontend/src/pages/Siniestros.jsx` (opcional)
  - Badge "Múltiple" al lado del monto si aplica

### Sin tocar
- Backend: no requiere cambios
- BD: solo la migración 008
- Otras tablas (cotizaciones, cotizacion_lineas): sin cambios estructurales

---

## Orden de ejecución sugerido

1. **SQL** — Crear `db/008_cotizacion_multiple.sql` con ALTER TABLE + reescritura de trigger
2. **Correr en Supabase Studio** y validar:
   - Columna existe con default 'unica'
   - Trigger actualizado vía `\df sync_costo_pass_from_approved_quote`
   - Test manual: crear daño dummy, marcar `tipo_cotizacion = 'multiple'`, aprobar 2 cotizaciones, verificar suma
3. **Frontend — CotizacionesSection**
   - Cargar `siniestro.tipo_cotizacion` desde el detalle
   - Renderizar selector (con bloqueo según condición)
   - Adaptar `handleAprobar` según modo
   - Agregar botón "Quitar aprobación"
   - Ocultar comparador en modo múltiple
4. **Frontend — ProformaSection**
   - Render dual según modo
5. **Frontend — CotizacionesHistorico**
   - Ocultar ★ en modo múltiple
6. **Frontend — FichaSiniestroPrint**
   - Adaptar bloque de proforma
7. **Pruebas integrales**:
   - Daño modo única (regression): debe comportarse idéntico a hoy
   - Daño nuevo en modo múltiple: aprobar 2 cotizaciones, verificar suma
   - Quitar aprobación: recalcular
   - Cambio de modo bloqueado tras crear cotizaciones
8. Commit por bloque y push

---

## Notas para futuro (no en este alcance)

- **Tipo de cada cotización** (mano de obra / repuestos / vidrios / etc.): hoy se infiere por las líneas; en el futuro podría haber un campo explícito por cotización para facilitar análisis
- **Aprobación parcial de líneas**: permitir aprobar SOLO algunas líneas de una cotización (modo "mixto") — no en este alcance
- **Workflow de aprobación con autorización**: para montos altos en modo múltiple, requerir doble visto bueno
- **Reporte de proveedores**: ranking de talleres más usados / mejor costo promedio (más útil en modo múltiple)
- **Agrupar cotizaciones por tipo de aporte** visualmente en la UI (Mano de obra | Repuestos | Otros)
