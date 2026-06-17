// Rellena el PDF AcroForm del Pase de Salida Interno con los datos del pase.
// Carga pdf-lib dinámicamente para no inflar el bundle inicial.
// El PDF resultante se abre en una nueva pestaña para imprimir — no se guarda.

export async function imprimirPasePDF(pase) {
  const { PDFDocument } = await import('pdf-lib')

  // URL absoluta para evitar problemas con rutas relativas en producción
  const pdfUrl = `${window.location.origin}/pdfs/Pase-Salida-Interno-Pass.pdf`
  const res = await fetch(pdfUrl, { cache: 'no-store' })

  if (!res.ok) {
    throw new Error(
      `Archivo PDF no encontrado en el servidor (HTTP ${res.status}). ` +
      `Verifique que el deploy del frontend esté completo.`
    )
  }

  const pdfBytes = await res.arrayBuffer()

  // Verificar magic bytes %PDF antes de intentar parsear
  const magic = new Uint8Array(pdfBytes.slice(0, 4))
  const isPDF = magic[0] === 0x25 && magic[1] === 0x50 && // %P
                magic[2] === 0x44 && magic[3] === 0x46    // DF
  if (!isPDF) {
    const preview = Array.from(magic).map(b => String.fromCharCode(b)).join('')
    throw new Error(
      `El servidor devolvió contenido inválido (primeros bytes: "${preview}"). ` +
      `Es posible que el deploy no haya completado aún. Intente recargar la página.`
    )
  }

  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const form = pdfDoc.getForm()

  function set(fieldName, value) {
    try {
      const str = (value ?? '').toString().toUpperCase()
      form.getTextField(fieldName).setText(str)
    } catch {
      // Campo no encontrado en el AcroForm — continuar sin error
    }
  }

  // "2026-06-16" → "16/06/2026"
  function formatDate(dateStr) {
    if (!dateStr) return ''
    const parts = dateStr.split('-')
    if (parts.length !== 3) return dateStr
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }

  // "14:30" → "14:30 HRS."
  function formatHora(timeStr) {
    if (!timeStr) return ''
    return `${timeStr} HRS.`
  }

  // TIMESTAMPTZ → "16/06/2026 14:30 HRS." en zona Guatemala
  function formatDateTimeGT(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    const gt = new Date(d.toLocaleString('en-US', { timeZone: 'America/Guatemala' }))
    const dd   = String(gt.getDate()).padStart(2, '0')
    const mm   = String(gt.getMonth() + 1).padStart(2, '0')
    const yyyy = gt.getFullYear()
    const hh   = String(gt.getHours()).padStart(2, '0')
    const min  = String(gt.getMinutes()).padStart(2, '0')
    return `${dd}/${mm}/${yyyy} ${hh}:${min} HRS.`
  }

  // "3/8" → "3/8 TANQUE" / "Full" → "FULL TANQUE"
  function setCombustible(fieldName, value) {
    if (!value) return set(fieldName, '')
    const upper = value.toString().trim().toUpperCase()
    const formatted = upper.includes('TANQUE') ? upper : `${upper} TANQUE`
    set(fieldName, formatted)
  }

  // Correlativo y referencia
  set('no_pase_salida_interno', pase.numero ?? '')
  set('contrato_referencia',    pase.contrato_referencia ?? '')

  // Datos del vehículo
  set('vehiculo_placa',  pase.vehiculo_placa ?? '')
  set('vehiculo_tipo',   pase.vehiculo_tipo  ?? '')
  set('vehiculo_color',  pase.vehiculo_color ?? '')

  // Destino y piloto
  set('lugar_taller',       pase.lugar_taller ?? '')
  set('piloto_pass',        pase.piloto_pass  ?? '')
  setCombustible('combustible_salida', pase.combustible_salida)
  set('kilometraje_salida', pase.kilometraje_salida != null ? String(pase.kilometraje_salida) : '')
  set('fecha_salida',       formatDate(pase.fecha_salida))
  set('hora_salida',        formatHora(pase.hora_salida))

  // Datos de entrada (pueden estar vacíos si el pase está abierto)
  setCombustible('combustible_entrada', pase.combustible_entrada)
  set('kilometraje_entrada', pase.kilometraje_entrada != null ? String(pase.kilometraje_entrada) : '')
  set('fecha_entrada',       formatDate(pase.fecha_entrada))
  set('hora_entrada',        formatHora(pase.hora_entrada))

  // Autorización y timestamp
  set('usuario_responsable', pase.usuario_responsable ?? '')
  set('motivo_salida',       MOTIVO_LABELS[pase.motivo_salida] ?? pase.motivo_salida ?? '')
  set('fecha_hora_sistema',  formatDateTimeGT(pase.fecha_hora_sistema))

  form.flatten()

  const filledBytes = await pdfDoc.save()
  const blob = new Blob([filledBytes], { type: 'application/pdf' })
  const blobUrl = URL.createObjectURL(blob)

  const win = window.open(blobUrl, '_blank')
  if (!win) {
    // Fallback si el navegador bloqueó la ventana emergente
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
