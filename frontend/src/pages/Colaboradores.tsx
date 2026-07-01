/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { OrgScope, Collaborator } from '../types'
import CollaboratorForm from '../components/CollaboratorForm'
import { useAuth } from '../hooks/useAuth'
import { useDialog } from '../components/Dialog'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import './Colaboradores.css'

const DELETE_API_ERROR_KEYS: Record<string, string> = {
  COLLABORATOR_DELETE_FORBIDDEN: 'collaborators:dialogs.api_errors.delete_forbidden',
  COLLABORATOR_NOT_FOUND: 'collaborators:dialogs.api_errors.not_found',
}

const DEACTIVATE_API_ERROR_KEYS: Record<string, string> = {
  COLLABORATOR_DEACTIVATE_FORBIDDEN: 'collaborators:dialogs.api_errors.deactivate_forbidden',
  COLLABORATOR_NOT_FOUND: 'collaborators:dialogs.api_errors.not_found',
}

const INVITE_API_ERROR_KEYS: Record<string, string> = {
  COLLABORATOR_RESEND_INVITE_FORBIDDEN: 'collaborators:invite.api_errors.forbidden',
  COLLABORATOR_NOT_FOUND: 'collaborators:invite.api_errors.not_found',
  COLLABORATOR_RESEND_INVITE_EMAIL_MISSING: 'collaborators:invite.api_errors.email_missing',
  COLLABORATOR_RESEND_INVITE_PASSWORD_ALREADY_SET: 'collaborators:invite.api_errors.password_already_set',
}

