import { Request, Response } from 'express'
import { pool } from '../config/database'
import { calculateVariation } from '../utils/kpi-formulas'
import { KPIDirection, KPIType } from '../types'
import { logger } from '../utils/logger'
import { sendApiError } from '../utils/api-errors'

function calculateStatistics(results: number[]): {
  average: number
  min: number
  max: number
  standardDeviation: number
  count: number
} {
  if (results.length === 0) {
    return { average: 0, min: 0, max: 0, standardDeviation: 0, count: 0 }
  }
  const average = results.reduce((sum, val) => sum + val, 0) / results.length
  const min = Math.min(...results)
  const max = Math.max(...results)
  const variance = results.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / results.length
  return { average, min, max, standardDeviation: Math.sqrt(variance), count: results.length }
}

const resolveDirection = (direction?: string | null, type?: string | null): KPIDirection => {
  if (direction === 'growth' || direction === 'reduction' || direction === 'exact') return direction
  if (type === 'growth' || type === 'reduction' || type === 'exact') return type
  if (type === 'sla') return 'reduction'
  return 'growth'
}

// Compute weighted impact for each collaborator from a batch of KPI rows
// Returns Map<collaboratorId, impact>
function computeImpactsFromRows(rows: any[]): Map<number, number> {
  const byCollaborator = new Map<number, any[]>()
  for (const row of rows) {
    const id = Number(row.collaboratorId)
    if (!byCollaborator.has(id)) byCollaborator.set(id, [])
    byCollaborator.get(id)!.push(row)
  }

  const results = new Map<number, number>()
  byCollaborator.forEach((collabRows, collaboratorId) => {
    const hasSubPeriods = collabRows.some(
      (r) => r.subPeriodId !== null && r.subPeriodId !== undefined
    )
    const rowsToUse = hasSubPeriods
      ? collabRows.filter((r) => r.subPeriodId !== null && r.subPeriodId !== undefined)
      : collabRows.filter((r) => r.subPeriodId === null || r.subPeriodId === undefined)

    if (rowsToUse.length === 0) return

    let totalImpact = 0
    for (const row of rowsToUse) {
      const direction = resolveDirection(row.kpiDirection, row.kpiType as KPIType)
      const variation =
        row.variation !== null && row.variation !== undefined
          ? Number(row.variation)
          : calculateVariation(direction, Number(row.target ?? 0), Number(row.actual ?? 0))
      if (!Number.isFinite(variation)) continue
      const weight = Number(row.weight ?? 0)
      if (!Number.isFinite(weight) || weight <= 0) continue
      const subWeight = Number(row.subPeriodWeight ?? 100)
      const normalizedSubWeight = Number.isFinite(subWeight) && subWeight > 0 ? subWeight : 100
      totalImpact += (variation * (weight / 100)) * (normalizedSubWeight / 100)
    }
    results.set(collaboratorId, totalImpact)
  })

  return results
}

// Single batch query to get all KPI rows for the period joined with collaborator info
async function fetchKpiRowsForPeriod(periodId: number, extraJoin?: string, extraWhere?: string, extraParams?: any[]): Promise<any[]> {
  const sql = `
    SELECT
      c.id AS collaboratorId,
      c.area,
      c.name AS collaboratorName,
      c.position,
      c.role,
      c.managerId,
      ck.target,
      ck.actual,
      ck.weight,
      ck.variation,
      ck.subPeriodId,
      COALESCE(sp.weight, 100) AS subPeriodWeight,
      k.type AS kpiType,
      k.direction AS kpiDirection
    FROM collaborators c
    JOIN collaborator_kpis ck ON ck.collaboratorId = c.id AND ck.periodId = ?
    JOIN kpis k ON k.id = ck.kpiId
    LEFT JOIN calendar_subperiods sp ON sp.id = ck.subPeriodId
    ${extraJoin || ''}
    WHERE 1=1 ${extraWhere || ''}
  `
  const [rows] = await pool.query<any[]>(sql, [periodId, ...(extraParams || [])])
  return rows
}

