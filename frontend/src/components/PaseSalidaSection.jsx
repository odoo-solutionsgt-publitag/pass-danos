import { useState, useEffect } from 'react'
import { Printer, ClipboardList, AlertCircle, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { imprimirPasePDF } from '../lib/pase-pdf'
import { usePermisos } from '../hooks/usePermisos'

// ─── Constantes de UI ──────────────────────────────────────────────────────────

const MOTIVOS = [
  { value: 'taller_reparacion', label: 'Taller x Reparación' },
  { value: 'taller_servicio',   label: 'Taller x Servicio'   },
  { value: 'gasolinera',        label: 'Gasolinera'           },
  { value: 'diligencias',       label: 'Diligencias adm.'    },
  { value: 'asignado_personal', label: 'Asignado al personal' },
]

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

// ─── Formulario nuevo pase ─────────────────────────────────────────────────────

const FORM_VACIO = {
  piloto_pass:        '',
  motivo_salida:      'taller_reparacion',
  lugar_taller:       '',
  combustible_salida: 'Full',
  kilometraje_salida: '',
}

// ─── Componente principal ──────────────────────────────────────────────────────

/**
 * Props:
 *  - siniestro: objeto del daño  { id, numero, placa, odoo_product_id, vehiculo_tipo, vehiculo_color, registrado_por_nombre }
 *    O bien:
 *  - servicio:  objeto del servicio { id, numero, placa, odoo_product_id, vehiculo_tipo, vehiculo_color, registrado_por_nombre }
 *  - userName:  nombre del usuario autenticado (para usuario_responsable)
 */
export default function PaseSalidaSection({ siniestro, servicio, userName = '' }) {
  const { puedeCrear, puedeEditar } = usePermisos()

  const origen = siniestro ?? servicio
  const esDano  = !!siniestro

  const [pase, setPase]           = useState(null)   // pase activo (o null)
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [showCierre, setShowCierre] = useState(false)
  const [form, setForm]           = useState({ ...FORM_VACIO })
  const [cierre, setCierre]       = useState({ combustible_entrada: 'Full', kilometraje_entrada: '' })
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
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
    if (!form.piloto_pass.trim()) { setError('El nombre del piloto es requerido.'); return }
    if (!form.motivo_salida)      { setError('Selecciona un motivo de salida.');    return }
    setSaving(true); setError('')
    try {
      const { fecha, hora } = now_gt()
      const payload = {
        ...(esDano
          ? { siniestro_id: origen.id }
          : { orden_servicio_id: origen.id }),
        contrato_referencia: origen.numero,
        vehiculo_placa:      origen.placa,
        vehiculo_tipo:       origen.vehiculo_tipo  ?? '',
        vehiculo_color:      origen.vehiculo_color ?? '',
        odoo_product_id:     origen.odoo_product_id ?? null,
        motivo_salida:       form.motivo_salida,
        lugar_taller:        form.lugar_taller.trim() || null,
        piloto_pass:         form.piloto_pass.trim(),
        combustible_salida:  form.combustible_salida,
        kilometraje_salida:  form.kilometraje_salida ? Number(form.kilometraje_salida) : null,
        fecha_salida:        fecha,
        hora_salida:         hora,
        usuario_responsable: userName || origen.registrado_por_nombre || '',
        estado:              'abierto',
        // numero lo genera el trigger
      }

      const { data, error: dbErr } = await supabase
        .from('pases_salida')
        .insert(payload)
        .select()
        .single()

      if (dbErr) throw dbErr

      setPase(data)
      setShowForm(false)
      setForm({ ...FORM_VACIO })

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

      {/* Estado: cargando */}
      {loading && (
        <p className="text-xs text-gray-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />Cargando…</p>
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

      {/* Formulario de creación */}
      {showForm && (
        <div className="space-y-4">
          {/* Piloto */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nombre del piloto <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.piloto_pass}
              onChange={e => setForm(f => ({ ...f, piloto_pass: e.target.value }))}
              placeholder="Ej: Juan Pérez"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-red-400"
            />
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-xs text-gray-500 mb-2">Motivo de salida <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {MOTIVOS.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, motivo_salida: m.value }))}
                  className={`text-xs px-2 py-2 rounded-lg border text-left leading-tight ${
                    form.motivo_salida === m.value
                      ? 'bg-red-50 border-red-300 text-red-700 font-medium'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lugar/Taller */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Lugar / Taller de destino</label>
            <input
              type="text"
              value={form.lugar_taller}
              onChange={e => setForm(f => ({ ...f, lugar_taller: e.target.value }))}
              placeholder="Ej: REASA Zona 12"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-red-400"
            />
          </div>

          {/* Combustible + Km */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-2">Combustible al salir</label>
              <div className="flex flex-wrap gap-1">
                {COMBUSTIBLES.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, combustible_salida: c }))}
                    className={`text-xs px-2 py-1 rounded border ${
                      form.combustible_salida === c
                        ? 'bg-red-50 border-red-300 text-red-700 font-medium'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Kilometraje al salir</label>
              <input
                type="number"
                value={form.kilometraje_salida}
                onChange={e => setForm(f => ({ ...f, kilometraje_salida: e.target.value }))}
                placeholder="Ej: 45200"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-red-400"
              />
            </div>
          </div>

          {/* Acciones */}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={() => { setShowForm(false); setError('') }}
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
          {/* Resumen del pase */}
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
                {MOTIVOS.find(m => m.value === pase.motivo_salida)?.label ?? pase.motivo_salida}
              </p>
            </div>
            <div>
              <p className="text-gray-400">Combustible salida</p>
              <p className="font-medium text-gray-700">{pase.combustible_salida}</p>
            </div>
            <div>
              <p className="text-gray-400">Km salida</p>
              <p className="font-medium text-gray-700">{pase.kilometraje_salida ?? '—'}</p>
            </div>
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
                <div>
                  <p className="text-gray-400">Km entrada</p>
                  <p className="font-medium text-gray-700">{pase.kilometraje_entrada ?? '—'}</p>
                </div>
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
                <button onClick={() => setShowCierre(false)} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded">
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
            {/* Re-imprimir */}
            <button
              onClick={() => imprimirPase()}
              disabled={printLoading}
              className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded"
            >
              {printLoading ? <Loader2 size={12} className="animate-spin" /> : <Printer size={12} />}
              {printLoading ? 'Generando PDF…' : 'Ver / Imprimir PDF'}
            </button>

            {/* Cerrar pase */}
            {puedeEditar && pase.estado === 'abierto' && !showCierre && (
              <button
                onClick={() => { setShowCierre(true); setError('') }}
                className="flex items-center gap-1.5 text-xs text-green-700 border border-green-200 hover:bg-green-50 px-3 py-1.5 rounded"
              >
                <CheckCircle2 size={12} />
                Cerrar pase
              </button>
            )}

            {/* Anular */}
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
