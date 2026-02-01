import { Request, Response } from 'express'
import { pool } from '../config/database'
import { Period, SubPeriod } from '../types'
import { calculateVariation, calculateWeightedResult } from '../utils/kpi-formulas'
import { sendMail } from '../utils/mailer'

const normalizeNumber = (value: any) => {
  if (value === null || value === undefined) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const buildAnnualSummary = async (
  periodId: number,
  generatedBy: number | null
) => {
  const [rows] = await pool.query<any[]>(
    `SELECT ck.*,
            k.name as kpiName,
            k.type as kpiType,
            k.direction as kpiDirection,
            k.formula as kpiFormula,
            c.name as collaboratorName,
            c.email as collaboratorEmail
     FROM collaborator_kpis ck
     JOIN kpis k ON ck.kpiId = k.id
     JOIN collaborators c ON ck.collaboratorId = c.id
     WHERE ck.periodId = ? AND ck.subPeriodId IS NULL`,
    [periodId]
  )

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      summaries: [],
      items: [],
    }
  }

  type Summary = {
    periodId: number
    collaboratorId: number
    collaboratorName: string
    collaboratorEmail: string | null
    totalWeight: number
    totalWeightedResult: number
    overallResult: number
    generatedBy: number | null
    items: any[]
  }

  const summariesMap = new Map<number, Summary>()

  for (const row of rows) {
    const variation =
      normalizeNumber(row.variation) ??
      (row.actual !== null && row.actual !== undefined
        ? calculateVariation(row.kpiDirection, row.target, row.actual, row.kpiFormula || undefined)
        : 0)
    const weightedResult =
      normalizeNumber(row.weightedResult) ?? calculateWeightedResult(variation, row.weight || 0)

    const summary =
      summariesMap.get(row.collaboratorId) ??
      ({
        periodId,
        collaboratorId: row.collaboratorId,
        collaboratorName: row.collaboratorName,
        collaboratorEmail: row.collaboratorEmail || null,
        totalWeight: 0,
        totalWeightedResult: 0,
        overallResult: 0,
        generatedBy,
        items: [],
      } as Summary)

    summary.totalWeight += Number(row.weight || 0)
    summary.totalWeightedResult += Number(weightedResult || 0)
    summary.items.push({
      kpiId: row.kpiId,
      kpiName: row.kpiName,
      target: normalizeNumber(row.target),
      actual: normalizeNumber(row.actual),
      variation,
      weight: normalizeNumber(row.weight),
      weightedResult,
      status: row.status,
    })

    summariesMap.set(row.collaboratorId, summary)
  }

  const summaries = Array.from(summariesMap.values()).map((summary) => ({
    ...summary,
    overallResult:
      summary.totalWeight > 0 ? (summary.totalWeightedResult / summary.totalWeight) * 100 : 0,
  }))

  return { summaries }
}

const sendAnnualSummaryEmails = async (period: Period, summaries: any[]) => {
  for (const summary of summaries) {
    if (!summary.collaboratorEmail) continue
    const rows = summary.items
      .map(
        (item: any) =>
          `<tr>
            <td>${item.kpiName}</td>
            <td>${item.target ?? '-'}</td>
            <td>${item.actual ?? '-'}</td>
            <td>${item.variation ?? '-'}%</td>
            <td>${item.weight ?? '-'}%</td>
            <td>${item.weightedResult ?? '-'}</td>
          </tr>`
      )
      .join('')

    const html = `
      <h2>Resumen anual KPI - ${period.name}</h2>
      <p>Colaborador: <strong>${summary.collaboratorName}</strong></p>
      <p>Resultado ponderado total: <strong>${summary.overallResult.toFixed(2)}%</strong></p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
        <thead>
          <tr>
            <th>KPI</th>
            <th>Target</th>
            <th>Actual</th>
            <th>Variacion</th>
            <th>Peso</th>
            <th>Resultado Ponderado</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `

    await sendMail({
      to: summary.collaboratorEmail,
      subject: `Resumen anual KPI - ${period.name}`,
      html,
    })
  }
}

export const getPeriods = async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<Period[]>(
      'SELECT * FROM periods ORDER BY startDate DESC'
    )
    res.json(rows)
  } catch (error: any) {
    console.error('Error fetching periods:', error)
    res.status(500).json({ error: 'Error al obtener períodos' })
  }
}

export const getPeriodById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query<Period[]>(
      'SELECT * FROM periods WHERE id = ?',
      [id]
    )

    if (Array.isArray(rows) && rows.length === 0) {
      return res.status(404).json({ error: 'Período no encontrado' })
    }

    res.json(rows[0])
  } catch (error: any) {
    console.error('Error fetching period:', error)
    res.status(500).json({ error: 'Error al obtener período' })
  }
}

export const getSubPeriodsByPeriod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { calendarProfileId } = req.query
    const params: any[] = [id]
    let query = 'SELECT * FROM calendar_subperiods WHERE periodId = ?'
    if (calendarProfileId) {
      query += ' AND calendarProfileId = ?'
      params.push(calendarProfileId)
    }
    query += ' ORDER BY startDate ASC'
    const [rows] = await pool.query<SubPeriod[]>(query, params)
    res.json(rows)
  } catch (error: any) {
    console.error('Error fetching sub-periods:', error)
    res.status(500).json({ error: 'Error al obtener subperíodos' })
  }
}

