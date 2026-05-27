import { useState, useEffect, useMemo } from 'react'
import { Calendar, TrendingUp, DollarSign, AlertTriangle, Wrench, Download, BarChart3, Car } from 'lucide-react'
import { supabase } from '../lib/supabase'

const SEVERIDAD_LABELS = {
  leve:          'Leve',
  medio:         'Medio',
  severo:        'Severo',
  perdida_total: 'Pérdida total',
}
const SEVERIDAD_COLORS = {
  leve:          'bg-green-500',
  medio:         'bg-amber-500',
  severo:        'bg-red-500',
  perdida_total: 'bg-red-900',
}

const TIPO_DANO_LABELS = {
  choque_frontal:  'Choque frontal',
  choque_trasero:  'Choque trasero',
  choque_lateral:  'Choque lateral',
  rayon:           'Rayón',
  abollon:         'Abollón',
  vidrio:          'Vidrio',
  llanta:          'Llanta',
  mecanico:        'Mecánico',
  multiple:        'Múltiple',
  otro:            'Otro',
}

const TIPO_SERVICIO_LABELS = {
  servicio_menor:      'Servicio menor',
  servicio_mayor:      'Servicio mayor',
  cambio_llantas:      'Cambio de llantas',
  cambio_bateria:      'Cambio de batería',
  alineacion_balanceo: 'Alineación / balanceo',
  cambio_frenos:       'Cambio de frenos',
  otro:                'Otro',
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function defaultFechaDesde() {
  const d = new Date()
  d.setMonth(d.getMonth() - 11)
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}
function hoy() { return new Date().toISOString().slice(0, 10) }

export default function Reportes() {
  const [vista, setVista]         = useState('danos')
  const [fechaDesde, setDesde]    = useState(defaultFechaDesde())
  const [fechaHasta, setHasta]    = useState(hoy())
  const [siniestros, setSinies]   = useState([])
  const [servicios, setServicios] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => { load() }, [fechaDesde, fechaHasta])

  async function load() {
    setLoading(true)
    const [sinRes, srvRes] = await Promise.all([
      supabase.from('siniestros')
        .select('id,numero,fecha_dano,placa,tipo_vehiculo,marca,linea,tipo_dano,severidad,estado,monto_cliente,costo_pass,margen')
        .gte('fecha_dano', fechaDesde)
        .lte('fecha_dano', fechaHasta)
        .neq('estado', 'anulado'),
      supabase.from('ordenes_servicio')
        .select('id,numero,fecha_programada,placa,tipo_vehiculo,marca,tipo_servicio,estado,total_general')
        .gte('fecha_programada', fechaDesde)
        .lte('fecha_programada', fechaHasta)
        .neq('estado', 'cancelado'),
    ])
    setSinies(sinRes.data ?? [])
    setServicios(srvRes.data ?? [])
    setLoading(false)
  }

  const data = vista === 'danos' ? siniestros : servicios
  const stats = useMemo(() => computeStats(data, vista), [data, vista])

  function exportCsv() {
    const rows = vista === 'danos'
      ? [
          ['Numero', 'Fecha', 'Placa', 'Tipo vehículo', 'Tipo daño', 'Severidad', 'Estado', 'Costo Pass', 'Cliente paga', 'Margen'],
          ...siniestros.map(s => [
            s.numero, s.fecha_dano, s.placa, s.tipo_vehiculo, s.tipo_dano, s.severidad, s.estado,
            s.costo_pass ?? 0, s.monto_cliente ?? 0, s.margen ?? 0,
          ]),
        ]
      : [
          ['Numero', 'Fecha', 'Placa', 'Tipo vehículo', 'Tipo servicio', 'Estado', 'Total Q'],
          ...servicios.map(s => [
            s.numero, s.fecha_programada, s.placa, s.tipo_vehiculo, s.tipo_servicio, s.estado, s.total_general ?? 0,
          ]),
        ]
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte_${vista}_${fechaDesde}_${fechaHasta}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reportes y KPIs</h1>
          <p className="text-sm text-gray-500">
            {loading ? 'Cargando datos...' : `${data.length} registros en el período`}
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={loading || data.length === 0}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <Download size={15} />
          Exportar CSV
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-end gap-4">
        <div className="inline-flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setVista('danos')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              vista === 'danos' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-600'
            }`}
          >
            <AlertTriangle size={14} className="inline -mt-0.5 mr-1.5" />
            Daños
          </button>
          <button
            onClick={() => setVista('servicios')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              vista === 'servicios' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-600'
            }`}
          >
            <Wrench size={14} className="inline -mt-0.5 mr-1.5" />
            Servicios
          </button>
        </div>

        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={e => setDesde(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={e => setHasta(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
            />
          </div>
          <div className="flex gap-1">
            <RangeButton onClick={() => { setDesde(defaultFechaDesde()); setHasta(hoy()) }}>12m</RangeButton>
            <RangeButton onClick={() => { const d = new Date(); d.setDate(d.getDate() - 90); setDesde(d.toISOString().slice(0,10)); setHasta(hoy()) }}>90d</RangeButton>
            <RangeButton onClick={() => { const d = new Date(); d.setDate(d.getDate() - 30); setDesde(d.toISOString().slice(0,10)); setHasta(hoy()) }}>30d</RangeButton>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {vista === 'danos' ? (
          <>
            <Kpi title="Total de daños" value={stats.total} icon={AlertTriangle} color="bg-red-500" loading={loading} />
            <Kpi title="Costo Pass total" value={formatMonto(stats.costoTotal)} icon={DollarSign} color="bg-gray-700" loading={loading} />
            <Kpi title="Promedio por daño" value={formatMonto(stats.promedio)} icon={TrendingUp} color="bg-blue-500" loading={loading} />
            <Kpi title="Margen acumulado" value={formatMonto(stats.margenTotal)} icon={BarChart3} color={stats.margenTotal >= 0 ? 'bg-green-600' : 'bg-red-700'} loading={loading} />
          </>
        ) : (
          <>
            <Kpi title="Total de servicios" value={stats.total} icon={Wrench} color="bg-blue-500" loading={loading} />
            <Kpi title="Gasto total" value={formatMonto(stats.costoTotal)} icon={DollarSign} color="bg-gray-700" loading={loading} />
            <Kpi title="Promedio por servicio" value={formatMonto(stats.promedio)} icon={TrendingUp} color="bg-blue-500" loading={loading} />
            <Kpi title="En proceso" value={stats.enProceso} icon={Car} color="bg-amber-500" loading={loading} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Bar chart por mes */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 text-sm mb-4">
            {vista === 'danos' ? 'Daños' : 'Servicios'} por mes
          </h2>
          {loading ? (
            <div className="h-48 bg-gray-50 rounded animate-pulse" />
          ) : stats.porMes.every(m => m.count === 0) ? (
            <p className="text-sm text-gray-400 text-center py-12">Sin datos en el período</p>
          ) : (
            <div className="space-y-1">
              {stats.porMes.map(m => {
                const max = Math.max(...stats.porMes.map(x => x.count), 1)
                const pct = (m.count / max) * 100
                return (
                  <div key={m.label} className="flex items-center gap-2 text-xs">
                    <div className="w-16 text-gray-500 text-right">{m.label}</div>
                    <div className="flex-1 bg-gray-50 rounded-full h-5 relative overflow-hidden">
                      <div
                        className={`h-full ${vista === 'danos' ? 'bg-red-500' : 'bg-blue-500'} rounded-full transition-all`}
                        style={{ width: `${pct}%`, minWidth: m.count > 0 ? '8px' : 0 }}
                      />
                      <span className="absolute inset-0 flex items-center justify-end pr-2 text-gray-700 font-medium">
                        {m.count > 0 && m.count}
                      </span>
                    </div>
                    <div className="w-20 text-gray-500 text-right text-[11px]">{formatMonto(m.monto)}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Distribución por tipo / severidad */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 text-sm mb-4">
            {vista === 'danos' ? 'Distribución por severidad' : 'Distribución por tipo'}
          </h2>
          {loading ? (
            <div className="h-48 bg-gray-50 rounded animate-pulse" />
          ) : stats.distribucion.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">Sin datos en el período</p>
          ) : (
            <div className="space-y-3">
              {stats.distribucion.map(d => {
                const pct = stats.total > 0 ? (d.count / stats.total) * 100 : 0
                return (
                  <div key={d.key}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-700 font-medium">{d.label}</span>
                      <span className="text-gray-500">{d.count} · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="bg-gray-50 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${d.color || (vista === 'danos' ? 'bg-red-500' : 'bg-blue-500')}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Top 5 vehículos */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Top 5 vehículos con más {vista === 'danos' ? 'daños' : 'servicios'}</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-5 py-2.5 text-xs text-gray-500 font-medium">Placa</th>
                <th className="text-left px-5 py-2.5 text-xs text-gray-500 font-medium">Vehículo</th>
                <th className="text-right px-5 py-2.5 text-xs text-gray-500 font-medium">Cantidad</th>
                <th className="text-right px-5 py-2.5 text-xs text-gray-500 font-medium">Total Q</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <td key={j} className="px-5 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-16" /></td>
                    ))}
                  </tr>
                ))
              ) : stats.topVehiculos.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400 text-xs">Sin datos</td></tr>
              ) : (
                stats.topVehiculos.map(v => (
                  <tr key={v.placa} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{v.placa}</td>
                    <td className="px-5 py-3 text-gray-600 text-xs">{v.label}</td>
                    <td className="px-5 py-3 text-right text-gray-700 font-semibold">{v.count}</td>
                    <td className="px-5 py-3 text-right text-gray-700 whitespace-nowrap">{formatMonto(v.monto)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Resumen por tipo de vehículo */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Resumen por tipo de vehículo</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-5 py-2.5 text-xs text-gray-500 font-medium">Tipo</th>
                <th className="text-right px-5 py-2.5 text-xs text-gray-500 font-medium">Cantidad</th>
                <th className="text-right px-5 py-2.5 text-xs text-gray-500 font-medium">Total Q</th>
                <th className="text-right px-5 py-2.5 text-xs text-gray-500 font-medium">Promedio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <td key={j} className="px-5 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-16" /></td>
                    ))}
                  </tr>
                ))
              ) : stats.porTipoVehiculo.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400 text-xs">Sin datos</td></tr>
              ) : (
                stats.porTipoVehiculo.map(t => (
                  <tr key={t.tipo} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-700">{t.tipo}</td>
                    <td className="px-5 py-3 text-right text-gray-700 font-semibold">{t.count}</td>
                    <td className="px-5 py-3 text-right text-gray-700 whitespace-nowrap">{formatMonto(t.monto)}</td>
                    <td className="px-5 py-3 text-right text-gray-500 whitespace-nowrap">{formatMonto(t.count > 0 ? t.monto / t.count : 0)}</td>
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

// ============================================================
// Cálculos
// ============================================================

function computeStats(data, vista) {
  const total = data.length
  const montoOf = (r) => vista === 'danos' ? Number(r.costo_pass ?? 0) : Number(r.total_general ?? 0)
  const fechaOf = (r) => vista === 'danos' ? r.fecha_dano : r.fecha_programada

  const costoTotal = data.reduce((s, r) => s + montoOf(r), 0)
  const margenTotal = vista === 'danos' ? data.reduce((s, r) => s + Number(r.margen ?? 0), 0) : 0
  const promedio = total > 0 ? costoTotal / total : 0
  const enProceso = vista === 'servicios' ? data.filter(s => s.estado === 'en_proceso').length : 0

  // Por mes (últimos 12 meses desde hoy hacia atrás)
  const porMes = []
  const hoy = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
    porMes.push({ key, label, count: 0, monto: 0 })
  }
  for (const r of data) {
    const f = fechaOf(r)
    if (!f) continue
    const fecha = new Date(f)
    const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
    const slot = porMes.find(m => m.key === key)
    if (slot) { slot.count += 1; slot.monto += montoOf(r) }
  }

  // Distribución
  let distribucion
  if (vista === 'danos') {
    const order = ['leve', 'medio', 'severo', 'perdida_total']
    distribucion = order.map(s => ({
      key: s,
      label: SEVERIDAD_LABELS[s],
      color: SEVERIDAD_COLORS[s],
      count: data.filter(r => r.severidad === s).length,
    })).filter(d => d.count > 0)
  } else {
    const counts = {}
    for (const r of data) counts[r.tipo_servicio] = (counts[r.tipo_servicio] ?? 0) + 1
    distribucion = Object.entries(counts)
      .map(([k, count]) => ({ key: k, label: TIPO_SERVICIO_LABELS[k] ?? k, count }))
      .sort((a, b) => b.count - a.count)
  }

  // Top vehículos
  const porPlaca = {}
  for (const r of data) {
    if (!r.placa) continue
    if (!porPlaca[r.placa]) {
      porPlaca[r.placa] = {
        placa: r.placa,
        label: [r.marca, r.linea, r.tipo_vehiculo].filter(Boolean).join(' · ') || '—',
        count: 0, monto: 0,
      }
    }
    porPlaca[r.placa].count += 1
    porPlaca[r.placa].monto += montoOf(r)
  }
  const topVehiculos = Object.values(porPlaca).sort((a, b) => b.count - a.count).slice(0, 5)

  // Por tipo de vehículo
  const porTipoMap = {}
  for (const r of data) {
    const t = r.tipo_vehiculo || 'Sin clasificar'
    if (!porTipoMap[t]) porTipoMap[t] = { tipo: t, count: 0, monto: 0 }
    porTipoMap[t].count += 1
    porTipoMap[t].monto += montoOf(r)
  }
  const porTipoVehiculo = Object.values(porTipoMap).sort((a, b) => b.count - a.count)

  return { total, costoTotal, margenTotal, promedio, enProceso, porMes, distribucion, topVehiculos, porTipoVehiculo }
}

// ============================================================
// UI helpers
// ============================================================

function Kpi({ title, value, icon: Icon, color, loading }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500 font-medium">{title}</p>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={15} className="text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">
        {loading ? <span className="text-gray-300 animate-pulse">--</span> : value}
      </p>
    </div>
  )
}

function RangeButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
    >
      {children}
    </button>
  )
}

function formatMonto(v) {
  if (v == null) return 'Q 0.00'
  return `Q ${Number(v).toLocaleString('es-GT', { minimumFractionDigits: 2 })}`
}
