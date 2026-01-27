/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import api from '../services/api'
import { CollaboratorKPI } from '../types'
import CollaboratorKPIForm from '../components/CollaboratorKPIForm'
import CloseParrillaModal from '../components/CloseParrillaModal'
import GenerateBaseGridModal from '../components/GenerateBaseGridModal'
import ReviewModal from '../components/ReviewModal'
import ConsistencyAlerts from '../components/ConsistencyAlerts'
import './Asignaciones.css'

const toNumber = (value: any): number | null => {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export default function Asignaciones() {
  const [showForm, setShowForm] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<CollaboratorKPI | undefined>(undefined)
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState<number | null>(null)
  const [selectedKPIId, setSelectedKPIId] = useState<number | null>(null)
  const [selectedArea, setSelectedArea] = useState<string>('')
  const [selectedSubPeriodId, setSelectedSubPeriodId] = useState<number | null>(null)
  const [showMonthly, setShowMonthly] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [closingCollaboratorId, setClosingCollaboratorId] = useState<number | null>(null)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [reviewingAssignment, setReviewingAssignment] = useState<{
    assignment: CollaboratorKPI
    action: 'approve' | 'reject'
  } | null>(null)

  const navigate = useNavigate()

  const queryClient = useQueryClient()

  // Periodos
  const { data: periods } = useQuery('periods', async () => {
    const response = await api.get('/periods')
    return response.data
  })

  // Subperiodos del periodo seleccionado
  const { data: subPeriods } = useQuery<any[]>(
    ['sub-periods', selectedPeriodId],
    async () => {
      if (!selectedPeriodId) return []
      const res = await api.get(`/periods/${selectedPeriodId}/sub-periods`)
      return res.data
    },
    { enabled: !!selectedPeriodId }
  )

  // Colaboradores
  const { data: collaborators } = useQuery('collaborators', async () => {
    const response = await api.get('/collaborators')
    return response.data
  })

  // KPIs
  const selectedCollab = collaborators?.find((c: any) => c.id === selectedCollaboratorId)
  const effectiveArea = selectedArea || selectedCollab?.area || ''

  const { data: kpis } = useQuery(
    ['kpis', effectiveArea],
    async () => {
      const response = await api.get('/kpis', {
        params: effectiveArea ? { area: effectiveArea } : undefined,
      })
      return response.data
    }
  )

  // Asignaciones
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
    { enabled: true }
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
    const selectedPeriod = periods?.find((p: any) => p.id === selectedPeriodId)
    if (selectedPeriod?.status === 'closed') {
      alert('No se pueden crear asignaciones en períodos cerrados')
      return
    }
    setEditingAssignment(undefined)
    setShowForm(true)
  }

  const handleEdit = (assignment: CollaboratorKPI) => {
    const period = periods?.find((p: any) => p.id === assignment.periodId)
    if (period?.status === 'closed') {
      alert('Periodo cerrado. Solo se puede editar alcance con permisos especiales.')
    }
    setEditingAssignment(assignment)
    setShowForm(true)
  }

  const handleDelete = (id: number) => {
    if (window.confirm('¿Estás seguro de eliminar esta asignación?')) {
      deleteMutation.mutate(id)
    }
  }

  const handleCloseParrilla = () => {
    if (!selectedPeriodId) {
      alert('Selecciona un período primero')
      return
    }
    setClosingCollaboratorId(selectedCollaboratorId)
    setShowCloseModal(true)
  }

  const isAssignmentClosed = (assignment: CollaboratorKPI) =>
    assignment.status === 'closed' || (assignment as any).periodStatus === 'closed'

  const canEditAssignment = (assignment: CollaboratorKPI) => !isAssignmentClosed(assignment)

  const getStatusBadge = (status: CollaboratorKPI['status']) => {
    const statusConfig = {
      draft: { label: 'Borrador', class: 'status-draft' },
      proposed: { label: 'Propuesto', class: 'status-proposed' },
      approved: { label: 'Aprobado', class: 'status-approved' },
      closed: { label: 'Cerrado', class: 'status-closed' },
    } as const
    const config = status ? statusConfig[status] : undefined
    if (!config) return <span className="status-badge status-unknown">{status || 'Sin estado'}</span>
    return <span className={`status-badge ${config.class}`}>{config.label}</span>
  }

  const getCurationBadge = (assignment: CollaboratorKPI) => {
    if (isAssignmentClosed(assignment)) {
      return <span className="curation-badge locked">Bloqueado</span>
    }
    const status = assignment.curationStatus || 'pending'
    const config = {
      pending: { label: 'Pendiente', class: 'curation-pending' },
      in_review: { label: 'En revision', class: 'curation-review' },
      approved: { label: 'Aprobada', class: 'curation-approved' },
      rejected: { label: 'Rechazada', class: 'curation-rejected' },
    } as const
    const entry = config[status as keyof typeof config]
    return <span className={`curation-badge ${entry.class}`}>{entry.label}</span>
  }

  const getInputBadge = (mode?: CollaboratorKPI['inputMode']) => {
    const normalized = mode || 'manual'
    const config = {
      manual: { label: 'Manual', class: 'input-manual' },
      import: { label: 'Import', class: 'input-import' },
      auto: { label: 'Auto', class: 'input-auto' },
    } as const
    const entry = config[normalized]
    return <span className={`input-badge ${entry.class}`}>{entry.label}</span>
  }

  const formatMeasurement = (assignment: CollaboratorKPI) => {
    if (!assignment.lastMeasurementAt) return '-'
    const label = assignment.lastMeasurementBy
      ? `${assignment.lastMeasurementAt} · ${assignment.lastMeasurementBy}`
      : assignment.lastMeasurementAt
    return label
  }

  // Áreas únicas
  const areas: string[] = Array.from(
    new Set<string>((collaborators?.map((c: any) => c.area).filter(Boolean) as string[]) || [])
  ).sort()
  const collaboratorsInArea = selectedArea
    ? collaborators?.filter((c: any) => c.area === selectedArea)
    : collaborators

  // Filtro local
  const filteredAssignments = assignments?.filter((assignment) => {
    const matchesCollaborator =
      !selectedCollaboratorId || assignment.collaboratorId === selectedCollaboratorId
    const matchesPeriod = !selectedPeriodId || assignment.periodId === selectedPeriodId
    const matchesKPI = !selectedKPIId || assignment.kpiId === selectedKPIId
    const matchesSubPeriod =
      selectedSubPeriodId === null
        ? true
        : (assignment as any).subPeriodId === selectedSubPeriodId
    const matchesShowMonthly = showMonthly || (assignment as any).subPeriodId === null
    const matchesArea =
      !selectedArea ||
      collaborators?.find((c: any) => c.id === assignment.collaboratorId)?.area === selectedArea
    const matchesSearch =
      !searchTerm ||
      (collaborators?.find((c: any) => c.id === assignment.collaboratorId)?.name || '')
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      (kpis?.find((k: any) => k.id === assignment.kpiId)?.name || '')
        .toLowerCase()
        .includes(searchTerm.toLowerCase())

    return (
      matchesCollaborator &&
      matchesPeriod &&
      matchesKPI &&
      matchesArea &&
      matchesSearch &&
      matchesSubPeriod &&
      matchesShowMonthly
    )
  })

  const getTotalWeightByCollaborator = (collaboratorId: number, periodId: number): number => {
    if (!assignments) return 0
    // Usa solo filas resumen (subPeriodId null) para no duplicar pesos por subperiodo
    return assignments
      .filter(
        (a) => a.collaboratorId === collaboratorId && a.periodId === periodId && (a as any).subPeriodId == null
      )
      .reduce((sum, a) => sum + (toNumber(a.weight) || 0), 0)
  }

  const today = new Date()

  const monthlyAssignments = assignments?.filter(
    (a) => (a as any).subPeriodId && a.periodId === selectedPeriodId && a.collaboratorId === selectedCollaboratorId
  )

  const dueMonthlyAssignments =
    monthlyAssignments?.filter((a) => {
      const sp = subPeriods?.find((s) => s.id === (a as any).subPeriodId)
      if (!sp?.endDate) return false
      return new Date(sp.endDate) <= today
    }) || []

  const pendingMonthly = dueMonthlyAssignments.filter((a) => a.actual === null || a.actual === undefined)

  const growthReductionTotals = dueMonthlyAssignments.reduce<Record<
    number,
    { name: string; type: string; total: number }
  >>((acc, a) => {
    const type = (a as any).kpiType
    if (type !== 'growth' && type !== 'reduction') return acc
    const key = a.kpiId
    const current = acc[key] || {
      name: (a as any).kpiName || `KPI #${a.kpiId}`,
      type,
      total: 0,
    }
    const actualVal = toNumber(a.actual) || 0
    current.total += actualVal
    acc[key] = current
    return acc
  }, {})

  return (
    <div className="asignaciones-page">
      <div className="page-header">
        <div>
          <h1>Asignaciones de KPIs</h1>
          <p className="subtitle">Gestiona las asignaciones de KPIs a colaboradores</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => setShowGenerateModal(true)}>
            Generar Parrillas Base
          </button>
          <button className="btn-secondary" onClick={handleCloseParrilla}>
            Cerrar Parrilla
          </button>
          <button className="btn-primary" onClick={handleCreate}>
            Nueva Asignación
          </button>
        </div>
      </div>

      <div className="filters-section">
        <div className="search-group">
          <label htmlFor="search">Buscar:</label>
          <input
            type="text"
            id="search"
            placeholder="Buscar por colaborador o KPI..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="period-filter">Período:</label>
          <select
            id="period-filter"
            value={selectedPeriodId || ''}
            onChange={(e) => setSelectedPeriodId(e.target.value ? parseInt(e.target.value) : null)}
            className="filter-select"
          >
            <option value="">Todos</option>
            {periods?.map((period: any) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="collaborator-filter">Colaborador:</label>
          <select
            id="collaborator-filter"
            value={selectedCollaboratorId || ''}
            onChange={(e) => setSelectedCollaboratorId(e.target.value ? parseInt(e.target.value) : null)}
            className="filter-select"
          >
            <option value="">Todos</option>
            {collaboratorsInArea?.map((collaborator: any) => (
              <option key={collaborator.id} value={collaborator.id}>
                {collaborator.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="kpi-filter">KPI:</label>
          <select
            id="kpi-filter"
            value={selectedKPIId || ''}
            onChange={(e) => setSelectedKPIId(e.target.value ? parseInt(e.target.value) : null)}
            className="filter-select"
          >
            <option value="">Todos</option>
            {kpis?.map((kpi: any) => (
              <option key={kpi.id} value={kpi.id}>
                {kpi.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="area-filter">Área:</label>
          <select
            id="area-filter"
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="filter-select"
          >
            <option value="">Todas</option>
            {areas.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="subperiod-filter">Subperiodo:</label>
          <select
            id="subperiod-filter"
            value={selectedSubPeriodId ?? ''}
            onChange={(e) => setSelectedSubPeriodId(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="filter-select"
            disabled={!selectedPeriodId}
          >
            <option value="">Todos</option>
            {subPeriods?.map((sp: any) => (
              <option key={sp.id as number} value={sp.id as number}>
                {sp.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group toggle-group">
          <label>Ver mensuales:</label>
          <input
            type="checkbox"
            checked={showMonthly}
            onChange={(e) => setShowMonthly(e.target.checked)}
            title="Mostrar/ocultar asignaciones por subperiodo"
          />
        </div>

        {(selectedPeriodId ||
          selectedCollaboratorId ||
          selectedKPIId ||
          selectedArea ||
          searchTerm ||
          selectedSubPeriodId !== null ||
          showMonthly) && (
          <button
            className="btn-clear-filters"
            onClick={() => {
              setSelectedPeriodId(null)
              setSelectedCollaboratorId(null)
              setSelectedKPIId(null)
              setSelectedArea('')
              setSearchTerm('')
              setSelectedSubPeriodId(null)
              setShowMonthly(false)
            }}
          >
            Limpiar Filtros
          </button>
        )}
      </div>

      {selectedPeriodId && selectedCollaboratorId && (
        <ConsistencyAlerts collaboratorId={selectedCollaboratorId} periodId={selectedPeriodId} />
      )}

      {selectedPeriodId && selectedCollaboratorId && dueMonthlyAssignments.length > 0 && (
        <div className="info-banner">
          {pendingMonthly.length === 0 ? (
            <div className="banner-ok">
              ✅ Todos los subperiodos con fecha vencida tienen valor cargado.
            </div>
          ) : (
            <div className="banner-warn">
              ⚠️ Faltan {pendingMonthly.length} subperiodos con fecha vencida sin “Actual”.
              <div className="pending-list">
                {pendingMonthly.slice(0, 4).map((p) => (
                  <div key={p.id}>
                    {(p as any).subPeriodName || 'Subperiodo'} · {(p as any).kpiName || `KPI #${p.kpiId}`}
                  </div>
                ))}
                {pendingMonthly.length > 4 && <div>+ {pendingMonthly.length - 4} más</div>}
              </div>
            </div>
          )}
          {Object.values(growthReductionTotals).length > 0 && (
            <div className="banner-totals">
              Totales al día para KPIs de crecimiento/reducción:
              {Object.entries(growthReductionTotals).map(([kpiId, info]) => (
                <div key={kpiId}>
                  {info.name}: <strong>{info.total.toFixed(2)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="table-container">
        {isLoading ? (
          <div className="loading">Cargando asignaciones...</div>
        ) : filteredAssignments && filteredAssignments.length > 0 ? (
          <>
            <div className="results-info">
              Mostrando {filteredAssignments.length} de {assignments?.length || 0} asignaciones
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Colaborador</th>
                  <th>KPI</th>
                  <th>Período</th>
                  <th>Subperiodo</th>
                  <th>Target</th>
                  <th>Actual</th>
                  <th>Peso</th>
                  <th>Variación</th>
                  <th>Estado</th>
                  <th>Curaduría</th>
                  <th>Input</th>
                  <th>Última medición</th>
                  <th>Comentarios</th>
                  <th className="actions-column">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssignments.map((assignment) => {
                  const totalWeight = getTotalWeightByCollaborator(assignment.collaboratorId, assignment.periodId)
                  return (
                    <tr key={assignment.id}>
                      <td>{assignment.id}</td>
                      <td className="name-cell">
                        {collaborators?.find((c: any) => c.id === assignment.collaboratorId)?.name ||
                          `Colaborador #${assignment.collaboratorId}`}
                      </td>
                      <td>{(assignment as any).kpiName || `KPI #${assignment.kpiId}`}</td>
                      <td>{(assignment as any).periodName || `Período #${assignment.periodId}`}</td>
                      <td>
                        {(assignment as any).subPeriodName
                          ? (assignment as any).subPeriodName
                          : (assignment as any).subPeriodId
                          ? `Subperiodo #${(assignment as any).subPeriodId}`
                          : 'Resumen'}
                      </td>
                      <td className="number-cell">
                        {toNumber(assignment.target) !== null ? toNumber(assignment.target) : assignment.target}
                      </td>
                      <td className="number-cell">
                        {toNumber(assignment.actual) !== null && assignment.actual !== undefined
                          ? toNumber(assignment.actual)
                          : '-'}
                      </td>
                      <td className="number-cell">
                        {toNumber(assignment.weight) ?? assignment.weight}%
                        {totalWeight !== 100 && (
                          <span
                            className={`weight-warning ${totalWeight > 100 ? 'error' : 'warning'}`}
                            title={`Suma total: ${totalWeight}%`}
                          >
                            {totalWeight > 100 ? '!' : '!'}
                          </span>
                        )}
                      </td>
                      <td className="number-cell">
                        {(() => {
                          const variationValue = toNumber(assignment.variation)
                          return variationValue !== null ? `${variationValue.toFixed(1)}%` : '-'
                        })()}
                      </td>
                      <td>{getStatusBadge(assignment.status)}</td>
                      <td
                        title={
                          assignment.dataSourceName || assignment.dataSource
                            ? `${assignment.dataSourceName || assignment.dataSource} · ${assignment.sourceConfig || ''}`.trim()
                            : 'Sin fuente configurada'
                        }
                      >
                        {getCurationBadge(assignment)}
                      </td>
                      <td>{getInputBadge(assignment.inputMode)}</td>
                      <td className="measurement-cell">{formatMeasurement(assignment)}</td>
                      <td className="comments-cell">
                        {assignment.comments ? (
                          <span className="comments-text" title={assignment.comments}>
                            {assignment.comments.length > 50
                              ? `${assignment.comments.substring(0, 50)}...`
                              : assignment.comments}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="actions-column">
                        <div className="action-buttons">
                          {assignment.status === 'proposed' && (
                            <>
                              <button
                                className="btn-approve-small"
                                onClick={() =>
                                  setReviewingAssignment({
                                    assignment,
                                    action: 'approve',
                                  })
                                }
                                title="Aprobar asignación"
                              >
                                Aprobar
                              </button>
                              <button
                                className="btn-reject-small"
                                onClick={() =>
                                  setReviewingAssignment({
                                    assignment,
                                    action: 'reject',
                                  })
                                }
                                title="Rechazar asignación"
                              >
                                Rechazar
                              </button>
                            </>
                          )}
                          {canEditAssignment(assignment) && assignment.status !== 'proposed' && (
                            <>
                              <button className="btn-icon" onClick={() => handleEdit(assignment)} title="Editar">
                                Editar
                              </button>
                              <button className="btn-icon" onClick={() => handleDelete(assignment.id)} title="Eliminar">
                                Eliminar
                              </button>
                            </>
                          )}
                          {!canEditAssignment(assignment) && assignment.status !== 'proposed' && (
                            <span className="locked-badge" title="Parrilla cerrada - No se puede editar">
                              Cerrada
                            </span>
                          )}
                          <button
                            className="btn-icon"
                            onClick={() => navigate(`/curaduria?assignmentId=${assignment.id}`)}
                            title="Abrir curaduría"
                          >
                            Curaduría
                          </button>
                          <button
                            className="btn-icon"
                            onClick={() => navigate(`/input-datos?assignmentId=${assignment.id}`)}
                            title="Ver mediciones"
                          >
                            Mediciones
                          </button>
                          <button
                            className="btn-icon"
                            onClick={() => alert('Recalculo solicitado')}
                            title="Forzar recalculo"
                          >
                            Recalcular
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {selectedPeriodId && (
              <div className="weight-summary">
                <h3>Resumen de Ponderaciones por Colaborador</h3>
                <div className="summary-table">
                  {collaborators
                    ?.filter((c: any) =>
                      assignments?.some((a) => a.collaboratorId === c.id && a.periodId === selectedPeriodId)
                    )
                    .map((collaborator: any) => {
                      const totalWeight = getTotalWeightByCollaborator(collaborator.id, selectedPeriodId)
                      return (
                        <div
                          key={collaborator.id}
                          className={`summary-row ${
                            totalWeight === 100 ? 'valid' : totalWeight > 100 ? 'error' : 'warning'
                          }`}
                        >
                          <span className="summary-name">{collaborator.name}</span>
                          <span className="summary-weight">{totalWeight.toFixed(1)}%</span>
                          {totalWeight === 100 && <span className="summary-status">Válido</span>}
                          {totalWeight > 100 && (
                            <span className="summary-status">Excede por {(totalWeight - 100).toFixed(1)}%</span>
                          )}
                          {totalWeight < 100 && (
                            <span className="summary-status">Falta {(100 - totalWeight).toFixed(1)}%</span>
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
            <div className="empty-icon">:/</div>
            <h3>No hay asignaciones registradas</h3>
            <p>Crea una nueva asignación para vincular KPIs con colaboradores</p>
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
            closingCollaboratorId ? collaborators?.find((c: any) => c.id === closingCollaboratorId)?.name : undefined
          }
          periodName={periods?.find((p: any) => p.id === selectedPeriodId)?.name}
          onClose={() => {
            setShowCloseModal(false)
            setClosingCollaboratorId(null)
          }}
        />
      )}

      {showGenerateModal && (
        <GenerateBaseGridModal
          onClose={() => setShowGenerateModal(false)}
          onSuccess={() => {
            setShowGenerateModal(false)
          }}
        />
      )}

      {reviewingAssignment && (
        <ReviewModal
          assignment={reviewingAssignment.assignment as any}
          action={reviewingAssignment.action}
          onClose={() => setReviewingAssignment(null)}
          onSuccess={() => {
            setReviewingAssignment(null)
          }}
        />
      )}
    </div>
  )
}
