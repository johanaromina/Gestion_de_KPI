import { Request, Response } from 'express'
import { pool } from '../config/database'
import PDFDocument from 'pdfkit'
import ExcelJS from 'exceljs'
import { calculateVariation } from '../utils/kpi-formulas'
import { KPIDirection, KPIType } from '../types'

// ── Colores OKR ───────────────────────────────────────────────
const OKR_BLUE  = '#2563eb'
const OKR_GREEN = '#16a34a'
const OKR_RED   = '#dc2626'
const OKR_AMBER = '#d97706'
const OKR_GRAY  = '#6b7280'

const okrProgressColor = (p: number) => p >= 70 ? OKR_GREEN : p >= 40 ? OKR_AMBER : OKR_RED

const krStatusLabel: Record<string, string> = {
  not_started: 'Sin iniciar',
  on_track:    'En camino',
  at_risk:     'En riesgo',
  behind:      'Atrasado',
  completed:   'Completado',
}

const objStatusLabel: Record<string, string> = {
  active: 'Activo',
  draft:  'Borrador',
  closed: 'Cerrado',
}

const resolveDirection = (direction?: string | null, type?: string | null): KPIDirection => {
  if (direction === 'growth' || direction === 'reduction' || direction === 'exact') return direction
  if (type === 'growth' || type === 'reduction' || type === 'exact') return type
  if (type === 'sla') return 'reduction'
  return 'growth'
}

