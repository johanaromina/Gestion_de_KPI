import { Request, Response } from 'express'
import { pool } from '../config/database'
import { logger } from '../utils/logger'
import { sendApiError } from '../utils/api-errors'

const normalizeScopeName = (value: any) => String(value || '').trim()
const normalizeScopeNameKey = (value: any) => normalizeScopeName(value).toLowerCase()
const normalizeScopeType = (value: any) => String(value || 'area').trim().toLowerCase()

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

const findExistingCompany = async (excludeId?: number | null) => {
  const params: any[] = []
  let query = `SELECT id, name FROM org_scopes WHERE type = 'company'`
  if (excludeId != null) {
    query += ' AND id <> ?'
    params.push(Number(excludeId))
  }
  query += ' ORDER BY id ASC LIMIT 1'
  const [rows] = await pool.query<any[]>(query, params)
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null
}

const findScopeByNormalizedName = async (name: string, excludeId?: number | null) => {
  const normalizedName = normalizeScopeNameKey(name)
  if (!normalizedName) return null

  const params: any[] = [normalizedName]
  let query = `SELECT id, name, type, parentId FROM org_scopes WHERE LOWER(TRIM(name)) = ?`
  if (excludeId != null) {
    query += ' AND id <> ?'
    params.push(Number(excludeId))
  }
  query += ' ORDER BY id ASC LIMIT 1'
  const [rows] = await pool.query<any[]>(query, params)
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null
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
    logger.error('Error fetching org scopes:', error)
    return sendApiError(res, 500, 'ORG_SCOPE_FETCH_FAILED', 'Error al obtener scopes')
  }
}

