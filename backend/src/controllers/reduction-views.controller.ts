import { Request, Response } from 'express'
import { pool } from '../config/database'
import { calculateVariation } from '../utils/kpi-formulas'
import { KPIDirection } from '../types'

const resolveDirection = (direction?: string | null): KPIDirection => {
  if (direction === 'growth' || direction === 'reduction' || direction === 'exact') return direction
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
        sp.weight as subPeriodWeight,
        ck.status,
        ck.comments,
        ck.createdAt,
        ck.updatedAt
      FROM kpis k
      INNER JOIN collaborator_kpis ck ON k.id = ck.kpiId
      INNER JOIN collaborators c ON ck.collaboratorId = c.id
      INNER JOIN periods p ON ck.periodId = p.id
      LEFT JOIN calendar_subperiods sp ON ck.subPeriodId = sp.id
      WHERE k.direction = 'reduction'
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

        const direction = resolveDirection('reduction')
        const variation =
          row.variation !== null && row.variation !== undefined
            ? Number(row.variation)
            : calculateVariation(direction, Number(row.target ?? 0), Number(row.actual ?? 0))
        const weightedImpact = calculateWeightedImpact(variation, row.weight, row.subPeriodWeight)

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
          variation: Number.isFinite(variation) ? variation : null,
          weightedResult: Number.isFinite(weightedImpact) ? weightedImpact : null,
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
          variation: Number.isFinite(variation) ? variation : null,
          weightedResult: Number.isFinite(weightedImpact) ? weightedImpact : null,
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
        ck.collaboratorId,
        ck.target,
        ck.actual,
        ck.weight,
        ck.variation,
        sp.weight as subPeriodWeight
      FROM kpis k
      INNER JOIN collaborator_kpis ck ON k.id = ck.kpiId
      INNER JOIN collaborators c ON ck.collaboratorId = c.id
      LEFT JOIN calendar_subperiods sp ON ck.subPeriodId = sp.id
      WHERE k.direction = 'reduction'
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

    const [rows] = await pool.query<any[]>(query, params)

    const statsMap = new Map<
      number,
      {
        kpiId: number
        kpiName: string
        collaboratorIds: Set<number>
        totalAssignments: number
        totalTarget: number
        totalActual: number
        totalVariation: number
        totalWeightedImpact: number
        variationCount: number
        weightedCount: number
        minActual: number | null
        maxActual: number | null
        completedCount: number
        pendingCount: number
      }
    >()

    if (Array.isArray(rows)) {
      for (const row of rows) {
        const existing =
          statsMap.get(row.kpiId) ||
          {
            kpiId: row.kpiId,
            kpiName: row.kpiName,
            collaboratorIds: new Set<number>(),
            totalAssignments: 0,
            totalTarget: 0,
            totalActual: 0,
            totalVariation: 0,
            totalWeightedImpact: 0,
            variationCount: 0,
            weightedCount: 0,
            minActual: null,
            maxActual: null,
            completedCount: 0,
            pendingCount: 0,
          }

        existing.collaboratorIds.add(Number(row.collaboratorId))
        existing.totalAssignments += 1
        existing.totalTarget += Number(row.target ?? 0)

        if (row.actual !== null && row.actual !== undefined) {
          const actualValue = Number(row.actual)
          existing.totalActual += actualValue
          existing.completedCount += 1
          existing.minActual =
            existing.minActual === null ? actualValue : Math.min(existing.minActual, actualValue)
          existing.maxActual =
            existing.maxActual === null ? actualValue : Math.max(existing.maxActual, actualValue)
        } else {
          existing.pendingCount += 1
        }

        const direction = resolveDirection('reduction')
        const variation =
          row.variation !== null && row.variation !== undefined
            ? Number(row.variation)
            : calculateVariation(direction, Number(row.target ?? 0), Number(row.actual ?? 0))

        if (Number.isFinite(variation)) {
          existing.totalVariation += variation
          existing.variationCount += 1
          const weightedImpact = calculateWeightedImpact(variation, row.weight, row.subPeriodWeight)
          if (Number.isFinite(weightedImpact)) {
            existing.totalWeightedImpact += weightedImpact
            existing.weightedCount += 1
          }
        }

        statsMap.set(row.kpiId, existing)
      }
    }

    const statistics = Array.from(statsMap.values()).map((stat) => ({
      kpiId: stat.kpiId,
      kpiName: stat.kpiName,
      totalCollaborators: stat.collaboratorIds.size,
      totalAssignments: stat.totalAssignments,
      avgTarget: stat.totalAssignments > 0 ? stat.totalTarget / stat.totalAssignments : 0,
      avgActual: stat.completedCount > 0 ? stat.totalActual / stat.completedCount : 0,
      avgVariation: stat.variationCount > 0 ? stat.totalVariation / stat.variationCount : 0,
      avgWeightedResult: stat.weightedCount > 0 ? stat.totalWeightedImpact / stat.weightedCount : 0,
      minActual: stat.minActual,
      maxActual: stat.maxActual,
      completedCount: stat.completedCount,
      pendingCount: stat.pendingCount,
      completionRate:
        stat.completedCount + stat.pendingCount > 0
          ? (stat.completedCount / (stat.completedCount + stat.pendingCount)) * 100
          : 0,
    }))

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
        sp.weight as subPeriodWeight,
        ck.status,
        c.name as collaboratorName
      FROM collaborator_kpis ck
      INNER JOIN kpis k ON ck.kpiId = k.id
      INNER JOIN periods p ON ck.periodId = p.id
      INNER JOIN collaborators c ON ck.collaboratorId = c.id
      LEFT JOIN calendar_subperiods sp ON ck.subPeriodId = sp.id
      WHERE k.id = ? AND k.direction = 'reduction'
        ${collaboratorId ? 'AND ck.collaboratorId = ?' : ''}
      ORDER BY p.startDate ASC
    `,
      collaboratorId ? [kpiId, collaboratorId] : [kpiId]
    )

    const evolution = Array.isArray(rows)
      ? rows.map((row) => {
          const direction = resolveDirection('reduction')
          const variation =
            row.variation !== null && row.variation !== undefined
              ? Number(row.variation)
              : calculateVariation(direction, Number(row.target ?? 0), Number(row.actual ?? 0))
          const weightedImpact = calculateWeightedImpact(variation, row.weight, row.subPeriodWeight)
          return {
            assignmentId: row.assignmentId,
            periodId: row.periodId,
            periodName: row.periodName,
            periodStartDate: row.periodStartDate,
            periodEndDate: row.periodEndDate,
            target: parseFloat(row.target),
            actual: row.actual ? parseFloat(row.actual) : null,
            variation: Number.isFinite(variation) ? variation : null,
            weightedResult: Number.isFinite(weightedImpact) ? weightedImpact : null,
            status: row.status,
            collaboratorName: row.collaboratorName,
          }
        })
      : []

    res.json(evolution)
  } catch (error: any) {
    console.error('Error fetching reduction evolution:', error)
    res.status(500).json({ error: 'Error al obtener evolución de reducción' })
  }
}

