import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Search, FileText, Car, Building2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fetchVehiculos, fetchVehiculo, fetchContrato } from '../lib/odoo-api'
import { useAuth } from '../hooks/useAuth'

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
  const [step, setStep] = useState(0)
  const [busquedaTipo, setBusquedaTipo] = useState('contrato')
  const [vehiculos, setVehiculos] = useState([])
  const [loadingVehiculos, setLoadingVehiculos] = useState(false)
  const [contratoInput, setContratoInput] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [vehiculoInfo, setVehiculoInfo] = useState(null)
  const [contratoInfo, setContratoInfo] = useState(null)
  const [esInterno, setEsInterno] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [searchError, setSearchError] = useState('')

  const [form, setForm] = useState({
    placa: '',
    tipo_vehiculo: '',
    odoo_product_id: null,
    contrato_id: null,
    contrato_numero: '',
    cliente_nombre: '',
    cliente_dpi: '',
    cliente_telefono: '',
    cliente_email: '',
    fecha_dano: new Date().toISOString().slice(0, 10),
    lugar_accidente: '',
    tipo_dano: 'otro',
    severidad: 'leve',
    descripcion: '',
  })

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

  function handleTipoBusquedaChange(tipo) {
    setBusquedaTipo(tipo)
    setSearchError('')
    setVehiculoInfo(null)
    setContratoInfo(null)
    setEsInterno(tipo === 'placa')
    setContratoInput('')
    setForm(f => ({
      ...f,
      placa: '',
      tipo_vehiculo: '',
      odoo_product_id: null,
      contrato_id: null,
      contrato_numero: '',
      cliente_nombre: tipo === 'placa' ? 'Pass Rent a Car (Interno)' : '',
      cliente_dpi: '',
      cliente_telefono: '',
      cliente_email: '',
    }))
  }

  async function buscarContrato() {
    if (!contratoInput.trim()) return
    setBuscando(true)
    setSearchError('')
    setVehiculoInfo(null)
    setContratoInfo(null)
    try {
      const data = await fetchContrato(contratoInput.trim())
      setContratoInfo(data.contrato)
      setVehiculoInfo(data.vehiculo)
      setForm(f => ({
        ...f,
        placa: data.vehiculo?.placa ?? '',
        tipo_vehiculo: data.vehiculo?.tipo_vehiculo ?? '',
        odoo_product_id: data.vehiculo?.odoo_id ?? null,
        contrato_id: data.contrato?.odoo_id ?? null,
        contrato_numero: data.contrato?.contrato_numero ?? data.contrato?.numero ?? '',
        cliente_nombre: data.cliente?.nombre ?? '',
        cliente_dpi: data.cliente?.dpi ?? '',
        cliente_telefono: data.cliente?.telefono ?? '',
        cliente_email: data.cliente?.email ?? '',
      }))
    } catch (err) {
      setSearchError(err.message)
    } finally {
      setBuscando(false)
    }
  }

  async function handlePlacaChange(placa) {
    setForm(f => ({ ...f, placa }))
    setVehiculoInfo(null)
    if (!placa) return
    try {
      const data = await fetchVehiculo(placa)
      setVehiculoInfo(data.vehiculo)
      setForm(f => ({
        ...f,
        placa: data.vehiculo.placa,
        tipo_vehiculo: data.vehiculo.tipo_vehiculo,
        odoo_product_id: data.vehiculo.odoo_id,
        contrato_id: null,
        contrato_numero: '',
        cliente_nombre: 'Pass Rent a Car (Interno)',
        cliente_dpi: '',
        cliente_telefono: '',
        cliente_email: '',
      }))
    } catch {
      // vehículo sin datos adicionales
    }
  }

  const canProceedStep0 = busquedaTipo === 'contrato'
    ? vehiculoInfo !== null
    : form.placa !== ''

  async function handleSubmit() {
    setSaving(true)
    setError('')
    try {
      const { data, error: err } = await supabase.from('siniestros').insert({
        placa: form.placa.toUpperCase(),
        tipo_vehiculo: form.tipo_vehiculo,
        odoo_product_id: form.odoo_product_id,
        contrato_id: form.contrato_id,
        contrato_numero: form.contrato_numero,
        cliente_nombre: form.cliente_nombre,
        cliente_dpi: form.cliente_dpi,
        cliente_telefono: form.cliente_telefono,
        cliente_email: form.cliente_email,
        fecha_dano: form.fecha_dano,
        lugar_accidente: form.lugar_accidente,
        tipo_dano: form.tipo_dano,
        severidad: form.severidad,
        descripcion: form.descripcion,
        estado: 'registrado',
        registrado_por: user.id,
      }).select().single()

      if (err) throw err
      navigate(`/siniestros/${data.id}`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

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

        {/* PASO 0 — Vehículo */}
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

            {busquedaTipo === 'contrato' ? (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">No. de contrato</label>
                <div className="flex gap-2">
                  <input
                    value={contratoInput}
                    onChange={e => setContratoInput(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && buscarContrato()}
                    placeholder="RSV-00394 o CTO-00006"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 font-mono"
                  />
                  <button
                    onClick={buscarContrato}
                    disabled={buscando || !contratoInput.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Search size={15} />
                    {buscando ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>

                {searchError && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{searchError}</p>
                )}

                {vehiculoInfo && contratoInfo && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1 text-sm">
                    <p className="font-semibold text-green-800">Contrato encontrado</p>
                    <p className="text-green-700"><span className="font-medium">Contrato:</span> {contratoInfo.contrato_numero || contratoInfo.numero}</p>
                    <p className="text-green-700"><span className="font-medium">Vehículo:</span> {vehiculoInfo.placa} — {vehiculoInfo.tipo_vehiculo}</p>
                    <p className="text-green-700 truncate"><span className="font-medium">Descripción:</span> {vehiculoInfo.nombre}</p>
                    {form.cliente_nombre && (
                      <p className="text-green-700"><span className="font-medium">Cliente:</span> {form.cliente_nombre}</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <Building2 size={15} className="shrink-0" />
                  Daño interno — se registrará como gasto de Pass Rent a Car
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Placa del vehículo</label>
                  <select
                    value={form.placa}
                    onChange={e => handlePlacaChange(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                  >
                    <option value="">{loadingVehiculos ? 'Cargando vehículos...' : 'Seleccionar placa'}</option>
                    {vehiculos.map(v => (
                      <option key={v.odoo_id} value={v.placa}>{v.placa} — {v.tipo_vehiculo}</option>
                    ))}
                  </select>
                </div>

                {vehiculoInfo && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600 space-y-1">
                    <p><span className="font-medium">Tipo:</span> {vehiculoInfo.tipo_vehiculo}</p>
                    <p className="truncate"><span className="font-medium">Descripción:</span> {vehiculoInfo.nombre}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* PASO 1 — Cliente */}
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">DPI / Pasaporte</label>
                    <input value={form.cliente_dpi} onChange={set('cliente_dpi')}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                      placeholder="1234 56789 0101" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Teléfono</label>
                    <input value={form.cliente_telefono} onChange={set('cliente_telefono')}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                      placeholder="5555-1234" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Correo electrónico</label>
                  <input type="email" value={form.cliente_email} onChange={set('cliente_email')}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                    placeholder="cliente@email.com" />
                </div>
              </>
            )}
          </>
        )}

        {/* PASO 2 — Daño */}
        {step === 2 && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Fecha del daño *</label>
                <input type="date" value={form.fecha_dano} onChange={set('fecha_dano')} required
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
                  {TIPOS_DANO.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Severidad *</label>
                <select value={form.severidad} onChange={set('severidad')}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500">
                  {SEVERIDADES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
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
            {saving ? 'Guardando...' : (
              <>
                <Check size={16} />
                Registrar daño
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
