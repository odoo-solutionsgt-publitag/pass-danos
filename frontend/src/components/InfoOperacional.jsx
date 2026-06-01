import { useState } from 'react'
import { Wrench, MapPin, ClipboardCheck, Car, Save, Edit2, AlertCircle, Info } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { updateVehiculoStatus } from '../lib/odoo-api'
import { usePermisos } from '../hooks/usePermisos'

const UBICACION_OPTS = [
  { value: 'pass',   label: 'Pass',   help: 'En instalaciones de Pass' },
  { value: 'taller', label: 'Taller', help: 'En taller proveedor' },
  { value: 'otro',   label: 'Otro',   help: 'Otra ubicación' },
]

const CHECKING_OPTS = [
  { value: 'pre_diagnostico',        label: 'Pre-Diagnóstico',          color: 'bg-gray-100 text-gray-700 border-gray-200' },
  { value: 'diagnostico_cotizacion', label: 'Diagnóstico / Cotización', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'reparacion',             label: 'Reparación',               color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'revision_final',         label: 'Revisión Final',           color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { value: 'entrega_proveedor',      label: 'Entrega del Proveedor',    color: 'bg-teal-100 text-teal-700 border-teal-200' },
  { value: 'dano_completo',          label: 'Daño Total',               color: 'bg-red-100 text-red-700 border-red-200' },
]

export const CHECKING_LABELS = Object.fromEntries(CHECKING_OPTS.map(o => [o.value, o.label]))
export const CHECKING_COLORS = Object.fromEntries(CHECKING_OPTS.map(o => [o.value, o.color]))

/**
 * Card editable con los 3 campos operacionales:
 *  - ubicacion_vehiculo + ubicacion_detalle
 *  - estado_checking
 *  - disponible_renta (sincroniza a Odoo automáticamente)
 *
 * Props:
 *  - siniestro: objeto del daño (incluye odoo_product_id, placa)
 *  - onUpdate?: callback al guardar
 */
export default function InfoOperacional({ siniestro, onUpdate }) {
  const { puedeEditar } = usePermisos()
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState({
    ubicacion_vehiculo: siniestro.ubicacion_vehiculo || 'pass',
    ubicacion_detalle:  siniestro.ubicacion_detalle  || '',
    estado_checking:    siniestro.estado_checking    || 'pre_diagnostico',
    disponible_renta:   !!siniestro.disponible_renta,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [warning, setWarning] = useState('')

  async function guardar() {
    setSaving(true); setError(''); setWarning('')
    try {
      const payload = {
        ubicacion_vehiculo: form.ubicacion_vehiculo,
        ubicacion_detalle:  form.ubicacion_vehiculo === 'otro' ? (form.ubicacion_detalle.trim() || null) : null,
        estado_checking:    form.estado_checking,
        disponible_renta:   form.disponible_renta,
      }
      const { error: dbErr } = await supabase
        .from('siniestros')
        .update(payload)
        .eq('id', siniestro.id)
      if (dbErr) throw dbErr

      // Sincronizar con Odoo si cambió disponible_renta
      const cambioRenta = !!siniestro.disponible_renta !== form.disponible_renta
      if (cambioRenta && siniestro.odoo_product_id) {
        const targetStatus = form.disponible_renta ? 'Disponible' : 'En Reparación'
        try {
          await updateVehiculoStatus(siniestro.odoo_product_id, targetStatus)
        } catch (odooErr) {
          console.warn('[InfoOperacional] Odoo sync falló:', odooErr.message)
          setWarning(`Cambios guardados, pero no se pudo sincronizar Odoo: ${odooErr.message}`)
        }
      }

      setEditando(false)
      if (onUpdate) onUpdate(payload)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function cancelar() {
    setForm({
      ubicacion_vehiculo: siniestro.ubicacion_vehiculo || 'pass',
      ubicacion_detalle:  siniestro.ubicacion_detalle  || '',
      estado_checking:    siniestro.estado_checking    || 'pre_diagnostico',
      disponible_renta:   !!siniestro.disponible_renta,
    })
    setEditando(false)
    setError(''); setWarning('')
  }

  const checkingOpt = CHECKING_OPTS.find(o => o.value === form.estado_checking)
  const muestraHintEntrega = editando && form.estado_checking === 'entrega_proveedor' && !form.disponible_renta

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wrench size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-800">Información operacional</h3>
        </div>
        {puedeEditar && !editando && (
          <button
            onClick={() => setEditando(true)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded"
          >
            <Edit2 size={12} />
            Editar
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded mb-3 flex items-center gap-2">
          <AlertCircle size={13} />{error}
        </div>
      )}
      {warning && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-2 rounded mb-3 flex items-center gap-2">
          <AlertCircle size={13} />{warning}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Ubicación */}
        <div>
          <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><MapPin size={11} /> Ubicación</p>
          {editando ? (
            <>
              <div className="grid grid-cols-3 gap-1 mb-2">
                {UBICACION_OPTS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, ubicacion_vehiculo: opt.value }))}
                    className={`text-xs px-2 py-1.5 rounded-lg border ${
                      form.ubicacion_vehiculo === opt.value
                        ? 'bg-red-50 border-red-300 text-red-700 font-medium'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {form.ubicacion_vehiculo === 'otro' && (
                <input
                  type="text"
                  value={form.ubicacion_detalle}
                  onChange={e => setForm(f => ({ ...f, ubicacion_detalle: e.target.value }))}
                  placeholder="Ej: Agencia Mercedes Zona 9"
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-400"
                />
              )}
            </>
          ) : (
            <p className="text-sm font-medium text-gray-800">
              {UBICACION_OPTS.find(o => o.value === form.ubicacion_vehiculo)?.label || '—'}
              {form.ubicacion_vehiculo === 'otro' && form.ubicacion_detalle && (
                <span className="block text-xs text-gray-500 mt-0.5">{form.ubicacion_detalle}</span>
              )}
            </p>
          )}
        </div>

        {/* Estado checking */}
        <div>
          <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><ClipboardCheck size={11} /> Estado del checking</p>
          {editando ? (
            <select
              value={form.estado_checking}
              onChange={e => setForm(f => ({ ...f, estado_checking: e.target.value }))}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-400 bg-white"
            >
              {CHECKING_OPTS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium border ${checkingOpt?.color || ''}`}>
              {checkingOpt?.label || '—'}
            </span>
          )}
        </div>

        {/* Disponible para renta */}
        <div>
          <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><Car size={11} /> Disponible para renta</p>
          {editando ? (
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, disponible_renta: true }))}
                className={`text-xs px-2 py-1.5 rounded-lg border ${
                  form.disponible_renta
                    ? 'bg-green-50 border-green-300 text-green-700 font-medium'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Disponible
              </button>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, disponible_renta: false }))}
                className={`text-xs px-2 py-1.5 rounded-lg border ${
                  !form.disponible_renta
                    ? 'bg-red-50 border-red-300 text-red-700 font-medium'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                No Disponible
              </button>
            </div>
          ) : (
            <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
              form.disponible_renta
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}>
              {form.disponible_renta ? 'Disponible' : 'No Disponible'}
            </span>
          )}
        </div>
      </div>

      {/* Hint cuando Estado=entrega_proveedor pero todavía No Disponible */}
      {muestraHintEntrega && (
        <div className="mt-3 bg-blue-50 border border-blue-200 text-blue-700 text-xs px-3 py-2 rounded flex items-center gap-2">
          <Info size={13} />
          Si el vehículo regresó listo del taller, considera marcarlo como <strong>Disponible</strong> para que Odoo lo refleje.
        </div>
      )}

      {editando && (
        <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={cancelar}
            className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={saving}
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 rounded disabled:opacity-50"
          >
            <Save size={12} />
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  )
}
