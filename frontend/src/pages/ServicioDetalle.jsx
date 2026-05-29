import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, AlertTriangle, CheckCircle2, Clock, Wrench,
  Plus, Trash2, ChevronRight, X, Printer,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { updateVehiculoStatus } from '../lib/odoo-api'
import { useAuth } from '../hooks/useAuth'
import { usePermisos } from '../hooks/usePermisos'
import DocumentosSection from '../components/DocumentosSection'
import ChecklistCierre from '../components/ChecklistCierre'
import FechasTaller from '../components/FechasTaller'
import HistorialCambios from '../components/HistorialCambios'

// ── Constantes ────────────────────────────────────────────────

// Todos los servicios ponen el vehículo en "En Mantenimiento" al ingresar al taller.
// (Plan F2/K — simplificación de status del vehículo a 3 valores)
const STATUS_INGRESO_TALLER = 'En Mantenimiento'

const TIPO_LABELS = {
  servicio_menor:      'Servicio menor',
  servicio_mayor:      'Servicio mayor',
  cambio_llantas:      'Cambio de llantas',
  cambio_bateria:      'Cambio de batería',
  alineacion_balanceo: 'Alineación / balanceo',
  cambio_frenos:       'Cambio de frenos',
  otro:                'Otro',
}

const ESTADO_LABELS = {
  programado: 'Programado',
  aprobado:   'Aprobado',
  en_proceso: 'En proceso',
  completado: 'Completado',
  cancelado:  'Cancelado',
}

const ESTADO_COLORS = {
  programado: 'bg-gray-100 text-gray-700 border-gray-200',
  aprobado:   'bg-blue-100 text-blue-700 border-blue-200',
  en_proceso: 'bg-amber-100 text-amber-700 border-amber-200',
  completado: 'bg-green-100 text-green-700 border-green-200',
  cancelado:  'bg-red-100 text-red-600 border-red-200',
}

const TIPO_LINEA_LABELS = { repuesto: 'Repuesto', mano_obra: 'Mano de obra', otro: 'Otro' }
const LINEA_VACIA = { tipo: 'repuesto', descripcion: '', cantidad: '1', precio_unitario: '' }

