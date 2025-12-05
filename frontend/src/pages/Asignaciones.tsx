import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import api from '../services/api'
import { CollaboratorKPI } from '../types'
import CollaboratorKPIForm from '../components/CollaboratorKPIForm'
import CloseParrillaModal from '../components/CloseParrillaModal'
import './Asignaciones.css'

export default function Asignaciones() {
  const [showForm, setShowForm] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<
    CollaboratorKPI | undefined
  >(undefined)
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState<
    number | null
  >(null)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [closingCollaboratorId, setClosingCollaboratorId] = useState<
    number | null
  >(null)

  const queryClient = useQueryClient()

  // Obtener períodos
  const { data: periods } = useQuery('periods', async () => {
    const response = await api.get('/periods')
    return response.data
  })

  // Obtener colaboradores
  const { data: collaborators } = useQuery('collaborators', async () => {
    const response = await api.get('/collaborators')
    return response.data
  })

  // Obtener asignaciones
  const { data: assignments, isLoading } = useQuery<CollaboratorKPI[]>(
    ['collaborator-kpis', selectedPeriodId, selectedCollaboratorId],
    async () => {
      let url = '/collaborator-kpis'
      if (selectedPeriodId) {
        url = `/collaborator-kpis/period/${selectedPeriodId}`
      } else if (selectedCollaboratorId) {
        url = `/collaborator-kpis/collaborator/${selectedCollaboratorId}`
      }
      const response = await api.get(url)
      return response.data
    },
    {
      enabled: true,
    }
  )

  const deleteMutation = useMutation(
    async (id: number) => {
      await api.delete(`/collaborator-kpis/${id}`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('collaborator-kpis')
      },
    }
  )

  const handleCreate = () => {
    if (!selectedPeriodId) {
      alert('Por favor selecciona un período primero')
      return
    }

    // Verificar si el período está cerrado
    const selectedPeriod = periods?.find((p: any) => p.id === selectedPeriodId)
    if (selectedPeriod?.status === 'closed') {
      alert('No se pueden crear asignaciones en períodos cerrados')
      return
    }

    setEditingAssignment(undefined)
    setShowForm(true)
  }

  const handleEdit = (assignment: CollaboratorKPI) => {
    // Verificar si el período está cerrado
    const period = periods?.find((p: any) => p.id === assignment.periodId)
    if (period?.status === 'closed') {
      alert(
        'Este período está cerrado. Solo se puede editar el valor actual (alcance) con permisos especiales.'
      )
      // Aún permitir abrir el formulario, pero los campos estarán deshabilitados
    }
    setEditingAssignment(assignment)
    setShowForm(true)
  }

  const handleDelete = async (id: number) => {
    if (
      window.confirm(
        '¿Estás seguro de eliminar esta asignación? Esta acción no se puede deshacer.'
      )
    ) {
      deleteMutation.mutate(id)
    }
  }

  const handleCloseParrilla = () => {
    if (!selectedPeriodId) {
      alert('Por favor selecciona un período primero')
      return
    }
    setClosingCollaboratorId(selectedCollaboratorId)
    setShowCloseModal(true)
  }

  const isAssignmentClosed = (assignment: CollaboratorKPI): boolean => {
    return assignment.status === 'closed' || (assignment as any).periodStatus === 'closed'
  }

  const canEditAssignment = (assignment: CollaboratorKPI): boolean => {
    return !isAssignmentClosed(assignment)
  }

  const getStatusBadge = (status: CollaboratorKPI['status']) => {
    const statusConfig = {
      draft: { label: 'Borrador', class: 'status-draft' },
      proposed: { label: 'Propuesto', class: 'status-proposed' },
      approved: { label: 'Aprobado', class: 'status-approved' },
      closed: { label: 'Cerrado', class: 'status-closed' },
    }
    const config = statusConfig[status]
    return (
      <span className={`status-badge ${config.class}`}>{config.label}</span>
    )
  }

  // Calcular suma de ponderaciones por colaborador y período
  const getTotalWeightByCollaborator = (
    collaboratorId: number,
    periodId: number
  ): number => {
    if (!assignments) return 0
    return assignments
      .filter(
        (a) =>
          a.collaboratorId === collaboratorId && a.periodId === periodId
      )
      .reduce((sum, a) => sum + a.weight, 0)
  }

  return (
    <div className="asignaciones-page">
      <div className="page-header">
        <div>
          <h1>Asignaciones de KPIs</h1>
          <p className="subtitle">
            Gestiona las asignaciones de KPIs a colaboradores
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={handleCloseParrilla}>
            🔒 Cerrar Parrilla
          </button>
          <button className="btn-primary" onClick={handleCreate}>
            ➕ Nueva Asignación
          </button>
        </div>
      </div>

      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="period-filter">Filtrar por Período:</label>
          <select
            id="period-filter"
            value={selectedPeriodId || ''}
            onChange={(e) =>
              setSelectedPeriodId(
                e.target.value ? parseInt(e.target.value) : null
              )
            }
            className="filter-select"
          >
            <option value="">Todos los períodos</option>
            {periods?.map((period: any) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="collaborator-filter">Filtrar por Colaborador:</label>
          <select
            id="collaborator-filter"
            value={selectedCollaboratorId || ''}
            onChange={(e) =>
              setSelectedCollaboratorId(
                e.target.value ? parseInt(e.target.value) : null
              )
            }
            className="filter-select"
          >
            <option value="">Todos los colaboradores</option>
            {collaborators?.map((collaborator: any) => (
              <option key={collaborator.id} value={collaborator.id}>
                {collaborator.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-container">
        {isLoading ? (
          <div className="loading">Cargando asignaciones...</div>
        ) : assignments && assignments.length > 0 ? (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Colaborador</th>
                  <th>KPI</th>
                  <th>Período</th>
                  <th>Target</th>
                  <th>Actual</th>
                  <th>Peso</th>
                  <th>Variación</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => {
                  const totalWeight = getTotalWeightByCollaborator(
                    assignment.collaboratorId,
                    assignment.periodId
                  )
                  return (
                    <tr key={assignment.id}>
                      <td>{assignment.id}</td>
                      <td className="name-cell">
                        {collaborators?.find(
                          (c: any) => c.id === assignment.collaboratorId
                        )?.name || `Colaborador #${assignment.collaboratorId}`}
                      </td>
                      <td>
                        {(assignment as any).kpiName ||
                          `KPI #${assignment.kpiId}`}
                      </td>
                      <td>
                        {(assignment as any).periodName ||
                          `Período #${assignment.periodId}`}
                      </td>
                      <td className="number-cell">{assignment.target}</td>
                      <td className="number-cell">
                        {assignment.actual ?? '-'}
                      </td>
                      <td className="number-cell">
                        {assignment.weight}%
                        {totalWeight !== 100 && (
                          <span
                            className={`weight-warning ${
                              totalWeight > 100 ? 'error' : 'warning'
                            }`}
                            title={`Suma total: ${totalWeight}%`}
                          >
                            {totalWeight > 100 ? '⚠' : '!'}
                          </span>
                        )}
                      </td>
                      <td className="number-cell">
                        {assignment.variation !== null &&
                        assignment.variation !== undefined
                          ? `${assignment.variation.toFixed(1)}%`
                          : '-'}
                      </td>
                      <td>{getStatusBadge(assignment.status)}</td>
                      <td>
                        <div className="action-buttons">
                          {canEditAssignment(assignment) ? (
                            <>
                              <button
                                className="btn-icon"
                                onClick={() => handleEdit(assignment)}
                                title="Editar"
                              >
                                ✏️
                              </button>
                              <button
                                className="btn-icon"
                                onClick={() => handleDelete(assignment.id)}
                                title="Eliminar"
                              >
                                🗑️
                              </button>
                            </>
                          ) : (
                            <span className="locked-badge" title="Parrilla cerrada - No se puede editar">
                              🔒 Cerrada
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Resumen de ponderaciones */}
            {selectedPeriodId && (
              <div className="weight-summary">
                <h3>Resumen de Ponderaciones por Colaborador</h3>
                <div className="summary-table">
                  {collaborators
                    ?.filter((c: any) =>
                      assignments?.some(
                        (a) =>
                          a.collaboratorId === c.id &&
                          a.periodId === selectedPeriodId
                      )
                    )
                    .map((collaborator: any) => {
                      const totalWeight = getTotalWeightByCollaborator(
                        collaborator.id,
                        selectedPeriodId
                      )
                      return (
                        <div
                          key={collaborator.id}
                          className={`summary-row ${
                            totalWeight === 100
                              ? 'valid'
                              : totalWeight > 100
                              ? 'error'
                              : 'warning'
                          }`}
                        >
                          <span className="summary-name">
                            {collaborator.name}
                          </span>
                          <span className="summary-weight">
                            {totalWeight.toFixed(1)}%
                          </span>
                          {totalWeight === 100 && (
                            <span className="summary-status">✓ Válido</span>
                          )}
                          {totalWeight > 100 && (
                            <span className="summary-status">
                              ⚠ Excede por {(totalWeight - 100).toFixed(1)}%
                            </span>
                          )}
                          {totalWeight < 100 && (
                            <span className="summary-status">
                              ! Falta {(100 - totalWeight).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>No hay asignaciones registradas</h3>
            <p>
              Crea una nueva asignación para vincular KPIs con colaboradores
            </p>
            <button className="btn-primary" onClick={handleCreate}>
              Nueva Asignación
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <CollaboratorKPIForm
          assignment={editingAssignment}
          periodId={selectedPeriodId || 0}
          collaboratorId={selectedCollaboratorId || undefined}
          onClose={() => {
            setShowForm(false)
            setEditingAssignment(undefined)
          }}
        />
      )}

      {showCloseModal && selectedPeriodId && (
        <CloseParrillaModal
          periodId={selectedPeriodId}
          collaboratorId={closingCollaboratorId || undefined}
          collaboratorName={
            closingCollaboratorId
              ? collaborators?.find(
                  (c: any) => c.id === closingCollaboratorId
                )?.name
              : undefined
          }
          periodName={periods?.find((p: any) => p.id === selectedPeriodId)?.name}
          onClose={() => {
            setShowCloseModal(false)
            setClosingCollaboratorId(null)
          }}
        />
      )}
    </div>
  )
}
