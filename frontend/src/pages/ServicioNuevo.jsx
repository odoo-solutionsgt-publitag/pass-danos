import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, X, Plus, Trash2, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fetchVehiculos } from '../lib/odoo-api'
import { useAuth } from '../hooks/useAuth'

const TIPOS_SERVICIO = [
  { value: 'servicio_menor',      label: 'Servicio menor',        requiereAuth: false },
  { value: 'servicio_mayor',      label: 'Servicio mayor',        requiereAuth: true  },
  { value: 'cambio_llantas',      label: 'Cambio de llantas',     requiereAuth: false },
  { value: 'cambio_bateria',      label: 'Cambio de batería',     requiereAuth: false },
  { value: 'alineacion_balanceo', label: 'Alineación / balanceo', requiereAuth: false },
  { value: 'cambio_frenos',       label: 'Cambio de frenos',      requiereAuth: false },
  { value: 'otro',                label: 'Otro',                  requiereAuth: false },
]

const LINEA_VACIA = { tipo: 'repuesto', descripcion: '', cantidad: '1', precio_unitario: '' }

function calcTotal(lineas) {
  return lineas.reduce((sum, l) => {
    return sum + ((parseFloat(l.cantidad) || 0) * (parseFloat(l.precio_unitario) || 0))
  }, 0)
}

