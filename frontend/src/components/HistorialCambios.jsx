import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, ClipboardList, Plus, Pencil, Trash2, User } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDateTime as fmtDateTimeLib } from '../lib/fecha'

const OP_ICONS = {
  INSERT: { icon: Plus,    color: 'text-green-600 bg-green-50', label: 'Creado' },
  UPDATE: { icon: Pencil,  color: 'text-blue-600 bg-blue-50',   label: 'Editado' },
  DELETE: { icon: Trash2,  color: 'text-red-600 bg-red-50',     label: 'Eliminado' },
}

const CAMPOS_OCULTOS = ['id', 'created_at', 'updated_at', 'numero']

/**
 * Sección colapsable que muestra el historial de cambios de un registro.
 * Lee de audit_log filtrando por tabla + fila_id.
 *
 * Props:
 *  - tabla: 'siniestros' | 'ordenes_servicio' | etc.
 *  - filaId: UUID del registro
 *  - titulo?: string (default "Historial de cambios")
 */
export default function HistorialCambios({ tabla, filaId, titulo = 'Historial de cambios' }) {
  const [abierto, setAbierto] = useState(false)
  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!abierto) return
    if (!tabla || !filaId) return
    let cancel = false
    setLoading(true)
    supabase.from('audit_log')
      .select('*')
      .eq('tabla', tabla)
      .eq('fila_id', filaId)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (cancel) return
        setEventos(data ?? [])
        setLoading(false)
      })
    return () => { cancel = true }
  }, [abierto, tabla, filaId])

  function formatValor(v) {
    if (v === null || v === undefined) return '∅'
    if (typeof v === 'string') return v
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }

  function formatDateTime(iso) {
    return fmtDateTimeLib(iso) ?? '—'
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <button
        onClick={() => setAbierto(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <ClipboardList size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-800">{titulo}</h3>
          {abierto && eventos.length > 0 && (
            <span className="text-xs text-gray-400">({eventos.length})</span>
          )}
        </div>
        {abierto ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
      </button>

      {abierto && (
        <div className="px-5 pb-4 border-t border-gray-100">
          {loading ? (
            <div className="space-y-2 py-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
              ))}
            </div>
          ) : eventos.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Sin cambios registrados todavía</p>
          ) : (
            <ul className="divide-y divide-gray-50 mt-2 max-h-96 overflow-y-auto">
              {eventos.filter(e => !e.campo || !CAMPOS_OCULTOS.includes(e.campo)).map(e => {
                const opInfo = OP_ICONS[e.operacion] ?? OP_ICONS.UPDATE
                const Icon = opInfo.icon
                return (
                  <li key={e.id} className="py-2.5 flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${opInfo.color}`}>
                      <Icon size={13} />
                    </div>
                    <div className="flex-1 min-w-0 text-sm">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-700">{opInfo.label}</span>
                        {e.campo && (
                          <span className="text-xs text-gray-500">campo <code className="bg-gray-100 px-1 rounded">{e.campo}</code></span>
                        )}
                      </div>
                      {e.operacion === 'UPDATE' && e.campo && (
                        <p className="text-xs text-gray-600 mt-0.5">
                          <span className="text-gray-400 line-through">{formatValor(e.valor_anterior)}</span>
                          {' → '}
                          <span className="font-medium text-gray-800">{formatValor(e.valor_nuevo)}</span>
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                        <User size={11} />
                        <span>{e.usuario_email || 'Sistema'}</span>
                        <span>·</span>
                        <span>{formatDateTime(e.created_at)}</span>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
