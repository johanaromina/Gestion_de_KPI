import { Request, Response } from 'express'
import { pool } from '../config/database'
import PDFDocument from 'pdfkit'
import ExcelJS from 'exceljs'

/**
 * Exporta la parrilla de un colaborador en PDF
 */
export const exportParrillaPDF = async (req: Request, res: Response) => {
  try {
    const { collaboratorId, periodId } = req.params

    if (!collaboratorId || !periodId) {
      return res.status(400).json({ error: 'collaboratorId y periodId son requeridos' })
    }

    // Obtener datos del colaborador
    const [collaboratorRows] = await pool.query<any[]>(
      'SELECT * FROM collaborators WHERE id = ?',
      [collaboratorId]
    )

    if (!Array.isArray(collaboratorRows) || collaboratorRows.length === 0) {
      return res.status(404).json({ error: 'Colaborador no encontrado' })
    }

    const collaborator = collaboratorRows[0]

    // Obtener datos del período
    const [periodRows] = await pool.query<any[]>(
      'SELECT * FROM periods WHERE id = ?',
      [periodId]
    )

    if (!Array.isArray(periodRows) || periodRows.length === 0) {
      return res.status(404).json({ error: 'Período no encontrado' })
    }

    const period = periodRows[0]

    // Obtener KPIs del colaborador para el período
    const [kpiRows] = await pool.query<any[]>(
      `SELECT 
        ck.*,
        k.name as kpiName,
        k.description as kpiDescription,
        k.type as kpiType,
        k.criteria as kpiCriteria,
        p.name as periodName,
        p.startDate as periodStartDate,
        p.endDate as periodEndDate
      FROM collaborator_kpis ck
      JOIN kpis k ON ck.kpiId = k.id
      JOIN periods p ON ck.periodId = p.id
      WHERE ck.collaboratorId = ? AND ck.periodId = ?
      ORDER BY ck.createdAt ASC`,
      [collaboratorId, periodId]
    )

    const kpis = Array.isArray(kpiRows) ? kpiRows : []

    // Crear documento PDF
    const doc = new PDFDocument({ margin: 50 })
    
    // Configurar headers de respuesta
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="parrilla_${collaborator.name}_${period.name}.pdf"`
    )

    // Pipe del documento a la respuesta
    doc.pipe(res)

    // Encabezado
    doc.fontSize(20).text('Parrilla de Objetivos', { align: 'center' })
    doc.moveDown()
    doc.fontSize(14).text(`Colaborador: ${collaborator.name}`, { align: 'left' })
    doc.text(`Área: ${collaborator.area}`, { align: 'left' })
    doc.text(`Cargo: ${collaborator.position}`, { align: 'left' })
    doc.text(`Período: ${period.name}`, { align: 'left' })
    doc.text(
      `Fecha: ${new Date(period.startDate).toLocaleDateString('es-ES')} - ${new Date(period.endDate).toLocaleDateString('es-ES')}`,
      { align: 'left' }
    )
    doc.moveDown(2)

    // Tabla de KPIs
    if (kpis.length > 0) {
      // Encabezados de tabla
      const tableTop = doc.y
      const tableLeft = 50
      const rowHeight = 30
      const colWidths = [200, 80, 80, 80, 80, 80, 80]

      // Dibujar encabezados
      doc.fontSize(10).font('Helvetica-Bold')
      doc.text('KPI', tableLeft, tableTop)
      doc.text('Target', tableLeft + colWidths[0], tableTop)
      doc.text('Actual', tableLeft + colWidths[0] + colWidths[1], tableTop)
      doc.text('Peso', tableLeft + colWidths[0] + colWidths[1] + colWidths[2], tableTop)
      doc.text('Variación', tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], tableTop)
      doc.text('Ponderado', tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], tableTop)
      doc.text('Estado', tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5], tableTop)

      // Línea debajo de encabezados
      doc
        .moveTo(tableLeft, tableTop + 20)
        .lineTo(tableLeft + colWidths.reduce((a, b) => a + b, 0), tableTop + 20)
        .stroke()

      // Datos
      doc.font('Helvetica').fontSize(9)
      let currentY = tableTop + 25

      kpis.forEach((kpi: any) => {
        // Verificar si necesitamos una nueva página
        if (currentY > 700) {
          doc.addPage()
          currentY = 50
        }

        doc.text(kpi.kpiName || '-', tableLeft, currentY, { width: colWidths[0] })
        doc.text(parseFloat(kpi.target).toFixed(2), tableLeft + colWidths[0], currentY)
        doc.text(
          kpi.actual !== null ? parseFloat(kpi.actual).toFixed(2) : '-',
          tableLeft + colWidths[0] + colWidths[1],
          currentY
        )
        doc.text(
          `${parseFloat(kpi.weight).toFixed(2)}%`,
          tableLeft + colWidths[0] + colWidths[1] + colWidths[2],
          currentY
        )
        doc.text(
          kpi.variation !== null ? `${parseFloat(kpi.variation).toFixed(2)}%` : '-',
          tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3],
          currentY
        )
        doc.text(
          kpi.weightedResult !== null
            ? parseFloat(kpi.weightedResult).toFixed(2)
            : '-',
          tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4],
          currentY
        )
        doc.text(kpi.status || '-', tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5], currentY)

        // Línea separadora
        doc
          .moveTo(tableLeft, currentY + 15)
          .lineTo(tableLeft + colWidths.reduce((a, b) => a + b, 0), currentY + 15)
          .stroke()

        currentY += rowHeight
      })

      // Calcular totales
      const totalWeight = kpis.reduce(
        (sum: number, kpi: any) => sum + parseFloat(kpi.weight || 0),
        0
      )
      const totalWeightedResult = kpis.reduce(
        (sum: number, kpi: any) =>
          sum + (parseFloat(kpi.weightedResult || 0)),
        0
      )

      currentY += 10
      doc.font('Helvetica-Bold')
      doc.text('Total Peso:', tableLeft + colWidths[0] + colWidths[1] + colWidths[2], currentY)
      doc.text(`${totalWeight.toFixed(2)}%`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], currentY)
      doc.text('Total Ponderado:', tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], currentY)
      doc.text(totalWeightedResult.toFixed(2), tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5], currentY)
    } else {
      doc.text('No hay KPIs asignados para este período', { align: 'center' })
    }

    // Finalizar documento
    doc.end()
  } catch (error: any) {
    console.error('Error exporting PDF:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error al exportar PDF' })
    }
  }
}

/**
 * Exporta la parrilla de un colaborador en Excel
 */
export const exportParrillaExcel = async (req: Request, res: Response) => {
  try {
    const { collaboratorId, periodId } = req.params

    if (!collaboratorId || !periodId) {
      return res.status(400).json({ error: 'collaboratorId y periodId son requeridos' })
    }

    // Obtener datos del colaborador
    const [collaboratorRows] = await pool.query<any[]>(
      'SELECT * FROM collaborators WHERE id = ?',
      [collaboratorId]
    )

    if (!Array.isArray(collaboratorRows) || collaboratorRows.length === 0) {
      return res.status(404).json({ error: 'Colaborador no encontrado' })
    }

    const collaborator = collaboratorRows[0]

    // Obtener datos del período
    const [periodRows] = await pool.query<any[]>(
      'SELECT * FROM periods WHERE id = ?',
      [periodId]
    )

    if (!Array.isArray(periodRows) || periodRows.length === 0) {
      return res.status(404).json({ error: 'Período no encontrado' })
    }

    const period = periodRows[0]

    // Obtener KPIs del colaborador para el período
    const [kpiRows] = await pool.query<any[]>(
      `SELECT 
        ck.*,
        k.name as kpiName,
        k.description as kpiDescription,
        k.type as kpiType,
        k.criteria as kpiCriteria,
        p.name as periodName,
        p.startDate as periodStartDate,
        p.endDate as periodEndDate
      FROM collaborator_kpis ck
      JOIN kpis k ON ck.kpiId = k.id
      JOIN periods p ON ck.periodId = p.id
      WHERE ck.collaboratorId = ? AND ck.periodId = ?
      ORDER BY ck.createdAt ASC`,
      [collaboratorId, periodId]
    )

    const kpis = Array.isArray(kpiRows) ? kpiRows : []

    // Crear workbook de Excel
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Parrilla de Objetivos')

    // Estilos
    const headerStyle = {
      font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } },
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1e40af' },
      },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      },
    }

    const cellStyle = {
      border: {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      },
      alignment: { vertical: 'middle' },
    }

    // Información del colaborador y período
    worksheet.mergeCells('A1:F1')
    worksheet.getCell('A1').value = 'Parrilla de Objetivos'
    worksheet.getCell('A1').font = { bold: true, size: 16 }
    worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }

    worksheet.getCell('A3').value = 'Colaborador:'
    worksheet.getCell('B3').value = collaborator.name
    worksheet.getCell('A4').value = 'Área:'
    worksheet.getCell('B4').value = collaborator.area
    worksheet.getCell('A5').value = 'Cargo:'
    worksheet.getCell('B5').value = collaborator.position
    worksheet.getCell('A6').value = 'Período:'
    worksheet.getCell('B6').value = period.name
    worksheet.getCell('A7').value = 'Fecha:'
    worksheet.getCell('B7').value = `${new Date(period.startDate).toLocaleDateString('es-ES')} - ${new Date(period.endDate).toLocaleDateString('es-ES')}`

    // Encabezados de tabla
    const headerRow = 9
    worksheet.getCell(`A${headerRow}`).value = 'KPI'
    worksheet.getCell(`B${headerRow}`).value = 'Target'
    worksheet.getCell(`C${headerRow}`).value = 'Actual'
    worksheet.getCell(`D${headerRow}`).value = 'Peso (%)'
    worksheet.getCell(`E${headerRow}`).value = 'Variación (%)'
    worksheet.getCell(`F${headerRow}`).value = 'Alcance Ponderado'
    worksheet.getCell(`G${headerRow}`).value = 'Estado'
    worksheet.getCell(`H${headerRow}`).value = 'Comentarios'

    // Aplicar estilo a encabezados
    for (let col = 1; col <= 8; col++) {
      const cell = worksheet.getCell(headerRow, col)
      Object.assign(cell, headerStyle)
    }

    // Datos
    kpis.forEach((kpi: any, index: number) => {
      const row = headerRow + 1 + index
      worksheet.getCell(`A${row}`).value = kpi.kpiName || '-'
      worksheet.getCell(`B${row}`).value = parseFloat(kpi.target)
      worksheet.getCell(`B${row}`).numFmt = '0.00'
      worksheet.getCell(`C${row}`).value =
        kpi.actual !== null ? parseFloat(kpi.actual) : null
      worksheet.getCell(`C${row}`).numFmt = '0.00'
      worksheet.getCell(`D${row}`).value = parseFloat(kpi.weight)
      worksheet.getCell(`D${row}`).numFmt = '0.00'
      worksheet.getCell(`E${row}`).value =
        kpi.variation !== null ? parseFloat(kpi.variation) : null
      worksheet.getCell(`E${row}`).numFmt = '0.00'
      worksheet.getCell(`F${row}`).value =
        kpi.weightedResult !== null ? parseFloat(kpi.weightedResult) : null
      worksheet.getCell(`F${row}`).numFmt = '0.00'
      worksheet.getCell(`G${row}`).value = kpi.status || '-'
      worksheet.getCell(`H${row}`).value = kpi.comments || '-'

      // Aplicar estilo a celdas
      for (let col = 1; col <= 8; col++) {
        const cell = worksheet.getCell(row, col)
        Object.assign(cell, cellStyle)
      }
    })

    // Fila de totales
    const totalRow = headerRow + 1 + kpis.length
    worksheet.getCell(`D${totalRow}`).value = 'Total:'
    worksheet.getCell(`D${totalRow}`).font = { bold: true }
    
    const totalWeight = kpis.reduce(
      (sum: number, kpi: any) => sum + parseFloat(kpi.weight || 0),
      0
    )
    worksheet.getCell(`D${totalRow + 1}`).value = totalWeight
    worksheet.getCell(`D${totalRow + 1}`).numFmt = '0.00'
    worksheet.getCell(`D${totalRow + 1}`).font = { bold: true }

    const totalWeightedResult = kpis.reduce(
      (sum: number, kpi: any) => sum + (parseFloat(kpi.weightedResult || 0)),
      0
    )
    worksheet.getCell(`F${totalRow}`).value = 'Total Ponderado:'
    worksheet.getCell(`F${totalRow}`).font = { bold: true }
    worksheet.getCell(`F${totalRow + 1}`).value = totalWeightedResult
    worksheet.getCell(`F${totalRow + 1}`).numFmt = '0.00'
    worksheet.getCell(`F${totalRow + 1}`).font = { bold: true }

    // Ajustar ancho de columnas
    worksheet.getColumn('A').width = 40
    worksheet.getColumn('B').width = 12
    worksheet.getColumn('C').width = 12
    worksheet.getColumn('D').width = 12
    worksheet.getColumn('E').width = 15
    worksheet.getColumn('F').width = 18
    worksheet.getColumn('G').width = 15
    worksheet.getColumn('H').width = 30

    // Configurar headers de respuesta
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="parrilla_${collaborator.name}_${period.name}.xlsx"`
    )

    // Escribir workbook a la respuesta
    await workbook.xlsx.write(res)
    res.end()
  } catch (error: any) {
    console.error('Error exporting Excel:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error al exportar Excel' })
    }
  }
}

