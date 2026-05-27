import { Construction } from 'lucide-react'

export default function Reportes() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center text-gray-400 gap-3">
      <Construction size={40} strokeWidth={1.5} />
      <div>
        <p className="font-medium text-gray-600">Reportes</p>
        <p className="text-sm">Módulo en desarrollo — disponible próximamente</p>
      </div>
    </div>
  )
}
