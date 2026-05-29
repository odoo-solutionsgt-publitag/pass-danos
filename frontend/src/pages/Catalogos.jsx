import { useState, useEffect } from 'react'
import { Plus, Search, Pencil, X, Save, Wrench, Package, AlertCircle, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../hooks/usePermisos'
import TallerContactosEditor from '../components/TallerContactosEditor'

const TABS = [
  { key: 'talleres', label: 'Talleres', icon: Wrench },
  { key: 'repuestos', label: 'Repuestos', icon: Package },
]

export default function Catalogos() {
  const { puedeCrear, puedeEditar } = usePermisos()
  const [tab, setTab] = useState('talleres')

  const esAdmin = puedeCrear || puedeEditar

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Catálogos</h1>
        <p className="text-sm text-gray-500">
          Mantenimiento de proveedores y repuestos
          {!esAdmin && ' · Solo lectura'}
        </p>
      </div>

      <div className="border-b border-gray-200 flex gap-1">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={15} />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'talleres' && <TalleresTab esAdmin={esAdmin} />}
      {tab === 'repuestos' && <RepuestosTab esAdmin={esAdmin} />}
    </div>
  )
}

// ============================================================
// TALLERES
// ============================================================

function TalleresTab({ esAdmin }) {
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [soloActivos, setSoloActivos] = useState(true)
  const [editando, setEditando] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('talleres')
      .select('*')
      .order('nombre', { ascending: true })
    setItems(data ?? [])
    setLoading(false)
  }

  const filtrados = items.filter(t => {
    if (soloActivos && !t.activo) return false
    if (busqueda) {
      const b = busqueda.toLowerCase()
      return t.nombre?.toLowerCase().includes(b) ||
             t.contacto?.toLowerCase().includes(b) ||
             t.telefono?.toLowerCase().includes(b)
    }
    return true
  })

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar taller..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={soloActivos}
            onChange={e => setSoloActivos(e.target.checked)}
            className="rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          Solo activos
        </label>
        {esAdmin && (
          <button
            onClick={() => setEditando({})}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            <Plus size={16} />
            Nuevo taller
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Nombre</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Contacto</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Teléfono</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Dirección</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Estado</th>
                {esAdmin && <th className="px-5 py-3 w-16" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: esAdmin ? 6 : 5 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-3.5 bg-gray-100 rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={esAdmin ? 6 : 5} className="px-5 py-12 text-center text-gray-400">
                    No hay talleres registrados
                  </td>
                </tr>
              ) : (
                filtrados.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3.5 font-medium text-gray-900">{t.nombre}</td>
                    <td className="px-5 py-3.5 text-gray-600">{t.contacto || '—'}</td>
                    <td className="px-5 py-3.5 text-gray-600">{t.telefono || '—'}</td>
                    <td className="px-5 py-3.5 text-gray-500 truncate max-w-xs">{t.direccion || '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        t.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {t.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {esAdmin && (
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => setEditando(t)}
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
                        >
                          <Pencil size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editando && (
        <TallerModal
          taller={editando}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); load() }}
        />
      )}
    </div>
  )
}

