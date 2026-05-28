# Fase 2 / J — Checklist de documentos al cierre

**Estado**: 📋 Pendiente
**Prioridad**: Alta
**Estimado**: 1-2 sesiones (2-4 horas)

---

## Requerimientos

Al cerrar un servicio o un daño, mostrar un **checklist visual** que indica si los siguientes documentos fueron cargados:
- ✅ Prefactura
- ✅ Proforma
- ✅ Factura

El check se marca automáticamente al subir el documento del tipo correspondiente al expediente. NO es manual — es un reflejo del estado real del repositorio documental.

Sirve como "validación de cierre": el usuario ve de un vistazo qué falta antes de cerrar formalmente.

---

## Modelo de datos

### Opción A — Campos booleanos en la tabla (más simple pero redundante)

```sql
ALTER TABLE siniestros
  ADD COLUMN tiene_prefactura BOOLEAN GENERATED ALWAYS AS (false) STORED, -- ...
```

> No funciona limpio con GENERATED desde otra tabla.

### Opción B — Vista computada (recomendado)

Crear vista que joina con `documentos`:

```sql
CREATE OR REPLACE VIEW siniestros_checklist AS
SELECT
  s.id,
  s.numero,
  EXISTS (SELECT 1 FROM documentos d WHERE d.siniestro_id = s.id AND d.tipo = 'proforma_pdf')    AS tiene_proforma,
  EXISTS (SELECT 1 FROM documentos d WHERE d.siniestro_id = s.id AND d.tipo = 'factura')         AS tiene_factura,
  EXISTS (SELECT 1 FROM documentos d WHERE d.siniestro_id = s.id AND d.tipo = 'comprobante_pago') AS tiene_comprobante,
  EXISTS (SELECT 1 FROM documentos d WHERE d.siniestro_id = s.id AND d.tipo = 'cotizacion_pdf')  AS tiene_cotizacion_pdf
FROM siniestros s;

GRANT SELECT ON siniestros_checklist TO authenticated;
```

Análogo para `ordenes_servicio_checklist`.

### Agregar tipo `prefactura_pdf` al enum

```sql
ALTER TYPE tipo_documento ADD VALUE IF NOT EXISTS 'prefactura';
```

---

## Frontend

### Componente nuevo: `ChecklistCierre.jsx`

Props: `origen ('siniestro' | 'servicio')`, `origenId`

```jsx
export default function ChecklistCierre({ origen, origenId }) {
  const [check, setCheck] = useState(null)

  useEffect(() => {
    const tabla = origen === 'siniestro' ? 'siniestros_checklist' : 'ordenes_servicio_checklist'
    supabase.from(tabla).select('*').eq('id', origenId).single()
      .then(({ data }) => setCheck(data))
  }, [origen, origenId])

  if (!check) return null

  const items = [
    { key: 'tiene_prefactura', label: 'Prefactura', tipo: 'prefactura' },
    { key: 'tiene_proforma',   label: 'Proforma',   tipo: 'proforma_pdf' },
    { key: 'tiene_factura',    label: 'Factura',    tipo: 'factura' },
  ]

  const todoCargado = items.every(i => check[i.key])

  return (
    <div className={`rounded-xl border p-4 ${todoCargado ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className="flex items-center gap-2 mb-3">
        {todoCargado
          ? <CheckCircle2 size={16} className="text-green-600" />
          : <AlertCircle size={16} className="text-amber-600" />
        }
        <h3 className="text-sm font-semibold text-gray-800">Checklist de cierre</h3>
      </div>
      <ul className="space-y-1.5 text-sm">
        {items.map(i => (
          <li key={i.key} className="flex items-center gap-2">
            {check[i.key]
              ? <CheckCircle2 size={14} className="text-green-600" />
              : <Circle size={14} className="text-gray-300" />
            }
            <span className={check[i.key] ? 'text-gray-700' : 'text-gray-400 italic'}>
              {i.label}
            </span>
          </li>
        ))}
      </ul>
      {!todoCargado && (
        <p className="text-xs text-amber-700 mt-3">
          ⚠ Suba los documentos faltantes en la sección "Documentos" antes de cerrar.
        </p>
      )}
    </div>
  )
}
```

### Integración

En `SiniestroDetalle.jsx` y `ServicioDetalle.jsx`:

Mostrar el `ChecklistCierre` cuando el estado está cerca del cierre:
- Siniestros: `estado IN ('reparado', 'en_cobro')`
- Servicios: `estado === 'completado'` (ya cerrado, sirve como validación)

Bloquear el botón "Cerrar siniestro" si `tiene_factura = false`:

```jsx
<button
  onClick={...}
  disabled={!check.tiene_factura}
  title={!check.tiene_factura ? 'Falta cargar la factura antes de cerrar' : ''}
>
  Cerrar siniestro
</button>
```

### Realtime / recarga

Cuando se sube un documento desde `DocumentosSection`, recargar la vista del checklist. Opciones:
- Pasar `onUpload` callback que re-ejecuta el query del checklist
- Usar Supabase Realtime subscribiendo a INSERT en `documentos` filtrado por el origen

---

## Pasos de implementación

1. SQL: agregar valor `prefactura` al enum `tipo_documento`
2. SQL: crear vistas `siniestros_checklist` y `ordenes_servicio_checklist`
3. Componente `ChecklistCierre.jsx`
4. Integrar en `SiniestroDetalle.jsx` y `ServicioDetalle.jsx`
5. Pasar callback desde `DocumentosSection` para refresh
6. Bloqueo del botón "Cerrar" si falta factura
7. Probar: subir prefactura, ver el check marcarse en vivo

---

## Criterios de éxito

- [ ] Al subir un PDF de tipo "Factura", el check de "Factura" se marca automáticamente
- [ ] La sección muestra fondo verde cuando todo está cargado, ámbar cuando falta algo
- [ ] El botón "Cerrar siniestro" se deshabilita si falta factura
- [ ] El checklist se actualiza en vivo (sin recargar la página) cuando se sube un documento
- [ ] Sin documentos, el checklist muestra los 3 items con check vacío
