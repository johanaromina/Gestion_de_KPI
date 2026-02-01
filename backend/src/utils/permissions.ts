import { pool } from '../config/database'

export const getEffectivePermissions = async (collaboratorId: number): Promise<string[]> => {
  const [overrideRows] = await pool.query<any[]>(
    `SELECT p.code
     FROM permissions p
     JOIN collaborator_permissions cp ON cp.permissionId = p.id
     WHERE cp.collaboratorId = ?`,
    [collaboratorId]
  )
  const overridePerms = Array.isArray(overrideRows) ? overrideRows.map((row) => row.code) : []
  if (overridePerms.length > 0) {
    return overridePerms
  }

  const [roleRows] = await pool.query<any[]>(
    `SELECT r.id
     FROM collaborator_roles cr
     JOIN roles r ON r.id = cr.roleId
     WHERE cr.collaboratorId = ? LIMIT 1`,
    [collaboratorId]
  )
  if (Array.isArray(roleRows) && roleRows.length > 0) {
    return getRolePermissions(roleRows[0].id)
  }

  const [scopeRows] = await pool.query<any[]>(
    `SELECT sr.roleId
     FROM collaborators c
     JOIN org_scope_roles sr ON sr.orgScopeId = c.orgScopeId
     WHERE c.id = ? LIMIT 1`,
    [collaboratorId]
  )
  if (Array.isArray(scopeRows) && scopeRows.length > 0) {
    return getRolePermissions(scopeRows[0].roleId)
  }

  const [legacyRoleRows] = await pool.query<any[]>(
    `SELECT r.id
     FROM collaborators c
     JOIN roles r ON r.code = c.role
     WHERE c.id = ? LIMIT 1`,
    [collaboratorId]
  )
  if (Array.isArray(legacyRoleRows) && legacyRoleRows.length > 0) {
    return getRolePermissions(legacyRoleRows[0].id)
  }

  return []
}

const getRolePermissions = async (roleId: number): Promise<string[]> => {
  const [rows] = await pool.query<any[]>(
    `SELECT p.code
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permissionId
     WHERE rp.roleId = ?`,
    [roleId]
  )
  return Array.isArray(rows) ? rows.map((row) => row.code) : []
}
