import { Request, Response } from 'express'
import { pool } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import { logAudit } from '../utils/audit'
import { logger } from '../utils/logger'
import { sendApiError } from '../utils/api-errors'

const canManageSecurity = (req: Request) => {
  const user = (req as AuthRequest).user
  return !!(user?.hasSuperpowers || user?.permissions?.includes('config.manage'))
}

const canViewSecurity = (req: Request) => {
  const user = (req as AuthRequest).user
  return !!(
    user?.hasSuperpowers ||
    user?.permissions?.includes('config.manage') ||
    user?.permissions?.includes('config.view')
  )
}

const getAuditMeta = (req: Request) => {
  const user = (req as AuthRequest).user
  return {
    userId: user?.collaboratorId || user?.id,
    userName: user?.name,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  }
}

const sendSecurityForbidden = (res: Response) =>
  sendApiError(res, 403, 'SECURITY_FORBIDDEN', 'No autorizado')

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

export const listRoles = async (req: Request, res: Response) => {
  try {
    if (!canViewSecurity(req)) return sendSecurityForbidden(res)
    const [roles] = await pool.query<any[]>(
      `SELECT r.*, COUNT(cr.collaboratorId) as usersCount
       FROM roles r
       LEFT JOIN collaborator_roles cr ON cr.roleId = r.id
       GROUP BY r.id
       ORDER BY r.name ASC`
    )
    const roleIds = Array.isArray(roles) ? roles.map((r: any) => r.id) : []
    const permsByRole = await fetchRolePermissions(roleIds)
    res.json(
      (roles || []).map((role) => ({
        ...role,
        permissions: permsByRole.get(role.id) || [],
      }))
    )
  } catch (error) {
    logger.error('Error listing roles:', error)
    return sendApiError(res, 500, 'SECURITY_ROLES_FETCH_FAILED', 'Error al obtener roles')
  }
}

export const createRole = async (req: Request, res: Response) => {
  try {
    if (!canManageSecurity(req)) return sendSecurityForbidden(res)
    const { code, name, description, permissions } = req.body as {
      code: string
      name: string
      description?: string
      permissions?: string[]
    }
    if (!code || !name) return sendApiError(res, 400, 'SECURITY_ROLE_FIELDS_REQUIRED', 'Nombre y código requeridos')

    const [existing] = await pool.query<any[]>('SELECT id FROM roles WHERE code = ? LIMIT 1', [code])
    if (Array.isArray(existing) && existing.length > 0) {
      return sendApiError(res, 400, 'SECURITY_ROLE_CODE_EXISTS', 'Código de rol ya existe')
    }

    const [result] = await pool.query<any>(
      'INSERT INTO roles (code, name, description, editable) VALUES (?, ?, ?, 1)',
      [code, name, description || null]
    )
    const roleId = result.insertId

    if (Array.isArray(permissions) && permissions.length > 0) {
      const [permRows] = await pool.query<any[]>(
        `SELECT id FROM permissions WHERE code IN (${permissions.map(() => '?').join(',')})`,
        permissions
      )
      const values = (permRows || []).map((p: any) => [roleId, p.id])
      if (values.length > 0) {
        await pool.query('INSERT INTO role_permissions (roleId, permissionId) VALUES ?', [values])
      }
    }

    await logAudit('roles', Number(roleId), 'CREATE', null, { code, name, description, permissions }, getAuditMeta(req))

    res.json({ message: 'Rol creado', roleId })
  } catch (error) {
    logger.error('Error creating role:', error)
    return sendApiError(res, 500, 'SECURITY_ROLE_CREATE_FAILED', 'Error al crear rol')
  }
}

