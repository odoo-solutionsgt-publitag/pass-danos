import { useState, useEffect } from 'react'
import { Printer, ClipboardList, AlertCircle, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { imprimirPasePDF } from '../lib/pase-pdf'
import { fetchVehiculo } from '../lib/odoo-api'
import { usePermisos } from '../hooks/usePermisos'

// ─── Constantes ────────────────────────────────────────────────────────────────

const MOTIVO_LABELS = {
  taller_reparacion: 'Taller x Reparación',
  taller_servicio:   'Taller x Servicio',
  gasolinera:        'Gasolinera',
  diligencias:       'Diligencias adm.',
  asignado_personal: 'Asignado al personal',
}

const COMBUSTIBLES = ['Full', '7/8', '6/8', '5/8', '1/2', '3/8', '1/8']

const ESTADO_BADGE = {
  abierto:  'bg-amber-100 text-amber-700 border-amber-200',
  cerrado:  'bg-green-100 text-green-700 border-green-200',
  anulado:  'bg-gray-100 text-gray-500 border-gray-200',
}

const ESTADO_LABEL = { abierto: 'Abierto', cerrado: 'Cerrado', anulado: 'Anulado' }

function now_gt() {
  const d = new Date()
  const gt = new Date(d.toLocaleString('en-US', { timeZone: 'America/Guatemala' }))
  const hh = String(gt.getHours()).padStart(2, '0')
  const mm = String(gt.getMinutes()).padStart(2, '0')
  return {
    fecha: gt.toISOString().slice(0, 10),
    hora:  `${hh}:${mm}`,
  }
}

// ─── Componente principal ──────────────────────────────────────────────────────

/**
 * Props:
 *  - siniestro / servicio: objeto origen { id, numero, placa, odoo_product_id, vehiculo_tipo, vehiculo_color }
 *  - userName: nombre del usuario autenticado
 *  - motivoPreset: string enum — motivo pre-seleccionado del contexto (no se muestra en form)
 *  - tallerNombre: nombre del taller ya asignado al registro (pre-llena lugar_taller)
 *  - kmInicial: kilometraje actual del vehículo (pre-llena kilometraje_salida)
 */
export default function PaseSalidaSection({
  siniestro,
  servicio,
  userName = '',
  motivoPreset = null,
  tallerNombre = '',
  kmInicial = null,
}) {
  const { puedeCrear, puedeEditar } = usePermisos()

  const origen = siniestro ?? servicio
  const esDano  = !!siniestro

  const [pase, setPase]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [showCierre, setShowCierre] = useState(false)
  const [piloto, setPiloto]         = useState('')
  const [combustible, setCombustible] = useState('Full')
  const [cierre, setCierre]         = useState({ combustible_entrada: 'Full', kilometraje_entrada: '' })
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [printLoading, setPrintLoading] = useState(false)

  useEffect(() => { loadPase() }, [origen?.id])

  async function loadPase() {
    if (!origen?.id) return
    setLoading(true)
    const col = esDano ? 'siniestro_id' : 'orden_servicio_id'
    const { data } = await supabase
      .from('pases_salida')
      .select('*')
      .eq(col, origen.id)
      .neq('estado', 'anulado')
      .maybeSingle()
    setPase(data ?? null)
    setLoading(false)
  }

  // ── Crear nuevo pase ──────────────────────────────────────────────────────

  async function crearPase() {
    if (!piloto.trim()) { setError('El nombre del piloto es requerido.'); return }
    setSaving(true); setError('')
    try {
      const { fecha, hora } = now_gt()

      // Obtener color del vehículo desde Odoo (best-effort)
      let vehiculoColor = origen.vehiculo_color || ''
      if (!vehiculoColor && origen.placa) {
        try {
          const vData = await fetchVehiculo(origen.placa)
          vehiculoColor = vData.vehiculo?.color || ''
        } catch {
          // Color no crítico — continuar sin él
        }
      }

      const payload = {
        ...(esDano
          ? { siniestro_id: origen.id }
          : { orden_servicio_id: origen.id }),
        contrato_referencia: origen.numero,
        vehiculo_placa:      origen.placa,
        vehiculo_tipo:       origen.vehiculo_tipo  ?? '',
        vehiculo_color:      vehiculoColor,
        odoo_product_id:     origen.odoo_product_id ?? null,
        motivo_salida:       motivoPreset ?? (esDano ? 'taller_reparacion' : 'taller_servicio'),
        lugar_taller:        tallerNombre || null,
        piloto_pass:         piloto.trim(),
        combustible_salida:  combustible,
        kilometraje_salida:  kmInicial != null ? Number(kmInicial) : null,
        fecha_salida:        fecha,
        hora_salida:         hora,
        usuario_responsable: userName || origen.registrado_por_nombre || '',
        estado:              'abierto',
      }

      const { data, error: dbErr } = await supabase
        .from('pases_salida')
        .insert(payload)
        .select()
        .single()

      if (dbErr) throw dbErr

      setPase(data)
      setShowForm(false)
      setPiloto('')
      setCombustible('Full')

      // Imprimir automáticamente al crear
      await imprimirPase(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Cerrar pase ───────────────────────────────────────────────────────────

  async function cerrarPase() {
    if (!pase) return
    setSaving(true); setError('')
    try {
      const { fecha, hora } = now_gt()
      const { data, error: dbErr } = await supabase
        .from('pases_salida')
        .update({
          estado:              'cerrado',
          combustible_entrada: cierre.combustible_entrada,
          kilometraje_entrada: cierre.kilometraje_entrada ? Number(cierre.kilometraje_entrada) : null,
          fecha_entrada:       fecha,
          hora_entrada:        hora,
        })
        .eq('id', pase.id)
        .select()
        .single()

      if (dbErr) throw dbErr

      setPase(data)
      setShowCierre(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Anular pase ───────────────────────────────────────────────────────────

  async function anularPase() {
    if (!pase) return
    if (!window.confirm('¿Anular este pase de salida? Esta acción no se puede revertir.')) return
    setSaving(true); setError('')
    try {
      const { error: dbErr } = await supabase
        .from('pases_salida')
        .update({ estado: 'anulado' })
        .eq('id', pase.id)
      if (dbErr) throw dbErr
      setPase(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Imprimir PDF ──────────────────────────────────────────────────────────

  async function imprimirPase(p = pase) {
    if (!p) return
    setPrintLoading(true)
    try {
      await imprimirPasePDF(p)
    } catch (e) {
      setError(`No se pudo generar el PDF: ${e.message}`)
    } finally {
      setPrintLoading(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ClipboardList size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-800">Pase de Salida Interno</h3>
        </div>
        {pase && (
          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${ESTADO_BADGE[pase.estado]}`}>
            {ESTADO_LABEL[pase.estado]}
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded mb-3 flex items-center gap-2">
          <AlertCircle size={13} />{error}
        </div>
      )}

      {/* Cargando */}
      {loading && (
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" />Cargando…
        </p>
      )}

      {/* Sin pase activo → botón crear */}
      {!loading && !pase && !showForm && (
        <div className="text-center py-3">
          <p className="text-xs text-gray-400 mb-3">No hay pase de salida para este registro.</p>
          {puedeCrear && (
            <button
              onClick={() => { setShowForm(true); setError('') }}
              className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 rounded"
            >
              <Printer size={13} />
              Generar Pase de Salida
            </button>
          )}
        </div>
      )}

      {/* Formulario simplificado: solo Piloto + Combustible */}
      {showForm && (
        <div className="space-y-4">
          {/* Contexto (read-only, informativo) */}
          {(motivoPreset || tallerNombre || kmInicial != null) && (
            <div className="bg-gray-50 rounded-lg px-3 py-2.5 flex flex-wrap gap-4 text-xs text-gray-500">
              {motivoPreset && (
                <span>
                  <span className="text-gray-400">Motivo: </span>
                  <span className="font-medium text-gray-700">{MOTIVO_LABELS[motivoPreset] ?? motivoPreset}</span>
                </span>
              )}
              {tallerNombre && (
                <span>
                  <span className="text-gray-400">Destino: </span>
                  <span className="font-medium text-gray-700">{tallerNombre}</span>
                </span>
              )}
              {kmInicial != null && (
                <span>
                  <span className="text-gray-400">Km salida: </span>
                  <span className="font-medium text-gray-700">{Number(kmInicial).toLocaleString()}</span>
                </span>
              )}
            </div>
          )}

          {/* Piloto */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Nombre del piloto <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={piloto}
              onChange={e => setPiloto(e.target.value)}
              placeholder="Ej: Juan Pérez"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-red-400"
              autoFocus
            />
          </div>

          {/* Combustible */}
          <div>
            <label className="block text-xs text-gray-500 mb-2">Combustible al salir</label>
            <div className="flex flex-wrap gap-1.5">
              {COMBUSTIBLES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCombustible(c)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${
                    combustible === c
                      ? 'bg-red-50 border-red-300 text-red-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Acciones */}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={() => { setShowForm(false); setPiloto(''); setError('') }}
              className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded"
            >
              Cancelar
            </button>
            <button
              onClick={crearPase}
              disabled={saving}
              className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 rounded disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Printer size={12} />}
              {saving ? 'Generando…' : 'Generar e imprimir'}
            </button>
          </div>
        </div>
      )}

      {/* Pase existente */}
      {!loading && pase && !showForm && (
        <div className="space-y-3">
          {/* Resumen */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-gray-400">No. Pase</p>
              <p className="font-semibold text-gray-800">{pase.numero}</p>
            </div>
            <div>
              <p className="text-gray-400">Piloto</p>
              <p className="font-medium text-gray-700">{pase.piloto_pass}</p>
            </div>
            <div>
              <p className="text-gray-400">Motivo</p>
              <p className="font-medium text-gray-700">
                {MOTIVO_LABELS[pase.motivo_salida] ?? pase.motivo_salida}
              </p>
            </div>
            <div>
              <p className="text-gray-400">Combustible salida</p>
              <p className="font-medium text-gray-700">{pase.combustible_salida}</p>
            </div>
            {pase.kilometraje_salida != null && (
              <div>
                <p className="text-gray-400">Km salida</p>
                <p className="font-medium text-gray-700">{Number(pase.kilometraje_salida).toLocaleString()}</p>
              </div>
            )}
            <div>
              <p className="text-gray-400">Fecha / Hora salida</p>
              <p className="font-medium text-gray-700">{pase.fecha_salida} {pase.hora_salida}</p>
            </div>
            {pase.lugar_taller && (
              <div className="col-span-2">
                <p className="text-gray-400">Destino</p>
                <p className="font-medium text-gray-700">{pase.lugar_taller}</p>
              </div>
            )}
            {pase.estado === 'cerrado' && (
              <>
                <div>
                  <p className="text-gray-400">Combustible entrada</p>
                  <p className="font-medium text-gray-700">{pase.combustible_entrada}</p>
                </div>
                {pase.kilometraje_entrada != null && (
                  <div>
                    <p className="text-gray-400">Km entrada</p>
                    <p className="font-medium text-gray-700">{Number(pase.kilometraje_entrada).toLocaleString()}</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-400">Fecha / Hora entrada</p>
                  <p className="font-medium text-gray-700">{pase.fecha_entrada} {pase.hora_entrada}</p>
                </div>
              </>
            )}
          </div>

          {/* Formulario de cierre */}
          {showCierre && pase.estado === 'abierto' && (
            <div className="border border-gray-100 rounded-lg p-3 bg-gray-50 space-y-3">
              <p className="text-xs font-semibold text-gray-700">Datos de entrada del vehículo</p>
              <div className="grid grid-cols-2 gap-3">
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
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowCierre(false)}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded"
                >
                  Cancelar
                </button>
                <button
                  onClick={cerrarPase}
                  disabled={saving}
                  className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded disabled:opacity-50"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                  {saving ? 'Guardando…' : 'Confirmar entrada'}
                </button>
              </div>
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => imprimirPase()}
              disabled={printLoading}
              className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded"
            >
              {printLoading ? <Loader2 size={12} className="animate-spin" /> : <Printer size={12} />}
              {printLoading ? 'Generando PDF…' : 'Ver / Imprimir PDF'}
            </button>

            {puedeEditar && pase.estado === 'abierto' && !showCierre && (
              <button
                onClick={() => { setShowCierre(true); setError('') }}
                className="flex items-center gap-1.5 text-xs text-green-700 border border-green-200 hover:bg-green-50 px-3 py-1.5 rounded"
              >
                <CheckCircle2 size={12} />
                Cerrar pase
              </button>
            )}

            {puedeEditar && pase.estado === 'abierto' && (
              <button
                onClick={anularPase}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs text-red-500 border border-red-100 hover:bg-red-50 px-3 py-1.5 rounded"
              >
                <XCircle size={12} />
                Anular
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
