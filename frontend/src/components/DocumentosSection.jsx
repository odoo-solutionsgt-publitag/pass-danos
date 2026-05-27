import { useState, useEffect, useRef } from 'react'
import { Upload, Download, Trash2, FileText, FileImage, FileSpreadsheet, File as FileIcon, X, AlertCircle, CheckCircle2, FolderOpen } from 'lucide-react'
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

export const TIPOS_PERMITIDOS = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
]

const MAX_BYTES = 10 * 1024 * 1024

/**
 * Sección de documentos reutilizable para SiniestroDetalle y ServicioDetalle.
 * Props:
 *  - origen: 'siniestro' | 'servicio'
 *  - origenId: UUID del siniestro u orden de servicio
 *  - numero: número visible (SIN-... o SRV-...) — se usa en el path de storage
 *  - cotizacionId?: UUID — si los documentos pertenecen específicamente a una cotización
 *  - tiposSugeridos?: array de tipos pre-filtrados a mostrar en el select del modal
 */
export default function DocumentosSection({ origen, origenId, numero, cotizacionId, tiposSugeridos, titulo = 'Documentos' }) {
  const { user } = useAuth()
  const [docs, setDocs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)

  useEffect(() => { load() }, [origen, origenId, cotizacionId])

  async function load() {
    if (!origenId) return
    setLoading(true)
    const col = origen === 'siniestro' ? 'siniestro_id' : 'orden_servicio_id'
    let q = supabase
      .from('documentos')
      .select('id, tipo, nombre_archivo, storage_path, tamanio_bytes, mime_type, created_at, cotizacion_id')
      .eq(col, origenId)
      .order('created_at', { ascending: false })
    if (cotizacionId) q = q.eq('cotizacion_id', cotizacionId)
    const { data } = await q
    setDocs(data ?? [])
    setLoading(false)
  }

  async function descargar(doc) {
    const { data, error } = await supabase.storage
      .from('documentos')
      .createSignedUrl(doc.storage_path, 60)
    if (error) { alert('Error: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  async function eliminar(doc) {
    if (!confirm(`¿Eliminar "${doc.nombre_archivo}"?`)) return
    await supabase.storage.from('documentos').remove([doc.storage_path]).catch(() => null)
    const { error } = await supabase.from('documentos').delete().eq('id', doc.id)
    if (error) { alert(error.message); return }
    load()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FolderOpen size={16} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-800">{titulo}</h3>
          {docs.length > 0 && <span className="text-xs text-gray-400">({docs.length})</span>}
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-lg"
        >
          <Upload size={13} />
          Subir documento
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-gray-200 rounded-lg">
          <FolderOpen size={24} className="mx-auto text-gray-300 mb-1" strokeWidth={1.5} />
          <p className="text-xs text-gray-400">Sin documentos adjuntos</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-50 border border-gray-100 rounded-lg overflow-hidden">
          {docs.map(d => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
              <FileTypeIcon mime={d.mime_type} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate" title={d.nombre_archivo}>
                  {d.nombre_archivo}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`inline-flex px-1.5 py-0 rounded-full text-[10px] font-medium ${TIPO_COLORS[d.tipo]}`}>
                    {TIPO_LABELS[d.tipo] ?? d.tipo}
                  </span>
                  <span className="text-xs text-gray-400">{formatSize(d.tamanio_bytes)} · {formatDate(d.created_at)}</span>
                </div>
              </div>
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
            </li>
          ))}
        </ul>
      )}

      {uploadOpen && (
        <UploadInlineModal
          user={user}
          origen={origen}
          origenId={origenId}
          numero={numero}
          cotizacionId={cotizacionId}
          tiposSugeridos={tiposSugeridos}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => { setUploadOpen(false); load() }}
        />
      )}
    </div>
  )
}

// ============================================================
// Upload Modal (contextual, sin selector de origen)
// ============================================================

function UploadInlineModal({ user, origen, origenId, numero, cotizacionId, tiposSugeridos, onClose, onUploaded }) {
  const inputRef = useRef(null)
  const tiposDisponibles = tiposSugeridos?.length ? tiposSugeridos : Object.keys(TIPO_LABELS)
  const [tipo, setTipo]     = useState(tiposDisponibles[0] ?? 'otro')
  const [archivo, setArchivo] = useState(null)
  const [drag, setDrag]     = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError]   = useState('')
  const [progreso, setProgreso] = useState(0)

  function onFileChosen(file) {
    setError('')
    if (!file) return
    if (file.size > MAX_BYTES) {
      setError(`El archivo excede 10MB (tiene ${formatSize(file.size)})`)
      return
    }
    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      setError(`Tipo no permitido: ${file.type || 'desconocido'}. Use PDF, imagen, Excel o Word.`)
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
    if (!archivo) { setError('Debe seleccionar un archivo'); return }
    setSubiendo(true)
    setError('')
    setProgreso(10)
    try {
      const timestamp = Date.now()
      const safeName = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const safeNumero = (numero || origenId).replace(/[^a-zA-Z0-9-]/g, '_')
      const path = `${safeNumero}/${tipo}/${timestamp}_${safeName}`

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
        [origen === 'siniestro' ? 'siniestro_id' : 'orden_servicio_id']: origenId,
      }
      if (cotizacionId) payload.cotizacion_id = cotizacionId

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
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl z-50 w-full max-w-md">
        <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900">Subir documento</h2>
            <p className="text-xs text-gray-500 mt-0.5">Adjunto a {numero}</p>
          </div>
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
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Tipo de documento</label>
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
            >
              {tiposDisponibles.map(k => <option key={k} value={k}>{TIPO_LABELS[k]}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Archivo</label>
            <div
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
                drag ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.doc,.docx,.csv"
                onChange={e => onFileChosen(e.target.files?.[0])}
                className="hidden"
              />
              {archivo ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <CheckCircle2 size={16} className="text-green-600" />
                  <span className="font-medium text-gray-900 truncate max-w-[200px]">{archivo.name}</span>
                  <span className="text-gray-500 text-xs">{formatSize(archivo.size)}</span>
                </div>
              ) : (
                <>
                  <Upload size={20} className="mx-auto text-gray-400 mb-1.5" />
                  <p className="text-xs text-gray-600">Arrastra o click para seleccionar</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">PDF, JPG, PNG, Excel, Word · Máx 10MB</p>
                </>
              )}
            </div>
          </div>

          {subiendo && (
            <div className="space-y-1">
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-red-600 transition-all" style={{ width: `${progreso}%` }} />
              </div>
              <p className="text-xs text-gray-500">Subiendo... {progreso}%</p>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">
            Cancelar
          </button>
          <button
            onClick={subir}
            disabled={subiendo || !archivo}
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
// Helpers (exportados para reuso en Repositorio)
// ============================================================

export function FileTypeIcon({ mime }) {
  const cls = 'text-gray-400 shrink-0'
  if (mime?.startsWith('image/')) return <FileImage size={16} className={cls} />
  if (mime === 'application/pdf') return <FileText size={16} className="text-red-400 shrink-0" />
  if (mime?.includes('spreadsheet') || mime?.includes('excel') || mime === 'text/csv') return <FileSpreadsheet size={16} className="text-green-500 shrink-0" />
  if (mime?.includes('word') || mime?.includes('document')) return <FileText size={16} className="text-blue-500 shrink-0" />
  return <FileIcon size={16} className={cls} />
}

export function formatSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })
}

export { TIPO_LABELS, TIPO_COLORS }
