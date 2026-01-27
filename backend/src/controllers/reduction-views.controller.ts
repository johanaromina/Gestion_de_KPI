import { Request, Response } from 'express'
import { pool } from '../config/database'

/**
 * Obtiene todos los KPIs de tipo reducción con sus asignaciones y evolución temporal
 */
export const getReductionKPIs = async (req: Request, res: Response) => {
  try {
    const { periodId, collaboratorId, area, areaId } = req.query

    let query = `
      SELECT 
        k.id as kpiId,
        k.name as kpiName,
        k.description as kpiDescription,
        k.criteria as kpiCriteria,
        ck.id as assignmentId,
        ck.collaboratorId,
        c.name as collaboratorName,
        c.area as collaboratorArea,
        c.position as collaboratorPosition,
        ck.periodId,
        p.name as periodName,
        p.startDate as periodStartDate,
        p.endDate as periodEndDate,
        ck.target,
        ck.actual,
        ck.weight,
        ck.variation,
        ck.weightedResult,
        ck.status,
        ck.comments,
        ck.createdAt,
        ck.updatedAt
      FROM kpis k
      INNER JOIN collaborator_kpis ck ON k.id = ck.kpiId
      INNER JOIN collaborators c ON ck.collaboratorId = c.id
      INNER JOIN periods p ON ck.periodId = p.id
      WHERE k.type = 'reduction'
    `

    const params: any[] = []

    if (periodId) {
      query += ' AND ck.periodId = ?'
      params.push(periodId)
    }

    if (collaboratorId) {
      query += ' AND ck.collaboratorId = ?'
      params.push(collaboratorId)
    }

    if (areaId) {
      query += ' AND EXISTS (SELECT 1 FROM areas a WHERE a.name = c.area AND a.id = ?)'
      params.push(areaId)
    } else if (area) {
      query += ' AND c.area = ?'
      params.push(area)
    }

    query += ' ORDER BY p.startDate DESC, c.name ASC, k.name ASC'

    const [rows] = await pool.query<any[]>(query, params)

    // Agrupar por KPI y colaborador para mostrar evolución
    const grouped: Record<
      string,
      {
        kpiId: number
        kpiName: string
        kpiDescription: string
        kpiCriteria: string
        kpiFormula?: string
        assignments: any[]
        evolution: Array<{
          periodId: number
          periodName: string
          periodStartDate: string
          periodEndDate: string
          target: number
          actual?: number
          variation?: number
          weightedResult?: number
          status: string
        }>
      }
    > = {}

    if (Array.isArray(rows)) {
      for (const row of rows) {
        const key = `${row.kpiId}-${row.collaboratorId}`
        if (!grouped[key]) {
          grouped[key] = {
            kpiId: row.kpiId,
            kpiName: row.kpiName,
            kpiDescription: row.kpiDescription,
            kpiCriteria: row.kpiCriteria,
            kpiFormula: row.kpiFormula,
            assignments: [],
            evolution: [],
          }
        }

        grouped[key].assignments.push({
          assignmentId: row.assignmentId,
          collaboratorId: row.collaboratorId,
          collaboratorName: row.collaboratorName,
          collaboratorArea: row.collaboratorArea,
          collaboratorPosition: row.collaboratorPosition,
          periodId: row.periodId,
          periodName: row.periodName,
          periodStartDate: row.periodStartDate,
          periodEndDate: row.periodEndDate,
          target: parseFloat(row.target),
          actual: row.actual ? parseFloat(row.actual) : null,
          weight: parseFloat(row.weight),
          variation: row.variation ? parseFloat(row.variation) : null,
          weightedResult: row.weightedResult
            ? parseFloat(row.weightedResult)
            : null,
          status: row.status,
          comments: row.comments,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })

        // Agregar a evolución ordenada por fecha
        grouped[key].evolution.push({
          periodId: row.periodId,
          periodName: row.periodName,
          periodStartDate: row.periodStartDate,
          periodEndDate: row.periodEndDate,
          target: parseFloat(row.target),
          actual: row.actual ? parseFloat(row.actual) : null,
          variation: row.variation ? parseFloat(row.variation) : null,
          weightedResult: row.weightedResult
            ? parseFloat(row.weightedResult)
            : null,
          status: row.status,
        })
      }

      // Ordenar evolución por fecha
      Object.values(grouped).forEach((group) => {
        group.evolution.sort(
          (a, b) =>
            new Date(a.periodStartDate).getTime() -
            new Date(b.periodStartDate).getTime()
        )
      })
    }

    res.json(Object.values(grouped))
  } catch (error: any) {
    console.error('Error fetching reduction KPIs:', error)
    res.status(500).json({ error: 'Error al obtener KPIs de reducción' })
  }
}

