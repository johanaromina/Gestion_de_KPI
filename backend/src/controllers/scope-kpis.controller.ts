import { Request, Response } from 'express'
import { pool } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import {
  applyMeasurementToScopeKPI,
  closeScopeKPIRecord,
  createScopeKPIRecord,
  getScopeKPIByIdOrThrow,
  reopenScopeKPIRecord,
  updateScopeKPIRecord,
} from '../services/scope-kpi.service'
import { recalculateScopeKPI, recalcParentScopeKPIs } from '../services/scope-kpi-aggregation.service'
import { hydrateScopeKpiMixedFields } from '../services/scope-kpi-mixed.service'
import { recalcOKRsLinkedToScopeKpi } from '../services/okr.service'
import { logger } from '../utils/logger'

const isConfigUser = (req: Request) => {
  const user = (req as AuthRequest).user
  return !!(user?.hasSuperpowers || user?.permissions?.includes('config.manage'))
}

const ALLOWED_AGGREGATION_METHODS = new Set(['sum', 'avg', 'weighted_avg'])
const buildPlaceholders = (count: number) => Array.from({ length: count }, () => '?').join(', ')

const fetchObjectivesForScopeKpis = async (scopeKpiIds: number[]) => {
  const grouped = new Map<number, any[]>()
  if (scopeKpiIds.length === 0) return grouped

  const [rows] = await pool.query<any[]>(
    `SELECT otsk.scopeKpiId,
            ot.id,
            ot.name,
            ot.level,
            ot.parentId
     FROM objective_trees_scope_kpis otsk
     JOIN objective_trees ot ON ot.id = otsk.objectiveTreeId
     WHERE otsk.scopeKpiId IN (${buildPlaceholders(scopeKpiIds.length)})
     ORDER BY ot.level, ot.name ASC`,
    scopeKpiIds
  )

  ;(rows || []).forEach((row) => {
    const scopeKpiId = Number(row.scopeKpiId)
    const current = grouped.get(scopeKpiId) || []
    current.push({
      id: Number(row.id),
      name: row.name,
      level: row.level,
      parentId: row.parentId,
    })
    grouped.set(scopeKpiId, current)
  })

  return grouped
}

const attachObjectivesToScopeKpis = async (rows: any[]) => {
  const objectiveMap = await fetchObjectivesForScopeKpis(rows.map((row) => Number(row.id)).filter(Boolean))
  return rows.map((row) => {
    const hydratedRow = hydrateScopeKpiMixedFields(row)
    const objectives = objectiveMap.get(Number(row.id)) || []
    return {
      ...hydratedRow,
      objectives,
      objectiveIds: objectives.map((objective) => objective.id),
      objectiveNames: objectives.map((objective) => objective.name),
    }
  })
}

export const getScopeKPIs = async (req: Request, res: Response) => {
  try {
    const { periodId, orgScopeId, subPeriodId, kpiId } = req.query
    let query = `SELECT mk.*,
                        k.name as kpiName,
                        k.type as kpiType,
                        k.direction as kpiDirection,
                        os.name as orgScopeName,
                        os.type as orgScopeType,
                        p.name as periodName,
                        p.status as periodStatus,
                        sp.name as subPeriodName
                 FROM scope_kpis mk
                 JOIN kpis k ON k.id = mk.kpiId
                 JOIN org_scopes os ON os.id = mk.orgScopeId
                 JOIN periods p ON p.id = mk.periodId
                 LEFT JOIN calendar_subperiods sp ON sp.id = mk.subPeriodId
                 WHERE 1=1`
    const params: any[] = []
    if (periodId) {
      query += ' AND mk.periodId = ?'
      params.push(periodId)
    }
    if (orgScopeId) {
      query += ' AND mk.orgScopeId = ?'
      params.push(orgScopeId)
    }
    if (subPeriodId) {
      query += ' AND mk.subPeriodId = ?'
      params.push(subPeriodId)
    }
    if (kpiId) {
      query += ' AND mk.kpiId = ?'
      params.push(kpiId)
    }
    query += ' ORDER BY mk.createdAt DESC'
    const [rows] = await pool.query<any[]>(query, params)
    res.json(await attachObjectivesToScopeKpis(Array.isArray(rows) ? rows : []))
  } catch (error: any) {
    logger.error('Error fetching scope KPIs:', error)
    res.status(500).json({ error: 'Error al obtener Scope KPIs' })
  }
}

