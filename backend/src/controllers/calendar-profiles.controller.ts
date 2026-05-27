import { Request, Response } from 'express'
import { pool } from '../config/database'
import { logger } from '../utils/logger'
import { sendApiError } from '../utils/api-errors'

export const listCalendarProfiles = async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT * FROM calendar_profiles ORDER BY name ASC`
    )
    res.json(rows || [])
  } catch (error: any) {
    logger.error('Error fetching calendar profiles:', error)
    return sendApiError(res, 500, 'CALENDAR_PROFILE_FETCH_FAILED', 'Error al obtener calendarios')
  }
}

export const createCalendarProfile = async (req: Request, res: Response) => {
  try {
    const { name, description, frequency, active } = req.body
    if (!name) {
      return sendApiError(res, 400, 'CALENDAR_PROFILE_NAME_REQUIRED', 'name es requerido')
    }
    const [result] = await pool.query(
      `INSERT INTO calendar_profiles (name, description, frequency, active)
       VALUES (?, ?, ?, ?)`,
      [name, description || null, frequency || 'monthly', active === false ? 0 : 1]
    )
    const insertResult = result as any
    res.status(201).json({ id: insertResult.insertId })
  } catch (error: any) {
    logger.error('Error creating calendar profile:', error)
    return sendApiError(res, 500, 'CALENDAR_PROFILE_CREATE_FAILED', 'Error al crear calendario')
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
    logger.error('Error updating calendar profile:', error)
    return sendApiError(res, 500, 'CALENDAR_PROFILE_UPDATE_FAILED', 'Error al actualizar calendario')
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
      return sendApiError(
        res,
        400,
        'CALENDAR_PROFILE_IN_USE',
        'No se puede eliminar un calendario en uso.',
        undefined,
        {
          details: {
            scopes: scopeCount,
            subPeriods: subCount,
            assignments: assignmentCount,
          },
        }
      )
    }
    await pool.query(`DELETE FROM calendar_profiles WHERE id = ?`, [id])
    res.json({ message: 'Calendario eliminado' })
  } catch (error: any) {
    logger.error('Error deleting calendar profile:', error)
    return sendApiError(res, 500, 'CALENDAR_PROFILE_DELETE_FAILED', 'Error al eliminar calendario')
  }
}
