import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import './Configuracion.css'
import { closeOnOverlayClick, markOverlayPointerDown } from '../utils/modal'

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
  const { t } = useTranslation(['security', 'common'])
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

  const getScopeTypeLabel = (type?: string | null) =>
    type ? t(`security:scope_types.${type}`, { defaultValue: type.replace(/_/g, ' ') }) : '-'

  const getRoleSourceLabel = (source: 'usuario' | 'equipo' | 'legacy' | 'none') =>
    t(`security:role_source.${source}`)

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
        <h1>{t('security:title')}</h1>
        <p className="subtitle">{t('security:subtitle')}</p>
      </header>

      <div className="config-section">
        <div className="card">
          <div className="tabs">
            <button
              className={`tab-button ${activeTab === 'roles' ? 'active' : ''}`}
              onClick={() => setActiveTab('roles')}
            >
              {t('security:tabs.roles')}
            </button>
            <button
              className={`tab-button ${activeTab === 'groups' ? 'active' : ''}`}
              onClick={() => setActiveTab('groups')}
            >
              {t('security:tabs.groups')}
            </button>
            <button
              className={`tab-button ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              {t('security:tabs.users')}
            </button>
            <button
              className={`tab-button ${activeTab === 'audit' ? 'active' : ''}`}
              onClick={() => setActiveTab('audit')}
            >
              {t('security:tabs.audit')}
            </button>
          </div>

          {activeTab === 'roles' && (
            <>
              <div className="card-header">
                <div>
                  <h3>{t('security:roles.title')}</h3>
                  <p className="muted">{t('security:roles.subtitle')}</p>
                </div>
                <button
                  className="btn-primary"
                  onClick={() => {
                    setEditingRole(null)
                    setRoleForm({ code: '', name: '', description: '', permissions: [] })
                    setShowRoleModal(true)
                  }}
                >
                  {t('security:roles.new')}
                </button>
              </div>
              <div className="roles-grid">
                {roles?.map((role) => (
                  <div key={role.id} className="role-card">
                    <div className="role-card-header">
                      <span className="role-name">{role.name}</span>
                      <span className="role-count">{t('security:roles.users_count', { count: role.usersCount || 0 })}</span>
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
                        {t('common:edit')}
                      </button>
                      <button className="btn-secondary" onClick={() => cloneRole.mutate(role)}>
                        {t('security:roles.duplicate')}
                      </button>
                      <button
                        className="btn-danger"
                        disabled={!role.editable}
                        onClick={() => {
                          if (role.editable) deleteRole.mutate(role)
                        }}
                      >
                        {t('common:delete')}
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
                  <h3>{t('security:groups.title')}</h3>
                  <p className="muted">{t('security:groups.subtitle')}</p>
                </div>
              </div>
              <table className="config-table">
                <thead>
                  <tr>
                    <th>{t('security:groups.scope')}</th>
                    <th>{t('security:groups.type')}</th>
                    <th>{t('security:groups.default_role')}</th>
                  </tr>
                </thead>
                <tbody>
                  {scopeRoles?.map((scope) => (
                    <tr key={scope.scopeId}>
                      <td>{scope.name}</td>
                      <td>{getScopeTypeLabel(scope.type)}</td>
                      <td>
                        <select
                          value={scope.roleId ? String(scope.roleId) : ''}
                          onChange={(e) => {
                            assignScopeRole.mutate({ scopeId: scope.scopeId, roleId: e.target.value })
                          }}
                        >
                          <option value="">{t('security:groups.no_role')}</option>
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
                         {t('security:groups.empty')}
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
                  <h3>{t('security:users.title')}</h3>
                  <p className="muted">{t('security:users.subtitle')}</p>
                </div>
              </div>
              <table className="config-table">
                <thead>
                  <tr>
                    <th>{t('security:users.user')}</th>
                    <th>{t('security:users.effective_role')}</th>
                    <th>{t('security:users.overrides')}</th>
                    <th>{t('common:actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {userRoles?.map((user) => {
                    const effectiveRole = user.userRoleName || user.scopeRoleName || (user.legacyRole ? t(`common:roles.${user.legacyRole}`, { defaultValue: user.legacyRole }) : t('security:users.no_role'))
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
                          <span className="muted"> · {getRoleSourceLabel(roleSource)}</span>
                          {!!user.overridesCount && user.overridesCount > 0 && (
                            <span className="status-pill review" style={{ marginLeft: 8 }}>
                              {t('security:users.active_overrides')}
                            </span>
                          )}
                        </td>
                        <td>{user.overridesCount ? t('security:users.permissions_count', { count: user.overridesCount }) : '-'}</td>
                        <td>
                          <div className="action-buttons">
                            <select
                              value={user.userRoleId ? String(user.userRoleId) : ''}
                              onChange={(e) => {
                                assignUserRole.mutate({ collaboratorId: user.id, roleId: e.target.value })
                              }}
                            >
                              <option value="">{t('security:users.team_role')}</option>
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
                              {t('security:users.permissions')}
                            </button>
                            <button
                              className="btn-secondary"
                              onClick={() => resetUserOverrides.mutate(user.id)}
                            >
                              {t('security:users.reset')}
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
              {t('security:audit_hint')}
            </div>
          )}
        </div>
      </div>

      {showRoleModal && (
        <div
          className="modal-overlay"
          onPointerDown={markOverlayPointerDown}
          onClick={(e) => closeOnOverlayClick(e, () => setShowRoleModal(false))}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingRole ? t('security:role_modal.edit_title') : t('security:role_modal.new_title')}</h2>
              <button className="close-button" onClick={() => setShowRoleModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>{t('security:role_modal.code')}</label>
                  <input
                    value={roleForm.code}
                    onChange={(e) => setRoleForm((prev) => ({ ...prev, code: e.target.value }))}
                    disabled={!!editingRole}
                  />
                </div>
                <div className="form-group">
                  <label>{t('common:name')}</label>
                  <input
                    value={roleForm.name}
                    onChange={(e) => setRoleForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>{t('common:description')}</label>
                <input
                  value={roleForm.description}
                  onChange={(e) => setRoleForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>{t('security:role_modal.permissions')}</label>
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
                      {t('security:empty_permissions')}
                    </div>
                  )}
                </div>
              </div>
              <div className="actions">
                <button
                  className="btn-primary"
                  onClick={() => (editingRole ? updateRole.mutate() : createRole.mutate())}
                >
                  {t('security:role_modal.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showOverrideModal && overrideUser && (
        <div
          className="modal-overlay"
          onPointerDown={markOverlayPointerDown}
          onClick={(e) => closeOnOverlayClick(e, () => setShowOverrideModal(false))}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('security:override_modal.title', { name: overrideUser.name })}</h2>
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
                    {t('security:empty_permissions')}
                  </div>
                )}
              </div>
              <div className="actions">
                <button className="btn-primary" onClick={() => updateUserOverrides.mutate()}>
                  {t('security:override_modal.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