/**
 * Obtiene estadísticas agregadas de reducción
 */
export const getReductionStatistics = async (req: Request, res: Response) => {
  try {
    const { periodId, area, areaId } = req.query

    let query = `
      SELECT 
        k.id as kpiId,
        k.name as kpiName,
        COUNT(DISTINCT ck.collaboratorId) as totalCollaborators,
        COUNT(ck.id) as totalAssignments,
        AVG(ck.target) as avgTarget,
        AVG(ck.actual) as avgActual,
        AVG(ck.variation) as avgVariation,
        AVG(ck.weightedResult) as avgWeightedResult,
        MIN(ck.actual) as minActual,
        MAX(ck.actual) as maxActual,
        SUM(CASE WHEN ck.actual IS NOT NULL THEN 1 ELSE 0 END) as completedCount,
        SUM(CASE WHEN ck.actual IS NULL THEN 1 ELSE 0 END) as pendingCount
      FROM kpis k
      INNER JOIN collaborator_kpis ck ON k.id = ck.kpiId
      INNER JOIN collaborators c ON ck.collaboratorId = c.id
      WHERE k.type = 'reduction'
    `

    const params: any[] = []

    if (periodId) {
      query += ' AND ck.periodId = ?'
      params.push(periodId)
    }

    if (areaId) {
      query += ' AND EXISTS (SELECT 1 FROM areas a WHERE a.name = c.area AND a.id = ?)'
      params.push(areaId)
    } else if (area) {
      query += ' AND c.area = ?'
      params.push(area)
    }

    query += ' GROUP BY k.id, k.name ORDER BY k.name ASC'

    const [rows] = await pool.query<any[]>(query, params)

    const statistics = Array.isArray(rows)
      ? rows.map((row) => ({
          kpiId: row.kpiId,
          kpiName: row.kpiName,
          totalCollaborators: parseInt(row.totalCollaborators),
          totalAssignments: parseInt(row.totalAssignments),
          avgTarget: parseFloat(row.avgTarget) || 0,
          avgActual: parseFloat(row.avgActual) || 0,
          avgVariation: parseFloat(row.avgVariation) || 0,
          avgWeightedResult: parseFloat(row.avgWeightedResult) || 0,
          minActual: parseFloat(row.minActual) || null,
          maxActual: parseFloat(row.maxActual) || null,
          completedCount: parseInt(row.completedCount),
          pendingCount: parseInt(row.pendingCount),
          completionRate:
            (parseInt(row.completedCount) /
              (parseInt(row.completedCount) + parseInt(row.pendingCount))) *
            100,
        }))
      : []

    res.json(statistics)
  } catch (error: any) {
    console.error('Error fetching reduction statistics:', error)
    res.status(500).json({ error: 'Error al obtener estadísticas de reducción' })
  }
}

/**
 * Obtiene evolución temporal de un KPI de reducción específico
 */
export const getReductionEvolution = async (req: Request, res: Response) => {
  try {
    const { kpiId, collaboratorId } = req.params

    const [rows] = await pool.query<any[]>(
      `
      SELECT 
        ck.id as assignmentId,
        ck.periodId,
        p.name as periodName,
        p.startDate as periodStartDate,
        p.endDate as periodEndDate,
        ck.target,
        ck.actual,
        ck.variation,
        ck.weightedResult,
        ck.status,
        c.name as collaboratorName
      FROM collaborator_kpis ck
      INNER JOIN kpis k ON ck.kpiId = k.id
      INNER JOIN periods p ON ck.periodId = p.id
      INNER JOIN collaborators c ON ck.collaboratorId = c.id
      WHERE k.id = ? AND k.type = 'reduction'
        ${collaboratorId ? 'AND ck.collaboratorId = ?' : ''}
      ORDER BY p.startDate ASC
    `,
      collaboratorId ? [kpiId, collaboratorId] : [kpiId]
    )

    const evolution = Array.isArray(rows)
      ? rows.map((row) => ({
          assignmentId: row.assignmentId,
          periodId: row.periodId,
          periodName: row.periodName,
          periodStartDate: row.periodStartDate,
          periodEndDate: row.periodEndDate,
          target: parseFloat(row.target),
          actual: row.actual ? parseFloat(row.actual) : null,
          variation: row.variation ? parseFloat(row.variation) : null,
          weightedResult: row.weightedResult
            ? parseFloat(row.weightedResult)
            : null,
          status: row.status,
          collaboratorName: row.collaboratorName,
        }))
      : []

    res.json(evolution)
  } catch (error: any) {
    console.error('Error fetching reduction evolution:', error)
    res.status(500).json({ error: 'Error al obtener evolución de reducción' })
  }
}

