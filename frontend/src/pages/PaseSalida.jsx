import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ClipboardList, Printer, CheckCircle2, XCircle, Loader2, AlertCircle, Plus, Car } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { imprimirPasePDF } from '../lib/pase-pdf'
import { fetchVehiculos, updateVehiculoStatus } from '../lib/odoo-api'
import { usePermisos } from '../hooks/usePermisos'
import { useAuth } from '../hooks/useAuth'

// ─── Constantes ────────────────────────────────────────────────────────────────

const MOTIVO_LABELS = {
  taller_reparacion: 'Taller x Reparación',
  taller_servicio:   'Taller x Servicio',
  gasolinera:        'Gasolinera',
  diligencias:       'Diligencias adm.',
  asignado_personal: 'Asignado al personal',
}

// Motivos disponibles para pases independientes
const MOTIVOS_INDEPENDIENTE = [
  { value: 'gasolinera',        label: 'Gasolinera',                 desc: 'Llenar tanque de combustible' },
  { value: 'diligencias',       label: 'Diligencias administrativas', desc: 'Trámites o gestiones externas' },
  { value: 'asignado_personal', label: 'Asignado al personal',       desc: 'Uso por tiempo indeterminado' },
]

// Estatus Odoo que se asigna al crear según motivo
const MOTIVO_STATUS_ODOO = {
  gasolinera:        'Servicios Varios',
  diligencias:       'Servicios Varios',
  asignado_personal: 'Asignado al personal',
}

const ESTADO_BADGE = {
  abierto:  'bg-amber-100 text-amber-700 border-amber-200',
  cerrado:  'bg-green-100 text-green-700 border-green-200',
  anulado:  'bg-gray-100 text-gray-500 border-gray-200',
}

const ESTADO_LABEL = { abierto: 'Abierto', cerrado: 'Cerrado', anulado: 'Anulado' }

const COMBUSTIBLES = ['Full', '7/8', '6/8', '5/8', '1/2', '3/8', '1/8']

