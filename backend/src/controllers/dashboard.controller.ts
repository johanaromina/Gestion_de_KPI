import { Request, Response } from 'express'
import { pool } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import { hydrateScopeKpiMixedFields } from '../services/scope-kpi-mixed.service'
import { logger } from '../utils/logger'
import { sendApiError } from '../utils/api-errors'

const toFiniteNumber = (value: any) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const average = (values: number[]) => {
  if (values.length === 0) return null
  return Number((values.reduce((acc, value) => acc + value, 0) / values.length).toFixed(2))
}

const sum = (values: number[]) => Number(values.reduce((acc, value) => acc + value, 0).toFixed(2))

const parseObjectiveNames = (value: any) =>
  typeof value === 'string' && value.trim()
    ? Array.from(new Set(value.split('||').map((item) => item.trim()).filter(Boolean)))
    : []

const resolveExecutivePeriod = async (periodId?: number | null) => {
  if (periodId) {
    const [rows] = await pool.query<any[]>('SELECT id, name FROM periods WHERE id = ? LIMIT 1', [periodId])
    if (Array.isArray(rows) && rows.length > 0) return rows[0]
  }

  const [rows] = await pool.query<any[]>(
    `SELECT p.id, p.name
     FROM periods p
     LEFT JOIN scope_kpis sk ON sk.periodId = p.id
     GROUP BY p.id, p.name, p.status, p.startDate
     ORDER BY
       CASE p.status WHEN 'open' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END,
       COUNT(sk.id) DESC,
       p.startDate DESC
     LIMIT 1`
  )
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null
}

const resolveExecutiveSubPeriod = async (periodId: number, subPeriodId?: number | null) => {
  if (subPeriodId) {
    const [rows] = await pool.query<any[]>(
      'SELECT id, name FROM calendar_subperiods WHERE id = ? AND periodId = ? LIMIT 1',
      [subPeriodId, periodId]
    )
    if (Array.isArray(rows) && rows.length > 0) return rows[0]
  }

  const [rows] = await pool.query<any[]>(
    `SELECT sp.id, sp.name
     FROM calendar_subperiods sp
     LEFT JOIN scope_kpis sk ON sk.subPeriodId = sp.id
     WHERE sp.periodId = ?
     GROUP BY sp.id, sp.name, sp.startDate
     ORDER BY COUNT(sk.id) DESC, sp.startDate DESC
     LIMIT 1`,
    [periodId]
  )
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null
}

const buildExecutiveScopeSummary = (scopeKpis: any[], children: any[]) => {
  const actualValues = scopeKpis.map((item) => toFiniteNumber(item.actual)).filter((item): item is number => item !== null)
  const variations = scopeKpis.map((item) => toFiniteNumber(item.variation)).filter((item): item is number => item !== null)
  const weightedResults = scopeKpis.map((item) => toFiniteNumber(item.weightedResult)).filter((item): item is number => item !== null)
  const objectiveNames = Array.from(
    new Set(
      scopeKpis.flatMap((item) =>
        Array.isArray(item.objectiveNames) ? item.objectiveNames.filter(Boolean) : []
      )
    )
  )

  return {
    totalScopeKpis: scopeKpis.length,
    approvedScopeKpis: scopeKpis.filter((item) => item.status === 'approved').length,
    completionRate: scopeKpis.length > 0 ? Number(((actualValues.length / scopeKpis.length) * 100).toFixed(2)) : 0,
    averageVariation: average(variations),
    weightedResultTotal: sum(weightedResults),
    sourceModeBreakdown: {
      direct: scopeKpis.filter((item) => item.sourceMode === 'direct').length,
      aggregated: scopeKpis.filter((item) => item.sourceMode === 'aggregated').length,
      mixed: scopeKpis.filter((item) => item.sourceMode === 'mixed').length,
    },
    objectiveCount: objectiveNames.length,
    childCount: children.length,
  }
}

