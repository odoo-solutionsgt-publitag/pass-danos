import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Siniestros from './pages/Siniestros'
import SiniestroNuevo from './pages/SiniestroNuevo'
import SiniestroDetalle from './pages/SiniestroDetalle'
import Servicios from './pages/Servicios'
import ServicioNuevo from './pages/ServicioNuevo'
import ServicioDetalle from './pages/ServicioDetalle'
import Proformas from './pages/Proformas'
import FlotaVehicular from './pages/FlotaVehicular'
import Catalogos from './pages/Catalogos'
import Repositorio from './pages/Repositorio'
import Reportes from './pages/Reportes'
import FichaSiniestroPrint from './pages/FichaSiniestroPrint'
import FichaServicioPrint from './pages/FichaServicioPrint'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/siniestros/:id/imprimir" element={
          <ProtectedRoute><FichaSiniestroPrint /></ProtectedRoute>
        } />
        <Route path="/servicios/:id/imprimir" element={
          <ProtectedRoute><FichaServicioPrint /></ProtectedRoute>
        } />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="siniestros" element={<Siniestros />} />
          <Route path="siniestros/nuevo" element={<SiniestroNuevo />} />
          <Route path="siniestros/:id" element={<SiniestroDetalle />} />
          <Route path="servicios" element={<Servicios />} />
          <Route path="servicios/nuevo" element={<ServicioNuevo />} />
          <Route path="servicios/:id" element={<ServicioDetalle />} />
          <Route path="proformas" element={<Proformas />} />
          <Route path="flota" element={<FlotaVehicular />} />
          <Route path="catalogos" element={<Catalogos />} />
          <Route path="repositorio" element={<Repositorio />} />
          <Route path="reportes" element={<Reportes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
