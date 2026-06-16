const API_URL = import.meta.env.VITE_API_URL

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, options)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Error ${res.status}`)
  }
  return res.json()
}

export async function fetchVehiculos(params = {}) {
  const query = new URLSearchParams(params).toString()
  return apiFetch(`/vehiculos${query ? `?${query}` : ''}`)
}

export async function fetchVehiculo(placa) {
  return apiFetch(`/vehiculo/${encodeURIComponent(placa)}`)
}

export async function updateVehiculoStatus(odooId, status, userName = '') {
  return apiFetch(`/vehiculo/${odooId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, userName }),
  })
}

export async function fetchVehiculoFleet(odooId) {
  return apiFetch(`/vehiculo/${odooId}/fleet`)
}

export async function buscarContratos(q) {
  return apiFetch(`/contratos?q=${encodeURIComponent(q)}`)
}

export async function fetchContratoById(odooId) {
  return apiFetch(`/contratos/${odooId}`)
}

// Actualiza el campo x_studio_bitacora_de_servicios en el product.template
// de Odoo para que apunte a la URL única de la bitácora del vehículo
export async function syncBitacora({ placa, odoo_product_id }) {
  return apiFetch('/odoo/sync-bitacora', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placa, odoo_product_id }),
  })
}

// Re-extrae los datos del cliente desde Odoo y los actualiza en el siniestro
export async function refreshClienteSiniestro(siniestroId) {
  return apiFetch(`/siniestros/${siniestroId}/refresh-cliente`, {
    method: 'POST',
  })
}
