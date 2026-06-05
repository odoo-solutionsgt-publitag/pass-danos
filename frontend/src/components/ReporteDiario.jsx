import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Printer, FileSpreadsheet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate as fmtDateLib } from '../lib/fecha'
import { CHECKING_LABELS, CHECKING_COLORS } from './InfoOperacional'
import { exportarReporteExcel } from '../lib/exportarReporteExcel'

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

function fmtMoneda(n) {
  if (n === null || n === undefined) return '—'
  return `Q ${Number(n).toLocaleString('es-GT', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`
}

/**
 * Calcula el costo Pass propuesto (basado en cotizaciones, no necesariamente aprobadas).
 * - unica:    MIN de las cotizaciones con líneas y NO rechazadas
 * - multiple: SUMA de las cotizaciones con líneas y NO rechazadas
 * Retorna { monto, esTemporal } — esTemporal=true si ninguna aprobada.
 */
function calcularCostoPass(d) {
  const cots = (d.cotizaciones ?? []).filter(c =>
    c.estado !== 'rechazada' && Number(c.total_general) > 0
  )
  if (cots.length === 0) return { monto: null, esTemporal: false }
  const hayAprobada = cots.some(c => c.estado === 'aprobada')
  const tipo = d.tipo_cotizacion || 'unica'
  const monto = tipo === 'multiple'
    ? cots.reduce((acc, c) => acc + Number(c.total_general), 0)
    : Math.min(...cots.map(c => Number(c.total_general)))
  return { monto, esTemporal: !hayAprobada }
}

const MESES_LABEL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function listarAniosDisponibles() {
  const inicio = 2026
  const fin = new Date().getFullYear()
  const anios = []
  for (let y = fin; y >= inicio; y--) anios.push(y)
  return anios.length ? anios : [2026]
}

function rangoFecha({ year, month }) {
  if (month) {
    const inicio = new Date(year, month - 1, 1).toISOString().slice(0, 10)
    const fin    = new Date(year, month, 0).toISOString().slice(0, 10)
    return { inicio, fin }
  }
  return {
    inicio: new Date(year, 0,  1).toISOString().slice(0, 10),
    fin:    new Date(year, 11, 31).toISOString().slice(0, 10),
  }
}

