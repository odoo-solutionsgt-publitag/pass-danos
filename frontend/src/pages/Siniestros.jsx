import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Printer } from 'lucide-react'
import { usePermisos } from '../hooks/usePermisos'
import { siniestrosQuery } from '../lib/queries'
import { formatDate as fmtDate } from '../lib/fecha'

const ESTADO_COLORS = {
  registrado: 'bg-gray-100 text-gray-700',
  cotizando: 'bg-amber-100 text-amber-700',
  proforma_emitida: 'bg-amber-100 text-amber-700',
  proforma_aprobada: 'bg-blue-100 text-blue-700',
  en_reparacion: 'bg-red-100 text-red-700',
  reparado: 'bg-teal-100 text-teal-700',
  en_cobro: 'bg-purple-100 text-purple-700',
  cerrado: 'bg-green-100 text-green-700',
  anulado: 'bg-gray-100 text-gray-500',
}

const SEVERIDAD_COLORS = {
  leve: 'bg-green-100 text-green-700',
  medio: 'bg-amber-100 text-amber-700',
  severo: 'bg-red-100 text-red-700',
  perdida_total: 'bg-red-900 text-red-100',
}

const ESTADO_LABELS = {
  registrado: 'Registrado',
  cotizando: 'Cotizando',
  proforma_emitida: 'Proforma emitida',
  proforma_aprobada: 'Proforma aprobada',
  en_reparacion: 'En reparación',
  reparado: 'Reparado',
  en_cobro: 'En cobro',
  cerrado: 'Cerrado',
  anulado: 'Anulado',
}

const ESTADO_OPTIONS = [
  'registrado', 'cotizando', 'proforma_emitida', 'proforma_aprobada',
  'en_reparacion', 'reparado', 'en_cobro', 'cerrado',
]

export default function Siniestros() {
  const navigate = useNavigate()
  const { puedeCrear } = usePermisos()
  const [siniestros, setSiniestros] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroSeveridad, setFiltroSeveridad] = useState('')

  useEffect(() => { loadSiniestros() }, [filtroEstado, filtroSeveridad])

  async function loadSiniestros() {
    setLoading(true)
    let q = siniestrosQuery('id,numero,fecha_dano,placa,cliente_nombre,tipo_dano,severidad,monto_cliente,estado,created_at')
      .order('created_at', { ascending: false })
      .limit(200)

    if (filtroEstado) q = q.eq('estado', filtroEstado)
    if (filtroSeveridad) q = q.eq('severidad', filtroSeveridad)

    const { data } = await q
    setSiniestros(data ?? [])
    setLoading(false)
  }

  const filtrados = siniestros.filter(s => {
    if (!busqueda) return true
    const b = busqueda.toLowerCase()
    return (
      s.numero?.toLowerCase().includes(b) ||
      s.placa?.toLowerCase().includes(b) ||
      s.cliente_nombre?.toLowerCase().includes(b)
    )
  })

  function formatDate(iso) {
    return fmtDate(iso) ?? '—'
  }

  function formatMonto(v) {
    if (!v) return '—'
    return `Q ${Number(v).toLocaleString('es-GT', { minimumFractionDigits: 2 })}`
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Daños</h1>
          <p className="text-sm text-gray-500">{filtrados.length} registros</p>
        </div>
        {puedeCrear && (
          <button
            onClick={() => navigate('/siniestros/nuevo')}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} />
            Registrar daño
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por placa, cliente, número..."
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
          {ESTADO_OPTIONS.map(e => (
            <option key={e} value={e}>{ESTADO_LABELS[e]}</option>
          ))}
        </select>
        <select
          value={filtroSeveridad}
          onChange={e => setFiltroSeveridad(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-red-500 text-gray-600"
        >
          <option value="">Toda severidad</option>
          <option value="leve">Leve</option>
          <option value="medio">Medio</option>
          <option value="severo">Severo</option>
          <option value="perdida_total">Pérdida total</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">No. Daño</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Fecha</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Vehículo</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Cliente</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Tipo daño</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Severidad</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Total Q.</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Estado</th>
                <th className="px-5 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-3.5 bg-gray-100 rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-gray-400">
                    No se encontraron daños registrados
                  </td>
                </tr>
              ) : (
                filtrados.map(s => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/siniestros/${s.id}`)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-5 py-3.5 font-semibold text-red-600 whitespace-nowrap">{s.numero}</td>
                    <td className="px-5 py-3.5 text-gray-600 whitespace-nowrap">{formatDate(s.fecha_dano)}</td>
                    <td className="px-5 py-3.5 text-gray-900 font-medium">{s.placa}</td>
                    <td className="px-5 py-3.5 text-gray-700 max-w-[180px] truncate">{s.cliente_nombre}</td>
                    <td className="px-5 py-3.5 text-gray-600 capitalize">{s.tipo_dano?.replace(/_/g, ' ')}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${SEVERIDAD_COLORS[s.severidad]}`}>
                        {s.severidad?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-700 whitespace-nowrap">{formatMonto(s.monto_cliente)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[s.estado]}`}>
                        {ESTADO_LABELS[s.estado] ?? s.estado}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); window.open(`/siniestros/${s.id}/imprimir`, '_blank') }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
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
