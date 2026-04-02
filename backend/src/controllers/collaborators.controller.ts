import { Request, Response } from 'express'
import { RowDataPacket } from 'mysql2/promise'
import crypto from 'crypto'
import { pool } from '../config/database'
import { Collaborator } from '../types'
import { logAudit } from '../utils/audit'
import { AuthRequest } from '../middleware/auth.middleware'
import { appEnv } from '../config/env'
import { sendMail } from '../utils/mailer'

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
    if (!targetArea && userArea) return true
    return userArea && targetArea ? userArea === targetArea : false
  }

  return false
}

export const getCollaborators = async (req: Request, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive === 'true'
    const query = includeInactive
      ? 'SELECT * FROM collaborators ORDER BY name ASC'
      : "SELECT * FROM collaborators WHERE status = 'active' ORDER BY name ASC"
    const [rows] = await pool.query<CollaboratorRow[]>(query)
    res.json(rows as Collaborator[])
  } catch (error: any) {
    console.error('Error fetching collaborators:', error)
    res.status(500).json({ error: 'Error al obtener colaboradores' })
  }
}

export const getCollaboratorById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query<CollaboratorRow[]>(
      'SELECT * FROM collaborators WHERE id = ?',
      [id]
    )

    if (Array.isArray(rows) && rows.length === 0) {
      return res.status(404).json({ error: 'Colaborador no encontrado' })
    }

    res.json(rows[0])
  } catch (error: any) {
    console.error('Error fetching collaborator:', error)
    res.status(500).json({ error: 'Error al obtener colaborador' })
  }
}

