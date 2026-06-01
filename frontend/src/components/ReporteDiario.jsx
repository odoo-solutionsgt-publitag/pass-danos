import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Printer, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate as fmtDateLib } from '../lib/fecha'
import { CHECKING_LABELS, CHECKING_COLORS } from './InfoOperacional'

const TIPO_DANO_LABELS = {
  choque_frontal: 'Choque frontal',
  choque_trasero: 'Choque trasero',
  choque_lateral: 'Choque lateral',
  rayon:          'Rayón',
  abollon:        'Abollón',
  vidrio:         'Vidrio',
  llanta:         'Llanta',
  mecanico:       'Mecánico',
  multiple:       'Múltiple',
  otro:           'Otro',
}

const TIPO_SERVICIO_LABELS = {
  servicio_menor:      'Servicio menor',
  servicio_mayor:      'Servicio mayor',
  cambio_llantas:      'Cambio de llantas',
  cambio_bateria:      'Cambio de batería',
  alineacion_balanceo: 'Alineación / balanceo',
  cambio_frenos:       'Cambio de frenos',
  revision_general:    'Revisión general',
  enderezado_pintura:  'Enderezado / pintura',
  reposicion_llave:    'Reposición de llave',
  sistema_electrico:   'Sistema eléctrico',
  revision_ac:         'Revisión A/C',
  revision_inyeccion:  'Revisión inyección',
  otro:                'Otro',
}

const FORMA_PAGO_LABELS = {
  cliente: 'Gastos del cliente',
  pass:    'Gastos de PASS Rent a Car',
  seguro:  'Cubre seguro',
}

function fmtDate(iso) {
  return fmtDateLib(iso, { day: '2-digit', month: 'short' }) ?? '—'
}

function semaforoColor(dias) {
  if (dias <= 2) return 'bg-green-500'
  if (dias <= 5) return 'bg-amber-400'
  return 'bg-red-500'
}

function mesActual() {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

function listarUltimosMeses(n = 12) {
  const out = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    out.push({
      year:  d.getFullYear(),
      month: d.getMonth() + 1,
      label: d.toLocaleDateString('es-GT', { month: 'long', year: 'numeric' }),
    })
    d.setMonth(d.getMonth() - 1)
  }
  return out
}

function rangoMes({ year, month }) {
  const inicio = new Date(year, month - 1, 1).toISOString().slice(0, 10)
  const fin    = new Date(year, month, 0).toISOString().slice(0, 10)
  return { inicio, fin }
}