export const updateRole = async (req: Request, res: Response) => {
  try {
    if (!canManageSecurity(req)) return sendSecurityForbidden(res)
    const { roleId } = req.params
    const { name, description, permissions } = req.body as {
      name?: string
      description?: string
      permissions?: string[]
    }

    const [rows] = await pool.query<any[]>(
      'SELECT id, name, description, editable FROM roles WHERE id = ? LIMIT 1',
      [roleId]
    )
    if (!Array.isArray(rows) || rows.length === 0) {
      return sendApiError(res, 404, 'SECURITY_ROLE_NOT_FOUND', 'Rol no encontrado')
    }
    if (!rows[0].editable) {
      return sendApiError(res, 400, 'SECURITY_ROLE_PROTECTED', 'Rol protegido')
    }

    const [beforePerms] = await pool.query<any[]>(
      `SELECT p.code
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permissionId
      WHERE rp.roleId = ?`,
      [roleId]
    )

    await pool.query('UPDATE roles SET name = ?, description = ? WHERE id = ?', [
      name || null,
      description || null,
      roleId,
    ])

    await pool.query('DELETE FROM role_permissions WHERE roleId = ?', [roleId])

    if (Array.isArray(permissions) && permissions.length > 0) {
      const [permRows] = await pool.query<any[]>(
        `SELECT id FROM permissions WHERE code IN (${permissions.map(() => '?').join(',')})`,
        permissions
      )
      const values = (permRows || []).map((p: any) => [roleId, p.id])
      if (values.length > 0) {
        await pool.query('INSERT INTO role_permissions (roleId, permissionId) VALUES ?', [values])
      }
    }

    await logAudit(
      'roles',
      Number(roleId),
      'UPDATE',
      {
        name: rows[0].name,
        description: rows[0].description,
        permissions: (beforePerms || []).map((p: any) => p.code),
      },
      {
        name: name || null,
        description: description || null,
        permissions: permissions || [],
      },
      getAuditMeta(req)
    )

    res.json({ message: 'Rol actualizado' })
  } catch (error) {
    logger.error('Error updating role:', error)
    return sendApiError(res, 500, 'SECURITY_ROLE_UPDATE_FAILED', 'Error al actualizar rol')
  }
}

export const cloneRole = async (req: Request, res: Response) => {
  try {
    if (!canManageSecurity(req)) return sendSecurityForbidden(res)
    const { roleId } = req.params
    const { code, name } = req.body as { code: string; name: string }
    if (!code || !name) return sendApiError(res, 400, 'SECURITY_ROLE_FIELDS_REQUIRED', 'Nombre y código requeridos')

    const [existing] = await pool.query<any[]>('SELECT id FROM roles WHERE code = ? LIMIT 1', [code])
    if (Array.isArray(existing) && existing.length > 0) {
      return sendApiError(res, 400, 'SECURITY_ROLE_CODE_EXISTS', 'Código de rol ya existe')
    }

    const [permRows] = await pool.query<any[]>(
      `SELECT permissionId FROM role_permissions WHERE roleId = ?`,
      [roleId]
    )

    const [result] = await pool.query<any>(
      'INSERT INTO roles (code, name, description, editable) VALUES (?, ?, ?, 1)',
      [code, name, `Clonado de rol ${roleId}`]
    )
    const newRoleId = result.insertId

    const values = (permRows || []).map((p) => [newRoleId, p.permissionId])
    if (values.length > 0) {
      await pool.query('INSERT INTO role_permissions (roleId, permissionId) VALUES ?', [values])
    }

    await logAudit(
      'roles',
      Number(newRoleId),
      'CREATE',
      { sourceRoleId: Number(roleId) },
      { code, name },
      getAuditMeta(req)
    )

    res.json({ message: 'Rol clonado', roleId: newRoleId })
  } catch (error) {
    logger.error('Error cloning role:', error)
    return sendApiError(res, 500, 'SECURITY_ROLE_CLONE_FAILED', 'Error al clonar rol')
  }
}

export const deleteRole = async (req: Request, res: Response) => {
  try {
    if (!canManageSecurity(req)) return sendSecurityForbidden(res)
    const { roleId } = req.params
    const [rows] = await pool.query<any[]>(
      'SELECT id, name, code, description, editable FROM roles WHERE id = ? LIMIT 1',
      [roleId]
    )
    if (!Array.isArray(rows) || rows.length === 0) {
      return sendApiError(res, 404, 'SECURITY_ROLE_NOT_FOUND', 'Rol no encontrado')
    }
    if (!rows[0].editable) {
      return sendApiError(res, 400, 'SECURITY_ROLE_PROTECTED', 'Rol protegido')
    }

    const [counts] = await pool.query<any[]>(
      `SELECT 
         (SELECT COUNT(*) FROM collaborator_roles WHERE roleId = ?) as userCount,
         (SELECT COUNT(*) FROM org_scope_roles WHERE roleId = ?) as scopeCount`,
      [roleId, roleId]
    )
    if (counts?.[0] && (counts[0].userCount > 0 || counts[0].scopeCount > 0)) {
      return sendApiError(res, 400, 'SECURITY_ROLE_IN_USE', 'Rol en uso')
    }

    await pool.query('DELETE FROM roles WHERE id = ?', [roleId])

    await logAudit('roles', Number(roleId), 'DELETE', rows[0], null, getAuditMeta(req))

    res.json({ message: 'Rol eliminado' })
  } catch (error) {
    logger.error('Error deleting role:', error)
    return sendApiError(res, 500, 'SECURITY_ROLE_DELETE_FAILED', 'Error al eliminar rol')
  }
}

