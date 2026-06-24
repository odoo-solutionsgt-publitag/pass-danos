import { supabase } from './supabase'

/**
 * Helpers centralizados para construir queries que excluyen automáticamente
 * los registros anulados/cancelados.
 *
 * Plan F2/H — Anulados invisibles para usuarios:
 * - Daños con estado 'anulado' NO aparecen en listas, dashboards, ni reportes
 * - Servicios con estado 'cancelado' tampoco aparecen
 * - El acceso por URL directa al detalle sigue funcionando (para auditoría)
 * - El admin Supabase puede consultarlos desde Supabase Studio
 *
 * Uso:
 *   import { siniestrosQuery, ordenesServicioQuery } from '../lib/queries'
 *   const { data } = await siniestrosQuery('id,numero,placa,estado').order(...)
 */

export function siniestrosQuery(selectStr = '*', { verAnulados = false } = {}) {
  const q = supabase.from('siniestros').select(selectStr)
  return verAnulados ? q : q.neq('estado', 'anulado')
}

export function ordenesServicioQuery(selectStr = '*', { verAnulados = false } = {}) {
  const q = supabase.from('ordenes_servicio').select(selectStr)
  return verAnulados ? q : q.neq('estado', 'cancelado')
}

// Versión con count (para KPIs)
export function siniestrosCountQuery({ verAnulados = false } = {}) {
  const q = supabase.from('siniestros').select('*', { count: 'exact', head: true })
  return verAnulados ? q : q.neq('estado', 'anulado')
}

export function ordenesServicioCountQuery({ verAnulados = false } = {}) {
  const q = supabase.from('ordenes_servicio').select('*', { count: 'exact', head: true })
  return verAnulados ? q : q.neq('estado', 'cancelado')
}