export default function ReporteDiario() {
  const navigate = useNavigate()
  const [mes, setMes]                 = useState(mesActual())
  const [incluyeServicios, setIncSv]  = useState(true)
  const [incluyeDanos, setIncDn]      = useState(true)
  const [filas, setFilas]             = useState([])
  const [loading, setLoading]         = useState(true)

  const meses = useMemo(() => listarUltimosMeses(12), [])

  useEffect(() => { load() }, [mes])

  async function load() {
    setLoading(true)
    const { inicio, fin } = rangoMes(mes)

    // Daños actualmente en taller (sin fecha_egreso) que ingresaron en el mes
    const danosQ = supabase
      .from('taller_ingresos')
      .select(`
        id, fecha_ingreso, dias_en_taller,
        talleres(nombre),
        siniestros!inner(
          id, numero, placa, tipo_vehiculo, tipo_dano, descripcion, forma_pago,
          fecha_estimada_entrega, estado, estado_checking
        )
      `)
      .is('fecha_egreso', null)
      .not('siniestro_id', 'is', null)
      .gte('fecha_ingreso', inicio)
      .lte('fecha_ingreso', fin)
      .order('fecha_ingreso')

    // Servicios actualmente en taller
    const serviciosQ = supabase
      .from('taller_ingresos')
      .select(`
        id, fecha_ingreso, dias_en_taller,
        talleres(nombre),
        ordenes_servicio!inner(
          id, numero, placa, tipo_vehiculo, tipo_servicio, descripcion,
          fecha_estimada_entrega, estado
        )
      `)
      .is('fecha_egreso', null)
      .not('orden_servicio_id', 'is', null)
      .gte('fecha_ingreso', inicio)
      .lte('fecha_ingreso', fin)
      .order('fecha_ingreso')

    const [{ data: danos }, { data: servicios }] = await Promise.all([danosQ, serviciosQ])

    // IDs para traer últimas notas
    const danosIds     = (danos ?? []).map(d => d.siniestros.id)
    const serviciosIds = (servicios ?? []).map(s => s.ordenes_servicio.id)

    let notasMap = { dano: {}, servicio: {} }
    if (danosIds.length || serviciosIds.length) {
      const ors = []
      if (danosIds.length)     ors.push(`siniestro_id.in.(${danosIds.join(',')})`)
      if (serviciosIds.length) ors.push(`orden_servicio_id.in.(${serviciosIds.join(',')})`)
      const { data: notas } = await supabase
        .from('bitacora_actualizaciones')
        .select('siniestro_id, orden_servicio_id, nota, created_at')
        .or(ors.join(','))
        .order('created_at', { ascending: false })

      for (const n of (notas ?? [])) {
        if (n.siniestro_id && !notasMap.dano[n.siniestro_id]) {
          notasMap.dano[n.siniestro_id] = n.nota
        }
        if (n.orden_servicio_id && !notasMap.servicio[n.orden_servicio_id]) {
          notasMap.servicio[n.orden_servicio_id] = n.nota
        }
      }
    }

    // Normalizar a un solo array de filas
    const filasDanos = (danos ?? []).map(d => ({
      id:             d.id,
      tipoRegistro:   'dano',
      registroId:     d.siniestros.id,
      numero:         d.siniestros.numero,
      placa:          d.siniestros.placa,
      tipoVehiculo:   d.siniestros.tipo_vehiculo,
      taller:         d.talleres?.nombre ?? '—',
      fechaIngreso:   d.fecha_ingreso,
      fechaEstSalida: d.siniestros.fecha_estimada_entrega,
      dias:           d.dias_en_taller ?? 0,
      checking:       d.siniestros.estado_checking,
      motivo:         [
        TIPO_DANO_LABELS[d.siniestros.tipo_dano] ?? d.siniestros.tipo_dano,
        d.siniestros.descripcion,
      ].filter(Boolean).join(' · '),
      observaciones:  notasMap.dano[d.siniestros.id] ?? FORMA_PAGO_LABELS[d.siniestros.forma_pago] ?? '—',
    }))

    const filasServicios = (servicios ?? []).map(s => ({
      id:             s.id,
      tipoRegistro:   'servicio',
      registroId:     s.ordenes_servicio.id,
      numero:         s.ordenes_servicio.numero,
      placa:          s.ordenes_servicio.placa,
      tipoVehiculo:   s.ordenes_servicio.tipo_vehiculo,
      taller:         s.talleres?.nombre ?? '—',
      fechaIngreso:   s.fecha_ingreso,
      fechaEstSalida: s.ordenes_servicio.fecha_estimada_entrega,
      dias:           s.dias_en_taller ?? 0,
      checking:       null,
      motivo:         [
        TIPO_SERVICIO_LABELS[s.ordenes_servicio.tipo_servicio] ?? s.ordenes_servicio.tipo_servicio,
        s.ordenes_servicio.descripcion,
      ].filter(Boolean).join(' · '),
      observaciones:  notasMap.servicio[s.ordenes_servicio.id] ?? 'Gastos de PASS Rent a Car',
    }))

    const todos = [...filasDanos, ...filasServicios]
      .sort((a, b) => new Date(a.fechaIngreso) - new Date(b.fechaIngreso))

    setFilas(todos)
    setLoading(false)
  }

  const filasFiltradas = useMemo(() => filas.filter(f => {
    if (f.tipoRegistro === 'dano'     && !incluyeDanos)     return false
    if (f.tipoRegistro === 'servicio' && !incluyeServicios) return false
    return true
  }), [filas, incluyeDanos, incluyeServicios])

  function abrirRegistro(fila) {
    if (fila.tipoRegistro === 'dano') navigate(`/siniestros/${fila.registroId}`)
    else navigate(`/servicios/${fila.registroId}`)
  }

  function exportarCSV() {
    const headers = ['No','Placa','Tipo veh.','Registro','Taller','Ingreso','Est. salida','Días','Etapa checking','Motivo','Observaciones']
    const lines = filasFiltradas.map((f, idx) => [
      idx + 1,
      f.placa,
      f.tipoVehiculo,
      f.tipoRegistro === 'dano' ? 'Daño' : 'Servicio',
      f.taller,
      f.fechaIngreso ?? '',
      f.fechaEstSalida ?? '',
      f.dias,
      f.checking ? (CHECKING_LABELS[f.checking] ?? f.checking) : '',
      `"${(f.motivo || '').replace(/"/g, '""')}"`,
      `"${(f.observaciones || '').replace(/"/g, '""')}"`,
    ].join(','))
    const csv = [headers.join(','), ...lines].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte-diario-${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function imprimir() {
    document.body.classList.add('printing-reporte-diario')
    const cleanup = () => {
      document.body.classList.remove('printing-reporte-diario')
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    window.print()
  }

  return (
    <div className="reporte-diario bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">

      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList size={18} className="text-red-600" />
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Reporte Diario</h2>
            <p className="text-xs text-gray-500">Vehículos actualmente en taller</p>
          </div>
        </div>
        <div className="flex items-center gap-2 no-print">
          <button
            onClick={imprimir}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            <Printer size={13} />
            Imprimir
          </button>
          <button
            onClick={exportarCSV}
            disabled={filasFiltradas.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            <Download size={13} />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Filtros + leyenda */}
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs no-print">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={incluyeServicios}
            onChange={e => setIncSv(e.target.checked)}
            className="accent-red-600"
          />
          <span className="font-medium text-gray-700">Servicios</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={incluyeDanos}
            onChange={e => setIncDn(e.target.checked)}
            className="accent-red-600"
          />
          <span className="font-medium text-gray-700">Daños</span>
        </label>

        <div className="flex items-center gap-2">
          <span className="text-gray-500">Mes:</span>
          <select
            value={`${mes.year}-${mes.month}`}
            onChange={e => {
              const [year, month] = e.target.value.split('-').map(Number)
              setMes({ year, month })
            }}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400 bg-white capitalize"
          >
            {meses.map(m => (
              <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`} className="capitalize">
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <span className="ml-auto font-medium text-gray-600">
          Total: {filasFiltradas.length} vehículos
        </span>

        <div className="w-full flex items-center gap-4 text-[11px] text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> 1-2 días</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> 3-5 días</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> 6+ días</span>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-3 py-2 font-medium w-10">#</th>
              <th className="px-3 py-2 font-medium">Placa</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Registro</th>
              <th className="px-3 py-2 font-medium">Taller</th>
              <th className="px-3 py-2 font-medium">Ingreso</th>
              <th className="px-3 py-2 font-medium">Est. salida</th>
              <th className="px-3 py-2 font-medium text-center">Días</th>
              <th className="px-3 py-2 font-medium">Etapa checking</th>
              <th className="px-3 py-2 font-medium">Motivo</th>
              <th className="px-3 py-2 font-medium">Observaciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 11 }).map((_, j) => (
                    <td key={j} className="px-3 py-2">
                      <div className="h-3 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filasFiltradas.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-10 text-center text-gray-400 text-sm italic">
                  No hay vehículos en taller en este mes con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              filasFiltradas.map((f, idx) => (
                <tr
                  key={f.id}
                  onClick={() => abrirRegistro(f)}
                  className="hover:bg-red-50/50 cursor-pointer"
                >
                  <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                  <td className="px-3 py-2 font-mono font-medium text-gray-900">{f.placa}</td>
                  <td className="px-3 py-2 text-gray-600">{f.tipoVehiculo || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      f.tipoRegistro === 'dano'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {f.tipoRegistro === 'dano' ? 'Daño' : 'Servicio'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{f.taller}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(f.fechaIngreso)}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(f.fechaEstSalida)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="inline-flex items-center gap-1.5 font-medium text-gray-800">
                      {f.dias}
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${semaforoColor(f.dias)}`} />
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {f.checking ? (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${CHECKING_COLORS[f.checking] || ''}`}>
                        {CHECKING_LABELS[f.checking] ?? f.checking}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-700 max-w-[220px] truncate" title={f.motivo}>
                    {f.motivo || '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-700 max-w-[260px] truncate" title={f.observaciones}>
                    {f.observaciones}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
