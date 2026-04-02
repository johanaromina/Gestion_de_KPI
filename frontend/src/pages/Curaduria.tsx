import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useSearchParams } from 'react-router-dom'
import api from '../services/api'
import './Curaduria.css'

type CurationItem = {
  id?: number | null
  criteriaVersionId?: number | null
  assignmentId: number
  kpiName: string
  collaboratorName: string
  collaboratorArea?: string
  periodName: string
  dataSource?: string
  sourceConfig?: string
  criteriaText?: string
  criteriaStatus?: 'pending' | 'in_review' | 'approved' | 'rejected'
  assignmentCurationStatus?: 'pending' | 'in_review' | 'approved' | 'rejected'
  assignmentDataSource?: string
  assignmentSourceConfig?: string
  kpiCriteria?: string
  comment?: string
  status?: 'pending' | 'in_review' | 'approved' | 'rejected'
  createdAt?: string
  createdByName?: string
}

export default function Curaduria() {
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [periodFilter, setPeriodFilter] = useState<number | ''>('')
  const [kpiFilter, setKpiFilter] = useState<number | ''>('')
  const [collaboratorFilter, setCollaboratorFilter] = useState<number | ''>('')
  const [scopeFilter, setScopeFilter] = useState<number | ''>('')
  const [showCriteriaModal, setShowCriteriaModal] = useState(false)
  const [criteriaAssignmentId, setCriteriaAssignmentId] = useState<number | ''>('')
  const [criteriaDataSource, setCriteriaDataSource] = useState('')
  const [criteriaSourceConfig, setCriteriaSourceConfig] = useState('')
  const [criteriaText, setCriteriaText] = useState('')
  const [criteriaEvidenceUrl, setCriteriaEvidenceUrl] = useState('')
  const [criteriaError, setCriteriaError] = useState('')
  const [reviewModal, setReviewModal] = useState<{ item: CurationItem; action: 'reject' | 'request' } | null>(null)
  const [reviewComment, setReviewComment] = useState('')
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const assignmentId = searchParams.get('assignmentId')

  const { data: periods } = useQuery('periods', async () => {
    const response = await api.get('/periods')
    return response.data
  })

  const { data: kpis } = useQuery('kpis', async () => {
    const response = await api.get('/kpis')
    return response.data
  })

  const { data: collaborators } = useQuery('collaborators', async () => {
    const response = await api.get('/collaborators')
    return response.data
  })

  const { data: assignments } = useQuery('curation-assignments', async () => {
    const response = await api.get('/collaborator-kpis')
    return response.data
  })

  const { data: orgScopes } = useQuery('org-scopes', async () => {
    const response = await api.get('/org-scopes')
    return response.data
  })

  const { data: items, isLoading } = useQuery<CurationItem[]>(
    ['curation-items', statusFilter, periodFilter, kpiFilter, collaboratorFilter, scopeFilter, assignmentId],
    async () => {
      const response = await api.get('/curation/items', {
        params: {
          status: statusFilter === 'all' ? undefined : statusFilter,
          periodId: periodFilter || undefined,
          kpiId: kpiFilter || undefined,
          collaboratorId: collaboratorFilter || undefined,
          orgScopeId: scopeFilter || undefined,
          assignmentId: assignmentId || undefined,
        },
      })
      return response.data
    }
  )

  const reviewMutation = useMutation(
    async ({ id, action, comment }: { id: number; action: 'approve' | 'reject' | 'request'; comment?: string }) => {
      const endpoint =
        action === 'approve'
          ? `/curation/criteria/${id}/approve`
          : action === 'reject'
          ? `/curation/criteria/${id}/reject`
          : `/curation/criteria/${id}/request-changes`
      await api.post(endpoint, { comment })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('curation-items')
      },
    }
  )

  const createCriteria = useMutation(
    async () => {
      if (!criteriaAssignmentId || !criteriaDataSource.trim() || !criteriaText.trim()) {
        setCriteriaError('Completá asignación, fuente y criterio antes de enviar.')
        return
      }
      await api.post(`/curation/assignments/${criteriaAssignmentId}/criteria`, {
        dataSource: criteriaDataSource || undefined,
        sourceConfig: criteriaSourceConfig || undefined,
        criteriaText: criteriaText || undefined,
        evidenceUrl: criteriaEvidenceUrl || undefined,
      })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('curation-items')
        setShowCriteriaModal(false)
        setCriteriaAssignmentId('')
        setCriteriaDataSource('')
        setCriteriaSourceConfig('')
        setCriteriaText('')
        setCriteriaEvidenceUrl('')
        setCriteriaError('')
      },
    }
  )

  const ensureCriteriaId = async (item: CurationItem): Promise<number | null> => {
    const existingId = item.criteriaVersionId || item.id || null
    if (existingId) return existingId

    const dataSource =
      item.assignmentDataSource ||
      item.dataSource ||
      (item.criteriaText || item.kpiCriteria ? 'Manual' : '')
    const criteriaText = item.criteriaText || item.kpiCriteria || ''
    const sourceConfig = item.assignmentSourceConfig || item.sourceConfig || ''

    if (!criteriaText.trim()) {
      setCriteriaAssignmentId(item.assignmentId)
      setCriteriaDataSource(dataSource || '')
      setCriteriaSourceConfig(sourceConfig || '')
      setCriteriaText('')
      setShowCriteriaModal(true)
      return null
    }

    const response = await api.post(`/curation/assignments/${item.assignmentId}/criteria`, {
      dataSource: dataSource || undefined,
      sourceConfig: sourceConfig || undefined,
      criteriaText,
    })
    return response.data?.id || null
  }

  const handleReview = async (
    item: CurationItem,
    action: 'approve' | 'reject' | 'request'
  ) => {
    if (action === 'reject' || action === 'request') {
      setReviewComment('')
      setReviewModal({ item, action })
      return
    }
    const criteriaId = await ensureCriteriaId(item)
    if (!criteriaId) return
    await reviewMutation.mutateAsync({ id: criteriaId, action, comment: undefined })
  }

  const handleReviewConfirm = async () => {
    if (!reviewModal) return
    const { item, action } = reviewModal
    if (action === 'reject' && !reviewComment.trim()) return
    const criteriaId = await ensureCriteriaId(item)
    if (!criteriaId) return
    await reviewMutation.mutateAsync({ id: criteriaId, action, comment: reviewComment.trim() || undefined })
    setReviewModal(null)
    setReviewComment('')
  }

  const filteredItems = useMemo(() => items || [], [items])

  const selectedScopeName = useMemo(() => {
    if (!scopeFilter || !orgScopes) return ''
    const scopeMatch = orgScopes.find((scope: any) => scope.id === scopeFilter)
    return scopeMatch?.name || ''
  }, [scopeFilter, orgScopes])

  // Preseleccionar asignación si llega por query
  useEffect(() => {
    if (assignmentId && !criteriaAssignmentId) {
      setCriteriaAssignmentId(Number(assignmentId))
    }
  }, [assignmentId, criteriaAssignmentId])

  const filteredCollaborators = useMemo(() => {
    if (!collaborators) return []
    if (!scopeFilter) return collaborators
    return collaborators.filter((collab: any) => collab.orgScopeId === scopeFilter)
  }, [collaborators, scopeFilter])

  const filteredKpis = useMemo(() => kpis || [], [kpis])

  const filteredAssignments = useMemo(() => {
    if (!assignments) return []
    return assignments.filter((assignment: any) => {
      if (selectedScopeName && assignment.collaboratorArea !== selectedScopeName) return false
      if (periodFilter && assignment.periodId !== periodFilter) return false
      if (kpiFilter && assignment.kpiId !== kpiFilter) return false
      if (collaboratorFilter && assignment.collaboratorId !== collaboratorFilter) return false
      return true
    })
  }, [assignments, selectedScopeName, periodFilter, kpiFilter, collaboratorFilter])

  const tabOptions = [
    { key: 'pending', label: 'Pendientes' },
    { key: 'in_review', label: 'En revision' },
    { key: 'approved', label: 'Aprobadas' },
    { key: 'rejected', label: 'Rechazadas' },
    { key: 'all', label: 'Cambios recientes' },
  ]

  const formatSource = (item: CurationItem) => {
    const source = item.dataSource || item.assignmentDataSource
    const config = item.sourceConfig || item.assignmentSourceConfig
    if (!source) return 'Sin fuente'
    return config ? `${source} · ${config}` : source
  }

  const formatMeta = (item: CurationItem) => {
    const by = item.createdByName ? ' · Data Curator' : ''
    return item.createdAt ? `${item.createdAt}${by}` : '-'
  }

  const resolveStatus = (item: CurationItem) =>
    item.criteriaStatus || item.assignmentCurationStatus || 'pending'

  const resolveCriteriaText = (item: CurationItem) =>
    item.criteriaText || item.kpiCriteria || ''

  const exportCsv = () => {
    const headers = [
      'ID',
      'Asignacion',
      'Colaborador',
      'Scope',
      'KPI',
      'Periodo',
      'Fuente',
      'Criterio',
      'Estado',
      'Comentario',
      'Creado',
    ]
    const rows = filteredItems.map((item) => [
      item.id,
      item.assignmentId,
      item.collaboratorName,
      item.collaboratorArea || '',
      item.kpiName,
      item.periodName,
      formatSource(item),
      item.criteriaText || '',
      resolveStatus(item),
      item.comment || '',
      formatMeta(item),
    ])

    const escape = (value: any) => {
      const str = String(value ?? '')
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    const parts = [
      'curaduria',
      selectedScopeName ? `scope-${selectedScopeName}` : null,
      periodFilter ? `periodo-${periodFilter}` : null,
      kpiFilter ? `kpi-${kpiFilter}` : null,
      collaboratorFilter ? `colab-${collaboratorFilter}` : null,
      statusFilter ? `status-${statusFilter}` : null,
    ].filter(Boolean)
    link.download = `${parts.join('_')}_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const exportExcel = () => {
    const rows = [
      ['ID', 'Asignacion', 'Colaborador', 'Scope', 'KPI', 'Periodo', 'Fuente', 'Criterio', 'Estado', 'Comentario', 'Creado'],
      ...filteredItems.map((item) => [
        item.id,
        item.assignmentId,
        item.collaboratorName,
        item.collaboratorArea || '',
        item.kpiName,
        item.periodName,
        formatSource(item),
        item.criteriaText || '',
        resolveStatus(item),
        item.comment || '',
        formatMeta(item),
      ]),
    ]

    const xmlEscape = (value: any) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')

    const worksheet = rows
      .map(
        (row) =>
          `<Row>${row
            .map((cell) => `<Cell><Data ss:Type="String">${xmlEscape(cell)}</Data></Cell>`)
            .join('')}</Row>`
      )
      .join('')

    const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Curaduria">
    <Table>${worksheet}</Table>
  </Worksheet>
</Workbook>`

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    const parts = [
      'curaduria',
      selectedScopeName ? `scope-${selectedScopeName}` : null,
      periodFilter ? `periodo-${periodFilter}` : null,
      kpiFilter ? `kpi-${kpiFilter}` : null,
      collaboratorFilter ? `colab-${collaboratorFilter}` : null,
      statusFilter ? `status-${statusFilter}` : null,
    ].filter(Boolean)
    link.download = `${parts.join('_')}_${new Date().toISOString().slice(0, 10)}.xls`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="curaduria-page">
      <div className="page-header">
        <div>
          <h1>Curaduria</h1>
          <p className="subtitle">Validá de dónde viene cada dato y cómo se calcula. Un KPI solo aparece en los dashboards cuando su criterio está aprobado.</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={exportCsv}>Exportar CSV</button>
          <button className="btn-secondary" onClick={exportExcel}>Exportar Excel</button>
          <button
            className="btn-primary"
            onClick={() => {
              if (assignmentId) {
                setCriteriaAssignmentId(Number(assignmentId))
              }
              setShowCriteriaModal(true)
            }}
          >
            Nuevo criterio
          </button>
        </div>
      </div>

      <div className="curaduria-tabs">
        {tabOptions.map((tab) => (
          <button
            key={tab.key}
            className={`tab-button ${statusFilter === tab.key ? 'active' : ''}`}
            onClick={() => setStatusFilter(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="curaduria-toolbar">
        <div className="filter-group">
          <label htmlFor="period-filter">Período:</label>
          <select
            id="period-filter"
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value ? Number(e.target.value) : '')}
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
          <label htmlFor="kpi-filter">KPI:</label>
          <select
            id="kpi-filter"
            value={kpiFilter}
            onChange={(e) => setKpiFilter(e.target.value ? Number(e.target.value) : '')}
            className="filter-select"
          >
            <option value="">Todos</option>
            {filteredKpis?.map((kpi: any, index: number) => (
              <option key={kpi.id || kpi?.name || index} value={kpi.id || ''}>
                {typeof kpi === 'string' ? kpi : kpi.name || kpi.title || `KPI #${kpi.id}`}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="collaborator-filter">Colaborador:</label>
          <select
            id="collaborator-filter"
            value={collaboratorFilter}
            onChange={(e) => setCollaboratorFilter(e.target.value ? Number(e.target.value) : '')}
            className="filter-select"
          >
            <option value="">Todos</option>
            {filteredCollaborators?.map((collaborator: any) => (
              <option key={collaborator.id} value={collaborator.id}>
                {collaborator.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="scope-filter">Scope:</label>
          <select
            id="scope-filter"
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value ? Number(e.target.value) : '')}
            className="filter-select"
          >
            <option value="">Todos</option>
            {orgScopes
              ?.filter((scope: any) => scope.type === 'area' && scope.active !== 0 && scope.active !== false)
              .map((scope: any) => (
                <option key={scope.id || scope.name} value={scope.id}>
                  {scope.name}
                </option>
              ))}
          </select>
        </div>
        <div className="curaduria-hint">
          El KPI visible solo usa datos aprobados.
        </div>
      </div>

      <div className="card">
        <table className="curaduria-table">
          <thead>
            <tr>
              <th>Colaborador</th>
              <th>KPI</th>
              <th>Período</th>
              <th>Fuente</th>
              <th>Criterio</th>
              <th>Estado</th>
              <th>Actualización</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="empty-row">Cargando bandeja...</td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const status = resolveStatus(item)
                const criteriaId = item.criteriaVersionId || item.id || null
                const canReview = !!criteriaId
                return (
                  <tr key={criteriaId || `assignment-${item.assignmentId}`}>
                    <td>{item.collaboratorName}</td>
                    <td>{item.kpiName}</td>
                    <td>{item.periodName}</td>
                    <td title={item.sourceConfig || ''}>{formatSource(item)}</td>
                    <td className="criteria-cell" title={resolveCriteriaText(item) || ''}>
                      {resolveCriteriaText(item) || '-'}
                    </td>
                    <td>
                      <span className={`status-pill ${status === 'approved' ? 'ok' : 'review'}`}>
                        {status === 'pending'
                          ? 'Pendiente'
                          : status === 'in_review'
                          ? 'En revision'
                          : status === 'approved'
                          ? 'Aprobado'
                          : 'Rechazado'}
                      </span>
                      {item.comment ? <div className="comment">{item.comment}</div> : null}
                    </td>
                    <td>{formatMeta(item)}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-approve-small"
                          onClick={() => handleReview(item, 'approve')}
                          disabled={status === 'approved'}
                        >
                          Aprobar
                        </button>
                        <button
                          className="btn-reject-small"
                          onClick={() => handleReview(item, 'reject')}
                          disabled={status === 'rejected'}
                        >
                          Rechazar
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => handleReview(item, 'request')}
                          disabled={status === 'in_review'}
                        >
                          Pedir cambios
                        </button>
                        {!canReview && (
                          <button
                            className="btn-secondary"
                            onClick={() => {
                              setCriteriaAssignmentId(item.assignmentId)
                              setCriteriaDataSource(item.assignmentDataSource || '')
                              setCriteriaSourceConfig(item.assignmentSourceConfig || '')
                              setCriteriaText(item.kpiCriteria || '')
                              setShowCriteriaModal(true)
                            }}
                          >
                            Crear criterio
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-row">
                  No hay items para curar con este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showCriteriaModal && (
        <div className="modal-overlay" onClick={() => setShowCriteriaModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Nuevo criterio</h2>
              <button className="close-button" onClick={() => setShowCriteriaModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="criteria-assignment">Asignación</label>
                <select
                  id="criteria-assignment"
                  value={criteriaAssignmentId}
                  onChange={(e) => setCriteriaAssignmentId(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">Selecciona una asignación</option>
                  {filteredAssignments?.map((assignment: any) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.collaboratorName || `Colaborador #${assignment.collaboratorId}`} ·{' '}
                      {assignment.kpiName || `KPI #${assignment.kpiId}`} ·{' '}
                      {assignment.periodName || `Período #${assignment.periodId}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="criteria-source">Fuente</label>
                  <input
                    id="criteria-source"
                    type="text"
                    value={criteriaDataSource}
                    onChange={(e) => {
                      setCriteriaDataSource(e.target.value)
                      setCriteriaError('')
                    }}
                    placeholder="Jira, Google Sheet, DB, Manual, API..."
                  />
                  <small className="form-hint">De dónde proviene el dato: sistema, herramienta o proceso que lo genera.</small>
                </div>
                <div className="form-group">
                  <label htmlFor="criteria-config">Query / Endpoint (opcional)</label>
                  <input
                    id="criteria-config"
                    type="text"
                    value={criteriaSourceConfig}
                    onChange={(e) => setCriteriaSourceConfig(e.target.value)}
                    placeholder="JQL, SQL, URL o nombre de pestaña"
                  />
                  <small className="form-hint">Consulta o referencia exacta para obtener el dato (ej: filtro de Jira, nombre de hoja).</small>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="criteria-text">Criterio</label>
                <textarea
                  id="criteria-text"
                  value={criteriaText}
                  onChange={(e) => {
                    setCriteriaText(e.target.value)
                    setCriteriaError('')
                  }}
                  rows={4}
                  placeholder="Ej: Suma de tickets cerrados con prioridad Alta en el período, excluyendo los cancelados."
                />
                <small className="form-hint">Explicá cómo se calcula el valor del KPI. Este texto queda registrado para auditoría y debe ser suficientemente claro para que otra persona pueda replicarlo.</small>
              </div>
              <div className="form-group">
                <label htmlFor="criteria-evidence">Evidencia (opcional)</label>
                <input
                  id="criteria-evidence"
                  type="text"
                  value={criteriaEvidenceUrl}
                  onChange={(e) => setCriteriaEvidenceUrl(e.target.value)}
                  placeholder="Link o adjunto"
                />
              </div>
              {criteriaError ? <div className="form-error">{criteriaError}</div> : null}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowCriteriaModal(false)}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={() => createCriteria.mutate()}
                disabled={
                  !criteriaAssignmentId ||
                  !criteriaDataSource.trim() ||
                  !criteriaText.trim() ||
                  createCriteria.isLoading
                }
              >
                {createCriteria.isLoading ? 'Enviando...' : 'Enviar a curaduría'}
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewModal && (
        <div className="modal-overlay" onClick={() => setReviewModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {reviewModal.action === 'reject' ? 'Rechazar criterio' : 'Pedir cambios'}
              </h2>
              <button className="close-button" onClick={() => setReviewModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="review-modal-context">
                <span className="review-modal-kpi">{reviewModal.item.kpiName}</span>
                <span className="review-modal-sep">·</span>
                <span>{reviewModal.item.collaboratorName}</span>
                <span className="review-modal-sep">·</span>
                <span>{reviewModal.item.periodName}</span>
              </div>
              <div className="form-group" style={{ marginTop: 12 }}>
                <label htmlFor="review-comment">
                  {reviewModal.action === 'reject'
                    ? 'Motivo del rechazo (obligatorio)'
                    : 'Comentario para el ajuste (opcional)'}
                </label>
                <textarea
                  id="review-comment"
                  rows={3}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder={
                    reviewModal.action === 'reject'
                      ? 'Ej: La fuente indicada no corresponde al sistema acordado.'
                      : 'Ej: Falta especificar el rango de fechas del cálculo.'
                  }
                  autoFocus
                />
                {reviewModal.action === 'reject' && !reviewComment.trim() && (
                  <small className="form-hint" style={{ color: '#b91c1c' }}>
                    Requerido: explicá el motivo para que el responsable pueda corregirlo.
                  </small>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setReviewModal(null)}>
                Cancelar
              </button>
              <button
                className={reviewModal.action === 'reject' ? 'btn-reject-small' : 'btn-secondary'}
                onClick={handleReviewConfirm}
                disabled={
                  (reviewModal.action === 'reject' && !reviewComment.trim()) ||
                  reviewMutation.isLoading
                }
              >
                {reviewMutation.isLoading
                  ? 'Enviando...'
                  : reviewModal.action === 'reject'
                  ? 'Confirmar rechazo'
                  : 'Enviar solicitud de cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