export const getScopeKPIById = async (req: Request, res: Response) => {
  try {
    const row = await getScopeKPIByIdOrThrow(Number(req.params.id))
    const [hydrated] = await attachObjectivesToScopeKpis([row])
    res.json(hydrated || row)
  } catch (error: any) {
    res.status(error?.message === 'Scope KPI no encontrado' ? 404 : 500).json({ error: error?.message || 'Error al obtener Scope KPI' })
  }
}

export const getScopeKPIObjectives = async (req: Request, res: Response) => {
  try {
    const scopeKpiId = Number(req.params.id)
    await getScopeKPIByIdOrThrow(scopeKpiId)
    const objectivesMap = await fetchObjectivesForScopeKpis([scopeKpiId])
    res.json(objectivesMap.get(scopeKpiId) || [])
  } catch (error: any) {
    const message = error?.message || 'Error al obtener objetivos del Scope KPI'
    logger.error('Error fetching scope KPI objectives:', error)
    res.status(message === 'Scope KPI no encontrado' ? 404 : 500).json({ error: message })
  }
}

export const getScopeKPIAggregationRuns = async (req: Request, res: Response) => {
  try {
    const scopeKpiId = Number(req.params.id)
    await getScopeKPIByIdOrThrow(scopeKpiId)
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 50)
    const [rows] = await pool.query<any[]>(
      `SELECT r.*,
              c.name as createdByName
       FROM scope_kpi_aggregation_runs r
       LEFT JOIN collaborators c ON c.id = r.createdBy
       WHERE r.scopeKpiId = ?
       ORDER BY r.createdAt DESC, r.id DESC
       LIMIT ?`,
      [scopeKpiId, limit]
    )

    const hydratedRows = (rows || []).map((row) => {
      let inputsSnapshot = null
      try {
        inputsSnapshot = row.inputsSnapshot ? JSON.parse(row.inputsSnapshot) : null
      } catch {
        inputsSnapshot = row.inputsSnapshot || null
      }

      const children =
        Array.isArray(inputsSnapshot?.children) ? inputsSnapshot.children : Array.isArray(inputsSnapshot) ? inputsSnapshot : []

      return {
        ...row,
        inputsSnapshot,
        inputCount: children.length,
      }
    })

    res.json(hydratedRows)
  } catch (error: any) {
    const message = error?.message || 'Error al obtener corridas de agregación del Scope KPI'
    logger.error('Error fetching scope KPI aggregation runs:', error)
    res.status(message === 'Scope KPI no encontrado' ? 404 : 500).json({ error: message })
  }
}

export const createScopeKPI = async (req: Request, res: Response) => {
  try {
    if (!isConfigUser(req)) {
      return res.status(403).json({ error: 'No autorizado' })
    }
    const id = await createScopeKPIRecord(req.body)
    res.status(201).json({ id })
  } catch (error: any) {
    logger.error('Error creating scope KPI:', error)
    res.status(400).json({ error: error?.message || 'Error al crear Scope KPI' })
  }
}

export const updateScopeKPI = async (req: Request, res: Response) => {
  try {
    if (!isConfigUser(req)) {
      return res.status(403).json({ error: 'No autorizado' })
    }
    await updateScopeKPIRecord(Number(req.params.id), req.body)
    res.json({ message: 'Scope KPI actualizado correctamente' })
  } catch (error: any) {
    logger.error('Error updating scope KPI:', error)
    res.status(400).json({ error: error?.message || 'Error al actualizar Scope KPI' })
  }
}

