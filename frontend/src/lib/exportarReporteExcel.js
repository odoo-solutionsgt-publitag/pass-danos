import { CHECKING_LABELS } from '../components/InfoOperacional'
import { formatDate } from './fecha'

/**
 * Genera y descarga un archivo Excel (.xlsx) del Reporte Diario.
 *
 * @param {Object} params
 * @param {Array}  params.filas          — filas ya filtradas (mismo dataset del dashboard)
 * @param {Object} params.info           — { titulo, fechaLabel, total }
 * @param {string} params.nombreArchivo  — sin extensión (se agrega .xlsx)
 */
export async function exportarReporteExcel({ filas, info, nombreArchivo }) {
  // Carga dinámica para no inflar el bundle inicial
  const ExcelJS = (await import('exceljs')).default

  const wb = new ExcelJS.Workbook()
  wb.creator  = 'Pass Rent a Car — Gestión de Daños'
  wb.created  = new Date()
  wb.modified = new Date()

  const ws = wb.addWorksheet('Reporte Diario', {
    pageSetup: {
      paperSize: 9,             // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
    views: [{ state: 'frozen', xSplit: 0, ySplit: 7 }],
  })

  // ── Logo (300x100 px, alineado a la izquierda desde col A) ───
  try {
    const logoBlob = await fetch('/pass-35-logo.png').then(r => r.blob())
    const logoBuf  = await logoBlob.arrayBuffer()
    const logoId   = wb.addImage({ buffer: logoBuf, extension: 'png' })
    ws.addImage(logoId, {
      tl: { col: 0, row: 0 },        // columna A, fila 1 (offset ≤ 5px desde el borde)
      ext: { width: 300, height: 100 },
      editAs: 'oneCell',
    })
  } catch (e) {
    console.warn('[exportarReporteExcel] No se pudo cargar el logo:', e.message)
  }

  // Altura de filas del header (4 filas × 22pt ≈ 117 px, acomoda el logo de 100px)
  ws.getRow(1).height = 22
  ws.getRow(2).height = 22
  ws.getRow(3).height = 22
  ws.getRow(4).height = 22

  // ── Título y meta (desde columna F para no traslaparse con el logo) ──
  ws.mergeCells('F1:L1')
  ws.getCell('F1').value = 'PASS RENT A CAR GUATEMALA'
  ws.getCell('F1').font  = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF111827' } }
  ws.getCell('F1').alignment = { vertical: 'middle', horizontal: 'left' }

  ws.mergeCells('F2:L2')
  ws.getCell('F2').value = info.titulo
  ws.getCell('F2').font  = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF111827' } }
  ws.getCell('F2').alignment = { vertical: 'middle', horizontal: 'left' }

  ws.mergeCells('F3:L3')
  ws.getCell('F3').value = `${info.fechaLabel}    ·    Total registros: ${info.total}`
  ws.getCell('F3').font  = { name: 'Calibri', size: 10, color: { argb: 'FF374151' } }
  ws.getCell('F3').alignment = { vertical: 'middle', horizontal: 'left' }

  ws.mergeCells('F4:L4')
  ws.getCell('F4').value = `Generado: ${new Date().toLocaleString('es-GT', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })}`
  ws.getCell('F4').font  = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF6B7280' } }
  ws.getCell('F4').alignment = { vertical: 'middle', horizontal: 'left' }

  // Fila 5: separador vacío
  ws.getRow(5).height = 6

  // ── Anchos de columna ─────────────────────────────────────────
  ws.columns = [
    { width: 5  }, // A — #
    { width: 12 }, // B — Placa
    { width: 14 }, // C — Tipo veh.
    { width: 10 }, // D — Registro
    { width: 18 }, // E — Ubicación
    { width: 18 }, // F — Taller
    { width: 14 }, // G — F. Registro
    { width: 14 }, // H — Est. salida
    { width: 8  }, // I — Días
    { width: 22 }, // J — Etapa checking
    { width: 40 }, // K — Motivo
    { width: 40 }, // L — Observaciones
  ]

  // ── Headers (fila 7) — doble línea con \n + wrapText ────────
  const headers = [
    '#', 'Placa', 'Tipo vehículo', 'Registro', 'Ubicación',
    'Taller\nAsignado',
    'Fecha\nRegistro',
    'Fecha Aprox.\nIngreso',
    'Días en\nTaller',
    'Etapa checking',
    'Motivo de\nenvío a taller',
    'Observaciones',
  ]
  ws.getRow(7).values = headers
  ws.getRow(7).height = 32
  ws.getRow(7).eachCell(cell => {
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE53935' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      top:    { style: 'thin', color: { argb: 'FF991B1B' } },
      left:   { style: 'thin', color: { argb: 'FF991B1B' } },
      bottom: { style: 'thin', color: { argb: 'FF991B1B' } },
      right:  { style: 'thin', color: { argb: 'FF991B1B' } },
    }
  })

  // ── Filas de datos ────────────────────────────────────────────
  const colorSemaforo = (dias) => {
    if (dias <= 2) return 'FF86EFAC'   // verde claro
    if (dias <= 5) return 'FFFDE68A'   // ámbar claro
    return 'FFFCA5A5'                  // rojo claro
  }
  const colorRegistroFondo = (tipo) => tipo === 'dano' ? 'FFFEE2E2' : 'FFE2E8F0'
  const colorRegistroTexto = (tipo) => tipo === 'dano' ? 'FF991B1B' : 'FF334155'

  filas.forEach((f, idx) => {
    const diasPos = f.dias ?? 0
    const diasNeg = diasPos > 0 ? -diasPos : 0
    const r = ws.addRow([
      idx + 1,
      f.placa,
      f.tipoVehiculo || '',
      f.tipoRegistro === 'dano' ? 'Daño' : 'Servicio',
      f.ubicacion || '',
      f.taller || '',
      formatDate(f.fechaRegistro)  ?? '',
      formatDate(f.fechaEstSalida) ?? '',
      diasNeg,
      f.checking ? (CHECKING_LABELS[f.checking] ?? f.checking) : '',
      f.motivo || '',
      f.observaciones || '',
    ])

    // Estilos por fila
    r.height = undefined // auto-fit por wrap
    r.eachCell((cell, colNumber) => {
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF111827' } }
      cell.border = {
        top:    { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left:   { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right:  { style: 'thin', color: { argb: 'FFE5E7EB' } },
      }
      // Alineación por columna
      if (colNumber === 1 || colNumber === 9) {
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      } else if (colNumber === 11 || colNumber === 12) {
        cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
      }
    })

    // Badge "Registro" (Daño / Servicio)
    const cellRegistro = r.getCell(4)
    cellRegistro.fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: colorRegistroFondo(f.tipoRegistro) },
    }
    cellRegistro.font = {
      name: 'Calibri', size: 10, bold: true,
      color: { argb: colorRegistroTexto(f.tipoRegistro) },
    }
    cellRegistro.alignment = { vertical: 'middle', horizontal: 'center' }

    // Semáforo en columna Días
    const cellDias = r.getCell(9)
    cellDias.fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: colorSemaforo(f.dias ?? 0) },
    }
    cellDias.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF111827' } }
  })

  if (filas.length === 0) {
    const r = ws.addRow(['', '', '', '', 'Sin registros para los filtros seleccionados.', '', '', '', '', '', '', ''])
    ws.mergeCells(`A${r.number}:L${r.number}`)
    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }
    r.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } }
  }

  // ── Generar buffer y disparar descarga ────────────────────────
  const buf  = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = `${nombreArchivo}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
