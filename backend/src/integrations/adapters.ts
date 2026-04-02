import { decryptSecret } from '../utils/crypto'
import { computeSheetsValue, formatPeriodValue } from './sheets'
import { AuthProfileRow, ConnectorAdapter, ConnectorAdapterContext, ConnectorAdapterResult, TemplateRow } from './types'

export const parseJson = (value: any) => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export const parseAuthConfig = (value: any) => {
  if (!value) return null
  const decrypted = decryptSecret(String(value))
  return parseJson(decrypted)
}

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

export const resolvePeriodParams = (params: Record<string, any>) => {
  const period = params.period || 'previous_month'
  const now = new Date()
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  let from = startOfThisMonth
  let to = startOfThisMonth
  if (period === 'custom') {
    const customFrom = params.from ? new Date(params.from) : null
    const customTo = params.to ? new Date(params.to) : null
    if (customFrom && !Number.isNaN(customFrom.getTime()) && customTo && !Number.isNaN(customTo.getTime())) {
      from = customFrom
      to = customTo
    } else {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      to = startOfThisMonth
    }
  } else if (period === 'previous_month') {
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

export const mergeParams = (base: any, override: any): any => {
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

const getByPath = (value: any, path: string | null | undefined) => {
  if (!path) return value
  const tokens = String(path)
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((token) => token.trim())
    .filter(Boolean)
  let current = value
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined
    current = current[token]
  }
  return current
}

const buildRequestUrl = (endpoint: string | null | undefined, params: Record<string, any>) => {
  const rawUrl = params.url || params.path || ''
  if (!rawUrl && !endpoint) {
    throw new Error('generic_api requiere url o endpoint base')
  }

  const isAbsolute = /^https?:\/\//i.test(String(rawUrl || ''))
  const base = String(endpoint || '').replace(/\/$/, '')
  const path = String(rawUrl || '').replace(/^\//, '')
  const url = isAbsolute ? String(rawUrl) : rawUrl ? `${base}/${path}` : base

  const query = params.query && typeof params.query === 'object' ? params.query : null
  if (!query) return url

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue
    if (Array.isArray(value)) {
      value.forEach((entry) => search.append(key, String(entry)))
      continue
    }
    search.set(key, String(value))
  }
  const queryString = search.toString()
  if (!queryString) return url
  return `${url}${url.includes('?') ? '&' : '?'}${queryString}`
}

const normalizeAggregation = (aggregation: any, metricTypeUi: string | null | undefined) => {
  const fallback = metricTypeUi === 'value_agg' ? 'SUM' : 'FIRST'
  return String(aggregation || fallback).trim().toUpperCase()
}

const computeAggregatedValue = (values: number[], aggregation: string) => {
  if (!values.length) return 0
  if (aggregation === 'AVG') return values.reduce((acc, value) => acc + value, 0) / values.length
  if (aggregation === 'MAX') return Math.max(...values)
  if (aggregation === 'MIN') return Math.min(...values)
  if (aggregation === 'COUNT') return values.length
  if (aggregation === 'FIRST') return values[0]
  return values.reduce((acc, value) => acc + value, 0)
}

const appendQueryParams = (url: string, query: any) => {
  if (!query || typeof query !== 'object') return url
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue
    if (Array.isArray(value)) {
      value.forEach((entry) => search.append(key, String(entry)))
      continue
    }
    search.set(key, String(value))
  }
  const queryString = search.toString()
  if (!queryString) return url
  return `${url}${url.includes('?') ? '&' : '?'}${queryString}`
}

const aggregateGenericApiValues = (source: any, params: Record<string, any>, template: TemplateRow) => {
  const resultPath = params.resultPath || params.dataPath || params.pathResult || null
  const valuePath = params.valuePath || params.metricPath || null
  const aggregation = normalizeAggregation(params.aggregation, template.metricTypeUi)
  const extracted = getByPath(source, resultPath)
  const collection = extracted === undefined ? source : extracted

  if (aggregation === 'COUNT') {
    if (Array.isArray(collection)) {
      return {
        computed: collection.length,
        matchedRows: collection.length,
        extractedValue: collection.length,
      }
    }
    return {
      computed: collection === null || collection === undefined ? 0 : 1,
      matchedRows: collection === null || collection === undefined ? 0 : 1,
      extractedValue: collection,
    }
  }

  const rawValues = Array.isArray(collection)
    ? collection.map((item) => (valuePath ? getByPath(item, valuePath) : item))
    : [valuePath ? getByPath(collection, valuePath) : collection]
  const numericValues = rawValues
    .map((value) => (value === null || value === undefined || value === '' ? null : Number(value)))
    .filter((value) => value !== null && Number.isFinite(value)) as number[]

  if (numericValues.length === 0) {
    return {
      computed: 0,
      matchedRows: Array.isArray(collection) ? collection.length : collection === undefined ? 0 : 1,
      extractedValue: Array.isArray(collection) ? rawValues : rawValues[0],
    }
  }

  if (aggregation === 'AVG') {
    return {
      computed: numericValues.reduce((acc, value) => acc + value, 0) / numericValues.length,
      matchedRows: numericValues.length,
      extractedValue: Array.isArray(collection) ? rawValues : rawValues[0],
    }
  }
  if (aggregation === 'MAX') {
    return {
      computed: Math.max(...numericValues),
      matchedRows: numericValues.length,
      extractedValue: Array.isArray(collection) ? rawValues : rawValues[0],
    }
  }
  if (aggregation === 'MIN') {
    return {
      computed: Math.min(...numericValues),
      matchedRows: numericValues.length,
      extractedValue: Array.isArray(collection) ? rawValues : rawValues[0],
    }
  }
  if (aggregation === 'FIRST') {
    return {
      computed: numericValues[0],
      matchedRows: numericValues.length,
      extractedValue: Array.isArray(collection) ? rawValues : rawValues[0],
    }
  }

  return {
    computed: numericValues.reduce((acc, value) => acc + value, 0),
    matchedRows: numericValues.length,
    extractedValue: Array.isArray(collection) ? rawValues : rawValues[0],
  }
}

const findMappedTargetConfig = (targetMap: Record<string, any>, externalKey: string) => {
  if (targetMap[externalKey] !== undefined) return targetMap[externalKey]
  const normalized = externalKey.trim().toLowerCase()
  const match = Object.entries(targetMap).find(([key]) => key.trim().toLowerCase() === normalized)
  return match?.[1]
}

const resolveMappedTarget = (mappingOwnerType: string, targetConfig: any) => {
  if (targetConfig === null || targetConfig === undefined || targetConfig === '') return null
  if (typeof targetConfig === 'number' || typeof targetConfig === 'string') {
    const numeric = Number(targetConfig)
    if (!Number.isFinite(numeric)) return null
    return mappingOwnerType === 'scopeKpi' ? { scopeKpiId: numeric } : { assignmentId: numeric }
  }
  if (typeof targetConfig === 'object') {
    const assignmentId = targetConfig.assignmentId ?? targetConfig.collaboratorAssignmentId ?? null
    const scopeKpiId = targetConfig.scopeKpiId ?? targetConfig.macroKpiId ?? null
    const numericAssignmentId =
      assignmentId !== null && assignmentId !== undefined && Number.isFinite(Number(assignmentId))
        ? Number(assignmentId)
        : null
    const numericScopeKpiId =
      scopeKpiId !== null && scopeKpiId !== undefined && Number.isFinite(Number(scopeKpiId))
        ? Number(scopeKpiId)
        : null
    if (numericAssignmentId && numericScopeKpiId) {
      throw new Error('Cada entrada de targetMap debe apuntar a assignmentId o scopeKpiId, no a ambos')
    }
    if (numericAssignmentId) return { assignmentId: numericAssignmentId }
    if (numericScopeKpiId) return { scopeKpiId: numericScopeKpiId }
  }
  return null
}

const buildMappedMeasurements = (source: any, params: Record<string, any>, defaultResultPath?: string | null) => {
  const targetMap = params.targetMap && typeof params.targetMap === 'object' ? params.targetMap : null
  if (!targetMap) {
    return {
      measurements: [],
      unmappedKeys: [] as string[],
      matchedRows: 0,
    }
  }

  const resultPath = params.mappingResultPath || params.resultPath || params.dataPath || defaultResultPath || null
  const mappingKeyPath = params.mappingKeyPath || params.keyPath || params.mappingKey || 'key'
  const mappingValuePath = params.mappingValuePath || params.valuePath || params.metricPath || 'value'
  const mappingOwnerType = String(params.mappingOwnerType || 'assignment')
  const extracted = getByPath(source, resultPath)
  const rows = Array.isArray(extracted) ? extracted : Array.isArray(source) ? source : []
  if (!Array.isArray(rows)) {
    return {
      measurements: [],
      unmappedKeys: [] as string[],
      matchedRows: 0,
    }
  }

  const measurements: Array<{
    assignmentId?: number | null
    scopeKpiId?: number | null
    value: number
    externalKey?: string | null
    raw?: any
  }> = []
  const unmappedKeys: string[] = []

  for (const row of rows) {
    const rawExternalKey = getByPath(row, mappingKeyPath)
    if (rawExternalKey === null || rawExternalKey === undefined || rawExternalKey === '') continue
    const externalKey = String(rawExternalKey)
    const targetConfig = findMappedTargetConfig(targetMap, externalKey)
    if (!targetConfig) {
      unmappedKeys.push(externalKey)
      continue
    }
    const resolvedTarget = resolveMappedTarget(mappingOwnerType, targetConfig)
    if (!resolvedTarget) {
      unmappedKeys.push(externalKey)
      continue
    }
    const rawValue = getByPath(row, mappingValuePath)
    const numericValue = Number(rawValue)
    if (!Number.isFinite(numericValue)) continue
    measurements.push({
      ...resolvedTarget,
      value: numericValue,
      externalKey,
      raw: row,
    })
  }

  return {
    measurements,
    unmappedKeys,
    matchedRows: rows.length,
  }
}

const buildPreviewMappingRows = (source: any, params: Record<string, any>, defaultResultPath?: string | null) => {
  const resultPath = params.mappingResultPath || params.resultPath || params.dataPath || defaultResultPath || null
  const mappingKeyPath = params.mappingKeyPath || params.keyPath || params.mappingKey || 'key'
  const mappingValuePath = params.mappingValuePath || params.valuePath || params.metricPath || 'value'
  const extracted = getByPath(source, resultPath)
  const rows = Array.isArray(extracted) ? extracted : Array.isArray(source) ? source : []
  if (!Array.isArray(rows)) {
    return {
      mappingResultPath: resultPath,
      mappingKeyPath,
      mappingValuePath,
      rows: [] as Array<{ externalKey: string; previewValue: any }>,
    }
  }

  const seen = new Set<string>()
  const previewRows: Array<{ externalKey: string; previewValue: any }> = []
  for (const row of rows) {
    const rawExternalKey = getByPath(row, mappingKeyPath)
    if (rawExternalKey === null || rawExternalKey === undefined || rawExternalKey === '') continue
    const externalKey = String(rawExternalKey)
    const normalizedKey = externalKey.trim().toLowerCase()
    if (seen.has(normalizedKey)) continue
    seen.add(normalizedKey)
    previewRows.push({
      externalKey,
      previewValue: getByPath(row, mappingValuePath),
    })
    if (previewRows.length >= 25) break
  }

  return {
    mappingResultPath: resultPath,
    mappingKeyPath,
    mappingValuePath,
    rows: previewRows,
  }
}

const normalizeLookerBaseUrl = (endpoint: string | null | undefined) => {
  const trimmed = String(endpoint || '').trim().replace(/\/$/, '')
  if (!trimmed) {
    throw new Error('Looker requiere endpoint base')
  }
  return trimmed.replace(/\/api\/4\.0$/i, '')
}

const normalizeLookerToken = (token: string) => {
  const trimmed = String(token || '').trim()
  if (!trimmed) return ''
  return /^token\s+/i.test(trimmed) ? trimmed : `token ${trimmed}`
}

const lookerTokenCache = new Map<string, { token: string; expiresAt: number }>()

const getLookerAccessToken = async (endpoint: string | null | undefined, authConfig: any) => {
  const directToken = authConfig?.token ? normalizeLookerToken(authConfig.token) : ''
  if (directToken) return directToken

  const clientId = authConfig?.clientId || authConfig?.client_id || authConfig?.username || ''
  const clientSecret = authConfig?.clientSecret || authConfig?.client_secret || authConfig?.password || ''
  if (!clientId || !clientSecret) {
    throw new Error('Looker requiere token o clientId/clientSecret')
  }

  const baseUrl = normalizeLookerBaseUrl(endpoint)
  const cacheKey = `${baseUrl}|${clientId}`
  const cached = lookerTokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token
  }

  const body = new URLSearchParams({
    client_id: String(clientId),
    client_secret: String(clientSecret),
  })
  const response = await fetch(`${baseUrl}/api/4.0/login`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Looker login error ${response.status}: ${text}`)
  }
  const data = await response.json()
  const token = normalizeLookerToken(data?.access_token || '')
  if (!token) {
    throw new Error('Looker login no devolvió access_token')
  }
  const expiresIn = Number(data?.expires_in ?? 3600)
  lookerTokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + Math.max(expiresIn - 60, 60) * 1000,
  })
  return token
}

const parseQueryBody = (params: Record<string, any>) => {
  const rawBody = params.queryBody ?? params.inlineQuery ?? params.body ?? null
  if (!rawBody) return null
  if (typeof rawBody === 'object') return rawBody
  if (typeof rawBody === 'string') {
    try {
      return JSON.parse(rawBody)
    } catch {
      throw new Error('queryBody de Looker debe ser JSON válido')
    }
  }
  throw new Error('queryBody de Looker inválido')
}

const fetchLookerJson = async (
  baseUrl: string,
  authHeader: string,
  path: string,
  requestQuery?: Record<string, any> | null
) => {
  const url = appendQueryParams(`${baseUrl}${path}`, requestQuery || null)
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: authHeader,
    },
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Looker error ${response.status}: ${text}`)
  }
  return response.json()
}

