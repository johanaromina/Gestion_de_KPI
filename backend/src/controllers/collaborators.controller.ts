import { Request, Response } from 'express'
import { RowDataPacket } from 'mysql2/promise'
import crypto from 'crypto'
import { pool } from '../config/database'
import { Collaborator } from '../types'
import { logAudit } from '../utils/audit'
import { AuthRequest } from '../middleware/auth.middleware'
import { appEnv } from '../config/env'
import { sendMail } from '../utils/mailer'
import { logger } from '../utils/logger'
import { validateString, validateEmail, validateEnum, collectErrors } from '../utils/validate'
import { sendApiError } from '../utils/api-errors'

type CollaboratorRow = Collaborator & RowDataPacket

const canEditCollaborator = (
  user: AuthRequest['user'],
  collaboratorArea?: string,
  collaboratorId?: number
) => {
  if (!user) return false

  const role = (user.role || '').trim().toLowerCase()
  const userId =
    (user as any).id ??
    (user as any).userId ??
    (user as any).sub ??
    null
  const superpower =
    Boolean(user.hasSuperpowers) ||
    Boolean(user.permissions?.includes('config.manage'))

  if (superpower) return true
  if (['admin', 'director'].includes(role)) return true
  if (userId && collaboratorId && Number(userId) === Number(collaboratorId)) return true

  const userArea = (user.area || '').trim().toLowerCase()
  const targetArea = (collaboratorArea || '').trim().toLowerCase()

  if (['manager', 'leader'].includes(role)) {
    return userArea && targetArea ? userArea === targetArea : false
  }

  return false
}

/**
 * Detecta si asignar `newManagerId` como jefe de `collaboratorId`
 * generaría un ciclo en la jerarquía de jefatura.
 * Recorre la cadena de managers hacia arriba desde newManagerId
 * hasta encontrar a collaboratorId (ciclo) o llegar a la raíz.
 */
const wouldCreateCycle = async (collaboratorId: number, newManagerId: number): Promise<boolean> => {
  if (collaboratorId === newManagerId) return true
  let current: number | null = newManagerId
  const visited = new Set<number>()
  while (current !== null) {
    if (visited.has(current)) break // ciclo en datos existentes, parar
    visited.add(current)
    if (current === collaboratorId) return true
    const queryResult = await pool.query<any[]>(
      'SELECT managerId FROM collaborators WHERE id = ?',
      [current]
    )
    const managerRows: any[] = queryResult[0]
    current = Array.isArray(managerRows) && managerRows.length > 0 ? (managerRows[0].managerId ?? null) : null
  }
  return false
}

export const getCollaborators = async (req: Request, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive === 'true'
    const limit = req.query.limit !== undefined ? Math.max(1, Math.min(1000, Number(req.query.limit))) : null
    const offset = req.query.offset !== undefined ? Math.max(0, Number(req.query.offset)) : 0
    const safeColumns = 'id, name, email, position, area, orgScopeId, managerId, role, status, mfaEnabled, inviteToken, inviteTokenExpiresAt, createdAt, updatedAt'
    const where = includeInactive ? '' : `WHERE status = 'active'`
    const baseQuery = `SELECT ${safeColumns} FROM collaborators ${where} ORDER BY name ASC`

    if (limit !== null) {
      const [[{ total }]] = await pool.query<any[]>(`SELECT COUNT(*) as total FROM collaborators ${where}`)
      const [rows] = await pool.query<CollaboratorRow[]>(`${baseQuery} LIMIT ? OFFSET ?`, [limit, offset])
      return res.json({ data: rows as Collaborator[], total: Number(total), limit, offset })
    }

    const [rows] = await pool.query<CollaboratorRow[]>(baseQuery)
    res.json(rows as Collaborator[])
  } catch (error: any) {
    logger.error('Error fetching collaborators:', error)
    return sendApiError(res, 500, 'COLLABORATOR_FETCH_FAILED', 'Error al obtener colaboradores')
  }
}

export const getCollaboratorById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const safeColumns = 'id, name, email, position, area, orgScopeId, managerId, role, status, mfaEnabled, inviteToken, inviteTokenExpiresAt, createdAt, updatedAt'
    const [rows] = await pool.query<CollaboratorRow[]>(
      `SELECT ${safeColumns} FROM collaborators WHERE id = ?`,
      [id]
    )

    if (Array.isArray(rows) && rows.length === 0) {
      return sendApiError(res, 404, 'COLLABORATOR_NOT_FOUND', 'Colaborador no encontrado')
    }

    res.json(rows[0])
  } catch (error: any) {
    logger.error('Error fetching collaborator:', error)
    return sendApiError(res, 500, 'COLLABORATOR_FETCH_ONE_FAILED', 'Error al obtener colaborador')
  }
}

