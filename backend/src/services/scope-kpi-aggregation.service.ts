import { pool } from '../config/database'
import { applyMeasurementToScopeKPI, getScopeKPIByIdOrThrow } from './scope-kpi.service'
import { computeScopeKpiActual, safeNumber } from './scope-kpi-mixed.service'

const computeAggregate = (
  method: string,
  values: number[],
  weights: number[],
) => {
  if (values.length === 0) return 0
  switch (method) {
    case 'sum':
      return values.reduce((acc, value) => acc + value, 0)
    case 'avg':
      return values.reduce((acc, value) => acc + value, 0) / values.length
    case 'weighted_avg': {
      const totalWeight = weights.reduce((acc, value) => acc + value, 0)
      if (totalWeight <= 0) return values.reduce((acc, value) => acc + value, 0) / values.length
      return values.reduce((acc, value, index) => acc + value * (weights[index] || 0), 0) / totalWeight
    }
    default:
      return values.reduce((acc, value) => acc + value, 0) / values.length
  }
}

type LinkEntry = { value: number; weight: number; method: string }

// Aplica el aggregationMethod de cada link respetando su grupo.
// Si todos los links tienen el mismo método, el resultado es idéntico al computeAggregate original.
// Si hay métodos mezclados, cada grupo se calcula por separado y los resultados se suman.
const computeAggregatePerLink = (links: LinkEntry[]): number => {
  if (links.length === 0) return 0
  const VALID_METHODS = ['sum', 'avg', 'weighted_avg']
  const normalize = (m: string) => (VALID_METHODS.includes(m) ? m : 'weighted_avg')
  const methods = new Set(links.map((l) => normalize(l.method)))
  if (methods.size === 1) {
    const [method] = methods
    return computeAggregate(method, links.map((l) => l.value), links.map((l) => l.weight))
  }
  let total = 0
  for (const method of VALID_METHODS) {
    const group = links.filter((l) => normalize(l.method) === method)
    if (group.length > 0) {
      total += computeAggregate(method, group.map((l) => l.value), group.map((l) => l.weight))
    }
  }
  return total
}

export const recalculateScopeKPI = async (scopeKpiId: number, triggeredBy?: number | null) => {
  const scopeKpi = await getScopeKPIByIdOrThrow(scopeKpiId)
  const [linkRows] = await pool.query<any[]>(
    `SELECT l.*,
            ck.actual as collaboratorActual,
            ck.weight as collaboratorWeight,
            skChild.actual as scopeActual,
            skChild.weight as scopeWeight
     FROM scope_kpi_links l
     LEFT JOIN collaborator_kpis ck ON ck.id = l.collaboratorAssignmentId
     LEFT JOIN scope_kpis skChild ON skChild.id = l.childScopeKpiId
     WHERE l.scopeKpiId = ?
     ORDER BY COALESCE(l.sortOrder, 0), l.id`,
    [scopeKpiId]
  )

  const linkEntries: LinkEntry[] = []
  const snapshot = []

  for (const link of Array.isArray(linkRows) ? linkRows : []) {
    const value =
      link.childType === 'collaborator' ? safeNumber(link.collaboratorActual) : safeNumber(link.scopeActual)
    if (value === null) continue
    linkEntries.push({
      value,
      weight: safeNumber(link.contributionWeight) ?? safeNumber(link.collaboratorWeight) ?? safeNumber(link.scopeWeight) ?? 0,
      method: link.aggregationMethod ?? 'weighted_avg',
    })
    snapshot.push({
      linkId: link.id,
      childType: link.childType,
      collaboratorAssignmentId: link.collaboratorAssignmentId,
      childScopeKpiId: link.childScopeKpiId,
      value,
      contributionWeight: safeNumber(link.contributionWeight),
      aggregationMethod: link.aggregationMethod,
    })
  }

  const aggregatedValue =
    linkEntries.length > 0
      ? computeAggregatePerLink(linkEntries)
      : safeNumber(scopeKpi.sourceMode === 'mixed' ? scopeKpi.aggregatedActual : scopeKpi.actual) ?? 0
  const finalActualPreview = computeScopeKpiActual({
    sourceMode: scopeKpi.sourceMode,
    directActual: scopeKpi.directActual,
    aggregatedActual: aggregatedValue,
    fallbackActual: scopeKpi.actual,
    mixedConfig: scopeKpi.mixedConfig,
  })

  await pool.query(
    `INSERT INTO scope_kpi_aggregation_runs
     (scopeKpiId, periodId, subPeriodId, status, inputsSnapshot, resultValue, message, createdBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      scopeKpiId,
      scopeKpi.periodId,
      scopeKpi.subPeriodId || null,
      'success',
      JSON.stringify({
        sourceMode: scopeKpi.sourceMode,
        directActual: safeNumber(scopeKpi.directActual),
        aggregatedActual: aggregatedValue,
        finalActual: finalActualPreview,
        children: snapshot,
      }),
      aggregatedValue,
      linkEntries.length > 0
        ? scopeKpi.sourceMode === 'mixed'
          ? 'Recalculo mixed completado'
          : 'Recalculo completado'
        : 'Recalculo sin inputs con actual cargado',
      triggeredBy || null,
    ]
  )

  const [measurementResult] = await pool.query(
    `INSERT INTO kpi_measurements
     (assignmentId, scopeKpiId, periodId, subPeriodId, value, mode, status, capturedBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [null, scopeKpiId, scopeKpi.periodId, scopeKpi.subPeriodId || null, aggregatedValue, 'auto', 'approved', triggeredBy || null]
  )
  const measurementId = (measurementResult as any).insertId as number
  const applied = await applyMeasurementToScopeKPI(scopeKpiId, aggregatedValue, 'auto', measurementId, 'aggregated')
  return {
    resultValue: applied?.actual ?? aggregatedValue,
    aggregatedValue,
    directValue: applied?.directActual ?? safeNumber(scopeKpi.directActual),
    inputs: snapshot.length,
  }
}

export const recalculateMacroKPI = recalculateScopeKPI

// BFS hacia arriba en la cadena scope→scope.
// Recalcula todos los scope KPIs padre del scopeKpiId recibido y propaga a OKRs.
export const recalcParentScopeKPIs = async (
  scopeKpiId: number,
  onOkrPropagation?: (sid: number) => void
) => {
  const visited = new Set<number>([scopeKpiId])
  let frontier = [scopeKpiId]
  while (frontier.length > 0) {
    const ph = frontier.map(() => '?').join(',')
    const [parentRows] = await pool.query<any[]>(
      `SELECT DISTINCT scopeKpiId FROM scope_kpi_links WHERE childScopeKpiId IN (${ph})`,
      frontier
    )
    frontier = []
    for (const row of Array.isArray(parentRows) ? parentRows : []) {
      if (!visited.has(row.scopeKpiId)) {
        visited.add(row.scopeKpiId)
        frontier.push(row.scopeKpiId)
        await recalculateScopeKPI(row.scopeKpiId)
        onOkrPropagation?.(row.scopeKpiId)
      }
    }
  }
}