const extractLookerDashboardElementTitle = (element: any) =>
  String(element?.title || element?.subtitle_text || element?.look?.title || element?.id || '').trim()

const resolveLookerRunnableResource = (element: any) => {
  const lookId = element?.look_id || element?.look?.id || null
  const queryId =
    element?.query_id ||
    element?.query?.id ||
    element?.look?.query_id ||
    element?.result_maker?.query_id ||
    element?.result_maker?.query?.id ||
    null

  if (lookId) {
    return {
      resolvedResourceType: 'look',
      resolvedResourceId: String(lookId),
    }
  }
  if (queryId) {
    return {
      resolvedResourceType: 'query',
      resolvedResourceId: String(queryId),
    }
  }
  throw new Error('El dashboard element de Looker no expone look_id ni query_id ejecutable')
}

const pickDashboardElement = (elements: any[], params: Record<string, any>) => {
  const desiredElementId = String(params.dashboardElementId || params.elementId || '').trim()
  if (desiredElementId) {
    const matched = elements.find((element) => String(element?.id || '') === desiredElementId)
    if (!matched) {
      throw new Error(`No se encontró dashboardElementId=${desiredElementId} en el dashboard de Looker`)
    }
    return matched
  }

  const desiredTitle = String(params.dashboardElementTitle || params.elementTitle || '').trim().toLowerCase()
  if (desiredTitle) {
    const matched = elements.find((element) => extractLookerDashboardElementTitle(element).toLowerCase() === desiredTitle)
    if (!matched) {
      throw new Error(`No se encontró dashboardElementTitle="${params.dashboardElementTitle || params.elementTitle}"`)
    }
    return matched
  }

  const requestedIndex = Number(params.dashboardElementIndex)
  if (Number.isFinite(requestedIndex) && requestedIndex >= 0) {
    const runnableElements = elements.filter((element) => {
      try {
        resolveLookerRunnableResource(element)
        return true
      } catch {
        return false
      }
    })
    if (!runnableElements[requestedIndex]) {
      throw new Error(`dashboardElementIndex=${requestedIndex} no existe o no es ejecutable`)
    }
    return runnableElements[requestedIndex]
  }

  const firstRunnable = elements.find((element) => {
    try {
      resolveLookerRunnableResource(element)
      return true
    } catch {
      return false
    }
  })
  if (!firstRunnable) {
    throw new Error('El dashboard de Looker no tiene dashboard elements ejecutables')
  }
  return firstRunnable
}

