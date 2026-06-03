import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, CheckCircle2, Archive } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { colorPorIndice } from '../lib/colores'

const TIPO_LABELS = { repuesto: 'Repuesto', mano_obra: 'Mano de obra', otro: 'Otro', descuento: 'Descuento' }

const ESTADO_COT_COLORS = {
  solicitada: 'bg-gray-100 text-gray-600',
  recibida:   'bg-blue-100 text-blue-700',
  aprobada:   'bg-green-100 text-green-700',
  rechazada:  'bg-gray-200 text-gray-500',
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

export default function CotizacionesHistorico({ siniestro }) {
  const [cotizaciones, setCotizaciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  useEffect(() => { load() }, [siniestro.id])

  async function load() {
    const { data } = await supabase
      .from('cotizaciones')
      .select('*, talleres(nombre), cotizacion_lineas(*)')
      .eq('siniestro_id', siniestro.id)
      .order('created_at')
    setCotizaciones(data ?? [])
    setLoading(false)
  }

  if (loading) return null
  if (cotizaciones.length === 0) return null

  const esModoMultiple = siniestro.tipo_cotizacion === 'multiple'
  const cotsConLineas = cotizaciones.filter(c => (c.cotizacion_lineas ?? []).length > 0)
  // En modo múltiple no aplica la "más económica" — no hay competencia
  const minTotal = !esModoMultiple && cotsConLineas.length > 0
    ? Math.min(...cotsConLineas.map(c => Number(c.total_general) || 0))
    : null

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Archive size={16} className="text-gray-400" />
          <h3 className="font-semibold text-gray-800 text-sm">
            Cotizaciones que concursaron
            <span className="ml-2 text-xs font-normal text-gray-500">({cotizaciones.length})</span>
          </h3>
        </div>
        {open ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-500">
            Vista de solo lectura · <span className="text-green-700 font-medium">✓ Aprobada</span>
            {esModoMultiple
              ? <span className="ml-1">cada una suma al costo Pass (modo Múltiple)</span>
              : <span> es la elegida · <span className="ml-1">★ es la más económica</span></span>}
          </p>

          {/* Tarjetas readonly por cotización */}
          {cotizaciones.map((cot, idx) => {
            const lineas    = cot.cotizacion_lineas ?? []
            const aprobada  = cot.estado === 'aprobada'
            const esMenor   = Number(cot.total_general) === minTotal && lineas.length > 0
            const color     = colorPorIndice(idx)

            return (
              <div
                key={cot.id}
                style={{
                  backgroundColor: color.bg,
                  borderColor: aprobada ? '#86efac' : color.border,
                }}
                className={`border-2 rounded-xl overflow-hidden ${cot.estado === 'rechazada' && !esMenor ? 'opacity-70' : ''}`}
              >
                {/* Encabezado */}
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: `1px solid ${color.border}` }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold" style={{ color: color.textHeader }}>
                      {cot.talleres?.nombre}
                    </span>
                    {cot.variante && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">
                        {cot.variante}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${ESTADO_COT_COLORS[cot.estado]}`}>
                      {aprobada && <CheckCircle2 size={11} />}
                      {ESTADO_COT_LABELS[cot.estado]}
                    </span>
                    {esMenor && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-800" title="Cotización más económica">
                        ★ Más económica
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-bold" style={{ color: color.textHeader }}>
                    {fmt(cot.total_general)}
                  </span>
                </div>

                {/* Tabla de líneas (readonly) */}
                {lineas.length > 0 ? (
                  <div className="p-4 space-y-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-200/60">
                          <th className="pb-1.5 font-medium">Tipo</th>
                          <th className="pb-1.5 font-medium">Descripción</th>
                          <th className="pb-1.5 font-medium text-right">Cant.</th>
                          <th className="pb-1.5 font-medium text-right">P. Unit.</th>
                          <th className="pb-1.5 font-medium text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200/40">
                        {lineas.map(l => (
                          <tr key={l.id}>
                            <td className="py-1.5 pr-2 text-gray-600">{TIPO_LABELS[l.tipo]}</td>
                            <td className="py-1.5 pr-2 text-gray-700">{l.descripcion}</td>
                            <td className="py-1.5 pr-2 text-right text-gray-600">{l.cantidad}</td>
                            <td className="py-1.5 pr-2 text-right text-gray-600">{fmt(l.precio_unitario)}</td>
                            <td className="py-1.5 text-right font-medium text-gray-800">{fmt(l.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Subtotales */}
                    <div className="space-y-1 text-xs border-t border-gray-200/60 pt-2">
                      <div className="flex justify-between text-gray-600">
                        <span>Repuestos</span><span>{fmt(cot.total_repuestos)}</span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>Mano de obra</span><span>{fmt(cot.total_mano_obra)}</span>
                      </div>
                      {Number(cot.total_otros) > 0 && (
                        <div className="flex justify-between text-gray-600">
                          <span>Otros</span><span>{fmt(cot.total_otros)}</span>
                        </div>
                      )}
                      {Number(cot.total_descuentos) !== 0 && (
                        <div className="flex justify-between text-red-700">
                          <span>Descuentos</span><span>{fmt(cot.total_descuentos)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-sm text-gray-900 border-t border-gray-300/60 pt-1.5 mt-1">
                        <span>Total</span><span>{fmt(cot.total_general)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="px-4 py-4 text-xs text-gray-500 italic">Sin líneas registradas</p>
                )}
              </div>
            )
          })}

          {/* Comparador lado a lado — solo modo única */}
          {!esModoMultiple && cotsConLineas.length >= 2 && (
            <div className="border border-blue-100 rounded-xl overflow-hidden mt-4">
              <div className="bg-blue-50 px-4 py-3">
                <h4 className="text-sm font-semibold text-blue-800">Comparador</h4>
                <p className="text-xs text-blue-500 mt-0.5">★ más económica · ✓ aprobada</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-gray-100">
                      <th className="px-4 py-3 text-xs text-gray-500 font-medium">Concepto</th>
                      {cotsConLineas.map(c => {
                        const idxOrig  = cotizaciones.findIndex(x => x.id === c.id)
                        const colorCol = colorPorIndice(idxOrig)
                        const esMenor  = Number(c.total_general) === minTotal
                        const aprobada = c.estado === 'aprobada'
                        return (
                          <th
                            key={c.id}
                            style={!esMenor ? { backgroundColor: colorCol.bg, color: colorCol.textHeader } : undefined}
                            className={`px-4 py-3 text-xs font-semibold text-center ${esMenor ? 'text-green-700 bg-green-50' : ''}`}
                          >
                            <div className="flex items-center justify-center gap-1">
                              {aprobada && <CheckCircle2 size={12} className="text-green-600" />}
                              <span>{c.talleres?.nombre}</span>
                              {esMenor && <span>★</span>}
                            </div>
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
      )}
    </div>
  )
}
