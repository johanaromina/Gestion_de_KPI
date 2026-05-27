import { Request, Response } from 'express'
import { pool } from '../config/database'
import { logger } from '../utils/logger'
import { sendApiError } from '../utils/api-errors'

const parseJson = (value: any) => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const buildOrgScopeImportKey = (name: string, type: string, parentId: number | null) =>
  `${String(type || 'area').trim().toLowerCase()}::${Number(parentId || 0)}::${String(name || '').trim().toLowerCase()}`

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
    logger.error('Error fetching org scopes:', error)
    return sendApiError(res, 500, 'ORG_SCOPE_FETCH_FAILED', 'Error al obtener scopes')
  }
}

export const createOrgScope = async (req: Request, res: Response) => {
  try {
    const { name, type, parentId, metadata, active, calendarProfileId } = req.body
    if (!name) {
      return sendApiError(res, 400, 'ORG_SCOPE_NAME_REQUIRED', 'name es requerido')
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
    logger.error('Error creating org scope:', error)
    return sendApiError(res, 500, 'ORG_SCOPE_CREATE_FAILED', 'Error al crear scope')
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
    logger.error('Error updating org scope:', error)
    return sendApiError(res, 500, 'ORG_SCOPE_UPDATE_FAILED', 'Error al actualizar scope')
  }
}

export const importOrgScopes = async (req: Request, res: Response) => {
  try {
    const rows: { name: string; type?: string; parentName?: string }[] = req.body?.rows
    if (!Array.isArray(rows) || rows.length === 0)
      return sendApiError(res, 400, 'ORG_SCOPE_IMPORT_ROWS_REQUIRED', 'No hay filas para importar')

    // Cargar scopes existentes para resolver parentName
    const [existing] = await pool.query<any[]>('SELECT id, name, type, parentId FROM org_scopes')
    const byName = new Map<string, number>()
    const existingKeys = new Set<string>()
    for (const s of existing as any[]) {
      const normalizedName = s.name.trim().toLowerCase()
      if (!byName.has(normalizedName)) {
        byName.set(normalizedName, s.id)
      }
      existingKeys.add(buildOrgScopeImportKey(normalizedName, s.type || 'area', s.parentId ?? null))
    }

    const created: number[] = []
    const errors: Array<{ row: number; code: string; message: string; values?: Record<string, unknown> }> = []

    // Dos pasadas: primero los que no tienen padre (o padre ya existe), luego los que dependen de los recién creados
    const pending = rows.map((r, i) => ({ ...r, rowIndex: i + 1 }))

    for (let pass = 0; pass < 2; pass++) {
      const remaining: typeof pending = []
      for (const item of (pass === 0 ? pending : pending.filter((p) => !created.includes(p.rowIndex)))) {
        if (!item.name?.trim()) {
          errors.push({
            row: item.rowIndex,
            code: 'ORG_SCOPE_IMPORT_NAME_EMPTY',
            message: 'Nombre vacio',
          })
          continue
        }
        const normalizedName = item.name.trim().toLowerCase()
        const scopeType = String(item.type || 'area').trim().toLowerCase()
        let parentId: number | null = null
        if (item.parentName?.trim()) {
          const key = item.parentName.trim().toLowerCase()
          parentId = byName.get(key) ?? null
          if (!parentId) {
            if (pass === 0) { remaining.push(item); continue }
            errors.push({
              row: item.rowIndex,
              code: 'ORG_SCOPE_IMPORT_PARENT_NOT_FOUND',
              message: `Area padre "${item.parentName}" no encontrada`,
              values: { parentName: item.parentName },
            })
            continue
          }
        }
        const duplicateKey = buildOrgScopeImportKey(normalizedName, scopeType, parentId)
        if (existingKeys.has(duplicateKey)) {
          errors.push({
            row: item.rowIndex,
            code: 'ORG_SCOPE_IMPORT_DUPLICATE',
            message: `La unidad "${item.name.trim()}" ya existe con el mismo tipo y padre`,
            values: { name: item.name.trim() },
          })
          continue
        }
        const [r] = await pool.query(
          `INSERT INTO org_scopes (name, type, parentId, active) VALUES (?, ?, ?, 1)`,
          [item.name.trim(), scopeType, parentId]
        ) as any[]
        const newId = (r as any).insertId
        byName.set(normalizedName, newId)
        existingKeys.add(duplicateKey)
        created.push(item.rowIndex)
      }
      if (pass === 0) pending.splice(0, pending.length, ...remaining)
    }

    return res.status(201).json({ total: rows.length, created: created.length, errors })
  } catch (error: any) {
    logger.error('Error importando org scopes:', error)
    return sendApiError(res, 500, 'ORG_SCOPE_IMPORT_FAILED', 'Error al importar areas')
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
      return sendApiError(
        res,
        400,
        'ORG_SCOPE_DELETE_HAS_CHILDREN',
        'No se puede eliminar: el scope tiene hijos. Mueve o elimina los hijos primero.'
      )
    }

    const [collabRows] = await pool.query<any[]>(
      'SELECT COUNT(*) as count FROM collaborators WHERE orgScopeId = ?',
      [id]
    )
    if (Number(collabRows?.[0]?.count || 0) > 0) {
      return sendApiError(
        res,
        400,
        'ORG_SCOPE_DELETE_HAS_COLLABORATORS',
        'No se puede eliminar: hay colaboradores asignados a este scope.'
      )
    }

    const [assignRows] = await pool.query<any[]>(
      `SELECT COUNT(*) as count
       FROM collaborator_kpis ck
       JOIN collaborators c ON c.id = ck.collaboratorId
       WHERE c.orgScopeId = ?`,
      [id]
    )
    if (Number(assignRows?.[0]?.count || 0) > 0) {
      return sendApiError(
        res,
        400,
        'ORG_SCOPE_DELETE_HAS_ASSIGNMENTS',
        'No se puede eliminar: hay asignaciones activas vinculadas a este scope.'
      )
    }

    const [targetRows] = await pool.query<any[]>(
      'SELECT COUNT(*) as count FROM integration_targets WHERE orgScopeId = ?',
      [id]
    )
    if (Number(targetRows?.[0]?.count || 0) > 0) {
      return sendApiError(
        res,
        400,
        'ORG_SCOPE_DELETE_HAS_TARGETS',
        'No se puede eliminar: hay integraciones/targets asociados a este scope.'
      )
    }

    await pool.query('DELETE FROM org_scopes WHERE id = ?', [id])
    res.json({ message: 'Scope eliminado' })
  } catch (error: any) {
    logger.error('Error deleting org scope:', error)
    return sendApiError(res, 500, 'ORG_SCOPE_DELETE_FAILED', 'Error al eliminar scope')
  }
}
