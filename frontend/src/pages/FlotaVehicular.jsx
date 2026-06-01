import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Search, X, Car, Calendar, User, Phone, Mail, FileText, AlertCircle } from 'lucide-react'
import { fetchVehiculos, fetchVehiculo } from '../lib/odoo-api'
import { supabase } from '../lib/supabase'
import { siniestrosQuery, ordenesServicioQuery } from '../lib/queries'
import { usePermisos } from '../hooks/usePermisos'
import { formatDate as fmtDateLib } from '../lib/fecha'

const STATUS_COLORS = {
  'Disponible':            { card: 'bg-green-50 border-green-200',  badge: 'bg-green-100 text-green-700 border-green-200',  dot: 'bg-green-500'  },
  'Rentado':               { card: 'bg-blue-50 border-blue-200',    badge: 'bg-blue-100 text-blue-700 border-blue-200',    dot: 'bg-blue-500'   },
  'En Reparación':         { card: 'bg-red-50 border-red-200',      badge: 'bg-red-100 text-red-700 border-red-200',      dot: 'bg-red-500'    },
  'En Mantenimiento':      { card: 'bg-amber-50 border-amber-200',  badge: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500'  },
  'Servicios Varios':      { card: 'bg-orange-50 border-orange-200',badge: 'bg-orange-100 text-orange-700 border-orange-200',dot: 'bg-orange-500'},
  'Vehículo No Asegurado': { card: 'bg-gray-50 border-gray-200',    badge: 'bg-gray-100 text-gray-700 border-gray-200',    dot: 'bg-gray-400'   },
  'Asignado al personal':  { card: 'bg-purple-50 border-purple-200',badge: 'bg-purple-100 text-purple-700 border-purple-200',dot: 'bg-purple-500'},
  'No aplica':             { card: 'bg-gray-50 border-gray-200',    badge: 'bg-gray-100 text-gray-500 border-gray-200',    dot: 'bg-gray-300'   },
}

const STATUS_ORDER = [
  'Disponible', 'Rentado', 'En Reparación', 'En Mantenimiento',
  'Servicios Varios', 'Vehículo No Asegurado', 'Asignado al personal', 'No aplica',
]

const KPI_STATUSES = ['Disponible', 'Rentado', 'En Reparación', 'En Mantenimiento']

const TIPO_VEHICULO_ORDER = ['Económico', 'Sedán', 'Pickup', 'SUV/Camioneta', 'Microbus', 'Camión', 'Cotización', 'N/A']

const TIPO_VEHICULO_COLORS = {
  'Económico':     { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  'Sedán':         { badge: 'bg-sky-100 text-sky-700 border-sky-200',             dot: 'bg-sky-500'     },
  'Pickup':        { badge: 'bg-orange-100 text-orange-700 border-orange-200',    dot: 'bg-orange-500'  },
  'SUV/Camioneta': { badge: 'bg-purple-100 text-purple-700 border-purple-200',    dot: 'bg-purple-500'  },
  'Microbus':      { badge: 'bg-pink-100 text-pink-700 border-pink-200',          dot: 'bg-pink-500'    },
  'Camión':        { badge: 'bg-amber-100 text-amber-700 border-amber-200',       dot: 'bg-amber-500'   },
  'Cotización':    { badge: 'bg-indigo-100 text-indigo-700 border-indigo-200',    dot: 'bg-indigo-500'  },
  'N/A':           { badge: 'bg-gray-100 text-gray-500 border-gray-200',          dot: 'bg-gray-300'    },
}

export default function FlotaVehicular() {
  const [vehiculos, setVehiculos] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  const [busqueda, setBusqueda]     = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [vistaPor, setVistaPor]     = useState('estado')  // 'estado' | 'tipo'

  const [seleccionado, setSeleccionado] = useState(null)

  useEffect(() => { loadFlota() }, [])

  async function loadFlota() {
    setLoading(true)
    setError('')
    try {
      const data = await fetchVehiculos()
      setVehiculos(data.vehiculos ?? [])
    } catch (err) {
      setError('No se pudo cargar la flota. Verifique la conexión al backend.')
    } finally {
      setLoading(false)
    }
  }

  const tipos = Array.from(new Set(vehiculos.map(v => v.tipo_vehiculo).filter(Boolean))).sort()

  const vehiculosFiltrados = vehiculos.filter(v => {
    if (filtroTipo && v.tipo_vehiculo !== filtroTipo) return false
    if (busqueda) {
      const b = busqueda.toLowerCase()
      if (!v.placa?.toLowerCase().includes(b) && !v.nombre?.toLowerCase().includes(b)) return false
    }
    return true
  })

  const agrupadoPor = vistaPor === 'tipo' ? 'tipo_vehiculo' : 'status'
  const ordenGrupos = vistaPor === 'tipo' ? TIPO_VEHICULO_ORDER : STATUS_ORDER
  const coloresGrupos = vistaPor === 'tipo' ? TIPO_VEHICULO_COLORS : STATUS_COLORS

  const porGrupo = ordenGrupos.reduce((acc, key) => {
    const grupo = vehiculosFiltrados.filter(v => v[agrupadoPor] === key)
    if (grupo.length > 0) acc[key] = grupo
    return acc
  }, {})

  const sinClasificar = vehiculosFiltrados.filter(v => !v[agrupadoPor] || !ordenGrupos.includes(v[agrupadoPor]))
  if (sinClasificar.length > 0) porGrupo[vistaPor === 'tipo' ? 'Sin tipo' : 'Sin estado'] = sinClasificar

  const contadores = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = vehiculos.filter(v => v.status === s).length
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Flota Vehicular</h1>
          <p className="text-sm text-gray-500">
            {loading ? 'Cargando...' : `${vehiculos.length} vehículos en flota`}
            {vehiculosFiltrados.length !== vehiculos.length && ` · ${vehiculosFiltrados.length} mostrados`}
          </p>
        </div>
        <button
          onClick={loadFlota}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {KPI_STATUSES.map(s => {
          const colors = STATUS_COLORS[s]
          return (
            <div key={s} className={`rounded-xl border p-4 ${colors.card}`}>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                <p className="text-xs text-gray-600 font-medium">{s}</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">{contadores[s] ?? 0}</p>
            </div>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por placa..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
          />
        </div>
        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-red-500 text-gray-600"
        >
          <option value="">Todos los tipos</option>
          {tipos.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <div className="inline-flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setVistaPor('estado')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              vistaPor === 'estado' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-600'
            }`}
          >
            Por estado
          </button>
          <button
            onClick={() => setVistaPor('tipo')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              vistaPor === 'tipo' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-600'
            }`}
          >
            Por tipo
          </button>
        </div>

        {(busqueda || filtroTipo) && (
          <button
            onClick={() => { setBusqueda(''); setFiltroTipo('') }}
            className="text-sm text-gray-500 hover:text-gray-700 px-3"
          >
            Limpiar
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse h-24" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(porGrupo).map(([key, grupo]) => {
            const colors = coloresGrupos[key] ?? STATUS_COLORS['No aplica']
            return (
              <div key={key}>
                <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${colors.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                    {key}
                  </span>
                  <span className="text-gray-400 font-normal">
                    {grupo.length} vehículo{grupo.length !== 1 ? 's' : ''}
                  </span>
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
                  {grupo.map(v => (
                    <button
                      key={v.odoo_id}
                      onClick={() => setSeleccionado(v)}
                      className="bg-white rounded-lg border border-gray-100 shadow-sm p-3 hover:shadow-md hover:border-gray-200 transition-all text-left"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                        <p className="font-bold text-gray-900 text-sm">{v.placa || '—'}</p>
                      </div>
                      <p className="text-gray-500 text-xs truncate mt-1">
                        {vistaPor === 'tipo' ? (v.status || 'Sin estado') : (v.tipo_vehiculo || 'Vehículo')}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          {vehiculosFiltrados.length === 0 && !error && (
            <div className="text-center py-16 text-gray-400">No se encontraron vehículos con los filtros aplicados</div>
          )}
        </div>
      )}

      {seleccionado && (
        <VehiculoDrawer
          vehiculo={seleccionado}
          onClose={() => setSeleccionado(null)}
        />
      )}
    </div>
  )
}

function VehiculoDrawer({ vehiculo, onClose }) {
  const navigate = useNavigate()
  const { puedeCrear } = usePermisos()
  const [detalle, setDetalle]     = useState(null)
  const [siniestros, setSinies]   = useState([])
  const [servicios, setServicios] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  useEffect(() => {
    if (!vehiculo?.placa) return
    let cancel = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const [detalleRes, sinRes, srvRes] = await Promise.all([
          fetchVehiculo(vehiculo.placa).catch(err => ({ _err: err.message })),
          siniestrosQuery('id,numero,fecha_dano,tipo_dano,severidad,estado,total_general:costo_pass')
            .eq('placa', vehiculo.placa)
            .order('created_at', { ascending: false })
            .limit(10),
          ordenesServicioQuery('id,numero,fecha_programada,tipo_servicio,estado,total_general')
            .eq('placa', vehiculo.placa)
            .order('created_at', { ascending: false })
            .limit(10),
        ])
        if (cancel) return
        if (detalleRes._err) setError(detalleRes._err)
        else setDetalle(detalleRes)
        setSinies(sinRes.data ?? [])
        setServicios(srvRes.data ?? [])
      } catch (err) {
        if (!cancel) setError(err.message)
      } finally {
        if (!cancel) setLoading(false)
      }
    }
    load()
    return () => { cancel = true }
  }, [vehiculo?.placa])

  const colors = STATUS_COLORS[vehiculo.status] ?? STATUS_COLORS['No aplica']
  const contrato = detalle?.contrato

  function formatDate(iso) {
    return fmtDateLib(iso) ?? '—'
  }

  function formatMonto(v) {
    if (!v) return '—'
    return `Q ${Number(v).toLocaleString('es-GT', { minimumFractionDigits: 2 })}`
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />
      <div className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Car size={18} className="text-gray-400" />
              <h2 className="font-bold text-gray-900">{vehiculo.placa || '—'}</h2>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{vehiculo.tipo_vehiculo || 'Vehículo'}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-700"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${colors.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
              {vehiculo.status || 'Sin estado'}
            </span>
          </div>

          {error && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-2 rounded-lg">
              No se pudo cargar el detalle desde Odoo: {error}
            </div>
          )}

          {/* Contrato activo */}
          {loading ? (
            <div className="h-24 bg-gray-50 rounded-xl animate-pulse" />
          ) : contrato ? (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-blue-900 font-semibold text-sm">
                <FileText size={15} />
                Contrato activo: {contrato.contrato_numero || contrato.reservacion_numero || contrato.numero}
              </div>
              <div className="text-sm space-y-1.5 text-gray-700">
                <p className="flex items-center gap-2"><User size={13} className="text-gray-400" /> {contrato.cliente_nombre || '—'}</p>
                {contrato.cliente_telefono && <p className="flex items-center gap-2"><Phone size={13} className="text-gray-400" /> {contrato.cliente_telefono}</p>}
                {contrato.cliente_email && <p className="flex items-center gap-2"><Mail size={13} className="text-gray-400" /> {contrato.cliente_email}</p>}
                <p className="flex items-center gap-2 text-gray-500 text-xs"><Calendar size={13} className="text-gray-400" /> {formatDate(contrato.fecha_orden)}</p>
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-400 italic px-3 py-2 border border-dashed border-gray-200 rounded-lg">
              Sin contrato de renta activo
            </div>
          )}

          {/* Historial de daños */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Historial de daños</h3>
              <span className="text-xs text-gray-400">{siniestros.length}</span>
            </div>
            {siniestros.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Sin daños registrados</p>
            ) : (
              <div className="space-y-1.5">
                {siniestros.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { onClose(); navigate(`/siniestros/${s.id}`) }}
                    className="w-full bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-lg px-3 py-2 text-left transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-blue-600">{s.numero}</span>
                      <span className="text-xs text-gray-500">{formatDate(s.fecha_dano)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs text-gray-500 truncate">{s.tipo_dano?.replace(/_/g, ' ')} · {s.severidad}</span>
                      <span className="text-xs text-gray-600 whitespace-nowrap">{formatMonto(s.total_general)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Historial de servicios */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Historial de servicios</h3>
              <span className="text-xs text-gray-400">{servicios.length}</span>
            </div>
            {servicios.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Sin servicios registrados</p>
            ) : (
              <div className="space-y-1.5">
                {servicios.map(o => (
                  <button
                    key={o.id}
                    onClick={() => { onClose(); navigate(`/servicios/${o.id}`) }}
                    className="w-full bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-lg px-3 py-2 text-left transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-blue-600">{o.numero}</span>
                      <span className="text-xs text-gray-500">{formatDate(o.fecha_programada)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs text-gray-500 truncate">{o.tipo_servicio?.replace(/_/g, ' ')} · {o.estado}</span>
                      <span className="text-xs text-gray-600 whitespace-nowrap">{formatMonto(o.total_general)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-gray-100 space-y-2">
            <button
              onClick={() => { onClose(); navigate(`/bitacora/${vehiculo.placa}`) }}
              className="w-full text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg flex items-center justify-center gap-2"
            >
              <FileText size={14} /> Ver bitácora completa
            </button>
            {puedeCrear && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { onClose(); navigate('/siniestros/nuevo', { state: { placa: vehiculo.placa } }) }}
                  className="text-sm bg-red-600 hover:bg-red-700 text-white font-medium py-2 rounded-lg"
                >
                  + Daño
                </button>
                <button
                  onClick={() => { onClose(); navigate('/servicios/nuevo', { state: { placa: vehiculo.placa } }) }}
                  className="text-sm bg-gray-900 hover:bg-gray-800 text-white font-medium py-2 rounded-lg"
                >
                  + Servicio
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
