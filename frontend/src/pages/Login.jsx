import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { signIn, user } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) {
    navigate('/', { replace: true })
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/')
    } catch (err) {
      setError('Credenciales incorrectas. Verifique su correo y contraseña.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center bg-white rounded-2xl p-4 mb-4 shadow-lg">
            <img
              src="/pass-35-logo.png"
              alt="Pass Rent a Car"
              className="h-16 w-auto object-contain"
              onError={(e) => {
                e.target.outerHTML = '<span class="text-red-600 font-bold text-3xl">P</span>'
              }}
            />
          </div>
          <h1 className="text-white text-2xl font-bold">Pass Rent a Car</h1>
          <p className="text-gray-400 text-sm mt-1">Gestión de Daños y Servicios</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-2xl p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-2.5 text-sm border border-gray-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
              placeholder="usuario@passrentacar.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-2.5 text-sm border border-gray-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
