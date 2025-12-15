import { Request, Response } from 'express'
import { pool } from '../config/database'
import { KPI } from '../types'
import { validateFormula } from '../utils/kpi-formulas'

export const getKPIs = async (req: Request, res: Response) => {
  try {
    const { area } = req.query

    let query = 'SELECT * FROM kpis'
    const params: any[] = []

    if (area) {
      query += ' WHERE EXISTS (SELECT 1 FROM kpi_areas ka WHERE ka.kpiId = kpis.id AND ka.area = ?)'
      params.push(area)
    }

    query += ' ORDER BY name ASC'

    const [rows] = await pool.query<KPI[]>(query, params)
    res.json(rows)
  } catch (error: any) {
    console.error('Error fetching KPIs:', error)
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

    const [areasRows] = await pool.query<any[]>(
      'SELECT area FROM kpi_areas WHERE kpiId = ? ORDER BY area ASC',
      [id]
    )

    const areas = Array.isArray(areasRows) ? areasRows.map((a) => a.area) : []

    res.json({ ...rows[0], areas })
  } catch (error: any) {
    console.error('Error fetching KPI:', error)
    res.status(500).json({ error: 'Error al obtener KPI' })
  }
}

export const createKPI = async (req: Request, res: Response) => {
  try {
    const { name, description, type, criteria, formula, macroKPIId, areas } = req.body

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
    const { name, description, type, criteria, formula, macroKPIId, areas } = req.body

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
