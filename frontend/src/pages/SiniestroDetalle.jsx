import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { updateVehiculoStatus } from '../lib/odoo-api'

const ESTADO_COLORS = {
  registrado: 'bg-gray-100 text-gray-700',
  cotizando: 'bg-amber-100 text-amber-700',
  proforma_emitida: 'bg-amber-100 text-amber-700',
  proforma_aprobada: 'bg-blue-100 text-blue-700',
  en_reparacion: 'bg-red-100 text-red-700',
  reparado: 'bg-teal-100 text-teal-700',
  en_cobro: 'bg-purple-100 text-purple-700',
  cerrado: 'bg-green-100 text-green-700',
  anulado: 'bg-gray-100 text-gray-500',
}

const TRANSICIONES = {
  registrado: { label: 'Solicitar cotización', siguiente: 'cotizando' },
  cotizando: { label: 'Generar proforma', siguiente: 'proforma_emitida' },
  proforma_emitida: { label: 'Aprobar proforma', siguiente: 'proforma_aprobada' },
  proforma_aprobada: { label: 'Ingresar a taller', siguiente: 'en_reparacion', odooStatus: 'En Reparación' },
  en_reparacion: { label: 'Marcar como reparado', siguiente: 'reparado', odooStatus: 'Disponible' },
  reparado: { label: 'Registrar cobro', siguiente: 'en_cobro' },
  en_cobro: { label: 'Cerrar siniestro', siguiente: 'cerrado' },
}

export default function SiniestroDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [siniestro, setSiniestro] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadSiniestro() }, [id])

  async function loadSiniestro() {
    const [{ data: s }, { data: tl }] = await Promise.all([
      supabase.from('siniestros').select('*,talleres(nombre)').eq('id', id).single(),
      supabase.from('siniestro_timeline').select('*').eq('siniestro_id', id).order('created_at'),
    ])
    setSiniestro(s)
    setTimeline(tl ?? [])
    setLoading(false)
  }

  async function avanzarEstado() {
    if (!siniestro) return
    const t = TRANSICIONES[siniestro.estado]
    if (!t) return
    setSaving(true)
    try {
      await supabase.from('siniestros').update({ estado: t.siguiente }).eq('id', id)
      if (t.odooStatus && siniestro.odoo_product_id) {
        await updateVehiculoStatus(siniestro.odoo_product_id, t.odooStatus).catch(console.warn)
      }
      await loadSiniestro()
    } finally {
      setSaving(false)
    }
  }

  function formatDate(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!siniestro) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p>Siniestro no encontrado.</p>
        <button onClick={() => navigate('/siniestros')} className="text-red-600 text-sm mt-2 hover:underline">
          Volver a siniestros
        </button>
      </div>
    )
  }

  const transicion = TRANSICIONES[siniestro.estado]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/siniestros')} className="text-gray-400 hover:text-gray-700">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{siniestro.numero}</h1>
            <p className="text-sm text-gray-500">{siniestro.placa} — {siniestro.cliente_nombre}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${ESTADO_COLORS[siniestro.estado]}`}>
            {siniestro.estado?.replace(/_/g, ' ')}
          </span>
          {transicion && (
            <button
              onClick={avanzarEstado}
              disabled={saving}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
            >
              {saving ? 'Procesando...' : transicion.label}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-900 text-sm mb-4">Datos del vehículo</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Placa</dt>
              <dd className="font-medium text-gray-900">{siniestro.placa}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Tipo</dt>
              <dd className="text-gray-700">{siniestro.tipo_vehiculo || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Marca</dt>
              <dd className="text-gray-700">{siniestro.marca || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Contrato</dt>
              <dd className="text-gray-700">{siniestro.contrato_numero || '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-900 text-sm mb-4">Datos del daño</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Fecha</dt>
              <dd className="text-gray-700">{formatDate(siniestro.fecha_dano)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Tipo de daño</dt>
              <dd className="text-gray-700 capitalize">{siniestro.tipo_dano?.replace(/_/g, ' ')}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Severidad</dt>
              <dd className="text-gray-700 capitalize">{siniestro.severidad?.replace('_', ' ')}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Taller asignado</dt>
              <dd className="text-gray-700">{siniestro.talleres?.nombre || '—'}</dd>
            </div>
          </dl>
        </div>
      </div>

      {siniestro.descripcion && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-900 text-sm mb-2">Descripción</h3>
          <p className="text-sm text-gray-600">{siniestro.descripcion}</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-gray-900 text-sm mb-4">Historial de estados</h3>
        {timeline.length === 0 ? (
          <p className="text-sm text-gray-400">Sin historial de cambios</p>
        ) : (
          <ol className="relative border-l border-gray-200 space-y-4 ml-3">
            {timeline.map(item => (
              <li key={item.id} className="ml-4">
                <div className="absolute -left-1.5 mt-1.5 w-3 h-3 bg-red-600 border-2 border-white rounded-full" />
                <p className="text-sm font-medium text-gray-900">{item.accion}</p>
                {item.detalle && <p className="text-xs text-gray-500">{item.detalle}</p>}
                <p className="text-xs text-gray-400">{formatDate(item.created_at)}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