export const deleteScopeKPI = async (req: Request, res: Response) => {
  try {
    if (!isConfigUser(req)) {
      return res.status(403).json({ error: 'No autorizado' })
    }
    await pool.query(`DELETE FROM scope_kpis WHERE id = ?`, [req.params.id])
    res.json({ message: 'Scope KPI eliminado correctamente' })
  } catch (error: any) {
    logger.error('Error deleting scope KPI:', error)
    res.status(500).json({ error: 'Error al eliminar Scope KPI' })
  }
}

export const copyScopeKPI = async (req: Request, res: Response) => {
  try {
    if (!isConfigUser(req)) {
      return res.status(403).json({ error: 'No autorizado' })
    }

    const sourceId = Number(req.params.id)
    const { targetScopeIds, copyLinks = false } = req.body

    if (!Array.isArray(targetScopeIds) || targetScopeIds.length === 0) {
      return res.status(400).json({ error: 'targetScopeIds debe ser un array no vacío' })
    }

    const source = await getScopeKPIByIdOrThrow(sourceId)
    const normalizedTargetScopeIds = Array.from(
      new Set(
        targetScopeIds
          .map((rawId: unknown) => Number(rawId))
          .filter((scopeId) => Number.isFinite(scopeId) && scopeId > 0)
      )
    )
    if (normalizedTargetScopeIds.length === 0) {
      return res.status(400).json({ error: 'targetScopeIds no contiene IDs válidos' })
    }

    const [scopeRows] = await pool.query<any[]>(
      `SELECT id, name, type
       FROM org_scopes
       WHERE id IN (${buildPlaceholders(normalizedTargetScopeIds.length + 1)})`,
      [Number(source.orgScopeId), ...normalizedTargetScopeIds]
    )
    const scopeById = new Map((Array.isArray(scopeRows) ? scopeRows : []).map((row) => [Number(row.id), row]))
    const sourceScope = scopeById.get(Number(source.orgScopeId))
    if (!sourceScope) {
      return res.status(404).json({ error: 'Scope origen no encontrado' })
    }

    // Only copy scope→scope links; collaborator links belong to the other team's assignments
    let links: any[] = []
    if (copyLinks) {
      const [linkRows] = await pool.query<any[]>(
        `SELECT l.*,
                skChild.kpiId AS childKpiId,
                skChild.orgScopeId AS childOrgScopeId,
                skChild.periodId AS childPeriodId,
                skChild.subPeriodId AS childSubPeriodId
         FROM scope_kpi_links l
         JOIN scope_kpis skChild ON skChild.id = l.childScopeKpiId
         WHERE l.scopeKpiId = ? AND l.childType = 'scope'
         ORDER BY l.sortOrder, l.id`,
        [sourceId]
      )
      links = Array.isArray(linkRows) ? linkRows : []
    }

    const childLinkTargetCache = new Map<string, number | null>()
    const results: {
      orgScopeId: number
      status: 'created' | 'skipped'
      newId?: number
      reason?: string
      copiedLinksCount?: number
      skippedLinksCount?: number
    }[] = []

    for (const rawScopeId of normalizedTargetScopeIds) {
      const orgScopeId = Number(rawScopeId)
      if (orgScopeId === source.orgScopeId) {
        results.push({ orgScopeId, status: 'skipped', reason: 'Es el equipo origen' })
        continue
      }

      const targetScope = scopeById.get(orgScopeId)
      if (!targetScope) {
        results.push({ orgScopeId, status: 'skipped', reason: 'El scope destino no existe' })
        continue
      }

      if (targetScope.type !== sourceScope.type) {
        results.push({ orgScopeId, status: 'skipped', reason: 'El destino no es del mismo tipo que el origen' })
        continue
      }

      const [existing] = await pool.query<any[]>(
        `SELECT id FROM scope_kpis
         WHERE kpiId = ? AND orgScopeId = ? AND periodId = ?
            AND (subPeriodId <=> ?)`,
        [source.kpiId, orgScopeId, source.periodId, source.subPeriodId ?? null]
      )
        if (Array.isArray(existing) && existing.length > 0) {
          results.push({ orgScopeId, status: 'skipped', reason: 'Ya existe un KPI grupal con esa combinación' })
          continue
        }

      const newId = await createScopeKPIRecord({
        name: source.name,
        description: source.description ?? null,
        kpiId: source.kpiId,
        orgScopeId,
        periodId: source.periodId,
        subPeriodId: source.subPeriodId ?? null,
        ownerLevel: source.ownerLevel,
        sourceMode: source.sourceMode,
        mixedConfig: source.mixedConfig ?? null,
        target: source.target,
        weight: source.weight,
        status: 'draft',
        inputMode: source.inputMode || 'manual',
        curationStatus: 'pending',
      })

      let copiedLinksCount = 0
      let skippedLinksCount = 0

      if (copyLinks && links.length > 0) {
        for (const link of links) {
          // Solo se remapean hijos scope que pertenecen al mismo ámbito que el origen.
          // Si apuntan a otro scope, no hay equivalencia segura para el nuevo destino.
          if (Number(link.childOrgScopeId) !== Number(source.orgScopeId)) {
            skippedLinksCount += 1
            continue
          }

          const cacheKey = [link.childKpiId, orgScopeId, link.childPeriodId, link.childSubPeriodId ?? 'null'].join(':')
          let targetChildScopeKpiId = childLinkTargetCache.get(cacheKey)

          if (targetChildScopeKpiId === undefined) {
            const [targetChildRows] = await pool.query<any[]>(
              `SELECT id
               FROM scope_kpis
               WHERE kpiId = ? AND orgScopeId = ? AND periodId = ?
                 AND (subPeriodId <=> ?)
               LIMIT 1`,
              [link.childKpiId, orgScopeId, link.childPeriodId, link.childSubPeriodId ?? null]
            )
            targetChildScopeKpiId = Array.isArray(targetChildRows) && targetChildRows[0]
              ? Number(targetChildRows[0].id)
              : null
            childLinkTargetCache.set(cacheKey, targetChildScopeKpiId)
          }

          if (!targetChildScopeKpiId) {
            skippedLinksCount += 1
            continue
          }

          await pool.query(
            `INSERT INTO scope_kpi_links
             (scopeKpiId, childType, childScopeKpiId, contributionWeight, aggregationMethod, sortOrder)
             VALUES (?, 'scope', ?, ?, ?, ?)`,
            [newId, targetChildScopeKpiId, link.contributionWeight ?? null, link.aggregationMethod || 'weighted_avg', link.sortOrder || 0]
          )
          copiedLinksCount += 1
        }
      }

      results.push({ orgScopeId, status: 'created', newId, copiedLinksCount, skippedLinksCount })
    }

    res.status(201).json({ results })
  } catch (error: any) {
    logger.error('Error copying scope KPI:', error)
    res.status(error?.message === 'Scope KPI no encontrado' ? 404 : 500).json({ error: error?.message || 'Error al copiar KPI grupal' })
  }
}

