import { useState, useEffect } from 'react'
import { Plus, Trash2, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import DocumentosSection from './DocumentosSection'

const TIPO_LABELS = { repuesto: 'Repuesto', mano_obra: 'Mano de obra', otro: 'Otro' }

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

const LINEA_VACIA = { tipo: 'repuesto', descripcion: '', cantidad: '1', precio_unitario: '' }

export default function CotizacionesSection({ siniestro, onUpdate }) {
  const [cotizaciones, setCotizaciones] = useState([])
  const [talleres, setTalleres]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [showSolicitar, setShowSolicitar] = useState(false)
  const [selectedTalleres, setSelectedTalleres] = useState([])
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
    if (!selectedTalleres.length) return
    setSaving(true); setError('')
    try {
      const inserts = selectedTalleres.map(taller_id => ({
        siniestro_id: siniestro.id,
        taller_id,
        estado: 'solicitada',
        fecha_solicitud: new Date().toISOString().slice(0, 10),
      }))
      const { error: err } = await supabase.from('cotizaciones').insert(inserts)
      if (err) throw err
      setShowSolicitar(false)
      setSelectedTalleres([])
      await loadAll()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
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
      const cot = cotizaciones.find(c => c.id === cotId)
      const otrosIds = cotizaciones.filter(c => c.id !== cotId).map(c => c.id)

      await supabase.from('cotizaciones').update({ estado: 'aprobada' }).eq('id', cotId)
      if (otrosIds.length) {
        await supabase.from('cotizaciones').update({ estado: 'rechazada' }).in('id', otrosIds)
      }
      await supabase.from('siniestros').update({
        estado:        'proforma_emitida',
        taller_id:     tallerId,
        costo_pass:    cot?.total_general ?? 0,
      }).eq('id', siniestro.id)

      await loadAll()
      onUpdate()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  // ── Render ────────────────────────────────────────────────

  if (loading) return <p className="text-sm text-gray-400 py-2">Cargando cotizaciones...</p>

  const talleresConCot    = cotizaciones.map(c => c.taller_id)
  const talleresLibres    = talleres.filter(t => !talleresConCot.includes(t.id))
  const hayAprobada       = cotizaciones.some(c => c.estado === 'aprobada')
  const cotsConLineas     = cotizaciones.filter(c => (c.cotizacion_lineas ?? []).length > 0)
  const minTotal          = cotsConLineas.length > 1
    ? Math.min(...cotsConLineas.map(c => Number(c.total_general) || 0))
    : null

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">Cotizaciones</h4>
        {!hayAprobada && cotizaciones.length < 3 && talleresLibres.length > 0 && (
          <button
            onClick={() => setShowSolicitar(s => !s)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
          >
            <Plus size={13} />
            Solicitar a taller
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      {/* Panel solicitar */}
      {showSolicitar && (
        <div className="border border-dashed border-red-200 bg-red-50 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">¿A qué taller solicitar cotización?</p>
          <div className="space-y-1.5">
            {talleresLibres.map(t => (
              <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer hover:text-red-700">
                <input
                  type="checkbox"
                  className="rounded accent-red-600"
                  checked={selectedTalleres.includes(t.id)}
                  onChange={e =>
                    setSelectedTalleres(prev =>
                      e.target.checked ? [...prev, t.id] : prev.filter(id => id !== t.id)
                    )
                  }
                />
                {t.nombre}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowSolicitar(false)} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
            <button
              onClick={handleSolicitar}
              disabled={!selectedTalleres.length || saving}
              className="text-xs px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
            >
              Solicitar {selectedTalleres.length > 0 && `(${selectedTalleres.length})`}
            </button>
          </div>
        </div>
      )}

      {cotizaciones.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">
          No hay cotizaciones. Solicita a 1-3 talleres para comenzar.
        </p>
      )}

      {/* Tarjeta por cotización */}
      {cotizaciones.map(cot => {
        const nl       = newLineas[cot.id] ?? LINEA_VACIA
        const lineas   = cot.cotizacion_lineas ?? []
        const bloqueada = cot.estado === 'aprobada' || cot.estado === 'rechazada'

        return (
          <div
            key={cot.id}
            className={`border rounded-xl overflow-hidden ${
              cot.estado === 'aprobada' ? 'border-green-300' :
              cot.estado === 'rechazada' ? 'border-gray-200 opacity-60' :
              'border-gray-200'
            }`}
          >
            {/* Encabezado */}
            <div className={`flex items-center justify-between px-4 py-3 ${cot.estado === 'aprobada' ? 'bg-green-50' : 'bg-gray-50'}`}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800">{cot.talleres?.nombre}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COT_COLORS[cot.estado]}`}>
                  {ESTADO_COT_LABELS[cot.estado]}
                </span>
              </div>
              {!bloqueada && lineas.length > 0 && (
                <button
                  onClick={() => handleAprobar(cot.id, cot.taller_id)}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
                >
                  <Check size={12} />
                  Aprobar esta cotización
                </button>
              )}
              {cot.estado === 'aprobada' && (
                <span className="text-xs text-green-700 font-medium">✓ Cotización aprobada</span>
              )}
            </div>

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
                        {!bloqueada && (
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
                  <div className="flex justify-between font-bold text-sm text-gray-900 border-t border-gray-200 pt-1.5 mt-1">
                    <span>Total</span><span>{fmt(cot.total_general)}</span>
                  </div>
                </div>
              )}

              {/* Agregar línea */}
              {!bloqueada && (
                <div className="border-t border-dashed border-gray-200 pt-3">
                  <p className="text-xs text-gray-400 mb-2 font-medium">+ Agregar línea</p>
                  <div className="grid grid-cols-12 gap-1.5 items-center">
                    <select
                      value={nl.tipo}
                      onChange={e => setNl(cot.id, 'tipo', e.target.value)}
                      className="col-span-2 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-400 bg-white"
                    >
                      <option value="repuesto">Repuesto</option>
                      <option value="mano_obra">M. obra</option>
                      <option value="otro">Otro</option>
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

      {/* Comparador lado a lado */}
      {cotsConLineas.length >= 2 && (
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
                    const esMenor = Number(c.total_general) === minTotal
                    return (
                      <th
                        key={c.id}
                        className={`px-4 py-3 text-xs font-semibold text-center ${esMenor ? 'text-green-700 bg-green-50' : 'text-gray-700'}`}
                      >
                        {c.talleres?.nombre}
                        {esMenor && <span className="ml-1">★</span>}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  { key: 'total_repuestos', label: 'Repuestos' },
                  { key: 'total_mano_obra', label: 'Mano de obra' },
                  { key: 'total_otros', label: 'Otros' },
                ].map(row => (
                  <tr key={row.key}>
                    <td className="px-4 py-2 text-xs text-gray-500">{row.label}</td>
                    {cotsConLineas.map(c => (
                      <td key={c.id} className="px-4 py-2 text-xs text-center text-gray-700">
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