export default function Colaboradores() {
  const [showForm, setShowForm] = useState(false)
  const [editingCollaborator, setEditingCollaborator] = useState<Collaborator | undefined>(undefined)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCompanyId, setFilterCompanyId] = useState<number | null>(null)
  const [filterAreaId, setFilterAreaId] = useState<number | null>(null)
  const [filterRole, setFilterRole] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [resendingId, setResendingId] = useState<number | null>(null)
  const [inviteAlert, setInviteAlert] = useState<{ id: number; message: string; type: 'success' | 'error' } | null>(null)

  const queryClient = useQueryClient()
  const auth = useAuth()
  const user = auth?.user
  const isAdmin = Boolean(auth?.isAdmin)
  const isDirector = Boolean(auth?.isDirector)
  const isManager = Boolean(auth?.isManager)
  const isLeader = Boolean(auth?.isLeader)
  const dialog = useDialog()
  const { t } = useTranslation(['collaborators', 'common'])

  const { data: orgScopes } = useQuery<OrgScope[]>(
    'org-scopes',
    async () => {
      const response = await api.get('/org-scopes')
      return response.data
    },
    { retry: false }
  )

  const activeScopeId = filterAreaId ?? filterCompanyId

  const companyScopes = Array.isArray(orgScopes)
    ? orgScopes
        .filter((s) => s.type === 'company')
        .sort((a, b) => a.name.localeCompare(b.name))
    : []

  const areaScopes = Array.isArray(orgScopes)
    ? orgScopes
        .filter((s) => {
          if (s.type !== 'area') return false
          if (filterCompanyId) return Number(s.parentId) === filterCompanyId
          return true
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    : []

  // Todos los IDs descendientes del scope activo (para filtrar por jerarquía)
  const activeScopeDescendantIds = (() => {
    if (!activeScopeId || !Array.isArray(orgScopes)) return new Set<number>()
    const result = new Set<number>([activeScopeId])
    const queue = [activeScopeId]
    while (queue.length > 0) {
      const parentId = queue.shift()!
      orgScopes
        .filter((s) => Number(s.parentId) === parentId)
        .forEach((s) => { if (!result.has(s.id)) { result.add(s.id); queue.push(s.id) } })
    }
    return result
  })()

  const { data: collaborators, isLoading, isError } = useQuery<Collaborator[]>(
    ['collaborators', showInactive],
    async () => {
      const response = await api.get('/collaborators', {
        params: { includeInactive: showInactive },
      })
      const data = response.data
      return Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : [])
    },
    {
      retry: 1,
      keepPreviousData: true,
      staleTime: 30 * 1000,
    }
  )

  const deleteMutation = useMutation(
    async (id: number) => {
      await api.delete(`/collaborators/${id}`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('collaborators')
      },
      onError: (error: any) => {
        void dialog.alert(
          resolveApiErrorMessage(error, t, {
            codeMap: DELETE_API_ERROR_KEYS,
            fallbackKey: 'dialogs.delete_error_msg',
          }),
          { title: t('dialogs.delete_error_title'), variant: 'danger' }
        )
      },
    }
  )

  const deactivateMutation = useMutation(
    async ({ id, reason }: { id: number; reason?: string }) => {
      await api.post(`/collaborators/${id}/deactivate`, { reason })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('collaborators')
      },
      onError: (error: any) => {
        void dialog.alert(
          resolveApiErrorMessage(error, t, {
            codeMap: DEACTIVATE_API_ERROR_KEYS,
            fallbackKey: 'dialogs.deactivate_error',
          }),
          { title: t('common:error_title'), variant: 'danger' }
        )
      },
    }
  )

  const handleCreate = () => {
    setEditingCollaborator(undefined)
    setShowForm(true)
  }

  const handleEdit = (collaborator: Collaborator) => {
    setEditingCollaborator(collaborator)
    setShowForm(true)
  }

  const handleDelete = async (id: number, name: string) => {
    const ok = await dialog.confirm(
      t('dialogs.delete_msg', { name }),
      { title: t('dialogs.delete_title'), confirmLabel: t('dialogs.delete_confirm'), variant: 'danger' }
    )
    if (ok) deleteMutation.mutate(id)
  }

  const handleDeactivate = async (id: number, name: string) => {
    const reason = await dialog.prompt(
      t('dialogs.deactivate_msg', { name }),
      { title: t('dialogs.deactivate_title'), placeholder: t('dialogs.deactivate_placeholder'), confirmLabel: t('dialogs.deactivate_confirm'), variant: 'warning' }
    )
    if (reason !== null) deactivateMutation.mutate({ id, reason: reason || undefined })
  }

  const handleResendInvite = async (id: number) => {
    setResendingId(id)
    try {
      await api.post(`/collaborators/${id}/resend-invite`)
      setInviteAlert({ id, message: t('invite.sent'), type: 'success' })
    } catch (error: any) {
      setInviteAlert({
        id,
        message: resolveApiErrorMessage(error, t, {
          codeMap: INVITE_API_ERROR_KEYS,
          fallbackKey: 'invite.error',
        }),
        type: 'error',
      })
    } finally {
      setResendingId(null)
      setTimeout(() => setInviteAlert(null), 4000)
    }
  }

  const managerMap = new Map<number, string>(
    collaborators?.map((c) => [c.id, c.name]) ?? []
  )

  const getManagerName = (managerId?: number): string => {
    if (!managerId) return '-'
    return managerMap.get(managerId) ?? `ID: ${managerId}`
  }

  const getRoleLabel = (role: string) => t(`common:roles.${role}`, { defaultValue: role })

  const filteredCollaborators = collaborators?.filter((collaborator) => {
    const safeName = (collaborator.name || '').toLowerCase()
    const safePosition = (collaborator.position || '').toLowerCase()
    const safeSearch = searchTerm.toLowerCase()
    const matchesSearch =
      !searchTerm || safeName.includes(safeSearch) || safePosition.includes(safeSearch)

    const matchesScope = !activeScopeId || (
      collaborator.orgScopeId != null
        ? activeScopeDescendantIds.has(Number(collaborator.orgScopeId))
        : activeScopeDescendantIds.size === 0
    )
    const matchesRole = !filterRole || collaborator.role === filterRole

    const matchesInactive = showInactive || collaborator.status !== 'inactive'

    return matchesSearch && matchesScope && matchesRole && matchesInactive
  })

  return (
    <div className="colaboradores-page">
      {inviteAlert && (
        <div
          className={`invite-alert invite-alert-${inviteAlert.type}`}
          style={{
            padding: '10px 16px',
            marginBottom: '12px',
            borderRadius: '6px',
            fontWeight: 500,
            background: inviteAlert.type === 'success' ? '#d1fae5' : '#fee2e2',
            color: inviteAlert.type === 'success' ? '#065f46' : '#991b1b',
            border: `1px solid ${inviteAlert.type === 'success' ? '#6ee7b7' : '#fca5a5'}`,
          }}
        >
          {inviteAlert.message}
        </div>
      )}
      <div className="page-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="subtitle">{t('subtitle')}</p>
        </div>
        <div className="header-actions">
          <a className="btn-secondary" href="/configuracion" target="_blank" rel="noreferrer">
            {t('header.manage_areas')}
          </a>
          <button className="btn-primary" onClick={handleCreate}>
            {t('header.add')}
          </button>
        </div>
      </div>

      <div className="filters-section">
        <div className="search-group">
          <label htmlFor="search">{t('filters.search_label')}</label>
          <input
            type="text"
            id="search"
            placeholder={t('filters.search_placeholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-group">
          <label htmlFor="filter-company">Empresa</label>
          <select
            id="filter-company"
            value={filterCompanyId ?? ''}
            onChange={(e) => {
              setFilterCompanyId(e.target.value ? Number(e.target.value) : null)
              setFilterAreaId(null)
            }}
            className="filter-select"
          >
            <option value="">Todas las empresas</option>
            {companyScopes.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="filter-area">{t('filters.area')}</label>
          <select
            id="filter-area"
            value={filterAreaId ?? ''}
            onChange={(e) => setFilterAreaId(e.target.value ? Number(e.target.value) : null)}
            className="filter-select"
            disabled={areaScopes.length === 0}
          >
            <option value="">{t('filters.all_areas')}</option>
            {areaScopes.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="filter-role">{t('filters.role')}</label>
          <select
            id="filter-role"
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            <option value="">{t('filters.all_roles')}</option>
            <option value="admin">{getRoleLabel('admin')}</option>
            <option value="director">{getRoleLabel('director')}</option>
            <option value="manager">{getRoleLabel('manager')}</option>
            <option value="leader">{getRoleLabel('leader')}</option>
            <option value="collaborator">{getRoleLabel('collaborator')}</option>
          </select>
        </div>
        <div className="filter-group checkbox-group">
          <label htmlFor="show-inactive">{t('filters.show_inactive')}</label>
          <input
            id="show-inactive"
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
        </div>
        {(searchTerm || filterCompanyId || filterAreaId || filterRole) && (
          <button
            className="btn-clear-filters"
            onClick={() => {
              setSearchTerm('')
              setFilterCompanyId(null)
              setFilterAreaId(null)
              setFilterRole('')
            }}
          >
            {t('filters.clear')}
          </button>
        )}
      </div>

      <div className="table-container">
        {isLoading ? (
          <div className="loading">{t('loading')}</div>
        ) : isError ? (
          <div className="empty-state">
            <div className="empty-icon">⚠️</div>
            <h3>{t('empty.error_title', { defaultValue: 'Error al cargar colaboradores' })}</h3>
            <p>{t('empty.error_subtitle', { defaultValue: 'No se pudo conectar con el servidor. Recargá la página e intentá de nuevo.' })}</p>
            <button className="btn-primary" onClick={() => window.location.reload()}>
              {t('common:reload', { defaultValue: 'Recargar página' })}
            </button>
          </div>
        ) : filteredCollaborators && filteredCollaborators.length > 0 ? (
          <>
            <div className="results-info">
              {t('results.showing', { shown: filteredCollaborators.length, total: collaborators?.length || 0 })}
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('table.id')}</th>
                  <th>{t('table.name')}</th>
                  <th>{t('table.position')}</th>
                  <th>{t('table.area')}</th>
                  <th>{t('table.status')}</th>
                  <th>{t('table.role')}</th>
                  <th>{t('table.manager')}</th>
                  <th>{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredCollaborators.map((collaborator) => (
                  <tr key={collaborator.id}>
                    <td>{collaborator.id}</td>
                    <td className="name-cell">
                      {collaborator.name}
                      {collaborator.status === 'inactive' && (
                        <span className="status-pill inactive">{t('status.inactive')}</span>
                      )}
                    </td>
                    <td>{collaborator.position}</td>
                    <td>{collaborator.area}</td>
                    <td>
                      <span
                        className={`status-pill ${collaborator.status === 'inactive' ? 'inactive' : 'active'}`}
                      >
                        {t(`status.${collaborator.status}`, { defaultValue: collaborator.status })}
                      </span>
                    </td>
                    <td>
                      <span className={`role-badge role-${collaborator.role}`}>{getRoleLabel(collaborator.role)}</span>
                    </td>
                    <td>{getManagerName(collaborator.managerId)}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-icon"
                          title={t('actions.edit')}
                          onClick={() => handleEdit(collaborator)}
                          disabled={
                            !(isAdmin || isDirector || (user?.area && collaborator.area === user.area && (isManager || isLeader)))
                          }
                        >
                          {t('actions.edit')}
                        </button>
                        {collaborator.status !== 'inactive' && (
                          <button
                            className="btn-icon"
                            title={t('actions.deactivate')}
                            onClick={() => handleDeactivate(collaborator.id, collaborator.name)}
                            disabled={
                              deactivateMutation.isLoading ||
                              !(isAdmin || isDirector || (user?.area && collaborator.area === user.area && (isManager || isLeader)))
                            }
                          >
                            {t('actions.deactivate')}
                          </button>
                        )}
                        <button
                          className="btn-icon"
                          title={t('actions.delete')}
                          onClick={() => handleDelete(collaborator.id, collaborator.name)}
                          disabled={
                            deleteMutation.isLoading ||
                            !(isAdmin || isDirector || (user?.area && collaborator.area === user.area && (isManager || isLeader)))
                          }
                        >
                          {t('actions.delete')}
                        </button>
                        {collaborator.email && (
                          <button
                            className="btn-icon"
                            title={t('actions.resend_invite')}
                            onClick={() => handleResendInvite(collaborator.id)}
                            disabled={resendingId === collaborator.id}
                          >
                            {resendingId === collaborator.id ? t('actions.resending') : t('actions.resend_invite')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : collaborators && collaborators.length > 0 ? (
          <div className="empty-state">
            <div className="empty-icon">:/</div>
            <h3>{t('empty.no_results_title')}</h3>
            <p>{t('empty.no_results_subtitle')}</p>
            <button
              className="btn-primary"
              onClick={() => {
                setSearchTerm('')
                setFilterCompanyId(null)
                setFilterAreaId(null)
                setFilterRole('')
              }}
            >
              {t('filters.clear')}
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">:)</div>
            <h3>{t('empty.no_data_title')}</h3>
            <p>{t('empty.no_data_subtitle')}</p>
            <button className="btn-primary" onClick={handleCreate}>
              {t('empty.no_data_btn')}
            </button>
          </div>
        )}
      </div>

      {/* Áreas se gestionan en Configuración → Org Scopes */}

      {showForm && (
        <CollaboratorForm
          collaborator={editingCollaborator}
          onClose={() => {
            setShowForm(false)
            setEditingCollaborator(undefined)
          }}
          onSuccess={() => {
            setShowForm(false)
            setEditingCollaborator(undefined)
          }}
        />
      )}
    </div>
  )
}
