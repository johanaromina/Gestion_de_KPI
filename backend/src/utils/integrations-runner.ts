import { pool } from '../config/database'

type AuthProfileRow = {
  id: number
  name: string
  connector: string
  endpoint?: string | null
  authType?: string | null
  authConfig?: string | null
}

type TemplateRow = {
  id: number
  name: string
  connector: string
  metricType?: 'count' | 'ratio' | null
  queryTestsTemplate?: string | null
  queryStoriesTemplate?: string | null
  formulaTemplate?: string | null
  authProfileId?: number | null
  schedule?: string | null
  isSpecific?: number | null
  enabled?: number | null
}

type TargetRow = {
  id: number
  templateId: number
  scopeType: string
  scopeId: string
  params?: string | null
  assignmentId?: number | null
  orgScopeId?: number | null
  enabled?: number | null
}

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

const parseJson = (value: any) => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

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

const formatAuthHeaders = (authType: string | null | undefined, authConfig: any) => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (authType === 'basic') {
    const user = authConfig?.username || ''
    const pass = authConfig?.password || authConfig?.token || ''
    const encoded = Buffer.from(`${user}:${pass}`).toString('base64')
    headers.Authorization = `Basic ${encoded}`
  } else if (authType === 'bearer') {
    if (authConfig?.token) {
      headers.Authorization = `Bearer ${authConfig.token}`
    }
  } else if (authType === 'apiKey') {
    const headerName = authConfig?.header || 'X-API-KEY'
    if (authConfig?.apiKey) {
      headers[headerName] = authConfig.apiKey
    }
  }
  return headers
}

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

const createMeasurementFromRun = async (
  assignmentId: number | null | undefined,
  value: number,
  runId: number,
  triggeredBy?: number | null
) => {
  if (!assignmentId) return
  await pool.query(
    `INSERT INTO kpi_measurements
     (assignmentId, value, mode, status, capturedBy, sourceRunId)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [assignmentId, value, 'auto', 'proposed', triggeredBy || null, String(runId)]
  )
}

const executeJiraQuery = async (endpoint: string, authType: string | null | undefined, authConfig: any, jql: string) => {
  if (!endpoint || !jql) {
    throw new Error('Falta endpoint o JQL en Jira')
  }
  const headers = formatAuthHeaders(authType, authConfig)
  const baseUrl = endpoint.replace(/\/$/, '')
  const url = `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=0`
  const response = await fetch(url, { headers })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Jira error ${response.status}: ${text}`)
  }
  const data = await response.json()
  const total = Number(data?.total ?? 0)
  if (!Number.isFinite(total)) {
    throw new Error('Respuesta de Jira inválida (total)')
  }
  return total
}

const formatValue = (value: any) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'number') return String(item)
        const str = String(item)
        if (str.startsWith('"') && str.endsWith('"')) return str
        if (str.includes(' ')) return `"${str}"`
        return str
      })
      .join(', ')
  }
  return String(value)
}

const renderTemplate = (template: string, params: Record<string, any>) => {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    if (params[key] === undefined || params[key] === null) return ''
    return formatValue(params[key])
  })
}

const resolvePeriodParams = (params: Record<string, any>) => {
  const period = params.period || 'previous_month'
  const now = new Date()
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  let from = startOfThisMonth
  let to = startOfThisMonth
  if (period === 'previous_month') {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    to = startOfThisMonth
  } else if (period === 'current_month') {
    from = startOfThisMonth
    to = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  }
  const toIso = to.toISOString().slice(0, 10)
  const fromIso = from.toISOString().slice(0, 10)
  return { from: fromIso, to: toIso }
}

