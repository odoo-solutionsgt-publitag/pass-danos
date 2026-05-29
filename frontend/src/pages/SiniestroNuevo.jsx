import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Search, FileText, Car, Building2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fetchVehiculos, fetchVehiculo, buscarContratos, fetchContratoById, syncBitacora } from '../lib/odoo-api'
import { useAuth } from '../hooks/useAuth'
import { usePermisos } from '../hooks/usePermisos'

const TIPOS_DANO = [
  { value: 'choque_frontal', label: 'Choque frontal' },
  { value: 'choque_trasero', label: 'Choque trasero' },
  { value: 'choque_lateral', label: 'Choque lateral' },
  { value: 'rayon', label: 'Rayón' },
  { value: 'abollon', label: 'Abollón' },
  { value: 'vidrio', label: 'Vidrio' },
  { value: 'llanta', label: 'Llanta' },
  { value: 'mecanico', label: 'Mecánico' },
  { value: 'multiple', label: 'Múltiple' },
  { value: 'otro', label: 'Otro' },
]

const SEVERIDADES = [
  { value: 'leve', label: 'Leve' },
  { value: 'medio', label: 'Medio' },
  { value: 'severo', label: 'Severo' },
  { value: 'perdida_total', label: 'Pérdida total' },
]

const STEPS = ['Vehículo', 'Cliente', 'Daño']

