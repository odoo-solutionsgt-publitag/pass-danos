import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, AlertTriangle, CheckCircle2, Clock, Wrench,
  Car, User, FileText, X, ChevronRight,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { updateVehiculoStatus } from '../lib/odoo-api'
import { useAuth } from '../hooks/useAuth'

// ── Labels y colores ──────────────────────────────────────────

const ESTADO_LABELS = {
  registrado: 'Registrado',
  cotizando: 'Cotizando',
  proforma_emitida: 'Proforma emitida',
  proforma_aprobada: 'Proforma aprobada',
  en_reparacion: 'En reparación',
  reparado: 'Reparado',
  en_cobro: 'En cobro',
  cerrado: 'Cerrado',
  anulado: 'Anulado',
}

const ESTADO_COLORS = {
  registrado:        'bg-gray-100 text-gray-700 border-gray-200',
  cotizando:         'bg-amber-100 text-amber-700 border-amber-200',
  proforma_emitida:  'bg-amber-100 text-amber-700 border-amber-200',
  proforma_aprobada: 'bg-blue-100 text-blue-700 border-blue-200',
  en_reparacion:     'bg-red-100 text-red-700 border-red-200',
  reparado:          'bg-teal-100 text-teal-700 border-teal-200',
  en_cobro:          'bg-purple-100 text-purple-700 border-purple-200',
  cerrado:           'bg-green-100 text-green-700 border-green-200',
  anulado:           'bg-gray-100 text-gray-400 border-gray-200',
}

const ESTADO_ICON = {
  registrado:        Clock,
  cotizando:         FileText,
  proforma_emitida:  FileText,
  proforma_aprobada: CheckCircle2,
  en_reparacion:     Wrench,
  reparado:          CheckCircle2,
  en_cobro:          FileText,
  cerrado:           CheckCircle2,
  anulado:           X,
}

const TIPO_DANO_LABELS = {
  choque_frontal: 'Choque frontal',
  choque_trasero: 'Choque trasero',
  choque_lateral: 'Choque lateral',
  rayon: 'Rayón',
  abollon: 'Abollón',
  vidrio: 'Vidrio',
  llanta: 'Llanta',
  mecanico: 'Mecánico',
  multiple: 'Múltiple',
  otro: 'Otro',
}

const SEVERIDAD_COLORS = {
  leve: 'bg-green-100 text-green-700',
  medio: 'bg-amber-100 text-amber-700',
  severo: 'bg-red-100 text-red-700',
  perdida_total: 'bg-red-900 text-red-100',
}

const SEVERIDAD_LABELS = {
  leve: 'Leve',
  medio: 'Medio',
  severo: 'Severo',
  perdida_total: 'Pérdida total',
}

function semaforoColor(dias) {
  if (dias <= 2) return 'bg-green-500'
  if (dias <= 5) return 'bg-amber-400'
  return 'bg-red-500'
}

function formatDate(iso, opts = {}) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-GT', {
    day: '2-digit', month: 'short', year: 'numeric', ...opts
  })
}

// ── Modal de confirmación simple ──────────────────────────────