export const createPeriod = async (req: Request, res: Response) => {
  try {
    const { name, startDate, endDate, status } = req.body

    if (!name || !startDate || !endDate) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    const [result] = await pool.query(
      `INSERT INTO periods (name, startDate, endDate, status) 
       VALUES (?, ?, ?, ?)`,
      [name, startDate, endDate, status || 'open']
    )

    const insertResult = result as any
    res.status(201).json({
      id: insertResult.insertId,
      name,
      startDate,
      endDate,
      status: status || 'open',
    })
  } catch (error: any) {
    console.error('Error creating period:', error)
    res.status(500).json({ error: 'Error al crear período' })
  }
}

export const updatePeriod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, startDate, endDate, status } = req.body

    await pool.query(
      `UPDATE periods 
       SET name = ?, startDate = ?, endDate = ?, status = ? 
       WHERE id = ?`,
      [name, startDate, endDate, status, id]
    )

    res.json({ message: 'Período actualizado correctamente' })
  } catch (error: any) {
    console.error('Error updating period:', error)
    res.status(500).json({ error: 'Error al actualizar período' })
  }
}

export const closePeriod = async (req: Request, res: Response) => {
  const conn = await pool.getConnection()
  try {
    const { id } = req.params
    const { sendEmail } = req.body || {}
    const userId = (req as any).user?.id ?? null

    const [periodRows] = await conn.query<Period[]>(
      'SELECT * FROM periods WHERE id = ?',
      [id]
    )

    if (Array.isArray(periodRows) && periodRows.length === 0) {
      conn.release()
      return res.status(404).json({ error: 'Período no encontrado' })
    }

    const period = periodRows[0]

    await conn.beginTransaction()

    const { summaries } = await buildAnnualSummary(Number(id), userId)

    await conn.query(
      `DELETE psi FROM period_summary_items psi
       JOIN period_summaries ps ON ps.id = psi.summaryId
       WHERE ps.periodId = ?`,
      [id]
    )
    await conn.query(`DELETE FROM period_summaries WHERE periodId = ?`, [id])

    for (const summary of summaries) {
      const [summaryResult] = await conn.query(
        `INSERT INTO period_summaries
         (periodId, collaboratorId, totalWeight, totalWeightedResult, overallResult, status, generatedBy)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          summary.collaboratorId,
          summary.totalWeight,
          summary.totalWeightedResult,
          summary.overallResult,
          'closed',
          userId,
        ]
      )
      const insertResult = summaryResult as any
      const summaryId = insertResult.insertId

      for (const item of summary.items) {
        await conn.query(
          `INSERT INTO period_summary_items
           (summaryId, kpiId, target, actual, variation, weight, weightedResult, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            summaryId,
            item.kpiId,
            item.target,
            item.actual,
            item.variation,
            item.weight,
            item.weightedResult,
            item.status || 'draft',
          ]
        )
      }
    }

    await conn.query('UPDATE periods SET status = ? WHERE id = ?', [
      'closed',
      id,
    ])

    await conn.commit()
    conn.release()

    if (sendEmail) {
      await sendAnnualSummaryEmails(period, summaries)
    }

    res.json({
      message: 'Período cerrado correctamente',
      summaries: summaries.length,
      emailsSent: Boolean(sendEmail),
    })
  } catch (error: any) {
    try {
      await conn.rollback()
    } catch {
      // ignore rollback errors
    }
    conn.release()
    console.error('Error closing period:', error)
    res.status(500).json({ error: 'Error al cerrar período' })
  }
}

export const getPeriodSummary = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const [summaries] = await pool.query<any[]>(
      `SELECT ps.*, c.name as collaboratorName
       FROM period_summaries ps
       JOIN collaborators c ON c.id = ps.collaboratorId
       WHERE ps.periodId = ?
       ORDER BY c.name ASC`,
      [id]
    )

    const [items] = await pool.query<any[]>(
      `SELECT psi.*, k.name as kpiName
       FROM period_summary_items psi
       JOIN period_summaries ps ON ps.id = psi.summaryId
       JOIN kpis k ON k.id = psi.kpiId
       WHERE ps.periodId = ?
       ORDER BY psi.summaryId ASC`,
      [id]
    )

    res.json({ summaries, items })
  } catch (error: any) {
    console.error('Error fetching period summary:', error)
    res.status(500).json({ error: 'Error al obtener resumen anual' })
  }
}

export const reopenPeriod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const user = (req as any).user

    // Verificar permisos (solo admin, director o manager pueden reabrir)
    if (
      !user ||
      !['admin', 'director', 'manager'].includes(user.role)
    ) {
      return res
        .status(403)
        .json({
          error: 'No tienes permisos para reabrir períodos cerrados',
        })
    }

    // Verificar que el período existe y está cerrado
    const [periodRows] = await pool.query<Period[]>(
      'SELECT * FROM periods WHERE id = ?',
      [id]
    )

    if (Array.isArray(periodRows) && periodRows.length === 0) {
      return res.status(404).json({ error: 'Período no encontrado' })
    }

    const period = periodRows[0]
    if (period.status !== 'closed') {
      return res
        .status(400)
        .json({ error: 'El período no está cerrado' })
    }

    // Cambiar estado a abierto
    await pool.query('UPDATE periods SET status = ? WHERE id = ?', [
      'open',
      id,
    ])

    res.json({ message: 'Período reabierto correctamente' })
  } catch (error: any) {
    console.error('Error reopening period:', error)
    res.status(500).json({ error: 'Error al reabrir período' })
  }
}

export const deletePeriod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await pool.query('DELETE FROM periods WHERE id = ?', [id])

    res.json({ message: 'Período eliminado correctamente' })
  } catch (error: any) {
    console.error('Error deleting period:', error)
    res.status(500).json({ error: 'Error al eliminar período' })
  }
}
