import { Request, Response } from 'express'
import { pool } from '../config/database'
import { SubPeriod } from '../types'

export const getSubPeriods = async (req: Request, res: Response) => {
  try {
    const { periodId } = req.query

    let query = 'SELECT * FROM sub_periods'
    const params: any[] = []

    if (periodId) {
      query += ' WHERE periodId = ?'
      params.push(periodId)
    }

    query += ' ORDER BY startDate ASC'

    const [rows] = await pool.query<SubPeriod[]>(query, params)
    res.json(rows)
  } catch (error: any) {
    console.error('Error fetching sub-periods:', error)
    res.status(500).json({ error: 'Error al obtener subperíodos' })
  }
}

export const getSubPeriodById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query<SubPeriod[]>(
      'SELECT * FROM sub_periods WHERE id = ?',
      [id]
    )

    if (Array.isArray(rows) && rows.length === 0) {
      return res.status(404).json({ error: 'Subperíodo no encontrado' })
    }

    res.json(rows[0])
  } catch (error: any) {
    console.error('Error fetching sub-period:', error)
    res.status(500).json({ error: 'Error al obtener subperíodo' })
  }
}

export const createSubPeriod = async (req: Request, res: Response) => {
  try {
    const { periodId, name, startDate, endDate, weight } = req.body

    if (!periodId || !name || !startDate || !endDate) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    const [result] = await pool.query(
      `INSERT INTO sub_periods (periodId, name, startDate, endDate, weight) 
       VALUES (?, ?, ?, ?, ?)`,
      [periodId, name, startDate, endDate, weight || null]
    )

    const insertResult = result as any
    res.status(201).json({
      id: insertResult.insertId,
      periodId,
      name,
      startDate,
      endDate,
      weight: weight || null,
    })
  } catch (error: any) {
    console.error('Error creating sub-period:', error)
    res.status(500).json({ error: 'Error al crear subperíodo' })
  }
}

export const updateSubPeriod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, startDate, endDate, weight } = req.body

    await pool.query(
      `UPDATE sub_periods 
       SET name = ?, startDate = ?, endDate = ?, weight = ? 
       WHERE id = ?`,
      [name, startDate, endDate, weight || null, id]
    )

    res.json({ message: 'Subperíodo actualizado correctamente' })
  } catch (error: any) {
    console.error('Error updating sub-period:', error)
    res.status(500).json({ error: 'Error al actualizar subperíodo' })
  }
}

export const deleteSubPeriod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await pool.query('DELETE FROM sub_periods WHERE id = ?', [id])

    res.json({ message: 'Subperíodo eliminado correctamente' })
  } catch (error: any) {
    console.error('Error deleting sub-period:', error)
    res.status(500).json({ error: 'Error al eliminar subperíodo' })
  }
}