export const getAggregatedByArea = async (req: Request, res: Response) => {
  try {
    const { periodId } = req.query
    if (!periodId) {
      return sendApiError(res, 400, 'AGGREGATED_VIEW_PERIOD_REQUIRED', 'periodId es requerido')
    }

    const rows = await fetchKpiRowsForPeriod(
      Number(periodId),
      undefined,
      'AND c.area IS NOT NULL AND c.area != \'\'',
    )

    const impacts = computeImpactsFromRows(rows)

    // Build collaborator info map
    const collabInfo = new Map<number, { name: string; position: string; role: string; area: string }>()
    for (const row of rows) {
      if (!collabInfo.has(Number(row.collaboratorId))) {
        collabInfo.set(Number(row.collaboratorId), {
          name: row.collaboratorName,
          position: row.position,
          role: row.role,
          area: row.area,
        })
      }
    }

    // Group by area
    const areaMap = new Map<string, { collaborators: any[]; results: number[] }>()
    impacts.forEach((impact, collaboratorId) => {
      const info = collabInfo.get(collaboratorId)
      if (!info?.area) return
      if (!areaMap.has(info.area)) {
        areaMap.set(info.area, { collaborators: [], results: [] })
      }
      const group = areaMap.get(info.area)!
      group.results.push(impact)
      group.collaborators.push({ id: collaboratorId, name: info.name, position: info.position, role: info.role })
    })

    const aggregatedData = Array.from(areaMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([area, { collaborators, results }]) => ({
        area,
        collaborators,
        statistics: calculateStatistics(results),
        results,
      }))

    res.json({ periodId: parseInt(periodId as string), aggregatedData })
  } catch (error: any) {
    logger.error('Error fetching aggregated by area:', error)
    return sendApiError(res, 500, 'AGGREGATED_VIEW_FETCH_FAILED', 'Error al obtener datos agregados')
  }
}

export const getAggregatedByDirection = async (req: Request, res: Response) => {
  try {
    const { periodId } = req.query
    if (!periodId) {
      return sendApiError(res, 400, 'AGGREGATED_VIEW_PERIOD_REQUIRED', 'periodId es requerido')
    }

    const rows = await fetchKpiRowsForPeriod(
      Number(periodId),
      undefined,
      'AND c.role IN (\'director\', \'admin\') AND c.area IS NOT NULL AND c.area != \'\'',
    )

    const impacts = computeImpactsFromRows(rows)

    const collabInfo = new Map<number, { name: string; position: string; role: string; area: string }>()
    for (const row of rows) {
      if (!collabInfo.has(Number(row.collaboratorId))) {
        collabInfo.set(Number(row.collaboratorId), {
          name: row.collaboratorName,
          position: row.position,
          role: row.role,
          area: row.area,
        })
      }
    }

    const areaMap = new Map<string, { collaborators: any[]; results: number[] }>()
    impacts.forEach((impact, collaboratorId) => {
      const info = collabInfo.get(collaboratorId)
      if (!info?.area) return
      if (!areaMap.has(info.area)) areaMap.set(info.area, { collaborators: [], results: [] })
      const group = areaMap.get(info.area)!
      group.results.push(impact)
      group.collaborators.push({ id: collaboratorId, name: info.name, position: info.position, role: info.role })
    })

    const aggregatedData = Array.from(areaMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([area, { collaborators, results }]) => ({
        area,
        collaborators,
        statistics: calculateStatistics(results),
        results,
      }))

    res.json({ periodId: parseInt(periodId as string), aggregatedData })
  } catch (error: any) {
    logger.error('Error fetching aggregated by direction:', error)
    return sendApiError(res, 500, 'AGGREGATED_VIEW_FETCH_FAILED', 'Error al obtener datos agregados')
  }
}

