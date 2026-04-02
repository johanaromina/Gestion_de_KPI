import { pool } from '../config/database'
import { calculateVariation, calculateWeightedResult } from './kpi-formulas'
import { applyMeasurementToScopeKPI } from '../services/scope-kpi.service'
import { mergeParams, parseAuthConfig, parseJson, resolveConnectorAdapter, resolvePeriodParams } from '../integrations/adapters'
import { AuthProfileRow, TargetRow, TemplateRow } from '../integrations/types'

type RunContext = {
  templateId: number
  targetId?: number
  triggeredBy?: number | null
  mode: 'manual' | 'scheduled'
  note?: string | null
  retryCount?: number
}

const RUN_DELAY_MS = parseInt(process.env.INTEGRATIONS_RUN_DELAY_MS || '2000', 10)
const RETRY_DELAY_MS = parseInt(process.env.INTEGRATIONS_RETRY_MS || '60000', 10)
const CACHE_TTL_HOURS = parseInt(process.env.INTEGRATIONS_CACHE_HOURS || '12', 10)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

class RunQueue {
  private running = false
  private queue: Array<() => Promise<void>> = []

  async enqueue(task: () => Promise<void>) {
    this.queue.push(task)
    if (!this.running) {
      this.running = true
      while (this.queue.length > 0) {
        const next = this.queue.shift()
        if (next) {
          await next()
          await sleep(RUN_DELAY_MS)
        }
      }
      this.running = false
    }
  }
}

const runnerQueue = new RunQueue()

const insertRun = async (templateId: number, targetId: number, payload: any) => {
  const [result] = await pool.query(
    `INSERT INTO integration_template_runs
     (templateId, targetId, status, startedAt, finishedAt, triggeredBy, message, outputs, error)
     VALUES (?, ?, ?, NOW(), NOW(), ?, ?, ?, ?)`,
    [
      templateId,
      targetId,
      payload.status,
      payload.triggeredBy || null,
      payload.message || null,
      payload.outputs ? JSON.stringify(payload.outputs) : null,
      payload.error || null,
    ]
  )
  return result as any
}

const shouldUseCache = async (templateId: number, targetId: number) => {
  const [rows] = await pool.query<any[]>(
    `SELECT startedAt FROM integration_template_runs
     WHERE templateId = ? AND targetId = ? AND status = 'success'
     ORDER BY startedAt DESC LIMIT 1`,
    [templateId, targetId]
  )
  const last = rows?.[0]?.startedAt ? new Date(rows[0].startedAt).getTime() : null
  if (!last) return false
  const diffHours = (Date.now() - last) / (1000 * 60 * 60)
  return diffHours <= CACHE_TTL_HOURS
}

const hasMeasurementForSubPeriod = async (assignmentId: number, subPeriodId: number | null) => {
  if (!subPeriodId) return false
  const [rows] = await pool.query<any[]>(
    `SELECT id FROM kpi_measurements
     WHERE assignmentId = ? AND subPeriodId = ? AND status IN ('approved','proposed') LIMIT 1`,
    [assignmentId, subPeriodId]
  )
  return Array.isArray(rows) && rows.length > 0
}

const hasActualValue = async (assignmentId: number) => {
  const [rows] = await pool.query<any[]>(`SELECT actual FROM collaborator_kpis WHERE id = ? LIMIT 1`, [
    assignmentId,
  ])
  if (!Array.isArray(rows) || rows.length === 0) return false
  return rows[0].actual !== null && rows[0].actual !== undefined
}

const hasScopeActualValue = async (scopeKpiId: number) => {
  const [rows] = await pool.query<any[]>(`SELECT actual FROM scope_kpis WHERE id = ? LIMIT 1`, [scopeKpiId])
  if (!Array.isArray(rows) || rows.length === 0) return false
  return rows[0].actual !== null && rows[0].actual !== undefined
}