export const createOrgScope = async (req: Request, res: Response) => {
  try {
    const { name, type, parentId, metadata, active, calendarProfileId } = req.body
    const normalizedName = normalizeScopeName(name)
    const scopeType = normalizeScopeType(type)
    const resolvedParentId = parentId || null

    if (!normalizedName) {
      return sendApiError(res, 400, 'ORG_SCOPE_NAME_REQUIRED', 'name es requerido')
    }

    if (scopeType === 'company' && resolvedParentId) {
      return sendApiError(
        res,
        400,
        'ORG_SCOPE_COMPANY_PARENT_INVALID',
        'La empresa raiz no puede depender de otra unidad'
      )
    }

    if (scopeType === 'company') {
      const existingCompany = await findExistingCompany()
      if (existingCompany) {
        return sendApiError(
          res,
          400,
          'ORG_SCOPE_COMPANY_ALREADY_EXISTS',
          `Ya existe una empresa raiz: "${existingCompany.name}"`,
          undefined,
          { values: { name: existingCompany.name } }
        )
      }
    }

    const nameConflict = await findScopeByNormalizedName(normalizedName)
    if (nameConflict) {
      return sendApiError(
        res,
        400,
        'ORG_SCOPE_NAME_EXISTS',
        `Ya existe una unidad con el nombre "${nameConflict.name}"`,
        undefined,
        { values: { name: nameConflict.name } }
      )
    }

    const [result] = await pool.query(
      `INSERT INTO org_scopes (name, type, parentId, calendarProfileId, metadata, active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        normalizedName,
        scopeType,
        resolvedParentId,
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
    const scopeId = Number(id)
    const normalizedName = normalizeScopeName(name)
    const scopeType = normalizeScopeType(type)
    const resolvedParentId = parentId || null
    const [existingRows] = await pool.query<any[]>(
      'SELECT id, name, type, parentId, calendarProfileId FROM org_scopes WHERE id = ?',
      [scopeId]
    )
    if (!Array.isArray(existingRows) || existingRows.length === 0) {
      return sendApiError(res, 404, 'ORG_SCOPE_NOT_FOUND', 'Scope no encontrado')
    }

    if (!normalizedName) {
      return sendApiError(res, 400, 'ORG_SCOPE_NAME_REQUIRED', 'name es requerido')
    }

    if (scopeType === 'company' && resolvedParentId) {
      return sendApiError(
        res,
        400,
        'ORG_SCOPE_COMPANY_PARENT_INVALID',
        'La empresa raiz no puede depender de otra unidad'
      )
    }

    if (scopeType === 'company') {
      const existingCompany = await findExistingCompany(scopeId)
      if (existingCompany) {
        return sendApiError(
          res,
          400,
          'ORG_SCOPE_COMPANY_ALREADY_EXISTS',
          `Ya existe una empresa raiz: "${existingCompany.name}"`,
          undefined,
          { values: { name: existingCompany.name } }
        )
      }
    }

    const nameConflict = await findScopeByNormalizedName(normalizedName, scopeId)
    if (nameConflict) {
      return sendApiError(
        res,
        400,
        'ORG_SCOPE_NAME_EXISTS',
        `Ya existe una unidad con el nombre "${nameConflict.name}"`,
        undefined,
        { values: { name: nameConflict.name } }
      )
    }

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
        normalizedName,
        scopeType,
        resolvedParentId,
        calendarProfileId || null,
        metadata ? JSON.stringify(metadata) : null,
        active === false ? 0 : 1,
        scopeId,
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
    const existingNames = new Set<string>()
    const existingKeys = new Set<string>()
    let existingCompanyNameKey: string | null = null
    let existingCompanyDisplayName: string | null = null
    for (const s of existing as any[]) {
      const normalizedName = normalizeScopeNameKey(s.name)
      if (!byName.has(normalizedName)) {
        byName.set(normalizedName, s.id)
      }
      existingNames.add(normalizedName)
      existingKeys.add(buildOrgScopeImportKey(normalizedName, s.type || 'area', s.parentId ?? null))
      if (s.type === 'company' && !existingCompanyNameKey) {
        existingCompanyNameKey = normalizedName
        existingCompanyDisplayName = s.name
      }
    }

    const created: number[] = []
    const errors: Array<{ row: number; code: string; message: string; values?: Record<string, unknown> }> = []

    // Dos pasadas: primero los que no tienen padre (o padre ya existe), luego los que dependen de los recién creados
    const pending = rows.map((r, i) => ({ ...r, rowIndex: i + 1 }))

    for (let pass = 0; pass < 2; pass++) {
      const remaining: typeof pending = []
      for (const item of (pass === 0 ? pending : pending.filter((p) => !created.includes(p.rowIndex)))) {
        const rawName = normalizeScopeName(item.name)
        if (!rawName) {
          errors.push({
            row: item.rowIndex,
            code: 'ORG_SCOPE_IMPORT_NAME_EMPTY',
            message: 'Nombre vacio',
          })
          continue
        }
        const normalizedName = normalizeScopeNameKey(item.name)
        const scopeType = normalizeScopeType(item.type)
        let parentId: number | null = null
        if (scopeType === 'company' && item.parentName?.trim()) {
          errors.push({
            row: item.rowIndex,
            code: 'ORG_SCOPE_IMPORT_COMPANY_PARENT_INVALID',
            message: 'La empresa raiz no puede depender de otra unidad',
          })
          continue
        }
        if (item.parentName?.trim()) {
          const key = normalizeScopeNameKey(item.parentName)
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
        if (scopeType === 'company' && existingCompanyNameKey && existingCompanyNameKey !== normalizedName) {
          errors.push({
            row: item.rowIndex,
            code: 'ORG_SCOPE_IMPORT_COMPANY_ALREADY_EXISTS',
            message: `Ya existe una empresa raiz: "${existingCompanyDisplayName}"`,
            values: { name: existingCompanyDisplayName },
          })
          continue
        }
        if (existingNames.has(normalizedName)) {
          errors.push({
            row: item.rowIndex,
            code: 'ORG_SCOPE_IMPORT_NAME_EXISTS',
            message: `Ya existe una unidad con el nombre "${rawName}"`,
            values: { name: rawName },
          })
          continue
        }
        let newId: number
        try {
          const [r] = await pool.query(
            `INSERT INTO org_scopes (name, type, parentId, active) VALUES (?, ?, ?, 1)`,
            [rawName, scopeType, parentId]
          ) as any[]
          newId = (r as any).insertId
        } catch (dbErr: any) {
          logger.error(`Error inserting org scope row ${item.rowIndex}:`, dbErr)
          errors.push({
            row: item.rowIndex,
            code: 'ORG_SCOPE_IMPORT_FAILED',
            message: `Error al crear "${item.name.trim()}": ${dbErr?.sqlMessage || dbErr?.message || 'error de base de datos'}`,
          })
          continue
        }
        byName.set(normalizedName, newId)
        existingNames.add(normalizedName)
        existingKeys.add(duplicateKey)
        if (scopeType === 'company' && !existingCompanyNameKey) {
          existingCompanyNameKey = normalizedName
          existingCompanyDisplayName = rawName
        }
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

export const deleteOrgScopeCascade = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Collect all descendant IDs via BFS
    const allIds: number[] = [Number(id)]
    const queue = [Number(id)]
    while (queue.length > 0) {
      const current = queue.shift()!
      const [children] = await pool.query<any[]>(
        'SELECT id FROM org_scopes WHERE parentId = ?',
        [current]
      )
      for (const child of children as any[]) {
        allIds.push(child.id)
        queue.push(child.id)
      }
    }

    const placeholders = allIds.map(() => '?').join(',')

    // Break internal parent references so FK constraint doesn't block the DELETE
    await pool.query(
      `UPDATE org_scopes SET parentId = NULL WHERE id IN (${placeholders})`,
      allIds
    )

    // Detach collaborators (set orgScopeId = NULL rather than deleting them)
    await pool.query(
      `UPDATE collaborators SET orgScopeId = NULL WHERE orgScopeId IN (${placeholders})`,
      allIds
    )

    // Delete all scopes in the subtree — MySQL CASCADE handles scope_kpis, integration_targets, etc.
    await pool.query(
      `DELETE FROM org_scopes WHERE id IN (${placeholders})`,
      allIds
    )

    return res.json({ message: 'Estructura eliminada', count: allIds.length })
  } catch (error: any) {
    logger.error('Error cascade-deleting org scope:', error)
    return sendApiError(res, 500, 'ORG_SCOPE_CASCADE_DELETE_FAILED', 'Error al eliminar la estructura')
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
