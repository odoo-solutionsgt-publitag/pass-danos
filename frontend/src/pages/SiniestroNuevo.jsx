import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fetchVehiculos, fetchVehiculo, updateVehiculoStatus } from '../lib/odoo-api'
import { useAuth } from '../hooks/useAuth'

const TIPOS_DANO = [
  'choque_frontal', 'choque_trasero', 'choque_lateral', 'rayon',
  'abollon', 'vidrio', 'llanta', 'mecanico', 'multiple', 'otro',
]
const SEVERIDADES = ['leve', 'medio', 'severo', 'perdida_total']

const STEPS = ['Vehículo', 'Cliente', 'Daño']

export default function SiniestroNuevo() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [step, setStep] = useState(0)
  const [vehiculos, setVehiculos] = useState([])
  const [loadingVehiculos, setLoadingVehiculos] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    placa: '',
    tipo_vehiculo: '',
    marca: '',
    linea: '',
    anio: '',
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

  async function handlePlacaChange(placa) {
    setForm(f => ({ ...f, placa }))
    if (!placa) return
    try {
      const data = await fetchVehiculo(placa)
      const v = data.vehiculo
      const c = data.contrato
      setForm(f => ({
        ...f,
        placa: v.placa,
        tipo_vehiculo: v.tipo_vehiculo,
        odoo_product_id: v.odoo_id,
        contrato_id: c?.odoo_id ?? null,
        contrato_numero: c?.contrato_numero ?? '',
        cliente_nombre: c?.cliente_nombre ?? '',
        cliente_dpi: c?.cliente_dpi ?? '',
        cliente_telefono: c?.cliente_telefono ?? '',
        cliente_email: c?.cliente_email ?? '',
      }))
    } catch {
      // vehículo sin contrato o error
    }
  }

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit() {
    setSaving(true)
    setError('')
    try {
      const { data, error: err } = await supabase.from('siniestros').insert({
        placa: form.placa.toUpperCase(),
        tipo_vehiculo: form.tipo_vehiculo,
        marca: form.marca,
        linea: form.linea,
        anio: form.anio ? parseInt(form.anio) : null,
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
          <h1 className="text-xl font-bold text-gray-900">Registrar siniestro</h1>
          <p className="text-sm text-gray-500">Paso {step + 1} de 3: {STEPS[step]}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {STEPS.map((s, i) => (
          <div key={i} className={`flex-1 h-1.5 rounded-full ${i <= step ? 'bg-red-600' : 'bg-gray-200'}`} />
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        {step === 0 && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Vehículo (placa)</label>
              <select
                value={form.placa}
                onChange={e => handlePlacaChange(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
              >
                <option value="">{loadingVehiculos ? 'Cargando...' : 'Seleccionar placa'}</option>
                {vehiculos.map(v => (
                  <option key={v.odoo_id} value={v.placa}>{v.placa} — {v.tipo_vehiculo}</option>
                ))}
              </select>
            </div>
            {form.tipo_vehiculo && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                <p><strong>Tipo:</strong> {form.tipo_vehiculo}</p>
                {form.contrato_numero && <p><strong>Contrato:</strong> {form.contrato_numero}</p>}
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre del cliente *</label>
              <input value={form.cliente_nombre} onChange={set('cliente_nombre')} required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                placeholder="Nombre completo" />
            </div>
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

        {step === 2 && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Fecha del daño *</label>
                <input type="date" value={form.fecha_dano} onChange={set('fecha_dano')} required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Lugar del accidente</label>
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
                    <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Severidad *</label>
                <select value={form.severidad} onChange={set('severidad')}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500">
                  {SEVERIDADES.map(s => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
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
            disabled={step === 0 && !form.placa}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Siguiente
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={saving || !form.cliente_nombre || !form.fecha_dano}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Guardando...' : (
              <>
                <Check size={16} />
                Registrar siniestro
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
