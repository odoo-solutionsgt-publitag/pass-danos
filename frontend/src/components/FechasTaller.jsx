import { useState } from 'react'
import { Calendar, Save, Edit2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../hooks/usePermisos'
import { formatDate, diffDays } from '../lib/fecha'

const CAMPOS = [
  { key: 'fecha_entrega_taller',   label: 'Entrega al taller',   help: 'Día que el vehículo se entregó físicamente al taller' },
  { key: 'fecha_estimada_entrega', label: 'Estimada de entrega', help: 'Fecha que el taller comprometió devolverlo' },
  { key: 'fecha_real_entrega',     label: 'Real de entrega',     help: 'Día efectivo en que el taller devolvió el vehículo' },
]

/**
 * Card editable con las 3 fechas adicionales de taller (Plan F2/G).
 *
 * Props:
 *  - tabla: 'siniestros' | 'ordenes_servicio'
 *  - registroId: UUID
 *  - valores: { fecha_entrega_taller, fecha_estimada_entrega, fecha_real_entrega }
 *  - onUpdate?: callback al guardar
 */
export default function FechasTaller({ tabla, registroId, valores, onUpdate }) {
  const { puedeEditar } = usePermisos()
  const [editando, setEditando] = useState(false)
  const [valores_, setValores] = useState(valores ?? {
    fecha_entrega_taller: null,
    fecha_estimada_entrega: null,
    fecha_real_entrega: null,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function diferenciaDias() {
    const { fecha_estimada_entrega, fecha_real_entrega } = valores_
    return diffDays(fecha_estimada_entrega, fecha_real_entrega)
  }

  async function guardar() {
    setSaving(true); setError('')
    try {
      const payload = {
        fecha_entrega_taller:   valores_.fecha_entrega_taller || null,
        fecha_estimada_entrega: valores_.fecha_estimada_entrega || null,
        fecha_real_entrega:     valores_.fecha_real_entrega || null,
      }
      const { error } = await supabase.from(tabla).update(payload).eq('id', registroId)
      if (error) throw error
      setEditando(false)
      if (onUpdate) onUpdate(payload)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function cancelar() {
    setValores(valores ?? { fecha_entrega_taller: null, fecha_estimada_entrega: null, fecha_real_entrega: null })
    setEditando(false)
    setError('')
  }

  const dif = diferenciaDias()
  const todasVacias = CAMPOS.every(c => !valores_[c.key])

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-800">Fechas de taller</h3>
        </div>
        {puedeEditar && !editando && (
          <button
            onClick={() => setEditando(true)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded"
          >
            <Edit2 size={12} />
            Editar
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded mb-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {CAMPOS.map(c => (
          <div key={c.key}>
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            {editando ? (
              <input
                type="date"
                value={valores_[c.key] || ''}
                onChange={e => setValores(v => ({ ...v, [c.key]: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
              />
            ) : (
              <p className="text-sm font-medium text-gray-800">
                {formatDate(valores_[c.key]) || <span className="text-gray-300 italic">—</span>}
              </p>
            )}
          </div>
        ))}
      </div>

      {dif !== null && !editando && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className={`text-xs ${
            dif <= 0 ? 'text-green-700' : dif <= 3 ? 'text-amber-700' : 'text-red-700'
          }`}>
            {dif === 0 && '✓ Entregado en la fecha estimada'}
            {dif < 0  && `✓ Entregado ${Math.abs(dif)} día${Math.abs(dif) === 1 ? '' : 's'} antes de lo estimado`}
            {dif > 0  && `⚠ Entregado con ${dif} día${dif === 1 ? '' : 's'} de retraso`}
          </p>
        </div>
      )}

      {editando && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={cancelar}
            className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={saving}
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 rounded disabled:opacity-50"
          >
            <Save size={12} />
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      )}

      {todasVacias && !editando && (
        <p className="text-xs text-gray-400 italic mt-2">Sin fechas capturadas todavía</p>
      )}
    </div>
  )
}