export default function ServicioNuevo() {
  const navigate = useNavigate()
  const { user } = useAuth()

  // Vehículo
  const [vehiculos, setVehiculos]           = useState([])
  const [loadingV, setLoadingV]             = useState(false)
  const [placaQuery, setPlacaQuery]         = useState('')
  const [placaSeleccionada, setPlacaSeleccionada] = useState(null)

  // Talleres
  const [talleres, setTalleres]             = useState([])

  // Form
  const [tipoServicio, setTipoServicio]     = useState('servicio_menor')
  const [tallerId, setTallerId]             = useState('')
  const [fechaProgramada, setFechaProgramada] = useState(new Date().toISOString().slice(0, 10))
  const [kilometraje, setKilometraje]       = useState('')
  const [descripcion, setDescripcion]       = useState('')

  // Líneas
  const [lineas, setLineas]                 = useState([])
  const [nuevaLinea, setNuevaLinea]         = useState({ ...LINEA_VACIA })

  const [saving, setSaving]                 = useState(false)
  const [error, setError]                   = useState('')

  useEffect(() => {
    setLoadingV(true)
    fetchVehiculos()
      .then(d => setVehiculos(d.vehiculos ?? []))
      .catch(console.error)
      .finally(() => setLoadingV(false))

    supabase.from('talleres').select('id,nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setTalleres(data ?? []))
  }, [])

  // ── Vehículo ──────────────────────────────────────────────

  const vehiculosFiltrados = placaQuery.length >= 2
    ? vehiculos.filter(v =>
        v.placa.includes(placaQuery.toUpperCase()) ||
        v.tipo_vehiculo?.toLowerCase().includes(placaQuery.toLowerCase())
      )
    : []

  // ── Líneas ────────────────────────────────────────────────

  function setNl(field, value) {
    setNuevaLinea(prev => ({ ...prev, [field]: value }))
  }

  function agregarLinea() {
    if (!nuevaLinea.descripcion.trim()) return
    setLineas(prev => [...prev, { ...nuevaLinea, _id: crypto.randomUUID() }])
    setNuevaLinea({ ...LINEA_VACIA })
  }

  function quitarLinea(idx) {
    setLineas(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Autorización ──────────────────────────────────────────

  const totalGeneral   = calcTotal(lineas)
  const tipoInfo       = TIPOS_SERVICIO.find(t => t.value === tipoServicio)
  const requiereAuth   = tipoInfo?.requiereAuth || totalGeneral > 5000

  // ── Submit ────────────────────────────────────────────────

  async function handleSubmit() {
    if (!placaSeleccionada) { setError('Selecciona un vehículo'); return }
    setSaving(true); setError('')
    try {
      const { data: orden, error: err } = await supabase
        .from('ordenes_servicio')
        .insert({
          placa:                placaSeleccionada.placa,
          tipo_vehiculo:        placaSeleccionada.tipo_vehiculo,
          odoo_product_id:      placaSeleccionada.odoo_id,
          tipo_servicio:        tipoServicio,
          taller_id:            tallerId || null,
          fecha_programada:     fechaProgramada || null,
          kilometraje:          kilometraje ? parseInt(kilometraje) : null,
          descripcion:          descripcion.trim() || null,
          estado:               'programado',
          requiere_autorizacion: requiereAuth,
          registrado_por:       user.id,
        })
        .select()
        .single()

      if (err) throw err

      if (lineas.length) {
        const inserts = lineas.map(l => ({
          orden_servicio_id: orden.id,
          tipo:              l.tipo,
          descripcion:       l.descripcion.trim(),
          cantidad:          parseFloat(l.cantidad) || 1,
          precio_unitario:   parseFloat(l.precio_unitario) || 0,
          subtotal:          (parseFloat(l.cantidad) || 1) * (parseFloat(l.precio_unitario) || 0),
        }))
        const { error: errL } = await supabase.from('orden_servicio_lineas').insert(inserts)
        if (errL) throw errL
      }

      navigate(`/servicios/${orden.id}`)
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/servicios')} className="text-gray-400 hover:text-gray-700">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nueva orden de servicio</h1>
          <p className="text-sm text-gray-500">Mantenimiento preventivo o correctivo</p>
        </div>
      </div>

      {/* Vehículo */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-800">Vehículo</h3>

        {!placaSeleccionada ? (
          <>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={placaQuery}
                onChange={e => setPlacaQuery(e.target.value.toUpperCase())}
                placeholder={loadingV ? 'Cargando vehículos...' : 'Buscar placa: P-521, C-513...'}
                disabled={loadingV}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500 font-mono"
              />
            </div>

            {placaQuery.length >= 2 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm max-h-48 overflow-y-auto">
                {vehiculosFiltrados.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-400">Sin resultados para "{placaQuery}"</p>
                ) : (
                  vehiculosFiltrados.map(v => (
                    <button
                      key={v.odoo_id}
                      onClick={() => { setPlacaSeleccionada(v); setPlacaQuery('') }}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-red-50 border-b border-gray-50 last:border-0 text-left"
                    >
                      <span className="font-semibold text-red-700 font-mono">{v.placa}</span>
                      <span className="text-gray-500 text-xs">{v.tipo_vehiculo} · {v.status}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm">
            <div>
              <span className="font-semibold font-mono text-gray-900">{placaSeleccionada.placa}</span>
              <span className="text-gray-500 ml-3">{placaSeleccionada.tipo_vehiculo}</span>
            </div>
            <button onClick={() => setPlacaSeleccionada(null)} className="text-gray-400 hover:text-gray-700">
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Datos del servicio */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Datos del servicio</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo de servicio *</label>
            <select
              value={tipoServicio}
              onChange={e => setTipoServicio(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 bg-white"
            >
              {TIPOS_SERVICIO.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Taller</label>
            <select
              value={tallerId}
              onChange={e => setTallerId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 bg-white"
            >
              <option value="">— Sin asignar —</option>
              {talleres.map(t => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Fecha programada</label>
            <input
              type="date"
              value={fechaProgramada}
              onChange={e => setFechaProgramada(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Kilometraje actual</label>
            <input
              type="number"
              value={kilometraje}
              onChange={e => setKilometraje(e.target.value)}
              placeholder="Ej: 35000"
              min="0"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Descripción / observaciones</label>
          <textarea
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            rows={3}
            placeholder="Describe el servicio a realizar..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 resize-none"
          />
        </div>
      </div>

      {/* Líneas de detalle */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-800">Líneas de detalle <span className="text-gray-400 font-normal">(opcional)</span></h3>

        {lineas.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="pb-1.5 font-medium">Tipo</th>
                <th className="pb-1.5 font-medium">Descripción</th>
                <th className="pb-1.5 font-medium text-right">Cant.</th>
                <th className="pb-1.5 font-medium text-right">Precio</th>
                <th className="pb-1.5 font-medium text-right">Subtotal</th>
                <th className="pb-1.5 w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lineas.map((l, idx) => {
                const sub = (parseFloat(l.cantidad) || 0) * (parseFloat(l.precio_unitario) || 0)
                return (
                  <tr key={l._id}>
                    <td className="py-1.5 pr-2 text-gray-500 capitalize">{l.tipo === 'mano_obra' ? 'M. obra' : l.tipo}</td>
                    <td className="py-1.5 pr-2 text-gray-700">{l.descripcion}</td>
                    <td className="py-1.5 pr-2 text-right text-gray-600">{l.cantidad}</td>
                    <td className="py-1.5 pr-2 text-right text-gray-600">Q {parseFloat(l.precio_unitario || 0).toFixed(2)}</td>
                    <td className="py-1.5 text-right font-medium text-gray-800">Q {sub.toFixed(2)}</td>
                    <td className="py-1.5 pl-2">
                      <button onClick={() => quitarLinea(idx)} className="text-gray-300 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200">
                <td colSpan={4} className="pt-2 text-xs font-bold text-gray-700 text-right">Total estimado:</td>
                <td className="pt-2 text-right text-sm font-bold text-gray-900">Q {totalGeneral.toFixed(2)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}

        {/* Agregar línea */}
        <div className="grid grid-cols-12 gap-1.5 items-center">
          <select
            value={nuevaLinea.tipo}
            onChange={e => setNl('tipo', e.target.value)}
            className="col-span-2 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-400 bg-white"
          >
            <option value="repuesto">Repuesto</option>
            <option value="mano_obra">M. obra</option>
            <option value="otro">Otro</option>
          </select>
          <input
            value={nuevaLinea.descripcion}
            onChange={e => setNl('descripcion', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && agregarLinea()}
            placeholder="Descripción"
            className="col-span-5 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-400"
          />
          <input
            type="number"
            value={nuevaLinea.cantidad}
            onChange={e => setNl('cantidad', e.target.value)}
            min="0.01"
            step="0.01"
            placeholder="Cant."
            className="col-span-2 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-400 text-right"
          />
          <input
            type="number"
            value={nuevaLinea.precio_unitario}
            onChange={e => setNl('precio_unitario', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && agregarLinea()}
            min="0"
            step="0.01"
            placeholder="Precio Q"
            className="col-span-2 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-400 text-right"
          />
          <button
            onClick={agregarLinea}
            disabled={!nuevaLinea.descripcion.trim()}
            className="col-span-1 flex items-center justify-center h-full py-1.5 text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-40"
          >
            <Plus size={14} />
          </button>
        </div>
        <p className="text-xs text-gray-400">También puedes agregar líneas después de crear la orden.</p>
      </div>

      {/* Aviso autorización */}
      {requiereAuth && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            Esta orden <strong>requiere autorización</strong>{' '}
            {tipoInfo?.requiereAuth ? '(servicio mayor)' : `(total estimado supera Q5,000)`}
            {' '}antes de enviarse a taller.
          </span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      {/* Acciones */}
      <div className="flex justify-between pb-6">
        <button
          onClick={() => navigate('/servicios')}
          className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || !placaSeleccionada}
          className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-40"
        >
          {saving ? 'Creando...' : 'Crear orden de servicio'}
        </button>
      </div>
    </div>
  )
}
