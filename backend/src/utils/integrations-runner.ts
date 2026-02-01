import { pool } from '../config/database'
import { decryptSecret } from './crypto'

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
  metricTypeUi?: string | null
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

const parseAuthConfig = (value: any) => {
  if (!value) return null
  const decrypted = decryptSecret(String(value))
  return parseJson(decrypted)
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

const hasMeasurementForSubPeriod = async (assignmentId: number, subPeriodId: number | null) => {
  if (!subPeriodId) return false
  const [rows] = await pool.query<any[]>(
    `SELECT id FROM kpi_measurements
     WHERE assignmentId = ? AND subPeriodId = ? AND status IN ('approved','proposed') LIMIT 1`,
    [assignmentId, subPeriodId]
  )
  return Array.isArray(rows) && rows.length > 0
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
  await pool.query(
    `INSERT INTO kpi_measurements
     (assignmentId, periodId, subPeriodId, value, mode, status, capturedBy, sourceRunId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [assignmentId, periodId || null, subPeriodId || null, value, 'auto', 'proposed', triggeredBy || null, String(runId)]
  )
}

const executeJiraQuery = async (endpoint: string, authType: string | null | undefined, authConfig: any, jql: string) => {
  if (!endpoint || !jql) {
    throw new Error('Falta endpoint o JQL en Jira')
  }
  const headers = {
    ...formatAuthHeaders(authType, authConfig),
    'Content-Type': 'application/json',
  }
  const baseUrl = endpoint.replace(/\/$/, '')
  const url = `${baseUrl}/rest/api/3/search/approximate-count`
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jql,
    }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Jira error ${response.status}: ${text}`)
  }
  const data = await response.json()
  const total = Number(data?.count ?? 0)
  if (!Number.isFinite(total)) {
    throw new Error('Respuesta de Jira inválida (count)')
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

const formatPeriodValue = (from: string, format: string) => {
  if (!from) return ''
  if (format === 'YYYY-MM-DD') return from
  if (format === 'YYYY-MM') return from.slice(0, 7)
  return from
}

const toNumber = (value: any) => {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const findColumnIndex = (header: any[], column: any) => {
  if (column === null || column === undefined || column === '') return null
  if (typeof column === 'number') return column
  const numeric = Number(column)
  if (Number.isFinite(numeric) && String(column).trim() !== '') {
    return numeric
  }
  const headerIndex = header.findIndex(
    (cell) => String(cell).trim().toLowerCase() === String(column).trim().toLowerCase()
  )
  return headerIndex >= 0 ? headerIndex : null
}

const matchValue = (value: any, expected: any) => {
  if (expected === null || expected === undefined || expected === '') return true
  return String(value).trim().toLowerCase() === String(expected).trim().toLowerCase()
}

const executeSheetsQuery = async (
  endpoint: string | null | undefined,
  authType: string | null | undefined,
  authConfig: any,
  params: Record<string, any>
) => {
  const sheetKey = params.sheetKey || params.spreadsheetId
  const range = params.range || params.tab
  if (!sheetKey || !range) {
    throw new Error('Falta sheetKey o rango (tab/range) en params de Sheets')
  }
  const baseUrl = (endpoint || 'https://sheets.googleapis.com').replace(/\/$/, '')
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (authType === 'bearer' && authConfig?.token) {
    headers.Authorization = `Bearer ${authConfig.token}`
  }
  const queryParams = new URLSearchParams({
    majorDimension: 'ROWS',
    valueRenderOption: 'UNFORMATTED_VALUE',
  })
  if (authType === 'apiKey' && authConfig?.apiKey) {
    queryParams.set('key', authConfig.apiKey)
  }
  const url = `${baseUrl}/v4/spreadsheets/${encodeURIComponent(sheetKey)}/values/${encodeURIComponent(
    range
  )}?${queryParams.toString()}`
  const response = await fetch(url, { headers })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Sheets error ${response.status}: ${text}`)
  }
  const data = await response.json()
  const values: any[] = Array.isArray(data?.values) ? data.values : []
  if (values.length === 0) {
    return { values: [], headers: [], rows: [] }
  }
  const headerRow = values[0]
  const rows = values.slice(1)
  return { values, headers: headerRow, rows }
}

const computeSheetsValue = (
  template: TemplateRow,
  params: Record<string, any>,
  sheetData: { headers: any[]; rows: any[] }
) => {
  const headers = sheetData.headers || []
  const rows = sheetData.rows || []
  const periodFormat = params.periodFormat || 'YYYY-MM'
  const periodValue =
    params.periodValue ||
    params.periodLabel ||
    params.periodName ||
    formatPeriodValue(params.from, periodFormat)
  const areaValue = params.areaValue || params.area
  const kpiValue = params.kpiValue || params.kpi
  const periodColumn = params.periodColumn
  const areaColumn = params.areaColumn
  const kpiColumn = params.kpiColumn
  const valueColumn = params.valueColumn || params.value

  const periodIdx = findColumnIndex(headers, periodColumn)
  const areaIdx = findColumnIndex(headers, areaColumn)
  const kpiIdx = findColumnIndex(headers, kpiColumn)
  const valueIdx = findColumnIndex(headers, valueColumn)

  if (valueIdx === null || valueIdx === undefined) {
    throw new Error('No se pudo resolver valueColumn en Sheets')
  }

  const matched = rows.filter((row) => {
    const periodCell = periodIdx !== null ? row[periodIdx] : null
    const areaCell = areaIdx !== null ? row[areaIdx] : null
    const kpiCell = kpiIdx !== null ? row[kpiIdx] : null
    return matchValue(periodCell, periodValue) && matchValue(areaCell, areaValue) && matchValue(kpiCell, kpiValue)
  })

  const values = matched.map((row) => toNumber(row[valueIdx])).filter((val) => val !== null) as number[]

  const metricUi = template.metricTypeUi || ''
  if (metricUi === 'value_agg') {
    const agg = String(params.aggregation || 'SUM').toUpperCase()
    if (values.length === 0) return { computed: 0, matchedRows: matched.length, values }
    if (agg === 'AVG') {
      const sum = values.reduce((acc, val) => acc + val, 0)
      return { computed: sum / values.length, matchedRows: matched.length, values }
    }
    if (agg === 'MAX') return { computed: Math.max(...values), matchedRows: matched.length, values }
    if (agg === 'MIN') return { computed: Math.min(...values), matchedRows: matched.length, values }
    const sum = values.reduce((acc, val) => acc + val, 0)
    return { computed: sum, matchedRows: matched.length, values }
  }

  const computed = values.length > 0 ? values[0] : 0
  return { computed, matchedRows: matched.length, values }
}

const resolveSubPeriodId = async (periodId: number | null, from: string, to: string) => {
  if (!periodId || !from || !to) return null
  const toDate = new Date(to)
  const endDate = new Date(toDate)
  endDate.setDate(endDate.getDate() - 1)
  const endIso = endDate.toISOString().slice(0, 10)
  const [rows] = await pool.query<any[]>(
    `SELECT id FROM calendar_subperiods
     WHERE periodId = ? AND startDate = ? AND endDate = ?
     LIMIT 1`,
    [periodId, from, endIso]
  )
  if (Array.isArray(rows) && rows.length > 0) {
    return rows[0].id
  }
  const [fallback] = await pool.query<any[]>(
    `SELECT id FROM calendar_subperiods
     WHERE periodId = ? AND startDate <= ? AND endDate >= ?
     LIMIT 1`,
    [periodId, from, endIso]
  )
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
  const normalized = formula.trim().toLowerCase()
  if (normalized === 'count' || normalized === 'tests' || normalized === 'a') {
    return Number(values.tests)
  }
  if (normalized === 'stories' || normalized === 'b') {
    return Number(values.stories)
  }
  const expression = normalized
    .replace(/\btests\b/g, String(values.tests))
    .replace(/\bstories\b/g, String(values.stories))
    .replace(/\ba\b/g, String(values.tests))
    .replace(/\bb\b/g, String(values.stories))
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

  let testsTotal = 0
  let storiesTotal = 0
  let computed = 0
  let formula = template.formulaTemplate || ''
  let testsJql = ''
  let storiesJql = ''
  let sheetMeta: any = null

  if (connector === 'sheets') {
    const sheetData = await executeSheetsQuery(
      resolvedAuthProfile?.endpoint || null,
      resolvedAuthProfile?.authType || null,
      authConfig || {},
      params
    )
    const sheetResult = computeSheetsValue(template, params, sheetData)
    computed = sheetResult.computed
    sheetMeta = {
      sheetKey: params.sheetKey || params.spreadsheetId,
      tab: params.tab || params.range,
      matchedRows: sheetResult.matchedRows,
      values: sheetResult.values,
      periodValue: params.periodValue || params.periodLabel || params.periodName || formatPeriodValue(params.from, params.periodFormat || 'YYYY-MM'),
    }
    formula = template.formulaTemplate || (template.metricTypeUi === 'value_agg' ? 'AGG' : 'VALUE')
  } else if (connector === 'jira' || connector === 'xray') {
    const metricType: 'count' | 'ratio' = template.metricType === 'count' ? 'count' : 'ratio'
    if (!template.queryTestsTemplate) {
      throw new Error('La plantilla no tiene query de tests definida')
    }
    if (metricType === 'ratio' && !template.queryStoriesTemplate) {
      throw new Error('La plantilla ratio requiere query de historias')
    }

    testsJql = template.queryTestsTemplate ? renderTemplate(template.queryTestsTemplate, params) : ''
    storiesJql =
      metricType === 'ratio' && template.queryStoriesTemplate
        ? renderTemplate(template.queryStoriesTemplate, params)
        : ''

    if (!resolvedAuthProfile?.endpoint) {
      throw new Error('Falta endpoint en auth profile')
    }

    const auth = authConfig || {}
    testsTotal = await executeJiraQuery(resolvedAuthProfile.endpoint, resolvedAuthProfile.authType, auth, testsJql)
    storiesTotal =
      metricType === 'ratio' && storiesJql
        ? await executeJiraQuery(resolvedAuthProfile.endpoint, resolvedAuthProfile.authType, auth, storiesJql)
        : 0
    formula = template.formulaTemplate || (metricType === 'count' ? 'tests' : 'tests / stories')
    computed =
      metricType === 'ratio'
        ? storiesTotal > 0
          ? evaluateFormula(formula, { tests: testsTotal, stories: storiesTotal })
          : 0
        : evaluateFormula(formula, { tests: testsTotal, stories: storiesTotal })
  } else {
    throw new Error('Connector no soportado')
  }

  let periodId: number | null = null
  let subPeriodId: number | null = null
  if (target.assignmentId) {
    const [assignmentRows] = await pool.query<any[]>(
      `SELECT periodId, subPeriodId FROM collaborator_kpis WHERE id = ? LIMIT 1`,
      [target.assignmentId]
    )
    if (Array.isArray(assignmentRows) && assignmentRows.length > 0) {
      periodId = assignmentRows[0].periodId || null
      subPeriodId = assignmentRows[0].subPeriodId || null
    }
  }
  if (target.assignmentId && periodId && !subPeriodId) {
    subPeriodId = await resolveSubPeriodId(periodId, from, to)
  }
  const subPeriodName = await resolveSubPeriodName(subPeriodId)
  const shouldSkip = target.assignmentId
    ? await hasMeasurementForSubPeriod(target.assignmentId, subPeriodId)
    : false
  const skipReason = shouldSkip ? 'Subperiodo ya tiene medicion propuesta/aprobada' : null

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
      mode: context.mode,
      periodId,
      subPeriodId,
      subPeriodName,
      range: { from, to },
      skipped: shouldSkip,
      skipReason,
    },
  })

  const runId = (insertResult as any).insertId
  if (!shouldSkip) {
    await createMeasurementFromRun(target.assignmentId, computed, runId, context.triggeredBy, periodId, subPeriodId)
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