function ConfirmModal({ titulo, mensaje, onConfirm, onCancel, confirmLabel = 'Confirmar', danger = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={22} className={danger ? 'text-red-500 shrink-0 mt-0.5' : 'text-amber-500 shrink-0 mt-0.5'} />
          <div>
            <h3 className="font-semibold text-gray-900">{titulo}</h3>
            <p className="text-sm text-gray-500 mt-1">{mensaje}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────

export default function SiniestroDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { perfil } = useAuth()

  const [siniestro, setSiniestro] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [tallerIngresos, setTallerIngresos] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)

  const esAdminOSenior = ['admin', 'agente_senior'].includes(perfil?.rol)

  useEffect(() => { loadAll() }, [id])

  async function loadAll() {
    const [{ data: s }, { data: tl }, { data: ti }] = await Promise.all([
      supabase.from('siniestros').select('*,talleres(nombre)').eq('id', id).single(),
      supabase.from('siniestro_timeline').select('*').eq('siniestro_id', id).order('created_at'),
      supabase.from('taller_ingresos').select('*,talleres(nombre)').eq('siniestro_id', id).order('fecha_ingreso'),
    ])
    setSiniestro(s)
    setTimeline(tl ?? [])
    setTallerIngresos(ti ?? [])
    setLoading(false)
  }

  // ── Transiciones de estado ────────────────────────────────

  async function ejecutarTransicion(nuevoEstado, opciones = {}) {
    setSaving(true)
    setConfirm(null)
    try {
      await supabase.from('siniestros').update({ estado: nuevoEstado }).eq('id', id)

      // Ingresar a taller: crear registro
      if (nuevoEstado === 'en_reparacion') {
        await supabase.from('taller_ingresos').insert({
          siniestro_id: id,
          taller_id: siniestro.taller_id || null,
          fecha_ingreso: new Date().toISOString().slice(0, 10),
          es_dano: true,
          es_servicio: false,
        })
        if (siniestro.odoo_product_id) {
          await updateVehiculoStatus(siniestro.odoo_product_id, 'En Reparación').catch(console.warn)
        }
      }

      // Marcar como reparado: cerrar registro de taller
      if (nuevoEstado === 'reparado') {
        const { data: ingresos } = await supabase
          .from('taller_ingresos')
          .select('id')
          .eq('siniestro_id', id)
          .is('fecha_egreso', null)

        if (ingresos?.length) {
          await supabase.from('taller_ingresos')
            .update({ fecha_egreso: new Date().toISOString().slice(0, 10) })
            .in('id', ingresos.map(i => i.id))
        }
        if (siniestro.odoo_product_id) {
          await updateVehiculoStatus(siniestro.odoo_product_id, 'Disponible').catch(console.warn)
        }
      }

      // Absorbe Pass / Seguro: insertar cobro + cerrar
      if (opciones.cobro) {
        await supabase.from('cobros').insert({
          siniestro_id: id,
          estado: 'pagado',
          monto_total: siniestro.monto_cliente || 0,
          es_gasto_pass: opciones.cobro === 'pass',
          es_seguro: opciones.cobro === 'seguro',
          notas: opciones.cobro === 'pass' ? 'Absorbido por Pass Rent a Car' : 'Cubierto por seguro',
        })
      }

      await loadAll()
    } finally {
      setSaving(false)
    }
  }

  function pedirConfirm(cfg) {
    setConfirm(cfg)
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
        <p>Daño no encontrado.</p>
        <button onClick={() => navigate('/siniestros')} className="text-red-600 text-sm mt-2 hover:underline">
          Volver a daños
        </button>
      </div>
    )
  }

  const estado = siniestro.estado
  const hayTallerActivo = tallerIngresos.some(t => !t.fecha_egreso)

  return (
    <>
      {confirm && (
        <ConfirmModal
          titulo={confirm.titulo}
          mensaje={confirm.mensaje}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div className="max-w-4xl mx-auto space-y-5">

        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <button onClick={() => navigate('/siniestros')} className="text-gray-400 hover:text-gray-700 mt-1">
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900 font-mono">{siniestro.numero}</h1>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${ESTADO_COLORS[estado]}`}>
                  {ESTADO_LABELS[estado]}
                </span>
                {siniestro.severidad && (
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERIDAD_COLORS[siniestro.severidad]}`}>
                    {SEVERIDAD_LABELS[siniestro.severidad]}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {siniestro.placa} · {siniestro.cliente_nombre} · {formatDate(siniestro.fecha_dano)}
              </p>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {estado === 'registrado' && (
              <button
                onClick={() => pedirConfirm({
                  titulo: 'Solicitar cotizaciones',
                  mensaje: 'Se cambiará el estado a "Cotizando". ¿Continuar?',
                  confirmLabel: 'Solicitar',
                  onConfirm: () => ejecutarTransicion('cotizando'),
                })}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                <ChevronRight size={15} />
                Solicitar cotizaciones
              </button>
            )}

            {estado === 'cotizando' && (
              <span className="text-sm text-gray-400 italic">Gestión en sección de cotizaciones</span>
            )}

            {estado === 'proforma_emitida' && (
              <button
                onClick={() => pedirConfirm({
                  titulo: 'Aprobar proforma',
                  mensaje: 'Se aprobará la proforma y se avanzará a "Proforma aprobada".',
                  confirmLabel: 'Aprobar',
                  onConfirm: () => ejecutarTransicion('proforma_aprobada'),
                })}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                <CheckCircle2 size={15} />
                Aprobar proforma
              </button>
            )}

            {estado === 'proforma_aprobada' && (
              <button
                onClick={() => pedirConfirm({
                  titulo: 'Ingresar a taller',
                  mensaje: `El vehículo ${siniestro.placa} se marcará como "En Reparación" en Odoo y se registrará el ingreso al taller.`,
                  confirmLabel: 'Ingresar',
                  onConfirm: () => ejecutarTransicion('en_reparacion'),
                })}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                <Wrench size={15} />
                Ingresar a taller
              </button>
            )}

            {estado === 'en_reparacion' && (
              <button
                onClick={() => pedirConfirm({
                  titulo: 'Marcar como reparado',
                  mensaje: `El vehículo ${siniestro.placa} se marcará como "Disponible" en Odoo y se cerrará el ingreso al taller.`,
                  confirmLabel: 'Confirmar',
                  onConfirm: () => ejecutarTransicion('reparado'),
                })}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                <CheckCircle2 size={15} />
                Marcar como reparado
              </button>
            )}

            {estado === 'reparado' && (
              <>
                <button
                  onClick={() => pedirConfirm({
                    titulo: 'Registrar cobro',
                    mensaje: 'Se creará el expediente de cobro al cliente.',
                    confirmLabel: 'Continuar',
                    onConfirm: () => ejecutarTransicion('en_cobro'),
                  })}
                  disabled={saving}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  Registrar cobro
                </button>
                <button
                  onClick={() => pedirConfirm({
                    titulo: 'Absorbe Pass',
                    mensaje: 'Pass Rent a Car absorberá el costo del daño. El expediente se cerrará.',
                    confirmLabel: 'Confirmar',
                    danger: true,
                    onConfirm: () => ejecutarTransicion('cerrado', { cobro: 'pass' }),
                  })}
                  disabled={saving}
                  className="px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  Absorbe Pass
                </button>
                <button
                  onClick={() => pedirConfirm({
                    titulo: 'Cubre seguro',
                    mensaje: 'El daño será cubierto por seguro. El expediente se cerrará.',
                    confirmLabel: 'Confirmar',
                    onConfirm: () => ejecutarTransicion('cerrado', { cobro: 'seguro' }),
                  })}
                  disabled={saving}
                  className="px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  Cubre seguro
                </button>
              </>
            )}

            {estado === 'en_cobro' && (
              <button
                onClick={() => pedirConfirm({
                  titulo: 'Cerrar expediente',
                  mensaje: 'Se cerrará definitivamente este expediente de daño.',
                  confirmLabel: 'Cerrar',
                  danger: true,
                  onConfirm: () => ejecutarTransicion('cerrado'),
                })}
                disabled={saving}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                Cerrar expediente
              </button>
            )}

            {/* Anular — solo admin/agente_senior, en estados activos */}
            {esAdminOSenior && !['cerrado', 'anulado'].includes(estado) && (
              <button
                onClick={() => pedirConfirm({
                  titulo: 'Anular expediente',
                  mensaje: 'Esta acción no se puede deshacer. El expediente quedará anulado.',
                  confirmLabel: 'Anular',
                  danger: true,
                  onConfirm: async () => {
                    await ejecutarTransicion('anulado')
                    if (hayTallerActivo && siniestro.odoo_product_id) {
                      await updateVehiculoStatus(siniestro.odoo_product_id, 'Disponible').catch(console.warn)
                    }
                  },
                })}
                disabled={saving}
                className="px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-sm rounded-lg disabled:opacity-50"
              >
                Anular
              </button>
            )}
          </div>
        </div>

        {/* ── Cards: Vehículo + Cliente ────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Car size={16} className="text-gray-400" />
              <h3 className="font-semibold text-gray-800 text-sm">Vehículo</h3>
            </div>
            <dl className="space-y-2 text-sm">
              <Row label="Placa" value={<span className="font-mono font-semibold">{siniestro.placa}</span>} />
              <Row label="Tipo" value={siniestro.tipo_vehiculo} />
              <Row label="Marca" value={siniestro.marca} />
              <Row label="Línea" value={siniestro.linea} />
              <Row label="Año" value={siniestro.anio} />
              <Row label="Contrato" value={<span className="font-mono">{siniestro.contrato_numero}</span>} />
              <Row label="Taller asignado" value={siniestro.talleres?.nombre} />
            </dl>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <User size={16} className="text-gray-400" />
              <h3 className="font-semibold text-gray-800 text-sm">Cliente</h3>
            </div>
            <dl className="space-y-2 text-sm">
              <Row label="Nombre" value={siniestro.cliente_nombre} bold />
              <Row label="DPI / Pasaporte" value={siniestro.cliente_dpi} />
              <Row label="NIT" value={siniestro.cliente_nit} />
              <Row label="Teléfono" value={siniestro.cliente_telefono} />
              <Row label="Correo" value={siniestro.cliente_email} />
            </dl>
          </div>
        </div>

        {/* ── Daño ────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-gray-400" />
            <h3 className="font-semibold text-gray-800 text-sm">Detalle del daño</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-4">
            <div>
              <p className="text-gray-400 text-xs mb-1">Fecha</p>
              <p className="font-medium text-gray-800">{formatDate(siniestro.fecha_dano)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-1">Lugar</p>
              <p className="font-medium text-gray-800">{siniestro.lugar_accidente || '—'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-1">Tipo</p>
              <p className="font-medium text-gray-800">{TIPO_DANO_LABELS[siniestro.tipo_dano] || siniestro.tipo_dano}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-1">Severidad</p>
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SEVERIDAD_COLORS[siniestro.severidad]}`}>
                {SEVERIDAD_LABELS[siniestro.severidad]}
              </span>
            </div>
          </div>
          {siniestro.descripcion && (
            <p className="text-sm text-gray-600 border-t border-gray-50 pt-3">{siniestro.descripcion}</p>
          )}
        </div>

        {/* ── Taller ──────────────────────────────────────────── */}
        {tallerIngresos.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Wrench size={16} className="text-gray-400" />
              <h3 className="font-semibold text-gray-800 text-sm">Taller</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="pb-2 font-medium">Taller</th>
                    <th className="pb-2 font-medium">Ingreso</th>
                    <th className="pb-2 font-medium">Egreso</th>
                    <th className="pb-2 font-medium text-center">Días</th>
                    <th className="pb-2 font-medium text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tallerIngresos.map(ti => {
                    const dias = ti.dias_en_taller ?? 0
                    const enTaller = !ti.fecha_egreso
                    return (
                      <tr key={ti.id}>
                        <td className="py-3 pr-4 text-gray-700">{ti.talleres?.nombre || '—'}</td>
                        <td className="py-3 pr-4 text-gray-600">{formatDate(ti.fecha_ingreso)}</td>
                        <td className="py-3 pr-4 text-gray-600">
                          {enTaller
                            ? <span className="text-amber-600 font-medium">En taller</span>
                            : formatDate(ti.fecha_egreso)}
                        </td>
                        <td className="py-3 pr-4 text-center font-semibold text-gray-800">{dias}</td>
                        <td className="py-3 text-center">
                          <span className={`inline-block w-3 h-3 rounded-full ${semaforoColor(dias)}`} title={`${dias} días`} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Semáforo: <span className="text-green-600 font-medium">Verde</span> 0-2 días ·{' '}
              <span className="text-amber-500 font-medium">Amarillo</span> 3-5 días ·{' '}
              <span className="text-red-500 font-medium">Rojo</span> 6+ días
            </p>
          </div>
        )}

        {/* ── Historial ───────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} className="text-gray-400" />
            <h3 className="font-semibold text-gray-800 text-sm">Historial de estados</h3>
          </div>
          {timeline.length === 0 ? (
            <p className="text-sm text-gray-400">Sin historial de cambios</p>
          ) : (
            <ol className="relative border-l border-gray-200 space-y-5 ml-3">
              {timeline.map((item, idx) => {
                const Icon = ESTADO_ICON[item.estado_nuevo] ?? Clock
                const isLast = idx === timeline.length - 1
                return (
                  <li key={item.id} className="ml-5">
                    <div className={`absolute -left-[11px] flex items-center justify-center w-5 h-5 rounded-full border-2 border-white ${isLast ? 'bg-red-600' : 'bg-gray-300'}`}>
                      <Icon size={11} className={isLast ? 'text-white' : 'text-white'} />
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

      </div>
    </>
  )
}

// ── Helper interno ────────────────────────────────────────────
function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-400 shrink-0">{label}</dt>
      <dd className={`text-right ${bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
        {value || '—'}
      </dd>
    </div>
  )
}