export const listScopeRoles = async (req: Request, res: Response) => {
  try {
    if (!canViewSecurity(req)) return sendSecurityForbidden(res)
    const [rows] = await pool.query<any[]>(
      `SELECT s.id as scopeId, s.name, s.type, s.parentId, s.active,
              sr.roleId, r.code as roleCode, r.name as roleName
       FROM org_scopes s
       LEFT JOIN org_scope_roles sr ON sr.orgScopeId = s.id
       LEFT JOIN roles r ON r.id = sr.roleId
       ORDER BY s.type ASC, s.name ASC`
    )
    res.json(rows)
  } catch (error) {
    logger.error('Error listing scope roles:', error)
    return sendApiError(res, 500, 'SECURITY_SCOPE_ROLES_FETCH_FAILED', 'Error al obtener roles por scope')
  }
}

export const assignScopeRole = async (req: Request, res: Response) => {
  try {
    if (!canManageSecurity(req)) return sendSecurityForbidden(res)
    const { scopeId } = req.params
    const { roleId } = req.body as { roleId?: number | null }
    const [beforeRows] = await pool.query<any[]>(
      'SELECT roleId FROM org_scope_roles WHERE orgScopeId = ? LIMIT 1',
      [scopeId]
    )
    const beforeRoleId = Array.isArray(beforeRows) && beforeRows.length > 0 ? beforeRows[0].roleId : null
    if (!roleId) {
      await pool.query('DELETE FROM org_scope_roles WHERE orgScopeId = ?', [scopeId])
      await logAudit(
        'org_scope_roles',
        Number(scopeId),
        'UPDATE',
        { roleId: beforeRoleId },
        { roleId: null },
        getAuditMeta(req)
      )
      return res.json({ message: 'Rol removido del scope' })
    }
    await pool.query(
      `INSERT INTO org_scope_roles (orgScopeId, roleId)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE roleId = VALUES(roleId)`,
      [scopeId, roleId]
    )
    await logAudit(
      'org_scope_roles',
      Number(scopeId),
      'UPDATE',
      { roleId: beforeRoleId },
      { roleId },
      getAuditMeta(req)
    )
    res.json({ message: 'Rol asignado al scope' })
  } catch (error) {
    logger.error('Error assigning scope role:', error)
    return sendApiError(res, 500, 'SECURITY_SCOPE_ROLE_ASSIGN_FAILED', 'Error al asignar rol al scope')
  }
}

export const listUserRoles = async (req: Request, res: Response) => {
  try {
    if (!canViewSecurity(req)) return sendSecurityForbidden(res)
    const [rows] = await pool.query<any[]>(
      `SELECT c.id, c.name, c.email, c.role as legacyRole, c.orgScopeId,
              cr.roleId as userRoleId, r.name as userRoleName, r.code as userRoleCode,
              sr.roleId as scopeRoleId, rs.name as scopeRoleName, rs.code as scopeRoleCode,
              (SELECT COUNT(*) FROM collaborator_permissions cp WHERE cp.collaboratorId = c.id) as overridesCount
       FROM collaborators c
       LEFT JOIN collaborator_roles cr ON cr.collaboratorId = c.id
       LEFT JOIN roles r ON r.id = cr.roleId
       LEFT JOIN org_scope_roles sr ON sr.orgScopeId = c.orgScopeId
       LEFT JOIN roles rs ON rs.id = sr.roleId
       ORDER BY c.name ASC`
    )
    res.json(rows)
  } catch (error) {
    logger.error('Error listing user roles:', error)
    return sendApiError(res, 500, 'SECURITY_USER_ROLES_FETCH_FAILED', 'Error al obtener roles por usuario')
  }
}

