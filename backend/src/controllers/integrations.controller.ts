import { Request, Response } from 'express'
import cron from 'node-cron'
import { pool } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import { runTemplateQueued } from '../utils/integrations-runner'
import { decryptSecret, encryptSecret } from '../utils/crypto'

type IntegrationRow = {
  id: number
  name: string
  type: string
  endpoint?: string | null
  assignmentId?: number | null
  jql?: string | null
  jqlTests?: string | null
  jqlStories?: string | null
  authType?: string | null
  authConfig?: string | null
  status?: string | null
  schedule?: string | null
  lastRunAt?: string | null
  lastRunStatus?: string | null
  lastRunMessage?: string | null
  createdAt?: string
  updatedAt?: string
}

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
  schedule?: string | null
  authProfileId?: number | null
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
  enabled?: number | null
}

const parseJson = (value: any) => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const parseAuthConfig = (value: any) => {
  if (!value) return null
  const decrypted = decryptSecret(String(value))
  return parseJson(decrypted)
}

const serializeAuthConfig = (authConfig: any) => {
  if (!authConfig) return null
  return encryptSecret(JSON.stringify(authConfig))
}

const formatAuthHeaders = (authType: string | undefined, authConfig: any) => {
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

const jiraSearch = async (
  endpoint: string,
  authType: string | undefined,
  authConfig: any,
  jql: string
) => {
  const headers = formatAuthHeaders(authType, authConfig || {})
  headers['Content-Type'] = 'application/json'
  const baseUrl = String(endpoint).replace(/\/$/, '')
  const url = `${baseUrl}/rest/api/3/search/approximate-count`
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jql: String(jql),
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

const placeholderRegex = /\{[a-zA-Z0-9_]+\}/g

const getPlaceholders = (text?: string | null) => {
  if (!text) return []
  return text.match(placeholderRegex) || []
}

const computeIsSpecific = (metricType: 'count' | 'ratio', testsTemplate?: string | null, storiesTemplate?: string | null) => {
  const testsPlaceholders = getPlaceholders(testsTemplate)
  const storiesPlaceholders = metricType === 'ratio' ? getPlaceholders(storiesTemplate) : []
  return testsPlaceholders.length === 0 && storiesPlaceholders.length === 0
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
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
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
  return Number(Function(`"use strict"; return (${expression});`)())
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

const getUsersCount = (params: any) => {
  if (!params) return 0
  const users = params.users
  if (Array.isArray(users)) return users.length
  if (typeof users === 'string' && users.trim()) return 1
  return 0
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

export const testIntegrationJql = async (req: Request, res: Response) => {
  try {
    const { endpoint, jql, authType, authConfig } = req.body
    if (!endpoint || !jql) {
      return res.status(400).json({ error: 'endpoint y jql son requeridos' })
    }
    const total = await jiraSearch(endpoint, authType, authConfig || {}, jql)
    res.json({ total })
  } catch (error: any) {
    console.error('Error testing integration JQL:', error)
    res.status(500).json({ error: 'Error al probar JQL' })
  }
}

export const listAuthProfiles = async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<AuthProfileRow[]>(`SELECT * FROM auth_profiles ORDER BY name ASC`)
    const data = Array.isArray(rows)
      ? rows.map((row) => ({
          ...row,
          authConfig: row.authConfig ? parseAuthConfig(row.authConfig) : null,
        }))
      : []
    res.json(data)
  } catch (error: any) {
    console.error('Error fetching auth profiles:', error)
    res.status(500).json({ error: 'Error al obtener auth profiles' })
  }
}

export const createAuthProfile = async (req: Request, res: Response) => {
  try {
    const { name, connector, endpoint, authType, authConfig } = req.body
    if (!name) {
      return res.status(400).json({ error: 'name es requerido' })
    }
    const [result] = await pool.query(
      `INSERT INTO auth_profiles (name, connector, endpoint, authType, authConfig)
       VALUES (?, ?, ?, ?, ?)`,
      [
        name,
        connector || 'jira',
        endpoint || null,
        authType || 'none',
        serializeAuthConfig(authConfig),
      ]
    )
    const insertResult = result as any
    res.status(201).json({ id: insertResult.insertId })
  } catch (error: any) {
    console.error('Error creating auth profile:', error)
    res.status(500).json({ error: 'Error al crear auth profile' })
  }
}

export const updateAuthProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, connector, endpoint, authType, authConfig } = req.body
    await pool.query(
      `UPDATE auth_profiles SET name = ?, connector = ?, endpoint = ?, authType = ?, authConfig = ? WHERE id = ?`,
      [
        name,
        connector || 'jira',
        endpoint || null,
        authType || 'none',
        serializeAuthConfig(authConfig),
        id,
      ]
    )
    res.json({ message: 'Auth profile actualizado' })
  } catch (error: any) {
    console.error('Error updating auth profile:', error)
    res.status(500).json({ error: 'Error al actualizar auth profile' })
  }
}

