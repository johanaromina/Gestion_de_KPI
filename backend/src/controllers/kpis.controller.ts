import { Request, Response } from 'express'
import { PoolConnection } from 'mysql2/promise'
import { pool } from '../config/database'
import { KPI, KPIDirection } from '../types'
import {
  calculateVariation,
  calculateWeightedResult,
  validateFormula,
} from '../utils/kpi-formulas'
import { recalculateScopeKPI } from '../services/scope-kpi-aggregation.service'
import { computeScopeKpiMetrics } from '../services/scope-kpi-mixed.service'
import { AuthRequest } from '../middleware/auth.middleware'
import { recalcOKRsLinkedToScopeKpi } from '../services/okr.service'
import { logger } from '../utils/logger'
import {
  parseKpiName,
  parseKpiType,
  resolveKpiDirectionInput,
  VALID_KPI_TYPES,
} from '../services/kpi-definition.service'

const isConfigUser = (req: Request) => {
  const user = (req as AuthRequest).user
  return !!(user?.hasSuperpowers || user?.permissions?.includes('config.manage'))
}

const normalizeOptionalText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const bulkUpdateCollaboratorKpiMetrics = async (
  conn: PoolConnection,
  rows: any[],
  direction: KPIDirection,
  customFormula?: string | null
) => {
  if (!Array.isArray(rows) || rows.length === 0) return

  const recalculated = rows.map((row) => {
    const variation = calculateVariation(
      direction,
      Number(row.target ?? 0),
      Number(row.actual ?? 0),
      customFormula || undefined
    )
    const weightedResult = calculateWeightedResult(variation, Number(row.weight ?? 0))
    return {
      id: Number(row.id),
      variation,
      weightedResult,
    }
  })

  const variationCases = recalculated.map(() => 'WHEN ? THEN ?').join(' ')
  const weightedCases = recalculated.map(() => 'WHEN ? THEN ?').join(' ')
  const ids = recalculated.map((row) => row.id)

  await conn.query(
    `UPDATE collaborator_kpis
     SET variation = CASE id ${variationCases} END,
         weightedResult = CASE id ${weightedCases} END
     WHERE id IN (${ids.map(() => '?').join(',')})`,
    [
      ...recalculated.flatMap((row) => [row.id, row.variation]),
      ...recalculated.flatMap((row) => [row.id, row.weightedResult]),
      ...ids,
    ]
  )
}

// Run once at module load — not on every request
pool.query(`
  CREATE TABLE IF NOT EXISTS kpi_periods (
    kpiId INT NOT NULL,
    periodId INT NOT NULL,
    PRIMARY KEY (kpiId, periodId)
  )
`).catch((err) => logger.error('[kpis] ensureKPIPeriodsTable failed:', err))

export const getKPIs = async (req: Request, res: Response) => {
  try {
    const { area, areaId, periodId } = req.query

    let query = 'SELECT * FROM kpis'
    const params: any[] = []
    const where: string[] = []

    if (areaId) {
      where.push(
        `EXISTS (
          SELECT 1
          FROM kpi_areas ka
          JOIN areas a ON a.name = ka.area
          WHERE ka.kpiId = kpis.id AND a.id = ?
        )`
      )
      params.push(areaId)
    } else if (area) {
      where.push('EXISTS (SELECT 1 FROM kpi_areas ka WHERE ka.kpiId = kpis.id AND ka.area = ?)')
      params.push(area)
    }
    if (periodId) {
      where.push('EXISTS (SELECT 1 FROM kpi_periods kp WHERE kp.kpiId = kpis.id AND kp.periodId = ?)')
      params.push(periodId)
    }
    if (where.length > 0) {
      query += ' WHERE ' + where.join(' AND ')
    }

    query += ' ORDER BY name ASC'

    const [rows] = await pool.query<KPI[]>(query, params)

    const ids = Array.isArray(rows) ? rows.map((r) => r.id) : []
    let periodsMap: Record<number, number[]> = {}
    let weightsMap: Record<number, Array<{ scopeId: number; weight: number }>> = {}
    if (ids.length > 0) {
      const [periodRows] = await pool.query<any[]>(
        `SELECT kpiId, periodId FROM kpi_periods WHERE kpiId IN (${ids.map(() => '?').join(',')})`,
        ids
      )
      periodsMap = (periodRows || []).reduce((acc: Record<number, number[]>, row: any) => {
        if (!acc[row.kpiId]) acc[row.kpiId] = []
        acc[row.kpiId].push(Number(row.periodId))
        return acc
      }, {})

      const [weightRows] = await pool.query<any[]>(
        `SELECT kpiId, scopeId, weight FROM kpi_scope_weights WHERE kpiId IN (${ids.map(() => '?').join(',')})`,
        ids
      )
      weightsMap = (weightRows || []).reduce(
        (acc: Record<number, Array<{ scopeId: number; weight: number }>>, row: any) => {
          if (!acc[row.kpiId]) acc[row.kpiId] = []
          acc[row.kpiId].push({ scopeId: Number(row.scopeId), weight: Number(row.weight) })
          return acc
        },
        {}
      )
    }

    const enriched = Array.isArray(rows)
      ? rows.map((r) => ({
          ...r,
          periodIds: periodsMap[r.id] || [],
          scopeWeights: weightsMap[r.id] || [],
        }))
      : []

    res.json(enriched)
  } catch (error: any) {
    logger.error('Error fetching KPIs:', error)
    res.status(500).json({ error: 'Error al obtener KPIs' })
  }
}