const buildExecutiveTreeNode = (
  scopeRow: any,
  childrenMap: Map<number, any[]>,
  scopeKpisByScope: Map<number, any[]>
): any => {
  const children = (childrenMap.get(Number(scopeRow.id)) || [])
    .filter((child) => ['area', 'business_unit', 'team'].includes(child.type))
    .map((child) => buildExecutiveTreeNode(child, childrenMap, scopeKpisByScope))
  const scopeKpis = scopeKpisByScope.get(Number(scopeRow.id)) || []
  const summary = buildExecutiveScopeSummary(scopeKpis, children)

  return {
    scope: {
      id: Number(scopeRow.id),
      name: scopeRow.name,
      type: scopeRow.type,
      parentId: scopeRow.parentId,
    },
    summary,
    objectives: Array.from(
      new Set(scopeKpis.flatMap((item) => (Array.isArray(item.objectiveNames) ? item.objectiveNames : [])))
    ),
    scopeKpis: scopeKpis
      .slice()
      .sort((a, b) => Number(b.weightedResult || 0) - Number(a.weightedResult || 0)),
    children,
  }
}

const buildScopeChildrenMap = (scopeRows: any[]) => {
  const childrenMap = new Map<number, any[]>()
  scopeRows.forEach((scope) => {
    if (scope.parentId == null) return
    const current = childrenMap.get(Number(scope.parentId)) || []
    current.push(scope)
    childrenMap.set(Number(scope.parentId), current)
  })
  return childrenMap
}

const collectScopeDescendantIds = (scopeId: number, childrenMap: Map<number, any[]>) => {
  const visited = new Set<number>()
  const queue = [scopeId]

  while (queue.length > 0) {
    const current = queue.shift()
    if (current == null || visited.has(current)) continue
    visited.add(current)
    const children = childrenMap.get(current) || []
    children.forEach((child) => queue.push(Number(child.id)))
  }

  return Array.from(visited)
}

const parseObjectiveNameSet = (value: any) =>
  new Set(
    typeof value === 'string' && value.trim()
      ? value
          .split('||')
          .map((item) => item.trim())
          .filter(Boolean)
      : []
  )

const buildTrendSummary = (rows: any[]) => {
  const weightedResults = rows
    .map((row) => toFiniteNumber(row.weightedResult))
    .filter((value): value is number => value !== null)
  const variations = rows
    .map((row) => toFiniteNumber(row.variation))
    .filter((value): value is number => value !== null)
  const actualCount = rows.filter((row) => toFiniteNumber(row.actual) !== null).length

  return {
    totalScopeKpis: rows.length,
    weightedResultTotal: sum(weightedResults),
    averageVariation: average(variations),
    completionRate: rows.length > 0 ? Number(((actualCount / rows.length) * 100).toFixed(2)) : 0,
  }
}

const pickRowsForPeriodTrend = (rows: any[]) => {
  const baseRows = rows.filter((row) => row.subPeriodId == null)
  if (baseRows.length > 0) return baseRows

  const groupedBySubPeriod = new Map<number, any[]>()
  rows.forEach((row) => {
    if (row.subPeriodId == null) return
    const key = Number(row.subPeriodId)
    const current = groupedBySubPeriod.get(key) || []
    current.push(row)
    groupedBySubPeriod.set(key, current)
  })

  const latestSubPeriod = Array.from(groupedBySubPeriod.entries())
    .sort((a, b) => {
      const aStart = a[1][0]?.subPeriodStart ? new Date(a[1][0].subPeriodStart).getTime() : 0
      const bStart = b[1][0]?.subPeriodStart ? new Date(b[1][0].subPeriodStart).getTime() : 0
      return bStart - aStart
    })
    .at(0)

  return latestSubPeriod?.[1] || []
}