export const listTemplates = async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT t.*, ap.name as authProfileName
       FROM integration_templates t
       LEFT JOIN auth_profiles ap ON ap.id = t.authProfileId
       ORDER BY t.name ASC`
    )
    res.json(rows)
  } catch (error: any) {
    console.error('Error fetching templates:', error)
    res.status(500).json({ error: 'Error al obtener plantillas' })
  }
}

export const createTemplate = async (req: Request, res: Response) => {
  try {
    const {
      name,
      connector,
      metricType,
      metricTypeUi,
      queryTestsTemplate,
      queryStoriesTemplate,
      formulaTemplate,
      schedule,
      authProfileId,
      enabled,
    } = req.body
    if (!name) {
      return res.status(400).json({ error: 'name es requerido' })
    }
    if (schedule && !cron.validate(schedule)) {
      return res.status(400).json({ error: 'Cron inválido' })
    }
    const resolvedMetricType: 'count' | 'ratio' = metricType === 'count' ? 'count' : 'ratio'
    const isSpecific = computeIsSpecific(resolvedMetricType, queryTestsTemplate, queryStoriesTemplate)
    const [result] = await pool.query(
      `INSERT INTO integration_templates
       (name, connector, metricType, metricTypeUi, queryTestsTemplate, queryStoriesTemplate, formulaTemplate, schedule, authProfileId, isSpecific, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        connector || 'jira',
        resolvedMetricType,
        metricTypeUi || null,
        queryTestsTemplate || null,
        resolvedMetricType === 'ratio' ? queryStoriesTemplate || null : null,
        formulaTemplate || null,
        schedule || null,
        authProfileId || null,
        isSpecific ? 1 : 0,
        enabled ? 1 : 0,
      ]
    )
    const insertResult = result as any
    res.status(201).json({ id: insertResult.insertId })
  } catch (error: any) {
    console.error('Error creating template:', error)
    res.status(500).json({ error: 'Error al crear plantilla' })
  }
}

export const updateTemplate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const {
      name,
      connector,
      metricType,
      metricTypeUi,
      queryTestsTemplate,
      queryStoriesTemplate,
      formulaTemplate,
      schedule,
      authProfileId,
      enabled,
    } = req.body
    if (schedule && !cron.validate(schedule)) {
      return res.status(400).json({ error: 'Cron inválido' })
    }
    const resolvedMetricType: 'count' | 'ratio' = metricType === 'count' ? 'count' : 'ratio'
    const isSpecific = computeIsSpecific(resolvedMetricType, queryTestsTemplate, queryStoriesTemplate)
    await pool.query(
      `UPDATE integration_templates
       SET name = ?, connector = ?, metricType = ?, metricTypeUi = ?, queryTestsTemplate = ?, queryStoriesTemplate = ?, formulaTemplate = ?, schedule = ?, authProfileId = ?, isSpecific = ?, enabled = ?
       WHERE id = ?`,
      [
        name,
        connector || 'jira',
        resolvedMetricType,
        metricTypeUi || null,
        queryTestsTemplate || null,
        resolvedMetricType === 'ratio' ? queryStoriesTemplate || null : null,
        formulaTemplate || null,
        schedule || null,
        authProfileId || null,
        isSpecific ? 1 : 0,
        enabled ? 1 : 0,
        id,
      ]
    )
    res.json({ message: 'Plantilla actualizada' })
  } catch (error: any) {
    console.error('Error updating template:', error)
    res.status(500).json({ error: 'Error al actualizar plantilla' })
  }
}

