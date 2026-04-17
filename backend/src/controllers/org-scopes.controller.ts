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

export const importOrgScopes = async (req: Request, res: Response) => {
  try {
    const rows: { name: string; type?: string; parentName?: string }[] = req.body?.rows
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ error: 'No hay filas para importar' })

    // Cargar scopes existentes para resolver parentName
    const [existing] = await pool.query<any[]>('SELECT id, name FROM org_scopes')
    const byName = new Map<string, number>()
    for (const s of existing as any[]) byName.set(s.name.trim().toLowerCase(), s.id)

    const created: number[] = []
    const errors: { row: number; message: string }[] = []

    // Dos pasadas: primero los que no tienen padre (o padre ya existe), luego los que dependen de los recién creados
    const pending = rows.map((r, i) => ({ ...r, rowIndex: i + 1 }))

    for (let pass = 0; pass < 2; pass++) {
      const remaining: typeof pending = []
      for (const item of (pass === 0 ? pending : pending.filter((p) => !created.includes(p.rowIndex)))) {
        if (!item.name?.trim()) {
          errors.push({ row: item.rowIndex, message: 'Nombre vacío' })
          continue
        }
        let parentId: number | null = null
        if (item.parentName?.trim()) {
          const key = item.parentName.trim().toLowerCase()
          parentId = byName.get(key) ?? null
          if (!parentId) {
            if (pass === 0) { remaining.push(item); continue }
            errors.push({ row: item.rowIndex, message: `Área padre "${item.parentName}" no encontrada` })
            continue
          }
        }
        const [r] = await pool.query(
          `INSERT INTO org_scopes (name, type, parentId, active) VALUES (?, ?, ?, 1)`,
          [item.name.trim(), item.type || 'area', parentId]
        ) as any[]
        const newId = (r as any).insertId
        byName.set(item.name.trim().toLowerCase(), newId)
        created.push(item.rowIndex)
      }
      if (pass === 0) pending.splice(0, pending.length, ...remaining)
    }

    return res.status(201).json({ created: created.length, errors })
  } catch (error: any) {
    console.error('Error importando org scopes:', error)
    return res.status(500).json({ error: error?.message || 'Error al importar áreas' })
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
