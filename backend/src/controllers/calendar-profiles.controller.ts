import { Request, Response } from 'express'
import { pool } from '../config/database'

export const listCalendarProfiles = async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT * FROM calendar_profiles ORDER BY name ASC`
    )
    res.json(rows || [])
  } catch (error: any) {
    console.error('Error fetching calendar profiles:', error)
    res.status(500).json({ error: 'Error al obtener calendarios' })
  }
}

export const createCalendarProfile = async (req: Request, res: Response) => {
  try {
    const { name, description, frequency, active } = req.body
    if (!name) {
      return res.status(400).json({ error: 'name es requerido' })
    }
    const [result] = await pool.query(
      `INSERT INTO calendar_profiles (name, description, frequency, active)
       VALUES (?, ?, ?, ?)`,
      [name, description || null, frequency || 'monthly', active === false ? 0 : 1]
    )
    const insertResult = result as any
    res.status(201).json({ id: insertResult.insertId })
  } catch (error: any) {
    console.error('Error creating calendar profile:', error)
    res.status(500).json({ error: 'Error al crear calendario' })
  }
}

export const updateCalendarProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, description, frequency, active } = req.body
    await pool.query(
      `UPDATE calendar_profiles
       SET name = ?, description = ?, frequency = ?, active = ?
       WHERE id = ?`,
      [name, description || null, frequency || 'monthly', active === false ? 0 : 1, id]
    )
    res.json({ message: 'Calendario actualizado' })
  } catch (error: any) {
    console.error('Error updating calendar profile:', error)
    res.status(500).json({ error: 'Error al actualizar calendario' })
  }
}

export const deleteCalendarProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const [scopeRows] = await pool.query<any[]>(
      'SELECT COUNT(*) as count FROM org_scopes WHERE calendarProfileId = ?',
      [id]
    )
    const [subRows] = await pool.query<any[]>(
      'SELECT COUNT(*) as count FROM calendar_subperiods WHERE calendarProfileId = ?',
      [id]
    )
    const [assignmentRows] = await pool.query<any[]>(
      'SELECT COUNT(*) as count FROM collaborator_kpis WHERE calendarProfileId = ?',
      [id]
    )
    const scopeCount = Number(scopeRows?.[0]?.count || 0)
    const subCount = Number(subRows?.[0]?.count || 0)
    const assignmentCount = Number(assignmentRows?.[0]?.count || 0)
    if (scopeCount > 0 || subCount > 0 || assignmentCount > 0) {
      return res.status(400).json({
        error: 'No se puede eliminar un calendario en uso.',
        details: {
          scopes: scopeCount,
          subPeriods: subCount,
          assignments: assignmentCount,
        },
      })
    }
    await pool.query(`DELETE FROM calendar_profiles WHERE id = ?`, [id])
    res.json({ message: 'Calendario eliminado' })
  } catch (error: any) {
    console.error('Error deleting calendar profile:', error)
    res.status(500).json({ error: 'Error al eliminar calendario' })
  }
}