// Estadísticas generales para Admin/HR
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const [
      [collaboratorsResult],
      [periodsResult],
      [kpisResult],
      [assignmentsResult],
      [orgUnitsResult],
      [completedResult],
      [complianceResult],
    ] = await Promise.all([
      pool.query<any[]>('SELECT COUNT(*) as total FROM collaborators'),
      pool.query<any[]>("SELECT COUNT(*) as total FROM periods WHERE status IN ('open', 'in_review')"),
      pool.query<any[]>('SELECT COUNT(*) as total FROM kpis'),
      pool.query<any[]>('SELECT COUNT(*) as total FROM collaborator_kpis'),
      pool.query<any[]>("SELECT COUNT(*) as total FROM org_scopes WHERE type IN ('area', 'team', 'company')"),
      pool.query<any[]>('SELECT COUNT(*) as total FROM collaborator_kpis WHERE actual IS NOT NULL'),
      pool.query<any[]>('SELECT AVG(variation) as avg FROM collaborator_kpis WHERE variation IS NOT NULL'),
    ])

    const totalCollaborators = Array.isArray(collaboratorsResult) ? collaboratorsResult[0]?.total ?? 0 : 0
    const activePeriods = Array.isArray(periodsResult) ? periodsResult[0]?.total ?? 0 : 0
    const totalKPIs = Array.isArray(kpisResult) ? kpisResult[0]?.total ?? 0 : 0
    const totalAssignments = Array.isArray(assignmentsResult) ? assignmentsResult[0]?.total ?? 0 : 0
    const totalOrgUnits = Array.isArray(orgUnitsResult) ? orgUnitsResult[0]?.total ?? 0 : 0
    const completedAssignments = Array.isArray(completedResult) ? completedResult[0]?.total ?? 0 : 0
    const averageCompliance = Array.isArray(complianceResult) ? complianceResult[0]?.avg ?? 0 : 0

    res.json({
      totalCollaborators,
      totalOrgUnits,
      activePeriods,
      totalKPIs,
      totalAssignments,
      completedAssignments,
      pendingAssignments: totalAssignments - completedAssignments,
      averageCompliance: Number(averageCompliance),
    })
  } catch (error: any) {
    logger.error('Error getting dashboard stats:', error)
    return sendApiError(res, 500, 'DASHBOARD_STATS_FETCH_FAILED', 'Error al obtener estadísticas del dashboard')
  }
}

// Estadísticas por área para Admin/HR
export const getAreaStats = async (req: Request, res: Response) => {
  try {
    const resolvedPeriod = await resolveExecutivePeriod(
      req.query.periodId ? Number(req.query.periodId) : null
    )

    const [rows] = resolvedPeriod
      ? await pool.query<any[]>(
          `SELECT
            COALESCE(os.name, c.area) as area,
            COALESCE(os.type, 'area') as scopeType,
            COUNT(DISTINCT c.id) as collaborators,
            AVG(ck.variation) as averageCompliance,
            COUNT(DISTINCT CASE WHEN ck.actual IS NOT NULL THEN ck.id END) as completedKPIs
          FROM collaborators c
          LEFT JOIN org_scopes os ON os.id = c.orgScopeId
          LEFT JOIN collaborator_kpis ck ON c.id = ck.collaboratorId AND ck.periodId = ?
          WHERE (c.area IS NOT NULL AND c.area != '') OR c.orgScopeId IS NOT NULL
          GROUP BY COALESCE(os.name, c.area), COALESCE(os.type, 'area')
          ORDER BY COALESCE(os.type, 'area'), COALESCE(os.name, c.area)`,
          [resolvedPeriod.id]
        )
      : [[], []]

    const stats = Array.isArray(rows)
      ? rows.map((row) => ({
          area: row.area,
          scopeType: row.scopeType || 'area',
          collaborators: Number(row.collaborators),
          averageCompliance: Number(row.averageCompliance || 0),
          completedKPIs: Number(row.completedKPIs || 0),
        }))
      : []

    res.json(stats)
  } catch (error: any) {
    logger.error('Error getting area stats:', error)
    return sendApiError(res, 500, 'DASHBOARD_AREA_STATS_FETCH_FAILED', 'Error al obtener estadísticas por área')
  }
}

