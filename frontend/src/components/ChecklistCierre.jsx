import { useState } from 'react'
import { CheckSquare, Square, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../hooks/usePermisos'

const ITEMS = [
  { key: 'tiene_prefactura', label: 'Prefactura cargada' },
  { key: 'tiene_proforma',   label: 'Proforma cargada' },
  { key: 'tiene_factura',    label: 'Factura cargada' },
]

/**
 * Checklist manual de documentos al cierre (Plan F2/J).
 * El encargado marca cada item conforme va subiendo los docs.
 * Solo warning visual — no bloquea ninguna acción.
 *
 * Props:
 *  - tabla: 'siniestros' | 'ordenes_servicio'
 *  - registroId: UUID
 *  - valores: { tiene_prefactura, tiene_proforma, tiene_factura }
 *  - onUpdate?: callback al guardar
 */
export default function ChecklistCierre({ tabla, registroId, valores, onUpdate }) {
  const { puedeEditar } = usePermisos()
  const [estado, setEstado] = useState(valores ?? {
    tiene_prefactura: false, tiene_proforma: false, tiene_factura: false,
  })
  const [saving, setSaving] = useState(false)

  const completo = ITEMS.every(i => estado[i.key])
  const pendientes = ITEMS.filter(i => !estado[i.key])

  async function toggle(key) {
    if (!puedeEditar || saving) return
    const nuevo = { ...estado, [key]: !estado[key] }
    setEstado(nuevo)
    setSaving(true)
    try {
      const { error } = await supabase.from(tabla).update({ [key]: nuevo[key] }).eq('id', registroId)
      if (error) {
        // revertir si falla
        setEstado(estado)
        console.error('[ChecklistCierre]', error)
      } else if (onUpdate) {
        onUpdate(nuevo)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`rounded-xl border p-4 ${
      completo ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        {completo
          ? <CheckCircle2 size={16} className="text-green-600" />
          : <AlertTriangle size={16} className="text-amber-600" />
        }
        <h3 className="text-sm font-semibold text-gray-800">Checklist de cierre</h3>
        <span className="text-xs text-gray-500">(marcado manual)</span>
      </div>

      <ul className="space-y-1.5">
        {ITEMS.map(i => {
          const checked = !!estado[i.key]
          const Icon = checked ? CheckSquare : Square
          return (
            <li key={i.key}>
              <button
                onClick={() => toggle(i.key)}
                disabled={!puedeEditar || saving}
                className={`w-full flex items-center gap-2 text-left py-1 text-sm ${
                  puedeEditar ? 'hover:bg-white/50 rounded px-1 -mx-1' : 'cursor-default'
                }`}
              >
                <Icon size={16} className={checked ? 'text-green-600' : 'text-gray-400'} />
                <span className={checked ? 'text-gray-700 font-medium' : 'text-gray-600'}>
                  {i.label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {!completo && (
        <p className="text-xs text-amber-700 mt-3 pl-1">
          Pendiente: {pendientes.map(p => p.label.replace(' cargada', '')).join(', ')}
        </p>
      )}
    </div>
  )
}
