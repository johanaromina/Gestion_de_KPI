import { Request, Response } from 'express'
import { pool } from '../config/database'
import { Collaborator } from '../types'
import { logAudit } from '../utils/audit'
import { AuthRequest } from '../middleware/auth.middleware'

const canEditCollaborator = (
  user: AuthRequest['user'],
  collaboratorArea?: string
) => {
  if (!user) return false
  if (['admin', 'director'].includes(user.role)) return true
  return collaboratorArea ? user.area === collaboratorArea : false
}

export const getCollaborators = async (req: Request, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive === 'true'
    const query = includeInactive
      ? 'SELECT * FROM collaborators ORDER BY name ASC'
      : "SELECT * FROM collaborators WHERE status = 'active' ORDER BY name ASC"
    const [rows] = await pool.query<Collaborator[]>(query)
    res.json(rows)
  } catch (error: any) {
    console.error('Error fetching collaborators:', error)
    res.status(500).json({ error: 'Error al obtener colaboradores' })
  }
}

export const getCollaboratorById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query<Collaborator[]>(
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
    const { name, position, area, managerId, role } = req.body
    const user = (req as AuthRequest).user

    if (!name || !position || !area || !role) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    if (
      !canEditCollaborator(user, area) &&
      !['admin', 'director'].includes(user?.role || '')
    ) {
      return res.status(403).json({ error: 'Solo puedes crear colaboradores en tu área' })
    }

    const [result] = await pool.query(
      `INSERT INTO collaborators (name, position, area, managerId, role, status) 
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [name, position, area, managerId || null, role]
    )

    const insertResult = result as any
    const newId = insertResult.insertId

    // Registrar auditoría
    await logAudit(
      'collaborators',
      newId,
      'CREATE',
      undefined,
      { name, position, area, managerId: managerId || null, role, status: 'active' },
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
      area,
      managerId: managerId || null,
      role,
    })
  } catch (error: any) {
    console.error('Error creating collaborator:', error)
    res.status(500).json({ error: 'Error al crear colaborador' })
  }
}

export const updateCollaborator = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, position, area, managerId, role } = req.body
    const user = (req as AuthRequest).user

    // Obtener valores anteriores
    const [oldRows] = await pool.query<any[]>(
      'SELECT * FROM collaborators WHERE id = ?',
      [id]
    )
    const oldValues = Array.isArray(oldRows) && oldRows.length > 0 ? oldRows[0] : null

    if (!canEditCollaborator(user, oldValues?.area)) {
      return res.status(403).json({ error: 'No autorizado para editar fuera de tu área' })
    }

    await pool.query(
      `UPDATE collaborators 
       SET name = ?, position = ?, area = ?, managerId = ?, role = ? 
       WHERE id = ?`,
      [name, position, area, managerId || null, role, id]
    )

    // Registrar auditoría
    await logAudit(
      'collaborators',
      parseInt(id),
      'UPDATE',
      oldValues,
      { name, position, area, managerId: managerId || null, role },
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

    // Obtener valores antes de eliminar
    const [oldRows] = await pool.query<any[]>(
      'SELECT * FROM collaborators WHERE id = ?',
      [id]
    )
    const oldValues = Array.isArray(oldRows) && oldRows.length > 0 ? oldRows[0] : null

    if (!canEditCollaborator(user, oldValues?.area)) {
      return res.status(403).json({ error: 'No autorizado para eliminar fuera de tu área' })
    }

    await pool.query('DELETE FROM collaborators WHERE id = ?', [id])

    // Registrar auditoría
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

    const [currentRows] = await pool.query<any[]>(
      'SELECT * FROM collaborators WHERE id = ?',
      [id]
    )
    if (!Array.isArray(currentRows) || currentRows.length === 0) {
      return res.status(404).json({ error: 'Colaborador no encontrado' })
    }

    const current = currentRows[0]

    if (!canEditCollaborator(user, current?.area)) {
      return res.status(403).json({ error: 'No autorizado para desactivar fuera de tu área' })
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
      return res.status(403).json({ error: 'No autorizado para cambiar rol fuera de tu área' })
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