const calculateWeightedImpact = (variation: number, weight: number, subPeriodWeight?: number | null) => {
  const weightValue = Number(weight ?? 0)
  const subWeightValue = Number(subPeriodWeight ?? 100)
  const normalizedSubWeight = Number.isFinite(subWeightValue) && subWeightValue > 0 ? subWeightValue : 100
  if (!Number.isFinite(weightValue) || weightValue <= 0) return 0
  return (variation * (weightValue / 100)) * (normalizedSubWeight / 100)
}

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
        k.direction as kpiDirection,
        k.criteria as kpiCriteria,
        p.name as periodName,
        p.startDate as periodStartDate,
        p.endDate as periodEndDate,
        sp.weight as subPeriodWeight
      FROM collaborator_kpis ck
      JOIN kpis k ON ck.kpiId = k.id
      JOIN periods p ON ck.periodId = p.id
      LEFT JOIN calendar_subperiods sp ON ck.subPeriodId = sp.id
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

        const direction = resolveDirection(kpi.kpiDirection, kpi.kpiType as KPIType)
        const variation =
          kpi.variation !== null && kpi.variation !== undefined
            ? Number(kpi.variation)
            : calculateVariation(direction, Number(kpi.target ?? 0), Number(kpi.actual ?? 0))
        const weightedImpact = calculateWeightedImpact(variation, kpi.weight, kpi.subPeriodWeight)

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
          Number.isFinite(variation) ? `${variation.toFixed(2)}%` : '-',
          tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3],
          currentY
        )
        doc.text(
          Number.isFinite(weightedImpact) ? weightedImpact.toFixed(2) : '-',
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
      const totalWeightedResult = kpis.reduce((sum: number, kpi: any) => {
        const direction = resolveDirection(kpi.kpiDirection, kpi.kpiType as KPIType)
        const variation =
          kpi.variation !== null && kpi.variation !== undefined
            ? Number(kpi.variation)
            : calculateVariation(direction, Number(kpi.target ?? 0), Number(kpi.actual ?? 0))
        const weightedImpact = calculateWeightedImpact(variation, kpi.weight, kpi.subPeriodWeight)
        return sum + (Number.isFinite(weightedImpact) ? weightedImpact : 0)
      }, 0)

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
        k.direction as kpiDirection,
        k.criteria as kpiCriteria,
        p.name as periodName,
        p.startDate as periodStartDate,
        p.endDate as periodEndDate,
        sp.weight as subPeriodWeight
      FROM collaborator_kpis ck
      JOIN kpis k ON ck.kpiId = k.id
      JOIN periods p ON ck.periodId = p.id
      LEFT JOIN calendar_subperiods sp ON ck.subPeriodId = sp.id
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
      const direction = resolveDirection(kpi.kpiDirection, kpi.kpiType as KPIType)
      const variation =
        kpi.variation !== null && kpi.variation !== undefined
          ? Number(kpi.variation)
          : calculateVariation(direction, Number(kpi.target ?? 0), Number(kpi.actual ?? 0))
      const weightedImpact = calculateWeightedImpact(variation, kpi.weight, kpi.subPeriodWeight)
      const row = headerRow + 1 + index
      worksheet.getCell(`A${row}`).value = kpi.kpiName || '-'
      worksheet.getCell(`B${row}`).value = parseFloat(kpi.target)
      worksheet.getCell(`B${row}`).numFmt = '0.00'
      worksheet.getCell(`C${row}`).value =
        kpi.actual !== null ? parseFloat(kpi.actual) : null
      worksheet.getCell(`C${row}`).numFmt = '0.00'
      worksheet.getCell(`D${row}`).value = parseFloat(kpi.weight)
      worksheet.getCell(`D${row}`).numFmt = '0.00'
      worksheet.getCell(`E${row}`).value = Number.isFinite(variation) ? variation : null
      worksheet.getCell(`E${row}`).numFmt = '0.00'
      worksheet.getCell(`F${row}`).value = Number.isFinite(weightedImpact) ? weightedImpact : null
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

    const totalWeightedResult = kpis.reduce((sum: number, kpi: any) => {
      const direction = resolveDirection(kpi.kpiDirection, kpi.kpiType as KPIType)
      const variation =
        kpi.variation !== null && kpi.variation !== undefined
          ? Number(kpi.variation)
          : calculateVariation(direction, Number(kpi.target ?? 0), Number(kpi.actual ?? 0))
      const weightedImpact = calculateWeightedImpact(variation, kpi.weight, kpi.subPeriodWeight)
      return sum + (Number.isFinite(weightedImpact) ? weightedImpact : 0)
    }, 0)
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

// ────────────────────────────────────────────────────────────────────────────
// OKR helpers
// ────────────────────────────────────────────────────────────────────────────

async function fetchObjectiveWithKRs(objectiveId: number) {
  const [objRows] = await pool.query<any[]>(
    `SELECT o.*,
            p.name  AS periodName,
            c.name  AS ownerName,
            os.name AS orgScopeName
     FROM okr_objectives o
     LEFT JOIN periods     p  ON o.periodId   = p.id
     LEFT JOIN collaborators c ON o.ownerId   = c.id
     LEFT JOIN org_scopes  os ON o.orgScopeId = os.id
     WHERE o.id = ?`,
    [objectiveId]
  )
  if (!Array.isArray(objRows) || objRows.length === 0) return null
  const obj = objRows[0]

  const [krRows] = await pool.query<any[]>(
    `SELECT kr.*,
            c.name  AS ownerName,
            k.name  AS kpiName,
            ck.actual AS kpiActual, ck.target AS kpiTarget,
            sk.actual AS scopeActual, sk.target AS scopeTarget
     FROM okr_key_results kr
     LEFT JOIN collaborators   c  ON kr.ownerId          = c.id
     LEFT JOIN collaborator_kpis ck ON kr.collaboratorKpiId = ck.id
     LEFT JOIN scope_kpis        sk ON kr.scopeKpiId        = sk.id
     LEFT JOIN kpis              k  ON (ck.kpiId = k.id OR sk.kpiId = k.id)
     WHERE kr.objectiveId = ?
     ORDER BY kr.createdAt ASC`,
    [objectiveId]
  )
  obj.keyResults = Array.isArray(krRows) ? krRows : []
  return obj
}

async function fetchObjectivesByPeriod(periodId: number) {
  const [objRows] = await pool.query<any[]>(
    `SELECT o.*,
            p.name  AS periodName,
            c.name  AS ownerName,
            os.name AS orgScopeName
     FROM okr_objectives o
     LEFT JOIN periods      p  ON o.periodId   = p.id
     LEFT JOIN collaborators c  ON o.ownerId   = c.id
     LEFT JOIN org_scopes   os ON o.orgScopeId = os.id
     WHERE o.periodId = ?
     ORDER BY o.createdAt ASC`,
    [periodId]
  )
  const objectives = Array.isArray(objRows) ? objRows : []
  for (const obj of objectives) {
    const [krRows] = await pool.query<any[]>(
      `SELECT kr.*,
              c.name  AS ownerName,
              k.name  AS kpiName,
              ck.actual AS kpiActual, ck.target AS kpiTarget,
              sk.actual AS scopeActual, sk.target AS scopeTarget
       FROM okr_key_results kr
       LEFT JOIN collaborators    c  ON kr.ownerId          = c.id
       LEFT JOIN collaborator_kpis ck ON kr.collaboratorKpiId = ck.id
       LEFT JOIN scope_kpis        sk ON kr.scopeKpiId        = sk.id
       LEFT JOIN kpis              k  ON (ck.kpiId = k.id OR sk.kpiId = k.id)
       WHERE kr.objectiveId = ?
       ORDER BY kr.createdAt ASC`,
      [obj.id]
    )
    obj.keyResults = Array.isArray(krRows) ? krRows : []
  }
  return objectives
}

function calcKrProgressLocal(kr: any): number {
  if (kr.krType === 'kpi_linked') {
    const actual = kr.kpiActual ?? kr.scopeActual ?? 0
    const target = kr.kpiTarget ?? kr.scopeTarget ?? 0
    if (target === 0) return 0
    return Math.min(100, Math.max(0, (actual / target) * 100))
  }
  const start   = Number(kr.startValue   ?? 0)
  const target  = Number(kr.targetValue  ?? 0)
  const current = Number(kr.currentValue ?? start)
  if (target === start) return current >= target ? 100 : 0
  return Math.min(100, Math.max(0, ((current - start) / (target - start)) * 100))
}

// ────────────────────────────────────────────────────────────────────────────
// PDF de un objetivo
// ────────────────────────────────────────────────────────────────────────────

export const exportOKRObjectivePDF = async (req: Request, res: Response) => {
  try {
    const objectiveId = parseInt(req.params.objectiveId, 10)
    const obj = await fetchObjectiveWithKRs(objectiveId)
    if (!obj) return res.status(404).json({ error: 'Objetivo no encontrado' })

    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition',
      `attachment; filename="okr_${obj.id}_${(obj.title as string).replace(/\s+/g, '_').slice(0, 40)}.pdf"`)
    doc.pipe(res)

    // ── Header ──
    doc.rect(50, 50, doc.page.width - 100, 60).fill(OKR_BLUE)
    doc.fillColor('#fff').fontSize(18).font('Helvetica-Bold')
       .text('Reporte OKR', 65, 62)
    doc.fontSize(10).font('Helvetica')
       .text(`Generado el ${new Date().toLocaleDateString('es-AR')}`, 65, 84)
    doc.fillColor('#000')
    doc.moveDown(4)

    // ── Datos del objetivo ──
    const y0 = doc.y
    doc.fontSize(14).font('Helvetica-Bold').fillColor(OKR_BLUE).text(obj.title, 50, y0)
    doc.fillColor('#000').font('Helvetica').fontSize(10)
    if (obj.description) { doc.moveDown(0.4); doc.text(obj.description, { width: 495 }) }
    doc.moveDown(0.5)

    const meta = [
      ['Período',     obj.periodName   || '—'],
      ['Área / Scope', obj.orgScopeName || '—'],
      ['Responsable', obj.ownerName    || '—'],
      ['Estado',      objStatusLabel[obj.status] || obj.status],
      ['Progreso',    `${Math.round(obj.progress || 0)}%`],
    ]
    meta.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').text(`${label}: `, { continued: true })
         .font('Helvetica').text(value)
    })

    // Barra de progreso del objetivo
    doc.moveDown(0.5)
    const barX = 50; const barW = 495; const barH = 10
    doc.rect(barX, doc.y, barW, barH).fill('#f3f4f6')
    const pct = Math.min(100, Math.max(0, Number(obj.progress || 0)))
    const color = okrProgressColor(pct)
    doc.rect(barX, doc.y - barH, barW * (pct / 100), barH).fill(color)
    doc.fillColor('#000').moveDown(1)

    // ── Key Results ──
    doc.fontSize(12).font('Helvetica-Bold').text('Key Results', 50, doc.y)
    doc.moveDown(0.4)

    const krs: any[] = obj.keyResults || []
    if (krs.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor(OKR_GRAY).text('Sin key results definidos.')
    } else {
      krs.forEach((kr: any, i: number) => {
        if (doc.y > 700) doc.addPage()
        const krPct = Math.round(calcKrProgressLocal(kr))
        const krColor = okrProgressColor(krPct)

        doc.rect(50, doc.y, 495, 1).fill('#e5e7eb')
        doc.moveDown(0.3)
        doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10)
           .text(`${i + 1}. ${kr.title}`)
        doc.font('Helvetica').fontSize(9).fillColor(OKR_GRAY)
        if (kr.ownerName) doc.text(`Responsable: ${kr.ownerName}`, { continued: true })
        doc.text(`   Estado: ${krStatusLabel[kr.status] || kr.status}`)

        if (kr.krType === 'kpi_linked') {
          const kpiActual = kr.kpiActual ?? kr.scopeActual ?? '—'
          const kpiTarget = kr.kpiTarget ?? kr.scopeTarget ?? '—'
          doc.fillColor('#92400e').text(`KPI vinculado: ${kr.kpiName || 'KPI'} — Actual: ${kpiActual} / Meta: ${kpiTarget}`)
        } else {
          const cur = kr.currentValue ?? kr.startValue ?? 0
          const tgt = kr.targetValue ?? 0
          const unit = kr.unit ? ` ${kr.unit}` : ''
          doc.fillColor('#374151').text(`Valor: ${cur}${unit} / Meta: ${tgt}${unit}`)
        }

        // Mini barra KR
        doc.fillColor('#000').moveDown(0.3)
        const kBarX = 50; const kBarW = 300; const kBarH = 6
        doc.rect(kBarX, doc.y, kBarW, kBarH).fill('#f3f4f6')
        doc.rect(kBarX, doc.y, kBarW * (krPct / 100), kBarH).fill(krColor)
        doc.fillColor(krColor).fontSize(9)
           .text(`${krPct}%`, kBarX + kBarW + 8, doc.y - kBarH + 1)
        doc.fillColor('#000').moveDown(0.8)
      })
    }

    // ── Footer ──
    doc.moveDown(2)
    doc.fontSize(8).fillColor(OKR_GRAY)
       .text('Este reporte fue generado automáticamente por KPI Manager.', 50, doc.y, { align: 'center' })

    doc.end()
  } catch (error: any) {
    console.error('Error exporting OKR PDF:', error)
    if (!res.headersSent) res.status(500).json({ error: 'Error al exportar PDF' })
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Excel de un objetivo
// ────────────────────────────────────────────────────────────────────────────

export const exportOKRObjectiveExcel = async (req: Request, res: Response) => {
  try {
    const objectiveId = parseInt(req.params.objectiveId, 10)
    const obj = await fetchObjectiveWithKRs(objectiveId)
    if (!obj) return res.status(404).json({ error: 'Objetivo no encontrado' })

    const workbook  = new ExcelJS.Workbook()
    const wsInfo    = workbook.addWorksheet('Objetivo')
    const wsKRs     = workbook.addWorksheet('Key Results')

    const blueHeader = {
      font:      { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
      fill:      { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF2563EB' } },
      alignment: { horizontal: 'center' as const, vertical: 'middle' as const },
      border:    { top: { style: 'thin' as const }, left: { style: 'thin' as const }, bottom: { style: 'thin' as const }, right: { style: 'thin' as const } },
    }
    const cell = { border: { top: { style: 'thin' as const }, left: { style: 'thin' as const }, bottom: { style: 'thin' as const }, right: { style: 'thin' as const } } }

    // ── Hoja 1: Info del objetivo ──
    wsInfo.mergeCells('A1:B1')
    wsInfo.getCell('A1').value = 'Reporte OKR'
    wsInfo.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF2563EB' } }

    const infoRows = [
      ['Título',      obj.title],
      ['Descripción', obj.description || '—'],
      ['Período',     obj.periodName  || '—'],
      ['Área',        obj.orgScopeName || '—'],
      ['Responsable', obj.ownerName   || '—'],
      ['Estado',      objStatusLabel[obj.status] || obj.status],
      ['Progreso',    `${Math.round(obj.progress || 0)}%`],
      ['Generado el', new Date().toLocaleDateString('es-AR')],
    ]
    infoRows.forEach(([k, v], i) => {
      wsInfo.getCell(`A${i + 3}`).value = k
      wsInfo.getCell(`A${i + 3}`).font = { bold: true }
      wsInfo.getCell(`B${i + 3}`).value = v
    })
    wsInfo.getColumn('A').width = 20
    wsInfo.getColumn('B').width = 60

    // ── Hoja 2: Key Results ──
    const headers = ['#', 'Key Result', 'Tipo', 'Responsable', 'Inicio', 'Meta', 'Actual / KPI', 'Unidad', 'Progreso %', 'Estado']
    headers.forEach((h, i) => {
      const c = wsKRs.getCell(1, i + 1)
      c.value = h
      Object.assign(c, blueHeader)
    })

    const krs: any[] = obj.keyResults || []
    krs.forEach((kr: any, i: number) => {
      const row = i + 2
      const pct = Math.round(calcKrProgressLocal(kr))
      const actual = kr.krType === 'kpi_linked'
        ? `${kr.kpiActual ?? kr.scopeActual ?? '—'} (KPI: ${kr.kpiName || '—'})`
        : String(kr.currentValue ?? kr.startValue ?? 0)

      const vals = [
        i + 1,
        kr.title,
        kr.krType === 'kpi_linked' ? 'Vinculado a KPI' : 'Valor manual',
        kr.ownerName || '—',
        kr.krType === 'kpi_linked' ? '—' : Number(kr.startValue ?? 0),
        kr.krType === 'kpi_linked' ? (kr.kpiTarget ?? kr.scopeTarget ?? '—') : Number(kr.targetValue ?? 0),
        actual,
        kr.unit || '—',
        pct,
        krStatusLabel[kr.status] || kr.status,
      ]
      vals.forEach((v, j) => {
        const c = wsKRs.getCell(row, j + 1)
        c.value = v as any
        Object.assign(c, cell)
      })
      // Color progreso
      const pctCell = wsKRs.getCell(row, 9)
      pctCell.font = { bold: true, color: { argb: 'FF' + okrProgressColor(pct).slice(1) } }
    })

    wsKRs.getColumn(1).width = 5
    wsKRs.getColumn(2).width = 50
    wsKRs.getColumn(3).width = 20
    wsKRs.getColumn(4).width = 20
    wsKRs.getColumn(5).width = 10
    wsKRs.getColumn(6).width = 10
    wsKRs.getColumn(7).width = 30
    wsKRs.getColumn(8).width = 10
    wsKRs.getColumn(9).width = 12
    wsKRs.getColumn(10).width = 16
    wsKRs.getRow(1).height = 22

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition',
      `attachment; filename="okr_${obj.id}_${(obj.title as string).replace(/\s+/g, '_').slice(0, 40)}.xlsx"`)
    await workbook.xlsx.write(res)
    res.end()
  } catch (error: any) {
    console.error('Error exporting OKR Excel:', error)
    if (!res.headersSent) res.status(500).json({ error: 'Error al exportar Excel' })
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PDF de todos los objetivos de un período
// ────────────────────────────────────────────────────────────────────────────

export const exportOKRPeriodPDF = async (req: Request, res: Response) => {
  try {
    const periodId = parseInt(req.params.periodId, 10)
    const [periodRows] = await pool.query<any[]>('SELECT * FROM periods WHERE id = ?', [periodId])
    if (!Array.isArray(periodRows) || periodRows.length === 0)
      return res.status(404).json({ error: 'Período no encontrado' })
    const period = periodRows[0]

    const objectives = await fetchObjectivesByPeriod(periodId)

    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition',
      `attachment; filename="okr_periodo_${period.name.replace(/\s+/g, '_')}.pdf"`)
    doc.pipe(res)

    // ── Portada ──
    doc.rect(50, 50, doc.page.width - 100, 70).fill(OKR_BLUE)
    doc.fillColor('#fff').fontSize(20).font('Helvetica-Bold')
       .text('Reporte OKR por Período', 65, 62)
    doc.fontSize(11).font('Helvetica')
       .text(`Período: ${period.name}    ·    Generado el ${new Date().toLocaleDateString('es-AR')}`, 65, 90)
    doc.fillColor('#000').moveDown(4)

    // Resumen
    const total   = objectives.length
    const avgProg = total > 0
      ? Math.round(objectives.reduce((s: number, o: any) => s + Number(o.progress || 0), 0) / total)
      : 0
    const atRisk  = objectives.filter((o: any) => Number(o.progress || 0) < 40).length

    doc.fontSize(11).font('Helvetica')
    doc.text(`Total de objetivos: ${total}    ·    Progreso promedio: ${avgProg}%    ·    En riesgo (<40%): ${atRisk}`)
    doc.moveDown(1)
    doc.rect(50, doc.y, 495, 1).fill('#e5e7eb')
    doc.moveDown(1)

    // ── Objetivos ──
    objectives.forEach((obj: any, idx: number) => {
      if (doc.y > 680) doc.addPage()

      const pct   = Math.round(Number(obj.progress || 0))
      const color = okrProgressColor(pct)

      doc.fontSize(12).font('Helvetica-Bold').fillColor(OKR_BLUE)
         .text(`${idx + 1}. ${obj.title}`, 50, doc.y)
      doc.font('Helvetica').fontSize(9).fillColor('#6b7280')
      const metaParts = [
        obj.orgScopeName && `Área: ${obj.orgScopeName}`,
        obj.ownerName    && `Resp: ${obj.ownerName}`,
        `Estado: ${objStatusLabel[obj.status] || obj.status}`,
      ].filter(Boolean)
      doc.text(metaParts.join('    '))

      // Barra del objetivo
      doc.moveDown(0.3)
      const bX = 50; const bW = 380; const bH = 8
      doc.rect(bX, doc.y, bW, bH).fill('#f3f4f6')
      doc.rect(bX, doc.y, bW * (pct / 100), bH).fill(color)
      doc.fillColor(color).fontSize(9).font('Helvetica-Bold')
         .text(`${pct}%`, bX + bW + 8, doc.y - bH + 1)
      doc.fillColor('#000').moveDown(0.8)

      // KRs compactos
      const krs: any[] = obj.keyResults || []
      krs.forEach((kr: any) => {
        if (doc.y > 720) doc.addPage()
        const kPct   = Math.round(calcKrProgressLocal(kr))
        const kColor = okrProgressColor(kPct)
        doc.fillColor('#374151').fontSize(8).font('Helvetica')
           .text(`  • ${kr.title}`, 60, doc.y, { continued: true })
           .fillColor(kColor).font('Helvetica-Bold')
           .text(`  ${kPct}%   `, { continued: true })
           .fillColor('#9ca3af').font('Helvetica')
           .text(krStatusLabel[kr.status] || kr.status)
        doc.moveDown(0.2)
      })
      doc.moveDown(0.6)
      doc.rect(50, doc.y, 495, 1).fill('#f3f4f6')
      doc.moveDown(0.5)
    })

    doc.end()
  } catch (error: any) {
    console.error('Error exporting OKR period PDF:', error)
    if (!res.headersSent) res.status(500).json({ error: 'Error al exportar PDF' })
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Excel de todos los objetivos de un período
// ────────────────────────────────────────────────────────────────────────────

export const exportOKRPeriodExcel = async (req: Request, res: Response) => {
  try {
    const periodId = parseInt(req.params.periodId, 10)
    const [periodRows] = await pool.query<any[]>('SELECT * FROM periods WHERE id = ?', [periodId])
    if (!Array.isArray(periodRows) || periodRows.length === 0)
      return res.status(404).json({ error: 'Período no encontrado' })
    const period = periodRows[0]

    const objectives = await fetchObjectivesByPeriod(periodId)
    const workbook = new ExcelJS.Workbook()

    // ── Hoja resumen ──
    const wsSummary = workbook.addWorksheet('Resumen')
    const blueH = {
      font:      { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
      fill:      { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF2563EB' } },
      alignment: { horizontal: 'center' as const, vertical: 'middle' as const },
      border:    { top: { style: 'thin' as const }, left: { style: 'thin' as const }, bottom: { style: 'thin' as const }, right: { style: 'thin' as const } },
    }
    const cellB = { border: { top: { style: 'thin' as const }, left: { style: 'thin' as const }, bottom: { style: 'thin' as const }, right: { style: 'thin' as const } } }

    wsSummary.mergeCells('A1:G1')
    wsSummary.getCell('A1').value = `Reporte OKR — ${period.name}`
    wsSummary.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF2563EB' } }
    wsSummary.getRow(1).height = 28

    const summaryHeaders = ['Objetivo', 'Área', 'Responsable', 'Estado', 'Progreso %', 'KRs totales', 'KRs completados']
    summaryHeaders.forEach((h, i) => {
      const c = wsSummary.getCell(3, i + 1)
      c.value = h
      Object.assign(c, blueH)
    })

    objectives.forEach((obj: any, i: number) => {
      const row = i + 4
      const krs: any[] = obj.keyResults || []
      const completed = krs.filter((k: any) => k.status === 'completed').length
      const vals = [
        obj.title,
        obj.orgScopeName || '—',
        obj.ownerName    || '—',
        objStatusLabel[obj.status] || obj.status,
        Math.round(Number(obj.progress || 0)),
        krs.length,
        completed,
      ]
      vals.forEach((v, j) => {
        const c = wsSummary.getCell(row, j + 1)
        c.value = v as any
        Object.assign(c, cellB)
      })
      const pctCell = wsSummary.getCell(row, 5)
      const pct = Number(obj.progress || 0)
      pctCell.font = { bold: true, color: { argb: 'FF' + okrProgressColor(pct).slice(1) } }
    })

    ;[50, 30, 25, 14, 14, 14, 18].forEach((w, i) => { wsSummary.getColumn(i + 1).width = w })

    // ── Hoja detalle KRs ──
    const wsKRs = workbook.addWorksheet('Key Results')
    const krHeaders = ['Objetivo', 'Key Result', 'Tipo', 'Responsable', 'Meta', 'Actual', 'Unidad', 'Progreso %', 'Estado']
    krHeaders.forEach((h, i) => {
      const c = wsKRs.getCell(1, i + 1)
      c.value = h
      Object.assign(c, blueH)
    })

    let krRow = 2
    objectives.forEach((obj: any) => {
      const krs: any[] = obj.keyResults || []
      krs.forEach((kr: any) => {
        const pct    = Math.round(calcKrProgressLocal(kr))
        const actual = kr.krType === 'kpi_linked'
          ? (kr.kpiActual ?? kr.scopeActual ?? '—')
          : Number(kr.currentValue ?? kr.startValue ?? 0)
        const target = kr.krType === 'kpi_linked'
          ? (kr.kpiTarget ?? kr.scopeTarget ?? '—')
          : Number(kr.targetValue ?? 0)

        const vals = [
          obj.title,
          kr.title,
          kr.krType === 'kpi_linked' ? 'Vinculado KPI' : 'Manual',
          kr.ownerName || '—',
          target,
          actual,
          kr.unit || '—',
          pct,
          krStatusLabel[kr.status] || kr.status,
        ]
        vals.forEach((v, j) => {
          const c = wsKRs.getCell(krRow, j + 1)
          c.value = v as any
          Object.assign(c, cellB)
        })
        const pctC = wsKRs.getCell(krRow, 8)
        pctC.font = { bold: true, color: { argb: 'FF' + okrProgressColor(pct).slice(1) } }
        krRow++
      })
    })

    ;[40, 40, 16, 20, 10, 10, 10, 14, 16].forEach((w, i) => { wsKRs.getColumn(i + 1).width = w })
    wsKRs.getRow(1).height = 22

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition',
      `attachment; filename="okr_periodo_${period.name.replace(/\s+/g, '_')}.xlsx"`)
    await workbook.xlsx.write(res)
    res.end()
  } catch (error: any) {
    console.error('Error exporting OKR period Excel:', error)
    if (!res.headersSent) res.status(500).json({ error: 'Error al exportar Excel' })
  }
}

