/**
 * Utilidades de fecha para zona horaria de Guatemala (UTC-6).
 *
 * Bug que resolvemos:
 *   Las columnas DATE de Postgres (sin hora) llegan al frontend como
 *   "YYYY-MM-DD". Si las pasamos a new Date(), JS las interpreta como
 *   medianoche UTC. Al formatear en UTC-6, sale el día anterior.
 *
 *   Ejemplo: "2026-06-01" → new Date() → 2026-06-01T00:00:00Z
 *   → en Guatemala (UTC-6) son las 18:00 del 31 de mayo → muestra "31 may"
 *
 * Solución: detectar el formato DATE puro y construir el Date con
 * componentes locales (year, month, day) para que se mantenga la fecha.
 */

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

/**
 * Formatea una fecha (DATE o TIMESTAMPTZ) para visualización local en Guatemala.
 *
 * @param {string|Date|null} value - valor a formatear
 * @param {Intl.DateTimeFormatOptions} opts - opciones de formato
 * @returns {string|null} - fecha formateada, o null si value es vacío
 */
export function formatDate(value, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!value) return null

  if (typeof value === 'string' && DATE_ONLY_REGEX.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('es-GT', opts)
  }

  return new Date(value).toLocaleDateString('es-GT', opts)
}

/**
 * Igual que formatDate pero incluye hora.
 */
export function formatDateTime(value, opts = {
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
}) {
  if (!value) return null

  if (typeof value === 'string' && DATE_ONLY_REGEX.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleString('es-GT', opts)
  }

  return new Date(value).toLocaleString('es-GT', opts)
}

/**
 * Convierte una fecha DATE de Postgres a un objeto Date construido con
 * componentes locales. Útil para hacer cálculos de diferencia de días
 * sin que la zona horaria meta ruido.
 *
 * @param {string|null} value - "YYYY-MM-DD" o ISO
 * @returns {Date|null}
 */
export function parseLocalDate(value) {
  if (!value) return null

  if (typeof value === 'string' && DATE_ONLY_REGEX.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }

  return new Date(value)
}

/**
 * Diferencia en días entre dos fechas (positivo si fin > inicio).
 */
export function diffDays(inicio, fin) {
  const a = parseLocalDate(inicio)
  const b = parseLocalDate(fin)
  if (!a || !b) return null
  const ms = b - a
  return Math.round(ms / (1000 * 60 * 60 * 24))
}