export const closeScopeKPI = async (req: Request, res: Response) => {
  try {
    if (!isConfigUser(req)) {
      return res.status(403).json({ error: 'No autorizado' })
    }
    await closeScopeKPIRecord(Number(req.params.id))
    res.json({ message: 'Scope KPI cerrado correctamente' })
  } catch (error: any) {
    logger.error('Error closing scope KPI:', error)
    res.status(500).json({ error: 'Error al cerrar Scope KPI' })
  }
}

export const reopenScopeKPI = async (req: Request, res: Response) => {
  try {
    if (!isConfigUser(req)) {
      return res.status(403).json({ error: 'No autorizado' })
    }
    await reopenScopeKPIRecord(Number(req.params.id))
    res.json({ message: 'Scope KPI reabierto correctamente' })
  } catch (error: any) {
    logger.error('Error reopening scope KPI:', error)
    res.status(500).json({ error: 'Error al reabrir Scope KPI' })
  }
}

export const recalculateScopeKPIController = async (req: Request, res: Response) => {
  try {
    const scopeKpiId = Number(req.params.id)
    const result = await recalculateScopeKPI(scopeKpiId, (req as AuthRequest).user?.id || null)

    // Propagar hacia OKRs que usan este scope_kpi como fuente de datos
    recalcOKRsLinkedToScopeKpi(scopeKpiId).catch((err) =>
      logger.error('[OKR propagation] scopeKpi→OKR:', err)
    )
    recalcParentScopeKPIs(scopeKpiId, (sid) =>
      recalcOKRsLinkedToScopeKpi(sid).catch((err) =>
        logger.error('[scopeKpi] parent cascade→OKR:', err)
      )
    ).catch((err) => logger.error('[scopeKpi] parent scopeKpi cascade:', err))

    res.json({ message: 'Scope KPI recalculado correctamente', ...result })
  } catch (error: any) {
    logger.error('Error recalculating scope KPI:', error)
    res.status(400).json({ error: error?.message || 'Error al recalcular Scope KPI' })
  }
}

