import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Download, FolderOpen } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { FileTypeIcon, formatSize, TIPO_LABELS, TIPO_COLORS } from '../components/DocumentosSection'

export default function Repositorio() {
  const navigate = useNavigate()

  const [docs, setDocs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda]   = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroOrigen, setFiltroOrigen] = useState('')
  const [filtroProveedor, setFiltroProveedor] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('documentos')
      .select(`
        id, tipo, nombre_archivo, storage_path, tamanio_bytes, mime_type, created_at,
        siniestro_id, orden_servicio_id, cotizacion_id,
        siniestros(numero, placa, talleres(nombre)),
        ordenes_servicio(numero, placa, talleres(nombre)),
        cotizaciones(talleres(nombre))
      `)
      .order('created_at', { ascending: false })
      .limit(500)
    setDocs(data ?? [])
    setLoading(false)
  }

  function tallerDe(d) {
    return d.cotizaciones?.talleres?.nombre
        || d.siniestros?.talleres?.nombre
        || d.ordenes_servicio?.talleres?.nombre
        || null
  }

  const proveedores = Array.from(new Set(docs.map(tallerDe).filter(Boolean))).sort()

  const filtrados = docs.filter(d => {
    if (filtroTipo && d.tipo !== filtroTipo) return false
    if (filtroOrigen === 'siniestro' && !d.siniestro_id) return false
    if (filtroOrigen === 'servicio' && !d.orden_servicio_id) return false
    if (filtroProveedor && tallerDe(d) !== filtroProveedor) return false
    if (busqueda) {
      const b = busqueda.toLowerCase()
      const numero = d.siniestros?.numero || d.ordenes_servicio?.numero || ''
      const placa  = d.siniestros?.placa  || d.ordenes_servicio?.placa  || ''
      const taller = tallerDe(d) || ''
      return d.nombre_archivo?.toLowerCase().includes(b) ||
             numero.toLowerCase().includes(b) ||
             placa.toLowerCase().includes(b) ||
             taller.toLowerCase().includes(b)
    }
    return true
  })

  async function descargar(doc) {
    const { data, error } = await supabase.storage
      .from('documentos')
      .createSignedUrl(doc.storage_path, 60)
    if (error) { alert('Error al generar enlace: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  function navegarOrigen(d) {
    if (d.siniestro_id) navigate(`/siniestros/${d.siniestro_id}`)
    else if (d.orden_servicio_id) navigate(`/servicios/${d.orden_servicio_id}`)
  }

  function exportCsv() {
    const rows = [
      ['Archivo', 'Tipo', 'Origen', 'Número', 'Placa', 'Proveedor', 'Fecha', 'Tamaño bytes'],
      ...filtrados.map(d => {
        const origen = d.siniestro_id ? 'Daño' : 'Servicio'
        const num = d.siniestros?.numero || d.ordenes_servicio?.numero || ''
        const placa = d.siniestros?.placa || d.ordenes_servicio?.placa || ''
        return [
          d.nombre_archivo, TIPO_LABELS[d.tipo] ?? d.tipo, origen, num, placa,
          tallerDe(d) ?? '', d.created_at, d.tamanio_bytes,
        ]
      }),
    ]
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `documentos_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Repositorio de Documentos</h1>
          <p className="text-sm text-gray-500">
            {loading ? 'Cargando...' : `${filtrados.length} de ${docs.length} documentos`}
            <span className="text-gray-400"> · subida desde detalle de daño o servicio</span>
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={loading || filtrados.length === 0}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <Download size={15} />
          Exportar CSV
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por archivo, número, placa o proveedor..."
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
        <select
          value={filtroProveedor}
          onChange={e => setFiltroProveedor(e.target.value)}
          className="md:col-span-2 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-red-500 text-gray-600"
        >
          <option value="">Todos los proveedores</option>
          {proveedores.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {(busqueda || filtroTipo || filtroOrigen || filtroProveedor) && (
          <button
            onClick={() => { setBusqueda(''); setFiltroTipo(''); setFiltroOrigen(''); setFiltroProveedor('') }}
            className="md:col-span-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Archivo</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Tipo</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Origen</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Proveedor</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Fecha</th>
                <th className="text-right px-5 py-3 text-xs text-gray-500 font-medium">Tamaño</th>
                <th className="px-5 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-3.5 bg-gray-100 rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-gray-400">
                    <FolderOpen size={36} className="mx-auto mb-2 text-gray-300" strokeWidth={1.5} />
                    <p>No se encontraron documentos</p>
                    <p className="text-xs mt-1">Los documentos se suben desde el detalle de cada daño o servicio</p>
                  </td>
                </tr>
              ) : (
                filtrados.map(d => {
                  const origen  = d.siniestros || d.ordenes_servicio
                  const tipoOrigen = d.siniestro_id ? 'Daño' : 'Servicio'
                  const taller  = tallerDe(d)
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
                          <button onClick={() => navegarOrigen(d)} className="text-left">
                            <span className="font-semibold text-blue-600 hover:underline">{origen.numero}</span>
                            <span className="block text-xs text-gray-500">{tipoOrigen} · {origen.placa}</span>
                          </button>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-600 text-xs">{taller || '—'}</td>
                      <td className="px-5 py-3 text-gray-600 whitespace-nowrap text-xs">{formatDate(d.created_at)}</td>
                      <td className="px-5 py-3 text-gray-500 text-right whitespace-nowrap text-xs">{formatSize(d.tamanio_bytes)}</td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => descargar(d)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded ml-auto block"
                          title="Ver / descargar"
                        >
                          <Download size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-GT', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