export const listTargets = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.query
    const params: any[] = []
    let query = `SELECT t.*, ck.collaboratorId, ck.kpiId, ck.periodId,
                        os.name as orgScopeName, os.type as orgScopeType
                 FROM integration_targets t
                 LEFT JOIN collaborator_kpis ck ON ck.id = t.assignmentId
                 LEFT JOIN org_scopes os ON os.id = t.orgScopeId
                 WHERE 1=1`
    if (templateId) {
      query += ' AND t.templateId = ?'
      params.push(templateId)
    }
    query += ' ORDER BY t.createdAt DESC'
    const [rows] = await pool.query(query, params)
    const data = Array.isArray(rows)
      ? rows.map((row: any) => ({
          ...row,
          params: row.params ? parseJson(row.params) : null,
        }))
      : []
    res.json(data)
  } catch (error: any) {
    console.error('Error fetching targets:', error)
    res.status(500).json({ error: 'Error al obtener targets' })
  }
}

export const createTarget = async (req: Request, res: Response) => {
  try {
    const { templateId, scopeType, scopeId, orgScopeId, params, assignmentId, enabled } = req.body
    if (!templateId || (!scopeId && !orgScopeId)) {
      return res.status(400).json({ error: 'templateId y scopeId/orgScopeId son requeridos' })
    }
    const usersCount = getUsersCount(params)
    if (assignmentId && usersCount > 1) {
      return res.status(400).json({
        error: 'Target con multiples users no puede asignarse a un KPI individual. Usa un target por persona o quita la asignacion.',
      })
    }
    const [result] = await pool.query(
      `INSERT INTO integration_targets
       (templateId, scopeType, scopeId, orgScopeId, params, assignmentId, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        templateId,
        scopeType || 'area',
        scopeId,
        orgScopeId || null,
        params ? JSON.stringify(params) : null,
        assignmentId || null,
        enabled ? 1 : 0,
      ]
    )
    const insertResult = result as any
    res.status(201).json({ id: insertResult.insertId })
  } catch (error: any) {
    console.error('Error creating target:', error)
    res.status(500).json({ error: 'Error al crear target' })
  }
}

export const updateTarget = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { templateId, scopeType, scopeId, orgScopeId, params, assignmentId, enabled } = req.body
    const usersCount = getUsersCount(params)
    if (assignmentId && usersCount > 1) {
      return res.status(400).json({
        error: 'Target con multiples users no puede asignarse a un KPI individual. Usa un target por persona o quita la asignacion.',
      })
    }
    await pool.query(
      `UPDATE integration_targets
       SET templateId = ?, scopeType = ?, scopeId = ?, orgScopeId = ?, params = ?, assignmentId = ?, enabled = ?
       WHERE id = ?`,
      [
        templateId,
        scopeType || 'area',
        scopeId,
        orgScopeId || null,
        params ? JSON.stringify(params) : null,
        assignmentId || null,
        enabled ? 1 : 0,
        id,
      ]
    )
    res.json({ message: 'Target actualizado' })
  } catch (error: any) {
    console.error('Error updating target:', error)
    res.status(500).json({ error: 'Error al actualizar target' })
  }
}

export const listTemplateRuns = async (req: Request, res: Response) => {
  try {
    const { templateId, targetId } = req.query
    const includeArchived =
      String(req.query.includeArchived || '').toLowerCase() === 'true' || String(req.query.includeArchived) === '1'
    const params: any[] = []
    let query = `SELECT r.*, c.name as triggeredByName
                 FROM integration_template_runs r
                 LEFT JOIN collaborators c ON r.triggeredBy = c.id
                 WHERE 1=1`
    if (templateId) {
      query += ' AND r.templateId = ?'
      params.push(templateId)
    }
    if (targetId) {
      query += ' AND r.targetId = ?'
      params.push(targetId)
    }
    if (!includeArchived) {
      query += ' AND (r.archived IS NULL OR r.archived = 0)'
    }
    query += ' ORDER BY r.startedAt DESC'
    const [rows] = await pool.query(query, params)
    const data = Array.isArray(rows)
      ? rows.map((row) => ({
          ...row,
          outputs: row.outputs ? parseJson(row.outputs) : null,
        }))
      : []
    res.json(data)
  } catch (error: any) {
    console.error('Error fetching template runs:', error)
    res.status(500).json({ error: 'Error al obtener ejecuciones' })
  }
}

export const archiveRun = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    await pool.query(`UPDATE integration_template_runs SET archived = 1 WHERE id = ?`, [id])
    res.json({ message: 'Run archivado' })
  } catch (error: any) {
    console.error('Error archiving run:', error)
    res.status(500).json({ error: 'Error al archivar run' })
  }
}

export const deleteRun = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    await pool.query(`DELETE FROM integration_template_runs WHERE id = ?`, [id])
    res.json({ message: 'Run eliminado' })
  } catch (error: any) {
    console.error('Error deleting run:', error)
    res.status(500).json({ error: 'Error al eliminar run' })
  }
}

export const archiveRuns = async (req: Request, res: Response) => {
  try {
    const { templateId, targetId, status } = req.body || {}
    if (!templateId) {
      return res.status(400).json({ error: 'templateId es requerido' })
    }
    const params: any[] = [templateId]
    let query = `UPDATE integration_template_runs SET archived = 1 WHERE templateId = ?`
    if (targetId) {
      query += ' AND targetId = ?'
      params.push(targetId)
    }
    if (status) {
      query += ' AND status = ?'
      params.push(status)
    }
    const [result] = await pool.query(query, params)
    res.json({ message: 'Runs archivados', result })
  } catch (error: any) {
    console.error('Error archiving runs:', error)
    res.status(500).json({ error: 'Error al archivar runs' })
  }
}

export const deleteRuns = async (req: Request, res: Response) => {
  try {
    const { templateId, targetId, status } = req.body || {}
    if (!templateId) {
      return res.status(400).json({ error: 'templateId es requerido' })
    }
    const params: any[] = [templateId]
    let query = `DELETE FROM integration_template_runs WHERE templateId = ?`
    if (targetId) {
      query += ' AND targetId = ?'
      params.push(targetId)
    }
    if (status) {
      query += ' AND status = ?'
      params.push(status)
    }
    const [result] = await pool.query(query, params)
    res.json({ message: 'Runs eliminados', result })
  } catch (error: any) {
    console.error('Error deleting runs:', error)
    res.status(500).json({ error: 'Error al eliminar runs' })
  }
}

export const runTemplate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { targetId } = req.body
    const userId = (req as AuthRequest).user?.id || null
    const result = await runTemplateQueued({
      templateId: Number(id),
      targetId: targetId ? Number(targetId) : undefined,
      triggeredBy: userId,
      mode: 'manual',
      note: 'Ejecución manual',
    })
    res.json({ message: 'Plantilla ejecutada', result })
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Error al ejecutar plantilla' })
  }
}

export const runTarget = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const userId = (req as AuthRequest).user?.id || null

    const [targetRows] = await pool.query<any[]>(`SELECT * FROM integration_targets WHERE id = ?`, [id])
    if (!Array.isArray(targetRows) || targetRows.length === 0) {
      return res.status(404).json({ error: 'Target no encontrado' })
    }
    const target = targetRows[0]

    const result = await runTemplateQueued({
      templateId: Number(target.templateId),
      targetId: Number(target.id),
      triggeredBy: userId,
      mode: 'manual',
      note: 'Ejecucion manual por target',
    })

    res.json({ message: 'Target ejecutado', result })
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Error al ejecutar target' })
  }
}

export const testTemplate = async (req: Request, res: Response) => {
  try {
    const {
      endpoint,
      authType,
      authConfig,
      metricType,
      queryTestsTemplate,
      queryStoriesTemplate,
      params,
      formulaTemplate,
      targetId,
      templateId,
      includeRaw,
    } = req.body

    let resolvedEndpoint = endpoint
    let resolvedAuthType = authType
    let resolvedAuthConfig = authConfig
    let resolvedTestsTemplate = queryTestsTemplate
    let resolvedStoriesTemplate = queryStoriesTemplate
    let resolvedFormula = formulaTemplate
    let resolvedMetricType: 'count' | 'ratio' = metricType === 'count' ? 'count' : 'ratio'

    if (templateId) {
      const [templateRows] = await pool.query<any[]>(`SELECT * FROM integration_templates WHERE id = ?`, [templateId])
      if (!Array.isArray(templateRows) || templateRows.length === 0) {
        return res.status(404).json({ error: 'Plantilla no encontrada' })
      }
      const template = templateRows[0]
      resolvedMetricType = template.metricType === 'count' ? 'count' : 'ratio'
      resolvedTestsTemplate = template.queryTestsTemplate
      resolvedStoriesTemplate = template.queryStoriesTemplate
      resolvedFormula = template.formulaTemplate
      if (template.authProfileId) {
        const [authRows] = await pool.query<any[]>(`SELECT * FROM auth_profiles WHERE id = ?`, [template.authProfileId])
        if (Array.isArray(authRows) && authRows.length > 0) {
          const authProfile = authRows[0]
          resolvedEndpoint = authProfile.endpoint
          resolvedAuthType = authProfile.authType
          resolvedAuthConfig = authProfile.authConfig ? parseAuthConfig(authProfile.authConfig) : null
        }
      }
    }

    if (!resolvedEndpoint || !resolvedTestsTemplate) {
      return res.status(400).json({ error: 'endpoint y queryTestsTemplate son requeridos' })
    }
    if (resolvedMetricType === 'ratio' && !resolvedStoriesTemplate) {
      return res.status(400).json({ error: 'queryStoriesTemplate es requerido para metricType ratio' })
    }

    let baseParams: Record<string, any> = {}
    let scopeAuthProfileId: number | null = null
    if (targetId) {
      const [targetRows] = await pool.query<any[]>(`SELECT * FROM integration_targets WHERE id = ?`, [targetId])
      if (Array.isArray(targetRows) && targetRows.length > 0) {
        const target = targetRows[0]
        if (target.orgScopeId) {
          const chain = await loadScopeChain(Number(target.orgScopeId))
          for (const scope of chain) {
            if (scope?.metadata) {
              baseParams = mergeParams(baseParams, scope.metadata)
              if (scope.metadata?.authProfileId) {
                scopeAuthProfileId = Number(scope.metadata.authProfileId)
              }
            }
          }
        }
        baseParams = mergeParams(baseParams, target.params ? parseJson(target.params) : {})
      }
    }
    baseParams = mergeParams(baseParams, params || {})

    if (scopeAuthProfileId) {
      const [authRows] = await pool.query<any[]>(`SELECT * FROM auth_profiles WHERE id = ?`, [scopeAuthProfileId])
      if (Array.isArray(authRows) && authRows.length > 0) {
        const authProfile = authRows[0]
        resolvedEndpoint = authProfile.endpoint
        resolvedAuthType = authProfile.authType
        resolvedAuthConfig = authProfile.authConfig ? parseAuthConfig(authProfile.authConfig) : null
      }
    }

    const { from, to } = resolvePeriodParams(baseParams)
    const renderParams = { ...baseParams, from, to }
    const testsJql = renderTemplate(resolvedTestsTemplate, renderParams)
    const storiesJql = resolvedMetricType === 'ratio' && resolvedStoriesTemplate
      ? renderTemplate(resolvedStoriesTemplate, renderParams)
      : ''
    const warnings: string[] = []
    if (testsJql.includes('{') || testsJql.includes('}')) {
      warnings.push('JQL Tests contiene placeholders sin resolver')
    }
    if (resolvedMetricType === 'ratio' && storiesJql && (storiesJql.includes('{') || storiesJql.includes('}'))) {
      warnings.push('JQL Historias contiene placeholders sin resolver')
    }

    const testsTotal = await jiraSearch(resolvedEndpoint, resolvedAuthType, resolvedAuthConfig || {}, testsJql)
    let storiesJson: any = null
    let storiesTotal = 0
    if (resolvedMetricType === 'ratio' && storiesJql) {
      storiesTotal = await jiraSearch(resolvedEndpoint, resolvedAuthType, resolvedAuthConfig || {}, storiesJql)
    }

    const formula = resolvedFormula || (resolvedMetricType === 'count' ? 'tests' : 'tests / stories')
    const computed =
      resolvedMetricType === 'ratio'
        ? storiesTotal > 0
          ? evaluateFormula(formula, { tests: testsTotal, stories: storiesTotal })
          : 0
        : evaluateFormula(formula, { tests: testsTotal, stories: storiesTotal })

    const user = (req as AuthRequest).user
    const allowRaw = Boolean(
      includeRaw &&
        (user?.hasSuperpowers ||
          user?.permissions?.includes('config.manage') ||
          user?.permissions?.includes('curation_review'))
    )

    res.json({
      metricType: resolvedMetricType,
      testsTotal,
      storiesTotal,
      computed,
      testsJql,
      storiesJql,
      from,
      to,
      warnings,
      raw: allowRaw ? { tests: testsTotal, stories: storiesTotal } : undefined,
    })
  } catch (error: any) {
    console.error('Error testing template:', error)
    res.status(500).json({ error: error?.message || 'Error al probar template' })
  }
}

export const getNextCronRun = async (req: Request, res: Response) => {
  try {
    const { expression } = req.query
    const expr = String(expression || '').trim()
    if (!expr) {
      return res.status(400).json({ error: 'expression es requerido' })
    }
    if (!cron.validate(expr)) {
      return res.status(400).json({ error: 'Cron inválido' })
    }
    const task = cron.schedule(expr, () => {})
    const next = (task as any)?.nextDates?.()?.toDate?.() || null
    task.stop()
    res.json({ nextRun: next ? next.toISOString() : null })
  } catch (error: any) {
    console.error('Error computing cron next run:', error)
    res.status(500).json({ error: 'Error al calcular próxima ejecución' })
  }
}

export const listIntegrations = async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<IntegrationRow[]>(
      `SELECT * FROM integrations ORDER BY name ASC`
    )
    const data = Array.isArray(rows)
      ? rows.map((row) => ({
          ...row,
          authConfig: row.authConfig ? parseAuthConfig(row.authConfig) : null,
        }))
      : []
    res.json(data)
  } catch (error: any) {
    console.error('Error fetching integrations:', error)
    res.status(500).json({ error: 'Error al obtener integraciones' })
  }
}

export const getIntegrationById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query<IntegrationRow[]>(
      `SELECT * FROM integrations WHERE id = ?`,
      [id]
    )
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'Integración no encontrada' })
    }
    const row = rows[0]
    res.json({
      ...row,
      authConfig: row.authConfig ? parseAuthConfig(row.authConfig) : null,
    })
  } catch (error: any) {
    console.error('Error fetching integration:', error)
    res.status(500).json({ error: 'Error al obtener integración' })
  }
}

export const createIntegration = async (req: Request, res: Response) => {
  try {
    const { name, type, endpoint, assignmentId, jql, jqlTests, jqlStories, authType, authConfig, status, schedule } =
      req.body
    if (!name || !type) {
      return res.status(400).json({ error: 'name y type son requeridos' })
    }

    const [result] = await pool.query(
      `INSERT INTO integrations
       (name, type, endpoint, assignmentId, jql, jqlTests, jqlStories, authType, authConfig, status, schedule)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        type,
        endpoint || null,
        assignmentId || null,
        jql || null,
        jqlTests || null,
        jqlStories || null,
        authType || 'none',
        serializeAuthConfig(authConfig),
        status || 'inactive',
        schedule || null,
      ]
    )

    const insertResult = result as any
    res.status(201).json({ id: insertResult.insertId })
  } catch (error: any) {
    console.error('Error creating integration:', error)
    res.status(500).json({ error: 'Error al crear integración' })
  }
}