export const createCollaborator = async (req: Request, res: Response) => {
  try {
    const { name, position, area, orgScopeId, managerId, role, email, mfaEnabled } = req.body
    const user = (req as AuthRequest).user
    const normalizedEmail = email ? String(email).trim().toLowerCase() : null

    const VALID_ROLES = ['admin', 'director', 'manager', 'leader', 'collaborator'] as const
    const validationErrors = collectErrors([
      validateString(name, 'name', 150),
      validateString(position, 'position', 150),
      validateEnum(role, 'role', VALID_ROLES),
      ...(!area && !orgScopeId ? [{ field: 'area', message: 'area u orgScopeId es requerido' }] : []),
      ])
      if (validationErrors.length > 0) {
        return sendApiError(
          res,
          400,
          'COLLABORATOR_VALIDATION_FAILED',
          validationErrors[0].message,
          undefined,
          { fields: validationErrors }
        )
      }
      if (normalizedEmail) {
        const emailErr = validateEmail(normalizedEmail, 'email')
        if (emailErr) {
          return sendApiError(
            res,
            400,
            'COLLABORATOR_EMAIL_INVALID',
            emailErr.message,
            undefined,
            { fields: [emailErr] }
          )
        }
      }

    let resolvedArea = area
    let resolvedOrgScopeId = orgScopeId ? Number(orgScopeId) : null

    if (resolvedOrgScopeId) {
      const [scopeRows] = await pool.query<any[]>(
        'SELECT id, name FROM org_scopes WHERE id = ?',
        [resolvedOrgScopeId]
      )
      if (!scopeRows || scopeRows.length === 0) {
        return sendApiError(res, 400, 'COLLABORATOR_SCOPE_NOT_FOUND', 'Scope no encontrado')
      }
      resolvedArea = scopeRows[0].name
    }

    if (
      !canEditCollaborator(user, resolvedArea) &&
      !['admin', 'director'].includes(user?.role || '')
    ) {
      return sendApiError(res, 403, 'COLLABORATOR_CREATE_FORBIDDEN', 'Solo puedes crear colaboradores en tu area')
    }

    if (normalizedEmail) {
      const [existing] = await pool.query<any[]>(
        'SELECT id FROM collaborators WHERE email = ?',
        [normalizedEmail]
      )
      if (Array.isArray(existing) && existing.length > 0) {
        return sendApiError(res, 400, 'COLLABORATOR_EMAIL_EXISTS', 'Email ya registrado')
      }
    }

    const [result] = await pool.query(
      `INSERT INTO collaborators (name, position, area, orgScopeId, managerId, role, status, email, mfaEnabled) 
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [
        name,
        position,
        resolvedArea,
        resolvedOrgScopeId,
        managerId || null,
        role,
        normalizedEmail,
        mfaEnabled ? 1 : 0,
      ]
    )

    const insertResult = result as any
    const newId = insertResult.insertId

    if (normalizedEmail) {
      try {
        const rawToken = crypto.randomBytes(32).toString('hex')
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000) // 72 hours for invites
        await pool.query(
          'UPDATE collaborators SET passwordResetTokenHash = ?, passwordResetExpiresAt = ? WHERE id = ?',
          [tokenHash, expiresAt, newId]
        )
        const inviteLink = `${appEnv.appBaseUrl}/reset-password?token=${rawToken}`
        await sendMail({
          to: normalizedEmail,
          subject: 'Bienvenido/a a KPI Manager — Activá tu cuenta',
          html: `<p>Hola ${name},</p>
                 <p>Tu cuenta fue creada en KPI Manager. Hacé clic en el botón para establecer tu contraseña y comenzar.</p>
                 <p><a href="${inviteLink}" style="background:#f97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Activar mi cuenta</a></p>
                 <p>Este enlace vence en 72 horas.</p>
                 <p>Si no esperabas este mensaje, ignoralo.</p>`,
          text: `Hola ${name}, activá tu cuenta en KPI Manager: ${inviteLink} (vence en 72 horas)`,
        })
      } catch (mailError: any) {
        logger.error('Error sending welcome invite email:', mailError)
      }
    }

    await logAudit(
      'collaborators',
      newId,
      'CREATE',
      undefined,
      {
        name,
        position,
        area: resolvedArea,
        orgScopeId: resolvedOrgScopeId,
        managerId: managerId || null,
        role,
        status: 'active',
        email: normalizedEmail,
        mfaEnabled: mfaEnabled ? 1 : 0,
      },
      {
        userId: (req as any).user?.id,
        userName: (req as any).user?.name,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent'),
      }
    )

    res.status(201).json({
      id: newId,
      name,
      position,
      area: resolvedArea,
      orgScopeId: resolvedOrgScopeId,
      managerId: managerId || null,
      role,
      email: normalizedEmail,
      mfaEnabled: mfaEnabled ? 1 : 0,
    })
  } catch (error: any) {
    logger.error('Error creating collaborator:', error)
    return sendApiError(res, 500, 'COLLABORATOR_CREATE_FAILED', 'Error al crear colaborador')
  }
}

export const updateCollaborator = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, position, area, orgScopeId, managerId, role, email, mfaEnabled } = req.body
    const user = (req as AuthRequest).user
    const normalizedEmail = email ? String(email).trim().toLowerCase() : null

    const [oldRows] = await pool.query<CollaboratorRow[]>(
      'SELECT * FROM collaborators WHERE id = ?',
      [id]
    )
    if (!Array.isArray(oldRows) || oldRows.length === 0) {
      return sendApiError(res, 404, 'COLLABORATOR_NOT_FOUND', 'Colaborador no encontrado')
    }
    const oldValues = oldRows[0]

    const VALID_ROLES = ['admin', 'director', 'manager', 'leader', 'collaborator'] as const
    const validationErrors = collectErrors([
      name !== undefined ? validateString(name, 'name', 150) : null,
      position !== undefined ? validateString(position, 'position', 150) : null,
      role !== undefined ? validateEnum(role, 'role', VALID_ROLES) : null,
      ])
      if (validationErrors.length > 0) {
        return sendApiError(
          res,
          400,
          'COLLABORATOR_VALIDATION_FAILED',
          validationErrors[0].message,
          undefined,
          { fields: validationErrors }
        )
      }
      if (normalizedEmail) {
        const emailErr = validateEmail(normalizedEmail, 'email')
        if (emailErr) {
          return sendApiError(
            res,
            400,
            'COLLABORATOR_EMAIL_INVALID',
            emailErr.message,
            undefined,
            { fields: [emailErr] }
          )
        }
      }

    let resolvedArea = area
    let resolvedOrgScopeId = orgScopeId ? Number(orgScopeId) : oldValues?.orgScopeId || null

    if (resolvedOrgScopeId) {
      const [scopeRows] = await pool.query<any[]>(
        'SELECT id, name FROM org_scopes WHERE id = ?',
        [resolvedOrgScopeId]
      )
      if (!scopeRows || scopeRows.length === 0) {
        return sendApiError(res, 400, 'COLLABORATOR_SCOPE_NOT_FOUND', 'Scope no encontrado')
      }
      resolvedArea = scopeRows[0].name
    }

    if (!canEditCollaborator(user, oldValues?.area, Number(id))) {
      return sendApiError(res, 403, 'COLLABORATOR_UPDATE_FORBIDDEN', 'No autorizado para editar fuera de tu area')
    }

    if (normalizedEmail) {
      const [existing] = await pool.query<any[]>(
        'SELECT id FROM collaborators WHERE email = ? AND id <> ?',
        [normalizedEmail, id]
      )
      if (Array.isArray(existing) && existing.length > 0) {
        return sendApiError(res, 400, 'COLLABORATOR_EMAIL_EXISTS', 'Email ya registrado')
      }
    }

    if (managerId && Number(managerId) !== (oldValues?.managerId ?? null)) {
      const hasCycle = await wouldCreateCycle(Number(id), Number(managerId))
      if (hasCycle) {
        return sendApiError(
          res,
          400,
          'COLLABORATOR_MANAGER_CYCLE',
          'No se puede asignar ese jefe directo porque generaría una relación circular en la jerarquía'
        )
      }
    }

    const sets: string[] = []
    const setVals: any[] = []
    if ('name' in req.body)       { sets.push('name = ?');       setVals.push(String(name).trim()) }
    if ('position' in req.body)   { sets.push('position = ?');   setVals.push(String(position).trim()) }
    if ('area' in req.body || 'orgScopeId' in req.body) {
      sets.push('area = ?', 'orgScopeId = ?')
      setVals.push(resolvedArea ?? oldValues.area, resolvedOrgScopeId)
    }
    if ('managerId' in req.body)  { sets.push('managerId = ?');  setVals.push(managerId || null) }
    if ('role' in req.body)       { sets.push('role = ?');       setVals.push(role) }
    if ('email' in req.body)      { sets.push('email = ?');      setVals.push(normalizedEmail) }
    if ('mfaEnabled' in req.body) { sets.push('mfaEnabled = ?'); setVals.push(mfaEnabled ? 1 : 0) }

    if (sets.length === 0) {
      return sendApiError(res, 400, 'COLLABORATOR_UPDATE_NO_FIELDS', 'No hay campos para actualizar')
    }

    await pool.query(
      `UPDATE collaborators SET ${sets.join(', ')} WHERE id = ?`,
      [...setVals, id]
    )

    const newSnapshot = Object.fromEntries(sets.map((s, i) => [s.split(' ')[0], setVals[i]]))
    await logAudit(
      'collaborators',
      parseInt(id),
      'UPDATE',
      oldValues,
      newSnapshot,
      {
        userId: (req as any).user?.id,
        userName: (req as any).user?.name,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent'),
      }
    )

    res.json({ message: 'Colaborador actualizado correctamente' })
  } catch (error: any) {
    logger.error('Error updating collaborator:', error)
    return sendApiError(res, 500, 'COLLABORATOR_UPDATE_FAILED', 'Error al actualizar colaborador')
  }
}

export const deleteCollaborator = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const user = (req as AuthRequest).user

    const [oldRows] = await pool.query<CollaboratorRow[]>(
      'SELECT * FROM collaborators WHERE id = ?',
      [id]
    )
    const oldValues = Array.isArray(oldRows) && oldRows.length > 0 ? oldRows[0] : null

    if (!canEditCollaborator(user, oldValues?.area, Number(id))) {
      return sendApiError(res, 403, 'COLLABORATOR_DELETE_FORBIDDEN', 'No autorizado para eliminar fuera de tu area')
    }

    await pool.query('DELETE FROM collaborators WHERE id = ?', [id])

    if (oldValues) {
      await logAudit(
        'collaborators',
        parseInt(id),
        'DELETE',
        oldValues,
        undefined,
        {
          userId: (req as any).user?.id,
          userName: (req as any).user?.name,
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.get('user-agent'),
        }
      )
    }

    res.json({ message: 'Colaborador eliminado correctamente' })
  } catch (error: any) {
    logger.error('Error deleting collaborator:', error)
    return sendApiError(res, 500, 'COLLABORATOR_DELETE_FAILED', 'Error al eliminar colaborador')
  }
}

export const deactivateCollaborator = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { reason } = req.body
    const user = (req as AuthRequest).user

    const [currentRows] = await pool.query<CollaboratorRow[]>(
      'SELECT * FROM collaborators WHERE id = ?',
      [id]
    )
    if (!Array.isArray(currentRows) || currentRows.length === 0) {
      return sendApiError(res, 404, 'COLLABORATOR_NOT_FOUND', 'Colaborador no encontrado')
    }

    const current = currentRows[0]

    if (!canEditCollaborator(user, current?.area, Number(id))) {
      return sendApiError(res, 403, 'COLLABORATOR_DEACTIVATE_FORBIDDEN', 'No autorizado para desactivar fuera de tu area')
    }

    await pool.query(
      `UPDATE collaborators 
       SET status = 'inactive', inactiveReason = ?, inactiveAt = NOW() 
       WHERE id = ?`,
      [reason || null, id]
    )

    await pool.query(
      `INSERT INTO collaborator_events (collaboratorId, eventType, oldValue, newValue, reason, createdBy, createdByName)
       VALUES (?, 'termination', ?, ?, ?, ?, ?)`,
      [
        id,
        current.status,
        'inactive',
        reason || null,
        (req as any).user?.id || null,
        (req as any).user?.name || null,
      ]
    )

    await logAudit(
      'collaborators',
      parseInt(id),
      'UPDATE',
      current,
      { ...current, status: 'inactive', inactiveReason: reason || null },
      {
        userId: (req as any).user?.id,
        userName: (req as any).user?.name,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent'),
      }
    )

    res.json({ message: 'Colaborador marcado como inactivo' })
  } catch (error: any) {
    logger.error('Error deactivating collaborator:', error)
    return sendApiError(res, 500, 'COLLABORATOR_DEACTIVATE_FAILED', 'Error al desactivar colaborador')
  }
}

export const changeCollaboratorRole = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { role } = req.body
    const user = (req as AuthRequest).user

    if (!role) {
      return sendApiError(res, 400, 'COLLABORATOR_ROLE_REQUIRED', 'El rol es requerido')
    }

    const [currentRows] = await pool.query<any[]>(
      'SELECT * FROM collaborators WHERE id = ?',
      [id]
    )
    if (!Array.isArray(currentRows) || currentRows.length === 0) {
      return sendApiError(res, 404, 'COLLABORATOR_NOT_FOUND', 'Colaborador no encontrado')
    }

    const current = currentRows[0]

    if (!canEditCollaborator(user, current?.area)) {
      return sendApiError(res, 403, 'COLLABORATOR_CHANGE_ROLE_FORBIDDEN', 'No autorizado para cambiar rol fuera de tu area')
    }

    await pool.query(
      `UPDATE collaborators 
       SET role = ? 
       WHERE id = ?`,
      [role, id]
    )

    await pool.query(
      `INSERT INTO collaborator_events (collaboratorId, eventType, oldValue, newValue, createdBy, createdByName)
       VALUES (?, 'role_change', ?, ?, ?, ?)`,
      [
        id,
        current.role,
        role,
        (req as any).user?.id || null,
        (req as any).user?.name || null,
      ]
    )

    await logAudit(
      'collaborators',
      parseInt(id),
      'UPDATE',
      current,
      { ...current, role },
      {
        userId: (req as any).user?.id,
        userName: (req as any).user?.name,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent'),
      }
    )

    res.json({ message: 'Rol actualizado correctamente' })
  } catch (error: any) {
    logger.error('Error changing collaborator role:', error)
    return sendApiError(res, 500, 'COLLABORATOR_CHANGE_ROLE_FAILED', 'Error al cambiar rol de colaborador')
  }
}

export const getCollaboratorEvents = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query<any[]>(
      'SELECT * FROM collaborator_events WHERE collaboratorId = ? ORDER BY createdAt DESC',
      [id]
    )
    res.json(rows)
  } catch (error: any) {
    logger.error('Error fetching collaborator events:', error)
    return sendApiError(res, 500, 'COLLABORATOR_EVENTS_FETCH_FAILED', 'Error al obtener eventos del colaborador')
  }
}

export const resendInvite = async (req: Request, res: Response) => {
  try {
    const caller = (req as AuthRequest).user
    const callerRole = (caller?.role || '').trim().toLowerCase()
    if (!['admin', 'director', 'manager', 'leader'].includes(callerRole)) {
      return sendApiError(res, 403, 'COLLABORATOR_RESEND_INVITE_FORBIDDEN', 'No tenés permiso para reenviar invitaciones')
    }

    const { id } = req.params
    const [rows] = await pool.query<any[]>('SELECT * FROM collaborators WHERE id = ?', [Number(id)])
    const collaborator = rows?.[0]
    if (!collaborator) return sendApiError(res, 404, 'COLLABORATOR_NOT_FOUND', 'Colaborador no encontrado')
    if (!collaborator.email) {
      return sendApiError(res, 400, 'COLLABORATOR_RESEND_INVITE_EMAIL_MISSING', 'El colaborador no tiene email configurado')
    }
    if (collaborator.passwordHash) {
      return sendApiError(
        res,
        400,
        'COLLABORATOR_RESEND_INVITE_PASSWORD_ALREADY_SET',
        'El colaborador ya tiene contraseña configurada'
      )
    }

    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000)
    await pool.query(
      'UPDATE collaborators SET passwordResetTokenHash = ?, passwordResetExpiresAt = ? WHERE id = ?',
      [tokenHash, expiresAt, collaborator.id]
    )
    const inviteLink = `${appEnv.appBaseUrl}/reset-password?token=${rawToken}`
    await sendMail({
      to: collaborator.email,
      subject: 'Recordatorio — Activá tu cuenta en KPI Manager',
      html: `<p>Hola ${collaborator.name},</p>
             <p>Te reenviamos el link para activar tu cuenta en KPI Manager.</p>
             <p><a href="${inviteLink}" style="background:#f97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Activar mi cuenta</a></p>
             <p>Este enlace vence en 72 horas.</p>`,
      text: `Activá tu cuenta: ${inviteLink}`,
    })
    res.json({ message: 'Invitación reenviada correctamente' })
  } catch (error: any) {
    logger.error('Error in resendInvite:', error)
    return sendApiError(res, 500, 'COLLABORATOR_RESEND_INVITE_FAILED', 'Error al reenviar invitación')
  }
}

export const importCollaborators = async (req: Request, res: Response) => {
  try {
    const caller = (req as AuthRequest).user
    const callerRole = (caller?.role || '').trim().toLowerCase()
    const ALLOWED_IMPORT_ROLES = ['admin', 'director', 'manager', 'leader']
    if (!ALLOWED_IMPORT_ROLES.includes(callerRole)) {
      return sendApiError(
        res,
        403,
        'COLLABORATOR_IMPORT_FORBIDDEN',
        'No tenes permiso para importar colaboradores'
      )
    }

    const rows: { name: string; email?: string; position?: string; role?: string; areaName?: string }[] = req.body?.rows
    if (!Array.isArray(rows) || rows.length === 0)
      return sendApiError(res, 400, 'COLLABORATOR_IMPORT_ROWS_REQUIRED', 'No hay filas para importar')

    const VALID_ROLES = ['admin', 'director', 'manager', 'leader', 'collaborator']

    // Cargar scopes para resolver areaName → orgScopeId
    const [scopeRows] = await pool.query<any[]>('SELECT id, name FROM org_scopes WHERE active = 1')
    const scopeByName = new Map<string, number>()
    for (const s of scopeRows as any[]) scopeByName.set(s.name.trim().toLowerCase(), s.id)

    // Emails existentes para evitar duplicados
    const [emailRows] = await pool.query<any[]>('SELECT email FROM collaborators WHERE email IS NOT NULL')
    const existingEmails = new Set((emailRows as any[]).map((r) => r.email.toLowerCase()))

    const created: number[] = []
    const errors: Array<{ row: number; code: string; message: string; values?: Record<string, unknown> }> = []

    for (let i = 0; i < rows.length; i++) {
      const item = rows[i]
      const rowNum = i + 1

      if (!item.name?.trim()) {
        errors.push({ row: rowNum, code: 'COLLABORATOR_IMPORT_NAME_EMPTY', message: 'Nombre vacio' })
        continue
      }

      const role = item.role?.trim().toLowerCase() || 'collaborator'
      if (!VALID_ROLES.includes(role)) {
        errors.push({
          row: rowNum,
          code: 'COLLABORATOR_IMPORT_ROLE_INVALID',
          message: `Rol invalido: "${item.role}". Usa: collaborator, leader, director, admin`,
          values: {
            role: item.role,
            allowedRoles: VALID_ROLES.filter((value) => value !== 'manager').join(', '),
          },
        })
        continue
      }

      const normalizedEmail = item.email?.trim().toLowerCase() || null
      if (normalizedEmail && existingEmails.has(normalizedEmail)) {
        errors.push({
          row: rowNum,
          code: 'COLLABORATOR_IMPORT_EMAIL_EXISTS',
          message: `Email "${normalizedEmail}" ya registrado`,
          values: { email: normalizedEmail },
        })
        continue
      }

      let orgScopeId: number | null = null
      let areaLabel = item.areaName?.trim() || null
      if (areaLabel) {
        orgScopeId = scopeByName.get(areaLabel.toLowerCase()) ?? null
        if (!orgScopeId) {
          errors.push({
            row: rowNum,
            code: 'COLLABORATOR_IMPORT_AREA_NOT_FOUND',
            message: `Area "${areaLabel}" no encontrada`,
            values: { areaName: areaLabel },
          })
          continue
        }
      }

      const [r] = await pool.query(
        `INSERT INTO collaborators (name, position, area, orgScopeId, role, status, email, mfaEnabled)
         VALUES (?, ?, ?, ?, ?, 'active', ?, 0)`,
        [item.name.trim(), item.position?.trim() || 'Sin cargo', areaLabel, orgScopeId, role, normalizedEmail]
      ) as any[]
      const newId = (r as any).insertId
      if (normalizedEmail) existingEmails.add(normalizedEmail)
      created.push(newId)
    }

    return res.status(201).json({ total: rows.length, created: created.length, errors })
  } catch (error: any) {
    logger.error('Error importando colaboradores:', error)
    return sendApiError(res, 500, 'COLLABORATOR_IMPORT_FAILED', 'Error al importar colaboradores')
  }
}
