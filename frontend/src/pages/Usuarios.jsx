import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Shield, Eye, Pencil, Plus, Trash2, Search,
  CheckCircle2, Circle, AlertTriangle, RefreshCw, Save, X, EyeOff,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../hooks/usePermisos'
import { formatDateTime as fmtDateTimeLib } from '../lib/fecha'

const ROLES = [
  { value: 'admin',         label: 'Admin',         color: 'bg-red-100 text-red-700' },
  { value: 'agente_senior', label: 'Agente Senior', color: 'bg-purple-100 text-purple-700' },
  { value: 'agente',        label: 'Agente',        color: 'bg-blue-100 text-blue-700' },
  { value: 'operaciones',   label: 'Operaciones',   color: 'bg-amber-100 text-amber-700' },
  { value: 'readonly',      label: 'Solo lectura',  color: 'bg-gray-100 text-gray-600' },
]

const PRESETS = [
  {
    key: 'solo_lectura',
    label: 'Solo lectura',
    description: 'Solo puede ver información',
    permisos: { crear: false, editar: false, ver: true, eliminar: false, ver_anulados: false },
    rolSugerido: 'readonly',
  },
  {
    key: 'operacion',
    label: 'Operación',
    description: 'Puede crear y editar (uso diario)',
    permisos: { crear: true, editar: true, ver: true, eliminar: false, ver_anulados: false },
    rolSugerido: 'agente',
  },
  {
    key: 'supervisor',
    label: 'Supervisor',
    description: 'Operación + eliminación',
    permisos: { crear: true, editar: true, ver: true, eliminar: true, ver_anulados: false },
    rolSugerido: 'agente_senior',
  },
  {
    key: 'admin',
    label: 'Administrador',
    description: 'Todos los permisos',
    permisos: { crear: true, editar: true, ver: true, eliminar: true, ver_anulados: true },
    rolSugerido: 'admin',
  },
]