const createMeasurementFromRun = async (
  assignmentId: number | null | undefined,
  value: number,
  runId: number,
  triggeredBy?: number | null,
  periodId?: number | null,
  subPeriodId?: number | null
) => {
  if (!assignmentId) return
  const [assignmentRows] = await pool.query<any[]>(
    `SELECT ck.target, ck.weight, ck.kpiId, ck.periodId, ck.curationStatus, ck.collaboratorId, ck.subPeriodId
     FROM collaborator_kpis ck
     WHERE ck.id = ?`,
    [assignmentId]
  )
  if (!Array.isArray(assignmentRows) || assignmentRows.length === 0) {
    return
  }
  const assignment = assignmentRows[0]
  let curationStatus = assignment.curationStatus || 'pending'
  if (curationStatus === 'pending' && assignment.subPeriodId) {
    const [baseRows] = await pool.query<any[]>(
      `SELECT curationStatus
       FROM collaborator_kpis
       WHERE collaboratorId = ? AND kpiId = ? AND periodId = ? AND subPeriodId IS NULL
       LIMIT 1`,
      [assignment.collaboratorId, assignment.kpiId, assignment.periodId]
    )
    if (Array.isArray(baseRows) && baseRows.length > 0 && baseRows[0].curationStatus) {
      curationStatus = baseRows[0].curationStatus
    }
  }
  const shouldApprove = curationStatus === 'approved' || curationStatus === 'in_review'
  const measurementStatus = shouldApprove ? 'approved' : 'proposed'
  const [result] = await pool.query(
    `INSERT INTO kpi_measurements
     (assignmentId, periodId, subPeriodId, value, mode, status, capturedBy, sourceRunId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      assignmentId,
      periodId || null,
      subPeriodId || null,
      value,
      'auto',
      measurementStatus,
      triggeredBy || null,
      String(runId),
    ]
  )
  const insertResult = result as any
  const measurementId = insertResult.insertId
  if (!shouldApprove) return
  const [kpiRows] = await pool.query<any[]>(
    `SELECT type, direction, formula FROM kpis WHERE id = ?`,
    [assignment.kpiId]
  )
  const kpiDirection = kpiRows?.[0]?.direction || kpiRows?.[0]?.type || 'growth'
  const customFormula = kpiRows?.[0]?.formula || undefined
  let targetValue = Number(assignment.target ?? 0)
  const weightValue = Number(assignment.weight ?? 0)
  if ((!targetValue || targetValue <= 0) && assignment.subPeriodId) {
    const [planRows] = await pool.query<any[]>(
      `SELECT target
       FROM collaborator_kpi_plan
       WHERE collaboratorId = ? AND kpiId = ? AND periodId = ? AND subPeriodId = ?
       LIMIT 1`,
      [assignment.collaboratorId, assignment.kpiId, assignment.periodId, assignment.subPeriodId]
    )
    const planTarget = Number(planRows?.[0]?.target ?? 0)
    if (planTarget > 0) {
      targetValue = planTarget
      await pool.query(`UPDATE collaborator_kpis SET target = ? WHERE id = ?`, [
        planTarget,
        assignmentId,
      ])
    }
  }
  if (!targetValue || targetValue <= 0) return
  const variation = calculateVariation(kpiDirection, targetValue, value, customFormula)
  const weightedResult = calculateWeightedResult(variation, weightValue)
  await pool.query(
    `UPDATE collaborator_kpis
     SET actual = ?, variation = ?, weightedResult = ?, inputMode = ?, lastMeasurementId = ?
     WHERE id = ?`,
    [value, variation, weightedResult, 'auto', measurementId, assignmentId]
  )
}

const createScopeMeasurementFromRun = async (
  scopeKpiId: number | null | undefined,
  value: number,
  runId: number,
  triggeredBy?: number | null,
  periodId?: number | null,
  subPeriodId?: number | null
) => {
  if (!scopeKpiId) return
  const [result] = await pool.query(
    `INSERT INTO kpi_measurements
     (assignmentId, scopeKpiId, periodId, subPeriodId, value, mode, status, capturedBy, sourceRunId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [null, scopeKpiId, periodId || null, subPeriodId || null, value, 'auto', 'approved', triggeredBy || null, String(runId)]
  )
  const measurementId = (result as any).insertId as number
  await applyMeasurementToScopeKPI(scopeKpiId, value, 'auto', measurementId)
}

const resolveSubPeriodId = async (
  calendarProfileId: number | null,
  periodId: number | null,
  from: string,
  to: string
) => {
  if ((!calendarProfileId && !periodId) || !from || !to) return null
  const toDate = new Date(to)
  const endDate = new Date(toDate)
  endDate.setDate(endDate.getDate() - 1)
  const endIso = endDate.toISOString().slice(0, 10)
  let rows: any[] = []
  if (calendarProfileId) {
    const [byCalendar] = await pool.query<any[]>(
      `SELECT id FROM calendar_subperiods
       WHERE calendarProfileId = ? AND startDate = ? AND endDate = ?
       LIMIT 1`,
      [calendarProfileId, from, endIso]
    )
    rows = byCalendar
  } else if (periodId) {
    const [byPeriod] = await pool.query<any[]>(
      `SELECT id FROM calendar_subperiods
       WHERE periodId = ? AND startDate = ? AND endDate = ?
       LIMIT 1`,
      [periodId, from, endIso]
    )
    rows = byPeriod
  }
  if (Array.isArray(rows) && rows.length > 0) {
    return rows[0].id
  }
  if (calendarProfileId) {
    const [byStartCalendar] = await pool.query<any[]>(
      `SELECT id FROM calendar_subperiods
       WHERE calendarProfileId = ? AND startDate = ?
       LIMIT 1`,
      [calendarProfileId, from]
    )
    if (Array.isArray(byStartCalendar) && byStartCalendar.length > 0) {
      return byStartCalendar[0].id
    }
  }
  if (periodId) {
    const [byStartPeriod] = await pool.query<any[]>(
      `SELECT id FROM calendar_subperiods
       WHERE periodId = ? AND startDate = ?
       LIMIT 1`,
      [periodId, from]
    )
    if (Array.isArray(byStartPeriod) && byStartPeriod.length > 0) {
      return byStartPeriod[0].id
    }
  }
  let fallback: any[] = []
  if (calendarProfileId) {
    const [byCalendar] = await pool.query<any[]>(
      `SELECT id FROM calendar_subperiods
       WHERE calendarProfileId = ? AND startDate <= ? AND endDate >= ?
       LIMIT 1`,
      [calendarProfileId, from, endIso]
    )
    fallback = byCalendar
  }
  if ((Array.isArray(fallback) && fallback.length === 0) && periodId) {
    const [byPeriod] = await pool.query<any[]>(
      `SELECT id FROM calendar_subperiods
       WHERE periodId = ? AND startDate <= ? AND endDate >= ?
       LIMIT 1`,
      [periodId, from, endIso]
    )
    fallback = byPeriod
  }
  if (Array.isArray(fallback) && fallback.length > 0) {
    return fallback[0].id
  }
  return null
}

const resolveSubPeriodName = async (subPeriodId: number | null) => {
  if (!subPeriodId) return null
  const [rows] = await pool.query<any[]>(`SELECT name FROM calendar_subperiods WHERE id = ? LIMIT 1`, [subPeriodId])
  if (Array.isArray(rows) && rows.length > 0) {
    return rows[0].name || null
  }
  return null
}

const resolveMeasurementDestination = async (
  target: TargetRow,
  from: string,
  to: string,
  override?: {
    assignmentId?: number | null
    scopeKpiId?: number | null
  }
) => {
  let periodId: number | null = null
  let subPeriodId: number | null = null
  let calendarProfileId: number | null = null
  let collaboratorId: number | null = null
  let kpiId: number | null = null
  let effectiveAssignmentId: number | null =
    override?.assignmentId !== undefined ? override.assignmentId || null : target.assignmentId || null
  let effectiveScopeKpiId: number | null =
    override?.scopeKpiId !== undefined ? override.scopeKpiId || null : target.scopeKpiId || target.macroKpiId || null

  if (effectiveAssignmentId) {
    const [assignmentRows] = await pool.query<any[]>(
      `SELECT periodId, subPeriodId, calendarProfileId, collaboratorId, kpiId
       FROM collaborator_kpis WHERE id = ? LIMIT 1`,
      [effectiveAssignmentId]
    )
    if (!Array.isArray(assignmentRows) || assignmentRows.length === 0) {
      throw new Error('Asignación destino no existe')
    }
    periodId = assignmentRows[0].periodId || null
    subPeriodId = assignmentRows[0].subPeriodId || null
    calendarProfileId = assignmentRows[0].calendarProfileId || null
    collaboratorId = assignmentRows[0].collaboratorId || null
    kpiId = assignmentRows[0].kpiId || null
  }
  if (effectiveAssignmentId && (calendarProfileId || periodId)) {
    const resolvedSubPeriodId = await resolveSubPeriodId(calendarProfileId, periodId, from, to)
    if (resolvedSubPeriodId) {
      if (collaboratorId && kpiId && periodId) {
        const [assignmentMatch] = await pool.query<any[]>(
          `SELECT id FROM collaborator_kpis
           WHERE collaboratorId = ? AND kpiId = ? AND periodId = ? AND subPeriodId = ?
           LIMIT 1`,
          [collaboratorId, kpiId, periodId, resolvedSubPeriodId]
        )
        if (Array.isArray(assignmentMatch) && assignmentMatch.length > 0) {
          effectiveAssignmentId = assignmentMatch[0].id
          subPeriodId = resolvedSubPeriodId
        } else {
          effectiveAssignmentId = null
          subPeriodId = resolvedSubPeriodId
        }
      } else {
        subPeriodId = resolvedSubPeriodId
      }
    }
  }
  if (effectiveScopeKpiId) {
    const [scopeRows] = await pool.query<any[]>(
      `SELECT periodId, subPeriodId FROM scope_kpis WHERE id = ? LIMIT 1`,
      [effectiveScopeKpiId]
    )
    if (!Array.isArray(scopeRows) || scopeRows.length === 0) {
      throw new Error('Scope KPI destino no existe')
    }
    periodId = scopeRows[0].periodId || periodId
    subPeriodId = scopeRows[0].subPeriodId || subPeriodId
  }
  const subPeriodName = await resolveSubPeriodName(subPeriodId)
  const shouldSkip = effectiveAssignmentId
    ? (await hasMeasurementForSubPeriod(effectiveAssignmentId, subPeriodId)) || (await hasActualValue(effectiveAssignmentId))
    : effectiveScopeKpiId
      ? await hasScopeActualValue(effectiveScopeKpiId)
      : false
  const skipReason = !effectiveAssignmentId && !effectiveScopeKpiId
    ? 'No hay destino para el subperiodo'
    : shouldSkip
      ? 'El destino ya tiene medicion cargada'
      : null

  return {
    periodId,
    subPeriodId,
    subPeriodName,
    effectiveAssignmentId,
    effectiveScopeKpiId,
    shouldSkip,
    skipReason,
  }
}

const loadScopeChain = async (scopeId: number) => {
  const chain: any[] = []
  let currentId: number | null = scopeId
  while (currentId) {
    const result = await pool.query<any[]>(
      `SELECT id, name, type, parentId, metadata FROM org_scopes WHERE id = ?`,
      [currentId]
    )
    const rows = result[0] as any[]
    if (!Array.isArray(rows) || rows.length === 0) break
    const scope = rows[0]
    chain.push({
      ...scope,
      metadata: scope.metadata ? parseJson(scope.metadata) : null,
    })
    currentId = scope.parentId || null
  }
  return chain.reverse()
}

const executeTemplateTarget = async (
  template: TemplateRow,
  target: TargetRow,
  authProfile: AuthProfileRow | null,
  context: RunContext
) => {
  if (context.mode === 'scheduled') {
    const cached = await shouldUseCache(template.id, target.id)
    if (cached) {
      await insertRun(template.id, target.id, {
        status: 'success',
        triggeredBy: context.triggeredBy,
        message: 'Cache vigente, ejecución omitida',
        outputs: { cached: true },
      })
      return { skipped: true }
    }
  }
  const baseParams = parseJson(target.params || null) || {}
  let mergedParams: Record<string, any> = {}
  let scopeAuthProfileId: number | null = null
  if (target.orgScopeId) {
    const chain = await loadScopeChain(target.orgScopeId)
    for (const scope of chain) {
      if (scope?.metadata) {
        mergedParams = mergeParams(mergedParams, scope.metadata)
        if (scope.metadata?.authProfileId) {
          scopeAuthProfileId = Number(scope.metadata.authProfileId)
        }
      }
    }
  }
  mergedParams = mergeParams(mergedParams, baseParams)
  const { from, to } = resolvePeriodParams(mergedParams)
  const params: Record<string, any> = { ...mergedParams, from, to }
  const usersCount = Array.isArray(params.users) ? params.users.length : params.users ? 1 : 0
  if (target.assignmentId && usersCount > 1) {
    throw new Error(
      'Target con multiples users no puede asignarse a un KPI individual. Usa un target por persona o quita la asignacion.'
    )
  }

  const connector = template.connector || authProfile?.connector || 'jira'

  let resolvedAuthProfile = authProfile
  if (scopeAuthProfileId && (!resolvedAuthProfile || resolvedAuthProfile.id !== scopeAuthProfileId)) {
    const [authRows] = await pool.query<AuthProfileRow[]>(
      `SELECT * FROM auth_profiles WHERE id = ?`,
      [scopeAuthProfileId]
    )
    resolvedAuthProfile = Array.isArray(authRows) && authRows.length > 0 ? authRows[0] : resolvedAuthProfile
  }

  const authConfig = resolvedAuthProfile?.authConfig ? parseAuthConfig(resolvedAuthProfile.authConfig) : null

  const adapter = resolveConnectorAdapter(connector, resolvedAuthProfile)
  const connectorResult = await adapter.run({
    template,
    target,
    authProfile: resolvedAuthProfile,
    authConfig: authConfig || {},
    params,
  })
  const computed = connectorResult.computed
  const testsTotal = Number(connectorResult.outputs?.testsTotal ?? 0)
  const storiesTotal = Number(connectorResult.outputs?.storiesTotal ?? 0)
  const formula = connectorResult.outputs?.formula || template.formulaTemplate || ''
  const testsJql = connectorResult.outputs?.testsJql || ''
  const storiesJql = connectorResult.outputs?.storiesJql || ''
  const sheetMeta = connectorResult.outputs?.sheetMeta || null
  const sourceMeta = connectorResult.outputs?.sourceMeta || null

  if (connectorResult.measurements?.length) {
    const mappedDestinations = []
    for (const measurement of connectorResult.measurements) {
      const destination = await resolveMeasurementDestination(target, from, to, {
        assignmentId: measurement.assignmentId ?? null,
        scopeKpiId: measurement.scopeKpiId ?? null,
      })
      mappedDestinations.push({
        ...measurement,
        ...destination,
      })
    }
    const insertResult = await insertRun(template.id, target.id, {
      status: 'success',
      triggeredBy: context.triggeredBy,
      message: context.note || 'Ejecución manual',
      outputs: {
        metricType: template.metricType || 'count',
        metricTypeUi: template.metricTypeUi || null,
        testsTotal,
        storiesTotal,
        computed,
        testsJql,
        storiesJql,
        formula,
        sheetMeta,
        sourceMeta,
        mode: context.mode,
        range: { from, to },
        mappingMode: 'row_targets',
        mappedRows: mappedDestinations.length,
        appliedRows: mappedDestinations.filter((row) => !row.shouldSkip && (row.effectiveAssignmentId || row.effectiveScopeKpiId)).length,
        skippedRows: mappedDestinations.filter((row) => row.shouldSkip).length,
        unresolvedRows: mappedDestinations.filter((row) => !row.effectiveAssignmentId && !row.effectiveScopeKpiId).length,
        mappingResultsPreview: mappedDestinations.slice(0, 10).map((row) => ({
          externalKey: row.externalKey || null,
          value: row.value,
          assignmentId: row.effectiveAssignmentId || null,
          scopeKpiId: row.effectiveScopeKpiId || null,
          skipped: row.shouldSkip,
          skipReason: row.skipReason || null,
        })),
      },
    })
    const runId = (insertResult as any).insertId
    for (const row of mappedDestinations) {
      if (row.shouldSkip) continue
      if (row.effectiveAssignmentId) {
        await createMeasurementFromRun(row.effectiveAssignmentId, row.value, runId, context.triggeredBy, row.periodId, row.subPeriodId)
      } else if (row.effectiveScopeKpiId) {
        await createScopeMeasurementFromRun(row.effectiveScopeKpiId, row.value, runId, context.triggeredBy, row.periodId, row.subPeriodId)
      }
    }
    return { runId, computed, mappedRows: mappedDestinations.length }
  }

  const { periodId, subPeriodId, subPeriodName, effectiveAssignmentId, effectiveScopeKpiId, shouldSkip, skipReason } =
    await resolveMeasurementDestination(target, from, to)

  const insertResult = await insertRun(template.id, target.id, {
    status: 'success',
    triggeredBy: context.triggeredBy,
    message: context.note || 'Ejecución manual',
    outputs: {
      metricType: template.metricType || 'count',
      metricTypeUi: template.metricTypeUi || null,
      testsTotal,
      storiesTotal,
      computed,
        testsJql,
        storiesJql,
        formula,
        sheetMeta,
        sourceMeta,
        mode: context.mode,
        periodId,
      subPeriodId,
      scopeKpiId: effectiveScopeKpiId,
      subPeriodName,
      range: { from, to },
      skipped: shouldSkip,
      skipReason,
    },
  })

  const runId = (insertResult as any).insertId
  if (!shouldSkip && effectiveAssignmentId) {
    await createMeasurementFromRun(effectiveAssignmentId, computed, runId, context.triggeredBy, periodId, subPeriodId)
  }
  if (!shouldSkip && effectiveScopeKpiId) {
    await createScopeMeasurementFromRun(effectiveScopeKpiId, computed, runId, context.triggeredBy, periodId, subPeriodId)
  }

  return { runId, computed }
}

export const runTemplateJob = async (context: RunContext) => {
  const [templateRows] = await pool.query<TemplateRow[]>(
    `SELECT * FROM integration_templates WHERE id = ?`,
    [context.templateId]
  )
  if (!Array.isArray(templateRows) || templateRows.length === 0) {
    throw new Error('Plantilla no encontrada')
  }
  const template = templateRows[0]
  if (!template.enabled) {
    return { skipped: true, reason: 'disabled' }
  }

  const [authRows] = await pool.query<AuthProfileRow[]>(
    `SELECT * FROM auth_profiles WHERE id = ?`,
    [template.authProfileId || null]
  )
  const authProfile = Array.isArray(authRows) && authRows.length > 0 ? authRows[0] : null

  const [targets] = await pool.query<TargetRow[]>(
    `SELECT * FROM integration_targets WHERE templateId = ? AND enabled = 1 ${
      context.targetId ? 'AND id = ?' : ''
    }`,
    context.targetId ? [template.id, context.targetId] : [template.id]
  )

  if (!Array.isArray(targets) || targets.length === 0) {
    return { skipped: true, reason: 'no-targets' }
  }

  const results = []
  for (const target of targets) {
    try {
      const result = await executeTemplateTarget(template, target, authProfile, context)
      results.push({ targetId: target.id, ...result })
    } catch (error: any) {
      await insertRun(template.id, target.id, {
        status: 'error',
        triggeredBy: context.triggeredBy,
        message: error?.message || 'Error ejecutando integración',
        error: error?.message || 'Error ejecutando integración',
        outputs: {
          mode: context.mode,
        },
      })
      if ((context.retryCount || 0) < 1 && context.mode === 'scheduled') {
        setTimeout(() => {
          void runTemplateQueued({
            templateId: template.id,
            targetId: target.id,
            triggeredBy: context.triggeredBy,
            mode: 'scheduled',
            note: 'Reintento automático',
            retryCount: (context.retryCount || 0) + 1,
          })
        }, RETRY_DELAY_MS)
      }
    }
  }

  return { results }
}

export const runTemplateQueued = async (context: RunContext) => {
  let result: any
  await runnerQueue.enqueue(async () => {
    result = await runTemplateJob(context)
  })
  return result
}
