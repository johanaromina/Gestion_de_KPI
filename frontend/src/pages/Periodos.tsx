import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import api from '../services/api'
import { Period } from '../types'
import { format } from 'date-fns'
import PeriodForm from '../components/PeriodForm'
import SubPeriodForm from '../components/SubPeriodForm'
import './Periodos.css'

interface SubPeriod {
  id: number
  periodId: number
  name: string
  startDate: string
  endDate: string
  weight?: number
}

export default function Periodos() {
  const [showPeriodForm, setShowPeriodForm] = useState(false)
  const [showSubPeriodForm, setShowSubPeriodForm] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null)
  const [editingPeriod, setEditingPeriod] = useState<Period | undefined>(undefined)
  const [expandedPeriods, setExpandedPeriods] = useState<Set<number>>(new Set())

  const queryClient = useQueryClient()

  const { data: periods, isLoading } = useQuery<Period[]>(
    'periods',
    async () => {
      const response = await api.get('/periods')
      return response.data
    }
  )

  const { data: subPeriods } = useQuery<SubPeriod[]>(
    ['sub-periods', selectedPeriod?.id],
    async () => {
      if (!selectedPeriod?.id) return []
      const response = await api.get(`/periods/${selectedPeriod.id}/sub-periods`)
      return response.data
    },
    {
      enabled: !!selectedPeriod?.id,
    }
  )

  const deleteMutation = useMutation(
    async (id: number) => {
      await api.delete(`/periods/${id}`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('periods')
      },
    }
  )

  const closePeriodMutation = useMutation(
    async (id: number) => {
      await api.post(`/periods/${id}/close`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('periods')
        queryClient.invalidateQueries('collaborator-kpis')
      },
    }
  )

  const reopenPeriodMutation = useMutation(
    async (id: number) => {
      await api.post(`/periods/${id}/reopen`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('periods')
        queryClient.invalidateQueries('collaborator-kpis')
      },
      onError: (error: any) => {
        alert(
          error.response?.data?.error ||
            'No tienes permisos para reabrir períodos cerrados'
        )
      },
    }
  )

  const togglePeriodExpansion = (periodId: number) => {
    const newExpanded = new Set(expandedPeriods)
    if (newExpanded.has(periodId)) {
      newExpanded.delete(periodId)
      setSelectedPeriod(null)
    } else {
      newExpanded.add(periodId)
      const period = periods?.find((p) => p.id === periodId)
      if (period) {
        setSelectedPeriod(period)
      }
    }
    setExpandedPeriods(newExpanded)
  }

  const handleCreatePeriod = () => {
    setEditingPeriod(undefined)
    setShowPeriodForm(true)
  }

  const handleEditPeriod = (period: Period) => {
    setEditingPeriod(period)
    setShowPeriodForm(true)
  }

  const handleCreateSubPeriod = (period: Period) => {
    setSelectedPeriod(period)
    setShowSubPeriodForm(true)
  }

  const handleDeletePeriod = async (id: number) => {
    if (window.confirm('¿Estás seguro de eliminar este período? Esta acción no se puede deshacer.')) {
      deleteMutation.mutate(id)
    }
  }

  const handleClosePeriod = async (period: Period) => {
    if (
      window.confirm(
        `¿Estás seguro de cerrar el período "${period.name}"? Una vez cerrado, no se podrán editar las asignaciones sin permisos especiales.`
      )
    ) {
      closePeriodMutation.mutate(period.id)
    }
  }

  const handleReopenPeriod = async (period: Period) => {
    if (
      window.confirm(
        `¿Estás seguro de reabrir el período "${period.name}"? Esta acción requiere permisos especiales.`
      )
    ) {
      reopenPeriodMutation.mutate(period.id)
    }
  }

  const getStatusBadge = (status: Period['status']) => {
    const statusConfig = {
      open: { label: 'Abierto', class: 'status-open' },
      in_review: { label: 'En Revisión', class: 'status-review' },
      closed: { label: 'Cerrado', class: 'status-closed' },
    }
    const config = statusConfig[status]
    return (
      <span className={`status-badge ${config.class}`}>
        {config.label}
      </span>
    )
  }

  return (
    <div className="periodos-page">
      <div className="page-header">
        <div>
          <h1>Períodos</h1>
          <p className="subtitle">Gestiona los períodos de evaluación</p>
        </div>
        <button className="btn-primary" onClick={handleCreatePeriod}>
          ➕ Crear Período
        </button>
      </div>

      <div className="table-container">
        {isLoading ? (
          <div className="loading">Cargando períodos...</div>
        ) : periods && periods.length > 0 ? (
          <div className="periods-list">
            {periods.map((period) => (
              <div key={period.id} className="period-card">
                <div className="period-card-header">
                  <div className="period-card-main">
                    <div className="period-info">
                      <h3 className="period-name">{period.name}</h3>
                      <div className="period-dates">
                        <span>
                          {format(new Date(period.startDate), 'dd MMM yyyy')} -{' '}
                          {format(new Date(period.endDate), 'dd MMM yyyy')}
                        </span>
                      </div>
                    </div>
                    <div className="period-status">{getStatusBadge(period.status)}</div>
                  </div>
                  <div className="period-actions">
                    <button
                      className="btn-icon"
                      onClick={() => togglePeriodExpansion(period.id)}
                      title="Ver subperíodos"
                    >
                      {expandedPeriods.has(period.id) ? '▼' : '▶'}
                    </button>
                    {period.status === 'closed' ? (
                      <button
                        className="btn-icon reopen-btn"
                        onClick={() => handleReopenPeriod(period)}
                        title="Reabrir Período (requiere permisos)"
                      >
                        🔓
                      </button>
                    ) : (
                      <button
                        className="btn-icon close-btn"
                        onClick={() => handleClosePeriod(period)}
                        title="Cerrar Período"
                      >
                        🔒
                      </button>
                    )}
                    <button
                      className="btn-icon"
                      onClick={() => handleEditPeriod(period)}
                      title="Editar"
                      disabled={period.status === 'closed'}
                    >
                      ✏️
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => handleDeletePeriod(period.id)}
                      title="Eliminar"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {expandedPeriods.has(period.id) && (
                  <div className="subperiods-section">
                    <div className="subperiods-header">
                      <h4>Subperíodos</h4>
                      <button
                        className="btn-small"
                        onClick={() => handleCreateSubPeriod(period)}
                      >
                        ➕ Agregar Subperíodo
                      </button>
                    </div>

                    {subPeriods && subPeriods.length > 0 ? (
                      <table className="subperiods-table">
                        <thead>
                          <tr>
                            <th>Nombre</th>
                            <th>Fecha Inicio</th>
                            <th>Fecha Fin</th>
                            <th>Peso</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subPeriods.map((subPeriod) => (
                            <tr key={subPeriod.id}>
                              <td>{subPeriod.name}</td>
                              <td>
                                {format(new Date(subPeriod.startDate), 'dd MMM yyyy')}
                              </td>
                              <td>
                                {format(new Date(subPeriod.endDate), 'dd MMM yyyy')}
                              </td>
                              <td>{subPeriod.weight ? `${subPeriod.weight}%` : '-'}</td>
                              <td>
                                <button className="btn-icon" title="Editar">
                                  ✏️
                                </button>
                                <button className="btn-icon" title="Eliminar">
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="empty-subperiods">
                        <p>No hay subperíodos definidos</p>
                        <button
                          className="btn-small"
                          onClick={() => handleCreateSubPeriod(period)}
                        >
                          Crear primer subperíodo
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📅</div>
            <h3>No hay períodos registrados</h3>
            <p>Crea un nuevo período para comenzar a evaluar KPIs</p>
            <button className="btn-primary" onClick={handleCreatePeriod}>
              Crear Período
            </button>
          </div>
        )}
      </div>

      {showPeriodForm && (
        <PeriodForm
          period={editingPeriod}
          onClose={() => {
            setShowPeriodForm(false)
            setEditingPeriod(undefined)
          }}
        />
      )}

      {showSubPeriodForm && selectedPeriod && (
        <SubPeriodForm
          periodId={selectedPeriod.id}
          onClose={() => {
            setShowSubPeriodForm(false)
            setSelectedPeriod(null)
          }}
        />
      )}
    </div>
  )
}
