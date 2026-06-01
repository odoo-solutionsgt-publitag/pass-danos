import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const SEVERIDAD_LABELS = { leve: 'Leve', medio: 'Medio', severo: 'Severo', perdida_total: 'Pérdida total' }
const TIPO_DANO_LABELS = {
  choque_frontal: 'Choque frontal', choque_trasero: 'Choque trasero', choque_lateral: 'Choque lateral',
  rayon: 'Rayón', abollon: 'Abollón', vidrio: 'Vidrio', llanta: 'Llanta',
  mecanico: 'Mecánico', multiple: 'Múltiple', otro: 'Otro',
}
const ESTADO_LABELS = {
  registrado: 'Registrado', cotizando: 'Cotizando', proforma_emitida: 'Proforma emitida',
  proforma_aprobada: 'Proforma aprobada', en_reparacion: 'En reparación', reparado: 'Reparado',
  en_cobro: 'En cobro', cerrado: 'Cerrado', anulado: 'Anulado',
}

function fmt(n) { return `Q ${Number(n || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
function formatDate(iso) { return iso ? new Date(iso).toLocaleDateString('es-GT', { day: '2-digit', month: 'long', year: 'numeric' }) : '—' }

export default function FichaSiniestroPrint() {
  const { id } = useParams()
  const [siniestro, setSiniestro] = useState(null)
  const [cotizacion, setCotizacion] = useState(null)
  const [ingresos, setIngresos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: c }, { data: i }] = await Promise.all([
        supabase.from('siniestros').select('*, talleres(nombre, contacto, telefono)').eq('id', id).single(),
        supabase.from('cotizaciones').select('*, talleres(nombre), cotizacion_lineas(*)').eq('siniestro_id', id).eq('estado', 'aprobada').maybeSingle(),
        supabase.from('taller_ingresos').select('*, talleres(nombre)').eq('siniestro_id', id).order('fecha_ingreso'),
      ])
      setSiniestro(s)
      setCotizacion(c)
      setIngresos(i ?? [])
      setLoading(false)
    })()
  }, [id])

  useEffect(() => {
    if (!loading && siniestro) {
      const t = setTimeout(() => window.print(), 600)
      return () => clearTimeout(t)
    }
  }, [loading, siniestro])

  if (loading) return <div className="p-10 text-center text-gray-500">Cargando ficha...</div>
  if (!siniestro) return <div className="p-10 text-center text-gray-500">Ficha no encontrada</div>

  const lineas = cotizacion?.cotizacion_lineas ?? []

  return (
    <div className="ficha-print bg-white text-gray-900 max-w-[210mm] mx-auto p-8 print:p-6">
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        .ficha-print { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; }
      `}</style>

      {/* Header con marca roja para daño */}
      <header className="border-b-4 border-red-600 pb-4 mb-6 flex items-start justify-between">
        <div className="flex items-center gap-4">
          <img src="/pass-35-logo.png" alt="Pass Rent a Car" className="h-16 object-contain" onError={(e) => { e.target.style.display = 'none' }} />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">FICHA DE DAÑO VEHICULAR</h1>
            <p className="text-xs text-gray-500 mt-0.5">Gestión de Daños · Pass Rent a Car Guatemala</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400 uppercase tracking-wider">No. de Daño</p>
          <p className="text-2xl font-bold text-red-600">{siniestro.numero}</p>
          <p className="text-xs text-gray-500 mt-0.5">{formatDate(siniestro.fecha_dano)}</p>
        </div>
      </header>

      {/* Estado + severidad + forma de pago badges */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <span className="px-3 py-1 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-full uppercase">
          Estado: {ESTADO_LABELS[siniestro.estado]}
        </span>
        <span className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold rounded-full uppercase">
          Severidad: {SEVERIDAD_LABELS[siniestro.severidad]}
        </span>
        {siniestro.forma_pago && (
          <span className={`px-3 py-1 text-xs font-semibold rounded-full uppercase border ${
            siniestro.forma_pago === 'cliente' ? 'bg-blue-50 border-blue-200 text-blue-700' :
            siniestro.forma_pago === 'pass'    ? 'bg-gray-100 border-gray-300 text-gray-700' :
                                                 'bg-green-50 border-green-200 text-green-700'
          }`}>
            Paga: {siniestro.forma_pago === 'cliente' ? 'Cliente' : siniestro.forma_pago === 'pass' ? 'PASS' : 'Seguro'}
          </span>
        )}
      </div>

      {/* Vehículo + Cliente */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <section className="border border-gray-200 rounded">
          <h2 className="bg-red-600 text-white text-xs font-bold uppercase px-3 py-1.5 tracking-wider">Vehículo</h2>
          <dl className="p-3 space-y-1.5 text-xs">
            <PrintRow label="Placa" value={siniestro.placa} bold />
            <PrintRow label="Tipo" value={siniestro.tipo_vehiculo} />
            <PrintRow label="Marca" value={siniestro.marca} />
            <PrintRow label="Línea" value={siniestro.linea} />
            <PrintRow label="Año" value={siniestro.anio} />
            <PrintRow label="No. Contrato" value={siniestro.contrato_numero} />
            <PrintRow label="Reservación" value={siniestro.reservacion_numero} />
          </dl>
        </section>
        <section className="border border-gray-200 rounded">
          <h2 className="bg-red-600 text-white text-xs font-bold uppercase px-3 py-1.5 tracking-wider">Cliente</h2>
          <dl className="p-3 space-y-1.5 text-xs">
            <PrintRow label="Nombre" value={siniestro.cliente_nombre} bold />
            <PrintRow label="DPI/Pasaporte" value={siniestro.cliente_dpi} />
            <PrintRow label="NIT" value={siniestro.cliente_nit} />
            <PrintRow label="Teléfono" value={siniestro.cliente_telefono} />
            <PrintRow label="Correo" value={siniestro.cliente_email} />
            <PrintRow label="Dirección" value={siniestro.cliente_direccion} />
          </dl>
        </section>
      </div>

      {/* Detalle del daño */}
      <section className="border border-gray-200 rounded mb-5">
        <h2 className="bg-red-600 text-white text-xs font-bold uppercase px-3 py-1.5 tracking-wider">Detalle del daño</h2>
        <div className="p-3 grid grid-cols-3 gap-3 text-xs">
          <div><p className="text-gray-400 uppercase text-[10px] mb-0.5">Fecha</p><p className="font-medium">{formatDate(siniestro.fecha_dano)}</p></div>
          <div><p className="text-gray-400 uppercase text-[10px] mb-0.5">Lugar</p><p className="font-medium">{siniestro.lugar_accidente || '—'}</p></div>
          <div><p className="text-gray-400 uppercase text-[10px] mb-0.5">Tipo de daño</p><p className="font-medium">{TIPO_DANO_LABELS[siniestro.tipo_dano]}</p></div>
        </div>
        {siniestro.descripcion && (
          <div className="px-3 pb-3 border-t border-gray-100 pt-2">
            <p className="text-gray-400 uppercase text-[10px] mb-0.5">Descripción</p>
            <p className="text-xs text-gray-700 whitespace-pre-line">{siniestro.descripcion}</p>
          </div>
        )}
      </section>

      {/* Proforma si existe */}
      {cotizacion && (
        <section className="border border-gray-200 rounded mb-5">
          <h2 className="bg-red-600 text-white text-xs font-bold uppercase px-3 py-1.5 tracking-wider flex items-center justify-between">
            <span>Proforma — {cotizacion.talleres?.nombre}{cotizacion.variante && <span className="ml-2 normal-case text-[10px] opacity-90">({cotizacion.variante})</span>}</span>
            <span className="text-xs font-normal">{lineas.length} líneas</span>
          </h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-medium">Tipo</th>
                <th className="text-left px-3 py-2 font-medium">Descripción</th>
                <th className="text-right px-3 py-2 font-medium">Cant.</th>
                <th className="text-right px-3 py-2 font-medium">P. Unit.</th>
                <th className="text-right px-3 py-2 font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map(l => (
                <tr key={l.id} className="border-b border-gray-100">
                  <td className="px-3 py-1.5 text-gray-500 capitalize">{l.tipo?.replace('_', ' ')}</td>
                  <td className="px-3 py-1.5">{l.descripcion}</td>
                  <td className="px-3 py-1.5 text-right">{l.cantidad}</td>
                  <td className="px-3 py-1.5 text-right">{fmt(l.precio_unitario)}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{fmt(l.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50"><td colSpan={4} className="px-3 py-1.5 text-right">Repuestos</td><td className="px-3 py-1.5 text-right">{fmt(cotizacion.total_repuestos)}</td></tr>
              <tr className="bg-gray-50"><td colSpan={4} className="px-3 py-1.5 text-right">Mano de obra</td><td className="px-3 py-1.5 text-right">{fmt(cotizacion.total_mano_obra)}</td></tr>
              {Number(cotizacion.total_otros) > 0 && (
                <tr className="bg-gray-50"><td colSpan={4} className="px-3 py-1.5 text-right">Otros</td><td className="px-3 py-1.5 text-right">{fmt(cotizacion.total_otros)}</td></tr>
              )}
              {Number(cotizacion.total_descuentos) !== 0 && (
                <tr className="bg-gray-50"><td colSpan={4} className="px-3 py-1.5 text-right text-red-600">Descuentos</td><td className="px-3 py-1.5 text-right text-red-600">{fmt(cotizacion.total_descuentos)}</td></tr>
              )}
              <tr className="bg-red-50 border-t-2 border-red-600">
                <td colSpan={4} className="px-3 py-2 text-right font-bold">Costo taller (Pass paga)</td>
                <td className="px-3 py-2 text-right font-bold">{fmt(cotizacion.total_general)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {/* Financiero */}
      {(siniestro.monto_cliente > 0 || siniestro.costo_pass > 0) && (
        <section className="grid grid-cols-3 gap-3 mb-5 text-center">
          <FinBox label="Cliente paga" value={fmt(siniestro.monto_cliente)} color="border-blue-300 bg-blue-50 text-blue-700" />
          <FinBox label="Pass paga" value={fmt(siniestro.costo_pass)} color="border-gray-300 bg-gray-50 text-gray-700" />
          <FinBox label="Margen" value={fmt(siniestro.margen)} color={Number(siniestro.margen) >= 0 ? 'border-green-300 bg-green-50 text-green-700' : 'border-red-300 bg-red-50 text-red-700'} />
        </section>
      )}

      {/* Taller */}
      {ingresos.length > 0 && (
        <section className="border border-gray-200 rounded mb-5">
          <h2 className="bg-red-600 text-white text-xs font-bold uppercase px-3 py-1.5 tracking-wider">Tracking de taller</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-medium">Taller</th>
                <th className="text-left px-3 py-2 font-medium">Ingreso</th>
                <th className="text-left px-3 py-2 font-medium">Egreso</th>
                <th className="text-right px-3 py-2 font-medium">Días</th>
              </tr>
            </thead>
            <tbody>
              {ingresos.map(i => (
                <tr key={i.id} className="border-b border-gray-100">
                  <td className="px-3 py-1.5">{i.talleres?.nombre}</td>
                  <td className="px-3 py-1.5">{formatDate(i.fecha_ingreso)}</td>
                  <td className="px-3 py-1.5">{i.fecha_egreso ? formatDate(i.fecha_egreso) : 'En taller'}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{i.dias_en_taller}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Fechas de taller (si hay alguna) */}
      {(siniestro.fecha_entrega_taller || siniestro.fecha_estimada_entrega || siniestro.fecha_real_entrega) && (
        <section className="border border-gray-200 rounded mb-5">
          <h2 className="bg-red-600 text-white text-xs font-bold uppercase px-3 py-1.5 tracking-wider">Fechas de taller</h2>
          <div className="p-3 grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-gray-400 uppercase text-[10px] mb-0.5">Entrega al taller</p>
              <p className="font-medium">{formatDate(siniestro.fecha_entrega_taller) || '—'}</p>
            </div>
            <div>
              <p className="text-gray-400 uppercase text-[10px] mb-0.5">Estimada de entrega</p>
              <p className="font-medium">{formatDate(siniestro.fecha_estimada_entrega) || '—'}</p>
            </div>
            <div>
              <p className="text-gray-400 uppercase text-[10px] mb-0.5">Real de entrega</p>
              <p className="font-medium">{formatDate(siniestro.fecha_real_entrega) || '—'}</p>
            </div>
          </div>
        </section>
      )}

      {/* Checklist documentos */}
      <section className="border border-gray-200 rounded mb-5">
        <h2 className="bg-red-600 text-white text-xs font-bold uppercase px-3 py-1.5 tracking-wider">Documentos al cierre</h2>
        <div className="p-3 grid grid-cols-3 gap-3 text-xs">
          {[
            { key: 'tiene_prefactura', label: 'Prefactura' },
            { key: 'tiene_proforma',   label: 'Proforma' },
            { key: 'tiene_factura',    label: 'Factura' },
          ].map(d => (
            <div key={d.key} className="flex items-center gap-2">
              <span className={`w-4 h-4 rounded border-2 flex items-center justify-center text-[10px] font-bold ${
                siniestro[d.key] ? 'border-green-600 bg-green-50 text-green-700' : 'border-gray-300 text-gray-300'
              }`}>
                {siniestro[d.key] ? '✓' : ''}
              </span>
              <span className={siniestro[d.key] ? 'font-medium' : 'text-gray-400'}>{d.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Firmas */}
      <section className="grid grid-cols-2 gap-6 mt-12 text-xs">
        <div>
          <div className="border-t border-gray-400 pt-1.5 text-center">
            <p className="font-semibold">Cliente</p>
            <p className="text-gray-500 mt-0.5">{siniestro.cliente_nombre || ''}</p>
          </div>
        </div>
        <div>
          <div className="border-t border-gray-400 pt-1.5 text-center">
            <p className="font-semibold">Responsable Pass</p>
            <p className="text-gray-500 mt-0.5">_______________________</p>
          </div>
        </div>
      </section>

      <footer className="mt-8 pt-3 border-t border-gray-200 text-center text-[10px] text-gray-400">
        Pass Rent a Car · 35 años conduciendo contigo · {new Date().toLocaleString('es-GT')}
      </footer>

      <div className="no-print fixed bottom-6 right-6 flex gap-2">
        <button onClick={() => window.print()} className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg">Imprimir</button>
        <button onClick={() => window.close()} className="bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg">Cerrar</button>
      </div>
    </div>
  )
}

function PrintRow({ label, value, bold }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className={bold ? 'font-semibold text-gray-900' : 'text-gray-800'}>{value || '—'}</dd>
    </div>
  )
}

function FinBox({ label, value, color }) {
  return (
    <div className={`border rounded p-2 ${color}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-base font-bold mt-0.5">{value}</p>
    </div>
  )
}
