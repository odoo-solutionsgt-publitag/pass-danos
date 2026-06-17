// Rellena el PDF AcroForm del Pase de Salida Interno con los datos del pase.
// Carga pdf-lib dinámicamente para no inflar el bundle inicial.
// El PDF resultante se abre en una nueva pestaña para imprimir — no se guarda.

export async function imprimirPasePDF(pase) {
  const { PDFDocument } = await import('pdf-lib')

  const pdfUrl = '/pdfs/Pase-Salida-Interno-Pass.pdf'
  const res = await fetch(pdfUrl)
  if (!res.ok) throw new Error(`No se pudo cargar el PDF base: ${res.status} ${res.statusText}`)
  const pdfBytes = await res.arrayBuffer()

  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const form = pdfDoc.getForm()

  function set(fieldName, value) {
    try {
      form.getTextField(fieldName).setText(value ?? '')
    } catch {
      // Campo no encontrado — continuar sin error
    }
  }

  // Correlativo y referencia
  set('no_pase_salida_interno', pase.numero ?? '')
  set('contrato_referencia',    pase.contrato_referencia ?? '')

  // Datos del vehículo
  set('vehiculo_placa',  pase.vehiculo_placa ?? '')
  set('vehiculo_tipo',   pase.vehiculo_tipo  ?? '')
  set('vehiculo_color',  pase.vehiculo_color ?? '')

  // Destino y piloto
  set('lugar_taller',        pase.lugar_taller  ?? '')
  set('piloto_pass',         pase.piloto_pass   ?? '')
  set('combustible_salida',  pase.combustible_salida ?? '')
  set('kilometraje_salida',  pase.kilometraje_salida != null ? String(pase.kilometraje_salida) : '')
  set('fecha_salida',        pase.fecha_salida  ?? '')
  set('hora_salida',         pase.hora_salida   ?? '')

  // Datos de entrada (pueden estar vacíos si el pase está abierto)
  set('combustible_entrada',  pase.combustible_entrada  ?? '')
  set('kilometraje_entrada',  pase.kilometraje_entrada != null ? String(pase.kilometraje_entrada) : '')
  set('fecha_entrada',        pase.fecha_entrada ?? '')
  set('hora_entrada',         pase.hora_entrada  ?? '')

  // Autorización y timestamp
  set('usuario_responsable', pase.usuario_responsable ?? '')
  set('motivo_salida',       MOTIVO_LABELS[pase.motivo_salida] ?? pase.motivo_salida ?? '')
  set('fecha_hora_sistema',  pase.fecha_hora_sistema
    ? new Date(pase.fecha_hora_sistema).toLocaleString('es-GT', { timeZone: 'America/Guatemala' })
    : '')

  form.flatten()

  const filledBytes = await pdfDoc.save()
  const blob = new Blob([filledBytes], { type: 'application/pdf' })
  const blobUrl = URL.createObjectURL(blob)

  const win = window.open(blobUrl, '_blank')
  if (!win) {
    // Fallback si el navegador bloqueó la ventana
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = `PASE-${pase.numero ?? 'salida'}.pdf`
    a.click()
  }

  // Liberar el blob URL después de un momento
  setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000)
}

const MOTIVO_LABELS = {
  taller_reparacion: 'Taller x Reparación',
  taller_servicio:   'Taller x Servicio',
  gasolinera:        'Gasolinera',
  diligencias:       'Diligencias administrativas',
  asignado_personal: 'Asignado al personal',
}
