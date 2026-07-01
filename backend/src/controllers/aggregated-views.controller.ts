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
// Also joins org_scopes hierarchy to get area/company group names without relying on role field
async function fetchKpiRowsForPeriod(periodId: number, extraJoin?: string, extraWhere?: string, extraParams?: any[]): Promise<any[]> {
  const sql = `
    SELECT
      c.id AS collaboratorId,
      c.area,
      c.name AS collaboratorName,
      c.position,
      c.role,
      c.managerId,
      c.orgScopeId,
      os_team.name  AS teamScopeName,
      os_area.id    AS areaScopeId,
      os_area.name  AS areaScopeName,
      os_company.id   AS companyScopeId,
      os_company.name AS companyScopeName,
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
    LEFT JOIN org_scopes os_team    ON os_team.id    = c.orgScopeId
    LEFT JOIN org_scopes os_area    ON os_area.id    = os_team.parentId    AND os_area.type    = 'area'
    LEFT JOIN org_scopes os_company ON os_company.id = os_area.parentId   AND os_company.type = 'company'
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

    // Agrupa todos los colaboradores por empresa (grandparent scope)
    const rows = await fetchKpiRowsForPeriod(Number(periodId), undefined, 'AND os_company.id IS NOT NULL')
    const impacts = computeImpactsFromRows(rows)

    const collabInfo = new Map<number, { name: string; position: string; role: string; companyScopeName: string }>()
    for (const row of rows) {
      if (!collabInfo.has(Number(row.collaboratorId))) {
        collabInfo.set(Number(row.collaboratorId), {
          name: row.collaboratorName,
          position: row.position,
          role: row.role,
          companyScopeName: row.companyScopeName,
        })
      }
    }

    const groupMap = new Map<string, { collaborators: any[]; results: number[] }>()
    impacts.forEach((impact, collaboratorId) => {
      const info = collabInfo.get(collaboratorId)
      if (!info?.companyScopeName) return
      if (!groupMap.has(info.companyScopeName)) groupMap.set(info.companyScopeName, { collaborators: [], results: [] })
      const group = groupMap.get(info.companyScopeName)!
      group.results.push(impact)
      group.collaborators.push({ id: collaboratorId, name: info.name, position: info.position, role: info.role })
    })

    const aggregatedData = Array.from(groupMap.entries())
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

    // Agrupa todos los colaboradores por área (parent scope del equipo)
    const rows = await fetchKpiRowsForPeriod(Number(periodId), undefined, 'AND os_area.id IS NOT NULL')
    const impacts = computeImpactsFromRows(rows)

    const collabInfo = new Map<number, { name: string; position: string; role: string; areaScopeName: string }>()
    for (const row of rows) {
      if (!collabInfo.has(Number(row.collaboratorId))) {
        collabInfo.set(Number(row.collaboratorId), {
          name: row.collaboratorName,
          position: row.position,
          role: row.role,
          areaScopeName: row.areaScopeName,
        })
      }
    }

    const groupMap = new Map<string, { collaborators: any[]; results: number[] }>()
    impacts.forEach((impact, collaboratorId) => {
      const info = collabInfo.get(collaboratorId)
      if (!info?.areaScopeName) return
      if (!groupMap.has(info.areaScopeName)) groupMap.set(info.areaScopeName, { collaborators: [], results: [] })
      const group = groupMap.get(info.areaScopeName)!
      group.results.push(impact)
      group.collaborators.push({ id: collaboratorId, name: info.name, position: info.position, role: info.role })
    })

    const aggregatedData = Array.from(groupMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([area, { collaborators, results }]) => ({
        area,
        collaborators,
        statistics: calculateStatistics(results),
        results,
      }))

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

    // Agrupa colaboradores por equipo (teamScopeName), mostrando el líder (role='leader') de cada equipo
    const rows = await fetchKpiRowsForPeriod(Number(periodId), undefined, 'AND os_team.id IS NOT NULL')
    const impacts = computeImpactsFromRows(rows)

    // Busca el líder de cada equipo (scope) entre las filas
    const teamLeaderMap = new Map<number, { id: number; name: string; position: string; area: string }>()
    for (const row of rows) {
      if (row.role === 'leader' && row.orgScopeId) {
        const scopeId = Number(row.orgScopeId)
        if (!teamLeaderMap.has(scopeId)) {
          teamLeaderMap.set(scopeId, {
            id: Number(row.collaboratorId),
            name: row.collaboratorName,
            position: row.position,
            area: row.teamScopeName || row.area,
          })
        }
      }
    }

    const collabInfo = new Map<number, { name: string; position: string; role: string; orgScopeId: number; teamScopeName: string }>()
    for (const row of rows) {
      if (!collabInfo.has(Number(row.collaboratorId))) {
        collabInfo.set(Number(row.collaboratorId), {
          name: row.collaboratorName,
          position: row.position,
          role: row.role,
          orgScopeId: Number(row.orgScopeId),
          teamScopeName: row.teamScopeName || row.area,
        })
      }
    }

    // Group by team scope
    const groupMap = new Map<number, { teamName: string; collaborators: any[]; results: number[] }>()
    impacts.forEach((impact, collaboratorId) => {
      const info = collabInfo.get(collaboratorId)
      if (!info?.orgScopeId) return
      if (!groupMap.has(info.orgScopeId)) {
        groupMap.set(info.orgScopeId, { teamName: info.teamScopeName, collaborators: [], results: [] })
      }
      const group = groupMap.get(info.orgScopeId)!
      group.results.push(impact)
      group.collaborators.push({ id: collaboratorId, name: info.name, position: info.position, role: info.role })
    })

    const aggregatedData = Array.from(groupMap.entries())
      .sort(([, a], [, b]) => a.teamName.localeCompare(b.teamName))
      .map(([scopeId, { teamName, collaborators, results }]) => {
        const leader = teamLeaderMap.get(scopeId)
        return {
          area: teamName,
          leader: leader ?? null,
          collaborators,
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