export default function ReporteDiario() {
  const navigate = useNavigate()
  const aniosDisponibles = useMemo(() => listarAniosDisponibles(), [])
  const [anio, setAnio]               = useState(aniosDisponibles[0])
  const [mes, setMes]                 = useState(null)  // null = Todos los meses del año
  const [incluyeServicios, setIncSv]  = useState(true)
  const [incluyeDanos, setIncDn]      = useState(true)
  const [mostrarMotivo, setMotivo]    = useState(true)
  const [mostrarObserv, setObserv]    = useState(true)
  const [filas, setFilas]             = useState([])
  const [loading, setLoading]         = useState(true)

  useEffect(() => { load() }, [anio, mes])

  async function load() {
    setLoading(true)

    // ── Daños activos (no cerrados/anulados, no disponibles para renta) ──
    let danosQ = supabase
      .from('siniestros')
      .select(`
        id, numero, placa, tipo_vehiculo, tipo_dano, descripcion, forma_pago,
        fecha_dano, fecha_estimada_entrega, estado, estado_checking,
        ubicacion_vehiculo, ubicacion_detalle, disponible_renta, taller_id,
        monto_cliente, costo_pass, margen, tipo_cotizacion,
        cotizaciones(estado, total_general),
        talleres(nombre)
      `)
      .not('estado', 'in', '("cerrado","anulado")')
      .eq('disponible_renta', false)
      .order('fecha_dano')

    // ── Servicios activos (no completados/cancelados) ──
    let serviciosQ = supabase
      .from('ordenes_servicio')
      .select(`
        id, numero, placa, tipo_vehiculo, tipo_servicio, descripcion,
        fecha_programada, fecha_estimada_entrega, estado, taller_id,
        talleres(nombre)
      `)
      .not('estado', 'in', '("completado","cancelado")')
      .order('fecha_programada')

    // Filtro de fecha: año (siempre) + mes (opcional)
    const { inicio, fin } = rangoFecha({ year: anio, month: mes })
    danosQ     = danosQ.gte('fecha_dano',       inicio).lte('fecha_dano',       fin)
    serviciosQ = serviciosQ.gte('fecha_programada', inicio).lte('fecha_programada', fin)

    const [{ data: danos }, { data: servicios }] = await Promise.all([danosQ, serviciosQ])

    // IDs para traer últimas notas
    const danosIds     = (danos ?? []).map(d => d.id)
    const serviciosIds = (servicios ?? []).map(s => s.id)

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

    // Función para calcular días desde fecha de registro hasta hoy
    const diasDesde = (iso) => {
      if (!iso) return 0
      const [y, m, d] = iso.split('-').map(Number)
      const inicio = new Date(y, m - 1, d)
      const hoy = new Date()
      hoy.setHours(0, 0, 0, 0)
      const ms = hoy - inicio
      return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)))
    }

    const ubicacionLabel = (u, detalle) => {
      if (u === 'pass')   return 'Pass'
      if (u === 'taller') return 'Taller'
      if (u === 'otro')   return detalle ? `Otro (${detalle})` : 'Otro'
      return '—'
    }

    // ── Filas de daños ──
    const filasDanos = (danos ?? []).map(d => {
      // Pass paga: calculado desde cotizaciones (no necesariamente aprobadas)
      const pass = calcularCostoPass(d)
      const montoCliente = Number(d.monto_cliente) || 0
      const margenCalc = pass.monto !== null ? (montoCliente - pass.monto) : null

      return {
        id:             d.id,
        tipoRegistro:   'dano',
        registroId:     d.id,
        numero:         d.numero,
        placa:          d.placa,
        tipoVehiculo:   d.tipo_vehiculo,
        ubicacion:      ubicacionLabel(d.ubicacion_vehiculo, d.ubicacion_detalle),
        taller:         d.talleres?.nombre ?? '—',
        fechaRegistro:  d.fecha_dano,
        fechaEstSalida: d.fecha_estimada_entrega,
        dias:           diasDesde(d.fecha_dano),
        checking:       d.estado_checking,
        montoCliente:   d.monto_cliente,
        costoPass:      pass.monto,
        margen:         margenCalc,
        esTemporal:     pass.esTemporal,
        motivo:         [
          TIPO_DANO_LABELS[d.tipo_dano] ?? d.tipo_dano,
          d.descripcion,
        ].filter(Boolean).join(' · '),
        observaciones:  notasMap.dano[d.id] ?? FORMA_PAGO_LABELS[d.forma_pago] ?? '—',
      }
    })

    // ── Filas de servicios ──
    const filasServicios = (servicios ?? []).map(s => ({
      id:             s.id,
      tipoRegistro:   'servicio',
      registroId:     s.id,
      numero:         s.numero,
      placa:          s.placa,
      tipoVehiculo:   s.tipo_vehiculo,
      ubicacion:      '—', // ordenes_servicio no tiene ubicacion_vehiculo
      taller:         s.talleres?.nombre ?? '—',
      fechaRegistro:  s.fecha_programada,
      fechaEstSalida: s.fecha_estimada_entrega,
      dias:           diasDesde(s.fecha_programada),
      checking:       null, // servicios no usan estado_checking
      motivo:         [
        TIPO_SERVICIO_LABELS[s.tipo_servicio] ?? s.tipo_servicio,
        s.descripcion,
      ].filter(Boolean).join(' · '),
      observaciones:  notasMap.servicio[s.id] ?? 'Gastos de PASS Rent a Car',
    }))

    const todos = [...filasDanos, ...filasServicios]
      .sort((a, b) => new Date(b.fechaRegistro) - new Date(a.fechaRegistro))

    setFilas(todos)
    setLoading(false)
  }

  const filasFiltradas = useMemo(() => filas.filter(f => {
    if (f.tipoRegistro === 'dano'     && !incluyeDanos)     return false
    if (f.tipoRegistro === 'servicio' && !incluyeServicios) return false
    return true
  }), [filas, incluyeDanos, incluyeServicios])

  // Total de columnas: 13 fijas (10 + 3 financieras) + Motivo + Observaciones
  const nColumnas = 13 + (mostrarMotivo ? 1 : 0) + (mostrarObserv ? 1 : 0)

  function abrirRegistro(fila) {
    if (fila.tipoRegistro === 'dano') navigate(`/siniestros/${fila.registroId}`)
    else navigate(`/servicios/${fila.registroId}`)
  }

  // Etiqueta del título según combinación de filtros (sin la palabra "Filtros")
  function tituloReporte() {
    if (incluyeServicios && incluyeDanos)  return 'Registro de Daños/Servicios'
    if (incluyeDanos)                       return 'Registro de Daños'
    if (incluyeServicios)                   return 'Registro de Servicios'
    return 'Registro Diario'
  }

  function fechaLabel() {
    if (!mes) return 'Fechas: Todas'
    return `Fecha: Mes de ${MESES_LABEL[mes - 1]} ${anio}`
  }

  function nombreArchivo() {
    const hoy = new Date().toISOString().slice(0, 10)
    let sufijo = ''
    if (incluyeDanos && !incluyeServicios)     sufijo = '-danos'
    if (incluyeServicios && !incluyeDanos)     sufijo = '-servicios'
    return `reporte-diario${sufijo}-${hoy}`
  }

  async function exportarExcel() {
    try {
      await exportarReporteExcel({
        filas: filasFiltradas,
        info: {
          titulo:     tituloReporte(),
          fechaLabel: fechaLabel(),
          total:      filasFiltradas.length,
        },
        nombreArchivo: nombreArchivo(),
        mostrarMotivo,
        mostrarObservaciones: mostrarObserv,
      })
    } catch (e) {
      console.error('[exportarExcel]', e)
      alert('No se pudo generar el Excel: ' + e.message)
    }
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
      {/* Header solo-print: logo + título + filtros + total */}
      <div className="hidden print:block px-5 py-3 border-b border-gray-200">
        <div className="flex items-start gap-4">
          <img src="/pass-35-logo.png" alt="Pass" className="h-14 object-contain" />
          <div className="flex-1">
            <h1 className="text-base font-bold text-gray-900">PASS RENT A CAR GUATEMALA</h1>
            <p className="text-sm font-semibold text-red-700">{tituloReporte()}</p>
            <p className="text-xs text-gray-600 mt-0.5">
              {fechaLabel()} · Total: {filasFiltradas.length}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Generado: {new Date().toLocaleString('es-GT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3 no-print">
        <div className="flex items-center gap-2">
          <ClipboardList size={18} className="text-red-600" />
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Reporte Diario</h2>
            <p className="text-xs text-gray-500">Vehículos no disponibles para renta (daños y servicios activos)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={imprimir}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            <Printer size={13} />
            Imprimir
          </button>
          <button
            onClick={exportarExcel}
            disabled={filasFiltradas.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-green-200 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 disabled:opacity-40"
          >
            <FileSpreadsheet size={13} />
            Exportar Excel
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

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={mostrarMotivo}
            onChange={e => setMotivo(e.target.checked)}
            className="accent-red-600"
          />
          <span className="font-medium text-gray-700">Mostrar Motivo</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={mostrarObserv}
            onChange={e => setObserv(e.target.checked)}
            className="accent-red-600"
          />
          <span className="font-medium text-gray-700">Mostrar Observaciones</span>
        </label>

        <div className="flex items-center gap-2">
          <span className="text-gray-500">Año:</span>
          <select
            value={anio}
            onChange={e => setAnio(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400 bg-white"
          >
            {aniosDisponibles.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-500">Mes:</span>
          <select
            value={mes ?? 'all'}
            onChange={e => setMes(e.target.value === 'all' ? null : Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400 bg-white"
          >
            <option value="all">Todos</option>
            {MESES_LABEL.map((label, idx) => (
              <option key={idx + 1} value={idx + 1}>{label}</option>
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
              <th className="px-3 py-2 font-medium">Ubicación</th>
              <th className="px-3 py-2 font-medium leading-tight">Taller<br/>Asignado</th>
              <th className="px-3 py-2 font-medium leading-tight">Fecha<br/>Registro</th>
              <th className="px-3 py-2 font-medium leading-tight">Fecha Aprox.<br/>Ingreso</th>
              <th className="px-3 py-2 font-medium text-center leading-tight">Días en<br/>Taller</th>
              <th className="px-3 py-2 font-medium text-right leading-tight">Cliente<br/>paga</th>
              <th className="px-3 py-2 font-medium text-right leading-tight">Pass<br/>paga</th>
              <th className="px-3 py-2 font-medium text-right">Margen</th>
              <th className="px-3 py-2 font-medium">Etapa checking</th>
              {mostrarMotivo && (
                <th className="px-3 py-2 font-medium leading-tight">Motivo de<br/>envío a taller</th>
              )}
              {mostrarObserv && (
                <th className="px-3 py-2 font-medium">Observaciones</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: nColumnas }).map((_, j) => (
                    <td key={j} className="px-3 py-2">
                      <div className="h-3 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filasFiltradas.length === 0 ? (
              <tr>
                <td colSpan={nColumnas} className="px-3 py-10 text-center text-gray-400 text-sm italic">
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
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap" title={f.ubicacion}>{f.ubicacion}</td>
                  <td className="px-3 py-2 text-gray-700">{f.taller}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(f.fechaRegistro)}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(f.fechaEstSalida)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="inline-flex items-center gap-1.5 font-medium text-gray-800">
                      {(f.dias ?? 0) > 0 ? `-${f.dias}` : (f.dias ?? 0)}
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${semaforoColor(f.dias)}`} />
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                    {f.tipoRegistro === 'dano'
                      ? <span className="text-blue-700">{fmtMoneda(f.montoCliente)}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                    {f.tipoRegistro === 'dano' && f.costoPass !== null
                      ? <span
                          className={f.esTemporal ? 'text-gray-500 italic' : 'text-gray-700'}
                          title={f.esTemporal ? 'Monto propuesto — ninguna cotización aprobada' : 'Monto basado en cotización aprobada'}
                        >
                          {fmtMoneda(f.costoPass)}{f.esTemporal && '*'}
                        </span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                    {f.tipoRegistro === 'dano' && f.margen !== null
                      ? <span
                          className={`${Number(f.margen) >= 0 ? 'text-green-700' : 'text-red-700'} ${f.esTemporal ? 'italic' : ''}`}
                          title={f.esTemporal ? 'Margen propuesto — basado en cotizaciones sin aprobar' : 'Margen final'}
                        >
                          {fmtMoneda(f.margen)}{f.esTemporal && '*'}
                        </span>
                      : <span className="text-gray-300">—</span>}
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
                  {mostrarMotivo && (
                    <td className="px-3 py-2 text-gray-700 max-w-[40ch] break-words align-top">
                      {f.motivo || '—'}
                    </td>
                  )}
                  {mostrarObserv && (
                    <td className="px-3 py-2 text-gray-700 max-w-[40ch] break-words align-top">
                      {f.observaciones}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-2 text-[11px] text-gray-400 italic border-t border-gray-50 no-print">
        * Monto propuesto basado en cotizaciones sin aprobar todavía.
        {' '}Para daños en modo Única se muestra la cotización más económica; en modo Múltiple, la suma de todas.
      </p>
    </div>
  )
}
