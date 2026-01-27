/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { format } from 'date-fns'
import api from '../services/api'
import { Period, SubPeriod } from '../types'
import PeriodForm from '../components/PeriodForm'
import SubPeriodForm from '../components/SubPeriodForm'
import { useAuth } from '../hooks/useAuth'
import './Periodos.css'

function SubPeriodsSection({
  period,
  expanded,
  onCreate,
  onEdit,
  onDelete,
  onClose,
  canConfig,
  closeNotice,
}: {
  period: Period
  expanded: boolean
  onCreate: () => void
  onEdit: (sub: SubPeriod) => void
  onDelete: (sub: SubPeriod) => void
  onClose: (sub: SubPeriod) => void
  canConfig: boolean
  closeNotice: { periodId: number; text: string; tone: 'success' | 'warning' } | null
}) {
  const { data, isLoading } = useQuery<SubPeriod[]>(
    ['sub-periods', period.id],
    async () => {
      const response = await api.get(`/periods/${period.id}/sub-periods`)
      return response.data
    },
    {
      enabled: expanded,
    }
  )

  if (!expanded) return null

  const getStatusBadge = (status?: SubPeriod['status']) => {
    if (status === 'closed') {
      return <span className="status-badge status-closed">Cerrado</span>
    }
    return <span className="status-badge status-open">Abierto</span>
  }

  return (
    <div className="subperiods-section">
      <div className="subperiods-header">
        <h4>Subperiodos</h4>
        {canConfig && (
          <button className="btn-small" onClick={onCreate}>
            + Agregar subperiodo
          </button>
        )}
      </div>
      {closeNotice && closeNotice.periodId === period.id && (
        <div className={`subperiods-notice ${closeNotice.tone}`}>
          {closeNotice.text}
        </div>
      )}

      {isLoading ? (
        <div className="loading-row">Cargando subperiodos...</div>
      ) : data && data.length > 0 ? (
        <table className="subperiods-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Fecha Inicio</th>
              <th>Fecha Fin</th>
              <th>Peso</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.map((subPeriod) => (
              <tr key={subPeriod.id}>
                <td>{subPeriod.name}</td>
                <td>{format(new Date(subPeriod.startDate), 'dd MMM yyyy')}</td>
                <td>{format(new Date(subPeriod.endDate), 'dd MMM yyyy')}</td>
                <td>{subPeriod.weight ? `${subPeriod.weight}%` : '-'}</td>
                <td>{getStatusBadge(subPeriod.status)}</td>
                <td className="row-actions">
                  {canConfig && (
                    <>
                      <button
                        className="btn-text"
                        onClick={() => onEdit(subPeriod)}
                        disabled={subPeriod.status === 'closed'}
                      >
                        Editar
                      </button>
                      <button
                        className="btn-text danger"
                        onClick={() => onDelete(subPeriod)}
                        disabled={subPeriod.status === 'closed'}
                      >
                        Eliminar
                      </button>
                      {subPeriod.status !== 'closed' && (
                        <button
                          className="btn-text"
                          onClick={() => onClose(subPeriod)}
                        >
                          Cerrar
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-subperiods">
          <p>No hay subperiodos definidos</p>
          {canConfig && (
            <button className="btn-small" onClick={onCreate}>
              Crear primer subperiodo
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function Periodos() {
  const { canConfig } = useAuth()
  const [showPeriodForm, setShowPeriodForm] = useState(false)
  const [showSubPeriodForm, setShowSubPeriodForm] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null)
  const [editingPeriod, setEditingPeriod] = useState<Period | undefined>(undefined)
  const [editingSubPeriod, setEditingSubPeriod] = useState<SubPeriod | undefined>(undefined)
  const [expandedPeriods, setExpandedPeriods] = useState<Set<number>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [closeNotice, setCloseNotice] = useState<{
    periodId: number
    text: string
    tone: 'success' | 'warning'
  } | null>(null)

  const queryClient = useQueryClient()

  const { data: periods, isLoading } = useQuery<Period[]>(
    'periods',
    async () => {
      const response = await api.get('/periods')
      return response.data
    },
    {
      staleTime: 60 * 1000,
    }
  )

  const deletePeriodMutation = useMutation(
    async (id: number) => {
      await api.delete(`/periods/${id}`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('periods')
      },
    }
  )

  const deleteSubPeriodMutation = useMutation(
    async (subPeriod: SubPeriod) => {
      await api.delete(`/sub-periods/${subPeriod.id}`)
      return subPeriod
    },
    {
      onSuccess: (_data, subPeriod) => {
        queryClient.invalidateQueries('periods')
        queryClient.invalidateQueries(['sub-periods', subPeriod.periodId])
      },
    }
  )

  const closeSubPeriodMutation = useMutation(
    async (subPeriod: SubPeriod) => {
      const response = await api.post(`/sub-periods/${subPeriod.id}/close`)
      return { subPeriod, data: response.data }
    },
    {
      onSuccess: (result) => {
        const { subPeriod, data } = result || {}
        if (subPeriod) {
          if (data?.failed?.length) {
            setCloseNotice({
              periodId: subPeriod.periodId,
              tone: 'warning',
              text: `Subperíodo cerrado. Emails enviados: ${data.sent ?? 0}. Fallidos: ${data.failed.length}.`,
            })
          } else {
            setCloseNotice({
              periodId: subPeriod.periodId,
              tone: 'success',
              text: `Subperíodo cerrado. Emails enviados: ${data?.sent ?? 0}.`,
            })
          }
        }
        queryClient.invalidateQueries('periods')
        if (subPeriod) {
          queryClient.invalidateQueries(['sub-periods', subPeriod.periodId])
        }
      },
      onError: (error: any) => {
        alert(error.response?.data?.error || 'No se pudo cerrar el subperíodo')
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
        alert(error.response?.data?.error || 'No tienes permisos para reabrir periodos cerrados')
      },
    }
  )

  const togglePeriodExpansion = (periodId: number) => {
    const newExpanded = new Set(expandedPeriods)
    if (newExpanded.has(periodId)) {
      newExpanded.delete(periodId)
    } else {
      newExpanded.add(periodId)
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
    setEditingSubPeriod(undefined)
    setShowSubPeriodForm(true)
  }

  const handleEditSubPeriod = (period: Period, subPeriod: SubPeriod) => {
    setSelectedPeriod(period)
    setEditingSubPeriod(subPeriod)
    setShowSubPeriodForm(true)
  }

  const handleDeleteSubPeriod = (subPeriod: SubPeriod) => {
    if (
      window.confirm(
        `Estas seguro de eliminar el subperiodo "${subPeriod.name}"? Esta accion no se puede deshacer.`
      )
    ) {
      deleteSubPeriodMutation.mutate(subPeriod)
    }
  }

  const handleCloseSubPeriod = (subPeriod: SubPeriod) => {
    if (
      window.confirm(
        `Estas seguro de cerrar el subperiodo "${subPeriod.name}"? Se enviara un resumen por email.`
      )
    ) {
      closeSubPeriodMutation.mutate(subPeriod)
    }
  }

  const handleDeletePeriod = (id: number, name: string) => {
    if (window.confirm(`Estas seguro de eliminar el periodo "${name}"? Esta accion no se puede deshacer.`)) {
      deletePeriodMutation.mutate(id)
    }
  }

  const handleClosePeriod = (period: Period) => {
    if (
      window.confirm(
        `Estas seguro de cerrar el periodo "${period.name}"? Una vez cerrado no se podran editar asignaciones sin permisos especiales.`
      )
    ) {
      closePeriodMutation.mutate(period.id)
    }
  }

  const handleReopenPeriod = (period: Period) => {
    if (
      window.confirm(
        `Estas seguro de reabrir el periodo "${period.name}"? Esta accion requiere permisos especiales.`
      )
    ) {
      reopenPeriodMutation.mutate(period.id)
    }
  }

  const filteredPeriods = useMemo(() => {
    return periods?.filter((period) => {
      const matchesSearch =
        !searchTerm || period.name.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus = !filterStatus || period.status === filterStatus

      const start = new Date(period.startDate).getTime()
      const end = new Date(period.endDate).getTime()
      const filterStart = filterStartDate ? new Date(filterStartDate).getTime() : null
      const filterEnd = filterEndDate ? new Date(filterEndDate).getTime() : null

      const matchesStart = filterStart ? start >= filterStart : true
      const matchesEnd = filterEnd ? end <= filterEnd : true

      return matchesSearch && matchesStatus && matchesStart && matchesEnd
    })
  }, [periods, searchTerm, filterStatus, filterStartDate, filterEndDate])

  const getStatusBadge = (status: Period['status']) => {
    const statusConfig: Record<Period['status'], { label: string; class: string }> = {
      open: { label: 'Abierto', class: 'status-open' },
      in_review: { label: 'En revision', class: 'status-review' },
      closed: { label: 'Cerrado', class: 'status-closed' },
    }
    const config = statusConfig[status]
    return <span className={`status-badge ${config.class}`}>{config.label}</span>
  }

  return (
    <div className="periodos-page">
      <div className="page-header">
        <div>
          <h1>Periodos</h1>
          <p className="subtitle">Gestiona los periodos de evaluacion</p>
        </div>
        <button className="btn-primary" onClick={handleCreatePeriod}>
          + Crear periodo
        </button>
      </div>

      <div className="filters-section">
        <div className="search-group">
          <label htmlFor="search">Buscar:</label>
          <input
            type="text"
            id="search"
            placeholder="Buscar por nombre de periodo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-group">
          <label htmlFor="filter-status">Estado:</label>
          <select
            id="filter-status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">Todos los estados</option>
            <option value="open">Abierto</option>
            <option value="in_review">En revision</option>
            <option value="closed">Cerrado</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="filter-start">Desde:</label>
          <input
            id="filter-start"
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="filter-end">Hasta:</label>
          <input
            id="filter-end"
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
          />
        </div>
        {(searchTerm || filterStatus) && (
          <button
            className="btn-clear-filters"
            onClick={() => {
              setSearchTerm('')
              setFilterStatus('')
              setFilterStartDate('')
              setFilterEndDate('')
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="table-container">
        {isLoading ? (
          <div className="loading">Cargando periodos...</div>
        ) : filteredPeriods && filteredPeriods.length > 0 ? (
          <>
            <div className="results-info">
              Mostrando {filteredPeriods.length} de {periods?.length || 0} periodos
            </div>
            <div className="periods-list">
              {filteredPeriods.map((period) => {
                const isExpanded = expandedPeriods.has(period.id)
                return (
                  <div key={period.id} className="period-card">
                    <div className="period-card-header">
                      <div className="period-card-main">
                        <div className="period-info">
                          <h3 className="period-name">{period.name}</h3>
                          <div className="period-dates">
                            {format(new Date(period.startDate), 'dd MMM yyyy')} —{' '}
                            {format(new Date(period.endDate), 'dd MMM yyyy')}
                          </div>
                          <div className="period-meta">
                            <span className="meta-pill">Estado: {getStatusBadge(period.status)}</span>
                          </div>
                        </div>
                        <div className="period-actions">
                          <button
                            className="btn-icon"
                            onClick={() => togglePeriodExpansion(period.id)}
                            title={isExpanded ? 'Ocultar subperiodos' : 'Ver subperiodos'}
                          >
                            {isExpanded ? '[-]' : '[+]'}
                          </button>
                          {period.status === 'closed' ? (
                            <button
                              className="btn-text success"
                              onClick={() => handleReopenPeriod(period)}
                              title="Reabrir periodo"
                            >
                              Reabrir
                            </button>
                          ) : (
                            <button
                              className="btn-text"
                              onClick={() => handleClosePeriod(period)}
                              title="Cerrar periodo"
                            >
                              Cerrar
                            </button>
                          )}
                          <button
                            className="btn-text"
                            onClick={() => handleEditPeriod(period)}
                            title="Editar periodo"
                            disabled={period.status === 'closed'}
                          >
                            Editar
                          </button>
                          <button
                            className="btn-text danger"
                            onClick={() => handleDeletePeriod(period.id, period.name)}
                            title="Eliminar periodo"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    </div>

                    <SubPeriodsSection
                      period={period}
                      expanded={isExpanded}
                      onCreate={() => handleCreateSubPeriod(period)}
                      onEdit={(sub) => handleEditSubPeriod(period, sub)}
                      onDelete={(sub) => handleDeleteSubPeriod(sub)}
                      onClose={(sub) => handleCloseSubPeriod(sub)}
                      canConfig={canConfig}
                      closeNotice={closeNotice}
                    />
                  </div>
                )
              })}
            </div>
          </>
        ) : periods && periods.length > 0 ? (
          <div className="empty-state">
            <div className="empty-icon">:/</div>
            <h3>No se encontraron periodos</h3>
            <p>Intenta ajustar los filtros de busqueda</p>
            <button
              className="btn-primary"
              onClick={() => {
                setSearchTerm('')
                setFilterStatus('')
              }}
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">:)</div>
            <h3>No hay periodos registrados</h3>
            <p>Crea un nuevo periodo para comenzar a evaluar KPIs</p>
            <button className="btn-primary" onClick={handleCreatePeriod}>
              Crear periodo
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
          subPeriod={editingSubPeriod}
          onClose={() => {
            setShowSubPeriodForm(false)
            setSelectedPeriod(null)
            setEditingSubPeriod(undefined)
          }}
        />
      )}
    </div>
  )
}