// Estadísticas del equipo para Líderes
export const getTeamStats = async (req: Request, res: Response) => {
  try {
    const leaderId = parseInt(req.params.leaderId)
    const user = (req as AuthRequest).user

    if (user?.collaboratorId !== leaderId && user?.role !== 'admin') {
      return sendApiError(res, 403, 'DASHBOARD_TEAM_STATS_FORBIDDEN', 'No tienes permisos para ver estas estadísticas')
    }

    const [teamMembers] = await pool.query<any[]>(
      'SELECT id FROM collaborators WHERE managerId = ?',
      [leaderId]
    )

    const teamMemberIds = Array.isArray(teamMembers) ? teamMembers.map((m) => m.id) : []

    if (teamMemberIds.length === 0) {
      return res.json({
        teamMembers: 0,
        teamAverageCompliance: 0,
        teamCompletedKPIs: 0,
        teamPendingKPIs: 0,
      })
    }

    const placeholders = teamMemberIds.map(() => '?').join(',')
    const [stats] = await pool.query<any[]>(
      `SELECT
        AVG(variation) as teamAverageCompliance,
        COUNT(CASE WHEN actual IS NOT NULL THEN 1 END) as teamCompletedKPIs,
        COUNT(CASE WHEN actual IS NULL THEN 1 END) as teamPendingKPIs
      FROM collaborator_kpis
      WHERE collaboratorId IN (${placeholders})`,
      teamMemberIds
    )

    const result = Array.isArray(stats) && stats.length > 0 ? stats[0] : {}

    res.json({
      teamMembers: teamMemberIds.length,
      teamAverageCompliance: Number(result.teamAverageCompliance || 0),
      teamCompletedKPIs: Number(result.teamCompletedKPIs || 0),
      teamPendingKPIs: Number(result.teamPendingKPIs || 0),
    })
  } catch (error: any) {
    logger.error('Error getting team stats:', error)
    return sendApiError(res, 500, 'DASHBOARD_TEAM_STATS_FETCH_FAILED', 'Error al obtener estadísticas del equipo')
  }
}

// KPIs del colaborador
export const getMyKPIs = async (req: Request, res: Response) => {
  try {
    const collaboratorId = parseInt(req.params.collaboratorId)
    const user = (req as AuthRequest).user

    if (user?.collaboratorId !== collaboratorId && user?.role !== 'admin') {
      return sendApiError(res, 403, 'DASHBOARD_MY_KPIS_FORBIDDEN', 'No tienes permisos para ver estos KPIs')
    }

    const [rows] = await pool.query<any[]>(
      `SELECT
        k.name as kpiName,
        ck.target,
        ck.actual,
        ck.variation as compliance
      FROM collaborator_kpis ck
      JOIN kpis k ON ck.kpiId = k.id
      WHERE ck.collaboratorId = ?
      ORDER BY ck.id DESC
      LIMIT 10`,
      [collaboratorId]
    )

    const kpis = Array.isArray(rows)
      ? rows.map((row) => ({
          kpiName: row.kpiName,
          target: Number(row.target),
          actual: row.actual !== null && row.actual !== undefined ? Number(row.actual) : null,
          compliance: Number(row.compliance || 0),
        }))
      : []

    res.json(kpis)
  } catch (error: any) {
    logger.error('Error getting my KPIs:', error)
    return sendApiError(res, 500, 'DASHBOARD_MY_KPIS_FETCH_FAILED', 'Error al obtener tus KPIs')
  }
}

