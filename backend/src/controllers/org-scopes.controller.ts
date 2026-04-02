import { Request, Response } from 'express'
import { pool } from '../config/database'

const parseJson = (value: any) => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export const listOrgScopes = async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT * FROM org_scopes ORDER BY type ASC, name ASC`
    )
    const data = Array.isArray(rows)
      ? rows.map((row) => ({
          ...row,
          metadata: row.metadata ? parseJson(row.metadata) : null,
        }))
      : []
    res.json(data)
  } catch (error: any) {
    console.error('Error fetching org scopes:', error)
    res.status(500).json({ error: 'Error al obtener scopes' })
  }
}

export const createOrgScope = async (req: Request, res: Response) => {
  try {
    const { name, type, parentId, metadata, active, calendarProfileId } = req.body
    if (!name) {
      return res.status(400).json({ error: 'name es requerido' })
    }
    const [result] = await pool.query(
      `INSERT INTO org_scopes (name, type, parentId, calendarProfileId, metadata, active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name,
        type || 'area',
        parentId || null,
        calendarProfileId || null,
        metadata ? JSON.stringify(metadata) : null,
        active === false ? 0 : 1,
      ]
    )
    const insertResult = result as any
    res.status(201).json({ id: insertResult.insertId })
  } catch (error: any) {
    console.error('Error creating org scope:', error)
    res.status(500).json({ error: 'Error al crear scope' })
  }
}

export const updateOrgScope = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, type, parentId, metadata, active, calendarProfileId } = req.body
    const [existingRows] = await pool.query<any[]>(
      'SELECT calendarProfileId FROM org_scopes WHERE id = ?',
      [id]
    )
    const existingCalendarId = existingRows?.[0]?.calendarProfileId ?? null
    let warning: string | null = null
    if (
      calendarProfileId !== undefined &&
      Number(existingCalendarId || 0) !== Number(calendarProfileId || 0)
    ) {
      const [assignRows] = await pool.query<any[]>(
        `SELECT COUNT(*) as count
         FROM collaborator_kpis ck
         JOIN collaborators c ON c.id = ck.collaboratorId
         WHERE c.orgScopeId = ? AND ck.status <> 'closed'`,
        [id]
      )
      const count = Number(assignRows?.[0]?.count || 0)
      if (count > 0) {
        warning = `Hay ${count} asignaciones activas en este scope. El nuevo calendario aplicará solo a nuevas asignaciones.`
      }
    }
    await pool.query(
      `UPDATE org_scopes
       SET name = ?, type = ?, parentId = ?, calendarProfileId = ?, metadata = ?, active = ?
       WHERE id = ?`,
      [
        name,
        type || 'area',
        parentId || null,
        calendarProfileId || null,
        metadata ? JSON.stringify(metadata) : null,
        active === false ? 0 : 1,
        id,
      ]
    )
    res.json({ message: 'Scope actualizado', warning })
  } catch (error: any) {
    console.error('Error updating org scope:', error)
    res.status(500).json({ error: 'Error al actualizar scope' })
  }
}

export const deleteOrgScope = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const [childRows] = await pool.query<any[]>(
      'SELECT COUNT(*) as count FROM org_scopes WHERE parentId = ?',
      [id]
    )
    if (Number(childRows?.[0]?.count || 0) > 0) {
      return res.status(400).json({
        error: 'No se puede eliminar: el scope tiene hijos. Mueve o elimina los hijos primero.',
      })
    }

    const [collabRows] = await pool.query<any[]>(
      'SELECT COUNT(*) as count FROM collaborators WHERE orgScopeId = ?',
      [id]
    )
    if (Number(collabRows?.[0]?.count || 0) > 0) {
      return res.status(400).json({
        error: 'No se puede eliminar: hay colaboradores asignados a este scope.',
      })
    }

    const [assignRows] = await pool.query<any[]>(
      `SELECT COUNT(*) as count
       FROM collaborator_kpis ck
       JOIN collaborators c ON c.id = ck.collaboratorId
       WHERE c.orgScopeId = ?`,
      [id]
    )
    if (Number(assignRows?.[0]?.count || 0) > 0) {
      return res.status(400).json({
        error: 'No se puede eliminar: hay asignaciones activas vinculadas a este scope.',
      })
    }

    const [targetRows] = await pool.query<any[]>(
      'SELECT COUNT(*) as count FROM integration_targets WHERE orgScopeId = ?',
      [id]
    )
    if (Number(targetRows?.[0]?.count || 0) > 0) {
      return res.status(400).json({
        error: 'No se puede eliminar: hay integraciones/targets asociados a este scope.',
      })
    }

    await pool.query('DELETE FROM org_scopes WHERE id = ?', [id])
    res.json({ message: 'Scope eliminado' })
  } catch (error: any) {
    console.error('Error deleting org scope:', error)
    res.status(500).json({ error: 'Error al eliminar scope' })
  }
}