export const getScopeKPILinks = async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT l.*,
              ck.id as collaboratorAssignmentIdValue,
              c.name as collaboratorName,
              k.name as collaboratorKpiName,
              mkChild.name as childScopeKpiName
       FROM scope_kpi_links l
       LEFT JOIN collaborator_kpis ck ON ck.id = l.collaboratorAssignmentId
       LEFT JOIN collaborators c ON c.id = ck.collaboratorId
       LEFT JOIN kpis k ON k.id = ck.kpiId
       LEFT JOIN scope_kpis mkChild ON mkChild.id = l.childScopeKpiId
       WHERE l.scopeKpiId = ?
       ORDER BY COALESCE(l.sortOrder, 0), l.id`,
      [req.params.id]
    )
    res.json(rows)
  } catch (error: any) {
    logger.error('Error fetching scope KPI links:', error)
    res.status(500).json({ error: 'Error al obtener links del Scope KPI' })
  }
}

export const createScopeKPILink = async (req: Request, res: Response) => {
  try {
    if (!isConfigUser(req)) {
      return res.status(403).json({ error: 'No autorizado' })
    }
    const scopeKpiId = Number(req.params.id)
    const { childType, collaboratorAssignmentId, childScopeKpiId, contributionWeight, aggregationMethod, formulaConfig, sortOrder } = req.body
    if (!childType || !aggregationMethod) {
      return res.status(400).json({ error: 'childType y aggregationMethod son requeridos' })
    }
    if (!['collaborator', 'scope'].includes(childType)) {
      return res.status(400).json({ error: 'childType inválido' })
    }
    if (!ALLOWED_AGGREGATION_METHODS.has(aggregationMethod)) {
      return res.status(400).json({ error: 'aggregationMethod inválido. Solo se soporta sum, avg y weighted_avg' })
    }
    if (childType === 'collaborator' && (!collaboratorAssignmentId || childScopeKpiId)) {
      return res.status(400).json({ error: 'collaboratorAssignmentId es requerido para childType collaborator' })
    }
    if (childType === 'scope' && (!childScopeKpiId || collaboratorAssignmentId)) {
      return res.status(400).json({ error: 'childScopeKpiId es requerido para childType scope' })
    }
    const [result] = await pool.query(
      `INSERT INTO scope_kpi_links
       (scopeKpiId, childType, collaboratorAssignmentId, childScopeKpiId, contributionWeight, aggregationMethod, formulaConfig, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        scopeKpiId,
        childType,
        collaboratorAssignmentId || null,
        childScopeKpiId || null,
        contributionWeight ?? null,
        aggregationMethod,
        formulaConfig ? JSON.stringify(formulaConfig) : null,
        sortOrder ?? 0,
      ]
    )
    res.status(201).json({ id: (result as any).insertId })
  } catch (error: any) {
    logger.error('Error creating scope KPI link:', error)
    res.status(500).json({ error: 'Error al crear link del Scope KPI' })
  }
}

