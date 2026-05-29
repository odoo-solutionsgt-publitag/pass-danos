import { useState, useEffect } from 'react'
import { Plus, Trash2, Star, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'

export const AREAS = [
  { value: 'taller',          label: 'Taller (jefe)' },
  { value: 'mecanica',        label: 'Mecánica' },
  { value: 'pintura',         label: 'Pintura' },
  { value: 'servicio',        label: 'Servicio (Menor/Mayor)' },
  { value: 'facturas_pagos',  label: 'Facturas / Pagos' },
  { value: 'contabilidad',    label: 'Contabilidad' },
  { value: 'gerencia',        label: 'Gerencia' },
]

const AREA_LABEL = Object.fromEntries(AREAS.map(a => [a.value, a.label]))

const CONTACTO_VACIO = {
  nombre: '', puesto: '', area: 'taller',
  telefono: '', whatsapp: '', email: '',
  es_principal: false, activo: true,
}

/**
 * Editor inline de contactos de un taller (Plan F2/D).
 * Máximo 3 contactos activos por taller (enforced en DB también).
 *
 * Props:
 *  - tallerId: UUID del taller (null si aún no se ha guardado)
 *  - onChange?: callback al cambiar contactos (para state padre)
 *  - readOnly?: bool
 */
export default function TallerContactosEditor({ tallerId, readOnly = false }) {
  const [contactos, setContactos] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [editando, setEditando]   = useState(null) // contacto siendo editado o {} para nuevo

  useEffect(() => {
    if (tallerId) load()
    else { setContactos([]); setLoading(false) }
  }, [tallerId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('taller_contactos')
      .select('*')
      .eq('taller_id', tallerId)
      .order('es_principal', { ascending: false })
      .order('created_at', { ascending: true })
    setContactos(data ?? [])
    setLoading(false)
  }

  const activos = contactos.filter(c => c.activo)
  const llenoMax = activos.length >= 3

  async function guardarContacto(payload) {
    setError('')
    const esNuevo = !payload.id
    try {
      if (esNuevo) {
        const { error } = await supabase.from('taller_contactos').insert({
          ...payload,
          taller_id: tallerId,
        })
        if (error) throw error
      } else {
        const { id, ...campos } = payload
        const { error } = await supabase.from('taller_contactos').update(campos).eq('id', id)
        if (error) throw error
      }
      setEditando(null)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function eliminarContacto(id) {
    if (!confirm('¿Eliminar este contacto?')) return
    const { error } = await supabase.from('taller_contactos').delete().eq('id', id)
    if (error) { setError(error.message); return }
    await load()
  }

  if (!tallerId) {
    return (
      <div className="text-xs text-gray-400 italic py-4 text-center border border-dashed border-gray-200 rounded-lg">
        Guarde el taller primero para poder agregar contactos
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-gray-600">
          Contactos {activos.length > 0 && <span className="text-gray-400">({activos.length}/3)</span>}
        </label>
        {!readOnly && !llenoMax && !editando && (
          <button
            onClick={() => setEditando({ ...CONTACTO_VACIO })}
            className="flex items-center gap-1 text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded"
          >
            <Plus size={12} /> Agregar
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-2 py-1.5 rounded flex items-center gap-1">
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {loading ? (
        <div className="h-12 bg-gray-50 animate-pulse rounded" />
      ) : contactos.length === 0 && !editando ? (
        <p className="text-xs text-gray-400 italic text-center py-3 border border-dashed border-gray-200 rounded">
          Sin contactos registrados
        </p>
      ) : (
        <ul className="space-y-1.5">
          {contactos.map(c => (
            <li key={c.id} className={`border rounded-lg p-2.5 ${c.activo ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {c.es_principal && <Star size={11} className="text-amber-500 fill-amber-400 shrink-0" />}
                    <span className="text-sm font-medium text-gray-900 truncate">{c.nombre}</span>
                    <span className="text-xs px-1.5 py-0 rounded bg-gray-100 text-gray-600 shrink-0">
                      {AREA_LABEL[c.area] ?? c.area}
                    </span>
                  </div>
                  {c.puesto && <p className="text-xs text-gray-500 mt-0.5">{c.puesto}</p>}
                  <div className="text-xs text-gray-500 mt-0.5 space-x-2">
                    {c.telefono && <span>Tel: {c.telefono}</span>}
                    {c.whatsapp && <span>WA: {c.whatsapp}</span>}
                    {c.email && <span>{c.email}</span>}
                  </div>
                </div>
                {!readOnly && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditando(c)}
                      className="text-xs text-blue-600 hover:bg-blue-50 px-1.5 py-0.5 rounded"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => eliminarContacto(c.id)}
                      className="p-1 text-gray-300 hover:text-red-500"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editando && (
        <ContactoFormInline
          contacto={editando}
          contactosExistentes={contactos}
          onSave={guardarContacto}
          onCancel={() => setEditando(null)}
        />
      )}
    </div>
  )
}

function ContactoFormInline({ contacto, contactosExistentes, onSave, onCancel }) {
  const [form, setForm] = useState({ ...contacto })
  const esNuevo = !contacto.id

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  function handleSave() {
    if (!form.nombre.trim()) return
    onSave({
      ...form,
      nombre:   form.nombre.trim(),
      puesto:   form.puesto.trim() || null,
      telefono: form.telefono.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      email:    form.email.trim() || null,
    })
  }

  return (
    <div className="border border-red-200 bg-red-50 rounded-lg p-3 space-y-2">
      <p className="text-xs font-medium text-red-700">{esNuevo ? 'Nuevo contacto' : 'Editar contacto'}</p>
      <div className="grid grid-cols-2 gap-2">
        <input
          value={form.nombre}
          onChange={e => set('nombre', e.target.value)}
          placeholder="Nombre *"
          className="text-xs border border-red-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-red-400"
        />
        <select
          value={form.area}
          onChange={e => set('area', e.target.value)}
          className="text-xs border border-red-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-red-400"
        >
          {AREAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <input
          value={form.puesto}
          onChange={e => set('puesto', e.target.value)}
          placeholder="Puesto (opcional)"
          className="col-span-2 text-xs border border-red-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-red-400"
        />
        <input
          value={form.telefono}
          onChange={e => set('telefono', e.target.value)}
          placeholder="Teléfono"
          className="text-xs border border-red-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-red-400"
        />
        <input
          value={form.whatsapp}
          onChange={e => set('whatsapp', e.target.value)}
          placeholder="WhatsApp"
          className="text-xs border border-red-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-red-400"
        />
        <input
          value={form.email}
          onChange={e => set('email', e.target.value)}
          placeholder="Email"
          className="col-span-2 text-xs border border-red-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-red-400"
        />
      </div>
      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={form.es_principal}
            onChange={e => set('es_principal', e.target.checked)}
            className="rounded accent-red-600"
          />
          <Star size={11} className="text-amber-500" />
          Contacto principal del taller
        </label>
        <div className="flex gap-1">
          <button onClick={onCancel} className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!form.nombre.trim()}
            className="text-xs px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