// KPIs del equipo del colaborador (suma de targets/actuals por KPI)
export const getTeamKPIs = async (req: Request, res: Response) => {
  try {
    const collaboratorId = parseInt(req.params.collaboratorId)
    const user = (req as AuthRequest).user

    if (user?.collaboratorId !== collaboratorId && user?.role !== 'admin') {
      return sendApiError(res, 403, 'DASHBOARD_TEAM_KPIS_FORBIDDEN', 'No tienes permisos para ver estos KPIs')
    }

    const [collaborator] = await pool.query<any[]>(
      'SELECT managerId FROM collaborators WHERE id = ?',
      [collaboratorId]
    )

    const managerId = Array.isArray(collaborator) && collaborator.length > 0
      ? collaborator[0].managerId
      : null

    if (!managerId) return res.json([])

    const [teamMembers] = await pool.query<any[]>(
      'SELECT id FROM collaborators WHERE managerId = ?',
      [managerId]
    )

    const teamMemberIds = Array.isArray(teamMembers) ? teamMembers.map((m) => m.id) : []
    if (teamMemberIds.length === 0) return res.json([])

    const placeholders = teamMemberIds.map(() => '?').join(',')
    const [rows] = await pool.query<any[]>(
      `SELECT
        k.name as kpiName,
        SUM(ck.target) as target,
        SUM(ck.actual) as actual
      FROM collaborator_kpis ck
      JOIN kpis k ON ck.kpiId = k.id
      WHERE ck.collaboratorId IN (${placeholders})
      GROUP BY k.id, k.name
      ORDER BY k.name
      LIMIT 10`,
      teamMemberIds
    )

    const kpis = Array.isArray(rows)
      ? rows.map((row) => ({
          kpiName: row.kpiName,
          target: Number(row.target),
          actual: row.actual !== null && row.actual !== undefined ? Number(row.actual) : null,
        }))
      : []

    res.json(kpis)
  } catch (error: any) {
    logger.error('Error getting team KPIs:', error)
    return sendApiError(res, 500, 'DASHBOARD_TEAM_KPIS_FETCH_FAILED', 'Error al obtener KPIs del equipo')
  }
}