export const createCollaborator = async (req: Request, res: Response) => {
  try {
    const { name, position, area, orgScopeId, managerId, role, email, mfaEnabled } = req.body
    const user = (req as AuthRequest).user
    const normalizedEmail = email ? String(email).trim().toLowerCase() : null

    if (!name || !position || (!area && !orgScopeId) || !role) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    let resolvedArea = area
    let resolvedOrgScopeId = orgScopeId ? Number(orgScopeId) : null

    if (resolvedOrgScopeId) {
      const [scopeRows] = await pool.query<any[]>(
        'SELECT id, name FROM org_scopes WHERE id = ?',
        [resolvedOrgScopeId]
      )
      if (!scopeRows || scopeRows.length === 0) {
        return res.status(400).json({ error: 'Scope no encontrado' })
      }
      resolvedArea = scopeRows[0].name
    }

    if (
      !canEditCollaborator(user, resolvedArea) &&
      !['admin', 'director'].includes(user?.role || '')
    ) {
      return res.status(403).json({ error: 'Solo puedes crear colaboradores en tu area' })
    }

    if (normalizedEmail) {
      const [existing] = await pool.query<any[]>(
        'SELECT id FROM collaborators WHERE email = ?',
        [normalizedEmail]
      )
      if (Array.isArray(existing) && existing.length > 0) {
        return res.status(400).json({ error: 'Email ya registrado' })
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
        console.error('Error sending welcome invite email:', mailError)
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
    console.error('Error creating collaborator:', error)
    res.status(500).json({ error: 'Error al crear colaborador' })
  }
}

export const updateCollaborator = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, position, area, orgScopeId, managerId, role, email, mfaEnabled } = req.body
    const user = (req as AuthRequest).user
    console.log('updateCollaborator user:', user)
    const normalizedEmail = email ? String(email).trim().toLowerCase() : null

    const [oldRows] = await pool.query<CollaboratorRow[]>(
      'SELECT * FROM collaborators WHERE id = ?',
      [id]
    )
    const oldValues = Array.isArray(oldRows) && oldRows.length > 0 ? oldRows[0] : null

    let resolvedArea = area
    let resolvedOrgScopeId = orgScopeId ? Number(orgScopeId) : oldValues?.orgScopeId || null

    if (resolvedOrgScopeId) {
      const [scopeRows] = await pool.query<any[]>(
        'SELECT id, name FROM org_scopes WHERE id = ?',
        [resolvedOrgScopeId]
      )
      if (!scopeRows || scopeRows.length === 0) {
        return res.status(400).json({ error: 'Scope no encontrado' })
      }
      resolvedArea = scopeRows[0].name
    }

    if (!canEditCollaborator(user, oldValues?.area, Number(id))) {
      return res.status(403).json({ error: 'No autorizado para editar fuera de tu area' })
    }

    if (normalizedEmail) {
      const [existing] = await pool.query<any[]>(
        'SELECT id FROM collaborators WHERE email = ? AND id <> ?',
        [normalizedEmail, id]
      )
      if (Array.isArray(existing) && existing.length > 0) {
        return res.status(400).json({ error: 'Email ya registrado' })
      }
    }

    await pool.query(
      `UPDATE collaborators 
       SET name = ?, position = ?, area = ?, orgScopeId = ?, managerId = ?, role = ?, email = ?, mfaEnabled = ? 
       WHERE id = ?`,
      [
        name,
        position,
        resolvedArea,
        resolvedOrgScopeId,
        managerId || null,
        role,
        normalizedEmail,
        mfaEnabled ? 1 : 0,
        id,
      ]
    )

    await logAudit(
      'collaborators',
      parseInt(id),
      'UPDATE',
      oldValues,
      {
        name,
        position,
        area: resolvedArea,
        orgScopeId: resolvedOrgScopeId,
        managerId: managerId || null,
        role,
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

    res.json({ message: 'Colaborador actualizado correctamente' })
  } catch (error: any) {
    console.error('Error updating collaborator:', error)
    res.status(500).json({ error: 'Error al actualizar colaborador' })
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
      return res.status(403).json({ error: 'No autorizado para eliminar fuera de tu area' })
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
    console.error('Error deleting collaborator:', error)
    res.status(500).json({ error: 'Error al eliminar colaborador' })
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
      return res.status(404).json({ error: 'Colaborador no encontrado' })
    }

    const current = currentRows[0]

    if (!canEditCollaborator(user, current?.area, Number(id))) {
      return res.status(403).json({ error: 'No autorizado para desactivar fuera de tu area' })
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
    console.error('Error deactivating collaborator:', error)
    res.status(500).json({ error: 'Error al desactivar colaborador' })
  }
}

export const changeCollaboratorRole = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { role } = req.body
    const user = (req as AuthRequest).user

    if (!role) {
      return res.status(400).json({ error: 'El rol es requerido' })
    }

    const [currentRows] = await pool.query<any[]>(
      'SELECT * FROM collaborators WHERE id = ?',
      [id]
    )
    if (!Array.isArray(currentRows) || currentRows.length === 0) {
      return res.status(404).json({ error: 'Colaborador no encontrado' })
    }

    const current = currentRows[0]

    if (!canEditCollaborator(user, current?.area)) {
      return res.status(403).json({ error: 'No autorizado para cambiar rol fuera de tu area' })
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
    console.error('Error changing collaborator role:', error)
    res.status(500).json({ error: 'Error al cambiar rol de colaborador' })
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
    console.error('Error fetching collaborator events:', error)
    res.status(500).json({ error: 'Error al obtener eventos del colaborador' })
  }
}

export const resendInvite = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query<any[]>('SELECT * FROM collaborators WHERE id = ?', [Number(id)])
    const collaborator = rows?.[0]
    if (!collaborator) return res.status(404).json({ error: 'Colaborador no encontrado' })
    if (!collaborator.email) return res.status(400).json({ error: 'El colaborador no tiene email configurado' })
    if (collaborator.passwordHash) return res.status(400).json({ error: 'El colaborador ya tiene contraseña configurada' })

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
    console.error('Error in resendInvite:', error)
    res.status(500).json({ error: 'Error al reenviar invitación' })
  }
}
