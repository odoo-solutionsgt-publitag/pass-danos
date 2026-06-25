import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, Pencil, X, Save, Wrench, Package, AlertCircle, CheckCircle2, Upload, Ban } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../hooks/usePermisos'
import TallerContactosEditor from '../components/TallerContactosEditor'


// ── Catálogo de marcas y líneas de la flota ──────────────────
const MARCAS_LINEAS = {
  Chevrolet:  ['Suburban', 'Tracker'],
  Hyundai:    ['SANTA FE', 'Staria'],
  Mazda:      ['CX5'],
  Mitsubishi: ['L200', 'Montero'],
  Toyota:     ['Agya', 'Corolla', 'HI ACE', 'HI LUX', 'Innova', 'Prado', 'Yaris'],
}
const MARCAS = Object.keys(MARCAS_LINEAS).sort()

const CATEGORIAS = [
  { value: 'repuesto',             label: 'Repuesto' },
  { value: 'rayones_golpes_leves', label: 'Rayones y Golpes Leves' },
  { value: 'otro',                 label: 'Otro' },
]

const CATEGORIA_COLORS = {
  repuesto:             'bg-gray-100 text-gray-700',
  rayones_golpes_leves: 'bg-amber-100 text-amber-700',
  otro:                 'bg-blue-100 text-blue-700',
}

const CATEGORIA_LABELS = {
  repuesto:             'Repuesto',
  rayones_golpes_leves: 'Rayones / Golpes',
  otro:                 'Otro',
}

const SECCION_INFO = {
  talleres:  { titulo: 'Talleres',  subtitulo: 'Proveedores de servicio automotriz', icon: Wrench },
  repuestos: { titulo: 'Repuestos', subtitulo: 'Catálogo de repuestos y mano de obra', icon: Package },
}