// Cumplimiento por período — vista org-wide para Admin/HR
export const getComplianceByPeriod = async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT
        p.name as period,
        AVG(ck.variation) as compliance
      FROM periods p
      LEFT JOIN collaborator_kpis ck ON p.id = ck.periodId
      GROUP BY p.id, p.name
      ORDER BY p.startDate DESC
      LIMIT 6`
    )

    const data = Array.isArray(rows)
      ? rows
          .slice()
          .reverse()
          .map((row) => ({
            period: row.period,
            compliance: Number(row.compliance || 0),
          }))
      : []

    res.json(data)
  } catch (error: any) {
    logger.error('Error getting compliance by period:', error)
    return sendApiError(res, 500, 'DASHBOARD_COMPLIANCE_FETCH_FAILED', 'Error al obtener cumplimiento por período')
  }
}

// Cumplimiento por período filtrado al equipo del líder
export const getTeamComplianceByPeriod = async (req: Request, res: Response) => {
  try {
    const leaderId = parseInt(req.params.leaderId)
    const user = (req as AuthRequest).user

    if (user?.collaboratorId !== leaderId && user?.role !== 'admin') {
      return sendApiError(res, 403, 'DASHBOARD_TEAM_COMPLIANCE_FORBIDDEN', 'No tienes permisos')
    }

    const [teamMembers] = await pool.query<any[]>(
      'SELECT id FROM collaborators WHERE managerId = ?',
      [leaderId]
    )
    const teamMemberIds = Array.isArray(teamMembers) ? teamMembers.map((m) => m.id) : []

    const [periodRows] = await pool.query<any[]>(
      'SELECT id, name FROM periods ORDER BY startDate DESC LIMIT 6'
    )
    const periods = Array.isArray(periodRows) ? periodRows.slice().reverse() : []

    if (teamMemberIds.length === 0) {
      return res.json(periods.map((p) => ({ period: p.name, compliance: 0 })))
    }

    const placeholders = teamMemberIds.map(() => '?').join(',')
    const [rows] = await pool.query<any[]>(
      `SELECT
        p.id as periodId,
        AVG(ck.variation) as compliance
      FROM periods p
      LEFT JOIN collaborator_kpis ck ON p.id = ck.periodId AND ck.collaboratorId IN (${placeholders})
      GROUP BY p.id
      ORDER BY p.startDate DESC
      LIMIT 6`,
      teamMemberIds
    )

    const complianceByPeriodId = new Map(
      (Array.isArray(rows) ? rows : []).map((r) => [r.periodId, Number(r.compliance || 0)])
    )

    const data = periods.map((p) => ({
      period: p.name,
      compliance: complianceByPeriodId.get(p.id) ?? 0,
    }))

    res.json(data)
  } catch (error: any) {
    logger.error('Error getting team compliance by period:', error)
    return sendApiError(res, 500, 'DASHBOARD_TEAM_COMPLIANCE_FETCH_FAILED', 'Error al obtener cumplimiento del equipo por período')
  }
}

export const getExecutiveTree = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user
    if (!user || !['admin', 'director', 'manager', 'leader'].includes(user.role)) {
      return sendApiError(res, 403, 'DASHBOARD_EXECUTIVE_TREE_FORBIDDEN', 'No tienes permisos para ver el tablero ejecutivo')
    }

    const requestedPeriodId = req.query.periodId ? Number(req.query.periodId) : null
    const requestedSubPeriodId = req.query.subPeriodId ? Number(req.query.subPeriodId) : null
    const requestedCompanyScopeId = req.query.companyScopeId ? Number(req.query.companyScopeId) : null

    const resolvedPeriod = await resolveExecutivePeriod(requestedPeriodId)
    if (!resolvedPeriod) {
      return res.json({ periodId: null, subPeriodId: null, companies: [] })
    }

    const resolvedSubPeriod = await resolveExecutiveSubPeriod(Number(resolvedPeriod.id), requestedSubPeriodId)

    const [scopeRows] = await pool.query<any[]>(
      `SELECT id, name, type, parentId, active, metadata
       FROM org_scopes
       WHERE COALESCE(active, 1) = 1
       ORDER BY
         CASE type
           WHEN 'company' THEN 0
           WHEN 'business_unit' THEN 1
           WHEN 'area' THEN 2
           WHEN 'team' THEN 3
           ELSE 4
         END,
         name ASC`
    )

    const filteredScopeRows = (scopeRows || []).filter((scope) =>
      ['company', 'business_unit', 'area', 'team'].includes(scope.type)
    )
    const childrenMap = new Map<number, any[]>()
    filteredScopeRows.forEach((scope) => {
      if (scope.parentId == null) return
      const current = childrenMap.get(Number(scope.parentId)) || []
      current.push(scope)
      childrenMap.set(Number(scope.parentId), current)
    })

    const subPeriodClause = resolvedSubPeriod?.id
      ? `AND (sk.subPeriodId = ? OR sk.subPeriodId IS NULL)`
      : ``
    const scopeKpiParams = resolvedSubPeriod?.id
      ? [resolvedPeriod.id, resolvedSubPeriod.id]
      : [resolvedPeriod.id]

    const [scopeKpiRows] = await pool.query<any[]>(
      `SELECT sk.*,
              k.name as kpiName,
              os.name as orgScopeName,
              os.type as orgScopeType,
              os.parentId as orgScopeParentId,
              p.name as periodName,
              sp.name as subPeriodName,
              GROUP_CONCAT(DISTINCT ot.name SEPARATOR '||') as objectiveNamesJoined
       FROM scope_kpis sk
       JOIN kpis k ON k.id = sk.kpiId
       JOIN org_scopes os ON os.id = sk.orgScopeId
       JOIN periods p ON p.id = sk.periodId
       LEFT JOIN calendar_subperiods sp ON sp.id = sk.subPeriodId
       LEFT JOIN objective_trees_scope_kpis otsk ON otsk.scopeKpiId = sk.id
       LEFT JOIN objective_trees ot ON ot.id = otsk.objectiveTreeId
       WHERE sk.periodId = ?
         ${subPeriodClause}
       GROUP BY sk.id
       ORDER BY os.name ASC, sk.weightedResult DESC, sk.name ASC`,
      scopeKpiParams
    )

    const scopeKpisByScope = new Map<number, any[]>()
    ;(scopeKpiRows || []).forEach((row) => {
      const hydrated = hydrateScopeKpiMixedFields({
        ...row,
        objectiveNames: parseObjectiveNames(row.objectiveNamesJoined),
      })
      const scopeId = Number(row.orgScopeId)
      const current = scopeKpisByScope.get(scopeId) || []
      current.push(hydrated)
      scopeKpisByScope.set(scopeId, current)
    })

    const companyScopes = filteredScopeRows.filter(
      (scope) =>
        scope.type === 'company' &&
        (!requestedCompanyScopeId || Number(scope.id) === requestedCompanyScopeId)
    )

    const companies = companyScopes.map((scope) =>
      buildExecutiveTreeNode(scope, childrenMap, scopeKpisByScope)
    )

    res.json({
      periodId: Number(resolvedPeriod.id),
      periodName: resolvedPeriod.name,
      subPeriodId: resolvedSubPeriod?.id ? Number(resolvedSubPeriod.id) : null,
      subPeriodName: resolvedSubPeriod?.name || null,
      requestedCompanyScopeId,
      companies,
    })
  } catch (error: any) {
    logger.error('Error getting executive tree:', error)
    return sendApiError(res, 500, 'DASHBOARD_EXECUTIVE_TREE_FETCH_FAILED', 'Error al obtener tablero ejecutivo')
  }
}

export const getExecutiveTrends = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user
    if (!user || !['admin', 'director', 'manager', 'leader'].includes(user.role)) {
      return sendApiError(res, 403, 'DASHBOARD_EXECUTIVE_TRENDS_FORBIDDEN', 'No tienes permisos para ver tendencias ejecutivas')
    }

    const requestedScopeId = req.query.scopeId ? Number(req.query.scopeId) : null
    const requestedPeriodId = req.query.periodId ? Number(req.query.periodId) : null
    const objectiveName = typeof req.query.objectiveName === 'string' ? req.query.objectiveName.trim() : ''

    const resolvedPeriod = await resolveExecutivePeriod(requestedPeriodId)
    if (!resolvedPeriod) {
      return res.json({
        scope: null,
        periodId: null,
        periodName: null,
        objectiveName: objectiveName || null,
        periodSeries: [],
        subPeriodSeries: [],
      })
    }

    const [scopeRows] = await pool.query<any[]>(
      `SELECT id, name, type, parentId, active
       FROM org_scopes
       WHERE COALESCE(active, 1) = 1
       ORDER BY name ASC`
    )

    const filteredScopeRows = (scopeRows || []).filter((scope) =>
      ['company', 'business_unit', 'area', 'team'].includes(scope.type)
    )
    const childrenMap = buildScopeChildrenMap(filteredScopeRows)

    // Prefer the user's own company scope as fallback (not alphabetically-first company)
    let fallbackScope: any = null
    const collaboratorId = Number((user as any).collaboratorId || (user as any).id)
    if (collaboratorId) {
      const [userCompanyRows] = await pool.query<any[]>(
        `WITH RECURSIVE ancestry AS (
           SELECT os.id, os.parentId, os.type
           FROM org_scopes os
           JOIN collaborators c ON c.orgScopeId = os.id
           WHERE c.id = ?
           UNION ALL
           SELECT os.id, os.parentId, os.type
           FROM org_scopes os JOIN ancestry a ON os.id = a.parentId
         )
         SELECT id FROM ancestry WHERE type = 'company' LIMIT 1`,
        [collaboratorId]
      )
      const userCompanyId = userCompanyRows?.[0]?.id
      if (userCompanyId) {
        fallbackScope = filteredScopeRows.find((s) => Number(s.id) === Number(userCompanyId)) ?? null
      }
    }
    if (!fallbackScope) {
      fallbackScope =
        filteredScopeRows.find((scope) => scope.type === 'company' && !scope.name.startsWith('[')) ||
        filteredScopeRows.find((scope) => scope.type === 'company') ||
        filteredScopeRows.find((scope) => ['business_unit', 'area', 'team'].includes(scope.type)) ||
        null
    }
    const requestedScope =
      (requestedScopeId
        ? filteredScopeRows.find((scope) => Number(scope.id) === requestedScopeId)
        : null) || fallbackScope

    if (!requestedScope) {
      return res.json({
        scope: null,
        periodId: Number(resolvedPeriod.id),
        periodName: resolvedPeriod.name,
        objectiveName: objectiveName || null,
        periodSeries: [],
        subPeriodSeries: [],
      })
    }

    const scopeIds = collectScopeDescendantIds(Number(requestedScope.id), childrenMap)
    const scopePlaceholders = scopeIds.map(() => '?').join(',')

    const [trendRows] = await pool.query<any[]>(
      `SELECT sk.id,
              sk.name,
              sk.orgScopeId,
              sk.periodId,
              sk.subPeriodId,
              sk.actual,
              sk.variation,
              sk.weightedResult,
              p.name as periodName,
              p.startDate as periodStart,
              sp.name as subPeriodName,
              sp.startDate as subPeriodStart,
              GROUP_CONCAT(DISTINCT ot.name SEPARATOR '||') as objectiveNamesJoined
       FROM scope_kpis sk
       JOIN periods p ON p.id = sk.periodId
       LEFT JOIN calendar_subperiods sp ON sp.id = sk.subPeriodId
       LEFT JOIN objective_trees_scope_kpis otsk ON otsk.scopeKpiId = sk.id
       LEFT JOIN objective_trees ot ON ot.id = otsk.objectiveTreeId
       WHERE sk.orgScopeId IN (${scopePlaceholders})
       GROUP BY sk.id
       ORDER BY p.startDate ASC, sp.startDate ASC, sk.name ASC`,
      scopeIds
    )

    const filteredRows = (trendRows || []).filter((row) => {
      if (!objectiveName) return true
      const objectiveNames = parseObjectiveNameSet(row.objectiveNamesJoined)
      return objectiveNames.has(objectiveName)
    })

    const [recentPeriods] = await pool.query<any[]>(
      `SELECT id, name, startDate
       FROM periods
       ORDER BY startDate DESC
       LIMIT 6`
    )
    const periodSeries = (recentPeriods || [])
      .slice()
      .reverse()
      .map((period) => {
        const rowsForPeriod = filteredRows.filter((row) => Number(row.periodId) === Number(period.id))
        const rowsUsed = pickRowsForPeriodTrend(rowsForPeriod)
        return {
          periodId: Number(period.id),
          periodName: period.name,
          ...buildTrendSummary(rowsUsed),
        }
      })

    const [subPeriodRows] = await pool.query<any[]>(
      `SELECT id, name, startDate
       FROM calendar_subperiods
       WHERE periodId = ?
       ORDER BY startDate ASC`,
      [resolvedPeriod.id]
    )
    const subPeriodSeries = (subPeriodRows || []).map((subPeriod) => {
      const rowsForSubPeriod = filteredRows.filter((row) => Number(row.subPeriodId) === Number(subPeriod.id))
      return {
        subPeriodId: Number(subPeriod.id),
        subPeriodName: subPeriod.name,
        ...buildTrendSummary(rowsForSubPeriod),
      }
    })

    res.json({
      scope: {
        id: Number(requestedScope.id),
        name: requestedScope.name,
        type: requestedScope.type,
      },
      periodId: Number(resolvedPeriod.id),
      periodName: resolvedPeriod.name,
      objectiveName: objectiveName || null,
      periodSeries,
      subPeriodSeries,
    })
  } catch (error: any) {
    logger.error('Error getting executive trends:', error)
    return sendApiError(res, 500, 'DASHBOARD_EXECUTIVE_TRENDS_FETCH_FAILED', 'Error al obtener tendencias ejecutivas')
  }
}
