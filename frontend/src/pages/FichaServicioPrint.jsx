import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDate as fmtDateLib } from '../lib/fecha'

const TIPO_SERVICIO_LABELS = {
  servicio_menor: 'Servicio menor', servicio_mayor: 'Servicio mayor',
  cambio_llantas: 'Cambio de llantas', cambio_bateria: 'Cambio de batería',
  alineacion_balanceo: 'Alineación y balanceo', cambio_frenos: 'Cambio de frenos',
  revision_general: 'Revisión general', enderezado_pintura: 'Enderezado / pintura',
  reposicion_llave: 'Reposición de llave', sistema_electrico: 'Sistema eléctrico',
  revision_ac: 'Revisión A/C', revision_inyeccion: 'Revisión inyección',
  otro: 'Otro',
}
const ESTADO_LABELS = {
  programado: 'Programado', aprobado: 'Aprobado',
  en_proceso: 'En proceso', completado: 'Completado', cancelado: 'Cancelado',
}

function fmt(n) { return `Q ${Number(n || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
function formatDate(iso) { return fmtDateLib(iso, { day: '2-digit', month: 'long', year: 'numeric' }) ?? '—' }

export default function FichaServicioPrint() {
  const { id } = useParams()
  const [orden, setOrden]       = useState(null)
  const [lineas, setLineas]     = useState([])
  const [ingresos, setIngresos] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    (async () => {
      const [{ data: o }, { data: ls }, { data: ings }] = await Promise.all([
        supabase.from('ordenes_servicio').select('*, talleres(nombre, contacto, telefono)').eq('id', id).single(),
        supabase.from('orden_servicio_lineas').select('*').eq('orden_servicio_id', id).order('created_at'),
        supabase.from('taller_ingresos').select('*, talleres(nombre)').eq('orden_servicio_id', id).order('fecha_ingreso'),
      ])
      setOrden(o)
      setLineas(ls ?? [])
      setIngresos(ings ?? [])
      setLoading(false)
    })()
  }, [id])

  useEffect(() => {
    if (!loading && orden) {
      const t = setTimeout(() => window.print(), 600)
      return () => clearTimeout(t)
    }
  }, [loading, orden])

  if (loading) return <div className="p-10 text-center text-gray-500">Cargando ficha...</div>
  if (!orden) return <div className="p-10 text-center text-gray-500">Ficha no encontrada</div>

  const totalRepuestos = lineas.filter(l => l.tipo === 'repuesto').reduce((s, l) => s + Number(l.subtotal || 0), 0)
  const totalManoObra  = lineas.filter(l => l.tipo === 'mano_obra').reduce((s, l) => s + Number(l.subtotal || 0), 0)
  const totalOtros       = lineas.filter(l => l.tipo === 'otro').reduce((s, l) => s + Number(l.subtotal || 0), 0)
  const totalDescuentos  = lineas.filter(l => l.tipo === 'descuento').reduce((s, l) => s + Number(l.subtotal || 0), 0)
  const totalGeneral   = Number(orden.total_general || 0)

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

      {/* Header con doble franja gris/azul oscuro para diferenciar de daño */}
      <header className="relative pb-4 mb-6 flex items-start justify-between">
        <div className="absolute left-0 right-0 bottom-0 h-1 bg-gradient-to-r from-slate-700 via-slate-800 to-slate-900"></div>
        <div className="flex items-center gap-4">
          <img src="/pass-35-logo.png" alt="Pass Rent a Car" className="h-16 object-contain" onError={(e) => { e.target.style.display = 'none' }} />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 leading-tight">FICHA DE SERVICIO</h1>
            <p className="text-xs text-slate-500 mt-0.5">Mantenimiento Vehicular · Pass Rent a Car Guatemala</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400 uppercase tracking-wider">No. de Orden</p>
          <p className="text-2xl font-bold text-slate-800">{orden.numero}</p>
          <p className="text-xs text-slate-500 mt-0.5">Programado: {formatDate(orden.fecha_programada)}</p>
        </div>
      </header>

      {/* Estado + autorización */}
      <div className="flex gap-2 mb-5 items-center">
        <span className="px-3 py-1 bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold rounded-full uppercase">
          Estado: {ESTADO_LABELS[orden.estado]}
        </span>
        <span className="px-3 py-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold rounded-full uppercase">
          {TIPO_SERVICIO_LABELS[orden.tipo_servicio]}
        </span>
        {orden.requiere_autorizacion && (
          <span className={`px-3 py-1 text-xs font-semibold rounded-full uppercase border ${
            orden.autorizado_por ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            {orden.autorizado_por ? `Autorizado por ${orden.autorizado_por}` : 'Requiere autorización'}
          </span>
        )}
      </div>

      {/* Vehículo + Datos del servicio */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <section className="border border-slate-200 rounded">
          <h2 className="bg-slate-800 text-white text-xs font-bold uppercase px-3 py-1.5 tracking-wider">Vehículo</h2>
          <dl className="p-3 space-y-1.5 text-xs">
            <PrintRow label="Placa" value={orden.placa} bold />
            <PrintRow label="Tipo" value={orden.tipo_vehiculo} />
            <PrintRow label="Marca" value={orden.marca} />
            <PrintRow label="Línea" value={orden.linea} />
            <PrintRow label="Año" value={orden.anio} />
            <PrintRow label="Kilometraje" value={orden.kilometraje ? `${Number(orden.kilometraje).toLocaleString('es-GT')} km` : null} />
          </dl>
        </section>
        <section className="border border-slate-200 rounded">
          <h2 className="bg-slate-800 text-white text-xs font-bold uppercase px-3 py-1.5 tracking-wider">Datos del servicio</h2>
          <dl className="p-3 space-y-1.5 text-xs">
            <PrintRow label="Tipo servicio" value={TIPO_SERVICIO_LABELS[orden.tipo_servicio]} bold />
            <PrintRow label="Fecha programada" value={formatDate(orden.fecha_programada)} />
            <PrintRow label="Taller asignado" value={orden.talleres?.nombre} />
            <PrintRow label="Contacto taller" value={orden.talleres?.contacto} />
            <PrintRow label="Tel. taller" value={orden.talleres?.telefono} />
            <PrintRow label="Autorizado por" value={orden.autorizado_por} />
          </dl>
        </section>
      </div>

      {/* Descripción */}
      {orden.descripcion && (
        <section className="border border-slate-200 rounded mb-5">
          <h2 className="bg-slate-800 text-white text-xs font-bold uppercase px-3 py-1.5 tracking-wider">Observaciones</h2>
          <p className="p-3 text-xs text-slate-700 whitespace-pre-line">{orden.descripcion}</p>
        </section>
      )}

      {/* Líneas de detalle */}
      {lineas.length > 0 && (
        <section className="border border-slate-200 rounded mb-5">
          <h2 className="bg-slate-800 text-white text-xs font-bold uppercase px-3 py-1.5 tracking-wider flex items-center justify-between">
            <span>Detalle de la orden</span>
            <span className="text-xs font-normal">{lineas.length} líneas</span>
          </h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-3 py-2 font-medium">Tipo</th>
                <th className="text-left px-3 py-2 font-medium">Descripción</th>
                <th className="text-right px-3 py-2 font-medium">Cant.</th>
                <th className="text-right px-3 py-2 font-medium">P. Unit.</th>
                <th className="text-right px-3 py-2 font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map(l => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="px-3 py-1.5 text-slate-500 capitalize">{l.tipo?.replace('_', ' ')}</td>
                  <td className="px-3 py-1.5">{l.descripcion}</td>
                  <td className="px-3 py-1.5 text-right">{l.cantidad}</td>
                  <td className="px-3 py-1.5 text-right">{fmt(l.precio_unitario)}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{fmt(l.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50"><td colSpan={4} className="px-3 py-1.5 text-right">Repuestos</td><td className="px-3 py-1.5 text-right">{fmt(totalRepuestos)}</td></tr>
              <tr className="bg-slate-50"><td colSpan={4} className="px-3 py-1.5 text-right">Mano de obra</td><td className="px-3 py-1.5 text-right">{fmt(totalManoObra)}</td></tr>
              {totalOtros > 0 && (
                <tr className="bg-slate-50"><td colSpan={4} className="px-3 py-1.5 text-right">Otros</td><td className="px-3 py-1.5 text-right">{fmt(totalOtros)}</td></tr>
              )}
              {totalDescuentos !== 0 && (
                <tr className="bg-slate-50"><td colSpan={4} className="px-3 py-1.5 text-right text-red-600">Descuentos</td><td className="px-3 py-1.5 text-right text-red-600">{fmt(totalDescuentos)}</td></tr>
              )}
              <tr className="bg-slate-800 text-white border-t-2 border-slate-900">
                <td colSpan={4} className="px-3 py-2 text-right font-bold">TOTAL</td>
                <td className="px-3 py-2 text-right font-bold">{fmt(totalGeneral)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {/* Taller */}
      {ingresos.length > 0 && (
        <section className="border border-slate-200 rounded mb-5">
          <h2 className="bg-slate-800 text-white text-xs font-bold uppercase px-3 py-1.5 tracking-wider">Tracking de taller</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-3 py-2 font-medium">Taller</th>
                <th className="text-left px-3 py-2 font-medium">Ingreso</th>
                <th className="text-left px-3 py-2 font-medium">Egreso</th>
                <th className="text-right px-3 py-2 font-medium">Días</th>
              </tr>
            </thead>
            <tbody>
              {ingresos.map(i => (
                <tr key={i.id} className="border-b border-slate-100">
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
      {(orden.fecha_entrega_taller || orden.fecha_estimada_entrega || orden.fecha_real_entrega) && (
        <section className="border border-slate-200 rounded mb-5">
          <h2 className="bg-slate-800 text-white text-xs font-bold uppercase px-3 py-1.5 tracking-wider">Fechas de taller</h2>
          <div className="p-3 grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-slate-400 uppercase text-[10px] mb-0.5">Entrega al taller</p>
              <p className="font-medium">{formatDate(orden.fecha_entrega_taller) || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 uppercase text-[10px] mb-0.5">Estimada de entrega</p>
              <p className="font-medium">{formatDate(orden.fecha_estimada_entrega) || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 uppercase text-[10px] mb-0.5">Real de entrega</p>
              <p className="font-medium">{formatDate(orden.fecha_real_entrega) || '—'}</p>
            </div>
          </div>
        </section>
      )}

      {/* Checklist documentos */}
      <section className="border border-slate-200 rounded mb-5">
        <h2 className="bg-slate-800 text-white text-xs font-bold uppercase px-3 py-1.5 tracking-wider">Documentos al cierre</h2>
        <div className="p-3 grid grid-cols-3 gap-3 text-xs">
          {[
            { key: 'tiene_prefactura', label: 'Prefactura' },
            { key: 'tiene_proforma',   label: 'Proforma' },
            { key: 'tiene_factura',    label: 'Factura' },
          ].map(d => (
            <div key={d.key} className="flex items-center gap-2">
              <span className={`w-4 h-4 rounded border-2 flex items-center justify-center text-[10px] font-bold ${
                orden[d.key] ? 'border-green-600 bg-green-50 text-green-700' : 'border-slate-300 text-slate-300'
              }`}>
                {orden[d.key] ? '✓' : ''}
              </span>
              <span className={orden[d.key] ? 'font-medium' : 'text-slate-400'}>{d.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Firmas */}
      <section className="grid grid-cols-3 gap-6 mt-12 text-xs">
        <div>
          <div className="border-t border-slate-400 pt-1.5 text-center">
            <p className="font-semibold">Recibido por taller</p>
            <p className="text-slate-500 mt-0.5">{orden.talleres?.nombre || ''}</p>
          </div>
        </div>
        <div>
          <div className="border-t border-slate-400 pt-1.5 text-center">
            <p className="font-semibold">Entregado por Pass</p>
            <p className="text-slate-500 mt-0.5">_______________________</p>
          </div>
        </div>
        <div>
          <div className="border-t border-slate-400 pt-1.5 text-center">
            <p className="font-semibold">Autorizado por</p>
            <p className="text-slate-500 mt-0.5">{orden.autorizado_por || '_______________________'}</p>
          </div>
        </div>
      </section>

      <footer className="mt-8 pt-3 border-t border-slate-200 text-center text-[10px] text-slate-400">
        Pass Rent a Car · 35 años conduciendo contigo · {new Date().toLocaleString('es-GT')}
      </footer>

      <div className="no-print fixed bottom-6 right-6 flex gap-2">
        <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg">Imprimir</button>
        <button onClick={() => window.close()} className="bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg">Cerrar</button>
      </div>
    </div>
  )
}

function PrintRow({ label, value, bold }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className={bold ? 'font-semibold text-slate-900' : 'text-slate-800'}>{value || '—'}</dd>
    </div>
  )
}
