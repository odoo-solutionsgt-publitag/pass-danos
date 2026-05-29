import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  Car, FileText, User, Calendar, Phone, Mail, Hash,
  AlertTriangle, Wrench, Clock, Plus, Printer, ExternalLink, RefreshCw,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fetchVehiculo } from '../lib/odoo-api'
import { siniestrosQuery, ordenesServicioQuery } from '../lib/queries'
import { usePermisos } from '../hooks/usePermisos'

const SEVERIDAD_COLORS = {
  leve:          'bg-green-100 text-green-700',
  medio:         'bg-amber-100 text-amber-700',
  severo:        'bg-red-100 text-red-700',
  perdida_total: 'bg-red-900 text-red-100',
}

const ESTADO_SIN_COLORS = {
  registrado:        'bg-gray-100 text-gray-700',
  cotizando:         'bg-amber-100 text-amber-700',
  proforma_emitida:  'bg-amber-100 text-amber-700',
  proforma_aprobada: 'bg-blue-100 text-blue-700',
  en_reparacion:     'bg-red-100 text-red-700',
  reparado:          'bg-teal-100 text-teal-700',
  en_cobro:          'bg-purple-100 text-purple-700',
  cerrado:           'bg-green-100 text-green-700',
  anulado:           'bg-gray-100 text-gray-500',
}

const ESTADO_SRV_COLORS = {
  programado: 'bg-gray-100 text-gray-700',
  aprobado:   'bg-blue-100 text-blue-700',
  en_proceso: 'bg-amber-100 text-amber-700',
  completado: 'bg-green-100 text-green-700',
  cancelado:  'bg-red-100 text-red-500',
}

const STATUS_COLORS = {
  'Disponible':       'bg-green-100 text-green-700 border-green-200',
  'Rentado':          'bg-blue-100 text-blue-700 border-blue-200',
  'En Reparación':    'bg-red-100 text-red-700 border-red-200',
  'En Mantenimiento': 'bg-amber-100 text-amber-700 border-amber-200',
  'Servicios Varios': 'bg-orange-100 text-orange-700 border-orange-200',
}

