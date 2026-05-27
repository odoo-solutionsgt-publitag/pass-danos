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

export async function updateVehiculoStatus(odooId, status) {
  return apiFetch(`/vehiculo/${odooId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
}

export async function fetchVehiculoFleet(odooId) {
  return apiFetch(`/vehiculo/${odooId}/fleet`)
}
