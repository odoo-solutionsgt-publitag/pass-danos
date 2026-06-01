import { useEffect, useState } from 'react'
import { ClipboardEdit, Send, User } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { usePermisos } from '../hooks/usePermisos'
import { formatDateTime as fmtDateTime } from '../lib/fecha'

const MAX_LEN = 500

function formatDateTime(iso) {
  return fmtDateTime(iso) ?? ''
}

export default function BitacoraActualizaciones({ tipo, registroId }) {
  const { user, perfil } = useAuth()
  const { puedeEditar } = usePermisos()

  const [notas, setNotas]     = useState([])
  const [loading, setLoading] = useState(true)
  const [nueva, setNueva]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const columna = tipo === 'dano' ? 'siniestro_id' : 'orden_servicio_id'

  useEffect(() => { load() }, [registroId])

  async function load() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('bitacora_actualizaciones')
      .select('*')
      .eq(columna, registroId)
      .order('created_at', { ascending: false })

    if (err) setError(err.message)
    setNotas(data ?? [])
    setLoading(false)
  }

  async function handleAgregar() {
    const texto = nueva.trim()
    if (!texto) return
    if (texto.length > MAX_LEN) {
      setError(`La nota excede ${MAX_LEN} caracteres`)
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        [columna]:      registroId,
        nota:           texto,
        usuario_id:     user?.id ?? null,
        usuario_email:  user?.email ?? null,
        usuario_nombre: perfil?.nombre_completo ?? null,
      }
      const { error: err } = await supabase
        .from('bitacora_actualizaciones')
        .insert(payload)

      if (err) throw err
      setNueva('')
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardEdit size={16} className="text-gray-400" />
        <h3 className="font-semibold text-gray-800 text-sm">Bitácora de actualización</h3>
        {notas.length > 0 && (
          <span className="text-xs text-gray-400">({notas.length})</span>
        )}
      </div>

      {/* Input nueva nota */}
      {puedeEditar && (
        <div className="mb-4 border border-gray-200 rounded-xl p-3 bg-gray-50/50">
          <textarea
            value={nueva}
            onChange={e => setNueva(e.target.value.slice(0, MAX_LEN))}
            rows={2}
            placeholder="Agregar una actualización… (ej: 'Vehículo entró a pintura', 'Espera repuesto', etc.)"
            className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-red-400 resize-none"
            disabled={saving}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                handleAgregar()
              }
            }}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-400">
              {nueva.length} / {MAX_LEN} caracteres · Ctrl+Enter para enviar
            </span>
            <button
              onClick={handleAgregar}
              disabled={!nueva.trim() || saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-40"
            >
              <Send size={12} />
              {saving ? 'Guardando…' : 'Agregar'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">{error}</p>
      )}

      {/* Lista de notas */}
      {loading ? (
        <p className="text-sm text-gray-400 py-2">Cargando…</p>
      ) : notas.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4 italic">
          Sin actualizaciones registradas.
          {puedeEditar && ' Agrega la primera para llevar el seguimiento.'}
        </p>
      ) : (
        <ol className="space-y-3">
          {notas.map((n, idx) => (
            <li
              key={n.id}
              className={`border-l-2 pl-3 py-1 ${idx === 0 ? 'border-red-500' : 'border-gray-200'}`}
            >
              <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
                <span className="text-xs text-gray-500">{formatDateTime(n.created_at)}</span>
                {idx === 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium uppercase tracking-wider">
                    Más reciente
                  </span>
                )}
                {(n.usuario_nombre || n.usuario_email) && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <User size={10} />
                    {n.usuario_nombre || n.usuario_email}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{n.nota}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
