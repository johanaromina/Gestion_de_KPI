import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import api from '../services/api'
import { Collaborator } from '../types'
import CollaboratorForm from '../components/CollaboratorForm'
import { useAuth } from '../hooks/useAuth'
import './Colaboradores.css'

export default function Colaboradores() {
  const [showForm, setShowForm] = useState(false)
  const [editingCollaborator, setEditingCollaborator] = useState<Collaborator | undefined>(undefined)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterArea, setFilterArea] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const queryClient = useQueryClient()
  const { user, isAdmin, isDirector, isManager, isLeader } = useAuth()

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
        alert(
          error.response?.data?.error ||
            'Error al eliminar colaborador. Verifica que no tenga asignaciones asociadas.'
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
        alert(error.response?.data?.error || 'Error al desactivar colaborador')
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
    if (
      window.confirm(
        `¿Estás seguro de eliminar al colaborador "${name}"? Esta acción no se puede deshacer y eliminará todas sus asignaciones asociadas.`
      )
    ) {
      deleteMutation.mutate(id)
    }
  }

  const handleDeactivate = async (id: number, name: string) => {
    const reason = window.prompt(
      `Desactivar a "${name}". Opcional: indica un motivo (desvinculacion, cambio de rol, licencia).`
    )
    deactivateMutation.mutate({ id, reason: reason || undefined })
  }

  const getManagerName = (managerId?: number): string => {
    if (!managerId) return '-'
    const manager = collaborators?.find((c) => c.id === managerId)
    return manager ? manager.name : `ID: ${managerId}`
  }

  const areas = Array.from(new Set(collaborators?.map((c) => c.area).filter(Boolean) || [])).sort()

  const filteredCollaborators = collaborators?.filter((collaborator) => {
    const matchesSearch =
      !searchTerm ||
      collaborator.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      collaborator.position.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesArea = !filterArea || collaborator.area === filterArea
    const matchesRole = !filterRole || collaborator.role === filterRole

    return matchesSearch && matchesArea && matchesRole
  })

  return (
    <div className="colaboradores-page">
      <div className="page-header">
        <div>
          <h1>Colaboradores</h1>
          <p className="subtitle">Gestiona los colaboradores del sistema</p>
        </div>
        <button className="btn-primary" onClick={handleCreate}>
          + Agregar Colaborador
        </button>
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
            {areas.map((area) => (
              <option key={area} value={area}>
                {area}
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
