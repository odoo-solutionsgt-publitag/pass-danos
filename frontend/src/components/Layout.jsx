import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Menu, Plus, Wrench } from 'lucide-react'
import Sidebar from './Sidebar'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-gray-500 hover:text-gray-700"
          >
            <Menu size={22} />
          </button>
          <div className="hidden lg:block" />

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/servicios/nuevo')}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              title="Crear nueva orden de servicio (mantenimiento)"
            >
              <Wrench size={15} />
              Nueva orden
            </button>
            <button
              onClick={() => navigate('/siniestros/nuevo')}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              title="Registrar un nuevo daño"
            >
              <Plus size={16} />
              Nuevo Daño
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
