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

export function siniestrosQuery(selectStr = '*') {
  return supabase.from('siniestros').select(selectStr).neq('estado', 'anulado')
}

export function ordenesServicioQuery(selectStr = '*') {
  return supabase.from('ordenes_servicio').select(selectStr).neq('estado', 'cancelado')
}

// Versión con count (para KPIs)
export function siniestrosCountQuery() {
  return supabase.from('siniestros')
    .select('*', { count: 'exact', head: true })
    .neq('estado', 'anulado')
}

export function ordenesServicioCountQuery() {
  return supabase.from('ordenes_servicio')
    .select('*', { count: 'exact', head: true })
    .neq('estado', 'cancelado')
}
