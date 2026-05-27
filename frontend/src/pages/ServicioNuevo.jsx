import { Construction } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function ServicioNuevo() {
  const navigate = useNavigate()
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/servicios')} className="text-gray-400 hover:text-gray-700">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Nueva orden de servicio</h1>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center h-64 text-center text-gray-400 gap-3">
        <Construction size={40} strokeWidth={1.5} />
        <p className="text-sm">Formulario en desarrollo — próximamente disponible</p>
      </div>
    </div>
  )
}
