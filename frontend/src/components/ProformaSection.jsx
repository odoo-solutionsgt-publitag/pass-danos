import { useState, useEffect } from 'react'
import { Layers, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import DocumentosSection from './DocumentosSection'
import { usePermisos } from '../hooks/usePermisos'
import { formatDateTime as fmtDateTimeLib } from '../lib/fecha'

const TIPO_LABELS = { repuesto: 'Repuesto', mano_obra: 'Mano de obra', otro: 'Otro', descuento: 'Descuento' }

function fmt(n) {
  return `Q ${Number(n || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ProformaSection({ siniestro, onUpdate }) {
  const { puedeEditar } = usePermisos()
  const [aprobadas, setAprobadas] = useState([])
  const [montoCliente, setMontoCliente] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expandidas, setExpandidas] = useState({})  // { [cotId]: true/false } para modo múltiple

  const esModoMultiple = siniestro.tipo_cotizacion === 'multiple'

  useEffect(() => { load() }, [siniestro.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('cotizaciones')
      .select('*, talleres(nombre), cotizacion_lineas(*)')
      .eq('siniestro_id', siniestro.id)
      .eq('estado', 'aprobada')
      .order('created_at')

    setAprobadas(data ?? [])
    const totalSum = (data ?? []).reduce((acc, c) => acc + (Number(c.total_general) || 0), 0)
    setMontoCliente(siniestro.monto_cliente > 0 ? siniestro.monto_cliente : (totalSum || ''))
    setLoading(false)
  }

  const totalCostoPass = aprobadas.reduce((acc, c) => acc + (Number(c.total_general) || 0), 0)

  async function handleSaveMonto() {
    setSaving(true); setSaved(false)
    const monto  = parseFloat(montoCliente) || 0
    const margen = monto - totalCostoPass
    await supabase.from('siniestros').update({ monto_cliente: monto, margen }).eq('id', siniestro.id)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onUpdate()
  }

  function toggleExpand(cotId) {
    setExpandidas(prev => ({ ...prev, [cotId]: !prev[cotId] }))
  }

  if (loading) return <p className="text-sm text-gray-400 py-2">Cargando proforma...</p>
  if (aprobadas.length === 0) return (
    <p className="text-sm text-gray-400 py-4 text-center">
      No hay cotización aprobada aún.
    </p>
  )

  const monto  = parseFloat(montoCliente) || 0
  const margen = monto - totalCostoPass

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-gray-700">
              {esModoMultiple
                ? `Proforma combinada — ${aprobadas.length} cotizaciones aprobadas`
                : `Proforma — ${aprobadas[0]?.talleres?.nombre}`}
            </h4>
            {esModoMultiple && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700 flex items-center gap-1">
                <Layers size={10} /> Múltiple
              </span>
            )}
            {!esModoMultiple && aprobadas[0]?.variante && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">
                {aprobadas[0].variante}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {esModoMultiple
              ? 'Suma de todas las cotizaciones aprobadas'
              : (
                <>
                  Cotización aprobada
                  {aprobadas[0]?.updated_at && (
                    <span> · Última edición: {fmtDateTimeLib(aprobadas[0].updated_at)}</span>
                  )}
                </>
              )}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
        >
          Imprimir / PDF
        </button>
      </div>

      {/* ── Modo único: render actual con una sola cotización ────────── */}
      {!esModoMultiple && (
        <CotizacionDetalle cotizacion={aprobadas[0]} />
      )}

      {/* ── Modo múltiple: lista colapsable de aprobadas + gran total ── */}
      {esModoMultiple && (
        <div className="space-y-2">
          {aprobadas.map(cot => {
            const abierta = expandidas[cot.id] !== false  // por defecto abierta
            return (
              <div key={cot.id} className="border border-purple-100 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleExpand(cot.id)}
                  className="w-full bg-purple-50/60 hover:bg-purple-50 px-4 py-2.5 flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {abierta ? <ChevronUp size={14} className="text-purple-700" /> : <ChevronDown size={14} className="text-purple-700" />}
                    <span className="text-sm font-semibold text-gray-800">{cot.talleres?.nombre}</span>
                    {cot.variante && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">
                        {cot.variante}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-bold text-purple-900">{fmt(cot.total_general)}</span>
                </button>

                {abierta && (
                  <div className="p-4 bg-white">
                    <CotizacionDetalle cotizacion={cot} compact />
                  </div>
                )}
              </div>
            )
          })}

          {/* Gran total */}
          <div className="border-2 border-purple-300 bg-purple-50 rounded-xl px-4 py-3 flex items-center justify-between mt-3">
            <span className="text-sm font-bold text-purple-900">
              GRAN TOTAL (Costo Pass) — Suma de {aprobadas.length} cotización(es)
            </span>
            <span className="text-lg font-bold text-purple-900">{fmt(totalCostoPass)}</span>
          </div>
        </div>
      )}

      {/* Monto a cobrar al cliente */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-blue-800">Monto a cobrar al cliente</p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 shrink-0">Q</span>
          <input
            type="number"
            value={montoCliente}
            onChange={e => setMontoCliente(e.target.value)}
            min="0"
            step="0.01"
            readOnly={!puedeEditar}
            className={`flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 font-mono ${!puedeEditar ? 'bg-gray-50 cursor-not-allowed' : ''}`}
            placeholder="0.00"
          />
          {puedeEditar && (
            <button
              onClick={handleSaveMonto}
              disabled={saving}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                saved ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
              } disabled:opacity-50`}
            >
              {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar'}
            </button>
          )}
        </div>

        {/* Resumen financiero */}
        <div className="grid grid-cols-3 gap-3 pt-1">
          <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
            <p className="text-xs text-gray-400 mb-1">Cliente paga</p>
            <p className="text-sm font-bold text-blue-700">{fmt(monto)}</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
            <p className="text-xs text-gray-400 mb-1">Pass paga</p>
            <p className="text-sm font-bold text-gray-700">{fmt(totalCostoPass)}</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
            <p className="text-xs text-gray-400 mb-1">Margen</p>
            <p className={`text-sm font-bold ${margen >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {fmt(margen)}
            </p>
          </div>
        </div>
      </div>

      {/* Documentos asociados a la proforma */}
      <div className="border-t border-gray-100 pt-4">
        <DocumentosSection
          origen="siniestro"
          origenId={siniestro.id}
          numero={`${siniestro.numero}-PROFORMA`}
          cotizacionId={esModoMultiple ? null : aprobadas[0]?.id}
          tiposSugeridos={['proforma_pdf', 'factura', 'comprobante_pago', 'avaluo', 'otro']}
          titulo="Documentos de la proforma"
        />
      </div>
    </div>
  )
}

/**
 * Renderiza el detalle de una cotización (líneas + subtotales).
 * Reutilizable para modo único y para cada aprobada en modo múltiple.
 */
function CotizacionDetalle({ cotizacion, compact = false }) {
  const lineas = cotizacion.cotizacion_lineas ?? []
  return (
    <>
      <table className={`w-full ${compact ? 'text-xs' : 'text-sm'}`}>
        <thead>
          <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
            <th className="pb-2 font-medium">Tipo</th>
            <th className="pb-2 font-medium">Descripción</th>
            <th className="pb-2 font-medium text-right">Cant.</th>
            <th className="pb-2 font-medium text-right">P. Unit.</th>
            <th className="pb-2 font-medium text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {lineas.map(l => (
            <tr key={l.id}>
              <td className="py-2 pr-2 text-xs text-gray-500">{TIPO_LABELS[l.tipo]}</td>
              <td className="py-2 pr-2 text-gray-700">{l.descripcion}</td>
              <td className="py-2 pr-2 text-right text-gray-600">{l.cantidad}</td>
              <td className="py-2 pr-2 text-right text-gray-600">{fmt(l.precio_unitario)}</td>
              <td className="py-2 text-right font-medium text-gray-800">{fmt(l.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={`space-y-1 ${compact ? 'text-xs' : 'text-sm'} border-t border-gray-100 pt-3 mt-2`}>
        <div className="flex justify-between text-gray-500">
          <span>Repuestos</span><span>{fmt(cotizacion.total_repuestos)}</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>Mano de obra</span><span>{fmt(cotizacion.total_mano_obra)}</span>
        </div>
        {Number(cotizacion.total_otros) > 0 && (
          <div className="flex justify-between text-gray-500">
            <span>Otros</span><span>{fmt(cotizacion.total_otros)}</span>
          </div>
        )}
        {Number(cotizacion.total_descuentos) !== 0 && (
          <div className="flex justify-between text-red-600">
            <span>Descuentos</span><span>{fmt(cotizacion.total_descuentos)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-2 mt-1">
          <span>Costo taller</span>
          <span>{fmt(cotizacion.total_general)}</span>
        </div>
      </div>
    </>
  )
}
