import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Printer } from 'lucide-react'
import { usePermisos } from '../hooks/usePermisos'
import { ordenesServicioQuery } from '../lib/queries'

const ESTADO_COLORS = {
  programado: 'bg-gray-100 text-gray-700',
  aprobado: 'bg-blue-100 text-blue-700',
  en_proceso: 'bg-amber-100 text-amber-700',
  completado: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-700',
}

const TIPO_LABELS = {
  servicio_menor:      'Serv. menor',
  servicio_mayor:      'Serv. mayor',
  cambio_llantas:      'Llantas',
  cambio_bateria:      'Batería',
  alineacion_balanceo: 'Alineación',
  cambio_frenos:       'Frenos',
  otro:                'Otro',
}

const TIPO_COLORS = {
  servicio_menor:      'bg-green-100 text-green-700',
  servicio_mayor:      'bg-amber-100 text-amber-700',
  cambio_llantas:      'bg-blue-100 text-blue-700',
  cambio_bateria:      'bg-blue-100 text-blue-700',
  alineacion_balanceo: 'bg-gray-100 text-gray-700',
  cambio_frenos:       'bg-amber-100 text-amber-700',
  otro:                'bg-gray-100 text-gray-700',
}

const ESTADO_LABELS = {
  programado: 'Programado',
  aprobado:   'Aprobado',
  en_proceso: 'En proceso',
  completado: 'Completado',
  cancelado:  'Cancelado',
}

export default function Servicios() {
  const navigate = useNavigate()
  const { puedeCrear } = usePermisos()
  const [ordenes, setOrdenes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  useEffect(() => { loadOrdenes() }, [filtroEstado])

  async function loadOrdenes() {
    setLoading(true)
    let q = ordenesServicioQuery('id,numero,fecha_programada,placa,tipo_servicio,taller_id,talleres(nombre),total_general,estado')
      .order('created_at', { ascending: false })
      .limit(200)

    if (filtroEstado) q = q.eq('estado', filtroEstado)
    const { data } = await q
    setOrdenes(data ?? [])
    setLoading(false)
  }

  const filtrados = ordenes.filter(o => {
    if (!busqueda) return true
    const b = busqueda.toLowerCase()
    return o.numero?.toLowerCase().includes(b) || o.placa?.toLowerCase().includes(b)
  })

  function formatDate(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function formatMonto(v) {
    if (!v) return '—'
    return `Q ${Number(v).toLocaleString('es-GT', { minimumFractionDigits: 2 })}`
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Servicios de Mantenimiento</h1>
          <p className="text-sm text-gray-500">{filtrados.length} órdenes</p>
        </div>
        {puedeCrear && (
          <button
            onClick={() => navigate('/servicios/nuevo')}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nueva orden
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por placa o número..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
          />
        </div>
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-red-500 text-gray-600"
        >
          <option value="">Todos los estados</option>
          <option value="programado">Programado</option>
          <option value="aprobado">Aprobado</option>
          <option value="en_proceso">En proceso</option>
          <option value="completado">Completado</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">No. Orden</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Fecha programada</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Vehículo</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Tipo servicio</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Taller</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Total Q.</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Estado</th>
                <th className="px-5 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-3.5 bg-gray-100 rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-gray-400">
                    No se encontraron órdenes de servicio
                  </td>
                </tr>
              ) : (
                filtrados.map(o => (
                  <tr
                    key={o.id}
                    onClick={() => navigate(`/servicios/${o.id}`)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-5 py-3.5 font-semibold text-blue-600 whitespace-nowrap">{o.numero}</td>
                    <td className="px-5 py-3.5 text-gray-600 whitespace-nowrap">{formatDate(o.fecha_programada)}</td>
                    <td className="px-5 py-3.5 font-medium text-gray-900">{o.placa}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_COLORS[o.tipo_servicio]}`}>
                        {TIPO_LABELS[o.tipo_servicio] ?? o.tipo_servicio}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{o.talleres?.nombre || '—'}</td>
                    <td className="px-5 py-3.5 text-gray-700 whitespace-nowrap">{formatMonto(o.total_general)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[o.estado]}`}>
                        {ESTADO_LABELS[o.estado] ?? o.estado}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); window.open(`/servicios/${o.id}/imprimir`, '_blank') }}
                        className="p-1.5 text-gray-400 hover:text-slate-700 hover:bg-slate-100 rounded"
                        title="Imprimir ficha"
                      >
                        <Printer size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
