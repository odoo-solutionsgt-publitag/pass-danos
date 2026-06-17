import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, FileText, Wrench, Car, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { siniestrosQuery } from '../lib/queries'
import ReporteDiario from '../components/ReporteDiario'
import { formatDate as fmtDateLib, formatDateTime as fmtDateTimeLib } from '../lib/fecha'

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

function KpiCard({ title, value, icon: Icon, color, loading }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900">
        {loading ? <span className="text-gray-300 animate-pulse">--</span> : value}
      </p>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [kpis, setKpis] = useState({ activos: 0, proformasPendientes: 0, enReparacion: 0, serviciosEnCurso: 0 })
  const [siniestros, setSiniestros] = useState([])
  const [actividad, setActividad] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    try {
      const [
        { count: activos },
        { count: proformasPendientes },
        { data: tallerData },
        { count: serviciosEnCurso },
        { data: ultimosSiniestros },
        { data: timeline },
      ] = await Promise.all([
        supabase.from('siniestros').select('*', { count: 'exact', head: true })
          .not('estado', 'in', '("cerrado","anulado")'),
        supabase.from('siniestros').select('*', { count: 'exact', head: true })
          .in('estado', ['proforma_emitida']),
        supabase.from('taller_ingresos')
          .select('id,siniestro_id,orden_servicio_id,siniestros(estado),ordenes_servicio(estado)')
          .is('fecha_egreso', null),
        supabase.from('ordenes_servicio').select('*', { count: 'exact', head: true })
          .eq('estado', 'en_proceso'),
        siniestrosQuery('id,numero,placa,cliente_nombre,tipo_dano,severidad,estado,created_at')
          .order('created_at', { ascending: false }).limit(5),
        supabase.from('siniestro_timeline').select('id,accion,detalle,created_at,siniestros(numero,placa)')
          .order('created_at', { ascending: false }).limit(10),
      ])

      // Excluir taller_ingresos de daños anulados/cerrados y servicios completados/cancelados
      const enReparacion = (tallerData ?? []).filter(t => {
        if (t.siniestro_id) return t.siniestros && !['cerrado', 'anulado'].includes(t.siniestros.estado)
        if (t.orden_servicio_id) return t.ordenes_servicio && !['completado', 'cancelado'].includes(t.ordenes_servicio.estado)
        return false
      }).length

      setKpis({ activos: activos ?? 0, proformasPendientes: proformasPendientes ?? 0, enReparacion, serviciosEnCurso: serviciosEnCurso ?? 0 })
      setSiniestros(ultimosSiniestros ?? [])
      setActividad(timeline ?? [])
    } catch (err) {
      console.error('Dashboard error:', err)
    } finally {
      setLoading(false)
    }
  }

  function formatDate(iso) {
    return fmtDateLib(iso) ?? '—'
  }
  function formatDateTime(iso) {
    return fmtDateTimeLib(iso) ?? '—'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Resumen general del sistema</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard title="Daños activos" value={kpis.activos} icon={AlertTriangle} color="bg-red-500" loading={loading} />
        <KpiCard title="Proformas pendientes" value={kpis.proformasPendientes} icon={FileText} color="bg-amber-500" loading={loading} />
        <KpiCard title="Vehículos en reparación" value={kpis.enReparacion} icon={Car} color="bg-orange-500" loading={loading} />
        <KpiCard title="Servicios en curso" value={kpis.serviciosEnCurso} icon={Wrench} color="bg-blue-500" loading={loading} />
      </div>

      <ReporteDiario />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">Últimos daños</h2>
            <button onClick={() => navigate('/siniestros')} className="text-red-600 text-xs font-medium hover:underline">
              Ver todos
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">No.</th>
                  <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Vehículo</th>
                  <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Cliente</th>
                  <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Estado</th>
                  <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-5 py-3">
                          <div className="h-3.5 bg-gray-100 rounded animate-pulse w-20" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : siniestros.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-gray-400 text-sm">
                      No hay daños registrados aún
                    </td>
                  </tr>
                ) : (
                  siniestros.map(s => (
                    <tr
                      key={s.id}
                      onClick={() => navigate(`/siniestros/${s.id}`)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-5 py-3 font-medium text-red-600">{s.numero}</td>
                      <td className="px-5 py-3 text-gray-700">{s.placa}</td>
                      <td className="px-5 py-3 text-gray-700 max-w-[150px] truncate">{s.cliente_nombre}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[s.estado]}`}>
                          {ESTADO_LABELS[s.estado]}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{formatDate(s.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Actividad reciente</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-5 py-3 flex gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-full animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
                  </div>
                </div>
              ))
            ) : actividad.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">Sin actividad reciente</div>
            ) : (
              actividad.map(item => (
                <div key={item.id} className="px-5 py-3 flex gap-3">
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                    <Clock size={14} className="text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-900 font-medium">
                      {item.siniestros?.numero} — {item.accion}
                    </p>
                    {item.detalle && <p className="text-xs text-gray-500">{item.detalle}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(item.created_at)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