const mergeParams = (base: any, override: any): any => {
  if (override === null || override === undefined) return base
  if (Array.isArray(override)) {
    return override
  }
  if (typeof override !== 'object') {
    return override
  }
  const result = { ...(base || {}) }
  for (const key of Object.keys(override)) {
    const baseValue = result[key]
    const overrideValue = override[key]
    if (Array.isArray(overrideValue)) {
      result[key] = overrideValue
    } else if (typeof overrideValue === 'object' && overrideValue !== null) {
      result[key] = mergeParams(baseValue || {}, overrideValue)
    } else {
      result[key] = overrideValue
    }
  }
  return result
}

const loadScopeChain = async (scopeId: number) => {
  const chain: any[] = []
  let currentId: number | null = scopeId
  while (currentId) {
    const [rows] = await pool.query<any[]>(
      `SELECT id, name, type, parentId, metadata FROM org_scopes WHERE id = ?`,
      [currentId]
    )
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

const evaluateFormula = (formula: string, values: Record<string, number>) => {
  const expression = formula.replace(/\btests\b/g, String(values.tests)).replace(/\bstories\b/g, String(values.stories))
  if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
    throw new Error('Fórmula inválida')
  }
  // eslint-disable-next-line no-new-func
  const result = Function(`"use strict"; return (${expression});`)()
  return Number(result)
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
  const params = { ...mergedParams, from, to }

  const metricType: 'count' | 'ratio' = template.metricType === 'count' ? 'count' : 'ratio'
  if (!template.queryTestsTemplate) {
    throw new Error('La plantilla no tiene query de tests definida')
  }
  if (metricType === 'ratio' && !template.queryStoriesTemplate) {
    throw new Error('La plantilla ratio requiere query de historias')
  }

  const testsJql = template.queryTestsTemplate
    ? renderTemplate(template.queryTestsTemplate, params)
    : ''
  const storiesJql =
    metricType === 'ratio' && template.queryStoriesTemplate
      ? renderTemplate(template.queryStoriesTemplate, params)
      : ''

  const connector = template.connector || authProfile?.connector || 'jira'
  if (connector !== 'jira' && connector !== 'xray') {
    throw new Error('Connector no soportado en fase 1')
  }

  let resolvedAuthProfile = authProfile
  if (scopeAuthProfileId && (!resolvedAuthProfile || resolvedAuthProfile.id !== scopeAuthProfileId)) {
    const [authRows] = await pool.query<AuthProfileRow[]>(
      `SELECT * FROM auth_profiles WHERE id = ?`,
      [scopeAuthProfileId]
    )
    resolvedAuthProfile = Array.isArray(authRows) && authRows.length > 0 ? authRows[0] : resolvedAuthProfile
  }

  if (!resolvedAuthProfile?.endpoint) {
    throw new Error('Falta endpoint en auth profile')
  }

  const authConfig = parseJson(resolvedAuthProfile.authConfig || null) || {}
  const testsTotal = await executeJiraQuery(
    resolvedAuthProfile.endpoint,
    resolvedAuthProfile.authType,
    authConfig,
    testsJql
  )
  const storiesTotal =
    metricType === 'ratio' && storiesJql
      ? await executeJiraQuery(resolvedAuthProfile.endpoint, resolvedAuthProfile.authType, authConfig, storiesJql)
      : 0
  const formula = template.formulaTemplate || (metricType === 'count' ? 'tests' : 'tests / stories')
  const computed =
    metricType === 'ratio'
      ? storiesTotal > 0
        ? evaluateFormula(formula, { tests: testsTotal, stories: storiesTotal })
        : 0
      : evaluateFormula(formula, { tests: testsTotal, stories: storiesTotal })

  const insertResult = await insertRun(template.id, target.id, {
    status: 'success',
    triggeredBy: context.triggeredBy,
    message: context.note || 'Ejecución manual',
    outputs: {
      metricType,
      testsTotal,
      storiesTotal,
      computed,
      testsJql,
      storiesJql,
      formula,
      mode: context.mode,
    },
  })

  const runId = (insertResult as any).insertId
  await createMeasurementFromRun(target.assignmentId, computed, runId, context.triggeredBy)

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
