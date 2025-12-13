import { Request, Response } from 'express'
import { pool } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'

const userCanManageConfig = (req: Request) => {
  const user = (req as AuthRequest).user
  if (!user) return false
  return user.hasSuperpowers || user.permissions?.includes('config.manage') || false
}

export const listPermissions = async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>('SELECT id, code, description FROM permissions ORDER BY code ASC')
    res.json(rows)
  } catch (error) {
    console.error('Error listing permissions:', error)
    res.status(500).json({ error: 'Error al obtener permisos' })
  }
}

export const getCollaboratorPermissions = async (req: Request, res: Response) => {
  try {
    const { collaboratorId } = req.params
    const [rows] = await pool.query<any[]>(
      `SELECT p.code 
       FROM permissions p 
       JOIN collaborator_permissions cp ON cp.permissionId = p.id
       WHERE cp.collaboratorId = ?`,
      [collaboratorId]
    )
    const codes = Array.isArray(rows) ? rows.map((r) => r.code) : []
    res.json({ collaboratorId: Number(collaboratorId), permissions: codes })
  } catch (error) {
    console.error('Error fetching collaborator permissions:', error)
    res.status(500).json({ error: 'Error al obtener permisos del colaborador' })
  }
}

export const updateCollaboratorPermissions = async (req: Request, res: Response) => {
  try {
    if (!userCanManageConfig(req)) {
      return res.status(403).json({ error: 'No autorizado' })
    }

    const { collaboratorId } = req.params
    const { permissions } = req.body as { permissions: string[] }

    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'Permisos inválidos' })
    }

    // Obtener ids de permisos válidos
    const [permRows] = await pool.query<any[]>(
      `SELECT id, code FROM permissions WHERE code IN (${permissions.map(() => '?').join(',') || "''"})`,
      permissions
    )
    const validPermissions = Array.isArray(permRows) ? permRows : []

    // Limpiar y volver a insertar
    await pool.query('DELETE FROM collaborator_permissions WHERE collaboratorId = ?', [collaboratorId])

    if (validPermissions.length > 0) {
      const values = validPermissions.map((p) => [collaboratorId, p.id])
      await pool.query('INSERT INTO collaborator_permissions (collaboratorId, permissionId) VALUES ?', [values])
    }

    res.json({ message: 'Permisos actualizados', permissions: permissions })
  } catch (error) {
    console.error('Error updating collaborator permissions:', error)
    res.status(500).json({ error: 'Error al actualizar permisos' })
  }
}

export const toggleSuperpowers = async (req: Request, res: Response) => {
  try {
    if (!userCanManageConfig(req)) {
      return res.status(403).json({ error: 'No autorizado' })
    }
    const { collaboratorId } = req.params
    const { hasSuperpowers } = req.body as { hasSuperpowers: boolean }
    await pool.query('UPDATE collaborators SET hasSuperpowers = ? WHERE id = ?', [
      hasSuperpowers ? 1 : 0,
      collaboratorId,
    ])
    res.json({ message: 'Superpoderes actualizados', hasSuperpowers })
  } catch (error) {
    console.error('Error toggling superpowers:', error)
    res.status(500).json({ error: 'Error al actualizar superpoderes' })
  }
}
