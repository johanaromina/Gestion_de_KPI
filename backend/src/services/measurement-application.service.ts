import { pool } from '../config/database'
import { recalcSummaryAssignment } from '../controllers/collaborator-kpis.controller'
import { calculateKpiResult } from './kpi-calculation.service'
import {
  computeScopeKpiActual,
  computeScopeKpiMetrics,
  hydrateScopeKpiMixedFields,
} from './scope-kpi-mixed.service'

export const ensureSingleMeasurementOwner = (assignmentId?: number | null, scopeKpiId?: number | null) => {
  const ownerCount = [assignmentId, scopeKpiId].filter((value) => value !== null && value !== undefined).length
  if (ownerCount !== 1) {
    throw new Error('La medicion debe pertenecer a un unico owner')
  }
}

export const applyMeasurementToCollaboratorAssignment = async (
  assignmentId: number,
  value: number,
  mode: 'manual' | 'import' | 'auto',
  measurementId: number,
  criteriaVersionId?: number | null
) => {
  const [assignmentRows] = await pool.query<any[]>(
    `SELECT ck.target, ck.weight, ck.kpiId, ck.periodId, ck.collaboratorId
     FROM collaborator_kpis ck
     WHERE ck.id = ?`,
    [assignmentId]
  )
  if (!Array.isArray(assignmentRows) || assignmentRows.length === 0) return

  const assignment = assignmentRows[0]
  const [kpiRows] = await pool.query<any[]>(`SELECT type, direction, formula FROM kpis WHERE id = ?`, [assignment.kpiId])

  const targetValue = Number(assignment.target ?? 0)
  if (!targetValue || targetValue <= 0) return

  const { variation, weightedResult } = calculateKpiResult({
    target: targetValue,
    actual: value,
    weight: Number(assignment.weight ?? 0),
    direction: kpiRows?.[0]?.direction,
    type: kpiRows?.[0]?.type,
    formula: kpiRows?.[0]?.formula,
  })

  await pool.query(
    `UPDATE collaborator_kpis
     SET actual = ?, variation = ?, weightedResult = ?, inputMode = ?, lastMeasurementId = ?, activeCriteriaVersionId = COALESCE(activeCriteriaVersionId, ?)
     WHERE id = ?`,
    [value, variation, weightedResult, mode, measurementId, criteriaVersionId || null, assignmentId]
  )

  await recalcSummaryAssignment(assignment.collaboratorId, assignment.kpiId, assignment.periodId)
}

export const applyMeasurementToScopeKpi = async (
  scopeKpiId: number,
  value: number,
  mode: 'manual' | 'import' | 'auto',
  measurementId: number,
  component: 'direct' | 'aggregated' = 'direct'
) => {
  const [rows] = await pool.query<any[]>(
    `SELECT sk.id, sk.target, sk.weight, sk.kpiId, sk.sourceMode, sk.actual, sk.directActual, sk.aggregatedActual, sk.mixedConfig
     FROM scope_kpis sk
     WHERE sk.id = ?`,
    [scopeKpiId]
  )
  if (!Array.isArray(rows) || rows.length === 0) return

  const scopeKpi = hydrateScopeKpiMixedFields(rows[0])
  let directActual = scopeKpi.directActual
  let aggregatedActual = scopeKpi.aggregatedActual

  if (scopeKpi.sourceMode === 'mixed') {
    if (component === 'aggregated') {
      aggregatedActual = value
    } else {
      directActual = value
    }
  } else if (scopeKpi.sourceMode === 'aggregated') {
    aggregatedActual = value
  } else {
    directActual = value
  }

  const actual = computeScopeKpiActual({
    sourceMode: scopeKpi.sourceMode,
    directActual,
    aggregatedActual,
    fallbackActual: scopeKpi.actual,
    mixedConfig: scopeKpi.mixedConfig,
  })
  const { variation, weightedResult } = await computeScopeKpiMetrics({
    kpiId: scopeKpi.kpiId,
    target: Number(scopeKpi.target ?? 0),
    weight: Number(scopeKpi.weight ?? 0),
    actual,
  })

  await pool.query(
    `UPDATE scope_kpis
     SET actual = ?, directActual = ?, aggregatedActual = ?, variation = ?, weightedResult = ?, inputMode = ?, lastMeasurementId = ?
     WHERE id = ?`,
    [actual, directActual, aggregatedActual, variation, weightedResult, mode, measurementId, scopeKpiId]
  )

  return { actual, directActual, aggregatedActual, variation, weightedResult }
}