function fmt(n) {
  return `Q ${Number(n || 0).toLocaleString('es-GT', { minimumFractionDigits: 2 })}`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function BitacoraVehiculo() {
  const { placa } = useParams()
  const navigate = useNavigate()
  const { puedeCrear } = usePermisos()

  const [odooData, setOdooData] = useState(null)
  const [siniestros, setSinies] = useState([])
  const [servicios, setServicios] = useState([])
  const [documentos, setDocumentos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { loadAll() }, [placa])

  async function loadAll() {
    if (!placa) return
    setLoading(true)
    setError('')
    try {
      const placaUp = placa.toUpperCase()
      const [odooRes, sinRes, srvRes] = await Promise.all([
        fetchVehiculo(placaUp).catch(err => ({ _err: err.message })),
        siniestrosQuery('id, numero, fecha_dano, tipo_dano, severidad, estado, descripcion, monto_cliente, costo_pass, margen, lugar_accidente')
          .eq('placa', placaUp)
          .order('created_at', { ascending: false }),
        ordenesServicioQuery('id, numero, fecha_programada, tipo_servicio, estado, total_general, kilometraje, descripcion, talleres(nombre)')
          .eq('placa', placaUp)
          .order('created_at', { ascending: false }),
      ])

      if (odooRes._err) setError(odooRes._err)
      else setOdooData(odooRes)

      const sinies = sinRes.data ?? []
      const servs = srvRes.data ?? []
      setSinies(sinies)
      setServicios(servs)

      // documentos del vehículo (vinculados a sus siniestros o servicios)
      const sinIds = sinies.map(s => s.id)
      const srvIds = servs.map(s => s.id)
      if (sinIds.length || srvIds.length) {
        const filters = []
        if (sinIds.length) filters.push(`siniestro_id.in.(${sinIds.join(',')})`)
        if (srvIds.length) filters.push(`orden_servicio_id.in.(${srvIds.join(',')})`)
        const { data: docs } = await supabase
          .from('documentos')
          .select('id, tipo, nombre_archivo, storage_path, mime_type, created_at, siniestro_id, orden_servicio_id, siniestros(numero), ordenes_servicio(numero), cotizaciones(talleres(nombre))')
          .or(filters.join(','))
          .order('created_at', { ascending: false })
          .limit(100)
        setDocumentos(docs ?? [])
      } else {
        setDocumentos([])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function descargarDoc(doc) {
    const { data, error } = await supabase.storage.from('documentos').createSignedUrl(doc.storage_path, 60)
    if (error) { alert('Error: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  const v = odooData?.vehiculo
  const contrato = odooData?.contrato

  // KPIs
  const totalDanos = siniestros.length
  const totalServ  = servicios.length
  const costoTotal = siniestros.reduce((s, x) => s + Number(x.costo_pass || 0), 0)
                   + servicios.reduce((s, x) => s + Number(x.total_general || 0), 0)
  const ultimoEvento = [...siniestros.map(s => s.fecha_dano), ...servicios.map(s => s.fecha_programada)]
    .filter(Boolean).sort().reverse()[0]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl flex items-center justify-center">
              <Car size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">{placa?.toUpperCase()}</h1>
              <p className="text-sm text-gray-500">
                {v ? [v.marca, v.linea, v.anio].filter(Boolean).join(' ') || v.tipo_vehiculo : 'Cargando vehículo...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {v?.status && (
              <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[v.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {v.status}
              </span>
            )}
            <button
              onClick={loadAll}
              disabled={loading}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg border border-gray-200"
              title="Actualizar"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-2 rounded-lg">
            No se pudo cargar info Odoo: {error}
          </div>
        )}
      </div>

      {/* Vehículo + Contrato */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Car size={15} className="text-gray-400" /> Vehículo
          </h2>
          {v ? (
            <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
              <Dato label="Tipo" value={v.tipo_vehiculo} />
              <Dato label="Marca" value={v.marca} />
              <Dato label="Línea" value={v.linea} />
              <Dato label="Año" value={v.anio} />
              <Dato label="Estado actual" value={v.status} />
              <Dato label="Odoo ID" value={v.odoo_id} mono />
            </dl>
          ) : loading ? (
            <div className="h-24 bg-gray-50 animate-pulse rounded" />
          ) : (
            <p className="text-sm text-gray-400">Sin información de Odoo</p>
          )}
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <FileText size={15} className="text-gray-400" /> Contrato activo
          </h2>
          {contrato ? (
            <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
              <Dato label="Contrato" value={contrato.contrato_numero} mono />
              <Dato label="Fecha" value={formatDate(contrato.fecha_orden)} />
              <Dato label="Cliente" value={contrato.cliente_nombre} bold className="col-span-2" />
              {contrato.cliente_dpi && <Dato label="DPI" value={contrato.cliente_dpi} icon={Hash} />}
              {contrato.cliente_telefono && <Dato label="Teléfono" value={contrato.cliente_telefono} icon={Phone} />}
              {contrato.cliente_email && <Dato label="Correo" value={contrato.cliente_email} icon={Mail} className="col-span-2" />}
            </dl>
          ) : loading ? (
            <div className="h-24 bg-gray-50 animate-pulse rounded" />
          ) : (
            <p className="text-sm text-gray-400 italic">Sin contrato de renta activo</p>
          )}
        </section>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiBox icon={AlertTriangle} label="Daños"     value={totalDanos} color="bg-red-50 text-red-700 border-red-200" />
        <KpiBox icon={Wrench}        label="Servicios" value={totalServ}  color="bg-blue-50 text-blue-700 border-blue-200" />
        <KpiBox icon={Calendar}      label="Último evento" value={formatDate(ultimoEvento)} color="bg-gray-50 text-gray-700 border-gray-200" small />
        <KpiBox icon={FileText}      label="Costo total Pass" value={fmt(costoTotal)} color="bg-slate-50 text-slate-900 border-slate-300" small />
      </div>

      {/* Acciones rápidas */}
      <div className="flex gap-2 flex-wrap">
        {puedeCrear && (
          <>
            <button
              onClick={() => navigate('/siniestros/nuevo')}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              <Plus size={15} /> Registrar daño
            </button>
            <button
              onClick={() => navigate('/servicios/nuevo')}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              <Wrench size={15} /> Nueva orden
            </button>
          </>
        )}
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-4 py-2 rounded-lg"
        >
          <Printer size={15} /> Imprimir bitácora
        </button>
      </div>

      {/* Historial de Daños */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <AlertTriangle size={15} className="text-red-500" />
          <h2 className="text-sm font-semibold text-gray-800">Historial de daños</h2>
          <span className="text-xs text-gray-400">({siniestros.length})</span>
        </div>
        {siniestros.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">Sin daños registrados</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500">
                <th className="text-left px-5 py-2 font-medium">No.</th>
                <th className="text-left px-5 py-2 font-medium">Fecha</th>
                <th className="text-left px-5 py-2 font-medium">Tipo</th>
                <th className="text-left px-5 py-2 font-medium">Severidad</th>
                <th className="text-left px-5 py-2 font-medium">Estado</th>
                <th className="text-right px-5 py-2 font-medium">Costo Pass</th>
                <th className="px-5 py-2 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {siniestros.map(s => (
                <tr key={s.id} onClick={() => navigate(`/siniestros/${s.id}`)} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-5 py-2.5 font-semibold text-red-600">{s.numero}</td>
                  <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(s.fecha_dano)}</td>
                  <td className="px-5 py-2.5 text-gray-700 capitalize">{s.tipo_dano?.replace(/_/g, ' ')}</td>
                  <td className="px-5 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEVERIDAD_COLORS[s.severidad]}`}>
                      {s.severidad?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_SIN_COLORS[s.estado]}`}>
                      {s.estado?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-right text-gray-700 whitespace-nowrap">{fmt(s.costo_pass)}</td>
                  <td className="px-5 py-2.5">
                    <ExternalLink size={14} className="text-gray-300" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Historial de Servicios */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Wrench size={15} className="text-blue-500" />
          <h2 className="text-sm font-semibold text-gray-800">Historial de servicios</h2>
          <span className="text-xs text-gray-400">({servicios.length})</span>
        </div>
        {servicios.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">Sin servicios registrados</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500">
                <th className="text-left px-5 py-2 font-medium">No.</th>
                <th className="text-left px-5 py-2 font-medium">Fecha</th>
                <th className="text-left px-5 py-2 font-medium">Tipo</th>
                <th className="text-left px-5 py-2 font-medium">Taller</th>
                <th className="text-left px-5 py-2 font-medium">Km</th>
                <th className="text-left px-5 py-2 font-medium">Estado</th>
                <th className="text-right px-5 py-2 font-medium">Total</th>
                <th className="px-5 py-2 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {servicios.map(o => (
                <tr key={o.id} onClick={() => navigate(`/servicios/${o.id}`)} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-5 py-2.5 font-semibold text-blue-600">{o.numero}</td>
                  <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(o.fecha_programada)}</td>
                  <td className="px-5 py-2.5 text-gray-700 capitalize">{o.tipo_servicio?.replace(/_/g, ' ')}</td>
                  <td className="px-5 py-2.5 text-gray-600">{o.talleres?.nombre || '—'}</td>
                  <td className="px-5 py-2.5 text-gray-600 text-xs">{o.kilometraje ? `${Number(o.kilometraje).toLocaleString('es-GT')} km` : '—'}</td>
                  <td className="px-5 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_SRV_COLORS[o.estado]}`}>
                      {o.estado?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-right text-gray-700 whitespace-nowrap">{fmt(o.total_general)}</td>
                  <td className="px-5 py-2.5">
                    <ExternalLink size={14} className="text-gray-300" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Documentos */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <FileText size={15} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-800">Expediente documental</h2>
          <span className="text-xs text-gray-400">({documentos.length})</span>
        </div>
        {documentos.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">Sin documentos adjuntos</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {documentos.map(d => {
              const numero = d.siniestros?.numero || d.ordenes_servicio?.numero || ''
              return (
                <li key={d.id} className="px-5 py-2.5 hover:bg-gray-50 flex items-center gap-3">
                  <FileText size={15} className={d.mime_type === 'application/pdf' ? 'text-red-400' : 'text-gray-400'} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{d.nombre_archivo}</p>
                    <p className="text-xs text-gray-500">
                      {d.tipo?.replace(/_/g, ' ')} · {numero} · {d.cotizaciones?.talleres?.nombre ? `Proveedor: ${d.cotizaciones.talleres.nombre} · ` : ''}{formatDate(d.created_at)}
                    </p>
                  </div>
                  <button onClick={() => descargarDoc(d)} className="text-xs text-blue-600 hover:underline">Ver</button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function Dato({ label, value, bold, mono, icon: Icon, className = '' }) {
  return (
    <div className={className}>
      <p className="text-xs text-gray-400 mb-0.5 flex items-center gap-1">
        {Icon && <Icon size={11} />}
        {label}
      </p>
      <p className={`${bold ? 'font-semibold text-gray-900' : 'text-gray-800'} ${mono ? 'font-mono text-xs' : ''}`}>
        {value || '—'}
      </p>
    </div>
  )
}

function KpiBox({ icon: Icon, label, value, color, small }) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} />
        <p className="text-xs font-medium opacity-80">{label}</p>
      </div>
      <p className={small ? 'text-lg font-bold' : 'text-2xl font-bold'}>{value}</p>
    </div>
  )
}
