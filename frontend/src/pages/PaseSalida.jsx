import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ClipboardList, Printer, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { imprimirPasePDF } from '../lib/pase-pdf'
import { usePermisos } from '../hooks/usePermisos'
import { formatDate as fmtDate } from '../lib/fecha'

// ─── Constantes ────────────────────────────────────────────────────────────────

const MOTIVO_LABELS = {
  taller_reparacion: 'Taller x Reparación',
  taller_servicio:   'Taller x Servicio',
  gasolinera:        'Gasolinera',
  diligencias:       'Diligencias adm.',
  asignado_personal: 'Asignado al personal',
}

const ESTADO_BADGE = {
  abierto:  'bg-amber-100 text-amber-700 border-amber-200',
  cerrado:  'bg-green-100 text-green-700 border-green-200',
  anulado:  'bg-gray-100 text-gray-500 border-gray-200',
}

const ESTADO_LABEL = { abierto: 'Abierto', cerrado: 'Cerrado', anulado: 'Anulado' }

const COMBUSTIBLES = ['Full', '7/8', '6/8', '5/8', '1/2', '3/8', '1/8']

function now_gt() {
  const d = new Date()
  const gt = new Date(d.toLocaleString('en-US', { timeZone: 'America/Guatemala' }))
  const hh = String(gt.getHours()).padStart(2, '0')
  const mm = String(gt.getMinutes()).padStart(2, '0')
  return { fecha: gt.toISOString().slice(0, 10), hora: `${hh}:${mm}` }
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function PaseSalida() {
  const navigate = useNavigate()
  const { puedeEditar } = usePermisos()

  const [pases, setPases]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [busqueda, setBusqueda]   = useState('')
  const [filtroEstado, setFiltroEstado] = useState('activos') // activos | abierto | cerrado | anulado | todos
  const [cierrePase, setCierrePase] = useState(null)  // pase en proceso de cierre
  const [cierre, setCierre]       = useState({ combustible_entrada: 'Full', kilometraje_entrada: '' })
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [printLoading, setPrintLoading] = useState(null) // id del pase imprimiendo

  useEffect(() => { loadPases() }, [filtroEstado])

  async function loadPases() {
    setLoading(true)
    let q = supabase
      .from('pases_salida')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (filtroEstado === 'activos') {
      q = q.in('estado', ['abierto', 'cerrado'])
    } else if (filtroEstado !== 'todos') {
      q = q.eq('estado', filtroEstado)
    }

    const { data, error: dbErr } = await q
    if (dbErr) console.error(dbErr)
    setPases(data ?? [])
    setLoading(false)
  }

  const pasesFiltrados = pases.filter(p => {
    if (!busqueda) return true
    const q = busqueda.toLowerCase()
    return (
      p.numero?.toLowerCase().includes(q) ||
      p.vehiculo_placa?.toLowerCase().includes(q) ||
      p.contrato_referencia?.toLowerCase().includes(q) ||
      p.piloto_pass?.toLowerCase().includes(q)
    )
  })

  // ── Cierre ────────────────────────────────────────────────────────────────

  function abrirCierre(pase) {
    setCierrePase(pase)
    setCierre({ combustible_entrada: 'Full', kilometraje_entrada: '' })
    setError('')
  }

  async function confirmarCierre() {
    if (!cierrePase) return
    setSaving(true); setError('')
    try {
      const { fecha, hora } = now_gt()
      const { error: dbErr } = await supabase
        .from('pases_salida')
        .update({
          estado:              'cerrado',
          combustible_entrada: cierre.combustible_entrada,
          kilometraje_entrada: cierre.kilometraje_entrada ? Number(cierre.kilometraje_entrada) : null,
          fecha_entrada:       fecha,
          hora_entrada:        hora,
        })
        .eq('id', cierrePase.id)
      if (dbErr) throw dbErr
      setCierrePase(null)
      loadPases()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Imprimir ──────────────────────────────────────────────────────────────

  async function imprimirPase(pase) {
    setPrintLoading(pase.id)
    try {
      await imprimirPasePDF(pase)
    } catch (e) {
      setError(`No se pudo generar el PDF: ${e.message}`)
    } finally {
      setPrintLoading(null)
    }
  }

  // ── Navegar al origen ─────────────────────────────────────────────────────

  function irAlOrigen(pase) {
    if (pase.siniestro_id) navigate(`/siniestros/${pase.siniestro_id}`)
    else if (pase.orden_servicio_id) navigate(`/servicios/${pase.orden_servicio_id}`)
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList size={22} className="text-gray-400" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Pase de Salida Interno</h1>
            <p className="text-xs text-gray-400">Documentos de autorización de salida de vehículos</p>
          </div>
        </div>
        <span className="text-xs text-gray-400">{pasesFiltrados.length} registro{pasesFiltrados.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por No. Pase, placa, piloto…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-400"
          />
        </div>
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-red-400 bg-white"
        >
          <option value="activos">Activos (abiertos + cerrados)</option>
          <option value="abierto">Solo abiertos</option>
          <option value="cerrado">Solo cerrados</option>
          <option value="anulado">Anulados</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      {/* Error global */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded flex items-center gap-2">
          <AlertCircle size={13} />{error}
        </div>
      )}

      {/* Modal de cierre */}
      {cierrePase && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-semibold text-gray-800">Cerrar pase {cierrePase.numero}</h3>
            <p className="text-xs text-gray-500">
              Placa: <strong>{cierrePase.vehiculo_placa}</strong> · Piloto: <strong>{cierrePase.piloto_pass}</strong>
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-2">Combustible al entrar</label>
                <div className="flex flex-wrap gap-1">
                  {COMBUSTIBLES.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCierre(f => ({ ...f, combustible_entrada: c }))}
                      className={`text-xs px-2 py-1 rounded border ${
                        cierre.combustible_entrada === c
                          ? 'bg-green-50 border-green-300 text-green-700 font-medium'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Kilometraje al entrar</label>
                <input
                  type="number"
                  value={cierre.kilometraje_entrada}
                  onChange={e => setCierre(f => ({ ...f, kilometraje_entrada: e.target.value }))}
                  placeholder="Ej: 45350"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-green-400"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { setCierrePase(null); setError('') }} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded">
                Cancelar
              </button>
              <button
                onClick={confirmarCierre}
                disabled={saving}
                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded disabled:opacity-50"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                {saving ? 'Guardando…' : 'Confirmar entrada'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Cargando…</span>
          </div>
        ) : pasesFiltrados.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardList size={32} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No hay pases de salida con los filtros aplicados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-xs text-gray-400">
                  <th className="px-4 py-3 font-medium">No. Pase</th>
                  <th className="px-4 py-3 font-medium">Referencia</th>
                  <th className="px-4 py-3 font-medium">Placa</th>
                  <th className="px-4 py-3 font-medium">Piloto</th>
                  <th className="px-4 py-3 font-medium">Motivo</th>
                  <th className="px-4 py-3 font-medium">Salida</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pasesFiltrados.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-800 text-xs">{p.numero}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => irAlOrigen(p)}
                        className="text-xs text-blue-600 hover:underline font-medium"
                      >
                        {p.contrato_referencia}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">{p.vehiculo_placa}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{p.piloto_pass}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {MOTIVO_LABELS[p.motivo_salida] ?? p.motivo_salida}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {p.fecha_salida} {p.hora_salida}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${ESTADO_BADGE[p.estado]}`}>
                        {ESTADO_LABEL[p.estado]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Imprimir */}
                        <button
                          onClick={() => imprimirPase(p)}
                          disabled={printLoading === p.id}
                          title="Ver / Imprimir PDF"
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                        >
                          {printLoading === p.id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Printer size={13} />}
                        </button>

                        {/* Cerrar pase */}
                        {puedeEditar && p.estado === 'abierto' && (
                          <button
                            onClick={() => abrirCierre(p)}
                            title="Cerrar pase"
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                          >
                            <CheckCircle2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
