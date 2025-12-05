import { Request, Response } from 'express'
import { pool } from '../config/database'
import { Period, SubPeriod } from '../types'

export const getPeriods = async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<Period[]>(
      'SELECT * FROM periods ORDER BY startDate DESC'
    )
    res.json(rows)
  } catch (error: any) {
    console.error('Error fetching periods:', error)
    res.status(500).json({ error: 'Error al obtener períodos' })
  }
}

export const getPeriodById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query<Period[]>(
      'SELECT * FROM periods WHERE id = ?',
      [id]
    )

    if (Array.isArray(rows) && rows.length === 0) {
      return res.status(404).json({ error: 'Período no encontrado' })
    }

    res.json(rows[0])
  } catch (error: any) {
    console.error('Error fetching period:', error)
    res.status(500).json({ error: 'Error al obtener período' })
  }
}

export const getSubPeriodsByPeriod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query<SubPeriod[]>(
      'SELECT * FROM sub_periods WHERE periodId = ? ORDER BY startDate ASC',
      [id]
    )
    res.json(rows)
  } catch (error: any) {
    console.error('Error fetching sub-periods:', error)
    res.status(500).json({ error: 'Error al obtener subperíodos' })
  }
}

export const createPeriod = async (req: Request, res: Response) => {
  try {
    const { name, startDate, endDate, status } = req.body

    if (!name || !startDate || !endDate) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    const [result] = await pool.query(
      `INSERT INTO periods (name, startDate, endDate, status) 
       VALUES (?, ?, ?, ?)`,
      [name, startDate, endDate, status || 'open']
    )

    const insertResult = result as any
    res.status(201).json({
      id: insertResult.insertId,
      name,
      startDate,
      endDate,
      status: status || 'open',
    })
  } catch (error: any) {
    console.error('Error creating period:', error)
    res.status(500).json({ error: 'Error al crear período' })
  }
}

export const updatePeriod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, startDate, endDate, status } = req.body

    await pool.query(
      `UPDATE periods 
       SET name = ?, startDate = ?, endDate = ?, status = ? 
       WHERE id = ?`,
      [name, startDate, endDate, status, id]
    )

    res.json({ message: 'Período actualizado correctamente' })
  } catch (error: any) {
    console.error('Error updating period:', error)
    res.status(500).json({ error: 'Error al actualizar período' })
  }
}

export const closePeriod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Verificar que el período existe
    const [periodRows] = await pool.query<Period[]>(
      'SELECT * FROM periods WHERE id = ?',
      [id]
    )

    if (Array.isArray(periodRows) && periodRows.length === 0) {
      return res.status(404).json({ error: 'Período no encontrado' })
    }

    // Cambiar estado a cerrado
    await pool.query('UPDATE periods SET status = ? WHERE id = ?', [
      'closed',
      id,
    ])

    res.json({ message: 'Período cerrado correctamente' })
  } catch (error: any) {
    console.error('Error closing period:', error)
    res.status(500).json({ error: 'Error al cerrar período' })
  }
}

export const reopenPeriod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const user = (req as any).user

    // Verificar permisos (solo admin, director o manager pueden reabrir)
    if (
      !user ||
      !['admin', 'director', 'manager'].includes(user.role)
    ) {
      return res
        .status(403)
        .json({
          error: 'No tienes permisos para reabrir períodos cerrados',
        })
    }

    // Verificar que el período existe y está cerrado
    const [periodRows] = await pool.query<Period[]>(
      'SELECT * FROM periods WHERE id = ?',
      [id]
    )

    if (Array.isArray(periodRows) && periodRows.length === 0) {
      return res.status(404).json({ error: 'Período no encontrado' })
    }

    const period = periodRows[0]
    if (period.status !== 'closed') {
      return res
        .status(400)
        .json({ error: 'El período no está cerrado' })
    }

    // Cambiar estado a abierto
    await pool.query('UPDATE periods SET status = ? WHERE id = ?', [
      'open',
      id,
    ])

    res.json({ message: 'Período reabierto correctamente' })
  } catch (error: any) {
    console.error('Error reopening period:', error)
    res.status(500).json({ error: 'Error al reabrir período' })
  }
}

export const deletePeriod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await pool.query('DELETE FROM periods WHERE id = ?', [id])

    res.json({ message: 'Período eliminado correctamente' })
  } catch (error: any) {
    console.error('Error deleting period:', error)
    res.status(500).json({ error: 'Error al eliminar período' })
  }
}
