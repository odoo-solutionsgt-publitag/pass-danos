import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const TIPO_LABELS = { repuesto: 'Repuesto', mano_obra: 'Mano de obra', otro: 'Otro' }

function fmt(n) {
  return `Q ${Number(n || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ProformaSection({ siniestro, onUpdate }) {
  const [cotizacion, setCotizacion] = useState(null)
  const [montoCliente, setMontoCliente] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { load() }, [siniestro.id])

  async function load() {
    const { data } = await supabase
      .from('cotizaciones')
      .select('*, talleres(nombre), cotizacion_lineas(*)')
      .eq('siniestro_id', siniestro.id)
      .eq('estado', 'aprobada')
      .maybeSingle()
    setCotizacion(data)
    setMontoCliente(siniestro.monto_cliente > 0 ? siniestro.monto_cliente : (data?.total_general ?? ''))
    setLoading(false)
  }

  async function handleSaveMonto() {
    setSaving(true); setSaved(false)
    const monto  = parseFloat(montoCliente) || 0
    const costo  = Number(cotizacion?.total_general) || 0
    const margen = monto - costo
    await supabase.from('siniestros').update({ monto_cliente: monto, costo_pass: costo, margen }).eq('id', siniestro.id)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onUpdate()
  }

  if (loading) return <p className="text-sm text-gray-400 py-2">Cargando proforma...</p>
  if (!cotizacion) return (
    <p className="text-sm text-gray-400 py-4 text-center">
      No hay cotización aprobada aún.
    </p>
  )

  const lineas = cotizacion.cotizacion_lineas ?? []
  const monto  = parseFloat(montoCliente) || 0
  const costo  = Number(cotizacion.total_general) || 0
  const margen = monto - costo

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-700">Proforma — {cotizacion.talleres?.nombre}</h4>
          <p className="text-xs text-gray-400 mt-0.5">Cotización aprobada</p>
        </div>
        <button
          onClick={() => window.print()}
          className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
        >
          Imprimir / PDF
        </button>
      </div>

      {/* Líneas */}
      <table className="w-full text-sm">
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

      {/* Subtotales de la cotización */}
      <div className="space-y-1 text-sm border-t border-gray-100 pt-3">
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
        <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-2 mt-1">
          <span>Costo taller (Pass paga)</span>
          <span>{fmt(cotizacion.total_general)}</span>
        </div>
      </div>

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
            className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 font-mono"
            placeholder="0.00"
          />
          <button
            onClick={handleSaveMonto}
            disabled={saving}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              saved ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
            } disabled:opacity-50`}
          >
            {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>

        {/* Resumen financiero */}
        <div className="grid grid-cols-3 gap-3 pt-1">
          <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
            <p className="text-xs text-gray-400 mb-1">Cliente paga</p>
            <p className="text-sm font-bold text-blue-700">{fmt(monto)}</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
            <p className="text-xs text-gray-400 mb-1">Pass paga</p>
            <p className="text-sm font-bold text-gray-700">{fmt(costo)}</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
            <p className="text-xs text-gray-400 mb-1">Margen</p>
            <p className={`text-sm font-bold ${margen >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {fmt(margen)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
