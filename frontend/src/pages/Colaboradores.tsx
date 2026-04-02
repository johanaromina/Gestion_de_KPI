/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import api from '../services/api'
import { OrgScope, Collaborator } from '../types'
import CollaboratorForm from '../components/CollaboratorForm'
import { useAuth } from '../hooks/useAuth'
import { useDialog } from '../components/Dialog'
import './Colaboradores.css'

export default function Colaboradores() {
  const [showForm, setShowForm] = useState(false)
  const [editingCollaborator, setEditingCollaborator] = useState<Collaborator | undefined>(undefined)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterArea, setFilterArea] = useState('')
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
  const { data: orgScopes } = useQuery<OrgScope[]>(
    'org-scopes',
    async () => {
      const response = await api.get('/org-scopes')
      return response.data
    },
    { retry: false }
  )

  const areaScopes = Array.isArray(orgScopes)
    ? orgScopes.filter((scope) => scope.type === 'area')
    : []

  const { data: collaborators, isLoading } = useQuery<Collaborator[]>(
    ['collaborators', showInactive],
    async () => {
      const response = await api.get('/collaborators', {
        params: { includeInactive: showInactive },
      })
      return response.data
    },
    {
      retry: false,
      keepPreviousData: true,
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
          error.response?.data?.error ||
            'Error al eliminar colaborador. Verifica que no tenga asignaciones asociadas.',
          { title: 'Error al eliminar', variant: 'danger' }
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
        void dialog.alert(error.response?.data?.error || 'Error al desactivar colaborador', { title: 'Error', variant: 'danger' })
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
      `¿Estás seguro de eliminar al colaborador "${name}"? Esta acción no se puede deshacer y eliminará todas sus asignaciones asociadas.`,
      { title: 'Eliminar colaborador', confirmLabel: 'Eliminar', variant: 'danger' }
    )
    if (ok) deleteMutation.mutate(id)
  }

  const handleDeactivate = async (id: number, name: string) => {
    const reason = await dialog.prompt(
      `Desactivar a "${name}". Opcional: indicá un motivo (desvinculación, cambio de rol, licencia).`,
      { title: 'Desactivar colaborador', placeholder: 'Ej: desvinculación voluntaria', confirmLabel: 'Desactivar', variant: 'warning' }
    )
    if (reason !== null) deactivateMutation.mutate({ id, reason: reason || undefined })
  }

  const handleResendInvite = async (id: number) => {
    setResendingId(id)
    try {
      await api.post(`/collaborators/${id}/resend-invite`)
      setInviteAlert({ id, message: 'Invitación reenviada correctamente', type: 'success' })
    } catch (error: any) {
      setInviteAlert({
        id,
        message: error.response?.data?.error || 'Error al reenviar invitación',
        type: 'error',
      })
    } finally {
      setResendingId(null)
      setTimeout(() => setInviteAlert(null), 4000)
    }
  }

  const getManagerName = (managerId?: number): string => {
    if (!managerId) return '-'
    const manager = collaborators?.find((c) => c.id === managerId)
    return manager ? manager.name : `ID: ${managerId}`
  }

  const filteredCollaborators = collaborators?.filter((collaborator) => {
    const safeName = (collaborator.name || '').toLowerCase()
    const safePosition = (collaborator.position || '').toLowerCase()
    const safeSearch = searchTerm.toLowerCase()
    const matchesSearch =
      !searchTerm || safeName.includes(safeSearch) || safePosition.includes(safeSearch)

    const matchesArea = !filterArea || collaborator.area === filterArea
    const matchesRole = !filterRole || collaborator.role === filterRole

    return matchesSearch && matchesArea && matchesRole
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
          <h1>Colaboradores</h1>
          <p className="subtitle">Gestiona los colaboradores del sistema</p>
        </div>
        <div className="header-actions">
          <a className="btn-secondary" href="/configuracion" target="_blank" rel="noreferrer">
            Gestionar Áreas
          </a>
          <button className="btn-primary" onClick={handleCreate}>
            + Agregar Colaborador
          </button>
        </div>
      </div>

      <div className="filters-section">
        <div className="search-group">
          <label htmlFor="search">Buscar:</label>
          <input
            type="text"
            id="search"
            placeholder="Buscar por nombre o cargo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-group">
          <label htmlFor="filter-area">Area:</label>
          <select
            id="filter-area"
            value={filterArea}
            onChange={(e) => setFilterArea(e.target.value)}
          >
            <option value="">Todas las areas</option>
            {areaScopes.map((area) => (
              <option key={area.id} value={area.name}>
                {area.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="filter-role">Rol:</label>
          <select
            id="filter-role"
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            <option value="">Todos los roles</option>
            <option value="admin">Admin</option>
            <option value="director">Director</option>
            <option value="manager">Manager</option>
            <option value="leader">Leader</option>
            <option value="collaborator">Collaborator</option>
          </select>
        </div>
        <div className="filter-group checkbox-group">
          <label htmlFor="show-inactive">Mostrar inactivos</label>
          <input
            id="show-inactive"
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
        </div>
        {(searchTerm || filterArea || filterRole) && (
          <button
            className="btn-clear-filters"
            onClick={() => {
              setSearchTerm('')
              setFilterArea('')
              setFilterRole('')
            }}
          >
            Limpiar Filtros
          </button>
        )}
      </div>

      <div className="table-container">
        {isLoading ? (
          <div className="loading">Cargando colaboradores...</div>
        ) : filteredCollaborators && filteredCollaborators.length > 0 ? (
          <>
            <div className="results-info">
              Mostrando {filteredCollaborators.length} de {collaborators?.length || 0} colaboradores
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nombre</th>
                  <th>Cargo</th>
                  <th>Area</th>
                  <th>Estado</th>
                  <th>Rol</th>
                  <th>Manager</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredCollaborators.map((collaborator) => (
                  <tr key={collaborator.id}>
                    <td>{collaborator.id}</td>
                    <td className="name-cell">
                      {collaborator.name}
                      {collaborator.status === 'inactive' && (
                        <span className="status-pill inactive">Inactivo</span>
                      )}
                    </td>
                    <td>{collaborator.position}</td>
                    <td>{collaborator.area}</td>
                    <td>
                      <span
                        className={`status-pill ${collaborator.status === 'inactive' ? 'inactive' : 'active'}`}
                      >
                        {collaborator.status === 'inactive' ? 'Inactivo' : 'Activo'}
                      </span>
                    </td>
                    <td>
                      <span className={`role-badge role-${collaborator.role}`}>{collaborator.role}</span>
                    </td>
                    <td>{getManagerName(collaborator.managerId)}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-icon"
                          title="Editar"
                          onClick={() => handleEdit(collaborator)}
                          disabled={
                            !(isAdmin || isDirector || (user?.area && collaborator.area === user.area && (isManager || isLeader)))
                          }
                        >
                          Editar
                        </button>
                        {collaborator.status !== 'inactive' && (
                          <button
                            className="btn-icon"
                            title="Desactivar"
                            onClick={() => handleDeactivate(collaborator.id, collaborator.name)}
                            disabled={
                              deactivateMutation.isLoading ||
                              !(isAdmin || isDirector || (user?.area && collaborator.area === user.area && (isManager || isLeader)))
                            }
                          >
                            Desactivar
                          </button>
                        )}
                        <button
                          className="btn-icon"
                          title="Eliminar"
                          onClick={() => handleDelete(collaborator.id, collaborator.name)}
                          disabled={
                            deleteMutation.isLoading ||
                            !(isAdmin || isDirector || (user?.area && collaborator.area === user.area && (isManager || isLeader)))
                          }
                        >
                          Eliminar
                        </button>
                        {collaborator.email && (
                          <button
                            className="btn-icon"
                            title="Reenviar invitación"
                            onClick={() => handleResendInvite(collaborator.id)}
                            disabled={resendingId === collaborator.id}
                          >
                            {resendingId === collaborator.id ? 'Enviando...' : 'Reenviar invitación'}
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
            <h3>No se encontraron colaboradores</h3>
            <p>Intenta ajustar los filtros de busqueda</p>
            <button
              className="btn-primary"
              onClick={() => {
                setSearchTerm('')
                setFilterArea('')
                setFilterRole('')
              }}
            >
              Limpiar Filtros
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">:)</div>
            <h3>No hay colaboradores registrados</h3>
            <p>Comienza agregando tu primer colaborador al sistema</p>
            <button className="btn-primary" onClick={handleCreate}>
              Agregar Colaborador
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
