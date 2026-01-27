import { Request, Response } from 'express'
import { pool } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'

const userCanManageConfig = (req: Request) => {
  const user = (req as AuthRequest).user
  if (!user) return false
  return user.hasSuperpowers || user.permissions?.includes('config.manage') || false
}

const userCanViewConfig = (req: Request) => {
  const user = (req as AuthRequest).user
  if (!user) return false
  return (
    user.hasSuperpowers ||
    user.permissions?.includes('config.manage') ||
    user.permissions?.includes('config.view') ||
    false
  )
}

const ROLE_PRESETS: Array<{
  code: string
  name: string
  permissions: string[]
}> = [
  {
    code: 'admin',
    name: 'Admin',
    permissions: [
      'config.manage',
      'config.view',
      'kpi_read',
      'kpi_create',
      'kpi_update',
      'kpi_delete',
      'assignment_read',
      'assignment_create',
      'assignment_update',
      'assignment_close',
      'curation_read',
      'curation_submit',
      'curation_review',
      'curation_edit',
      'measurement_read',
      'measurement_create_manual',
      'measurement_import',
      'measurement_run_ingest',
      'measurement_approve',
      'view_dashboard',
      'view_reports',
      'view_audit',
    ],
  },
  {
    code: 'data_curator',
    name: 'Data Curator',
    permissions: [
      'config.view',
      'kpi_read',
      'assignment_read',
      'curation_read',
      'curation_review',
      'curation_edit',
      'measurement_read',
      'view_dashboard',
      'view_reports',
      'view_audit',
    ],
  },
  {
    code: 'producer',
    name: 'Producer',
    permissions: [
      'kpi_read',
      'assignment_read',
      'curation_submit',
      'measurement_read',
      'measurement_create_manual',
      'measurement_import',
      'measurement_run_ingest',
      'view_dashboard',
      'view_reports',
    ],
  },
  {
    code: 'viewer',
    name: 'Viewer',
    permissions: ['view_dashboard', 'view_reports', 'kpi_read', 'assignment_read', 'measurement_read'],
  },
  {
    code: 'leader',
    name: 'Leader/Manager',
    permissions: [
      'kpi_read',
      'assignment_read',
      'assignment_create',
      'assignment_update',
      'assignment_close',
      'curation_submit',
      'measurement_read',
      'measurement_approve',
      'view_dashboard',
      'view_reports',
    ],
  },
]

export const listPermissions = async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>('SELECT id, code, description FROM permissions ORDER BY code ASC')
    res.json(rows)
  } catch (error) {
    console.error('Error listing permissions:', error)
    res.status(500).json({ error: 'Error al obtener permisos' })
  }
}

export const listRoles = async (req: Request, res: Response) => {
  try {
    if (!userCanViewConfig(req)) {
      return res.status(403).json({ error: 'No autorizado' })
    }

    const [rows] = await pool.query<any[]>(
      `SELECT cp.collaboratorId, p.code
       FROM collaborator_permissions cp
       JOIN permissions p ON cp.permissionId = p.id`
    )

    const permsByUser = new Map<number, Set<string>>()
    for (const row of rows || []) {
      if (!permsByUser.has(row.collaboratorId)) {
        permsByUser.set(row.collaboratorId, new Set())
      }
      permsByUser.get(row.collaboratorId)?.add(row.code)
    }

    const rolesWithCounts = ROLE_PRESETS.map((role) => {
      let count = 0
      permsByUser.forEach((set) => {
        const hasAll = role.permissions.every((perm) => set.has(perm))
        if (hasAll) count += 1
      })
      return { ...role, usersCount: count }
    })

    res.json(rolesWithCounts)
  } catch (error) {
    console.error('Error listing roles:', error)
    res.status(500).json({ error: 'Error al obtener roles' })
  }
}

export const assignRoleToCollaborator = async (req: Request, res: Response) => {
  try {
    if (!userCanManageConfig(req)) {
      return res.status(403).json({ error: 'No autorizado' })
    }

    const { collaboratorId } = req.params
    const { roleCode } = req.body as { roleCode: string }

    const role = ROLE_PRESETS.find((r) => r.code === roleCode)
    if (!role) {
      return res.status(400).json({ error: 'Rol inválido' })
    }

    const [permRows] = await pool.query<any[]>(
      `SELECT id, code FROM permissions WHERE code IN (${role.permissions.map(() => '?').join(',')})`,
      role.permissions
    )
    const validPermissions = Array.isArray(permRows) ? permRows : []

    await pool.query('DELETE FROM collaborator_permissions WHERE collaboratorId = ?', [collaboratorId])

    if (validPermissions.length > 0) {
      const values = validPermissions.map((p) => [collaboratorId, p.id])
      await pool.query('INSERT INTO collaborator_permissions (collaboratorId, permissionId) VALUES ?', [values])
    }

    res.json({ message: 'Rol asignado', roleCode, permissions: role.permissions })
  } catch (error) {
    console.error('Error assigning role:', error)
    res.status(500).json({ error: 'Error al asignar rol' })
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
