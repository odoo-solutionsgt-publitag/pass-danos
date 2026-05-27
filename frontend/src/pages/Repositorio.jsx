import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Search, Download, Eye, Trash2, FileText, FileImage, FileSpreadsheet, File as FileIcon, X, AlertCircle, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const TIPO_LABELS = {
  cotizacion_pdf:    'Cotización',
  proforma_pdf:      'Proforma',
  foto_dano:         'Foto daño',
  factura:           'Factura',
  comprobante_pago:  'Comprobante',
  avaluo:            'Avalúo',
  otro:              'Otro',
}

const TIPO_COLORS = {
  cotizacion_pdf:    'bg-blue-100 text-blue-700',
  proforma_pdf:      'bg-indigo-100 text-indigo-700',
  foto_dano:         'bg-amber-100 text-amber-700',
  factura:           'bg-purple-100 text-purple-700',
  comprobante_pago:  'bg-green-100 text-green-700',
  avaluo:            'bg-teal-100 text-teal-700',
  otro:              'bg-gray-100 text-gray-700',
}

const MAX_BYTES = 10 * 1024 * 1024
const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

export default function Repositorio() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [docs, setDocs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda]   = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroOrigen, setFiltroOrigen] = useState('') // siniestro | servicio

  const [subiendo, setSubiendo] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('documentos')
      .select(`
        id, tipo, nombre_archivo, storage_path, tamanio_bytes, mime_type, created_at,
        siniestro_id, orden_servicio_id, cotizacion_id,
        siniestros(numero, placa),
        ordenes_servicio(numero, placa)
      `)
      .order('created_at', { ascending: false })
      .limit(500)
    setDocs(data ?? [])
    setLoading(false)
  }

  const filtrados = docs.filter(d => {
    if (filtroTipo && d.tipo !== filtroTipo) return false
    if (filtroOrigen === 'siniestro' && !d.siniestro_id) return false
    if (filtroOrigen === 'servicio' && !d.orden_servicio_id) return false
    if (busqueda) {
      const b = busqueda.toLowerCase()
      const numero = d.siniestros?.numero || d.ordenes_servicio?.numero || ''
      const placa = d.siniestros?.placa || d.ordenes_servicio?.placa || ''
      return d.nombre_archivo?.toLowerCase().includes(b) ||
             numero.toLowerCase().includes(b) ||
             placa.toLowerCase().includes(b)
    }
    return true
  })

  async function descargar(doc) {
    const { data, error } = await supabase.storage
      .from('documentos')
      .createSignedUrl(doc.storage_path, 60)
    if (error) {
      alert('Error al generar enlace: ' + error.message)
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  async function eliminar(doc) {
    if (!confirm(`¿Eliminar el documento "${doc.nombre_archivo}"?`)) return
    const { error: errStorage } = await supabase.storage.from('documentos').remove([doc.storage_path])
    if (errStorage) console.warn('Storage:', errStorage.message)
    const { error } = await supabase.from('documentos').delete().eq('id', doc.id)
    if (error) { alert(error.message); return }
    load()
  }

  function navegarOrigen(d) {
    if (d.siniestro_id) navigate(`/siniestros/${d.siniestro_id}`)
    else if (d.orden_servicio_id) navigate(`/servicios/${d.orden_servicio_id}`)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Repositorio de Documentos</h1>
          <p className="text-sm text-gray-500">
            {loading ? 'Cargando...' : `${filtrados.length} de ${docs.length} documentos`}
          </p>
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          <Upload size={16} />
          Subir documento
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por archivo, número o placa..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
          />
        </div>
        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-red-500 text-gray-600"
        >
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select
          value={filtroOrigen}
          onChange={e => setFiltroOrigen(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-red-500 text-gray-600"
        >
          <option value="">Daños y servicios</option>
          <option value="siniestro">Solo daños</option>
          <option value="servicio">Solo servicios</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Archivo</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Tipo</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Origen</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Fecha</th>
                <th className="text-right px-5 py-3 text-xs text-gray-500 font-medium">Tamaño</th>
                <th className="px-5 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-3.5 bg-gray-100 rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-gray-400">
                    No se encontraron documentos
                  </td>
                </tr>
              ) : (
                filtrados.map(d => {
                  const origen = d.siniestros || d.ordenes_servicio
                  const tipo = d.siniestro_id ? 'Daño' : 'Servicio'
                  return (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 max-w-xs">
                        <div className="flex items-center gap-2">
                          <FileTypeIcon mime={d.mime_type} />
                          <span className="font-medium text-gray-900 truncate" title={d.nombre_archivo}>
                            {d.nombre_archivo}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_COLORS[d.tipo]}`}>
                          {TIPO_LABELS[d.tipo] ?? d.tipo}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {origen ? (
                          <button
                            onClick={() => navegarOrigen(d)}
                            className="text-left"
                          >
                            <span className="font-semibold text-blue-600 hover:underline">{origen.numero}</span>
                            <span className="block text-xs text-gray-500">{tipo} · {origen.placa}</span>
                          </button>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-600 whitespace-nowrap text-xs">{formatDate(d.created_at)}</td>
                      <td className="px-5 py-3 text-gray-500 text-right whitespace-nowrap text-xs">{formatSize(d.tamanio_bytes)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => descargar(d)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="Ver / descargar"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            onClick={() => eliminar(d)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {uploadOpen && (
        <UploadModal
          user={user}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => { setUploadOpen(false); load() }}
        />
      )}
    </div>
  )
}

// ============================================================
// Upload Modal
// ============================================================

function UploadModal({ user, onClose, onUploaded }) {
  const inputRef = useRef(null)
  const [origen, setOrigen] = useState('siniestro')
  const [busqueda, setBusqueda] = useState('')
  const [opciones, setOpciones] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [seleccionado, setSeleccionado] = useState(null)
  const [tipo, setTipo] = useState('otro')
  const [archivo, setArchivo] = useState(null)
  const [drag, setDrag] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const [progreso, setProgreso] = useState(0)

  useEffect(() => {
    setSeleccionado(null)
    setOpciones([])
  }, [origen])

  useEffect(() => {
    if (!busqueda || busqueda.length < 2) { setOpciones([]); return }
    const timer = setTimeout(async () => {
      setBuscando(true)
      const tabla = origen === 'siniestro' ? 'siniestros' : 'ordenes_servicio'
      const { data } = await supabase
        .from(tabla)
        .select('id, numero, placa')
        .or(`numero.ilike.%${busqueda}%,placa.ilike.%${busqueda}%`)
        .order('created_at', { ascending: false })
        .limit(20)
      setOpciones(data ?? [])
      setBuscando(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [busqueda, origen])

  function onFileChosen(file) {
    setError('')
    if (!file) return
    if (file.size > MAX_BYTES) {
      setError(`El archivo excede 10MB (tiene ${formatSize(file.size)})`)
      return
    }
    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      setError(`Tipo no permitido: ${file.type || 'desconocido'}. Solo PDF, JPG, PNG, WebP.`)
      return
    }
    setArchivo(file)
  }

  function onDrop(e) {
    e.preventDefault()
    setDrag(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFileChosen(file)
  }

  async function subir() {
    if (!seleccionado) { setError('Debe seleccionar un daño u orden de servicio'); return }
    if (!archivo)      { setError('Debe seleccionar un archivo'); return }

    setSubiendo(true)
    setError('')
    setProgreso(10)
    try {
      const timestamp = Date.now()
      const safeName = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${seleccionado.numero}/${tipo}/${timestamp}_${safeName}`

      setProgreso(30)
      const { error: upErr } = await supabase.storage
        .from('documentos')
        .upload(path, archivo, { contentType: archivo.type, upsert: false })
      if (upErr) throw upErr

      setProgreso(75)
      const payload = {
        tipo,
        nombre_archivo: archivo.name,
        storage_path:   path,
        tamanio_bytes:  archivo.size,
        mime_type:      archivo.type,
        subido_por:     user?.id ?? null,
        [origen === 'siniestro' ? 'siniestro_id' : 'orden_servicio_id']: seleccionado.id,
      }
      const { error: dbErr } = await supabase.from('documentos').insert(payload)
      if (dbErr) {
        await supabase.storage.from('documentos').remove([path])
        throw dbErr
      }

      setProgreso(100)
      onUploaded()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl z-50 w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Subir documento</h2>
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

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Vincular a</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOrigen('siniestro')}
                className={`text-sm py-2 rounded-lg border ${
                  origen === 'siniestro' ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-gray-200 text-gray-600'
                }`}
              >
                Daño
              </button>
              <button
                type="button"
                onClick={() => setOrigen('servicio')}
                className={`text-sm py-2 rounded-lg border ${
                  origen === 'servicio' ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-gray-200 text-gray-600'
                }`}
              >
                Servicio
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              {origen === 'siniestro' ? 'Daño' : 'Orden de servicio'} *
            </label>
            {seleccionado ? (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg">
                <div>
                  <span className="font-semibold text-blue-700">{seleccionado.numero}</span>
                  <span className="text-gray-500 text-sm ml-2">{seleccionado.placa}</span>
                </div>
                <button
                  onClick={() => { setSeleccionado(null); setBusqueda('') }}
                  className="text-gray-400 hover:text-gray-700"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar por número o placa..."
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
                  />
                </div>
                {busqueda.length >= 2 && (
                  <div className="mt-2 border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                    {buscando ? (
                      <div className="p-3 text-sm text-gray-400">Buscando...</div>
                    ) : opciones.length === 0 ? (
                      <div className="p-3 text-sm text-gray-400">Sin resultados</div>
                    ) : (
                      opciones.map(o => (
                        <button
                          key={o.id}
                          onClick={() => { setSeleccionado(o); setBusqueda('') }}
                          className="w-full px-3 py-2 text-left hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0"
                        >
                          <span className="font-semibold text-blue-600">{o.numero}</span>
                          <span className="text-gray-500 ml-2">{o.placa}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Tipo de documento *</label>
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
            >
              {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Archivo *</label>
            <div
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                drag ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                onChange={e => onFileChosen(e.target.files?.[0])}
                className="hidden"
              />
              {archivo ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <CheckCircle2 size={18} className="text-green-600" />
                  <span className="font-medium text-gray-900">{archivo.name}</span>
                  <span className="text-gray-500">({formatSize(archivo.size)})</span>
                </div>
              ) : (
                <>
                  <Upload size={24} className="mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">Arrastra un archivo o haz click para seleccionar</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG o WebP · Máx. 10MB</p>
                </>
              )}
            </div>
          </div>

          {subiendo && (
            <div className="space-y-1">
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-600 transition-all"
                  style={{ width: `${progreso}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">Subiendo... {progreso}%</p>
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
            onClick={subir}
            disabled={subiendo || !archivo || !seleccionado}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            <Upload size={15} />
            {subiendo ? 'Subiendo...' : 'Subir'}
          </button>
        </div>
      </div>
    </>
  )
}

// ============================================================
// Helpers
// ============================================================

function formatSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-GT', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function FileTypeIcon({ mime }) {
  const cls = 'text-gray-400'
  if (mime?.startsWith('image/')) return <FileImage size={16} className={cls} />
  if (mime === 'application/pdf') return <FileText size={16} className="text-red-400" />
  if (mime?.includes('spreadsheet') || mime?.includes('excel')) return <FileSpreadsheet size={16} className="text-green-500" />
  return <FileIcon size={16} className={cls} />
}