function fmt(n) {
  return `Q ${Number(n || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(iso, extra = {}) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric', ...extra })
}

function semaforoColor(dias) {
  if (dias <= 2) return 'bg-green-500'
  if (dias <= 5) return 'bg-amber-400'
  return 'bg-red-500'
}

// ── Modal de confirmación ─────────────────────────────────────

function ConfirmModal({ titulo, mensaje, confirmLabel = 'Confirmar', danger, children, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={22} className={`${danger ? 'text-red-500' : 'text-amber-500'} shrink-0 mt-0.5`} />
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">{titulo}</h3>
            <p className="text-sm text-gray-500 mt-1">{mensaje}</p>
            {children}
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={onConfirm} className={`px-4 py-2 text-sm font-medium text-white rounded-lg ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-red-600 hover:bg-red-700'}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────

export default function ServicioDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const { puedeCrear, puedeEditar, puedeEliminar } = usePermisos()

  const [orden, setOrden]                 = useState(null)
  const [lineas, setLineas]               = useState([])
  const [timeline, setTimeline]           = useState([])
  const [tallerIngresos, setTallerIngresos] = useState([])
  const [loading, setLoading]             = useState(true)
  const [saving, setSaving]               = useState(false)
  const [confirm, setConfirm]             = useState(null)
  const [nuevaLinea, setNuevaLinea]       = useState({ ...LINEA_VACIA })
  const [autorizadoPor, setAutorizadoPor] = useState('')


  useEffect(() => { loadAll() }, [id])

  async function loadAll() {
    const [{ data: o }, { data: tl }, { data: ti }] = await Promise.all([
      supabase.from('ordenes_servicio')
        .select('*, talleres(nombre)')
        .eq('id', id).single(),
      supabase.from('orden_servicio_timeline')
        .select('*').eq('orden_servicio_id', id).order('created_at'),
      supabase.from('taller_ingresos')
        .select('*, talleres(nombre)').eq('orden_servicio_id', id).order('fecha_ingreso'),
    ])

    const { data: ls } = await supabase
      .from('orden_servicio_lineas')
      .select('*').eq('orden_servicio_id', id).order('created_at')

    setOrden(o)
    setLineas(ls ?? [])
    setTimeline(tl ?? [])
    setTallerIngresos(ti ?? [])
    setLoading(false)
  }

  // ── Transiciones ─────────────────────────────────────────

  async function ejecutar(nuevoEstado, extra = {}) {
    setSaving(true); setConfirm(null)
    try {
      await supabase.from('ordenes_servicio')
        .update({ estado: nuevoEstado, ...extra })
        .eq('id', id)

      if (nuevoEstado === 'en_proceso') {
        await supabase.from('taller_ingresos').insert({
          orden_servicio_id: id,
          taller_id:         orden.taller_id ?? null,
          fecha_ingreso:     new Date().toISOString().slice(0, 10),
          es_servicio:       true,
          es_dano:           false,
        })
        if (orden.odoo_product_id) {
          await updateVehiculoStatus(orden.odoo_product_id, STATUS_INGRESO_TALLER).catch(console.warn)
        }
      }

      if (nuevoEstado === 'completado') {
        const { data: abiertos } = await supabase
          .from('taller_ingresos')
          .select('id')
          .eq('orden_servicio_id', id)
          .is('fecha_egreso', null)

        if (abiertos?.length) {
          await supabase.from('taller_ingresos')
            .update({ fecha_egreso: new Date().toISOString().slice(0, 10) })
            .in('id', abiertos.map(t => t.id))
        }
        if (orden.odoo_product_id) {
          await updateVehiculoStatus(orden.odoo_product_id, 'Disponible').catch(console.warn)
        }
      }

      if (nuevoEstado === 'cancelado' && tallerIngresos.some(t => !t.fecha_egreso)) {
        if (orden.odoo_product_id) {
          await updateVehiculoStatus(orden.odoo_product_id, 'Disponible').catch(console.warn)
        }
      }

      await loadAll()
    } finally { setSaving(false) }
  }

  // ── Líneas ────────────────────────────────────────────────

  function setNl(field, value) {
    setNuevaLinea(prev => ({ ...prev, [field]: value }))
  }

  async function handleAddLinea() {
    if (!nuevaLinea.descripcion.trim()) return
    setSaving(true)
    const cantidad = parseFloat(nuevaLinea.cantidad) || 1
    const precio   = parseFloat(nuevaLinea.precio_unitario) || 0
    await supabase.from('orden_servicio_lineas').insert({
      orden_servicio_id: id,
      tipo:              nuevaLinea.tipo,
      descripcion:       nuevaLinea.descripcion.trim(),
      cantidad,
      precio_unitario:   precio,
      subtotal:          cantidad * precio,
    })
    setNuevaLinea({ ...LINEA_VACIA })
    await loadAll()
    setSaving(false)
  }

  async function handleDeleteLinea(lineaId) {
    await supabase.from('orden_servicio_lineas').delete().eq('id', lineaId)
    await loadAll()
  }

  // ── Render helpers ────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!orden) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p>Orden no encontrada.</p>
        <button onClick={() => navigate('/servicios')} className="text-red-600 text-sm mt-2 hover:underline">
          Volver a servicios
        </button>
      </div>
    )
  }

  const estado       = orden.estado
  const bloqueada    = ['completado', 'cancelado'].includes(estado)
  const enTaller     = tallerIngresos.some(t => !t.fecha_egreso)

  return (
    <>
      {/* Modal de confirmación */}
      {confirm && (
        <ConfirmModal {...confirm} onCancel={() => { setConfirm(null); setAutorizadoPor('') }}>
          {confirm.showAuth && (
            <input
              value={autorizadoPor}
              onChange={e => setAutorizadoPor(e.target.value)}
              placeholder="Nombre de quien autoriza *"
              className="mt-3 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              autoFocus
            />
          )}
        </ConfirmModal>
      )}

      <div className="max-w-4xl mx-auto space-y-5">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <button onClick={() => navigate('/servicios')} className="text-gray-400 hover:text-gray-700 mt-1">
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900 font-mono">{orden.numero}</h1>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${ESTADO_COLORS[estado]}`}>
                  {ESTADO_LABELS[estado]}
                </span>
                {orden.requiere_autorizacion && estado === 'programado' && (
                  <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full border border-amber-200">
                    Requiere autorización
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {orden.placa} · {TIPO_LABELS[orden.tipo_servicio]} · {formatDate(orden.fecha_programada)}
              </p>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">

            {/* programado + requiere_autorizacion → Autorizar */}
            {puedeEditar && estado === 'programado' && orden.requiere_autorizacion && (
              <button
                onClick={() => setConfirm({
                  titulo: 'Autorizar orden de servicio',
                  mensaje: 'Ingresa el nombre de quien autoriza esta orden.',
                  confirmLabel: 'Autorizar',
                  showAuth: true,
                  onConfirm: () => {
                    if (!autorizadoPor.trim()) return
                    ejecutar('aprobado', {
                      autorizado_por: autorizadoPor.trim(),
                      fecha_autorizacion: new Date().toISOString().slice(0, 10),
                    })
                    setAutorizadoPor('')
                  },
                })}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                <CheckCircle2 size={15} />
                Autorizar
              </button>
            )}

            {/* programado sin auth → Enviar a taller */}
            {puedeEditar && estado === 'programado' && !orden.requiere_autorizacion && (
              <button
                onClick={() => setConfirm({
                  titulo: 'Enviar a taller',
                  mensaje: `El vehículo ${orden.placa} se marcará como "${STATUS_INGRESO_TALLER}" en Odoo.`,
                  confirmLabel: 'Enviar',
                  onConfirm: () => ejecutar('en_proceso'),
                })}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                <ChevronRight size={15} />
                Enviar a taller
              </button>
            )}

            {/* aprobado → Enviar a taller */}
            {puedeEditar && estado === 'aprobado' && (
              <button
                onClick={() => setConfirm({
                  titulo: 'Enviar a taller',
                  mensaje: `El vehículo ${orden.placa} se marcará como "${STATUS_INGRESO_TALLER}" en Odoo.`,
                  confirmLabel: 'Enviar',
                  onConfirm: () => ejecutar('en_proceso'),
                })}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                <Wrench size={15} />
                Enviar a taller
              </button>
            )}

            {/* en_proceso → Completar */}
            {puedeEditar && estado === 'en_proceso' && (
              <button
                onClick={() => setConfirm({
                  titulo: 'Completar servicio',
                  mensaje: `El vehículo ${orden.placa} volverá a estado "Disponible" en Odoo.`,
                  confirmLabel: 'Completar',
                  onConfirm: () => ejecutar('completado'),
                })}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                <CheckCircle2 size={15} />
                Completar servicio
              </button>
            )}

            <button
              onClick={() => window.open(`/servicios/${orden.id}/imprimir`, '_blank')}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm rounded-lg"
              title="Imprimir ficha"
            >
              <Printer size={14} />
              Imprimir
            </button>

            {/* Cancelar — solo con permiso de eliminar, estados activos */}
            {puedeEliminar && !bloqueada && (
              <button
                onClick={() => setConfirm({
                  titulo: 'Cancelar orden',
                  mensaje: 'La orden quedará cancelada. Esta acción no se puede deshacer.',
                  confirmLabel: 'Cancelar orden',
                  danger: true,
                  onConfirm: () => ejecutar('cancelado'),
                })}
                disabled={saving}
                className="px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-sm rounded-lg"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>

        {/* ── Info autorización ─────────────────────────────── */}
        {orden.autorizado_por && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
            ✓ Autorizado por <strong>{orden.autorizado_por}</strong> el {formatDate(orden.fecha_autorizacion)}
          </div>
        )}

        {/* ── Datos del servicio ────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Datos del servicio</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <Dato label="Vehículo" value={<span className="font-mono font-semibold">{orden.placa}</span>} />
            <Dato label="Tipo" value={orden.tipo_vehiculo} />
            <Dato label="Tipo servicio" value={TIPO_LABELS[orden.tipo_servicio]} />
            <Dato label="Taller" value={orden.talleres?.nombre} />
            <Dato label="Fecha programada" value={formatDate(orden.fecha_programada)} />
            <Dato label="Kilometraje" value={orden.kilometraje ? `${orden.kilometraje.toLocaleString()} km` : undefined} />
          </div>
          {orden.descripcion && (
            <p className="text-sm text-gray-600 border-t border-gray-50 pt-3 mt-3">{orden.descripcion}</p>
          )}
        </div>

        {/* ── Líneas de detalle ─────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">Detalle de la orden</h3>

          {lineas.length > 0 ? (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="pb-2 font-medium">Tipo</th>
                    <th className="pb-2 font-medium">Descripción</th>
                    <th className="pb-2 font-medium text-right">Cant.</th>
                    <th className="pb-2 font-medium text-right">P. Unit.</th>
                    <th className="pb-2 font-medium text-right">Subtotal</th>
                    {!bloqueada && <th className="pb-2 w-6" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lineas.map(l => (
                    <tr key={l.id}>
                      <td className="py-2 pr-2 text-xs text-gray-500">{TIPO_LINEA_LABELS[l.tipo]}</td>
                      <td className="py-2 pr-2 text-gray-700">{l.descripcion}</td>
                      <td className="py-2 pr-2 text-right text-gray-600">{l.cantidad}</td>
                      <td className="py-2 pr-2 text-right text-gray-600">{fmt(l.precio_unitario)}</td>
                      <td className="py-2 text-right font-medium text-gray-800">{fmt(l.subtotal)}</td>
                      {!bloqueada && puedeEliminar && (
                        <td className="py-2 pl-2">
                          <button onClick={() => handleDeleteLinea(l.id)} className="text-gray-300 hover:text-red-500">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="space-y-1 text-sm border-t border-gray-100 pt-2">
                {Number(orden.total_repuestos) > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Repuestos</span><span>{fmt(orden.total_repuestos)}</span>
                  </div>
                )}
                {Number(orden.total_mano_obra) > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Mano de obra</span><span>{fmt(orden.total_mano_obra)}</span>
                  </div>
                )}
                {Number(orden.total_otros) > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Otros</span><span>{fmt(orden.total_otros)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1.5">
                  <span>Total</span><span>{fmt(orden.total_general)}</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 py-3">Sin líneas de detalle registradas.</p>
          )}

          {/* Agregar línea */}
          {!bloqueada && puedeCrear && (
            <div className="border-t border-dashed border-gray-200 pt-3 space-y-2">
              <p className="text-xs text-gray-400 font-medium">+ Agregar línea</p>
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
                  onKeyDown={e => e.key === 'Enter' && handleAddLinea()}
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
                  onKeyDown={e => e.key === 'Enter' && handleAddLinea()}
                  min="0"
                  step="0.01"
                  placeholder="Precio"
                  className="col-span-2 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-400 text-right"
                />
                <button
                  onClick={handleAddLinea}
                  disabled={!nuevaLinea.descripcion.trim() || saving}
                  className="col-span-1 flex items-center justify-center py-1.5 text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-40 h-full"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Taller ───────────────────────────────────────── */}
        {tallerIngresos.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Wrench size={16} className="text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-800">Taller</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 font-medium">Taller</th>
                  <th className="pb-2 font-medium">Ingreso</th>
                  <th className="pb-2 font-medium">Egreso</th>
                  <th className="pb-2 font-medium text-center">Días</th>
                  <th className="pb-2 text-center" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tallerIngresos.map(ti => (
                  <tr key={ti.id}>
                    <td className="py-3 pr-4 text-gray-700">{ti.talleres?.nombre || '—'}</td>
                    <td className="py-3 pr-4 text-gray-600">{formatDate(ti.fecha_ingreso)}</td>
                    <td className="py-3 pr-4 text-gray-600">
                      {!ti.fecha_egreso
                        ? <span className="text-amber-600 font-medium">En taller</span>
                        : formatDate(ti.fecha_egreso)}
                    </td>
                    <td className="py-3 text-center font-semibold text-gray-800">{ti.dias_en_taller ?? 0}</td>
                    <td className="py-3 text-center">
                      <span className={`inline-block w-3 h-3 rounded-full ${semaforoColor(ti.dias_en_taller ?? 0)}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 mt-3">
              <span className="text-green-600 font-medium">Verde</span> 0-2 días ·{' '}
              <span className="text-amber-500 font-medium">Amarillo</span> 3-5 días ·{' '}
              <span className="text-red-500 font-medium">Rojo</span> 6+ días
            </p>
          </div>
        )}

        {/* ── Fechas de taller ────────────────────────────────── */}
        <FechasTaller
          tabla="ordenes_servicio"
          registroId={orden.id}
          valores={{
            fecha_entrega_taller:   orden.fecha_entrega_taller,
            fecha_estimada_entrega: orden.fecha_estimada_entrega,
            fecha_real_entrega:     orden.fecha_real_entrega,
          }}
          onUpdate={() => loadAll()}
        />

        {/* ── Checklist de cierre ─────────────────────────────── */}
        {['completado'].includes(estado) && (
          <ChecklistCierre
            tabla="ordenes_servicio"
            registroId={orden.id}
            valores={{
              tiene_prefactura: orden.tiene_prefactura,
              tiene_proforma:   orden.tiene_proforma,
              tiene_factura:    orden.tiene_factura,
            }}
          />
        )}

        {/* ── Documentos ──────────────────────────────────────── */}
        <DocumentosSection
          origen="servicio"
          origenId={orden.id}
          numero={orden.numero}
          tiposSugeridos={['cotizacion_pdf', 'factura', 'comprobante_pago', 'otro']}
        />

        {/* ── Timeline ─────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-800">Historial</h3>
          </div>
          {timeline.length === 0 ? (
            <p className="text-sm text-gray-400">Sin historial de cambios.</p>
          ) : (
            <ol className="relative border-l border-gray-200 space-y-4 ml-3">
              {timeline.map((item, idx) => {
                const isLast = idx === timeline.length - 1
                return (
                  <li key={item.id} className="ml-5">
                    <div className={`absolute -left-[11px] w-5 h-5 rounded-full border-2 border-white flex items-center justify-center ${isLast ? 'bg-red-600' : 'bg-gray-300'}`}>
                      <Clock size={10} className="text-white" />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <p className="text-sm font-medium text-gray-900">{item.accion}</p>
                      {item.estado_nuevo && (
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${ESTADO_COLORS[item.estado_nuevo]}`}>
                          {ESTADO_LABELS[item.estado_nuevo]}
                        </span>
                      )}
                    </div>
                    {item.detalle && <p className="text-xs text-gray-500 mt-0.5">{item.detalle}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDate(item.created_at, { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        {/* ── Historial de cambios (audit_log) ─────────────────── */}
        <HistorialCambios tabla="ordenes_servicio" filaId={orden.id} />

      </div>
    </>
  )
}

function Dato({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value || '—'}</p>
    </div>
  )
}
