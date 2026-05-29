import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  AlertTriangle,
  Wrench,
  FileText,
  Car,
  BookOpen,
  FolderOpen,
  BarChart3,
  LogOut,
  X,
  Users,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const NAV_PRINCIPAL = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/siniestros', label: 'Daños', icon: AlertTriangle },
  { to: '/servicios', label: 'Servicios', icon: Wrench },
  { to: '/proformas', label: 'Proformas', icon: FileText },
  { to: '/flota', label: 'Flota Vehicular', icon: Car },
]

const NAV_CONFIG = [
  { to: '/catalogos', label: 'Catálogos', icon: BookOpen },
  { to: '/repositorio', label: 'Repositorio', icon: FolderOpen },
  { to: '/reportes', label: 'Reportes', icon: BarChart3 },
]

const NAV_ADMIN = [
  { to: '/usuarios', label: 'Usuarios', icon: Users },
]

function NavItem({ to, label, icon: Icon, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-red-600 text-white'
            : 'text-gray-300 hover:bg-gray-700 hover:text-white'
        }`
      }
    >
      <Icon size={18} />
      {label}
    </NavLink>
  )
}

export default function Sidebar({ open, onClose }) {
  const { perfil, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-gray-900 z-30 flex flex-col transition-transform duration-300
          ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:z-auto`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/pass-35-logo.png"
              alt="Pass Rent a Car"
              className="h-12 w-auto object-contain bg-white rounded-md p-1 shrink-0"
              onError={(e) => { e.target.style.display = 'none' }}
            />
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-tight truncate">Pass Rent a Car</p>
              <p className="text-gray-400 text-xs">Gestión de Daños</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-white shrink-0">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider px-3 mb-2">Principal</p>
          <div className="space-y-1 mb-6">
            {NAV_PRINCIPAL.map(item => (
              <NavItem key={item.to} {...item} onClick={onClose} />
            ))}
          </div>

          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider px-3 mb-2">Configuración</p>
          <div className="space-y-1 mb-6">
            {NAV_CONFIG.map(item => (
              <NavItem key={item.to} {...item} onClick={onClose} />
            ))}
          </div>

          {perfil?.rol === 'admin' && (
            <>
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider px-3 mb-2">Administración</p>
              <div className="space-y-1">
                {NAV_ADMIN.map(item => (
                  <NavItem key={item.to} {...item} onClick={onClose} />
                ))}
              </div>
            </>
          )}
        </nav>

        <div className="px-3 py-4 border-t border-gray-700">
          {perfil && (
            <div className="px-3 mb-3">
              <p className="text-white text-sm font-medium truncate">{perfil.nombre_completo}</p>
              <p className="text-gray-400 text-xs capitalize">{perfil.rol?.replace('_', ' ')}</p>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  )
}
