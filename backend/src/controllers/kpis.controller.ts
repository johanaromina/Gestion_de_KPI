import { Request, Response } from 'express'
import { pool } from '../config/database'
import { KPI } from '../types'
import {
  calculateVariation,
  calculateWeightedResult,
  validateFormula,
} from '../utils/kpi-formulas'

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
    const { area, periodId } = req.query
    await ensureKPIPeriodsTable()

    let query = 'SELECT * FROM kpis'
    const params: any[] = []
    const where: string[] = []

    if (area) {
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
    if (ids.length > 0) {
      const [periodRows] = await pool.query<any[]>(
        `SELECT kpiId, periodId FROM kpi_periods WHERE kpiId IN (${ids.map(() => '?').join(',')})`,
        ids
      )
      periodsMap = (periodRows || []).reduce((acc: Record<number, number[]>, row) => {
        if (!acc[row.kpiId]) acc[row.kpiId] = []
        acc[row.kpiId].push(Number(row.periodId))
        return acc
      }, {})
    }

    const enriched = Array.isArray(rows)
      ? rows.map((r) => ({
          ...r,
          periodIds: periodsMap[r.id] || [],
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

    res.json({ ...rows[0], areas, periodIds })
  } catch (error: any) {
    console.error('Error fetching KPI:', error)
    res.status(500).json({ error: 'Error al obtener KPI' })
  }
}

export const createKPI = async (req: Request, res: Response) => {
  try {
    const { name, description, type, criteria, formula, macroKPIId, areas, periodIds } = req.body

    if (!name || !type) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

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
        `INSERT INTO kpis (name, description, type, criteria, formula, macroKPIId) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          name,
          description || null,
          type,
          criteria || null,
          formula || null,
          macroKPIId || null,
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

      await conn.commit()

      res.status(201).json({
        id: kpiId,
        name,
        description: description || null,
        type,
        criteria: criteria || null,
        formula: formula || null,
        macroKPIId: macroKPIId || null,
        areas: Array.isArray(areas) ? areas : [],
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
  try {
    const { id } = req.params
    const { name, description, type, criteria, formula, macroKPIId, areas, periodIds } = req.body

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

      await conn.query(
        `UPDATE kpis 
         SET name = ?, description = ?, type = ?, criteria = ?, formula = ?, macroKPIId = ? 
         WHERE id = ?`,
        [
          name,
          description,
          type,
          criteria,
          formula || null,
          macroKPIId || null,
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

      // Recalcular las asignaciones existentes con el nuevo tipo/fórmula
      const [affectedAssignments] = await conn.query<any[]>(
        'SELECT id, target, actual, weight FROM collaborator_kpis WHERE kpiId = ?',
        [id]
      )

      if (Array.isArray(affectedAssignments) && affectedAssignments.length > 0) {
        for (const row of affectedAssignments) {
          const variation = calculateVariation(
            type,
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

    res.json({ message: 'KPI actualizado correctamente' })
  } catch (error: any) {
    console.error('Error updating KPI:', error)
    res.status(500).json({ error: 'Error al actualizar KPI' })
  }
}

export const deleteKPI = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await pool.query('DELETE FROM kpis WHERE id = ?', [id])

    res.json({ message: 'KPI eliminado correctamente' })
  } catch (error: any) {
    console.error('Error deleting KPI:', error)
    res.status(500).json({ error: 'Error al eliminar KPI' })
  }
}
