import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, FileText, Printer, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate as fmtDateLib } from '../lib/fecha'
import { usePermisos } from '../hooks/usePermisos'

const ESTADO_SINIESTRO_LABELS = {
  proforma_emitida:  'Proforma emitida',
  proforma_aprobada: 'Aprobada',
  en_reparacion:     'En reparación',
  reparado:          'Reparado',
  en_cobro:          'En cobro',
  cerrado:           'Cerrado',
}

const ESTADO_SINIESTRO_COLORS = {
  proforma_emitida:  'bg-amber-100 text-amber-700',
  proforma_aprobada: 'bg-blue-100 text-blue-700',
  en_reparacion:     'bg-red-100 text-red-700',
  reparado:          'bg-teal-100 text-teal-700',
  en_cobro:          'bg-purple-100 text-purple-700',
  cerrado:           'bg-green-100 text-green-700',
}

export default function Proformas() {
  const navigate = useNavigate()
  const { puedeVerAnulados } = usePermisos()

  const [proformas, setProformas] = useState([])
  const [loading, setLoading]     = useState(true)
  const [busqueda, setBusqueda]   = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  useEffect(() => { load() }, [puedeVerAnulados])

  async function load() {
    setLoading(true)
    let q = supabase
      .from('cotizaciones')
      .select(`
        id, total_general, fecha_recepcion,
        talleres(nombre),
        siniestros!inner(
          id, numero, placa, marca, linea, tipo_vehiculo,
          cliente_nombre, fecha_dano,
          monto_cliente, costo_pass, margen, estado
        )
      `)
      .eq('estado', 'aprobada')
    if (!puedeVerAnulados) q = q.neq('siniestros.estado', 'anulado')
    const { data } = await q.order('created_at', { ascending: false }).limit(300)
    setProformas(data ?? [])
    setLoading(false)
  }

  const filtradas = proformas.filter(p => {
    const s = p.siniestros
    if (filtroEstado && s.estado !== filtroEstado) return false
    if (busqueda) {
      const b = busqueda.toLowerCase()
      return s.numero?.toLowerCase().includes(b) ||
             s.placa?.toLowerCase().includes(b) ||
             s.cliente_nombre?.toLowerCase().includes(b) ||
             p.talleres?.nombre?.toLowerCase().includes(b)
    }
    return true
  })

  function formatDate(iso) {
    return fmtDateLib(iso) ?? '—'
  }
  function formatMonto(v) {
    if (v == null) return '—'
    return `Q ${Number(v).toLocaleString('es-GT', { minimumFractionDigits: 2 })}`
  }

  const totalCostoPass    = filtradas.reduce((s, p) => s + Number(p.siniestros.costo_pass ?? 0), 0)
  const totalMontoCliente = filtradas.reduce((s, p) => s + Number(p.siniestros.monto_cliente ?? 0), 0)
  const totalMargen       = filtradas.reduce((s, p) => s + Number(p.siniestros.margen ?? 0), 0)

  function exportCsv() {
    const rows = [
      ['Daño', 'Fecha daño', 'Placa', 'Vehículo', 'Cliente', 'Taller', 'Costo Pass Q', 'Cliente paga Q', 'Margen Q', 'Estado'],
      ...filtradas.map(p => {
        const s = p.siniestros
        return [
          s.numero, s.fecha_dano, s.placa,
          [s.marca, s.linea, s.tipo_vehiculo].filter(Boolean).join(' '),
          s.cliente_nombre, p.talleres?.nombre ?? '',
          s.costo_pass ?? 0, s.monto_cliente ?? 0, s.margen ?? 0,
          s.estado,
        ]
      }),
    ]
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `proformas_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Proformas</h1>
          <p className="text-sm text-gray-500">
            {loading ? 'Cargando...' : `${filtradas.length} proforma${filtradas.length !== 1 ? 's' : ''} aprobada${filtradas.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={loading || filtradas.length === 0}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <Download size={15} />
          Exportar CSV
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiBox label="Costo Pass total" value={formatMonto(totalCostoPass)} color="bg-gray-700" loading={loading} />
        <KpiBox label="Cliente paga total" value={formatMonto(totalMontoCliente)} color="bg-blue-500" loading={loading} />
        <KpiBox
          label="Margen acumulado"
          value={formatMonto(totalMargen)}
          color={totalMargen >= 0 ? 'bg-green-600' : 'bg-red-700'}
          loading={loading}
        />
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por número, placa, cliente o taller..."
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
          {Object.entries(ESTADO_SINIESTRO_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Daño</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Vehículo</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Cliente</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Taller</th>
                <th className="text-right px-5 py-3 text-xs text-gray-500 font-medium">Costo Pass</th>
                <th className="text-right px-5 py-3 text-xs text-gray-500 font-medium">Cliente paga</th>
                <th className="text-right px-5 py-3 text-xs text-gray-500 font-medium">Margen</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Estado</th>
                <th className="px-5 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-3.5 bg-gray-100 rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtradas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center text-gray-400">
                    <FileText size={36} className="mx-auto mb-2 text-gray-300" strokeWidth={1.5} />
                    <p>No hay proformas aprobadas todavía</p>
                    <p className="text-xs mt-1">Las proformas aparecen aquí al aprobar una cotización de un daño</p>
                  </td>
                </tr>
              ) : (
                filtradas.map(p => {
                  const s = p.siniestros
                  const margen = Number(s.margen ?? 0)
                  return (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/siniestros/${s.id}`)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-5 py-3.5">
                        <span className="font-semibold text-blue-600">{s.numero}</span>
                        <p className="text-xs text-gray-400">{formatDate(s.fecha_dano)}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-900">{s.placa}</p>
                        <p className="text-xs text-gray-500 truncate max-w-[160px]">
                          {[s.marca, s.linea].filter(Boolean).join(' ') || '—'}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-gray-700 max-w-[180px] truncate">{s.cliente_nombre || '—'}</td>
                      <td className="px-5 py-3.5 text-gray-600">{p.talleres?.nombre || '—'}</td>
                      <td className="px-5 py-3.5 text-right text-gray-700 whitespace-nowrap">{formatMonto(s.costo_pass)}</td>
                      <td className="px-5 py-3.5 text-right text-gray-900 font-medium whitespace-nowrap">{formatMonto(s.monto_cliente)}</td>
                      <td className={`px-5 py-3.5 text-right font-semibold whitespace-nowrap ${
                        margen >= 0 ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {formatMonto(margen)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_SINIESTRO_COLORS[s.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                          {ESTADO_SINIESTRO_LABELS[s.estado] ?? s.estado}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/siniestros/${s.id}`) }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Ver proforma"
                        >
                          <Printer size={14} />
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

function KpiBox({ label, value, color, loading }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <div className={`p-2 rounded-lg ${color}`}>
          <FileText size={14} className="text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">
        {loading ? <span className="text-gray-300 animate-pulse">--</span> : value}
      </p>
    </div>
  )
}
