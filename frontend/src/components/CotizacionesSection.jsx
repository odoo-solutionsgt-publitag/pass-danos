import { useState, useEffect } from 'react'
import { Plus, Trash2, Check, X, AlertTriangle, Layers, Target, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import DocumentosSection from './DocumentosSection'
import { usePermisos } from '../hooks/usePermisos'
import { colorPorIndice } from '../lib/colores'

const TIPO_LABELS = { repuesto: 'Repuesto', mano_obra: 'Mano de obra', otro: 'Otro', descuento: 'Descuento' }

const ESTADO_COT_COLORS = {
  solicitada: 'bg-gray-100 text-gray-600',
  recibida:   'bg-blue-100 text-blue-700',
  aprobada:   'bg-green-100 text-green-700',
  rechazada:  'bg-red-100 text-red-500',
}

const ESTADO_COT_LABELS = {
  solicitada: 'Solicitada',
  recibida:   'Recibida',
  aprobada:   'Aprobada',
  rechazada:  'Rechazada',
}

function fmt(n) {
  return `Q ${Number(n || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const LINEA_VACIA      = { tipo: 'repuesto', descripcion: '', cantidad: '1', precio_unitario: '' }
const SOLICITUD_VACIA  = { taller_id: '', variante: '' }
const TIPOS_LINEA_OPTS = [
  { value: 'repuesto',  label: 'Repuesto'   },
  { value: 'mano_obra', label: 'M. obra'    },
  { value: 'otro',      label: 'Otro'       },
  { value: 'descuento', label: 'Descuento'  },
]

export default function CotizacionesSection({ siniestro, onUpdate }) {
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos()
  const [cotizaciones, setCotizaciones] = useState([])
  const [talleres, setTalleres]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [showSolicitar, setShowSolicitar] = useState(false)
  const [solicitudes, setSolicitudes]   = useState([{ ...SOLICITUD_VACIA }])
  const [newLineas, setNewLineas]       = useState({})   // { [cotId]: LINEA_VACIA }
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')

  useEffect(() => { loadAll() }, [siniestro.id])

  async function loadAll() {
    const [{ data: cots }, { data: tals }] = await Promise.all([
      supabase
        .from('cotizaciones')
        .select('*, talleres(nombre), cotizacion_lineas(*)')
        .eq('siniestro_id', siniestro.id)
        .order('created_at'),
      supabase.from('talleres').select('id,nombre').eq('activo', true).order('nombre'),
    ])
    setCotizaciones(cots ?? [])
    setTalleres(tals ?? [])
    setLoading(false)
  }

  // ── Solicitar cotizaciones ────────────────────────────────

  async function handleSolicitar() {
    const validas = solicitudes.filter(s => s.taller_id)
    if (!validas.length) return
    setSaving(true); setError('')
    try {
      const inserts = validas.map(s => ({
        siniestro_id:    siniestro.id,
        taller_id:       s.taller_id,
        variante:        s.variante.trim() || null,
        estado:          'solicitada',
        fecha_solicitud: new Date().toISOString().slice(0, 10),
      }))
      const { error: err } = await supabase.from('cotizaciones').insert(inserts)
      if (err) throw err
      setShowSolicitar(false)
      setSolicitudes([{ ...SOLICITUD_VACIA }])
      await loadAll()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  function setSolicitud(idx, field, value) {
    setSolicitudes(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }
  function addSolicitudFila() {
    setSolicitudes(prev => [...prev, { ...SOLICITUD_VACIA }])
  }
  function removeSolicitudFila(idx) {
    setSolicitudes(prev => prev.length === 1 ? [{ ...SOLICITUD_VACIA }] : prev.filter((_, i) => i !== idx))
  }

  // ── Líneas ────────────────────────────────────────────────

  function setNl(cotId, field, value) {
    setNewLineas(prev => ({
      ...prev,
      [cotId]: { ...(prev[cotId] ?? LINEA_VACIA), [field]: value },
    }))
  }

  async function handleAddLinea(cotId) {
    const nl = newLineas[cotId] ?? LINEA_VACIA
    if (!nl.descripcion.trim()) return
    setSaving(true); setError('')
    try {
      const cantidad = parseFloat(nl.cantidad) || 1
      const precio   = parseFloat(nl.precio_unitario) || 0
      const subtotal = cantidad * precio

      await supabase.from('cotizacion_lineas').insert({
        cotizacion_id:  cotId,
        tipo:           nl.tipo,
        descripcion:    nl.descripcion.trim(),
        cantidad,
        precio_unitario: precio,
        subtotal,
      })

      // Si la cotización estaba en "solicitada", pasar a "recibida"
      const cot = cotizaciones.find(c => c.id === cotId)
      if (cot?.estado === 'solicitada') {
        await supabase.from('cotizaciones').update({
          estado: 'recibida',
          fecha_recepcion: new Date().toISOString().slice(0, 10),
        }).eq('id', cotId)
      }

      setNewLineas(prev => ({ ...prev, [cotId]: { ...LINEA_VACIA } }))
      await loadAll()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function handleDeleteLinea(lineaId) {
    await supabase.from('cotizacion_lineas').delete().eq('id', lineaId)
    await loadAll()
  }

  // ── Aprobar cotización ────────────────────────────────────

  async function handleAprobar(cotId, tallerId) {
    setSaving(true); setError('')
    try {
      await supabase.from('cotizaciones').update({ estado: 'aprobada' }).eq('id', cotId)

      if (tipoCotizacion === 'unica') {
        // Modo única: rechazar todas las demás
        const otrosIds = cotizaciones.filter(c => c.id !== cotId).map(c => c.id)
        if (otrosIds.length) {
          await supabase.from('cotizaciones').update({ estado: 'rechazada' }).in('id', otrosIds)
        }
        // Solo asignar taller_id en modo única
        const updates = { taller_id: tallerId }
        if (siniestro.estado === 'cotizando') updates.estado = 'proforma_emitida'
        await supabase.from('siniestros').update(updates).eq('id', siniestro.id)
      } else {
        // Modo múltiple: no se tocan las demás. costo_pass se recalcula vía trigger SQL.
        // taller_id queda NULL (no hay taller único).
        if (siniestro.estado === 'cotizando') {
          await supabase.from('siniestros').update({
            estado: 'proforma_emitida',
            taller_id: null,
          }).eq('id', siniestro.id)
        }
      }

      await loadAll()
      onUpdate()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  // ── Quitar aprobación (solo modo múltiple) ─────────────────

  async function handleQuitarAprobacion(cotId) {
    setSaving(true); setError('')
    try {
      // Volver a 'recibida'. El trigger recalcula costo_pass = SUM de aprobadas restantes.
      await supabase.from('cotizaciones').update({ estado: 'recibida' }).eq('id', cotId)
      await loadAll()
      onUpdate()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  // ── Cambio de modo de cotización ──────────────────────────

  async function handleTipoCotizacionChange(nuevoTipo) {
    if (nuevoTipo === tipoCotizacion) return
    if (modoBloqueado) return
    setSaving(true); setError('')
    try {
      const { error: err } = await supabase
        .from('siniestros')
        .update({ tipo_cotizacion: nuevoTipo })
        .eq('id', siniestro.id)
      if (err) throw err
      onUpdate()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  // ── Render ────────────────────────────────────────────────

  if (loading) return <p className="text-sm text-gray-400 py-2">Cargando cotizaciones...</p>

  const tipoCotizacion    = siniestro.tipo_cotizacion || 'unica'
  const esModoMultiple    = tipoCotizacion === 'multiple'
  // Modo bloqueado cuando existe al menos 1 cotización con líneas
  const modoBloqueado     = cotizaciones.some(c => (c.cotizacion_lineas ?? []).length > 0)
  const hayAprobada       = cotizaciones.some(c => c.estado === 'aprobada')
  const cotsConLineas     = cotizaciones.filter(c => (c.cotizacion_lineas ?? []).length > 0 && c.estado !== 'rechazada')
  const minTotal          = !esModoMultiple && cotsConLineas.length > 1
    ? Math.min(...cotsConLineas.map(c => Number(c.total_general) || 0))
    : null
  const sumaAprobadas     = cotizaciones
    .filter(c => c.estado === 'aprobada')
    .reduce((acc, c) => acc + (Number(c.total_general) || 0), 0)

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-sm font-semibold text-gray-700">Cotizaciones</h4>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
            esModoMultiple
              ? 'bg-purple-50 border-purple-200 text-purple-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            {esModoMultiple ? <><Layers size={10} className="inline mr-1" />Modo: Múltiple</> : <><Target size={10} className="inline mr-1" />Modo: Única</>}
          </span>
        </div>
        {puedeCrear && talleres.length > 0 && (
          <button
            onClick={() => setShowSolicitar(s => !s)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
          >
            <Plus size={13} />
            Solicitar a taller
          </button>
        )}
      </div>

      {/* Selector de modo de cotización */}
      {puedeEditar && (
        <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50/40">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Modo de cotización</p>
            {modoBloqueado && (
              <span className="text-[11px] text-amber-700 flex items-center gap-1">
                <AlertTriangle size={11} />
                Bloqueado — ya hay cotizaciones con líneas
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleTipoCotizacionChange('unica')}
              disabled={modoBloqueado || saving}
              className={`text-left p-3 rounded-lg border transition-colors ${
                tipoCotizacion === 'unica'
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              } ${modoBloqueado ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Target size={13} className={tipoCotizacion === 'unica' ? 'text-amber-700' : 'text-gray-400'} />
                <span className={`text-sm font-semibold ${tipoCotizacion === 'unica' ? 'text-amber-800' : 'text-gray-700'}`}>
                  Cotización Única
                </span>
              </div>
              <p className="text-xs text-gray-500 leading-snug">
                Se piden a varios talleres, se elige UNA ganadora y las demás quedan rechazadas. El total de la ganadora es el costo Pass.
              </p>
            </button>
            <button
              type="button"
              onClick={() => handleTipoCotizacionChange('multiple')}
              disabled={modoBloqueado || saving}
              className={`text-left p-3 rounded-lg border transition-colors ${
                tipoCotizacion === 'multiple'
                  ? 'border-purple-400 bg-purple-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              } ${modoBloqueado ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Layers size={13} className={tipoCotizacion === 'multiple' ? 'text-purple-700' : 'text-gray-400'} />
                <span className={`text-sm font-semibold ${tipoCotizacion === 'multiple' ? 'text-purple-800' : 'text-gray-700'}`}>
                  Cotización Múltiple
                </span>
              </div>
              <p className="text-xs text-gray-500 leading-snug">
                Se aprueban varias cotizaciones que se complementan (mano de obra + repuestos + polarizado, etc.). El costo Pass es la SUMA de todas las aprobadas.
              </p>
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      {/* Panel solicitar */}
      {showSolicitar && (
        <div className="border border-dashed border-red-200 bg-red-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Solicitudes a talleres</p>
            <p className="text-xs text-gray-500">El mismo taller puede aparecer con variantes distintas</p>
          </div>

          <div className="space-y-2">
            {solicitudes.map((s, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <select
                  value={s.taller_id}
                  onChange={e => setSolicitud(idx, 'taller_id', e.target.value)}
                  className="col-span-6 text-xs border border-red-200 bg-white rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-400"
                >
                  <option value="">Selecciona un taller...</option>
                  {talleres.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
                <input
                  type="text"
                  value={s.variante}
                  onChange={e => setSolicitud(idx, 'variante', e.target.value)}
                  placeholder="Variante (opcional: Original, Genérico…)"
                  className="col-span-5 text-xs border border-red-200 bg-white rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-400"
                />
                <button
                  onClick={() => removeSolicitudFila(idx)}
                  className="col-span-1 flex items-center justify-center h-full text-gray-400 hover:text-red-500 py-1.5"
                  title="Quitar fila"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              onClick={addSolicitudFila}
              className="flex items-center gap-1.5 text-xs text-red-600 hover:bg-red-100 px-2 py-1 rounded"
            >
              <Plus size={12} /> Agregar otro taller
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-red-100">
            <button onClick={() => { setShowSolicitar(false); setSolicitudes([{ ...SOLICITUD_VACIA }]) }} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
            <button
              onClick={handleSolicitar}
              disabled={!solicitudes.some(s => s.taller_id) || saving}
              className="text-xs px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
            >
              Solicitar ({solicitudes.filter(s => s.taller_id).length})
            </button>
          </div>
        </div>
      )}

      {cotizaciones.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">
          No hay cotizaciones. Solicita a uno o más talleres para comenzar.
        </p>
      )}

      {/* Tarjeta por cotización */}
      {cotizaciones.map((cot, idx) => {
        const nl       = newLineas[cot.id] ?? LINEA_VACIA
        const lineas   = cot.cotizacion_lineas ?? []
        // Solo se bloquea cuando está rechazada. Aprobada SÍ se puede editar
        // (los cambios sincronizan automáticamente siniestros.costo_pass vía trigger SQL).
        const bloqueada = cot.estado === 'rechazada'
        const editableAprobada = cot.estado === 'aprobada'
        const color = colorPorIndice(idx)

        return (
          <div
            key={cot.id}
            style={{ backgroundColor: color.bg, borderColor: cot.estado === 'aprobada' ? '#86efac' : color.border }}
            className={`border-2 rounded-xl overflow-hidden ${cot.estado === 'rechazada' ? 'opacity-60' : ''}`}
          >
            {/* Encabezado */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: `1px solid ${color.border}` }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold" style={{ color: color.textHeader }}>{cot.talleres?.nombre}</span>
                {cot.variante && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">
                    {cot.variante}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COT_COLORS[cot.estado]}`}>
                  {ESTADO_COT_LABELS[cot.estado]}
                </span>
              </div>
              {puedeEditar && !bloqueada && !editableAprobada && lineas.length > 0 && (
                <button
                  onClick={() => handleAprobar(cot.id, cot.taller_id)}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
                >
                  <Check size={12} />
                  Aprobar esta cotización
                </button>
              )}
              {editableAprobada && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-green-700 font-medium">✓ Cotización aprobada</span>
                  {esModoMultiple && puedeEditar && (
                    <button
                      onClick={() => handleQuitarAprobacion(cot.id)}
                      disabled={saving}
                      className="flex items-center gap-1 px-2 py-1 text-[11px] border border-gray-300 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-50"
                      title="Quitar aprobación — la suma del costo Pass se recalcula"
                    >
                      <RotateCcw size={10} />
                      Quitar aprobación
                    </button>
                  )}
                </div>
              )}
            </div>

            {editableAprobada && puedeEditar && (
              <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center gap-2 text-xs text-amber-700">
                <AlertTriangle size={12} />
                <span>Esta cotización está aprobada. Si modificas las líneas, el costo Pass se actualiza automáticamente.</span>
              </div>
            )}

            <div className="p-4 space-y-3">

              {/* Tabla de líneas */}
              {lineas.length > 0 && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-100">
                      <th className="pb-1.5 font-medium">Tipo</th>
                      <th className="pb-1.5 font-medium">Descripción</th>
                      <th className="pb-1.5 font-medium text-right">Cant.</th>
                      <th className="pb-1.5 font-medium text-right">P. Unit.</th>
                      <th className="pb-1.5 font-medium text-right">Subtotal</th>
                      {!bloqueada && <th className="pb-1.5 w-5" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {lineas.map(l => (
                      <tr key={l.id}>
                        <td className="py-1.5 pr-2 text-gray-500">{TIPO_LABELS[l.tipo]}</td>
                        <td className="py-1.5 pr-2 text-gray-700">{l.descripcion}</td>
                        <td className="py-1.5 pr-2 text-right text-gray-600">{l.cantidad}</td>
                        <td className="py-1.5 pr-2 text-right text-gray-600">{fmt(l.precio_unitario)}</td>
                        <td className="py-1.5 text-right font-medium text-gray-800">{fmt(l.subtotal)}</td>
                        {!bloqueada && puedeEliminar && (
                          <td className="py-1.5 pl-2">
                            <button
                              onClick={() => handleDeleteLinea(l.id)}
                              className="text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Totales */}
              {lineas.length > 0 && (
                <div className="space-y-1 text-xs border-t border-gray-100 pt-2">
                  <div className="flex justify-between text-gray-500">
                    <span>Repuestos</span><span>{fmt(cot.total_repuestos)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Mano de obra</span><span>{fmt(cot.total_mano_obra)}</span>
                  </div>
                  {Number(cot.total_otros) > 0 && (
                    <div className="flex justify-between text-gray-500">
                      <span>Otros</span><span>{fmt(cot.total_otros)}</span>
                    </div>
                  )}
                  {Number(cot.total_descuentos) !== 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Descuentos</span><span>{fmt(cot.total_descuentos)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-sm text-gray-900 border-t border-gray-200 pt-1.5 mt-1">
                    <span>Total</span><span>{fmt(cot.total_general)}</span>
                  </div>
                </div>
              )}

              {/* Agregar línea */}
              {!bloqueada && puedeCrear && (
                <div className="border-t border-dashed border-gray-200 pt-3">
                  <p className="text-xs text-gray-400 mb-2 font-medium">+ Agregar línea</p>
                  <div className="grid grid-cols-12 gap-1.5 items-center">
                    <select
                      value={nl.tipo}
                      onChange={e => setNl(cot.id, 'tipo', e.target.value)}
                      className="col-span-2 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-400 bg-white"
                    >
                      {TIPOS_LINEA_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <input
                      value={nl.descripcion}
                      onChange={e => setNl(cot.id, 'descripcion', e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddLinea(cot.id)}
                      placeholder="Descripción del ítem"
                      className="col-span-5 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-400"
                    />
                    <input
                      type="number"
                      value={nl.cantidad}
                      onChange={e => setNl(cot.id, 'cantidad', e.target.value)}
                      placeholder="Cant."
                      min="0.01"
                      step="0.01"
                      className="col-span-2 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-400 text-right"
                    />
                    <input
                      type="number"
                      value={nl.precio_unitario}
                      onChange={e => setNl(cot.id, 'precio_unitario', e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddLinea(cot.id)}
                      placeholder="Precio"
                      min="0"
                      step="0.01"
                      className="col-span-2 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-400 text-right"
                    />
                    <button
                      onClick={() => handleAddLinea(cot.id)}
                      disabled={!nl.descripcion.trim() || saving}
                      className="col-span-1 flex items-center justify-center h-full text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-40 py-1.5"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">Tip: presiona Enter en el precio para agregar rápido</p>
                </div>
              )}

              {/* Documentos de esta cotización */}
              <div className="mt-4 -mx-4 -mb-4 px-4 py-3 bg-gray-50/50 border-t border-gray-100">
                <DocumentosCotizacion
                  siniestro={siniestro}
                  cotizacionId={cot.id}
                  tallerNombre={cot.talleres?.nombre}
                />
              </div>
            </div>
          </div>
        )
      })}

      {/* Suma de aprobadas — solo modo múltiple */}
      {esModoMultiple && hayAprobada && (
        <div className="border border-purple-200 rounded-xl overflow-hidden">
          <div className="bg-purple-50 px-4 py-3 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-purple-800 flex items-center gap-1.5">
                <Layers size={14} />
                Suma de cotizaciones aprobadas
              </h4>
              <p className="text-xs text-purple-600 mt-0.5">
                {cotizaciones.filter(c => c.estado === 'aprobada').length} cotización(es) aprobada(s)
              </p>
            </div>
            <span className="text-lg font-bold text-purple-900">{fmt(sumaAprobadas)}</span>
          </div>
        </div>
      )}

      {/* Comparador lado a lado — solo modo única */}
      {!esModoMultiple && cotsConLineas.length >= 2 && (
        <div className="border border-blue-100 rounded-xl overflow-hidden">
          <div className="bg-blue-50 px-4 py-3">
            <h4 className="text-sm font-semibold text-blue-800">Comparador</h4>
            <p className="text-xs text-blue-500 mt-0.5">★ indica la opción más económica</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100">
                  <th className="px-4 py-3 text-xs text-gray-500 font-medium">Concepto</th>
                  {cotsConLineas.map(c => {
                    const idxOrig = cotizaciones.findIndex(x => x.id === c.id)
                    const colorCol = colorPorIndice(idxOrig)
                    const esMenor = Number(c.total_general) === minTotal
                    return (
                      <th
                        key={c.id}
                        style={!esMenor ? { backgroundColor: colorCol.bg, color: colorCol.textHeader } : undefined}
                        className={`px-4 py-3 text-xs font-semibold text-center ${esMenor ? 'text-green-700 bg-green-50' : ''}`}
                      >
                        <div>{c.talleres?.nombre}{esMenor && <span className="ml-1">★</span>}</div>
                        {c.variante && <div className="text-[10px] font-normal text-indigo-600 mt-0.5">{c.variante}</div>}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  { key: 'total_repuestos',  label: 'Repuestos',    color: '' },
                  { key: 'total_mano_obra',  label: 'Mano de obra', color: '' },
                  { key: 'total_otros',      label: 'Otros',        color: '' },
                  { key: 'total_descuentos', label: 'Descuentos',   color: 'text-red-600' },
                ].map(row => (
                  <tr key={row.key}>
                    <td className={`px-4 py-2 text-xs ${row.color || 'text-gray-500'}`}>{row.label}</td>
                    {cotsConLineas.map(c => (
                      <td key={c.id} className={`px-4 py-2 text-xs text-center ${row.color || 'text-gray-700'}`}>
                        {fmt(c[row.key])}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300">
                  <td className="px-4 py-3 text-sm font-bold text-gray-900">Total</td>
                  {cotsConLineas.map(c => {
                    const esMenor = Number(c.total_general) === minTotal
                    return (
                      <td
                        key={c.id}
                        className={`px-4 py-3 text-sm font-bold text-center ${esMenor ? 'text-green-700 bg-green-50' : 'text-gray-900'}`}
                      >
                        {fmt(c.total_general)}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// Wrapper para mostrar la sección de documentos específica a una cotización
function DocumentosCotizacion({ siniestro, cotizacionId, tallerNombre }) {
  return (
    <DocumentosSection
      origen="siniestro"
      origenId={siniestro.id}
      numero={`${siniestro.numero}-${(tallerNombre || 'COT').replace(/\s+/g, '_').toUpperCase()}`}
      cotizacionId={cotizacionId}
      tiposSugeridos={['cotizacion_pdf', 'otro']}
      titulo={`Documentos del taller${tallerNombre ? ` — ${tallerNombre}` : ''}`}
    />
  )
}
