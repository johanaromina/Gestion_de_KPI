/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from 'react-query'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
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
  calendarProfiles,
  selectedCalendarProfileId,
  onCalendarChange,
}: {
  period: Period
  expanded: boolean
  onCreate: () => void
  onEdit: (sub: SubPeriod) => void
  onDelete: (sub: SubPeriod) => void
  onClose: (sub: SubPeriod) => void
  canConfig: boolean
  closeNotice: { periodId: number; text: string; tone: 'success' | 'warning' } | null
  calendarProfiles: Array<{ id: number; name: string; frequency: string; active?: boolean }>
  selectedCalendarProfileId: number | null
  onCalendarChange: (calendarProfileId: number | null) => void
}) {
  const { data, isLoading } = useQuery<SubPeriod[]>(
    ['sub-periods', period.id, selectedCalendarProfileId],
    async () => {
      const response = await api.get(`/periods/${period.id}/sub-periods`, {
        params: {
          calendarProfileId: selectedCalendarProfileId || undefined,
        },
      })
      return response.data
    },
    {
      enabled: expanded,
    }
  )

  if (!expanded) return null

  const allClosed = !!data?.length && data.every((sub) => sub.status === 'closed')

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
        <div className="subperiods-actions">
          <select
            value={selectedCalendarProfileId || ''}
            onChange={(e) =>
              onCalendarChange(e.target.value ? Number(e.target.value) : null)
            }
            className="filter-select"
          >
            <option value="">Calendario: Default</option>
            {calendarProfiles?.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
          {canConfig && (
            <button className="btn-small" onClick={onCreate}>
              + Agregar subperiodo
            </button>
          )}
        </div>
      </div>
      {allClosed && period.status !== 'closed' && (
        <div className="subperiods-notice success">
          Todos los subperiodos estan cerrados. Podes cerrar el periodo de forma manual.
        </div>
      )}
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
  const navigate = useNavigate()
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
  const [calendarByPeriod, setCalendarByPeriod] = useState<Record<number, number | null>>({})

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

  const { data: calendarProfiles } = useQuery<any[]>(
    'calendar-profiles',
    async () => {
      const response = await api.get('/calendar-profiles')
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
    async ({ id, sendEmail }: { id: number; sendEmail: boolean }) => {
      await api.post(`/periods/${id}/close`, { sendEmail })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('periods')
        queryClient.invalidateQueries('collaborator-kpis')
        queryClient.invalidateQueries('period-summary-status')
        queryClient.invalidateQueries('period-summary')
      },
    }
  )

  const recalcSummaryMutation = useMutation(
    async (id: number) => {
      await api.post(`/periods/${id}/close`, { sendEmail: false })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('periods')
        queryClient.invalidateQueries('collaborator-kpis')
        queryClient.invalidateQueries('period-summary-status')
        queryClient.invalidateQueries('period-summary')
        alert('Resumen anual recalculado correctamente')
      },
      onError: (error: any) => {
        alert(error.response?.data?.error || 'No se pudo recalcular el resumen anual')
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
      const sendEmail = window.confirm(
        'Enviar resumen anual por email a los colaboradores?'
      )
      closePeriodMutation.mutate({ id: period.id, sendEmail })
    }
  }

  const handleRecalculateSummary = (period: Period) => {
    if (
      window.confirm(
        `Recalcular resumen anual para "${period.name}"? Esto regenerará el resumen con los datos actuales.`
      )
    ) {
      recalcSummaryMutation.mutate(period.id)
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

  const closedPeriods = useMemo(
    () => (filteredPeriods || []).filter((period) => period.status === 'closed'),
    [filteredPeriods]
  )

  const summaryQueries = useQueries(
    (closedPeriods || []).map((period) => ({
      queryKey: ['period-summary-status', period.id],
      queryFn: async () => {
        const response = await api.get(`/periods/${period.id}/summary`)
        return response.data
      },
      staleTime: 60 * 1000,
    }))
  )

  const summaryByPeriodId = useMemo(() => {
    const map = new Map<number, { summaries: any[]; items: any[] }>()
    summaryQueries.forEach((query, index) => {
      const period = closedPeriods?.[index]
      if (!period) return
      if (query.data) {
        map.set(period.id, query.data as { summaries: any[]; items: any[] })
      }
    })
    return map
  }, [summaryQueries, closedPeriods])

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
                            {period.status === 'closed' &&
                              !summaryByPeriodId.get(period.id)?.summaries?.length && (
                                <span className="status-badge status-review" style={{ marginLeft: 8 }}>
                                  Sin resumen anual
                                </span>
                              )}
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
                          {period.status === 'closed' && (
                            <button
                              className="btn-text"
                              onClick={() =>
                                navigate(
                                  canConfig
                                    ? `/historial/all?periodId=${period.id}`
                                    : `/historial?periodId=${period.id}`
                                )
                              }
                              title="Ver resumen anual"
                            >
                              Ver resumen anual
                            </button>
                          )}
                          {period.status === 'closed' && (
                            <button
                              className="btn-text"
                              onClick={() => handleRecalculateSummary(period)}
                              title="Recalcular resumen anual"
                            >
                              Recalcular resumen
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
                      calendarProfiles={calendarProfiles || []}
                      selectedCalendarProfileId={calendarByPeriod[period.id] ?? null}
                      onCalendarChange={(calendarProfileId) =>
                        setCalendarByPeriod((prev) => ({
                          ...prev,
                          [period.id]: calendarProfileId,
                        }))
                      }
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
          calendarProfileId={calendarByPeriod[selectedPeriod.id] ?? null}
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
