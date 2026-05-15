import { pool } from '../config/database'
import { recalculateScopeKPI } from './scope-kpi-aggregation.service'
import { recalcOKRsLinkedToScopeKpi } from './okr.service'
import { logger } from '../utils/logger'

export const recalcScopeKPIsLinkedToAssignment = async (assignmentId: number) => {
  try {
    const [seedRows] = await pool.query<any[]>(
      `SELECT DISTINCT scopeKpiId FROM scope_kpi_links WHERE collaboratorAssignmentId = ?`,
      [assignmentId]
    )
    const seedIds = (Array.isArray(seedRows) ? seedRows : []).map((r) => r.scopeKpiId as number)

    // BFS up the scope→scope chain
    const visited = new Set<number>()
    let frontier = seedIds
    while (frontier.length > 0) {
      for (const sid of frontier) {
        if (visited.has(sid)) continue
        visited.add(sid)
        await recalculateScopeKPI(sid)
        recalcOKRsLinkedToScopeKpi(sid).catch((err) =>
          logger.error('[scope propagation] scopeKpi→OKR:', err)
        )
      }
      const ph = frontier.map(() => '?').join(',')
      const [parentRows] = await pool.query<any[]>(
        `SELECT DISTINCT scopeKpiId FROM scope_kpi_links WHERE childScopeKpiId IN (${ph})`,
        frontier
      )
      frontier = (Array.isArray(parentRows) ? parentRows : [])
        .map((r) => r.scopeKpiId as number)
        .filter((sid) => !visited.has(sid))
    }
  } catch (err) {
    logger.error('[scope propagation] collaboratorKpi→scopeKpi:', err)
  }
}
