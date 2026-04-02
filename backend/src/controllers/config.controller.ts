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

const fetchRolePermissions = async (roleIds: number[]) => {
  if (!roleIds.length) return new Map<number, string[]>()
  const [rows] = await pool.query<any[]>(
    `SELECT rp.roleId, p.code
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permissionId
     WHERE rp.roleId IN (${roleIds.map(() => '?').join(',')})`,
    roleIds
  )
  const map = new Map<number, string[]>()
  rows?.forEach((row: any) => {
    if (!map.has(row.roleId)) map.set(row.roleId, [])
    map.get(row.roleId)!.push(row.code)
  })
  return map
}

const DEFAULT_PERMISSIONS: Array<{ code: string; description: string }> = [
  { code: 'config.manage', description: 'Gestionar roles, permisos y superpoderes' },
  { code: 'config.view', description: 'Ver sección de configuración' },
  { code: 'view_dashboard', description: 'Ver dashboard' },
  { code: 'view_reports', description: 'Ver reportes y vistas agregadas' },
  { code: 'view_audit', description: 'Ver auditoria' },
  { code: 'kpi_read', description: 'Ver KPIs' },
  { code: 'kpi_create', description: 'Crear KPIs' },
  { code: 'kpi_update', description: 'Editar KPIs' },
  { code: 'kpi_delete', description: 'Eliminar KPIs' },
  { code: 'assignment_read', description: 'Ver asignaciones' },
  { code: 'assignment_create', description: 'Crear asignaciones' },
  { code: 'assignment_update', description: 'Editar asignaciones' },
  { code: 'assignment_close', description: 'Cerrar asignaciones' },
  { code: 'curation_read', description: 'Ver curaduria' },
  { code: 'curation_submit', description: 'Proponer curaduria' },
  { code: 'curation_review', description: 'Aprobar/Rechazar curaduria' },
  { code: 'curation_edit', description: 'Editar criterio en borrador' },
  { code: 'measurement_read', description: 'Ver mediciones' },
  { code: 'measurement_create_manual', description: 'Cargar mediciones manuales' },
  { code: 'measurement_import', description: 'Importar mediciones' },
  { code: 'measurement_run_ingest', description: 'Ejecutar ingestas' },
  { code: 'measurement_approve', description: 'Aprobar mediciones' },
]

const ensureDefaultPermissions = async () => {
  const [rows] = await pool.query<any[]>('SELECT COUNT(*) as count FROM permissions')
  const count = Number(rows?.[0]?.count || 0)
  if (count > 0) return
  const values = DEFAULT_PERMISSIONS.map((p) => [p.code, p.description])
  await pool.query('INSERT IGNORE INTO permissions (code, description) VALUES ?', [values])
}

export const listPermissions = async (_req: Request, res: Response) => {
  try {
    await ensureDefaultPermissions()
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

    const [roles] = await pool.query<any[]>(
      `SELECT r.*, COUNT(cr.collaboratorId) as usersCount
       FROM roles r
       LEFT JOIN collaborator_roles cr ON cr.roleId = r.id
       GROUP BY r.id
       ORDER BY r.name ASC`
    )

    const roleIds = Array.isArray(roles) ? roles.map((r) => r.id) : []
    const permsByRole = await fetchRolePermissions(roleIds)

    const payload = (roles || []).map((role: any) => ({
      ...role,
      permissions: permsByRole.get(role.id) || [],
    }))

    res.json(payload)
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

    const [roleRows] = await pool.query<any[]>('SELECT id, code FROM roles WHERE code = ? LIMIT 1', [
      roleCode,
    ])
    if (!Array.isArray(roleRows) || roleRows.length === 0) {
      return res.status(400).json({ error: 'Rol inválido' })
    }
    const roleId = roleRows[0].id

    await pool.query(
      `INSERT INTO collaborator_roles (collaboratorId, roleId)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE roleId = VALUES(roleId)`,
      [collaboratorId, roleId]
    )
    await pool.query('DELETE FROM collaborator_permissions WHERE collaboratorId = ?', [collaboratorId])

    res.json({ message: 'Rol asignado', roleCode })
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