const resolveLookerResourceTarget = async (
  baseUrl: string,
  authHeader: string,
  params: Record<string, any>
) => {
  const requestedResourceType = String(params.resourceType || 'query').trim().toLowerCase()
  const requestedResourceId =
    params.resourceId ||
    params.queryId ||
    params.lookId ||
    params.dashboardId ||
    params.dashboardElementId ||
    null

  if (requestedResourceType === 'query' || requestedResourceType === 'look' || requestedResourceType === 'inline_query') {
    return {
      requestedResourceType,
      requestedResourceId: requestedResourceId ? String(requestedResourceId) : null,
      resolvedResourceType: requestedResourceType,
      resolvedResourceId: requestedResourceId ? String(requestedResourceId) : null,
      dashboardId: null,
      dashboardElementId: null,
      dashboardElementTitle: null,
      elementPayload: null,
    }
  }

  if (requestedResourceType === 'dashboard_element') {
    const dashboardElementId = String(params.resourceId || params.dashboardElementId || params.elementId || '').trim()
    if (!dashboardElementId) {
      throw new Error('Looker dashboard_element requiere resourceId o dashboardElementId')
    }
    const element = await fetchLookerJson(baseUrl, authHeader, `/api/4.0/dashboard_elements/${encodeURIComponent(dashboardElementId)}`)
    const resolved = resolveLookerRunnableResource(element)
    return {
      requestedResourceType,
      requestedResourceId: dashboardElementId,
      resolvedResourceType: resolved.resolvedResourceType,
      resolvedResourceId: resolved.resolvedResourceId,
      dashboardId: element?.dashboard_id ? String(element.dashboard_id) : null,
      dashboardElementId,
      dashboardElementTitle: extractLookerDashboardElementTitle(element) || null,
      elementPayload: element,
    }
  }

  if (requestedResourceType === 'dashboard') {
    const dashboardId = String(params.resourceId || params.dashboardId || '').trim()
    if (!dashboardId) {
      throw new Error('Looker dashboard requiere resourceId o dashboardId')
    }
    const elements = await fetchLookerJson(
      baseUrl,
      authHeader,
      `/api/4.0/dashboards/${encodeURIComponent(dashboardId)}/dashboard_elements`
    )
    if (!Array.isArray(elements) || elements.length === 0) {
      throw new Error('El dashboard de Looker no tiene dashboard elements disponibles')
    }
    const element = pickDashboardElement(elements, params)
    const resolved = resolveLookerRunnableResource(element)
    return {
      requestedResourceType,
      requestedResourceId: dashboardId,
      resolvedResourceType: resolved.resolvedResourceType,
      resolvedResourceId: resolved.resolvedResourceId,
      dashboardId,
      dashboardElementId: element?.id ? String(element.id) : null,
      dashboardElementTitle: extractLookerDashboardElementTitle(element) || null,
      elementPayload: element,
    }
  }

  throw new Error('Looker resourceType soportado: query, look, inline_query, dashboard, dashboard_element')
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
    body: JSON.stringify({ jql }),
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

const jiraAdapter: ConnectorAdapter = {
  supportedConnectors: ['jira', 'xray'],
  async run({ template, authProfile, authConfig, params }: ConnectorAdapterContext): Promise<ConnectorAdapterResult> {
    const metricType: 'count' | 'ratio' = template.metricType === 'count' ? 'count' : 'ratio'
    if (!template.queryTestsTemplate) {
      throw new Error('La plantilla no tiene query de tests definida')
    }
    if (metricType === 'ratio' && !template.queryStoriesTemplate) {
      throw new Error('La plantilla ratio requiere query de historias')
    }
    if (!authProfile?.endpoint) {
      throw new Error('Falta endpoint en auth profile')
    }

    const testsJql = renderTemplate(template.queryTestsTemplate, params)
    const storiesJql =
      metricType === 'ratio' && template.queryStoriesTemplate ? renderTemplate(template.queryStoriesTemplate, params) : ''
    const testsTotal = await executeJiraQuery(authProfile.endpoint, authProfile.authType, authConfig || {}, testsJql)
    const storiesTotal =
      metricType === 'ratio' && storiesJql
        ? await executeJiraQuery(authProfile.endpoint, authProfile.authType, authConfig || {}, storiesJql)
        : 0
    const formula = template.formulaTemplate || (metricType === 'count' ? 'tests' : 'tests / stories')
    const computed =
      metricType === 'ratio'
        ? storiesTotal > 0
          ? evaluateFormula(formula, { tests: testsTotal, stories: storiesTotal })
          : 0
        : evaluateFormula(formula, { tests: testsTotal, stories: storiesTotal })

    return {
      computed,
      outputs: {
        testsTotal,
        storiesTotal,
        testsJql,
        storiesJql,
        formula,
        sheetMeta: null,
      },
    }
  },
}

const sheetsAdapter: ConnectorAdapter = {
  supportedConnectors: ['sheets'],
  async run({ template, authProfile, authConfig, params }: ConnectorAdapterContext): Promise<ConnectorAdapterResult> {
    const sheetData = await executeSheetsQuery(authProfile?.endpoint || null, authProfile?.authType || null, authConfig || {}, params)
    const sheetResult = computeSheetsValue(template.metricTypeUi, params, sheetData)
    const formula = template.formulaTemplate || (template.metricTypeUi === 'value_agg' ? 'AGG' : 'VALUE')
    return {
      computed: sheetResult.computed,
      outputs: {
        testsTotal: 0,
        storiesTotal: 0,
        testsJql: '',
        storiesJql: '',
        formula,
        sheetMeta: {
          sheetKey: params.sheetKey || params.spreadsheetId,
          tab: params.tab || params.range,
          matchedRows: sheetResult.matchedRows,
          values: sheetResult.values,
          valueColumn: sheetResult.valueColumn,
          collaboratorValue: params.collaboratorValue || params.collaborator || null,
          periodValue: sheetResult.periodValue,
        },
        sourceMeta: null,
      },
    }
  },
}

const genericApiAdapter: ConnectorAdapter = {
  supportedConnectors: ['generic_api'],
  async run({ template, authProfile, authConfig, params }: ConnectorAdapterContext): Promise<ConnectorAdapterResult> {
    const method = String(params.method || 'GET').toUpperCase()
    const url = buildRequestUrl(authProfile?.endpoint || null, params)
    const headers = {
      ...formatAuthHeaders(authProfile?.authType || null, authConfig || {}),
      ...(params.headers && typeof params.headers === 'object' ? params.headers : {}),
      Accept: 'application/json',
    } as Record<string, string>
    const requestInit: RequestInit = {
      method,
      headers,
    }
    if (!['GET', 'HEAD'].includes(method)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json'
      if (params.body !== undefined) {
        requestInit.body =
          typeof params.body === 'string' || headers['Content-Type'] !== 'application/json'
            ? String(params.body)
            : JSON.stringify(params.body)
      }
    }

    const response = await fetch(url, requestInit)
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Generic API error ${response.status}: ${text}`)
    }

    const contentType = response.headers.get('content-type') || ''
    const payload = contentType.includes('application/json') ? await response.json() : await response.text()
    const previewMapping = buildPreviewMappingRows(payload, params)
    const mapped = buildMappedMeasurements(payload, params)
    if (mapped.measurements.length > 0) {
      const aggregation = normalizeAggregation(params.aggregation, template.metricTypeUi)
      const values = mapped.measurements.map((measurement) => measurement.value)
      return {
        computed: computeAggregatedValue(values, aggregation),
        measurements: mapped.measurements,
        outputs: {
          testsTotal: 0,
          storiesTotal: 0,
          testsJql: '',
          storiesJql: '',
          formula: template.formulaTemplate || aggregation,
          sheetMeta: null,
          sourceMeta: {
            connector: 'generic_api',
            url,
            method,
            mappingMode: 'row_targets',
            mappingKeyPath: params.mappingKeyPath || params.keyPath || params.mappingKey || 'key',
            mappingValuePath: params.mappingValuePath || params.valuePath || params.metricPath || 'value',
            mappingResultPath: previewMapping.mappingResultPath,
            aggregation,
            matchedRows: mapped.matchedRows,
            mappedRows: mapped.measurements.length,
            unmappedKeys: mapped.unmappedKeys.slice(0, 20),
            previewRows: previewMapping.rows,
          },
        },
      }
    }
    const result = aggregateGenericApiValues(payload, params, template)
    const formula = template.formulaTemplate || normalizeAggregation(params.aggregation, template.metricTypeUi)

    return {
      computed: result.computed,
      outputs: {
        testsTotal: 0,
        storiesTotal: 0,
        testsJql: '',
        storiesJql: '',
        formula,
        sheetMeta: null,
        sourceMeta: {
          connector: 'generic_api',
          url,
          method,
          resultPath: params.resultPath || params.dataPath || null,
          valuePath: params.valuePath || params.metricPath || null,
          mappingResultPath: previewMapping.mappingResultPath,
          mappingKeyPath: previewMapping.mappingKeyPath,
          mappingValuePath: previewMapping.mappingValuePath,
          aggregation: normalizeAggregation(params.aggregation, template.metricTypeUi),
          matchedRows: result.matchedRows,
          extractedValue: result.extractedValue,
          previewRows: previewMapping.rows,
        },
      },
    }
  },
}

const lookerAdapter: ConnectorAdapter = {
  supportedConnectors: ['looker'],
  async run({ template, authProfile, authConfig, params }: ConnectorAdapterContext): Promise<ConnectorAdapterResult> {
    const baseUrl = normalizeLookerBaseUrl(authProfile?.endpoint || null)
    const authHeader = await getLookerAccessToken(baseUrl, authConfig || {})
    const resolvedTarget = await resolveLookerResourceTarget(baseUrl, authHeader, params)
    const resourceType = resolvedTarget.requestedResourceType
    const resultFormat = String(params.resultFormat || 'json').trim().toLowerCase()
    if (!['json', 'json_bi', 'json_detail'].includes(resultFormat)) {
      throw new Error('Looker soporta resultFormat json, json_bi o json_detail en este conector')
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: authHeader,
    }
    const requestQuery = params.requestQuery && typeof params.requestQuery === 'object' ? params.requestQuery : null
    let url = ''
    let requestInit: RequestInit = { method: 'GET', headers }
    let resourceId = resolvedTarget.resolvedResourceId

    if (resolvedTarget.resolvedResourceType === 'query') {
      if (!resourceId) throw new Error('Looker query requiere resourceId o queryId')
      url = `${baseUrl}/api/4.0/queries/${encodeURIComponent(String(resourceId))}/run/${encodeURIComponent(resultFormat)}`
      url = appendQueryParams(url, requestQuery)
    } else if (resolvedTarget.resolvedResourceType === 'look') {
      if (!resourceId) throw new Error('Looker look requiere resourceId o lookId')
      url = `${baseUrl}/api/4.0/looks/${encodeURIComponent(String(resourceId))}/run/${encodeURIComponent(resultFormat)}`
      url = appendQueryParams(url, requestQuery)
    } else if (resolvedTarget.resolvedResourceType === 'inline_query') {
      const queryBody = parseQueryBody(params)
      if (!queryBody) throw new Error('Looker inline_query requiere queryBody')
      url = `${baseUrl}/api/4.0/queries/run/${encodeURIComponent(resultFormat)}`
      url = appendQueryParams(url, requestQuery)
      headers['Content-Type'] = 'application/json'
      requestInit = {
        method: 'POST',
        headers,
        body: JSON.stringify(queryBody),
      }
      resourceId = null
    } else {
      throw new Error('Looker resourceType soportado: query, look, inline_query, dashboard, dashboard_element')
    }

    const response = await fetch(url, requestInit)
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Looker error ${response.status}: ${text}`)
    }

    const payload = await response.json()
    const normalizedParams: Record<string, any> = {
      ...params,
      resultPath:
        params.resultPath ||
        params.dataPath ||
        (resultFormat === 'json_bi' || resultFormat === 'json_detail' ? 'data' : undefined),
    }
    const previewMapping = buildPreviewMappingRows(payload, normalizedParams, normalizedParams.resultPath || null)
    const mapped = buildMappedMeasurements(payload, normalizedParams, normalizedParams.resultPath || null)
    if (mapped.measurements.length > 0) {
      const aggregation = normalizeAggregation(params.aggregation, template.metricTypeUi)
      const values = mapped.measurements.map((measurement) => measurement.value)
      return {
        computed: computeAggregatedValue(values, aggregation),
        measurements: mapped.measurements,
        outputs: {
          testsTotal: 0,
          storiesTotal: 0,
          testsJql: '',
          storiesJql: '',
          formula: template.formulaTemplate || aggregation,
          sheetMeta: null,
          sourceMeta: {
            connector: 'looker',
            resourceType,
            resourceId: resolvedTarget.requestedResourceId,
            resolvedResourceType: resolvedTarget.resolvedResourceType,
            resolvedResourceId: resourceId,
            dashboardId: resolvedTarget.dashboardId,
            dashboardElementId: resolvedTarget.dashboardElementId,
            dashboardElementTitle: resolvedTarget.dashboardElementTitle,
            resultFormat,
            mappingMode: 'row_targets',
            mappingKeyPath: normalizedParams.mappingKeyPath || normalizedParams.keyPath || normalizedParams.mappingKey || 'key',
            mappingValuePath: normalizedParams.mappingValuePath || normalizedParams.valuePath || normalizedParams.metricPath || 'value',
            mappingResultPath: previewMapping.mappingResultPath,
            aggregation,
            matchedRows: mapped.matchedRows,
            mappedRows: mapped.measurements.length,
            unmappedKeys: mapped.unmappedKeys.slice(0, 20),
            unmappedCount: mapped.unmappedKeys.length,
            previewRows: previewMapping.rows,
            requestUrl: url,
          },
        },
      }
    }
    const result = aggregateGenericApiValues(payload, normalizedParams, template)
    const formula = template.formulaTemplate || normalizeAggregation(params.aggregation, template.metricTypeUi)

    return {
      computed: result.computed,
      outputs: {
        testsTotal: 0,
        storiesTotal: 0,
        testsJql: '',
        storiesJql: '',
        formula,
        sheetMeta: null,
        sourceMeta: {
          connector: 'looker',
          resourceType,
          resourceId: resolvedTarget.requestedResourceId,
          resolvedResourceType: resolvedTarget.resolvedResourceType,
          resolvedResourceId: resourceId,
          dashboardId: resolvedTarget.dashboardId,
          dashboardElementId: resolvedTarget.dashboardElementId,
          dashboardElementTitle: resolvedTarget.dashboardElementTitle,
          resultFormat,
          resultPath: normalizedParams.resultPath || null,
          valuePath: params.valuePath || params.metricPath || null,
          mappingResultPath: previewMapping.mappingResultPath,
          mappingKeyPath: previewMapping.mappingKeyPath,
          mappingValuePath: previewMapping.mappingValuePath,
          aggregation: normalizeAggregation(params.aggregation, template.metricTypeUi),
          matchedRows: result.matchedRows,
          extractedValue: result.extractedValue,
          previewRows: previewMapping.rows,
          requestUrl: url,
        },
      },
    }
  },
}

const connectorAdapters: ConnectorAdapter[] = [jiraAdapter, sheetsAdapter, genericApiAdapter, lookerAdapter]

export const resolveConnectorAdapter = (connector: string, authProfile?: AuthProfileRow | null) => {
  const normalized = String(connector || authProfile?.connector || 'jira').toLowerCase()
  const adapter = connectorAdapters.find((candidate) => candidate.supportedConnectors.includes(normalized))
  if (!adapter) {
    throw new Error(`Connector no soportado: ${normalized}`)
  }
  return adapter
}
