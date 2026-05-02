import { Request, Response } from 'express'
import { pool } from '../config/database'
import { KPI } from '../types'
import {
  calculateVariation,
  calculateWeightedResult,
  validateFormula,
} from '../utils/kpi-formulas'
import { recalculateScopeKPI } from '../services/scope-kpi-aggregation.service'
import { computeScopeKpiMetrics } from '../services/scope-kpi-mixed.service'
import { AuthRequest } from '../middleware/auth.middleware'
import { recalcOKRsLinkedToScopeKpi } from '../services/okr.service'

const isConfigUser = (req: Request) => {
  const user = (req as AuthRequest).user
  return !!(user?.hasSuperpowers || user?.permissions?.includes('config.manage'))
}

const ensureKPIPeriodsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kpi_periods (
      kpiId INT NOT NULL,
      periodId INT NOT NULL,
      PRIMARY KEY (kpiId, periodId)
    )
  `)
}

export const getKPIs = async (req: Request, res: Response) => {
  try {
    const { area, areaId, periodId } = req.query
    await ensureKPIPeriodsTable()

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
    console.error('Error fetching KPIs:', error)
    res.status(500).json({ error: 'Error al obtener KPIs' })
  }
}

export const getKPIById = async (req: Request, res: Response) => {
  try {
    await ensureKPIPeriodsTable()
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
    console.error('Error fetching KPI:', error)
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

    if (!name || !type) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    const resolvedDirection =
      direction && ['growth', 'reduction', 'exact'].includes(direction) ? direction : type === 'sla' ? 'reduction' : 'growth'

    // Validar fórmula si se proporciona
    if (formula) {
      const validation = validateFormula(formula)
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
          name,
          description || null,
          type,
          resolvedDirection,
          criteria || null,
          formula || null,
          macroKPIId || null,
          defaultDataSource || null,
          defaultCriteriaTemplate || null,
          defaultCalcRule || null,
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
        await ensureKPIPeriodsTable()
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
        name,
        description: description || null,
        type,
        direction: resolvedDirection,
        criteria: criteria || null,
        formula: formula || null,
        macroKPIId: macroKPIId || null,
        defaultDataSource: defaultDataSource || null,
        defaultCriteriaTemplate: defaultCriteriaTemplate || null,
        defaultCalcRule: defaultCalcRule || null,
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
    console.error('Error creating KPI:', error)
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

    // Validar fórmula si se proporciona
    if (formula !== undefined) {
      if (formula && formula.trim()) {
        const validation = validateFormula(formula)
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error })
        }
      }
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const resolvedDirection =
        direction && ['growth', 'reduction', 'exact'].includes(direction) ? direction : type === 'sla' ? 'reduction' : 'growth'

      await conn.query(
        `UPDATE kpis 
         SET name = ?, description = ?, type = ?, direction = ?, criteria = ?, formula = ?, macroKPIId = ?,
             defaultDataSource = ?, defaultCriteriaTemplate = ?, defaultCalcRule = ?
         WHERE id = ?`,
        [
          name,
          description,
          type,
          resolvedDirection,
          criteria,
          formula || null,
          macroKPIId || null,
          defaultDataSource || null,
          defaultCriteriaTemplate || null,
          defaultCalcRule || null,
          id,
        ]
      )

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
        await ensureKPIPeriodsTable()
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

      if (Array.isArray(affectedAssignments) && affectedAssignments.length > 0) {
        for (const row of affectedAssignments) {
          const variation = calculateVariation(
            resolvedDirection,
            Number(row.target ?? 0),
            Number(row.actual ?? 0),
            formula || undefined
          )
          const weightedResult = calculateWeightedResult(variation, Number(row.weight ?? 0))

          await conn.query(
            'UPDATE collaborator_kpis SET variation = ?, weightedResult = ? WHERE id = ?',
            [variation, weightedResult, row.id]
          )
        }
      }

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
            console.error('[OKR propagation] KPI update→scopeKpi→OKR:', err)
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
                console.error('[OKR propagation] KPI update→scopeKpi→OKR:', err)
              )
            }
          }
        }
      } catch (err) {
        console.error('[scope propagation] KPI update→scopeKpi:', err)
      }
    })()

    res.json({ message: 'KPI actualizado correctamente' })
  } catch (error: any) {
    console.error('Error updating KPI:', error)
    res.status(500).json({ error: 'Error al actualizar KPI' })
  }
}

export const deleteKPI = async (req: Request, res: Response) => {
  if (!isConfigUser(req)) return res.status(403).json({ error: 'Sin autorización para eliminar definiciones KPI' })
  try {
    const { id } = req.params

    await pool.query('DELETE FROM kpis WHERE id = ?', [id])

    res.json({ message: 'KPI eliminado correctamente' })
  } catch (error: any) {
    console.error('Error deleting KPI:', error)
    res.status(500).json({ error: 'Error al eliminar KPI' })
  }
}