export const assignUserRole = async (req: Request, res: Response) => {
  try {
    if (!canManageSecurity(req)) return sendSecurityForbidden(res)
    const { collaboratorId } = req.params
    const { roleId } = req.body as { roleId?: number | null }
    const [beforeRows] = await pool.query<any[]>(
      'SELECT roleId FROM collaborator_roles WHERE collaboratorId = ? LIMIT 1',
      [collaboratorId]
    )
    const beforeRoleId = Array.isArray(beforeRows) && beforeRows.length > 0 ? beforeRows[0].roleId : null
    if (!roleId) {
      await pool.query('DELETE FROM collaborator_roles WHERE collaboratorId = ?', [collaboratorId])
      await logAudit(
        'collaborator_roles',
        Number(collaboratorId),
        'UPDATE',
        { roleId: beforeRoleId },
        { roleId: null },
        getAuditMeta(req)
      )
      return res.json({ message: 'Rol removido del usuario' })
    }
    await pool.query(
      `INSERT INTO collaborator_roles (collaboratorId, roleId)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE roleId = VALUES(roleId)`,
      [collaboratorId, roleId]
    )
    await logAudit(
      'collaborator_roles',
      Number(collaboratorId),
      'UPDATE',
      { roleId: beforeRoleId },
      { roleId },
      getAuditMeta(req)
    )
    res.json({ message: 'Rol asignado al usuario' })
  } catch (error) {
    logger.error('Error assigning user role:', error)
    return sendApiError(res, 500, 'SECURITY_USER_ROLE_ASSIGN_FAILED', 'Error al asignar rol al usuario')
  }
}

export const listUserOverrides = async (req: Request, res: Response) => {
  try {
    if (!canViewSecurity(req)) return sendSecurityForbidden(res)
    const { collaboratorId } = req.params
    const [rows] = await pool.query<any[]>(
      `SELECT p.code
       FROM permissions p
       JOIN collaborator_permissions cp ON cp.permissionId = p.id
       WHERE cp.collaboratorId = ?`,
      [collaboratorId]
    )
    res.json({ collaboratorId: Number(collaboratorId), permissions: rows?.map((r: any) => r.code) || [] })
  } catch (error) {
    logger.error('Error listing user overrides:', error)
    return sendApiError(res, 500, 'SECURITY_USER_OVERRIDES_FETCH_FAILED', 'Error al obtener permisos del usuario')
  }
}

export const updateUserOverrides = async (req: Request, res: Response) => {
  try {
    if (!canManageSecurity(req)) return sendSecurityForbidden(res)
    const { collaboratorId } = req.params
    const { permissions } = req.body as { permissions: string[] }
    if (!Array.isArray(permissions)) {
      return sendApiError(res, 400, 'SECURITY_PERMISSIONS_INVALID', 'Permisos inválidos')
    }
    const [beforeRows] = await pool.query<any[]>(
      `SELECT p.code
       FROM permissions p
       JOIN collaborator_permissions cp ON cp.permissionId = p.id
       WHERE cp.collaboratorId = ?`,
      [collaboratorId]
    )
    const [permRows] = await pool.query<any[]>(
      `SELECT id FROM permissions WHERE code IN (${permissions.map(() => '?').join(',') || "''"})`,
      permissions
    )
    await pool.query('DELETE FROM collaborator_permissions WHERE collaboratorId = ?', [collaboratorId])
    const values = (permRows || []).map((p: any) => [collaboratorId, p.id])
    if (values.length > 0) {
      await pool.query('INSERT INTO collaborator_permissions (collaboratorId, permissionId) VALUES ?', [values])
    }
    await logAudit(
      'collaborator_permissions',
      Number(collaboratorId),
      'UPDATE',
      { permissions: (beforeRows || []).map((p: any) => p.code) },
      { permissions },
      getAuditMeta(req)
    )
    res.json({ message: 'Overrides actualizados', permissions })
  } catch (error) {
    logger.error('Error updating user overrides:', error)
    return sendApiError(res, 500, 'SECURITY_USER_OVERRIDES_UPDATE_FAILED', 'Error al actualizar permisos')
  }
}

export const resetUserOverrides = async (req: Request, res: Response) => {
  try {
    if (!canManageSecurity(req)) return sendSecurityForbidden(res)
    const { collaboratorId } = req.params
    const [beforeRows] = await pool.query<any[]>(
      `SELECT p.code
       FROM permissions p
       JOIN collaborator_permissions cp ON cp.permissionId = p.id
       WHERE cp.collaboratorId = ?`,
      [collaboratorId]
    )
    await pool.query('DELETE FROM collaborator_permissions WHERE collaboratorId = ?', [collaboratorId])
    await logAudit(
      'collaborator_permissions',
      Number(collaboratorId),
      'UPDATE',
      { permissions: (beforeRows || []).map((p: any) => p.code) },
      { permissions: [] },
      getAuditMeta(req)
    )
    res.json({ message: 'Overrides eliminados' })
  } catch (error) {
    logger.error('Error resetting user overrides:', error)
    return sendApiError(res, 500, 'SECURITY_USER_OVERRIDES_RESET_FAILED', 'Error al limpiar overrides')
  }
}
