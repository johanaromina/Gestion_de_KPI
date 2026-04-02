import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import api from '../services/api'
import './Configuracion.css'

type Permission = { id: number; code: string; description?: string }
type Role = {
  id: number
  code: string
  name: string
  description?: string
  editable?: number
  permissions?: string[]
  usersCount?: number
}

type ScopeRole = {
  scopeId: number
  name: string
  type: string
  parentId?: number | null
  active?: number
  roleId?: number | null
  roleCode?: string | null
  roleName?: string | null
}

type UserRoleRow = {
  id: number
  name: string
  email?: string
  legacyRole?: string
  orgScopeId?: number | null
  userRoleId?: number | null
  userRoleName?: string | null
  userRoleCode?: string | null
  scopeRoleId?: number | null
  scopeRoleName?: string | null
  scopeRoleCode?: string | null
  overridesCount?: number
}

export default function Seguridad() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'roles' | 'groups' | 'users' | 'audit'>('roles')
  const [showRoleModal, setShowRoleModal] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [roleForm, setRoleForm] = useState({
    code: '',
    name: '',
    description: '',
    permissions: [] as string[],
  })
  const [showOverrideModal, setShowOverrideModal] = useState(false)
  const [overrideUser, setOverrideUser] = useState<UserRoleRow | null>(null)
  const [overridePermissions, setOverridePermissions] = useState<string[]>([])

  const { data: permissions } = useQuery<Permission[]>('security-permissions', async () => {
    const res = await api.get('/config/permissions')
    return res.data
  })

  const { data: roles } = useQuery<Role[]>('security-roles', async () => {
    const res = await api.get('/security/roles')
    return res.data
  })

  const { data: scopeRoles } = useQuery<ScopeRole[]>('security-scope-roles', async () => {
    const res = await api.get('/security/scope-roles')
    return res.data
  })

  const { data: userRoles } = useQuery<UserRoleRow[]>('security-user-roles', async () => {
    const res = await api.get('/security/user-roles')
    return res.data
  })

  const createRole = useMutation(
    async () => {
      await api.post('/security/roles', roleForm)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('security-roles')
        setShowRoleModal(false)
      },
    }
  )

  const updateRole = useMutation(
    async () => {
      if (!editingRole) return
      await api.put(`/security/roles/${editingRole.id}`, {
        name: roleForm.name,
        description: roleForm.description,
        permissions: roleForm.permissions,
      })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('security-roles')
        setShowRoleModal(false)
      },
    }
  )

  const cloneRole = useMutation(
    async (role: Role) => {
      const code = `${role.code}_copy`
      const name = `${role.name} (copia)`
      await api.post(`/security/roles/${role.id}/clone`, { code, name })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('security-roles')
      },
    }
  )

  const deleteRole = useMutation(
    async (role: Role) => {
      await api.delete(`/security/roles/${role.id}`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('security-roles')
      },
    }
  )

  const assignScopeRole = useMutation(
    async ({ scopeId, roleId }: { scopeId: number; roleId: string }) => {
      await api.put(`/security/scope-roles/${scopeId}`, {
        roleId: roleId ? Number(roleId) : null,
      })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('security-scope-roles')
      },
    }
  )

  const assignUserRole = useMutation(
    async ({ collaboratorId, roleId }: { collaboratorId: number; roleId: string }) => {
      await api.put(`/security/user-roles/${collaboratorId}`, {
        roleId: roleId ? Number(roleId) : null,
      })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('security-user-roles')
      },
    }
  )

  const fetchUserOverrides = async (collaboratorId: number) => {
    const res = await api.get(`/security/users/${collaboratorId}/permissions`)
    return res.data?.permissions || []
  }

  const updateUserOverrides = useMutation(
    async () => {
      if (!overrideUser) return
      await api.put(`/security/users/${overrideUser.id}/permissions`, {
        permissions: overridePermissions,
      })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('security-user-roles')
        setShowOverrideModal(false)
      },
    }
  )

  const resetUserOverrides = useMutation(
    async (collaboratorId: number) => {
      await api.delete(`/security/users/${collaboratorId}/permissions`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('security-user-roles')
      },
    }
  )

  return (
    <div className="config-page">
      <header className="page-header">
        <h1>Seguridad</h1>
        <p className="subtitle">Gestiona roles, permisos por equipo y excepciones por usuario.</p>
      </header>

      <div className="config-section">
        <div className="card">
          <div className="tabs">
            <button
              className={`tab-button ${activeTab === 'roles' ? 'active' : ''}`}
              onClick={() => setActiveTab('roles')}
            >
              Roles
            </button>
            <button
              className={`tab-button ${activeTab === 'groups' ? 'active' : ''}`}
              onClick={() => setActiveTab('groups')}
            >
              Permisos por equipo
            </button>
            <button
              className={`tab-button ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              Excepciones por usuario
            </button>
            <button
              className={`tab-button ${activeTab === 'audit' ? 'active' : ''}`}
              onClick={() => setActiveTab('audit')}
            >
              Auditoría
            </button>
          </div>

          {activeTab === 'roles' && (
            <>
              <div className="card-header">
                <div>
                  <h3>Roles base</h3>
                  <p className="muted">Crea, clona y ajusta roles sin tocar código.</p>
                </div>
                <button
                  className="btn-primary"
                  onClick={() => {
                    setEditingRole(null)
                    setRoleForm({ code: '', name: '', description: '', permissions: [] })
                    setShowRoleModal(true)
                  }}
                >
                  Nuevo rol
                </button>
              </div>
              <div className="roles-grid">
                {roles?.map((role) => (
                  <div key={role.id} className="role-card">
                    <div className="role-card-header">
                      <span className="role-name">{role.name}</span>
                      <span className="role-count">{role.usersCount || 0} usuarios</span>
                    </div>
                    <div className="role-sub">{role.code}</div>
                    <div className="role-perms">
                      {(role.permissions || []).map((perm) => (
                        <span key={perm} className="perm-chip">
                          {perm}
                        </span>
                      ))}
                    </div>
                    <div className="action-buttons">
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          setEditingRole(role)
                          setRoleForm({
                            code: role.code,
                            name: role.name,
                            description: role.description || '',
                            permissions: role.permissions || [],
                          })
                          setShowRoleModal(true)
                        }}
                      >
                        Editar
                      </button>
                      <button className="btn-secondary" onClick={() => cloneRole.mutate(role)}>
                        Duplicar
                      </button>
                      <button
                        className="btn-danger"
                        disabled={!role.editable}
                        onClick={() => {
                          if (role.editable) deleteRole.mutate(role)
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === 'groups' && (
            <>
              <div className="card-header">
                <div>
                  <h3>Permisos por equipo</h3>
                  <p className="muted">Define el rol por defecto de cada scope.</p>
                </div>
              </div>
              <table className="config-table">
                <thead>
                  <tr>
                    <th>Scope</th>
                    <th>Tipo</th>
                    <th>Rol por defecto</th>
                  </tr>
                </thead>
                <tbody>
                  {scopeRoles?.map((scope) => (
                    <tr key={scope.scopeId}>
                      <td>{scope.name}</td>
                      <td>{scope.type}</td>
                      <td>
                        <select
                          value={scope.roleId ? String(scope.roleId) : ''}
                          onChange={(e) => {
                            assignScopeRole.mutate({ scopeId: scope.scopeId, roleId: e.target.value })
                          }}
                        >
                          <option value="">Sin rol</option>
                          {roles?.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                  {(!scopeRoles || scopeRoles.length === 0) && (
                    <tr>
                      <td colSpan={3} className="empty-row">
                        No hay scopes configurados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}

          {activeTab === 'users' && (
            <>
              <div className="card-header">
                <div>
                  <h3>Excepciones por usuario</h3>
                  <p className="muted">El rol del equipo aplica por defecto. Acá definís overrides.</p>
                </div>
              </div>
              <table className="config-table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Rol efectivo</th>
                    <th>Overrides</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {userRoles?.map((user) => {
                    const effectiveRole =
                      user.userRoleName || user.scopeRoleName || user.legacyRole || 'Sin rol'
                    const roleSource = user.userRoleName
                      ? 'usuario'
                      : user.scopeRoleName
                      ? 'equipo'
                      : user.legacyRole
                      ? 'legacy'
                      : 'none'
                    return (
                      <tr key={user.id}>
                        <td>
                          <div className="item-title">{user.name}</div>
                          <div className="item-sub">{user.email || ''}</div>
                        </td>
                        <td>
                          {effectiveRole}
                          <span className="muted"> · {roleSource}</span>
                          {!!user.overridesCount && user.overridesCount > 0 && (
                            <span className="status-pill review" style={{ marginLeft: 8 }}>
                              Overrides activos
                            </span>
                          )}
                        </td>
                        <td>{user.overridesCount ? `${user.overridesCount} permisos` : '-'}</td>
                        <td>
                          <div className="action-buttons">
                            <select
                              value={user.userRoleId ? String(user.userRoleId) : ''}
                              onChange={(e) => {
                                assignUserRole.mutate({ collaboratorId: user.id, roleId: e.target.value })
                              }}
                            >
                              <option value="">Rol del equipo</option>
                              {roles?.map((role) => (
                                <option key={role.id} value={role.id}>
                                  {role.name}
                                </option>
                              ))}
                            </select>
                            <button
                              className="btn-secondary"
                              onClick={async () => {
                                setOverrideUser(user)
                                const perms = await fetchUserOverrides(user.id)
                                setOverridePermissions(perms)
                                setShowOverrideModal(true)
                              }}
                            >
                              Permisos
                            </button>
                            <button
                              className="btn-secondary"
                              onClick={() => resetUserOverrides.mutate(user.id)}
                            >
                              Resetear
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}

          {activeTab === 'audit' && (
            <div className="muted">
              Usa la pantalla de Auditoría para ver cambios de roles y permisos.
            </div>
          )}
        </div>
      </div>

      {showRoleModal && (
        <div className="modal-overlay" onClick={() => setShowRoleModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingRole ? 'Editar rol' : 'Nuevo rol'}</h2>
              <button className="close-button" onClick={() => setShowRoleModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Código</label>
                  <input
                    value={roleForm.code}
                    onChange={(e) => setRoleForm((prev) => ({ ...prev, code: e.target.value }))}
                    disabled={!!editingRole}
                  />
                </div>
                <div className="form-group">
                  <label>Nombre</label>
                  <input
                    value={roleForm.name}
                    onChange={(e) => setRoleForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Descripción</label>
                <input
                  value={roleForm.description}
                  onChange={(e) => setRoleForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Permisos</label>
                <div className="perms-list">
                  {permissions && permissions.length > 0 ? (
                    permissions.map((perm) => (
                      <label key={perm.code} className="perm-item">
                        <input
                          type="checkbox"
                          checked={roleForm.permissions.includes(perm.code)}
                          onChange={(e) => {
                            const checked = e.target.checked
                            setRoleForm((prev) => ({
                              ...prev,
                              permissions: checked
                                ? [...prev.permissions, perm.code]
                                : prev.permissions.filter((p) => p !== perm.code),
                            }))
                          }}
                        />
                        <div>
                          <div className="perm-code">{perm.code}</div>
                          <div className="perm-desc">{perm.description || ''}</div>
                        </div>
                      </label>
                    ))
                  ) : (
                    <div className="empty-hint">
                      No hay permisos configurados. Inicializa los permisos en el backend y recarga.
                    </div>
                  )}
                </div>
              </div>
              <div className="actions">
                <button
                  className="btn-primary"
                  onClick={() => (editingRole ? updateRole.mutate() : createRole.mutate())}
                >
                  Guardar rol
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showOverrideModal && overrideUser && (
        <div className="modal-overlay" onClick={() => setShowOverrideModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Permisos personalizados · {overrideUser.name}</h2>
              <button className="close-button" onClick={() => setShowOverrideModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="perms-list">
                {permissions && permissions.length > 0 ? (
                  permissions.map((perm) => (
                    <label key={perm.code} className="perm-item">
                      <input
                        type="checkbox"
                        checked={overridePermissions.includes(perm.code)}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setOverridePermissions((prev) =>
                            checked ? [...prev, perm.code] : prev.filter((p) => p !== perm.code)
                          )
                        }}
                      />
                      <div>
                        <div className="perm-code">{perm.code}</div>
                        <div className="perm-desc">{perm.description || ''}</div>
                      </div>
                    </label>
                  ))
                ) : (
                  <div className="empty-hint">
                    No hay permisos configurados. Inicializa los permisos en el backend y recarga.
                  </div>
                )}
              </div>
              <div className="actions">
                <button className="btn-primary" onClick={() => updateUserOverrides.mutate()}>
                  Guardar permisos
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