export const getAggregatedByManagement = async (req: Request, res: Response) => {
  try {
    const { periodId } = req.query
    if (!periodId) {
      return sendApiError(res, 400, 'AGGREGATED_VIEW_PERIOD_REQUIRED', 'periodId es requerido')
    }

    // Get all managers
    const [managers] = await pool.query<any[]>(
      `SELECT id, name, position, area FROM collaborators WHERE role = 'manager' ORDER BY area, name`
    )
    if (!managers.length) return res.json({ periodId: parseInt(periodId as string), aggregatedData: [] })

    const managerIds = managers.map((m) => m.id)

    // Get KPI rows for managers
    const managerRows = await fetchKpiRowsForPeriod(
      Number(periodId),
      undefined,
      `AND c.id IN (${managerIds.map(() => '?').join(',')})`,
      managerIds
    )
    const managerImpacts = computeImpactsFromRows(managerRows)

    // Get KPI rows for all team members of these managers
    const teamRows = await fetchKpiRowsForPeriod(
      Number(periodId),
      undefined,
      `AND c.managerId IN (${managerIds.map(() => '?').join(',')})`,
      managerIds
    )
    const teamImpacts = computeImpactsFromRows(teamRows)

    // Build team membership map
    const teamByManager = new Map<number, number[]>()
    for (const row of teamRows) {
      const managerId = Number(row.managerId)
      if (!teamByManager.has(managerId)) teamByManager.set(managerId, [])
      if (!teamByManager.get(managerId)!.includes(Number(row.collaboratorId))) {
        teamByManager.get(managerId)!.push(Number(row.collaboratorId))
      }
    }

    const aggregatedData = managers.map((manager) => {
      const results: number[] = []
      const mi = managerImpacts.get(manager.id)
      if (mi !== undefined) results.push(mi)
      for (const memberId of teamByManager.get(manager.id) || []) {
        const ti = teamImpacts.get(memberId)
        if (ti !== undefined) results.push(ti)
      }
      return {
        manager: { id: manager.id, name: manager.name, position: manager.position, area: manager.area },
        teamMembers: [],
        statistics: calculateStatistics(results),
        results,
      }
    })

    res.json({ periodId: parseInt(periodId as string), aggregatedData })
  } catch (error: any) {
    logger.error('Error fetching aggregated by management:', error)
    return sendApiError(res, 500, 'AGGREGATED_VIEW_FETCH_FAILED', 'Error al obtener datos agregados')
  }
}

export const getAggregatedByLeadership = async (req: Request, res: Response) => {
  try {
    const { periodId } = req.query
    if (!periodId) {
      return sendApiError(res, 400, 'AGGREGATED_VIEW_PERIOD_REQUIRED', 'periodId es requerido')
    }

    const [leaders] = await pool.query<any[]>(
      `SELECT id, name, position, area FROM collaborators WHERE role = 'leader' ORDER BY area, name`
    )
    if (!leaders.length) return res.json({ periodId: parseInt(periodId as string), aggregatedData: [] })

    const leaderIds = leaders.map((l) => l.id)

    const leaderRows = await fetchKpiRowsForPeriod(
      Number(periodId),
      undefined,
      `AND c.id IN (${leaderIds.map(() => '?').join(',')})`,
      leaderIds
    )
    const leaderImpacts = computeImpactsFromRows(leaderRows)

    const teamRows = await fetchKpiRowsForPeriod(
      Number(periodId),
      undefined,
      `AND c.managerId IN (${leaderIds.map(() => '?').join(',')})`,
      leaderIds
    )
    const teamImpacts = computeImpactsFromRows(teamRows)

    const teamByLeader = new Map<number, number[]>()
    for (const row of teamRows) {
      const leaderId = Number(row.managerId)
      if (!teamByLeader.has(leaderId)) teamByLeader.set(leaderId, [])
      if (!teamByLeader.get(leaderId)!.includes(Number(row.collaboratorId))) {
        teamByLeader.get(leaderId)!.push(Number(row.collaboratorId))
      }
    }

    const aggregatedData = leaders.map((leader) => {
      const results: number[] = []
      const li = leaderImpacts.get(leader.id)
      if (li !== undefined) results.push(li)
      for (const memberId of teamByLeader.get(leader.id) || []) {
        const ti = teamImpacts.get(memberId)
        if (ti !== undefined) results.push(ti)
      }
      return {
        leader: { id: leader.id, name: leader.name, position: leader.position, area: leader.area },
        teamMembers: [],
        statistics: calculateStatistics(results),
        results,
      }
    })

    res.json({ periodId: parseInt(periodId as string), aggregatedData })
  } catch (error: any) {
    logger.error('Error fetching aggregated by leadership:', error)
    return sendApiError(res, 500, 'AGGREGATED_VIEW_FETCH_FAILED', 'Error al obtener datos agregados')
  }
}
