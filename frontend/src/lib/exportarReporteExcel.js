import { CHECKING_LABELS } from '../components/InfoOperacional'
import { formatDate } from './fecha'

/**
 * Genera y descarga un archivo Excel (.xlsx) del Reporte Diario.
 *
 * @param {Object} params
 * @param {Array}  params.filas                 — filas ya filtradas (mismo dataset del dashboard)
 * @param {Object} params.info                  — { titulo, fechaLabel, total }
 * @param {string} params.nombreArchivo         — sin extensión (se agrega .xlsx)
 * @param {boolean} params.mostrarMotivo        — incluir columna "Motivo de envío a taller" (default true)
 * @param {boolean} params.mostrarObservaciones — incluir columna "Observaciones" (default true)
 */
export async function exportarReporteExcel({
  filas,
  info,
  nombreArchivo,
  mostrarMotivo = true,
  mostrarObservaciones = true,
}) {
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

  // ── Cálculo de la última columna usada (depende de los toggles) ──
  // 13 fijas (10 + 3 financieras) + Motivo (opt) + Observaciones (opt)
  const totalCols    = 13 + (mostrarMotivo ? 1 : 0) + (mostrarObservaciones ? 1 : 0)
  const ultimaLetra  = String.fromCharCode(64 + totalCols)  // A=65

  // ── Título y meta (desde columna F para no traslaparse con el logo) ──
  ws.mergeCells(`F1:${ultimaLetra}1`)
  ws.getCell('F1').value = 'PASS RENT A CAR GUATEMALA'
  ws.getCell('F1').font  = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF111827' } }
  ws.getCell('F1').alignment = { vertical: 'middle', horizontal: 'left' }

  ws.mergeCells(`F2:${ultimaLetra}2`)
  ws.getCell('F2').value = info.titulo
  ws.getCell('F2').font  = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF111827' } }
  ws.getCell('F2').alignment = { vertical: 'middle', horizontal: 'left' }

  ws.mergeCells(`F3:${ultimaLetra}3`)
  ws.getCell('F3').value = `${info.fechaLabel}    ·    Total registros: ${info.total}`
  ws.getCell('F3').font  = { name: 'Calibri', size: 10, color: { argb: 'FF374151' } }
  ws.getCell('F3').alignment = { vertical: 'middle', horizontal: 'left' }

  ws.mergeCells(`F4:${ultimaLetra}4`)
  ws.getCell('F4').value = `Generado: ${new Date().toLocaleString('es-GT', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })}`
  ws.getCell('F4').font  = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF6B7280' } }
  ws.getCell('F4').alignment = { vertical: 'middle', horizontal: 'left' }

  // Fila 5: separador vacío
  ws.getRow(5).height = 6

  // ── Anchos de columna (dinámicos según toggles) ──────────────
  const columnsBase = [
    { width: 5  }, // A — #
    { width: 12 }, // B — Placa
    { width: 14 }, // C — Tipo veh.
    { width: 10 }, // D — Registro
    { width: 18 }, // E — Ubicación
    { width: 18 }, // F — Taller Asignado
    { width: 14 }, // G — Fecha Registro
    { width: 14 }, // H — Fecha Aprox. Ingreso
    { width: 9  }, // I — Días en Taller
    { width: 13 }, // J — Cliente paga
    { width: 13 }, // K — Pass paga
    { width: 13 }, // L — Margen
    { width: 22 }, // M — Etapa checking
  ]
  if (mostrarMotivo)        columnsBase.push({ width: 40 })   // Motivo
  if (mostrarObservaciones) columnsBase.push({ width: 40 })   // Observaciones
  ws.columns = columnsBase

  // ── Headers (fila 7) — doble línea con \n + wrapText ────────
  const headers = [
    '#', 'Placa', 'Tipo vehículo', 'Registro', 'Ubicación',
    'Taller\nAsignado',
    'Fecha\nRegistro',
    'Fecha Aprox.\nIngreso',
    'Días en\nTaller',
    'Cliente\npaga',
    'Pass\npaga',
    'Margen',
    'Etapa checking',
  ]
  if (mostrarMotivo)        headers.push('Motivo de\nenvío a taller')
  if (mostrarObservaciones) headers.push('Observaciones')
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

  // Mapeo de columnas (después de las 3 financieras):
  // 1:#  2:Placa  3:Tipo  4:Reg  5:Ubic  6:Taller  7:F.Reg  8:F.Aprox  9:Días
  // 10:Cliente paga  11:Pass paga  12:Margen  13:Etapa checking
  // 14:Motivo (opt)  15:Observaciones (opt)
  const COL_CLIENTE = 10
  const COL_PASS    = 11
  const COL_MARGEN  = 12
  const COL_CHECK   = 13
  const COL_MOTIVO  = mostrarMotivo ? 14 : null
  const COL_OBSERV  = (mostrarMotivo ? 15 : 14)

  filas.forEach((f, idx) => {
    const diasPos = f.dias ?? 0
    const diasNeg = diasPos > 0 ? -diasPos : 0
    const esDano  = f.tipoRegistro === 'dano'

    // Para daños: si no hay cotizaciones, costoPass y margen son null → mostrar "—"
    const costoPassVal = esDano && f.costoPass !== null && f.costoPass !== undefined
      ? Number(f.costoPass)
      : (esDano ? '—' : '—')
    const margenVal2   = esDano && f.margen !== null && f.margen !== undefined
      ? Number(f.margen)
      : (esDano ? '—' : '—')

    const row = [
      idx + 1,
      f.placa,
      f.tipoVehiculo || '',
      esDano ? 'Daño' : 'Servicio',
      f.ubicacion || '',
      f.taller || '',
      formatDate(f.fechaRegistro)  ?? '',
      formatDate(f.fechaEstSalida) ?? '',
      diasNeg,
      esDano ? (Number(f.montoCliente) || 0) : '—',
      costoPassVal,
      margenVal2,
      f.checking ? (CHECKING_LABELS[f.checking] ?? f.checking) : '',
    ]
    if (mostrarMotivo)        row.push(f.motivo || '')
    if (mostrarObservaciones) row.push(f.observaciones || '')

    const r = ws.addRow(row)
    r.height = undefined

    r.eachCell((cell, colNumber) => {
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF111827' } }
      cell.border = {
        top:    { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left:   { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right:  { style: 'thin', color: { argb: 'FFE5E7EB' } },
      }
      if (colNumber === 1 || colNumber === 9) {
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      } else if (colNumber === COL_CLIENTE || colNumber === COL_PASS || colNumber === COL_MARGEN) {
        cell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: false }
      } else if (colNumber === COL_MOTIVO || colNumber === COL_OBSERV) {
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

    // Formato currency en las 3 columnas financieras (sólo cuando la celda
    // contiene un número, no cuando es "—")
    if (esDano) {
      // Cliente paga: siempre numérico (default 0 si no se llenó)
      r.getCell(COL_CLIENTE).numFmt = '"Q "#,##0.00'
      r.getCell(COL_CLIENTE).font = {
        name: 'Calibri', size: 10, bold: true,
        color: { argb: 'FF1D4ED8' },
      }

      // Pass paga: numérico si hay cotizaciones, "—" si no
      if (typeof costoPassVal === 'number') {
        r.getCell(COL_PASS).numFmt = '"Q "#,##0.00'
        r.getCell(COL_PASS).font = {
          name: 'Calibri', size: 10,
          italic: !!f.esTemporal,        // ← italic si propuesta sin aprobar
          color: { argb: f.esTemporal ? 'FF6B7280' : 'FF374151' },
        }
      } else {
        r.getCell(COL_PASS).alignment = { vertical: 'middle', horizontal: 'center' }
        r.getCell(COL_PASS).font = { name: 'Calibri', size: 10, color: { argb: 'FFD1D5DB' } }
      }

      // Margen: numérico si hay cotizaciones, "—" si no
      if (typeof margenVal2 === 'number') {
        r.getCell(COL_MARGEN).numFmt = '"Q "#,##0.00'
        r.getCell(COL_MARGEN).font = {
          name: 'Calibri', size: 10, bold: true,
          italic: !!f.esTemporal,        // ← italic si propuesta sin aprobar
          color: { argb: margenVal2 >= 0 ? 'FF15803D' : 'FFB91C1C' },
        }
      } else {
        r.getCell(COL_MARGEN).alignment = { vertical: 'middle', horizontal: 'center' }
        r.getCell(COL_MARGEN).font = { name: 'Calibri', size: 10, color: { argb: 'FFD1D5DB' } }
      }
    } else {
      // Servicios: las 3 columnas muestran "—" centrado en gris claro
      ;[COL_CLIENTE, COL_PASS, COL_MARGEN].forEach(c => {
        r.getCell(c).alignment = { vertical: 'middle', horizontal: 'center' }
        r.getCell(c).font = { name: 'Calibri', size: 10, color: { argb: 'FFD1D5DB' } }
      })
    }
  })

  if (filas.length === 0) {
    const r = ws.addRow(Array(totalCols).fill(''))
    r.getCell(5).value = 'Sin registros para los filtros seleccionados.'
    ws.mergeCells(`A${r.number}:${ultimaLetra}${r.number}`)
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
