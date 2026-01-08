import { Request, Response } from 'express'
import { pool } from '../config/database.js'

export const getEvolution = async (req: Request, res: Response) => {
  try {
    const { collaboratorId, kpiId, periodId } = req.query

    let query = `
      SELECT 
        ev.id,
        ev.collaboratorId,
        c.name as collaboratorName,
        c.area as collaboratorArea,
        ev.kpiId,
        k.name as kpiName,
        k.type as kpiType,
        ev.periodId,
        p.name as periodName,
        ev.monthDate,
        ev.planValue,
        ev.actualValue,
        ev.variation,
        ev.weightedResult,
        ev.source,
        ev.modality,
        ev.typeHint
      FROM kpi_evolutions ev
      INNER JOIN collaborators c ON ev.collaboratorId = c.id
      INNER JOIN kpis k ON ev.kpiId = k.id
      LEFT JOIN periods p ON ev.periodId = p.id
      WHERE 1=1
    `

    const params: any[] = []

    if (collaboratorId) {
      query += ' AND ev.collaboratorId = ?'
      params.push(collaboratorId)
    }

    if (kpiId) {
      query += ' AND ev.kpiId = ?'
      params.push(kpiId)
    }

    if (periodId) {
      query += ' AND ev.periodId = ?'
      params.push(periodId)
    }

    query += ' ORDER BY ev.monthDate ASC'

    const [rows] = await pool.query<any[]>(query, params)

    let data = Array.isArray(rows)
      ? rows.map((row) => ({
          id: row.id,
          collaboratorId: row.collaboratorId,
          collaboratorName: row.collaboratorName,
          collaboratorArea: row.collaboratorArea,
          kpiId: row.kpiId,
          kpiName: row.kpiName,
          kpiType: row.kpiType,
          periodId: row.periodId,
          periodName: row.periodName,
          monthDate: row.monthDate,
          planValue: row.planValue ? Number(row.planValue) : null,
          actualValue: row.actualValue !== null && row.actualValue !== undefined ? Number(row.actualValue) : null,
          variation: row.variation !== null && row.variation !== undefined ? Number(row.variation) : null,
          weightedResult:
            row.weightedResult !== null && row.weightedResult !== undefined ? Number(row.weightedResult) : null,
          source: row.source,
          modality: row.modality,
          typeHint: row.typeHint,
        }))
      : []

    // Fallback: si no hay registros en kpi_evolutions, usar colaborator_kpis mensuales
    if (!data || data.length === 0) {
      let fallbackQuery = `
        SELECT 
          ck.id,
          ck.collaboratorId,
          c.name as collaboratorName,
          c.area as collaboratorArea,
          ck.kpiId,
          k.name as kpiName,
          k.type as kpiType,
          ck.periodId,
          p.name as periodName,
          sp.endDate as monthDate,
          ck.target as planValue,
          ck.actual as actualValue,
          ck.variation as variation,
          ck.weightedResult as weightedResult
        FROM collaborator_kpis ck
        INNER JOIN collaborators c ON ck.collaboratorId = c.id
        INNER JOIN kpis k ON ck.kpiId = k.id
        INNER JOIN periods p ON ck.periodId = p.id
        LEFT JOIN sub_periods sp ON ck.subPeriodId = sp.id
        WHERE ck.subPeriodId IS NOT NULL
      `
      const fallbackParams: any[] = []

      if (collaboratorId) {
        fallbackQuery += ' AND ck.collaboratorId = ?'
        fallbackParams.push(collaboratorId)
      }
      if (kpiId) {
        fallbackQuery += ' AND ck.kpiId = ?'
        fallbackParams.push(kpiId)
      }
      if (periodId) {
        fallbackQuery += ' AND ck.periodId = ?'
        fallbackParams.push(periodId)
      }

      fallbackQuery += ' ORDER BY sp.endDate ASC, ck.id ASC'

      const [fallbackRows] = await pool.query<any[]>(fallbackQuery, fallbackParams)

      data = Array.isArray(fallbackRows)
        ? fallbackRows.map((row) => ({
            id: row.id,
            collaboratorId: row.collaboratorId,
            collaboratorName: row.collaboratorName,
            collaboratorArea: row.collaboratorArea,
            kpiId: row.kpiId,
            kpiName: row.kpiName,
            kpiType: row.kpiType,
            periodId: row.periodId,
            periodName: row.periodName,
            monthDate: row.monthDate || row.periodId, // si no hay fecha de subperiodo
            planValue: row.planValue !== null && row.planValue !== undefined ? Number(row.planValue) : null,
            actualValue: row.actualValue !== null && row.actualValue !== undefined ? Number(row.actualValue) : null,
            variation: row.variation !== null && row.variation !== undefined ? Number(row.variation) : null,
            weightedResult:
              row.weightedResult !== null && row.weightedResult !== undefined ? Number(row.weightedResult) : null,
            source: 'collaborator_kpis',
            modality: 'monthly',
            typeHint: 'fallback',
          }))
        : []
    }

    res.json(data)
  } catch (error) {
    console.error('Error fetching evolution data:', error)
    res.status(500).json({ error: 'Error al obtener evolutivo de objetivos' })
  }
}