export const updateScopeKPILink = async (req: Request, res: Response) => {
  try {
    if (!isConfigUser(req)) {
      return res.status(403).json({ error: 'No autorizado' })
    }
    const { childType, collaboratorAssignmentId, childScopeKpiId, contributionWeight, aggregationMethod, formulaConfig, sortOrder } = req.body
    if (!['collaborator', 'scope'].includes(childType)) {
      return res.status(400).json({ error: 'childType inválido' })
    }
    if (!ALLOWED_AGGREGATION_METHODS.has(aggregationMethod)) {
      return res.status(400).json({ error: 'aggregationMethod inválido. Solo se soporta sum, avg y weighted_avg' })
    }
    if (childType === 'collaborator' && (!collaboratorAssignmentId || childScopeKpiId)) {
      return res.status(400).json({ error: 'collaboratorAssignmentId es requerido para childType collaborator' })
    }
    if (childType === 'scope' && (!childScopeKpiId || collaboratorAssignmentId)) {
      return res.status(400).json({ error: 'childScopeKpiId es requerido para childType scope' })
    }
    await pool.query(
      `UPDATE scope_kpi_links
       SET childType = ?, collaboratorAssignmentId = ?, childScopeKpiId = ?, contributionWeight = ?,
           aggregationMethod = ?, formulaConfig = ?, sortOrder = ?
       WHERE id = ?`,
      [
        childType,
        collaboratorAssignmentId || null,
        childScopeKpiId || null,
        contributionWeight ?? null,
        aggregationMethod,
        formulaConfig ? JSON.stringify(formulaConfig) : null,
        sortOrder ?? 0,
        req.params.linkId,
      ]
    )
    res.json({ message: 'Link actualizado correctamente' })
  } catch (error: any) {
    logger.error('Error updating scope KPI link:', error)
    res.status(500).json({ error: 'Error al actualizar link del Scope KPI' })
  }
}

export const deleteScopeKPILink = async (req: Request, res: Response) => {
  try {
    if (!isConfigUser(req)) {
      return res.status(403).json({ error: 'No autorizado' })
    }
    await pool.query(`DELETE FROM scope_kpi_links WHERE id = ?`, [req.params.linkId])
    res.json({ message: 'Link eliminado correctamente' })
  } catch (error: any) {
    logger.error('Error deleting scope KPI link:', error)
    res.status(500).json({ error: 'Error al eliminar link del Scope KPI' })
  }
}

export const createScopeMeasurement = async (scopeKpiId: number, value: number, mode: 'manual' | 'import' | 'auto', userId?: number | null) => {
  const [result] = await pool.query(
    `INSERT INTO kpi_measurements
     (assignmentId, scopeKpiId, periodId, subPeriodId, value, mode, status, capturedBy)
     SELECT NULL, sk.id, sk.periodId, sk.subPeriodId, ?, ?, 'approved', ?
     FROM scope_kpis sk
     WHERE sk.id = ?`,
    [value, mode, userId || null, scopeKpiId]
  )
  const measurementId = (result as any).insertId as number
  await applyMeasurementToScopeKPI(scopeKpiId, value, mode, measurementId)
  recalcParentScopeKPIs(scopeKpiId, (sid) =>
    recalcOKRsLinkedToScopeKpi(sid).catch((err) =>
      logger.error('[scopeKpi] parent cascade→OKR:', err)
    )
  ).catch((err) => logger.error('[scopeKpi] parent scopeKpi cascade:', err))
  recalcOKRsLinkedToScopeKpi(scopeKpiId).catch((err) =>
    logger.error('[scopeKpi] scopeKpi→OKR propagation:', err)
  )
  return measurementId
}

export const getMacroKPIs = getScopeKPIs
export const getMacroKPIById = getScopeKPIById
export const createMacroKPI = createScopeKPI
export const updateMacroKPI = updateScopeKPI
export const deleteMacroKPI = deleteScopeKPI
export const closeMacroKPI = closeScopeKPI
export const reopenMacroKPI = reopenScopeKPI
export const recalculateMacroKPIController = recalculateScopeKPIController
export const getMacroKPILinks = getScopeKPILinks
export const createMacroKPILink = createScopeKPILink
export const updateMacroKPILink = updateScopeKPILink
export const deleteMacroKPILink = deleteScopeKPILink
export const createMacroMeasurement = createScopeMeasurement
