import { pool } from '../config/database'
import { ensureAssignmentEditable, ensurePeriodOpen, closeKpiRecord, reopenKpiRecord } from './kpi-assignment-shared.service'
import { applyMeasurementToScopeKpi } from './measurement-application.service'
import {
  computeScopeKpiActual,
  computeScopeKpiMetrics,
  hydrateScopeKpiMixedFields,
  parseScopeKpiMixedConfig,
  serializeScopeKpiMixedConfig,
  type ScopeKpiMixedConfig,
} from './scope-kpi-mixed.service'

type ScopeKPIInput = {
  name: string
  description?: string | null
  kpiId: number
  orgScopeId: number
  periodId: number
  subPeriodId?: number | null
  ownerLevel: 'team' | 'area' | 'business_unit' | 'company' | 'executive'
  sourceMode: 'direct' | 'aggregated' | 'mixed'
  target: number
  weight: number
  status?: 'draft' | 'proposed' | 'approved' | 'closed'
  inputMode?: 'manual' | 'import' | 'auto'
  curationStatus?: 'pending' | 'in_review' | 'approved' | 'rejected'
  mixedConfig?: ScopeKpiMixedConfig | null
}

const normalizeScopeKpiPayload = (payload: ScopeKPIInput) => ({
  ...payload,
  mixedConfig: payload.sourceMode === 'mixed' ? parseScopeKpiMixedConfig(payload.mixedConfig) : null,
})

export const getScopeKPIByIdOrThrow = async (id: number) => {
  const [rows] = await pool.query<any[]>(
    `SELECT sk.*, p.status as periodStatus
     FROM scope_kpis sk
     JOIN periods p ON p.id = sk.periodId
     WHERE sk.id = ?`,
    [id]
  )
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Scope KPI no encontrado')
  }
  return hydrateScopeKpiMixedFields(rows[0])
}

export const validateScopeKPIInput = async (payload: ScopeKPIInput, currentId?: number) => {
  await ensurePeriodOpen(payload.periodId, 'No se pueden modificar Scope KPIs en períodos cerrados')
  const [scopeRows] = await pool.query<any[]>(`SELECT id FROM org_scopes WHERE id = ? LIMIT 1`, [payload.orgScopeId])
  if (!Array.isArray(scopeRows) || scopeRows.length === 0) {
    throw new Error('Scope organizacional no encontrado')
  }

  const [kpiRows] = await pool.query<any[]>(`SELECT id FROM kpis WHERE id = ? LIMIT 1`, [payload.kpiId])
  if (!Array.isArray(kpiRows) || kpiRows.length === 0) {
    throw new Error('KPI no encontrado')
  }

  const [dupRows] = await pool.query<any[]>(
    `SELECT id FROM scope_kpis
     WHERE kpiId = ? AND orgScopeId = ? AND periodId = ? AND (
       (subPeriodId IS NULL AND ? IS NULL) OR subPeriodId = ?
     ) AND (? IS NULL OR id <> ?)
     LIMIT 1`,
    [
      payload.kpiId,
      payload.orgScopeId,
      payload.periodId,
      payload.subPeriodId || null,
      payload.subPeriodId || null,
      currentId || null,
      currentId || null,
    ]
  )
  if (Array.isArray(dupRows) && dupRows.length > 0) {
    throw new Error('Ya existe un Scope KPI para ese KPI, scope, período y subperíodo')
  }

  if (payload.sourceMode === 'mixed') {
    const mixedConfig = parseScopeKpiMixedConfig(payload.mixedConfig)
    if (!mixedConfig) {
      throw new Error('mixedConfig inválido para sourceMode mixed')
    }
  }
}