export default function Catalogos() {
  const { puedeCrear, puedeEditar, puedeVerAnulados } = usePermisos()
  const [searchParams] = useSearchParams()

  // Tab derivado directamente de la URL — reactivo a cambios del sidebar
  const tab = searchParams.get('tab') === 'repuestos' ? 'repuestos' : 'talleres'
  const { titulo, subtitulo, icon: SeccionIcon } = SECCION_INFO[tab]

  const esAdmin = puedeCrear || puedeEditar

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <SeccionIcon size={22} className="text-gray-400 shrink-0" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">{titulo}</h1>
          <p className="text-sm text-gray-500">
            {subtitulo}{!esAdmin && ' · Solo lectura'}
          </p>
        </div>
      </div>

      {tab === 'talleres' && <TalleresTab esAdmin={esAdmin} />}
      {tab === 'repuestos' && <RepuestosTab esAdmin={esAdmin} puedeVerAnulados={puedeVerAnulados} />}
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

function RepuestosTab({ esAdmin, puedeVerAnulados }) {
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda]           = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroMarca, setFiltroMarca]     = useState('')
  const [filtroLinea, setFiltroLinea]     = useState('')
  const [filtroVigencia, setFiltroVigencia] = useState('')
  const [soloActivos, setSoloActivos]     = useState(true)
  const [editando, setEditando]           = useState(null)
  const [importando, setImportando]       = useState(false)
  const [anulando, setAnulando]           = useState(null) // ID del repuesto pendiente de confirmar

  function setMarcaFiltro(v) {
    setFiltroMarca(v)
    setFiltroLinea('')   // resetear línea al cambiar marca
  }

  const lineasFiltro = MARCAS_LINEAS[filtroMarca] ?? []

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

  async function anularRepuesto(id) {
    const { error } = await supabase
      .from('repuestos_catalogo')
      .update({ activo: false })
      .eq('id', id)
    if (!error) { setAnulando(null); load() }
  }

  const filtrados = items.filter(r => {
    // Ocultar inactivos: siempre si no tiene permiso, o si tiene permiso pero soloActivos está marcado
    if (!r.activo && (!puedeVerAnulados || soloActivos)) return false
    if (filtroCategoria && r.categoria !== filtroCategoria) return false
    if (filtroMarca && r.marca?.toLowerCase() !== filtroMarca.toLowerCase()) return false
    if (filtroLinea && r.linea_modelo?.toLowerCase() !== filtroLinea.toLowerCase()) return false
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
        {/* Búsqueda */}
        <div className="flex-1 min-w-[220px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por código, nombre, marca o modelo..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
          />
        </div>

        {/* Categoría */}
        <select
          value={filtroCategoria}
          onChange={e => setFiltroCategoria(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-red-500 text-gray-600"
        >
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        {/* Marca */}
        <select
          value={filtroMarca}
          onChange={e => setMarcaFiltro(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-red-500 text-gray-600"
        >
          <option value="">Todas las marcas</option>
          {MARCAS.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {/* Línea — solo visible si hay marca seleccionada */}
        {filtroMarca && lineasFiltro.length > 0 && (
          <select
            value={filtroLinea}
            onChange={e => setFiltroLinea(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-red-500 text-gray-600"
          >
            <option value="">Todas las líneas</option>
            {lineasFiltro.map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        )}

        {/* Vigencia */}
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

        {/* Solo activos — solo visible si el usuario puede ver anulados */}
        {puedeVerAnulados && (
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={soloActivos}
              onChange={e => setSoloActivos(e.target.checked)}
              className="rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            Solo activos
          </label>
        )}

        {esAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => setImportando(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              <Upload size={16} />
              Importar Excel
            </button>
            <button
              onClick={() => setEditando({})}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              <Plus size={16} />
              Nuevo repuesto
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Código</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Repuesto</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Categoría</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Marca / Modelo</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Años</th>
                <th className="text-right px-5 py-3 text-xs text-gray-500 font-medium">Lista Q</th>
                <th className="text-right px-5 py-3 text-xs text-gray-500 font-medium">M.O. Q</th>
                <th className="text-right px-5 py-3 text-xs text-gray-500 font-medium">Total Q</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Vigencia</th>
                {esAdmin && <th className="px-5 py-3 w-16" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: esAdmin ? 10 : 9 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-3.5 bg-gray-100 rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={esAdmin ? 10 : 9} className="px-5 py-12 text-center text-gray-400">
                    No hay repuestos registrados
                  </td>
                </tr>
              ) : (
                filtrados.map(r => {
                  const v = vigenciaRepuesto(r.precio_actualizado_at)
                  const catColor = CATEGORIA_COLORS[r.categoria] ?? 'bg-gray-100 text-gray-600'
                  const catLabel = CATEGORIA_LABELS[r.categoria] ?? r.categoria ?? '—'
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3.5 font-mono text-xs text-gray-700 whitespace-nowrap">{r.codigo}</td>
                      <td className="px-5 py-3.5 font-medium text-gray-900">{r.nombre}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${catColor}`}>
                          {catLabel}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">
                        {r.marca || '—'}
                        {r.linea_modelo && <span className="text-gray-400"> · {r.linea_modelo}</span>}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 text-xs">{r.anios || '—'}</td>
                      <td className="px-5 py-3.5 text-gray-700 text-right whitespace-nowrap">{formatMonto(r.precio_ref)}</td>
                      <td className="px-5 py-3.5 text-gray-700 text-right whitespace-nowrap">{formatMonto(r.precio_mano_obra)}</td>
                      <td className="px-5 py-3.5 font-medium text-gray-900 text-right whitespace-nowrap">{formatMonto(r.precio_total)}</td>
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
                          {anulando === r.id ? (
                            <div className="flex items-center gap-1 justify-end">
                              <span className="text-xs text-red-600 mr-1 whitespace-nowrap">¿Anular?</span>
                              <button
                                onClick={() => anularRepuesto(r.id)}
                                className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded"
                              >
                                Sí
                              </button>
                              <button
                                onClick={() => setAnulando(null)}
                                className="px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded"
                              >
                                No
                              </button>
                            </div>
                          ) : r.activo ? (
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => setEditando(r)}
                                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
                                title="Editar"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => setAnulando(r.id)}
                                className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded"
                                title="Anular"
                              >
                                <Ban size={14} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300 italic">anulado</span>
                          )}
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
      {importando && (
        <ImportarRepuestosModal
          onClose={() => setImportando(false)}
          onSuccess={() => load()}
        />
      )}
    </div>
  )
}

function RepuestoModal({ repuesto, onClose, onSaved }) {
  const esNuevo = !repuesto.id
  const [form, setForm] = useState({
    codigo:           repuesto.codigo || '',
    nombre:           repuesto.nombre || '',
    categoria:        repuesto.categoria || 'repuesto',
    marca:            repuesto.marca || '',
    linea_modelo:     repuesto.linea_modelo || '',
    anios:            repuesto.anios || '',
    precio_ref:       repuesto.precio_ref ?? '',
    precio_mano_obra: repuesto.precio_mano_obra ?? '',
    activo:           repuesto.activo ?? true,
  })
  const [actualizarPrecio, setActualizarPrecio] = useState(esNuevo)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function setMarca(v) {
    setForm(f => ({ ...f, marca: v, linea_modelo: '' }))
  }

  const lineasDisponibles = MARCAS_LINEAS[form.marca] ?? []
  const precioTotal = (Number(form.precio_ref) || 0) + (Number(form.precio_mano_obra) || 0)

  function formatMonto(n) {
    if (!n && n !== 0) return ''
    return Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  async function guardar() {
    if (!form.codigo.trim() || !form.nombre.trim()) {
      setError('Código y nombre son obligatorios')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        codigo:           form.codigo.trim().toUpperCase(),
        nombre:           form.nombre.trim(),
        categoria:        form.categoria,
        marca:            form.marca || null,
        linea_modelo:     form.linea_modelo || null,
        anios:            form.anios.trim() || null,
        precio_ref:       form.precio_ref === '' ? 0 : Number(form.precio_ref),
        precio_mano_obra: form.precio_mano_obra === '' ? 0 : Number(form.precio_mano_obra),
        activo:           form.activo,
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

          {/* Código + Nombre */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Código *">
              <input
                type="text"
                value={form.codigo}
                onChange={e => setField('codigo', e.target.value.toUpperCase())}
                placeholder="AGYA-01"
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

          {/* Categoría */}
          <Field label="Categoría">
            <select
              value={form.categoria}
              onChange={e => setField('categoria', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500 text-gray-700"
            >
              {CATEGORIAS.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>

          {/* Marca + Línea */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Marca">
              <select
                value={form.marca}
                onChange={e => setMarca(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500 text-gray-700"
              >
                <option value="">— Sin marca</option>
                {MARCAS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Línea / Modelo">
              {lineasDisponibles.length > 0 ? (
                <select
                  value={form.linea_modelo}
                  onChange={e => setField('linea_modelo', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500 text-gray-700"
                >
                  <option value="">— Sin línea</option>
                  {lineasDisponibles.map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.linea_modelo}
                  onChange={e => setField('linea_modelo', e.target.value)}
                  placeholder="Modelo"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
                />
              )}
            </Field>
          </div>

          {/* Años */}
          <Field label="Años">
            <input
              type="text"
              value={form.anios}
              onChange={e => setField('anios', e.target.value)}
              placeholder="2018-2023"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
            />
          </Field>

          {/* 3 precios */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Precio Lista Q">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.precio_ref}
                onChange={e => setField('precio_ref', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500 text-right"
              />
            </Field>
            <Field label="Mano de Obra Q">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.precio_mano_obra}
                onChange={e => setField('precio_mano_obra', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500 text-right"
              />
            </Field>
            <Field label="Total Q">
              <div className="w-full px-3 py-2 text-sm border border-gray-100 rounded-lg bg-gray-50 text-right text-gray-700 font-medium">
                {formatMonto(precioTotal) || '0.00'}
              </div>
            </Field>
          </div>
          <p className="text-xs text-gray-400 -mt-2">Total = Precio Lista + Mano de Obra (calculado automáticamente)</p>

          {/* Marcar precio */}
          {!esNuevo && (
            <label className="flex items-center gap-2 text-sm text-gray-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg cursor-pointer">
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

          {/* Activo */}
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
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
// NORMALIZACIÓN DE NOMBRES DE REPUESTOS
// ============================================================

function normalizarNombreRepuesto(s) {
  if (!s) return s

  // ── 1. Correcciones ortográficas ─────────────────────────────
  const CORRECCIONES = [
    [/\bBompers?\b/gi,    m => m.toLowerCase().includes('s') ? 'Bumpers' : 'Bumper'],
    [/\bAlineacion\b/gi,  'Alineación'],
    [/\bPerciana\b/gi,    'Persiana'],
    [/\bRajilla\b/gi,     'Rejilla'],
    [/\bRegilla\b/gi,     'Rejilla'],
    [/\bMagnecio\b/gi,    'Magnesio'],
    [/\bTapiceria\b/gi,   'Tapicería'],
    [/\bBateria\b/gi,     'Batería'],
    [/\bTricket\b/gi,     'Trinquete'],
    [/\bCapo\b/gi,        'Capó'],
    [/\bFaldon\b/gi,      'Faldón'],
    [/\bMu.on\b/gi,       'Muñón'],   // Muñon / Muon (encoding issues)
    [/\bbaul\b/gi,        'baúl'],
    [/\bNeblineros\b/gi,  'Neblineras'],
    // Estandarizar género del descriptor de posición
    [/\bTrasera\b/g,      'Trasero'],
  ]
  for (const [pattern, repl] of CORRECCIONES) {
    s = s.replace(pattern, repl)
  }

  // ── 2. Expandir abreviaturas de posición ─────────────────────
  // Orden: variantes con paréntesis primero, luego con punto

  // (Delt.) / (delt.) / (Del.) / (del.)
  s = s.replace(/\(Delt?\.\)/gi, 'Delantero')
  // (Tras.) / (Trasero) / (Trasera) con paréntesis
  s = s.replace(/\(Tras(?:ero|era|e?)\.?\)/gi, 'Trasero')

  // delt. / Delt. → Delantero (con punto obligatorio)
  s = s.replace(/\bDelt\.\s*/gi, 'Delantero ')
  // del. → Delantero (solo con punto para no confundir con "del")
  s = s.replace(/\bdel\.\s*/gi, 'Delantero ')

  // Trase. / tras. / Tras. → Trasero (con punto)
  s = s.replace(/\bTrase?\.\s*/gi, 'Trasero ')

  // ── 3. Limpiar espacios ───────────────────────────────────────
  s = s.replace(/\s+/g, ' ').trim()

  return s
}

// ============================================================
// IMPORTAR REPUESTOS DESDE EXCEL
// ============================================================

function ImportarRepuestosModal({ onClose, onSuccess }) {
  const [marca, setMarcaState]    = useState('')
  const [linea, setLinea]         = useState('')
  const [filas, setFilas]         = useState(null)
  const [parseando, setParseando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError]         = useState('')

  const lineasDisp = MARCAS_LINEAS[marca] ?? []

  function setMarca(v) {
    setMarcaState(v)
    setLinea('')  // resetear línea al cambiar marca
  }

  const filasValidas  = filas?.filter(f => f._errores.length === 0) ?? []
  const filasConError = filas?.filter(f => f._errores.length > 0) ?? []
  const previewFilas  = filas?.slice(0, 25) ?? []
  const hayMas        = (filas?.length ?? 0) > 25

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setParseando(true)
    setFilas(null)
    setResultado(null)
    setError('')
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await file.arrayBuffer())
      const ws = wb.worksheets[0]

      // Detectar columnas por encabezado en fila 1
      const colMap = {}
      ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
        const h = cell.text?.toString().trim().toLowerCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, '') // quitar tildes/diacríticos
        if (/^no\.?$|^codigo/.test(h))              colMap.codigo           = col
        else if (/modelo|linea/.test(h))             colMap.linea_modelo     = col
        else if (/categor/.test(h))                  colMap.categoria        = col
        else if (/articulo|nombre|repuesto/.test(h)) colMap.nombre           = col
        else if (/lista|precio lista/.test(h))       colMap.precio_ref       = col
        else if (/mano|m\.o/.test(h))                colMap.precio_mano_obra = col
      })

      const getText = (row, col) =>
        col ? (row.getCell(col).text?.toString().trim() ?? '') : ''

      const getNum = (row, col) => {
        if (!col) return 0
        const v = row.getCell(col).value
        if (typeof v === 'number') return v
        if (v && typeof v === 'object' && 'result' in v) return Number(v.result) || 0
        return parseFloat(getText(row, col).replace(/,/g, '')) || 0
      }

      const mapCategoria = (raw) => {
        const s = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        if (/rayon|golpe/.test(s)) return 'rayones_golpes_leves'
        if (/^otro/.test(s)) return 'otro'
        return 'repuesto'
      }

      // Prefijo de código: si hay línea seleccionada, ej: "AGYA" → "AGYA-"
      const lineaUpper  = linea ? linea.toUpperCase().replace(/\s+/g, '') : ''
      const buildCodigo = (raw) => {
        const upper = raw.trim().toUpperCase()
        // Si ya tiene letras (ej: AGYA-01) → se usa tal cual
        if (/[A-Z]/.test(upper)) return upper
        // Si es puramente numérico → formato LINEA-000001
        if (/^\d+$/.test(upper) && lineaUpper) {
          return `${lineaUpper}-${upper.padStart(6, '0')}`
        }
        return upper
      }

      const parsed = []
      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return
        const codigoRaw   = getText(row, colMap.codigo)
        const nombreRaw   = getText(row, colMap.nombre)
        if (!codigoRaw && !nombreRaw) return // fila vacía
        const errores = []
        if (!codigoRaw) errores.push('Sin código')
        if (!nombreRaw) errores.push('Sin artículo')
        const codigo     = codigoRaw ? buildCodigo(codigoRaw) : ''
        const nombreNorm = normalizarNombreRepuesto(nombreRaw)
        parsed.push({
          _rowNum:         rowNum,
          _errores:        errores,
          _nombreOriginal: nombreRaw !== nombreNorm ? nombreRaw : null,
          codigo,
          nombre:           nombreNorm,
          linea_modelo:     getText(row, colMap.linea_modelo) || null,
          categoria:        mapCategoria(getText(row, colMap.categoria)),
          precio_ref:       getNum(row, colMap.precio_ref),
          precio_mano_obra: getNum(row, colMap.precio_mano_obra),
        })
      })
      setFilas(parsed)
    } catch (err) {
      setError('Error al leer el archivo: ' + err.message)
    } finally {
      setParseando(false)
    }
  }

  async function confirmar() {
    if (filasValidas.length === 0) return
    setGuardando(true)
    setError('')
    try {
      const payload = filasValidas.map(f => ({
        codigo:               f.codigo,
        nombre:               f.nombre,
        marca:                marca || null,
        linea_modelo:         f.linea_modelo || linea || null,
        categoria:            f.categoria,
        anios:                null,
        precio_ref:           f.precio_ref,
        precio_mano_obra:     f.precio_mano_obra,
        precio_actualizado_at: new Date().toISOString(),
        activo:               true,
      }))
      const { error: sbErr } = await supabase
        .from('repuestos_catalogo')
        .upsert(payload, { onConflict: 'codigo', ignoreDuplicates: false })
      if (sbErr) throw sbErr
      setResultado({ total: filasValidas.length, omitidas: filasConError })
      onSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  function fmtQ(n) {
    return n ? `Q ${Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2 })}` : '—'
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl z-50 w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Upload size={18} className="text-green-600" />
            Importar repuestos desde Excel
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {resultado ? (
            /* ── Pantalla de resultado ── */
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-start gap-3">
                <CheckCircle2 size={20} className="text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-green-800">Importación completada</p>
                  <p className="text-sm text-green-700">
                    Se procesaron {resultado.total} repuesto{resultado.total !== 1 ? 's' : ''} correctamente.
                  </p>
                </div>
              </div>
              {resultado.omitidas.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <p className="text-sm font-medium text-amber-800 mb-1">
                    {resultado.omitidas.length} fila{resultado.omitidas.length !== 1 ? 's' : ''} omitida{resultado.omitidas.length !== 1 ? 's' : ''} (sin código o artículo):
                  </p>
                  <ul className="text-sm text-amber-700 space-y-0.5">
                    {resultado.omitidas.map(f => (
                      <li key={f._rowNum}>· Fila {f._rowNum}: {f._errores.join(', ')}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            /* ── Formulario de importación ── */
            <>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg flex items-center gap-2">
                  <AlertCircle size={15} /> {error}
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <Field label="Marca (todas las filas)">
                  <select
                    value={marca}
                    onChange={e => setMarca(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500 text-gray-700"
                  >
                    <option value="">— Sin marca</option>
                    {MARCAS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Línea / Modelo (todas las filas)">
                  {lineasDisp.length > 0 ? (
                    <select
                      value={linea}
                      onChange={e => setLinea(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500 text-gray-700"
                    >
                      <option value="">— Sin línea</option>
                      {lineasDisp.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={linea}
                      onChange={e => setLinea(e.target.value)}
                      placeholder="Ej: Agya"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
                    />
                  )}
                </Field>
                <Field label="Archivo Excel">
                  <label className={`flex items-center gap-2 px-3 py-2 text-sm border border-dashed rounded-lg cursor-pointer transition-colors ${
                    parseando
                      ? 'border-gray-200 text-gray-400'
                      : 'border-gray-300 hover:border-green-500 hover:bg-green-50 text-gray-500'
                  }`}>
                    <Upload size={15} />
                    {parseando ? 'Leyendo...' : 'Seleccionar .xlsx'}
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={handleFile}
                      disabled={parseando}
                    />
                  </label>
                </Field>
              </div>

              <p className="text-xs text-gray-400">
                Columnas mínimas requeridas: <span className="font-mono">No. · Artículo · Precio Lista · Mano de Obra</span>
                {' · '}Marca y Línea se toman de los selectores si el archivo no las incluye.
              </p>

              {filas !== null && (
                <div className="space-y-2">
                  <div className="flex items-center gap-4 text-sm flex-wrap">
                    <span className="text-gray-500">{filas.length} filas detectadas</span>
                    {filasConError.length > 0 && (
                      <span className="text-amber-600 flex items-center gap-1">
                        <AlertCircle size={13} /> {filasConError.length} con problemas (se omitirán)
                      </span>
                    )}
                    {filas.filter(f => f._nombreOriginal).length > 0 && (
                      <span className="text-blue-600 flex items-center gap-1">
                        ✎ {filas.filter(f => f._nombreOriginal).length} nombres normalizados
                      </span>
                    )}
                    <span className="text-green-700 font-medium">{filasValidas.length} listas para importar</span>
                  </div>

                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-64">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-3 py-2 text-left text-gray-500 font-medium w-8">Fila</th>
                            <th className="px-3 py-2 text-left text-gray-500 font-medium">Código</th>
                            <th className="px-3 py-2 text-left text-gray-500 font-medium">Artículo</th>
                            <th className="px-3 py-2 text-left text-gray-500 font-medium">Línea</th>
                            <th className="px-3 py-2 text-left text-gray-500 font-medium">Categoría</th>
                            <th className="px-3 py-2 text-right text-gray-500 font-medium">Lista Q</th>
                            <th className="px-3 py-2 text-right text-gray-500 font-medium">M.O. Q</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {previewFilas.map(f => (
                            <tr key={f._rowNum} className={f._errores.length > 0 ? 'bg-red-50' : 'hover:bg-gray-50'}>
                              <td className="px-3 py-2 text-gray-400">{f._rowNum}</td>
                              <td className="px-3 py-2 font-mono">
                                {f._errores.length > 0
                                  ? <span className="text-red-600 flex items-center gap-1"><AlertCircle size={11} />{f._errores.join(', ')}</span>
                                  : <span className="text-gray-700">{f.codigo}</span>
                                }
                              </td>
                              <td className="px-3 py-2">
                                <span className="text-gray-900">{f.nombre || '—'}</span>
                                {f._nombreOriginal && (
                                  <p className="text-[10px] text-gray-400 line-through mt-0.5">{f._nombreOriginal}</p>
                                )}
                              </td>
                              <td className="px-3 py-2 text-gray-600">{f.linea_modelo || '—'}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${CATEGORIA_COLORS[f.categoria] ?? ''}`}>
                                  {CATEGORIA_LABELS[f.categoria] ?? f.categoria}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right text-gray-700">{fmtQ(f.precio_ref)}</td>
                              <td className="px-3 py-2 text-right text-gray-700">{fmtQ(f.precio_mano_obra)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {hayMas && (
                      <p className="text-center text-xs text-gray-400 py-2 border-t border-gray-100">
                        … y {filas.length - 25} filas más
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-3 flex justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
          >
            {resultado ? 'Cerrar' : 'Cancelar'}
          </button>
          {!resultado && (
            <button
              onClick={confirmar}
              disabled={guardando || filasValidas.length === 0}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
            >
              <Upload size={15} />
              {guardando
                ? 'Guardando...'
                : `Importar ${filasValidas.length} repuesto${filasValidas.length !== 1 ? 's' : ''}`
              }
            </button>
          )}
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
