import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { fetchVehiculos } from '../lib/odoo-api'

const STATUS_COLORS = {
  'Disponible': 'bg-green-100 text-green-700 border-green-200',
  'Rentado': 'bg-blue-100 text-blue-700 border-blue-200',
  'En Reparación': 'bg-red-100 text-red-700 border-red-200',
  'En Mantenimiento': 'bg-amber-100 text-amber-700 border-amber-200',
  'Servicios Varios': 'bg-orange-100 text-orange-700 border-orange-200',
  'Vehículo No Asegurado': 'bg-gray-100 text-gray-700 border-gray-200',
  'Asignado al personal': 'bg-purple-100 text-purple-700 border-purple-200',
  'No aplica': 'bg-gray-100 text-gray-500 border-gray-200',
}

const STATUS_ORDER = [
  'Disponible', 'Rentado', 'En Reparación', 'En Mantenimiento',
  'Servicios Varios', 'Vehículo No Asegurado', 'Asignado al personal', 'No aplica',
]

export default function FlotaVehicular() {
  const [vehiculos, setVehiculos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  const porStatus = STATUS_ORDER.reduce((acc, status) => {
    const grupo = vehiculos.filter(v => v.status === status)
    if (grupo.length > 0) acc[status] = grupo
    return acc
  }, {})

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
            {loading ? 'Cargando...' : `${vehiculos.length} vehículos`}
            {!loading && contadores['Disponible'] > 0 && ` · Disponible: ${contadores['Disponible']}`}
            {!loading && contadores['Rentado'] > 0 && ` · Rentado: ${contadores['Rentado']}`}
            {!loading && contadores['En Reparación'] > 0 && ` · Reparación: ${contadores['En Reparación']}`}
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

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
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
          {Object.entries(porStatus).map(([status, grupo]) => (
            <div key={status}>
              <h2 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${STATUS_COLORS[status]}`}>
                  {status}
                </span>
                <span className="text-gray-400 font-normal">{grupo.length} vehículo{grupo.length !== 1 ? 's' : ''}</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
                {grupo.map(v => (
                  <div
                    key={v.odoo_id}
                    className="bg-white rounded-lg border border-gray-100 shadow-sm p-3 hover:shadow-md transition-shadow cursor-default"
                  >
                    <p className="font-bold text-gray-900 text-sm">{v.placa}</p>
                    <p className="text-gray-500 text-xs truncate">{v.tipo_vehiculo || 'Vehículo'}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {vehiculos.length === 0 && !error && (
            <div className="text-center py-16 text-gray-400">No hay vehículos disponibles</div>
          )}
        </div>
      )}
    </div>
  )
}