export default function SiniestroNuevo() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { puedeCrear, loading: permLoading } = usePermisos()

  useEffect(() => {
    if (!permLoading && !puedeCrear) {
      navigate('/siniestros', { replace: true })
    }
  }, [permLoading, puedeCrear, navigate])

  const [step, setStep] = useState(0)
  const [busquedaTipo, setBusquedaTipo] = useState('contrato')

  // Estado para búsqueda por contrato
  const [contratoQuery, setContratoQuery] = useState('')
  const [contratoResultados, setContratoResultados] = useState([])
  const [buscandoContrato, setBuscandoContrato] = useState(false)
  const [contratoSeleccionado, setContratoSeleccionado] = useState(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const contratoTimer = useRef(null)

  // Estado para búsqueda por placa
  const [vehiculos, setVehiculos] = useState([])
  const [placaQuery, setPlacaQuery] = useState('')
  const [placaSeleccionada, setPlacaSeleccionada] = useState(null)
  const [loadingVehiculos, setLoadingVehiculos] = useState(false)

  const [esInterno, setEsInterno] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [searchError, setSearchError] = useState('')

  const [form, setForm] = useState({
    placa: '',
    tipo_vehiculo: '',
    marca: '',
    linea: '',
    anio: null,
    odoo_product_id: null,
    contrato_id: null,
    contrato_numero: '',
    cliente_nombre: '',
    cliente_dpi: '',
    cliente_nit: '',
    cliente_telefono: '',
    cliente_email: '',
    fecha_dano: new Date().toISOString().slice(0, 10),
    lugar_accidente: '',
    tipo_dano: 'otro',
    severidad: 'leve',
    descripcion: '',
  })

  // Cargar lista de vehículos para la pestaña de placa
  useEffect(() => {
    setLoadingVehiculos(true)
    fetchVehiculos()
      .then(data => setVehiculos(data.vehiculos ?? []))
      .catch(console.error)
      .finally(() => setLoadingVehiculos(false))
  }, [])

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  // ── Cambio de pestaña ──────────────────────────────────────

  function handleTipoBusquedaChange(tipo) {
    setBusquedaTipo(tipo)
    setSearchError('')
    setContratoQuery('')
    setContratoResultados([])
    setContratoSeleccionado(null)
    setPlacaQuery('')
    setPlacaSeleccionada(null)
    setEsInterno(tipo === 'placa')
    setForm(f => ({
      ...f,
      placa: '',
      tipo_vehiculo: '',
      marca: '',
      linea: '',
      anio: null,
      odoo_product_id: null,
      contrato_id: null,
      contrato_numero: '',
      cliente_nombre: tipo === 'placa' ? 'Pass Rent a Car (Interno)' : '',
      cliente_dpi: '',
      cliente_nit: '',
      cliente_telefono: '',
      cliente_email: '',
    }))
  }

  // ── Búsqueda de contratos (debounced) ─────────────────────

  function handleContratoQueryChange(e) {
    const q = e.target.value.toUpperCase()
    setContratoQuery(q)
    setContratoSeleccionado(null)
    setSearchError('')
    clearTimeout(contratoTimer.current)

    if (q.length < 2) {
      setContratoResultados([])
      return
    }
    contratoTimer.current = setTimeout(async () => {
      setBuscandoContrato(true)
      try {
        const data = await buscarContratos(q)
        setContratoResultados(data.contratos ?? [])
        if (!data.contratos?.length) setSearchError(`No se encontró ningún contrato con "${q}"`)
      } catch (err) {
        setSearchError(err.message)
      } finally {
        setBuscandoContrato(false)
      }
    }, 400)
  }

  async function handleSelectContrato(contrato) {
    setContratoSeleccionado(contrato)
    setContratoResultados([])
    setContratoQuery(contrato.numero)
    setSearchError('')
    setCargandoDetalle(true)
    try {
      const data = await fetchContratoById(contrato.odoo_id)
      setForm(f => ({
        ...f,
        placa: data.vehiculo?.placa ?? '',
        tipo_vehiculo: data.vehiculo?.tipo_vehiculo ?? '',
        marca: data.vehiculo?.marca ?? '',
        linea: data.vehiculo?.linea ?? '',
        anio: data.vehiculo?.anio ?? null,
        odoo_product_id: data.vehiculo?.odoo_id ?? null,
        contrato_id: data.contrato?.odoo_id ?? null,
        contrato_numero: data.contrato?.numero ?? '',
        cliente_nombre: data.cliente?.nombre ?? '',
        cliente_dpi: data.cliente?.dpi ?? '',
        cliente_nit: data.cliente?.nit ?? '',
        cliente_telefono: data.cliente?.telefono ?? '',
        cliente_email: data.cliente?.email ?? '',
      }))
    } catch (err) {
      setSearchError('Error cargando detalle: ' + err.message)
      setContratoSeleccionado(null)
    } finally {
      setCargandoDetalle(false)
    }
  }

  function limpiarContrato() {
    setContratoSeleccionado(null)
    setContratoQuery('')
    setContratoResultados([])
    setSearchError('')
    setForm(f => ({
      ...f,
      placa: '',
      tipo_vehiculo: '',
      marca: '',
      linea: '',
      anio: null,
      odoo_product_id: null,
      contrato_id: null,
      contrato_numero: '',
      cliente_nombre: '',
      cliente_dpi: '',
      cliente_nit: '',
      cliente_telefono: '',
      cliente_email: '',
    }))
  }

  // ── Selección de placa ─────────────────────────────────────

  const vehiculosFiltrados = placaQuery
    ? vehiculos.filter(v =>
        v.placa.includes(placaQuery.toUpperCase()) ||
        v.tipo_vehiculo.toLowerCase().includes(placaQuery.toLowerCase())
      )
    : vehiculos

  async function handleSelectPlaca(v) {
    setPlacaSeleccionada(v)
    setPlacaQuery(v.placa)
    try {
      const data = await fetchVehiculo(v.placa)
      setForm(f => ({
        ...f,
        placa: data.vehiculo.placa,
        tipo_vehiculo: data.vehiculo.tipo_vehiculo,
        marca: data.vehiculo.marca ?? '',
        linea: data.vehiculo.linea ?? '',
        anio: data.vehiculo.anio ?? null,
        odoo_product_id: data.vehiculo.odoo_id,
        contrato_id: null,
        contrato_numero: '',
        cliente_nombre: 'Pass Rent a Car (Interno)',
        cliente_dpi: '',
        cliente_telefono: '',
        cliente_email: '',
      }))
    } catch {
      setForm(f => ({
        ...f,
        placa: v.placa,
        tipo_vehiculo: v.tipo_vehiculo,
        marca: v.marca ?? '',
        linea: v.linea ?? '',
        anio: v.anio ?? null,
        odoo_product_id: v.odoo_id,
        contrato_id: null,
        contrato_numero: '',
        cliente_nombre: 'Pass Rent a Car (Interno)',
      }))
    }
  }

  function limpiarPlaca() {
    setPlacaSeleccionada(null)
    setPlacaQuery('')
    setForm(f => ({
      ...f,
      placa: '',
      tipo_vehiculo: '',
      marca: '',
      linea: '',
      anio: null,
      odoo_product_id: null,
      cliente_nombre: 'Pass Rent a Car (Interno)',
    }))
  }

  // ── Validación por paso ────────────────────────────────────

  const canProceedStep0 = busquedaTipo === 'contrato'
    ? (contratoSeleccionado !== null && !cargandoDetalle)
    : (placaSeleccionada !== null)

  // ── Submit ─────────────────────────────────────────────────

  async function handleSubmit() {
    setSaving(true)
    setError('')
    try {
      const { data, error: err } = await supabase.from('siniestros').insert({
        placa: form.placa.toUpperCase(),
        tipo_vehiculo: form.tipo_vehiculo,
        marca: form.marca,
        linea: form.linea,
        anio: form.anio,
        odoo_product_id: form.odoo_product_id,
        contrato_id: form.contrato_id,
        contrato_numero: form.contrato_numero,
        cliente_nombre: form.cliente_nombre,
        cliente_dpi: form.cliente_dpi,
        cliente_telefono: form.cliente_telefono,
        cliente_email: form.cliente_email,
        cliente_nit: form.cliente_nit,
        fecha_dano: form.fecha_dano,
        lugar_accidente: form.lugar_accidente,
        tipo_dano: form.tipo_dano,
        severidad: form.severidad,
        descripcion: form.descripcion,
        estado: 'registrado',
        registrado_por: user.id,
      }).select().single()

      if (err) throw err

      // Sincronizar URL de bitácora en Odoo (best-effort, no bloquea)
      syncBitacora({ placa: form.placa.toUpperCase(), odoo_product_id: form.odoo_product_id })
        .catch(e => console.warn('[syncBitacora]', e.message))

      navigate(`/siniestros/${data.id}`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/siniestros')} className="text-gray-400 hover:text-gray-700">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Registrar daño</h1>
          <p className="text-sm text-gray-500">Paso {step + 1} de 3: {STEPS[step]}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {STEPS.map((s, i) => (
          <div key={i} className={`flex-1 h-1.5 rounded-full ${i <= step ? 'bg-red-600' : 'bg-gray-200'}`} />
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">

        {/* ── PASO 0 — Vehículo ── */}
        {step === 0 && (
          <>
            <p className="text-sm font-medium text-gray-700">¿Cómo identificar el vehículo?</p>

            <div className="flex gap-2">
              <button
                onClick={() => handleTipoBusquedaChange('contrato')}
                className={`flex items-center gap-2 flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                  busquedaTipo === 'contrato'
                    ? 'bg-red-50 border-red-500 text-red-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <FileText size={16} />
                Por contrato
              </button>
              <button
                onClick={() => handleTipoBusquedaChange('placa')}
                className={`flex items-center gap-2 flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                  busquedaTipo === 'placa'
                    ? 'bg-red-50 border-red-500 text-red-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Car size={16} />
                Por placa (daño interno)
              </button>
            </div>

            {/* Búsqueda por contrato */}
            {busquedaTipo === 'contrato' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Buscar contrato</label>

                {!contratoSeleccionado ? (
                  <>
                    <div className="relative">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        value={contratoQuery}
                        onChange={handleContratoQueryChange}
                        placeholder="Escribe el número: 394, RSV-00394..."
                        className="w-full pl-9 pr-4 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 font-mono"
                        autoFocus
                      />
                      {buscandoContrato && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Buscando...</span>
                      )}
                    </div>

                    {contratoResultados.length > 0 && (
                      <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                        {contratoResultados.map(c => (
                          <button
                            key={c.odoo_id}
                            onClick={() => handleSelectContrato(c)}
                            className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-red-50 border-b border-gray-100 last:border-0 text-left"
                          >
                            <div>
                              <span className="font-semibold text-red-700 font-mono">{c.numero}</span>
                              <span className="text-gray-600 ml-3">{c.cliente_nombre}</span>
                            </div>
                            <span className="text-xs text-gray-400">
                              {c.fecha_orden ? new Date(c.fecha_orden).toLocaleDateString('es-GT') : ''}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {searchError && contratoQuery.length >= 2 && (
                      <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{searchError}</p>
                    )}
                  </>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1 text-sm">
                    {cargandoDetalle ? (
                      <p className="text-green-700 animate-pulse">Cargando datos del contrato...</p>
                    ) : (
                      <>
                        <div className="flex items-start justify-between">
                          <p className="font-semibold text-green-800">Contrato seleccionado</p>
                          <button onClick={limpiarContrato} className="text-green-600 hover:text-green-800">
                            <X size={16} />
                          </button>
                        </div>
                        <p className="text-green-700"><span className="font-medium">No. Contrato:</span> <span className="font-mono">{form.contrato_numero}</span></p>
                        {form.placa && <p className="text-green-700"><span className="font-medium">Vehículo:</span> {form.placa} — {form.tipo_vehiculo}</p>}
                        {form.cliente_nombre && <p className="text-green-700"><span className="font-medium">Cliente:</span> {form.cliente_nombre}</p>}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Búsqueda por placa */}
            {busquedaTipo === 'placa' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <Building2 size={15} className="shrink-0" />
                  Daño interno — se registrará como gasto de Pass Rent a Car
                </div>

                <label className="block text-sm font-medium text-gray-700">Buscar placa</label>

                {!placaSeleccionada ? (
                  <>
                    <div className="relative">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        value={placaQuery}
                        onChange={e => setPlacaQuery(e.target.value.toUpperCase())}
                        placeholder={loadingVehiculos ? 'Cargando vehículos...' : 'Escribe la placa: P-521, C-513...'}
                        disabled={loadingVehiculos}
                        className="w-full pl-9 pr-4 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 font-mono"
                        autoFocus
                      />
                    </div>

                    {placaQuery.length >= 2 && (
                      <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm max-h-48 overflow-y-auto">
                        {vehiculosFiltrados.length === 0 ? (
                          <p className="px-4 py-3 text-sm text-gray-400">No se encontraron vehículos con "{placaQuery}"</p>
                        ) : (
                          vehiculosFiltrados.map(v => (
                            <button
                              key={v.odoo_id}
                              onClick={() => handleSelectPlaca(v)}
                              className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-red-50 border-b border-gray-100 last:border-0 text-left"
                            >
                              <span className="font-semibold text-red-700 font-mono">{v.placa}</span>
                              <span className="text-gray-600 text-xs">{v.tipo_vehiculo}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1">
                    <div className="flex items-start justify-between">
                      <p className="font-semibold text-gray-800">Vehículo seleccionado</p>
                      <button onClick={limpiarPlaca} className="text-gray-500 hover:text-gray-700">
                        <X size={16} />
                      </button>
                    </div>
                    <p className="text-gray-700"><span className="font-medium">Placa:</span> <span className="font-mono">{form.placa}</span></p>
                    <p className="text-gray-700"><span className="font-medium">Tipo:</span> {form.tipo_vehiculo}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── PASO 1 — Cliente ── */}
        {step === 1 && (
          <>
            {esInterno && (
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <Building2 size={15} className="shrink-0" />
                Daño interno — responsabilidad de Pass Rent a Car
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {esInterno ? 'Responsable' : 'Nombre del cliente *'}
              </label>
              <input
                value={form.cliente_nombre}
                onChange={set('cliente_nombre')}
                readOnly={esInterno}
                className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 ${esInterno ? 'bg-gray-50 text-gray-500 cursor-default' : ''}`}
                placeholder="Nombre completo"
              />
            </div>

            {!esInterno && (
              <>
                <p className="text-xs text-gray-400 -mt-1">Datos sincronizados desde Odoo</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">DPI / Pasaporte</label>
                    <input value={form.cliente_dpi} readOnly
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600 cursor-default"
                      placeholder="—" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">NIT</label>
                    <input value={form.cliente_nit} readOnly
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600 cursor-default"
                      placeholder="—" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Teléfono</label>
                    <input value={form.cliente_telefono} readOnly
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600 cursor-default"
                      placeholder="—" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Correo electrónico</label>
                    <input value={form.cliente_email} readOnly
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600 cursor-default"
                      placeholder="—" />
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── PASO 2 — Daño ── */}
        {step === 2 && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Fecha del daño *</label>
                <input type="date" value={form.fecha_dano} onChange={set('fecha_dano')}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Lugar</label>
                <input value={form.lugar_accidente} onChange={set('lugar_accidente')}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                  placeholder="Zona 10, Guatemala" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo de daño *</label>
                <select value={form.tipo_dano} onChange={set('tipo_dano')}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500">
                  {TIPOS_DANO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Severidad *</label>
                <select value={form.severidad} onChange={set('severidad')}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500">
                  {SEVERIDADES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Descripción del daño</label>
              <textarea value={form.descripcion} onChange={set('descripcion')} rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 resize-none"
                placeholder="Describa el daño con detalle..." />
            </div>
          </>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => step > 0 ? setStep(s => s - 1) : navigate('/siniestros')}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <ArrowLeft size={16} />
          {step === 0 ? 'Cancelar' : 'Anterior'}
        </button>

        {step < 2 ? (
          <button
            onClick={() => setStep(s => s + 1)}
            disabled={step === 0 && !canProceedStep0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Siguiente
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={saving || !form.fecha_dano}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Guardando...' : <><Check size={16} />Registrar daño</>}
          </button>
        )}
      </div>
    </div>
  )
}
