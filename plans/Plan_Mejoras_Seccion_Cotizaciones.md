# Plan de Mejoras — Sección de Cotizaciones (post-Fase 2)

**Estado**: 📋 Pendiente de aprobación
**Origen**: Feedback operacional post-Fase 2
**Prioridad**: Alta (visibilidad para auditoría + legibilidad)
**Estimado**: 1 sesión (2 – 3 horas)
**Fase relacionada**: [Plan_F2_C_Cotizaciones_Mejoradas.md](Plan_F2_C_Cotizaciones_Mejoradas.md)

---

## Bloques de trabajo

| # | Bloque | Alcance |
|---|--------|---------|
| 1 | Histórico de cotizaciones colapsable | Sección nueva con todas las cotizaciones del expediente |
| 2 | Color pastel por cotización | Identificación visual rápida de cada cotización |
| 3 | Tipografía Poppins +2pt | Mejora global de legibilidad |

---

## Problema detectado

Hoy, una vez que se aprueba una cotización y el daño pasa de `cotizando` → `proforma_emitida`, **las cotizaciones que concursaron desaparecen de la UI**:

- `CotizacionesSection` solo se renderiza cuando `estado === 'cotizando'` ([SiniestroDetalle.jsx:549](../frontend/src/pages/SiniestroDetalle.jsx#L549)).
- `ProformaSection` solo lee la cotización aprobada (`.eq('estado','aprobada')`) ([ProformaSection.jsx:27](../frontend/src/components/ProformaSection.jsx#L27)).

**Consecuencia**: las cotizaciones rechazadas (con sus líneas, totales y documentos) siguen en Supabase, pero el usuario operacional no tiene cómo verlas para:
- Auditoría posterior ("¿por qué se eligió a este taller?")
- Trazabilidad ante reclamos del cliente o de la dirección
- Comparativo histórico de precios entre talleres a lo largo del tiempo
- Defensa de la decisión cuando un auditor o gerente lo pregunta

---

## Objetivo

Agregar al detalle del daño una **sección colapsable "Cotizaciones que concursaron"** visible desde `proforma_emitida` en adelante, con:

1. **Todas las cotizaciones** (aprobada + rechazadas + cualquier no-rechazada eventual).
2. **Comparador lado a lado** idéntico al que ya existe durante `cotizando`.
3. **★ Estrella** sobre el total más bajo (recomendación económica).
4. **✓ Check verde** sobre la cotización ganadora (aprobada). Puede coincidir con la estrellada o no.
5. **Todo en readonly**: sin botones de aprobar, sin agregar/eliminar líneas, sin agregar talleres, sin subir documentos.
6. **Colapsable**: por defecto cerrada para no saturar la pantalla; se expande al click.

---

## Alcance

### Incluye
- Componente nuevo `CotizacionesHistorico.jsx` (readonly, autocontenido)
- Integración en `SiniestroDetalle.jsx` debajo de la sección Proforma (visible desde `proforma_emitida`)
- Misma lógica visual del comparador actual (★, highlight del menor)
- Indicador adicional ✓ sobre la cotización con `estado='aprobada'`

### NO incluye
- Cambios en el modelo de datos (las rechazadas ya se guardan completas)
- Cambios en `CotizacionesSection` activo (sigue funcionando igual durante `cotizando`)
- Cambios en `ProformaSection` (la proforma sigue siendo el bloque principal arriba)
- Permitir editar las rechazadas (estrictamente readonly — esto se decide ahora y se documenta)
- Mostrar documentos de cotizaciones rechazadas (los documentos quedan en la BD, accesibles desde el repositorio global)

---

## Diseño visual

```
┌───────────────────────────────────────────────────────────────┐
│ Proforma — COFIÑO/CAES  [Original]   [Imprimir]               │
│ Cotización aprobada · Última edición: 28 may 2026 14:32       │
│ ... (líneas)                                                  │
│ ... (totales)                                                 │
│ ... (monto a cobrar al cliente)                               │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ ▼ Cotizaciones que concursaron  (3)                           │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────┐      │
│  │ COFIÑO/CAES [Original] [Aprobada ✓]                  │     │
│  │   Repuestos       Q 4,200.00                         │     │
│  │   Mano de obra    Q 1,500.00                         │     │
│  │   Total           Q 5,700.00                         │     │
│  │   (líneas detalladas readonly)                       │     │
│  └─────────────────────────────────────────────────────┘      │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐      │
│  │ REASA [Genérico] [Rechazada] ★                       │     │
│  │   Repuestos       Q 3,800.00                         │     │
│  │   ...                                                │     │
│  │   Total           Q 5,200.00  ← menor (★)            │     │
│  └─────────────────────────────────────────────────────┘      │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐      │
│  │ TRS [Rechazada]                                      │     │
│  │   ...                                                │     │
│  │   Total           Q 6,100.00                         │     │
│  └─────────────────────────────────────────────────────┘      │
│                                                               │
│  ┌── Comparador ────────────────────────────────────┐         │
│  │ Concepto    │ COFIÑO ✓  │ REASA ★   │ TRS         │        │
│  │ Repuestos   │ 4,200     │ 3,800     │ 4,500       │        │
│  │ Mano obra   │ 1,500     │ 1,400     │ 1,600       │        │
│  │ Total       │ 5,700     │ 5,200 ★   │ 6,100       │        │
│  └──────────────────────────────────────────────────┘         │
└───────────────────────────────────────────────────────────────┘
```

### Reglas de íconos en el header de cada tarjeta

| Estado / situación             | Badge                         |
|--------------------------------|-------------------------------|
| `aprobada`                     | `Aprobada ✓` verde            |
| `rechazada`                    | `Rechazada` gris              |
| `aprobada` Y total más bajo    | `Aprobada ✓` verde + `★`     |
| `rechazada` Y total más bajo   | `Rechazada` gris + `★`       |
| Solo total más bajo            | `★`                           |

La estrella siempre indica **opción económica**, independientemente de cuál se aprobó. Esto es la información valiosa para auditoría: ¿se aprobó la más económica o no?

---

## Bloque 2 — Color pastel por cotización

### Objetivo
Que cada cotización tenga un **color pastel distinto y agradable** para identificarla de un vistazo, tanto en la sección activa (`CotizacionesSection`) como en el histórico (`CotizacionesHistorico`) y en el comparador lado a lado.

### Paleta propuesta (pasteles suaves, accesibles)

Se asignan en orden de creación (orden estable: `created_at`):

| # | Nombre        | Fondo tarjeta | Borde       | Acento (header)        |
|---|---------------|---------------|-------------|------------------------|
| 1 | Rosa pastel   | `#FFE4E6`     | `#FECDD3`   | `#9F1239` texto        |
| 2 | Azul pastel   | `#DBEAFE`     | `#BFDBFE`   | `#1E3A8A` texto        |
| 3 | Verde pastel  | `#DCFCE7`     | `#BBF7D0`   | `#14532D` texto        |
| 4 | Amarillo pastel | `#FEF9C3`   | `#FEF08A`   | `#713F12` texto        |
| 5 | Lavanda pastel | `#EDE9FE`    | `#DDD6FE`   | `#4C1D95` texto        |
| 6 | Durazno pastel | `#FFEDD5`    | `#FED7AA`   | `#7C2D12` texto        |
| 7 | Menta pastel  | `#CCFBF1`     | `#99F6E4`   | `#134E4A` texto        |
| 8 | Lila pastel   | `#FCE7F3`     | `#FBCFE8`   | `#831843` texto        |

Si hay más de 8 cotizaciones, se rota desde el #1.

### Reglas de aplicación

- **Tarjeta de cotización** (`CotizacionesSection` y `CotizacionesHistorico`):
  - `background-color`: color de fondo de la paleta
  - `border`: color del borde
  - El badge de estado (aprobada/rechazada/etc.) **no se altera** — sigue su color semántico actual
  - El badge de variante (`Original`, `Genérico`, etc.) **no se altera** — sigue indigo
- **Columna del comparador** lado a lado:
  - Header de la columna: el fondo pastel correspondiente al taller+variante
  - Las celdas de datos pueden mantenerse blancas; solo el header lleva el color
  - La columna del taller más económico mantiene su fondo verde resaltado (★) — no se sobrescribe
- **Excepción "aprobada"**: la tarjeta aprobada **mantiene** su borde verde actual encima del color pastel asignado, para que se note la jerarquía. Solo el `background-color` interior cambia al pastel.

### Implementación

Helper en `frontend/src/lib/colores.js`:
```js
export const PALETA_COTIZACIONES = [
  { bg: '#FFE4E6', border: '#FECDD3', textHeader: '#9F1239', name: 'rosa' },
  { bg: '#DBEAFE', border: '#BFDBFE', textHeader: '#1E3A8A', name: 'azul' },
  { bg: '#DCFCE7', border: '#BBF7D0', textHeader: '#14532D', name: 'verde' },
  { bg: '#FEF9C3', border: '#FEF08A', textHeader: '#713F12', name: 'amarillo' },
  { bg: '#EDE9FE', border: '#DDD6FE', textHeader: '#4C1D95', name: 'lavanda' },
  { bg: '#FFEDD5', border: '#FED7AA', textHeader: '#7C2D12', name: 'durazno' },
  { bg: '#CCFBF1', border: '#99F6E4', textHeader: '#134E4A', name: 'menta' },
  { bg: '#FCE7F3', border: '#FBCFE8', textHeader: '#831843', name: 'lila' },
]

export function colorPorIndice(indice) {
  return PALETA_COTIZACIONES[indice % PALETA_COTIZACIONES.length]
}
```

Se aplica al map de cotizaciones: `cotizaciones.map((cot, idx) => ...)` usando `colorPorIndice(idx)` como inline style.

### Decisiones

| # | Decisión | Justificación |
|---|----------|---------------|
| 1 | Colores asignados por orden de `created_at`, no por taller | Si el mismo taller vuelve con 2 variantes, deben ser distinguibles |
| 2 | Misma paleta entre `CotizacionesSection` activo y `CotizacionesHistorico` | Continuidad visual: la cotización rosa durante revisión sigue siendo rosa en el histórico |
| 3 | El color pastel es **fondo**, no reemplaza badges semánticos | El estado (aprobada/rechazada) sigue siendo el dato dominante |
| 4 | Comparador colorea solo el header de columna, no las celdas | Evita ruido visual en la tabla numérica |
| 5 | La tarjeta aprobada conserva borde verde encima del pastel | Refuerza la jerarquía: aprobada > color pastel |

---

## Bloque 3 — Tipografía Poppins + 2pt

### Objetivo
- Cambiar la fuente principal de la app de la actual (sistema: `-apple-system, BlinkMacSystemFont, 'Segoe UI'...`) a **Poppins**.
- Aumentar el tamaño base de texto **+2px** para mejorar legibilidad (hoy el texto es percibido como muy pequeño).

### Implementación

#### 1. Cargar Poppins desde Google Fonts

En `frontend/index.html`, agregar dentro del `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
```

Pesos cargados: 300 / 400 / 500 / 600 / 700 / 800 (cubre desde `font-light` hasta `font-extrabold` que usa Tailwind).

#### 2. Aplicar Poppins como fuente base

En `frontend/src/index.css`, dentro de `@layer base / body`:

```css
@layer base {
  html {
    font-size: 18px;  /* base 16px → 18px (+2px) — escala global Tailwind */
  }
  body {
    margin: 0;
    font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    background-color: #f3f4f6;
    color: #111827;
  }
}
```

**Por qué `html { font-size: 18px }`**:
Tailwind 4 usa unidades `rem` para todos sus tamaños (`text-xs` = 0.75rem, `text-sm` = 0.875rem, `text-base` = 1rem). Al subir el root font-size de 16px → 18px, **toda la escala sube proporcionalmente +2px**:

| Clase Tailwind | Antes (16px base) | Después (18px base) |
|----------------|-------------------|---------------------|
| `text-xs`      | 12px              | 13.5px              |
| `text-sm`      | 14px              | 15.75px             |
| `text-base`    | 16px              | 18px                |
| `text-lg`      | 18px              | 20.25px             |
| `text-xl`      | 20px              | 22.5px              |

Esto es preferible a editar clases una por una en cada archivo.

### Alcance del cambio (importante)

Esta modificación **afecta a TODA la aplicación**, no solo a la sección de cotizaciones. El usuario lo solicitó así:
> "cambiar la font del texto a Poppins y dale 2 puntos más, pues muy pequeña"

Implica que las páginas siguientes se verán afectadas:
- Login, Dashboard, Siniestros (lista), Detalle, Servicios, Servicios Detalle, Servicios Nuevo, Siniestro Nuevo, Proformas, Flota Vehicular, Bitácora, Catálogos, Repositorio, Reportes, Usuarios, Fichas imprimibles, Sidebar, Layout.

### Riesgos y verificaciones

| Riesgo | Mitigación |
|--------|------------|
| Layouts con altura fija explícita rompen al crecer el texto | Recorrido visual por cada página después del cambio; ajustar `h-` / `max-h-` donde se rompa |
| Tablas con `text-xs` quedan apretadas en mobile | Revisar tablas críticas (Siniestros, Proformas, Reportes) |
| Las fichas imprimibles (A4) podrían desbordar | Verificar `FichaSiniestroPrint` y `FichaServicioPrint` en print preview |
| Carga inicial bloquea esperando Poppins | `display=swap` ya está incluido en el link de Google Fonts |
| Sin conexión a internet en el dispositivo del usuario | Poppins falla y vuelve a Segoe UI / Helvetica (lista de fallback) |

### Decisiones

| # | Decisión | Justificación |
|---|----------|---------------|
| 1 | Cargar Poppins desde Google Fonts, no self-hosted | Cero configuración de Vite; aceptable en producción interna |
| 2 | Subir `html { font-size: 18px }` (no editar clases manualmente) | Un solo cambio, escala consistente, reversible |
| 3 | Sin re-mapeo del scale de Tailwind | Innecesario complicar; el rem-scaling es suficiente |
| 4 | Pesos 300-800 cargados | Cubre todos los `font-*` de Tailwind que usa la app |

---

## Implementación

### Archivo nuevo: `frontend/src/lib/colores.js`
Helper con la paleta pastel y la función `colorPorIndice(idx)`. Ver bloque 2.

### Modificación: `frontend/src/components/CotizacionesSection.jsx`
Aplicar `colorPorIndice(idx)` a cada tarjeta de cotización (inline style en el contenedor + header). El borde verde de la aprobada se conserva.

### Modificación: `frontend/index.html`
Agregar los 3 `<link>` de Google Fonts (preconnect + Poppins). Ver bloque 3.

### Modificación: `frontend/src/index.css`
- Agregar `html { font-size: 18px; }` en `@layer base`
- Cambiar `font-family` del `body` para anteponer `'Poppins'`

### Archivo nuevo: `frontend/src/components/CotizacionesHistorico.jsx`

Componente autocontenido, recibe `siniestro` como prop.

```jsx
export default function CotizacionesHistorico({ siniestro }) {
  const [cotizaciones, setCotizaciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)   // colapsado por defecto

  useEffect(() => { load() }, [siniestro.id])

  async function load() {
    const { data } = await supabase
      .from('cotizaciones')
      .select('*, talleres(nombre), cotizacion_lineas(*)')
      .eq('siniestro_id', siniestro.id)
      .order('created_at')
    setCotizaciones(data ?? [])
    setLoading(false)
  }

  // Mostrar SOLO si hay 1+ cotización registrada
  if (loading) return null
  if (cotizaciones.length === 0) return null

  const cotsConLineas = cotizaciones.filter(c => (c.cotizacion_lineas ?? []).length > 0)
  const minTotal = cotsConLineas.length > 0
    ? Math.min(...cotsConLineas.map(c => Number(c.total_general) || 0))
    : null

  // ... render colapsable
}
```

### Modificación: `frontend/src/pages/SiniestroDetalle.jsx`

Añadir import:
```jsx
import CotizacionesHistorico from '../components/CotizacionesHistorico'
```

Insertar **debajo** del bloque `ProformaSection`:
```jsx
{/* ── Histórico de cotizaciones (visible cuando hay proforma) ── */}
{['proforma_emitida', 'proforma_aprobada', 'en_reparacion', 'reparado', 'en_cobro', 'cerrado'].includes(estado) && (
  <CotizacionesHistorico siniestro={siniestro} />
)}
```

El componente decide internamente si renderizar (oculto si no hay cotizaciones).

---

## Decisiones tomadas (no abrir discusión durante la implementación)

| # | Decisión | Justificación |
|---|----------|---------------|
| 1 | Visible desde `proforma_emitida` en adelante | Durante `cotizando` ya está `CotizacionesSection`, no duplicamos |
| 2 | Colapsada por defecto | El detalle ya es largo; el usuario abre solo si necesita |
| 3 | Estrella sobre el menor total, aunque NO sea el aprobado | Eso es justamente lo que importa para auditoría |
| 4 | Check verde sobre el aprobado (puede ser el mismo que la estrella) | El aprobado siempre debe ser identificable |
| 5 | Sin botones ni edición | Es histórico para consulta, no operacional |
| 6 | Documentos de cotizaciones rechazadas NO se muestran aquí | Quedan accesibles vía repositorio global |
| 7 | Líneas de cada cotización SÍ se muestran (tabla readonly) | Lo importante es ver el detalle, no solo totales |
| 8 | Comparador se muestra solo si hay 2+ cotizaciones con líneas | Si solo hay una, no hay nada que comparar |

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Performance: si un siniestro tuvo 10+ cotizaciones, el componente pesa | Colapsado por defecto; el query es 1 SELECT con join, ligero |
| Confusión visual: dos secciones (Proforma + Histórico) con la misma cotización aprobada | El histórico es claramente un bloque secundario, colapsable, con título distinto |
| Que el usuario edite por error la rechazada | Componente estrictamente readonly: sin inputs, sin botones de acción |

---

## Métricas de éxito

### Bloque 1 — Histórico
- [ ] Al abrir un siniestro con estado `proforma_emitida` o posterior, aparece bloque colapsado "Cotizaciones que concursaron"
- [ ] Al expandirlo, se ven N tarjetas (1 por cotización)
- [ ] La aprobada tiene badge verde "Aprobada ✓"
- [ ] La más económica tiene estrella ★ (sea aprobada o no)
- [ ] Si la aprobada Y la más económica coinciden, ambos indicadores se ven juntos
- [ ] El comparador lado a lado se muestra cuando hay 2+ cotizaciones con líneas
- [ ] Ningún botón de aprobar/eliminar/agregar es visible (readonly puro)
- [ ] La sección NO aparece en estados `registrado` o `cotizando` (ahí manda la sección activa)
- [ ] La sección NO aparece si no hay cotizaciones registradas
- [ ] Tampoco se rompe nada en daños de Fase 1 que tenían cotizaciones sin variante

### Bloque 2 — Color pastel por cotización
- [ ] Cada tarjeta de cotización en `CotizacionesSection` activo tiene un fondo pastel distinto
- [ ] El color se mantiene consistente entre activo e histórico (misma cotización = mismo color)
- [ ] El header de columna del comparador hereda el mismo color pastel
- [ ] La cotización aprobada conserva su borde verde encima del pastel
- [ ] La columna más económica del comparador conserva su highlight verde (★)
- [ ] Con 9+ cotizaciones, los colores rotan sin error

### Bloque 3 — Tipografía
- [ ] Poppins se aplica como fuente principal en toda la app (login, sidebar, páginas internas)
- [ ] El texto se ve visiblemente más grande (~+2px) en todas las pantallas
- [ ] Las fichas imprimibles no se desbordan del A4 (revisar manualmente print preview)
- [ ] Las tablas de Siniestros y Proformas siguen legibles sin scroll horizontal en desktop
- [ ] Si no hay internet, el fallback Segoe UI / Helvetica entra automáticamente

---

## Orden de ejecución sugerido

1. **Bloque 3 primero** — Cambiar `index.html` (Google Fonts) + `index.css` (`html { font-size: 18px }` + Poppins). Probar en una página cualquiera que la fuente cambia y crece.
2. **Bloque 2** — Crear `frontend/src/lib/colores.js` con la paleta y `colorPorIndice()`.
3. Aplicar la paleta a `CotizacionesSection.jsx` (tarjeta + header de comparador). Probar con 3 cotizaciones.
4. **Bloque 1** — Crear `frontend/src/components/CotizacionesHistorico.jsx` (autocontenido, readonly, reutiliza la paleta del paso 2).
5. Importarlo y embeberlo en `SiniestroDetalle.jsx` debajo del bloque Proforma.
6. **Pruebas visuales** en navegador:
   - Siniestro real en `proforma_emitida` o posterior: ver que aparece colapsado, expandir, verificar estrella y check, verificar colores pastel y comparador
   - Siniestro con solo 1 cotización (no debe romperse, no muestra comparador)
   - Siniestro en estado `cotizando` (no debe aparecer el histórico; el activo sí muestra colores pastel)
   - Login, Dashboard, Siniestros (lista), Reportes, Fichas imprimibles — verificar que la fuente Poppins y el tamaño aumentado no rompen ningún layout
7. Ajustes finales de tamaños/anchos si algo se desbordó por el aumento de fuente
8. Commit y push

---

## Notas para el futuro (Fase 3 opcional)

- Misma capacidad para servicios de mantenimiento (`ServicioDetalle.jsx`)
- Permitir comentario al elegir la NO más económica ("por qué no se eligió la estrella")
- Reporte gerencial: "% de daños donde se aprobó la cotización más cara"
- Si en el futuro el cliente pide volver al tamaño anterior, basta con cambiar `html { font-size: 18px }` a `16px` (revertir 1 línea)
- Self-hosting de Poppins con `@fontsource/poppins` si se necesita funcionar 100% offline
