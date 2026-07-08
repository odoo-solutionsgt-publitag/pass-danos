import { formatDate } from './fecha'

/**
 * Genera y descarga un archivo Excel (.xlsx) con el reporte de flota vehicular
 */
export async function exportarFlotillaXLS(vehiculos) {
  const ExcelJS = (await import('exceljs')).default

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Pass Rent a Car — Gestión de Daños'
  wb.created = new Date()
  wb.modified = new Date()

  const ws = wb.addWorksheet('Flota Vehicular', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
    views: [{ state: 'frozen', xSplit: 0, ySplit: 3 }],
  })

  // ── Logo ──
  try {
    const logoBlob = await fetch('/pass-35-logo.png').then(r => r.blob())
    const logoBuf = await logoBlob.arrayBuffer()
    const logoId = wb.addImage({ buffer: logoBuf, extension: 'png' })
    ws.addImage(logoId, {
      tl: { col: 0, row: 0 },
      ext: { width: 200, height: 80 },
      editAs: 'oneCell',
    })
  } catch (e) {
    console.warn('[exportarFlotillaXLS] No se pudo cargar el logo:', e.message)
  }

  // ── Altura de filas del header ──
  ws.getRow(1).height = 26
  ws.getRow(2).height = 24
  ws.getRow(3).height = 22

  // ── Título (desde columna E) ──
  ws.mergeCells('E1:G1')
  ws.getCell('E1').value = 'PASS RENT A CAR GUATEMALA'
  ws.getCell('E1').font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF000000' } }
  ws.getCell('E1').alignment = { vertical: 'middle', horizontal: 'left' }

  ws.mergeCells('E2:G2')
  ws.getCell('E2').value = 'Reporte de Flota Vehicular'
  ws.getCell('E2').font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } }
  ws.getCell('E2').alignment = { vertical: 'middle', horizontal: 'left' }

  ws.mergeCells('E3:G3')
  ws.getCell('E3').value = `Generado: ${formatDate(new Date().toISOString().slice(0, 10))}`
  ws.getCell('E3').font = { name: 'Calibri', size: 10, color: { argb: 'FF666666' } }
  ws.getCell('E3').alignment = { vertical: 'middle', horizontal: 'left' }

  // ── Headers (fila 5) ──
  const headers = ['No.', 'Estado', 'Tipo Vehículo', 'Placa', 'Marca', 'Línea', 'Modelo']
  const headerRow = ws.getRow(5)
  headers.forEach((header, idx) => {
    const cell = headerRow.getCell(idx + 1)
    cell.value = header
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } }
    cell.alignment = { vertical: 'center', horizontal: 'center', wrapText: true }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    }
  })
  headerRow.height = 20

  // ── Datos ──
  vehiculos.forEach((v, idx) => {
    const rowNum = 6 + idx
    const row = ws.getRow(rowNum)
    const datos = [
      idx + 1,
      v.x_studio_status_vehiculo || '—',
      v.tipo_vehiculo || '—',
      v.placa || '—',
      v.marca || '—',
      v.linea || '—',
      v.anio || '—',
    ]

    datos.forEach((val, colIdx) => {
      const cell = row.getCell(colIdx + 1)
      cell.value = val
      cell.font = { name: 'Calibri', size: 10 }
      cell.alignment = { vertical: 'center', horizontal: colIdx === 0 ? 'center' : 'left', wrapText: true }
      cell.border = {
        top: { style: 'hair', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'hair', color: { argb: 'FFCCCCCC' } },
        left: { style: 'hair', color: { argb: 'FFCCCCCC' } },
        right: { style: 'hair', color: { argb: 'FFCCCCCC' } },
      }
    })
    row.height = 18
  })

  // ── Ancho de columnas ──
  ws.columns = [
    { width: 6 },   // No.
    { width: 16 },  // Estado
    { width: 18 },  // Tipo Vehículo
    { width: 12 },  // Placa
    { width: 14 },  // Marca
    { width: 20 },  // Línea
    { width: 10 },  // Modelo
  ]

  // ── Fila de totales ──
  const totalRow = 6 + vehiculos.length
  const rowTotales = ws.getRow(totalRow + 1)
  rowTotales.getCell(1).value = 'TOTAL'
  rowTotales.getCell(1).font = { bold: true, size: 11 }
  rowTotales.getCell(2).value = vehiculos.length
  rowTotales.getCell(2).font = { bold: true, size: 11 }
  rowTotales.height = 20

  // ── Descarga ──
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `Flota_Vehicular_${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Genera y descarga un PDF con el reporte de flota vehicular usando jsPDF + html2canvas
 */
export async function exportarFlotilaPDF(vehiculos) {
  const jsPDF = (await import('jspdf')).default
  const html2canvas = (await import('html2canvas')).default

  // Crear un contenedor HTML temporal
  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.top = '-9999px'
  container.style.width = '1200px'
  container.style.backgroundColor = 'white'
  container.style.padding = '40px'
  container.style.fontFamily = 'Arial, sans-serif'

  const html = `
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="/pass-35-logo.png" alt="Logo" style="width: 80px; margin-bottom: 15px;">
      <h1 style="margin: 0; font-size: 24px; color: #2C3E50;">PASS RENT A CAR GUATEMALA</h1>
      <h2 style="margin: 5px 0 0 0; font-size: 18px; color: #555;">Reporte de Flota Vehicular</h2>
      <p style="margin: 5px 0 0 0; font-size: 12px; color: #999;">
        Generado: ${formatDate(new Date().toISOString().slice(0, 10))}
      </p>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <thead>
        <tr style="background-color: #2C3E50; color: white;">
          <th style="border: 1px solid #ccc; padding: 10px; text-align: center; font-weight: bold; width: 50px;">No.</th>
          <th style="border: 1px solid #ccc; padding: 10px; text-align: left; font-weight: bold;">Estado</th>
          <th style="border: 1px solid #ccc; padding: 10px; text-align: left; font-weight: bold;">Tipo Vehículo</th>
          <th style="border: 1px solid #ccc; padding: 10px; text-align: left; font-weight: bold;">Placa</th>
          <th style="border: 1px solid #ccc; padding: 10px; text-align: left; font-weight: bold;">Marca</th>
          <th style="border: 1px solid #ccc; padding: 10px; text-align: left; font-weight: bold;">Línea</th>
          <th style="border: 1px solid #ccc; padding: 10px; text-align: center; font-weight: bold; width: 60px;">Modelo</th>
        </tr>
      </thead>
      <tbody>
        ${vehiculos.map((v, idx) => `
          <tr style="background-color: ${idx % 2 === 0 ? '#f9f9f9' : 'white'};">
            <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">${idx + 1}</td>
            <td style="border: 1px solid #ccc; padding: 8px;">${v.x_studio_status_vehiculo || '—'}</td>
            <td style="border: 1px solid #ccc; padding: 8px;">${v.tipo_vehiculo || '—'}</td>
            <td style="border: 1px solid #ccc; padding: 8px; font-weight: bold;">${v.placa || '—'}</td>
            <td style="border: 1px solid #ccc; padding: 8px;">${v.marca || '—'}</td>
            <td style="border: 1px solid #ccc; padding: 8px;">${v.linea || '—'}</td>
            <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">${v.anio || '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid #ddd; font-weight: bold;">
      <p style="margin: 0;">Total de vehículos: <strong>${vehiculos.length}</strong></p>
    </div>
  `

  container.innerHTML = html

  // Esperar a que las imágenes carguen
  await new Promise(resolve => setTimeout(resolve, 500))

  document.body.appendChild(container)

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
    })

    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    })

    const imgWidth = pdf.internal.pageSize.getWidth()
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    let heightLeft = imgHeight

    let position = 0
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pdf.internal.pageSize.getHeight()

    while (heightLeft > 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pdf.internal.pageSize.getHeight()
    }

    pdf.save(`Flota_Vehicular_${new Date().toISOString().slice(0, 10)}.pdf`)
  } finally {
    document.body.removeChild(container)
  }
}