export const getKPIById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query<KPI[]>(
      'SELECT * FROM kpis WHERE id = ?',
      [id]
    )

    if (Array.isArray(rows) && rows.length === 0) {
      return res.status(404).json({ error: 'KPI no encontrado' })
    }

    const [areasRows] = await pool.query<any[]>('SELECT area FROM kpi_areas WHERE kpiId = ? ORDER BY area ASC', [id])

    const areas = Array.isArray(areasRows) ? areasRows.map((a) => a.area) : []

    const [periodRows] = await pool.query<any[]>(
      'SELECT periodId FROM kpi_periods WHERE kpiId = ? ORDER BY periodId ASC',
      [id]
    )
    const periodIds = Array.isArray(periodRows) ? periodRows.map((p) => Number(p.periodId)) : []

    const [weightsRows] = await pool.query<any[]>(
      'SELECT scopeId, weight FROM kpi_scope_weights WHERE kpiId = ?',
      [id]
    )

    res.json({ ...rows[0], areas, periodIds, scopeWeights: weightsRows || [] })
  } catch (error: any) {
    logger.error('Error fetching KPI:', error)
    res.status(500).json({ error: 'Error al obtener KPI' })
  }
}

export const createKPI = async (req: Request, res: Response) => {
  if (!isConfigUser(req)) return res.status(403).json({ error: 'Sin autorización para crear definiciones KPI' })
  try {
    const {
      name,
      description,
      type,
      direction,
      criteria,
      formula,
      macroKPIId,
      areas,
      periodIds,
      defaultDataSource,
      defaultCriteriaTemplate,
      defaultCalcRule,
      scopeWeights,
    } = req.body

    const normalizedName = parseKpiName(name)
    if (!normalizedName) {
      return res.status(400).json({ error: 'El nombre es requerido' })
    }

    const normalizedType = parseKpiType(type)
    if (!normalizedType) {
      return res.status(400).json({
        error: `Tipo de KPI inválido. Valores permitidos: ${VALID_KPI_TYPES.join(', ')}`,
      })
    }

    const normalizedDescription = normalizeOptionalText(description)
    const normalizedCriteria = normalizeOptionalText(criteria)
    const normalizedFormula = normalizeOptionalText(formula)
    const normalizedDefaultDataSource = normalizeOptionalText(defaultDataSource)
    const normalizedDefaultCriteriaTemplate = normalizeOptionalText(defaultCriteriaTemplate)
    const normalizedDefaultCalcRule = normalizeOptionalText(defaultCalcRule)
    const resolvedDirection = resolveKpiDirectionInput(normalizedType, direction)

    // Validar fórmula si se proporciona
    if (normalizedFormula) {
      const validation = validateFormula(normalizedFormula)
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error })
      }
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const [result] = await conn.query(
        `INSERT INTO kpis 
         (name, description, type, direction, criteria, formula, macroKPIId, defaultDataSource, defaultCriteriaTemplate, defaultCalcRule) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          normalizedName,
          normalizedDescription,
          normalizedType,
          resolvedDirection,
          normalizedCriteria,
          normalizedFormula,
          macroKPIId || null,
          normalizedDefaultDataSource,
          normalizedDefaultCriteriaTemplate,
          normalizedDefaultCalcRule,
        ]
      )

      const insertResult = result as any
      const kpiId = insertResult.insertId

      if (Array.isArray(areas) && areas.length > 0) {
        const values = areas
          .filter((a: any) => typeof a === 'string' && a.trim())
          .map((a: string) => [kpiId, a.trim()])

        if (values.length > 0) {
          await conn.query(`INSERT INTO kpi_areas (kpiId, area) VALUES ?`, [values])
        }
      }

      if (Array.isArray(periodIds)) {
        const values = periodIds
          .filter((p: any) => Number.isFinite(Number(p)))
          .map((p: number) => [kpiId, Number(p)])
        if (values.length > 0) {
          await conn.query(`INSERT INTO kpi_periods (kpiId, periodId) VALUES ?`, [values])
        }
      }

      if (Array.isArray(scopeWeights) && scopeWeights.length > 0) {
        const values = scopeWeights
          .filter((item: any) => Number.isFinite(Number(item.scopeId)))
          .map((item: any) => [kpiId, Number(item.scopeId), Number(item.weight) || 0])
        if (values.length > 0) {
          await conn.query(
            `INSERT INTO kpi_scope_weights (kpiId, scopeId, weight) VALUES ?`,
            [values]
          )
        }
      }

      await conn.commit()

      res.status(201).json({
        id: kpiId,
        name: normalizedName,
        description: normalizedDescription,
        type: normalizedType,
        direction: resolvedDirection,
        criteria: normalizedCriteria,
        formula: normalizedFormula,
        macroKPIId: macroKPIId || null,
        defaultDataSource: normalizedDefaultDataSource,
        defaultCriteriaTemplate: normalizedDefaultCriteriaTemplate,
        defaultCalcRule: normalizedDefaultCalcRule,
        areas: Array.isArray(areas) ? areas : [],
        scopeWeights: Array.isArray(scopeWeights) ? scopeWeights : [],
        periodIds: Array.isArray(periodIds)
          ? periodIds.filter((p: any) => Number.isFinite(Number(p))).map((p: number) => Number(p))
          : [],
      })
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  } catch (error: any) {
    logger.error('Error creating KPI:', error)
    res.status(500).json({ error: 'Error al crear KPI' })
  }
}

export const updateKPI = async (req: Request, res: Response) => {
  if (!isConfigUser(req)) return res.status(403).json({ error: 'Sin autorización para editar definiciones KPI' })
  try {
    const { id } = req.params
    const {
      name,
      description,
      type,
      direction,
      criteria,
      formula,
      macroKPIId,
      areas,
      periodIds,
      defaultDataSource,
      defaultCriteriaTemplate,
      defaultCalcRule,
      scopeWeights,
    } = req.body

    const normalizedName = parseKpiName(name)
    if (!normalizedName) {
      return res.status(400).json({ error: 'El nombre es requerido' })
    }

    const normalizedType = parseKpiType(type)
    if (!normalizedType) {
      return res.status(400).json({
        error: `Tipo de KPI inválido. Valores permitidos: ${VALID_KPI_TYPES.join(', ')}`,
      })
    }

    const normalizedDescription = normalizeOptionalText(description)
    const normalizedCriteria = normalizeOptionalText(criteria)
    const normalizedFormula = normalizeOptionalText(formula)
    const normalizedDefaultDataSource = normalizeOptionalText(defaultDataSource)
    const normalizedDefaultCriteriaTemplate = normalizeOptionalText(defaultCriteriaTemplate)
    const normalizedDefaultCalcRule = normalizeOptionalText(defaultCalcRule)

    // Validar fórmula si se proporciona
    if (normalizedFormula) {
      const validation = validateFormula(normalizedFormula)
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error })
      }
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const resolvedDirection = resolveKpiDirectionInput(normalizedType, direction)

      const [updateResult] = await conn.query(
        `UPDATE kpis 
         SET name = ?, description = ?, type = ?, direction = ?, criteria = ?, formula = ?, macroKPIId = ?,
             defaultDataSource = ?, defaultCriteriaTemplate = ?, defaultCalcRule = ?
         WHERE id = ?`,
        [
          normalizedName,
          normalizedDescription,
          normalizedType,
          resolvedDirection,
          normalizedCriteria,
          normalizedFormula,
          macroKPIId || null,
          normalizedDefaultDataSource,
          normalizedDefaultCriteriaTemplate,
          normalizedDefaultCalcRule,
          id,
        ]
      )
      if (Number((updateResult as any).affectedRows || 0) === 0) {
        await conn.rollback()
        return res.status(404).json({ error: 'KPI no encontrado' })
      }

      if (Array.isArray(areas)) {
        await conn.query('DELETE FROM kpi_areas WHERE kpiId = ?', [id])
        const values = areas
          .filter((a: any) => typeof a === 'string' && a.trim())
          .map((a: string) => [id, a.trim()])

        if (values.length > 0) {
          await conn.query(`INSERT INTO kpi_areas (kpiId, area) VALUES ?`, [values])
        }
      }

      if (Array.isArray(periodIds)) {
        await conn.query('DELETE FROM kpi_periods WHERE kpiId = ?', [id])
        const values = periodIds
          .filter((p: any) => Number.isFinite(Number(p)))
          .map((p: number) => [id, Number(p)])
        if (values.length > 0) {
          await conn.query(`INSERT INTO kpi_periods (kpiId, periodId) VALUES ?`, [values])
        }
      }

      if (Array.isArray(scopeWeights)) {
        await conn.query('DELETE FROM kpi_scope_weights WHERE kpiId = ?', [id])
        const values = scopeWeights
          .filter((item: any) => Number.isFinite(Number(item.scopeId)))
          .map((item: any) => [id, Number(item.scopeId), Number(item.weight) || 0])
        if (values.length > 0) {
          await conn.query(
            `INSERT INTO kpi_scope_weights (kpiId, scopeId, weight) VALUES ?`,
            [values]
          )
        }
      }

      // Recalcular las asignaciones existentes con el nuevo tipo/fórmula
      const [affectedAssignments] = await conn.query<any[]>(
        'SELECT id, target, actual, weight FROM collaborator_kpis WHERE kpiId = ?',
        [id]
      )

      await bulkUpdateCollaboratorKpiMetrics(
        conn,
        affectedAssignments,
        resolvedDirection,
        normalizedFormula
      )

      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }

    // Recalcular scope KPIs afectados por el cambio de definición KPI
    ;(async () => {
      try {
        // 1. scope_kpis cuyo propio kpiId es este — recalcular variation/weightedResult desde actual existente
        const [directRows] = await pool.query<any[]>(
          `SELECT id, target, weight, actual FROM scope_kpis WHERE kpiId = ? AND actual IS NOT NULL`,
          [id]
        )
        const directIds: number[] = []
        for (const row of Array.isArray(directRows) ? directRows : []) {
          const { variation, weightedResult } = await computeScopeKpiMetrics({
            kpiId: Number(id),
            target: Number(row.target ?? 0),
            weight: Number(row.weight ?? 0),
            actual: Number(row.actual),
          })
          await pool.query(
            `UPDATE scope_kpis SET variation = ?, weightedResult = ? WHERE id = ?`,
            [variation, weightedResult, row.id]
          )
          directIds.push(row.id)
        }

        // 2. scope_kpis que agregan collaborator_kpis de este KPI como hijos
        const [linkedRows] = await pool.query<any[]>(
          `SELECT DISTINCT l.scopeKpiId
           FROM scope_kpi_links l
           JOIN collaborator_kpis ck ON l.collaboratorAssignmentId = ck.id
           WHERE ck.kpiId = ?`,
          [id]
        )
        for (const row of Array.isArray(linkedRows) ? linkedRows : []) {
          await recalculateScopeKPI(row.scopeKpiId)
          recalcOKRsLinkedToScopeKpi(row.scopeKpiId).catch((err) =>
            logger.error('[OKR propagation] KPI update→scopeKpi→OKR:', err)
          )
        }

        // 3. scope→scope cascada BFS: sube por la cadena hasta no haber más padres
        const visited = new Set<number>([...directIds, ...(Array.isArray(linkedRows) ? linkedRows : []).map((r: any) => r.scopeKpiId)])
        let frontier: number[] = [...directIds, ...(Array.isArray(linkedRows) ? linkedRows : []).map((r: any) => r.scopeKpiId)]
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
              recalcOKRsLinkedToScopeKpi(row.scopeKpiId).catch((err) =>
                logger.error('[OKR propagation] KPI update→scopeKpi→OKR:', err)
              )
            }
          }
        }
      } catch (err) {
        logger.error('[scope propagation] KPI update→scopeKpi:', err)
      }
    })()

    res.json({ message: 'KPI actualizado correctamente' })
  } catch (error: any) {
    logger.error('Error updating KPI:', error)
    res.status(500).json({ error: 'Error al actualizar KPI' })
  }
}

export const deleteKPI = async (req: Request, res: Response) => {
  if (!isConfigUser(req)) return res.status(403).json({ error: 'Sin autorización para eliminar definiciones KPI' })
  try {
    const { id } = req.params

    const [usageRows] = await pool.query<any[]>(
      `SELECT
         (SELECT COUNT(*) FROM collaborator_kpis WHERE kpiId = ?) AS collaboratorAssignments,
         (SELECT COUNT(*) FROM scope_kpis WHERE kpiId = ?) AS scopeAssignments,
         (SELECT COUNT(*) FROM objective_trees_kpis WHERE kpiId = ?) AS objectiveLinks`,
      [id, id, id]
    )
    const usage = Array.isArray(usageRows) && usageRows.length > 0 ? usageRows[0] : null
    const totalReferences =
      Number(usage?.collaboratorAssignments ?? 0) +
      Number(usage?.scopeAssignments ?? 0) +
      Number(usage?.objectiveLinks ?? 0)

    if (totalReferences > 0) {
      return res.status(409).json({
        error: 'Este KPI está en uso y no puede eliminarse.',
      })
    }

    const [result] = await pool.query<any>('DELETE FROM kpis WHERE id = ?', [id])
    if (Number((result as any).affectedRows || 0) === 0) {
      return res.status(404).json({ error: 'KPI no encontrado' })
    }

    res.json({ message: 'KPI eliminado correctamente' })
  } catch (error: any) {
    logger.error('Error deleting KPI:', error)
    res.status(500).json({ error: 'Error al eliminar KPI' })
  }
}
