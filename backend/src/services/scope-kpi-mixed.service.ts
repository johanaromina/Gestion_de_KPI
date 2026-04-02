import { pool } from '../config/database'
import { calculateKpiResult } from './kpi-calculation.service'

export type ScopeKpiMixedConfig = {
  directWeight: number
  aggregatedWeight: number
  directLabel?: string | null
  aggregatedLabel?: string | null
}

type ScopeKpiMetricInput = {
  kpiId: number
  target: number
  weight: number
  actual: number | null
}

export const safeNumber = (value: any) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

export const parseScopeKpiMixedConfig = (value: any): ScopeKpiMixedConfig | null => {
  if (value == null || value === '') return null

  let raw = value
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value)
    } catch {
      return null
    }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  let directWeight = safeNumber(raw.directWeight)
  let aggregatedWeight = safeNumber(raw.aggregatedWeight)

  if (directWeight === null && aggregatedWeight === null) {
    directWeight = 50
    aggregatedWeight = 50
  } else if (directWeight === null) {
    directWeight = Math.max(0, 100 - Number(aggregatedWeight || 0))
  } else if (aggregatedWeight === null) {
    aggregatedWeight = Math.max(0, 100 - Number(directWeight || 0))
  }

  if ((directWeight || 0) <= 0 && (aggregatedWeight || 0) <= 0) {
    directWeight = 50
    aggregatedWeight = 50
  }

  return {
    directWeight: Number(directWeight || 0),
    aggregatedWeight: Number(aggregatedWeight || 0),
    directLabel: typeof raw.directLabel === 'string' ? raw.directLabel.trim() || null : null,
    aggregatedLabel: typeof raw.aggregatedLabel === 'string' ? raw.aggregatedLabel.trim() || null : null,
  }
}

export const serializeScopeKpiMixedConfig = (value: any) => {
  const parsed = parseScopeKpiMixedConfig(value)
  return parsed ? JSON.stringify(parsed) : null
}

export const computeScopeKpiActual = ({
  sourceMode,
  directActual,
  aggregatedActual,
  fallbackActual,
  mixedConfig,
}: {
  sourceMode: 'direct' | 'aggregated' | 'mixed'
  directActual?: any
  aggregatedActual?: any
  fallbackActual?: any
  mixedConfig?: any
}) => {
  const direct = safeNumber(directActual)
  const aggregated = safeNumber(aggregatedActual)
  const fallback = safeNumber(fallbackActual)

  if (sourceMode === 'mixed') {
    const config = parseScopeKpiMixedConfig(mixedConfig)
    if (direct === null && aggregated === null) return fallback
    if (direct === null) return aggregated
    if (aggregated === null) return direct

    const directWeight = Number(config?.directWeight ?? 50)
    const aggregatedWeight = Number(config?.aggregatedWeight ?? 50)
    const totalWeight = directWeight + aggregatedWeight

    if (totalWeight <= 0) {
      return Number((((direct + aggregated) / 2).toFixed(2)))
    }

    return Number((((direct * directWeight + aggregated * aggregatedWeight) / totalWeight).toFixed(2)))
  }

  if (sourceMode === 'aggregated') return aggregated ?? fallback
  return direct ?? fallback
}

export const computeScopeKpiMetrics = async ({ kpiId, target, weight, actual }: ScopeKpiMetricInput) => {
  if (actual === null || actual === undefined) {
    return { variation: null, weightedResult: null }
  }

  const [kpiRows] = await pool.query<any[]>(`SELECT type, direction, formula FROM kpis WHERE id = ?`, [kpiId])
  const targetValue = Number(target ?? 0)

  if (targetValue <= 0) {
    return { variation: null, weightedResult: null }
  }

  return calculateKpiResult({
    target: targetValue,
    actual,
    weight: Number(weight ?? 0),
    direction: kpiRows?.[0]?.direction,
    type: kpiRows?.[0]?.type,
    formula: kpiRows?.[0]?.formula,
  })
}

export const hydrateScopeKpiMixedFields = <T extends Record<string, any>>(row: T) => ({
  ...row,
  directActual: safeNumber(row.directActual),
  aggregatedActual: safeNumber(row.aggregatedActual),
  mixedConfig: parseScopeKpiMixedConfig(row.mixedConfig),
})