function TallerModal({ taller, onClose, onSaved }) {
  const esNuevo = !taller.id
  const [form, setForm] = useState({
    nombre:    taller.nombre || '',
    contacto:  taller.contacto || '',
    telefono:  taller.telefono || '',
    direccion: taller.direccion || '',
    notas:     taller.notas || '',
    activo:    taller.activo ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function guardar() {
    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (esNuevo) {
        const { error } = await supabase.from('talleres').insert(form)
        if (error) throw error
      } else {
        const { error } = await supabase.from('talleres').update(form).eq('id', taller.id)
        if (error) throw error
      }
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">{esNuevo ? 'Nuevo taller' : 'Editar taller'}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg flex items-center gap-2">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          <Field label="Nombre *">
            <input
              type="text"
              value={form.nombre}
              onChange={e => setField('nombre', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Contacto">
              <input
                type="text"
                value={form.contacto}
                onChange={e => setField('contacto', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
              />
            </Field>
            <Field label="Teléfono">
              <input
                type="text"
                value={form.telefono}
                onChange={e => setField('telefono', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
              />
            </Field>
          </div>

          <Field label="Dirección">
            <input
              type="text"
              value={form.direccion}
              onChange={e => setField('direccion', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
            />
          </Field>

          <Field label="Notas">
            <textarea
              value={form.notas}
              onChange={e => setField('notas', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500 resize-none"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={e => setField('activo', e.target.checked)}
              className="rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            Taller activo
          </label>

          {/* Contactos del taller (solo si ya existe el taller) */}
          {taller.id && (
            <div className="border-t border-gray-100 pt-4">
              <TallerContactosEditor tallerId={taller.id} />
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={saving}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            <Save size={15} />
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </>
  )
}

// ============================================================
// REPUESTOS
// ============================================================

function vigenciaRepuesto(precio_actualizado_at) {
  if (!precio_actualizado_at) return { label: 'Sin precio', color: 'bg-gray-100 text-gray-500' }
  const dias = Math.floor((Date.now() - new Date(precio_actualizado_at).getTime()) / 86400000)
  if (dias <= 30)  return { label: 'Vigente',        color: 'bg-green-100 text-green-700', dias }
  if (dias <= 90)  return { label: 'Revisar',        color: 'bg-amber-100 text-amber-700', dias }
  return                   { label: 'Desactualizado', color: 'bg-red-100 text-red-700',     dias }
}

function RepuestosTab({ esAdmin }) {
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroVigencia, setFiltroVigencia] = useState('')
  const [soloActivos, setSoloActivos] = useState(true)
  const [editando, setEditando] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('repuestos_catalogo')
      .select('*')
      .order('codigo', { ascending: true })
    setItems(data ?? [])
    setLoading(false)
  }

  const filtrados = items.filter(r => {
    if (soloActivos && !r.activo) return false
    if (filtroVigencia) {
      const v = vigenciaRepuesto(r.precio_actualizado_at)
      if (v.label !== filtroVigencia) return false
    }
    if (busqueda) {
      const b = busqueda.toLowerCase()
      return r.codigo?.toLowerCase().includes(b) ||
             r.nombre?.toLowerCase().includes(b) ||
             r.marca?.toLowerCase().includes(b) ||
             r.linea_modelo?.toLowerCase().includes(b)
    }
    return true
  })

  function formatMonto(v) {
    if (v == null || v === '') return '—'
    return `Q ${Number(v).toLocaleString('es-GT', { minimumFractionDigits: 2 })}`
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por código, nombre, marca o modelo..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
          />
        </div>
        <select
          value={filtroVigencia}
          onChange={e => setFiltroVigencia(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-red-500 text-gray-600"
        >
          <option value="">Cualquier vigencia</option>
          <option value="Vigente">Vigente</option>
          <option value="Revisar">Revisar</option>
          <option value="Desactualizado">Desactualizado</option>
          <option value="Sin precio">Sin precio</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={soloActivos}
            onChange={e => setSoloActivos(e.target.checked)}
            className="rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          Solo activos
        </label>
        {esAdmin && (
          <button
            onClick={() => setEditando({})}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            <Plus size={16} />
            Nuevo repuesto
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Código</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Repuesto</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Marca / Modelo</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Años</th>
                <th className="text-right px-5 py-3 text-xs text-gray-500 font-medium">Precio ref. Q</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Vigencia</th>
                {esAdmin && <th className="px-5 py-3 w-16" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: esAdmin ? 7 : 6 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-3.5 bg-gray-100 rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={esAdmin ? 7 : 6} className="px-5 py-12 text-center text-gray-400">
                    No hay repuestos registrados
                  </td>
                </tr>
              ) : (
                filtrados.map(r => {
                  const v = vigenciaRepuesto(r.precio_actualizado_at)
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3.5 font-mono text-xs text-gray-700 whitespace-nowrap">{r.codigo}</td>
                      <td className="px-5 py-3.5 font-medium text-gray-900">{r.nombre}</td>
                      <td className="px-5 py-3.5 text-gray-600">
                        {r.marca || '—'}
                        {r.linea_modelo && <span className="text-gray-400"> · {r.linea_modelo}</span>}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 text-xs">{r.anios || '—'}</td>
                      <td className="px-5 py-3.5 text-gray-700 text-right whitespace-nowrap">{formatMonto(r.precio_ref)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${v.color}`}>
                          {v.label}
                        </span>
                        {v.dias != null && (
                          <p className="text-[10px] text-gray-400 mt-0.5">hace {v.dias}d</p>
                        )}
                      </td>
                      {esAdmin && (
                        <td className="px-5 py-3.5 text-right">
                          <button
                            onClick={() => setEditando(r)}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
                          >
                            <Pencil size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editando && (
        <RepuestoModal
          repuesto={editando}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); load() }}
        />
      )}
    </div>
  )
}

function RepuestoModal({ repuesto, onClose, onSaved }) {
  const esNuevo = !repuesto.id
  const [form, setForm] = useState({
    codigo:       repuesto.codigo || '',
    nombre:       repuesto.nombre || '',
    marca:        repuesto.marca || '',
    linea_modelo: repuesto.linea_modelo || '',
    anios:        repuesto.anios || '',
    precio_ref:   repuesto.precio_ref ?? '',
    activo:       repuesto.activo ?? true,
  })
  const [actualizarPrecio, setActualizarPrecio] = useState(esNuevo)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function guardar() {
    if (!form.codigo.trim() || !form.nombre.trim()) {
      setError('Código y nombre son obligatorios')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        codigo:       form.codigo.trim().toUpperCase(),
        nombre:       form.nombre.trim(),
        marca:        form.marca.trim() || null,
        linea_modelo: form.linea_modelo.trim() || null,
        anios:        form.anios.trim() || null,
        precio_ref:   form.precio_ref === '' ? 0 : Number(form.precio_ref),
        activo:       form.activo,
      }
      if (actualizarPrecio || esNuevo) {
        payload.precio_actualizado_at = new Date().toISOString()
      }

      if (esNuevo) {
        const { error } = await supabase.from('repuestos_catalogo').insert(payload)
        if (error) throw error
      } else {
        const { error } = await supabase.from('repuestos_catalogo').update(payload).eq('id', repuesto.id)
        if (error) throw error
      }
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl z-50 w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">{esNuevo ? 'Nuevo repuesto' : 'Editar repuesto'}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg flex items-center gap-2">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Field label="Código *">
              <input
                type="text"
                value={form.codigo}
                onChange={e => setField('codigo', e.target.value.toUpperCase())}
                placeholder="REP-001"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500 font-mono"
              />
            </Field>
            <Field label="Nombre *" className="col-span-2">
              <input
                type="text"
                value={form.nombre}
                onChange={e => setField('nombre', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Marca">
              <input
                type="text"
                value={form.marca}
                onChange={e => setField('marca', e.target.value)}
                placeholder="Toyota"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
              />
            </Field>
            <Field label="Línea / Modelo">
              <input
                type="text"
                value={form.linea_modelo}
                onChange={e => setField('linea_modelo', e.target.value)}
                placeholder="Yaris"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Años">
              <input
                type="text"
                value={form.anios}
                onChange={e => setField('anios', e.target.value)}
                placeholder="2018-2023"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
              />
            </Field>
            <Field label="Precio referencia Q">
              <input
                type="number"
                step="0.01"
                value={form.precio_ref}
                onChange={e => setField('precio_ref', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500 text-right"
              />
            </Field>
          </div>

          {!esNuevo && (
            <label className="flex items-center gap-2 text-sm text-gray-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg">
              <input
                type="checkbox"
                checked={actualizarPrecio}
                onChange={e => setActualizarPrecio(e.target.checked)}
                className="rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <CheckCircle2 size={15} className="text-blue-500" />
              Marcar como precio actualizado hoy
            </label>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={e => setField('activo', e.target.checked)}
              className="rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            Repuesto activo
          </label>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={saving}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            <Save size={15} />
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </>
  )
}

// ============================================================
// Shared
// ============================================================

function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}