export const updateIntegration = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, type, endpoint, assignmentId, jql, jqlTests, jqlStories, authType, authConfig, status, schedule } =
      req.body

    await pool.query(
      `UPDATE integrations
       SET name = ?, type = ?, endpoint = ?, assignmentId = ?, jql = ?, jqlTests = ?, jqlStories = ?, authType = ?, authConfig = ?, status = ?, schedule = ?
       WHERE id = ?`,
      [
        name,
        type,
        endpoint || null,
        assignmentId || null,
        jql || null,
        jqlTests || null,
        jqlStories || null,
        authType || 'none',
        serializeAuthConfig(authConfig),
        status || 'inactive',
        schedule || null,
        id,
      ]
    )

    res.json({ message: 'Integración actualizada' })
  } catch (error: any) {
    console.error('Error updating integration:', error)
    res.status(500).json({ error: 'Error al actualizar integración' })
  }
}

export const updateIntegrationStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { status } = req.body
    if (!status) {
      return res.status(400).json({ error: 'status es requerido' })
    }
    await pool.query(`UPDATE integrations SET status = ? WHERE id = ?`, [status, id])
    res.json({ message: 'Estado actualizado' })
  } catch (error: any) {
    console.error('Error updating integration status:', error)
    res.status(500).json({ error: 'Error al actualizar estado' })
  }
}

export const runIntegration = async (req: Request, res: Response) => {
  try {
    return res.status(410).json({
      error: 'Endpoint de integraciones legacy deshabilitado. Usa /integrations/templates/:id/run',
    })
  } catch (error: any) {
    console.error('Error running integration:', error)
    res.status(500).json({ error: 'Error al ejecutar integración' })
  }
}

export const listIntegrationRuns = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { limit } = req.query
    const params: any[] = [id]
    let query = `SELECT r.*, c.name as triggeredByName
                 FROM integration_runs r
                 LEFT JOIN collaborators c ON r.triggeredBy = c.id
                 WHERE r.integrationId = ?
                 ORDER BY r.startedAt DESC`
    if (limit) {
      query += ' LIMIT ?'
      params.push(Number(limit))
    }

    const [rows] = await pool.query<any[]>(query, params)
    const data = Array.isArray(rows)
      ? rows.map((row) => ({
          ...row,
          meta: row.meta ? parseJson(row.meta) : null,
        }))
      : []
    res.json(data)
  } catch (error: any) {
    console.error('Error fetching integration runs:', error)
    res.status(500).json({ error: 'Error al obtener ejecuciones' })
  }
}