export const createScopeKPIRecord = async (payload: ScopeKPIInput) => {
  const normalizedPayload = normalizeScopeKpiPayload(payload)
  await validateScopeKPIInput(normalizedPayload)
  const [result] = await pool.query(
    `INSERT INTO scope_kpis
     (name, description, kpiId, orgScopeId, periodId, subPeriodId, ownerLevel, sourceMode, mixedConfig, target, weight, status, inputMode, curationStatus)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      normalizedPayload.name,
      normalizedPayload.description || null,
      normalizedPayload.kpiId,
      normalizedPayload.orgScopeId,
      normalizedPayload.periodId,
      normalizedPayload.subPeriodId || null,
      normalizedPayload.ownerLevel,
      normalizedPayload.sourceMode,
      serializeScopeKpiMixedConfig(normalizedPayload.mixedConfig),
      normalizedPayload.target,
      normalizedPayload.weight,
      normalizedPayload.status || 'draft',
      normalizedPayload.inputMode || 'manual',
      normalizedPayload.curationStatus || 'pending',
    ]
  )
  return (result as any).insertId as number
}

export const updateScopeKPIRecord = async (id: number, payload: ScopeKPIInput) => {
  const current = await getScopeKPIByIdOrThrow(id)
  const normalizedPayload = normalizeScopeKpiPayload(payload)
  ensureAssignmentEditable({ status: current.status, periodStatus: current.periodStatus, closedMessage: 'No se puede editar un Scope KPI cerrado' })
  await validateScopeKPIInput(normalizedPayload, id)
  const nextSourceMode = normalizedPayload.sourceMode
  const nextMixedConfig = nextSourceMode === 'mixed' ? normalizedPayload.mixedConfig : null
  let directActual = current.directActual
  let aggregatedActual = current.aggregatedActual

  if (nextSourceMode === 'mixed') {
    if (current.sourceMode === 'aggregated') {
      aggregatedActual = current.aggregatedActual ?? current.actual
    } else {
      directActual = current.directActual ?? current.actual
    }
  } else if (nextSourceMode === 'aggregated') {
    aggregatedActual = current.aggregatedActual ?? current.actual
  } else {
    directActual = current.directActual ?? current.actual
  }

  const nextActual = computeScopeKpiActual({
    sourceMode: nextSourceMode,
    directActual,
    aggregatedActual,
    fallbackActual: current.actual,
    mixedConfig: nextMixedConfig,
  })
  const { variation, weightedResult } = await computeScopeKpiMetrics({
    kpiId: normalizedPayload.kpiId,
    target: normalizedPayload.target,
    weight: normalizedPayload.weight,
    actual: nextActual,
  })
  await pool.query(
    `UPDATE scope_kpis
     SET name = ?, description = ?, kpiId = ?, orgScopeId = ?, periodId = ?, subPeriodId = ?,
         ownerLevel = ?, sourceMode = ?, mixedConfig = ?, directActual = ?, aggregatedActual = ?,
         target = ?, actual = ?, weight = ?, variation = ?, weightedResult = ?, status = ?, inputMode = ?, curationStatus = ?
     WHERE id = ?`,
    [
      normalizedPayload.name,
      normalizedPayload.description || null,
      normalizedPayload.kpiId,
      normalizedPayload.orgScopeId,
      normalizedPayload.periodId,
      normalizedPayload.subPeriodId || null,
      normalizedPayload.ownerLevel,
      nextSourceMode,
      serializeScopeKpiMixedConfig(nextMixedConfig),
      directActual,
      aggregatedActual,
      normalizedPayload.target,
      nextActual,
      normalizedPayload.weight,
      variation,
      weightedResult,
      normalizedPayload.status || 'draft',
      normalizedPayload.inputMode || 'manual',
      normalizedPayload.curationStatus || 'pending',
      id,
    ]
  )
}

export const closeScopeKPIRecord = async (id: number) => {
  await closeKpiRecord('scope_kpis', id)
}

export const reopenScopeKPIRecord = async (id: number) => {
  await reopenKpiRecord('scope_kpis', id, 'draft')
}

export const applyMeasurementToScopeKPI = async (
  scopeKpiId: number,
  value: number,
  mode: 'manual' | 'import' | 'auto',
  measurementId: number,
  component: 'direct' | 'aggregated' = 'direct'
) => {
  return applyMeasurementToScopeKpi(scopeKpiId, value, mode, measurementId, component)
}

export const getMacroKPIByIdOrThrow = getScopeKPIByIdOrThrow
export const validateMacroKPIInput = validateScopeKPIInput
export const createMacroKPIRecord = createScopeKPIRecord
export const updateMacroKPIRecord = updateScopeKPIRecord
export const closeMacroKPIRecord = closeScopeKPIRecord
export const reopenMacroKPIRecord = reopenScopeKPIRecord
export const applyMeasurementToMacroKPI = applyMeasurementToScopeKPI