const FORM_INIT = {
  placaBusqueda: '',
  vehiculo: null,          // { odoo_id, placa, tipo_vehiculo, marca, linea, anio, color }
  referencia: '',
  motivo: 'gasolinera',
  lugar: '',
  piloto: '',
  combustible: 'Full',
  km: '',
  cambiarStatusOdoo: false,
}

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
  const { puedeCrear, puedeEditar } = usePermisos()
  const { perfil } = useAuth()

  // ── Lista principal ───────────────────────────────────────────────────────
  const [pases, setPases]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [busqueda, setBusqueda]         = useState('')
  const [filtroEstado, setFiltroEstado] = useState('activos')
  const [error, setError]               = useState('')
  const [printLoading, setPrintLoading] = useState(null)

  // ── Cierre de pase ────────────────────────────────────────────────────────
  const [cierrePase, setCierrePase]     = useState(null)
  const [cierre, setCierre]             = useState({ combustible_entrada: 'Full', kilometraje_entrada: '' })
  const [saving, setSaving]             = useState(false)

  // ── Nuevo pase independiente ──────────────────────────────────────────────
  const [showNuevo, setShowNuevo]       = useState(false)
  const [form, setForm]                 = useState(FORM_INIT)
  const [sugerencias, setSugerencias]   = useState([])
  const [busquedaLoading, setBusquedaLoading] = useState(false)
  const [savingNuevo, setSavingNuevo]   = useState(false)
  const [errorNuevo, setErrorNuevo]     = useState('')
  const debounceRef                     = useRef(null)

  useEffect(() => { loadPases() }, [filtroEstado])

  async function loadPases() {
    setLoading(true)
    let q = supabase
      .from('pases_salida')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300)

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

  // ── Búsqueda de placa para nuevo pase ────────────────────────────────────

  function onPlacaChange(val) {
    setForm(f => ({ ...f, placaBusqueda: val, vehiculo: null }))
    setSugerencias([])
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.length < 2) return
    debounceRef.current = setTimeout(() => buscarPlaca(val), 350)
  }

  async function buscarPlaca(placa) {
    setBusquedaLoading(true)
    try {
      const data = await fetchVehiculos({ placa, limit: 8 })
      setSugerencias(data.vehiculos ?? [])
    } catch {
      setSugerencias([])
    } finally {
      setBusquedaLoading(false)
    }
  }

  function seleccionarVehiculo(v) {
    setForm(f => ({
      ...f,
      placaBusqueda: v.placa,
      vehiculo: v,
    }))
    setSugerencias([])
  }

  // ── Crear pase independiente ──────────────────────────────────────────────

  async function crearPaseIndependiente() {
    if (!form.vehiculo) { setErrorNuevo('Selecciona un vehículo.'); return }
    if (!form.piloto.trim()) { setErrorNuevo('El nombre del piloto es requerido.'); return }
    if (!form.lugar.trim()) { setErrorNuevo('El lugar de destino es requerido.'); return }

    setSavingNuevo(true); setErrorNuevo('')
    try {
      const { fecha, hora } = now_gt()
      const v = form.vehiculo

      const payload = {
        contrato_referencia:  form.referencia.trim() || null,
        vehiculo_placa:       v.placa,
        vehiculo_tipo:        [v.tipo_vehiculo, v.marca, v.linea, v.anio].filter(Boolean).join(' '),
        vehiculo_color:       v.color || '',
        odoo_product_id:      v.odoo_id,
        motivo_salida:        form.motivo,
        lugar_taller:         form.lugar.trim(),
        piloto_pass:          form.piloto.trim(),
        combustible_salida:   form.combustible,
        kilometraje_salida:   form.km ? Number(form.km) : null,
        fecha_salida:         fecha,
        hora_salida:          hora,
        usuario_responsable:  perfil?.nombre_completo || '',
        estado:               'abierto',
        cambio_status_odoo:   form.cambiarStatusOdoo,
        // sin siniestro_id ni orden_servicio_id → pase independiente
      }

      const { data: paseData, error: dbErr } = await supabase
        .from('pases_salida')
        .insert(payload)
        .select()
        .single()

      if (dbErr) throw dbErr

      // Cambiar estatus en Odoo si el usuario lo indicó
      if (form.cambiarStatusOdoo && v.odoo_id) {
        const nuevoStatus = MOTIVO_STATUS_ODOO[form.motivo]
        if (nuevoStatus) {
          try {
            await updateVehiculoStatus(v.odoo_id, nuevoStatus)
          } catch {
            // No bloquear — el pase ya se creó
          }
        }
      }

      setShowNuevo(false)
      setForm(FORM_INIT)
      setSugerencias([])

      // Imprimir automáticamente
      try { await imprimirPasePDF(paseData) } catch { /* no bloquear */ }

      loadPases()
    } catch (e) {
      setErrorNuevo(e.message)
    } finally {
      setSavingNuevo(false)
    }
  }

  // ── Cierre de pase ────────────────────────────────────────────────────────

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

      // Si se cambió el estatus Odoo al crear, revertirlo a Disponible
      if (cierrePase.cambio_status_odoo && cierrePase.odoo_product_id) {
        try {
          await updateVehiculoStatus(cierrePase.odoo_product_id, 'Disponible')
        } catch {
          // No bloquear el cierre si Odoo falla
        }
      }

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
    // standalone → sin navegación
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
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{pasesFiltrados.length} registro{pasesFiltrados.length !== 1 ? 's' : ''}</span>
          {puedeCrear && (
            <button
              onClick={() => { setShowNuevo(true); setErrorNuevo(''); setForm(FORM_INIT); setSugerencias([]) }}
              className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-2 rounded-lg"
            >
              <Plus size={13} />
              Nuevo Pase
            </button>
          )}
        </div>
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
          <button onClick={() => setError('')} className="ml-auto"><XCircle size={13} /></button>
        </div>
      )}

      {/* ── Modal Nuevo Pase Independiente ──────────────────────────────────── */}
      {showNuevo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Nuevo Pase de Salida</h3>
              <button onClick={() => setShowNuevo(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle size={16} />
              </button>
            </div>

            {/* Buscar placa */}
            <div className="relative">
              <label className="block text-xs text-gray-500 mb-1">
                Placa del vehículo <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Car size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={form.placaBusqueda}
                  onChange={e => onPlacaChange(e.target.value.toUpperCase())}
                  placeholder="Ej: P-091LCM"
                  className="w-full pl-8 pr-3 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-red-400"
                  autoFocus
                />
                {busquedaLoading && (
                  <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
                )}
              </div>
              {/* Dropdown de sugerencias */}
              {sugerencias.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {sugerencias.map(v => (
                    <button
                      key={v.odoo_id}
                      onClick={() => seleccionarVehiculo(v)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 border-b border-gray-50 last:border-0"
                    >
                      <span className="font-mono font-semibold text-gray-800">{v.placa}</span>
                      <span className="ml-2 text-gray-500">{v.tipo_vehiculo} {v.marca} {v.linea} {v.anio}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Datos del vehículo seleccionado */}
            {form.vehiculo && (
              <div className="bg-gray-50 rounded-lg px-3 py-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div><span className="text-gray-400">Tipo: </span><span className="font-medium text-gray-700">{form.vehiculo.tipo_vehiculo || '—'}</span></div>
                <div><span className="text-gray-400">Marca: </span><span className="font-medium text-gray-700">{form.vehiculo.marca || '—'}</span></div>
                <div><span className="text-gray-400">Línea: </span><span className="font-medium text-gray-700">{form.vehiculo.linea || '—'}</span></div>
                <div><span className="text-gray-400">Año: </span><span className="font-medium text-gray-700">{form.vehiculo.anio || '—'}</span></div>
                {form.vehiculo.color && (
                  <div className="col-span-2"><span className="text-gray-400">Color: </span><span className="font-medium text-gray-700">{form.vehiculo.color}</span></div>
                )}
              </div>
            )}

            {/* No. Referencia */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">No. Referencia <span className="text-gray-300">(opcional)</span></label>
              <input
                type="text"
                value={form.referencia}
                onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))}
                placeholder="Ej: RSV-00403, CTR-2026-001…"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-red-400"
              />
            </div>

            {/* Motivo */}
            <div>
              <label className="block text-xs text-gray-500 mb-2">Motivo de salida <span className="text-red-500">*</span></label>
              <div className="space-y-1.5">
                {MOTIVOS_INDEPENDIENTE.map(m => (
                  <label key={m.value} className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer text-xs transition-colors ${
                    form.motivo === m.value
                      ? 'bg-red-50 border-red-300 text-red-800'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                    <input
                      type="radio"
                      name="motivo"
                      value={m.value}
                      checked={form.motivo === m.value}
                      onChange={() => setForm(f => ({ ...f, motivo: m.value }))}
                      className="mt-0.5 accent-red-600"
                    />
                    <div>
                      <div className="font-medium">{m.label}</div>
                      <div className="text-gray-400 text-[11px]">{m.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Lugar */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Lugar de destino <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.lugar}
                onChange={e => setForm(f => ({ ...f, lugar: e.target.value }))}
                placeholder="Ej: Gasolinera Shell zona 10"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-red-400"
              />
            </div>

            {/* Piloto */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nombre del piloto <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.piloto}
                onChange={e => setForm(f => ({ ...f, piloto: e.target.value }))}
                placeholder="Ej: Juan Pérez"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-red-400"
              />
            </div>

            {/* Combustible + Km */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-2">Combustible al salir</label>
                <div className="flex flex-wrap gap-1">
                  {COMBUSTIBLES.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, combustible: c }))}
                      className={`text-xs px-2.5 py-1 rounded border font-medium ${
                        form.combustible === c
                          ? 'bg-red-50 border-red-300 text-red-700'
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
                  value={form.km}
                  onChange={e => setForm(f => ({ ...f, km: e.target.value }))}
                  placeholder="Ej: 45200"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-red-400"
                />
              </div>
            </div>

            {/* Toggle cambiar estatus Odoo */}
            <div className="border border-gray-100 rounded-lg p-3 bg-gray-50">
              <p className="text-xs font-medium text-gray-700 mb-2">¿Cambiar estatus del vehículo en Odoo?</p>
              <div className="flex gap-3">
                <label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs cursor-pointer font-medium ${
                  !form.cambiarStatusOdoo ? 'bg-white border-gray-300 text-gray-700' : 'border-gray-200 text-gray-400'
                }`}>
                  <input type="radio" name="odoo_status" checked={!form.cambiarStatusOdoo}
                    onChange={() => setForm(f => ({ ...f, cambiarStatusOdoo: false }))}
                    className="accent-gray-500" />
                  No
                </label>
                <label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs cursor-pointer font-medium ${
                  form.cambiarStatusOdoo ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-gray-200 text-gray-400'
                }`}>
                  <input type="radio" name="odoo_status" checked={form.cambiarStatusOdoo}
                    onChange={() => setForm(f => ({ ...f, cambiarStatusOdoo: true }))}
                    className="accent-amber-600" />
                  Sí
                </label>
                {form.cambiarStatusOdoo && form.motivo && (
                  <span className="text-xs text-amber-600 flex items-center">
                    → <strong className="ml-1">{MOTIVO_STATUS_ODOO[form.motivo]}</strong>
                    <span className="text-gray-400 ml-1">(se revierte al cerrar)</span>
                  </span>
                )}
              </div>
            </div>

            {errorNuevo && (
              <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle size={12} />{errorNuevo}</p>
            )}

            {/* Acciones */}
            <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
              <button
                onClick={() => { setShowNuevo(false); setForm(FORM_INIT); setSugerencias([]) }}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded"
              >
                Cancelar
              </button>
              <button
                onClick={crearPaseIndependiente}
                disabled={savingNuevo}
                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 rounded disabled:opacity-50"
              >
                {savingNuevo ? <Loader2 size={12} className="animate-spin" /> : <Printer size={12} />}
                {savingNuevo ? 'Generando…' : 'Generar e imprimir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de cierre ──────────────────────────────────────────────────── */}
      {cierrePase && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-semibold text-gray-800">Cerrar pase {cierrePase.numero}</h3>
            <p className="text-xs text-gray-500">
              Placa: <strong>{cierrePase.vehiculo_placa}</strong> · Piloto: <strong>{cierrePase.piloto_pass}</strong>
            </p>
            {cierrePase.cambio_status_odoo && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded px-2.5 py-1.5">
                Al confirmar, el vehículo volverá a estatus <strong>Disponible</strong> en Odoo.
              </p>
            )}

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

            {error && <p className="text-xs text-red-600">{error}</p>}

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

      {/* ── Tabla ───────────────────────────────────────────────────────────── */}
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
                      {p.siniestro_id || p.orden_servicio_id ? (
                        <button
                          onClick={() => irAlOrigen(p)}
                          className="text-xs text-blue-600 hover:underline font-medium"
                        >
                          {p.contrato_referencia}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 italic">
                          {p.contrato_referencia || 'Independiente'}
                        </span>
                      )}
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
