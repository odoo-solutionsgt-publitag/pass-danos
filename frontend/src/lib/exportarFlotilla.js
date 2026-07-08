import { formatDate } from './fecha'

/**
 * Agrupa vehículos por tipo → línea → estado → modelo
 */
function agruparVehiculos(vehiculos) {
  const grupos = {};

  vehiculos.forEach(v => {
    const tipo = v.tipo_vehiculo || 'Sin tipo';
    const linea = v.linea || 'Sin línea';
    const estado = v.status || 'Sin estado';

    if (!grupos[tipo]) grupos[tipo] = {};
    if (!grupos[tipo][linea]) grupos[tipo][linea] = {};
    if (!grupos[tipo][linea][estado]) grupos[tipo][linea][estado] = [];
    grupos[tipo][linea][estado].push(v);
  });

  // Ordenar: tipo alfabético, línea alfabética, estado alfabético, modelo ascendente
  const tiposOrdenados = Object.keys(grupos).sort();
  const resultado = [];
  let numeroCorrelativo = 1;

  tiposOrdenados.forEach(tipo => {
    const lineasOrdenadas = Object.keys(grupos[tipo]).sort();
    lineasOrdenadas.forEach(linea => {
      const estadosOrdenados = Object.keys(grupos[tipo][linea]).sort();
      estadosOrdenados.forEach(estado => {
        const vehiculosDeEstado = grupos[tipo][linea][estado].sort((a, b) => (a.anio || 0) - (b.anio || 0));
        vehiculosDeEstado.forEach(v => {
          resultado.push({ ...v, _numero: numeroCorrelativo++, _tipo: tipo, _linea: linea, _estado: estado });
        });
      });
    });
  });

  return resultado;
}

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

  // ── Agrupar y renderizar ──
  const vehiculosAgrupados = agruparVehiculos(vehiculos)
  let currentRowNum = 6
  let ultimoTipo = null
  let ultimaLinea = null
  let ultimoEstado = null

  vehiculosAgrupados.forEach(v => {
    // Encabezado de Tipo si cambió
    if (v._tipo !== ultimoTipo) {
      const tipoRow = ws.getRow(currentRowNum)
      tipoRow.getCell(1).value = v._tipo
      tipoRow.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
      tipoRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF34495E' } }
      ws.mergeCells(currentRowNum, 1, currentRowNum, 7)
      tipoRow.height = 18
      currentRowNum++
      ultimoTipo = v._tipo
      ultimaLinea = null
      ultimoEstado = null
    }

    // Encabezado de Línea si cambió
    if (v._linea !== ultimaLinea) {
      const lineaRow = ws.getRow(currentRowNum)
      lineaRow.getCell(1).value = `  ${v._linea}`
      lineaRow.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF555555' } }
      lineaRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECF0F1' } }
      ws.mergeCells(currentRowNum, 1, currentRowNum, 7)
      lineaRow.height = 16
      currentRowNum++
      ultimaLinea = v._linea
      ultimoEstado = null
    }

    // Encabezado de Estado si cambió
    if (v._estado !== ultimoEstado) {
      const estadoRow = ws.getRow(currentRowNum)
      estadoRow.getCell(1).value = `    ${v._estado}`
      estadoRow.getCell(1).font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF34495E' } }
      estadoRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5DBDB' } }
      ws.mergeCells(currentRowNum, 1, currentRowNum, 7)
      estadoRow.height = 14
      currentRowNum++
      ultimoEstado = v._estado
    }

    // Fila de datos
    const dataRow = ws.getRow(currentRowNum)
    const datos = [
      v._numero,
      v.status || '—',
      v.tipo_vehiculo || '—',
      v.placa || '—',
      v.marca || '—',
      v.linea || '—',
      v.anio || '—',
    ]

    datos.forEach((val, idx) => {
      const cell = dataRow.getCell(idx + 1)
      cell.value = val
      cell.font = { name: 'Calibri', size: 10 }
      cell.alignment = { vertical: 'center', horizontal: idx === 0 ? 'center' : 'left', wrapText: true }
      cell.border = {
        top: { style: 'hair', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'hair', color: { argb: 'FFCCCCCC' } },
        left: { style: 'hair', color: { argb: 'FFCCCCCC' } },
        right: { style: 'hair', color: { argb: 'FFCCCCCC' } },
      }
    })
    dataRow.height = 17
    currentRowNum++
  })

  // ── Ancho de columnas ──
  ws.columns = [
    { width: 6 },
    { width: 16 },
    { width: 18 },
    { width: 12 },
    { width: 14 },
    { width: 20 },
    { width: 10 },
  ]

  // ── Fila de totales ──
  const rowTotales = ws.getRow(currentRowNum + 1)
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

  // Agrupar vehículos
  const vehiculosAgrupados = agruparVehiculos(vehiculos)

  // Crear un contenedor HTML temporal
  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.top = '-9999px'
  container.style.width = '1200px'
  container.style.backgroundColor = 'white'
  container.style.padding = '40px'
  container.style.fontFamily = 'Arial, sans-serif'

  let html = `
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
  `

  let ultimoTipo = null
  let ultimaLinea = null
  let ultimoEstado = null

  vehiculosAgrupados.forEach(v => {
    // Encabezado de Tipo si cambió
    if (v._tipo !== ultimoTipo) {
      html += `
        <tr style="background-color: #34495E;">
          <td colspan="7" style="border: 1px solid #ccc; padding: 10px; font-weight: bold; color: white;">${v._tipo}</td>
        </tr>
      `
      ultimoTipo = v._tipo
      ultimaLinea = null
      ultimoEstado = null
    }

    // Encabezado de Línea si cambió
    if (v._linea !== ultimaLinea) {
      html += `
        <tr style="background-color: #ECF0F1;">
          <td colspan="7" style="border: 1px solid #ccc; padding: 8px; font-weight: bold; color: #555; font-size: 14px;">&nbsp;&nbsp;${v._linea}</td>
        </tr>
      `
      ultimaLinea = v._linea
      ultimoEstado = null
    }

    // Encabezado de Estado si cambió
    if (v._estado !== ultimoEstado) {
      html += `
        <tr style="background-color: #D5DBDB;">
          <td colspan="7" style="border: 1px solid #ccc; padding: 6px 8px; font-weight: bold; color: #34495E; font-size: 12px;">&nbsp;&nbsp;&nbsp;&nbsp;${v._estado}</td>
        </tr>
      `
      ultimoEstado = v._estado
    }

    // Fila de datos
    html += `
      <tr style="background-color: ${vehiculosAgrupados.indexOf(v) % 2 === 0 ? '#f9f9f9' : 'white'};">
        <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">${v._numero}</td>
        <td style="border: 1px solid #ccc; padding: 8px;">${v.status || '—'}</td>
        <td style="border: 1px solid #ccc; padding: 8px;">${v.tipo_vehiculo || '—'}</td>
        <td style="border: 1px solid #ccc; padding: 8px; font-weight: bold;">${v.placa || '—'}</td>
        <td style="border: 1px solid #ccc; padding: 8px;">${v.marca || '—'}</td>
        <td style="border: 1px solid #ccc; padding: 8px;">${v.linea || '—'}</td>
        <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">${v.anio || '—'}</td>
      </tr>
    `
  })

  html += `
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