export default function Usuarios() {
  const navigate = useNavigate()
  const { esAdmin, loading: authLoading } = usePermisos()

  const [perfiles, setPerfiles] = useState([])
  const [loading, setLoading]   = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroRol, setFiltroRol] = useState('')
  const [filtroActivo, setFiltroActivo] = useState('all') // all | activos | inactivos

  const [editando, setEditando] = useState(null)

  // Redirect si no es admin
  useEffect(() => {
    if (!authLoading && !esAdmin) {
      navigate('/', { replace: true })
    }
  }, [authLoading, esAdmin, navigate])

  useEffect(() => { if (esAdmin) load() }, [esAdmin])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('perfiles')
      .select('*')
      .order('nombre_completo', { ascending: true })
    if (error) console.error(error)
    setPerfiles(data ?? [])
    setLoading(false)
  }

  const filtrados = perfiles.filter(p => {
    if (filtroRol && p.rol !== filtroRol) return false
    if (filtroActivo === 'activos' && !p.activo) return false
    if (filtroActivo === 'inactivos' && p.activo) return false
    if (busqueda) {
      const b = busqueda.toLowerCase()
      return (p.nombre_completo ?? '').toLowerCase().includes(b)
    }
    return true
  })

  function formatDate(iso) {
    return fmtDateTimeLib(iso) ?? '—'
  }

  if (authLoading) return <div className="p-8 text-center text-gray-400">Cargando...</div>
  if (!esAdmin) return null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={20} className="text-gray-400" /> Usuarios y permisos
          </h1>
          <p className="text-sm text-gray-500">
            {loading ? 'Cargando...' : `${filtrados.length} de ${perfiles.length} usuarios`}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800 flex items-start gap-2">
        <Shield size={16} className="shrink-0 mt-0.5" />
        <div>
          Los usuarios entran a la app vía <strong>SSO de Odoo</strong>. Cada usuario nuevo se crea
          automáticamente como <strong>"Solo lectura"</strong> al primer login. Desde aquí puede
          promover permisos para que opere. Para agregar nuevos usuarios, hágalo en Odoo y marque
          el checkbox <em>"Puede acceder a Gestión de Daños"</em> en su ficha.
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
          />
        </div>
        <select
          value={filtroRol}
          onChange={e => setFiltroRol(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-red-500 text-gray-600"
        >
          <option value="">Todos los roles</option>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select
          value={filtroActivo}
          onChange={e => setFiltroActivo(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-red-500 text-gray-600"
        >
          <option value="all">Activos e inactivos</option>
          <option value="activos">Solo activos</option>
          <option value="inactivos">Solo inactivos</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Usuario</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Rol</th>
                <th className="text-center px-3 py-3 text-xs text-gray-500 font-medium">
                  <span title="Crear"><Plus size={13} className="inline" /></span>
                </th>
                <th className="text-center px-3 py-3 text-xs text-gray-500 font-medium">
                  <span title="Editar"><Pencil size={13} className="inline" /></span>
                </th>
                <th className="text-center px-3 py-3 text-xs text-gray-500 font-medium">
                  <span title="Ver"><Eye size={13} className="inline" /></span>
                </th>
                <th className="text-center px-3 py-3 text-xs text-gray-500 font-medium">
                  <span title="Eliminar"><Trash2 size={13} className="inline" /></span>
                </th>
                <th className="text-center px-3 py-3 text-xs text-gray-500 font-medium">
                  <span title="Ver anulados/cancelados"><EyeOff size={13} className="inline" /></span>
                </th>
                <th className="text-center px-5 py-3 text-xs text-gray-500 font-medium">Activo</th>
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Creado</th>
                <th className="px-5 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-3.5 bg-gray-100 rounded animate-pulse w-16" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center text-gray-400">
                    No se encontraron usuarios
                  </td>
                </tr>
              ) : (
                filtrados.map(p => {
                  const rolInfo = ROLES.find(r => r.value === p.rol) ?? { label: p.rol, color: 'bg-gray-100 text-gray-600' }
                  const perm = p.permisos ?? { crear: false, editar: false, ver: true, eliminar: false }
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-900">{p.nombre_completo || '—'}</p>
                        <p className="text-xs text-gray-400 font-mono truncate max-w-[200px]">{p.id}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${rolInfo.color}`}>
                          {rolInfo.label}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-center"><PermCheck v={perm.crear} /></td>
                      <td className="px-3 py-3.5 text-center"><PermCheck v={perm.editar} /></td>
                      <td className="px-3 py-3.5 text-center"><PermCheck v={perm.ver} /></td>
                      <td className="px-3 py-3.5 text-center"><PermCheck v={perm.eliminar} danger /></td>
                      <td className="px-3 py-3.5 text-center"><PermCheck v={perm.ver_anulados} /></td>
                      <td className="px-5 py-3.5 text-center">
                        {p.activo
                          ? <CheckCircle2 size={16} className="text-green-600 inline" />
                          : <X size={16} className="text-red-500 inline" />
                        }
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 text-xs whitespace-nowrap">{formatDate(p.created_at)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => setEditando(p)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Editar permisos"
                        >
                          <Pencil size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editando && (
        <UsuarioModal
          perfil={editando}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); load() }}
        />
      )}
    </div>
  )
}

function PermCheck({ v, danger }) {
  if (v) {
    return <CheckCircle2 size={16} className={danger ? 'text-red-500 inline' : 'text-green-600 inline'} />
  }
  return <Circle size={14} className="text-gray-300 inline" />
}

// ============================================================
// Modal de edición de permisos
// ============================================================

function UsuarioModal({ perfil, onClose, onSaved }) {
  const [rol, setRol]           = useState(perfil.rol || 'readonly')
  const [activo, setActivo]     = useState(perfil.activo ?? true)
  const [permisos, setPermisos] = useState(perfil.permisos ?? {
    crear: false, editar: false, ver: true, eliminar: false, ver_anulados: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function aplicarPreset(preset) {
    setPermisos(preset.permisos)
    setRol(preset.rolSugerido)
  }

  function togglePermiso(k) {
    setPermisos(p => ({ ...p, [k]: !p[k] }))
  }

  async function guardar() {
    setSaving(true); setError('')
    try {
      const { error } = await supabase
        .from('perfiles')
        .update({ rol, activo, permisos })
        .eq('id', perfil.id)
      if (error) throw error
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const presetActivo = PRESETS.find(p =>
    p.permisos.crear === permisos.crear &&
    p.permisos.editar === permisos.editar &&
    p.permisos.ver === permisos.ver &&
    p.permisos.eliminar === permisos.eliminar &&
    p.permisos.ver_anulados === (permisos.ver_anulados ?? false)
  )

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900">Editar permisos</h2>
            <p className="text-xs text-gray-500 mt-0.5">{perfil.nombre_completo}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg flex items-center gap-2">
              <AlertTriangle size={15} /> {error}
            </div>
          )}

          {/* Presets */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Aplicar preset</label>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map(p => (
                <button
                  key={p.key}
                  onClick={() => aplicarPreset(p)}
                  className={`text-left p-3 border rounded-lg transition-colors ${
                    presetActivo?.key === p.key
                      ? 'border-red-300 bg-red-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">{p.label}</p>
                  <p className="text-xs text-gray-500">{p.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Permisos individuales */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Permisos individuales</label>
            <div className="space-y-2">
              <PermisoRow
                icon={Plus} label="Crear" description="Registrar nuevos daños y servicios"
                checked={permisos.crear}
                onChange={() => togglePermiso('crear')}
              />
              <PermisoRow
                icon={Pencil} label="Editar" description="Modificar registros existentes"
                checked={permisos.editar}
                onChange={() => togglePermiso('editar')}
              />
              <PermisoRow
                icon={Eye} label="Ver" description="Consultar información"
                checked={permisos.ver}
                onChange={() => togglePermiso('ver')}
              />
              <PermisoRow
                icon={Trash2} label="Eliminar" description="Borrar registros"
                checked={permisos.eliminar}
                onChange={() => togglePermiso('eliminar')}
                danger
              />
              <PermisoRow
                icon={EyeOff} label="Ver anulados/cancelados" description="Ver daños anulados y servicios cancelados en listas y reportes"
                checked={!!permisos.ver_anulados}
                onChange={() => togglePermiso('ver_anulados')}
              />
            </div>
          </div>

          {/* Rol y estado */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Etiqueta de rol</label>
              <select
                value={rol}
                onChange={e => setRol(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-red-500"
              >
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
              <button
                onClick={() => setActivo(!activo)}
                className={`w-full px-3 py-2 text-sm rounded-lg border ${
                  activo
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-gray-200 bg-gray-50 text-gray-500'
                }`}
              >
                {activo ? '✓ Activo' : '✗ Inactivo'}
              </button>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={saving}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            <Save size={15} />
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </>
  )
}

function PermisoRow({ icon: Icon, label, description, checked, onChange, danger }) {
  return (
    <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
      checked
        ? (danger ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50')
        : 'border-gray-200 hover:bg-gray-50'
    }`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="rounded border-gray-300 text-red-600 focus:ring-red-500"
      />
      <Icon size={16} className={checked ? (danger ? 'text-red-600' : 'text-green-700') : 'text-gray-400'} />
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
    </label>
  )
}
