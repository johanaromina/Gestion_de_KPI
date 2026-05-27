import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { closeOnOverlayClick, markOverlayPointerDown } from '../utils/modal'
import { detectOutlier } from '../utils/outlierDetection'
import './Curaduria.css'

type CurationStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'changes_requested'

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
  criteriaStatus?: CurationStatus
  assignmentCurationStatus?: CurationStatus
  assignmentDataSource?: string
  assignmentSourceConfig?: string
  kpiCriteria?: string
  comment?: string
  status?: CurationStatus
  createdAt?: string
  createdByName?: string
}

const STATUS_PILL_CLASS: Record<CurationStatus, string> = {
  pending: 'review',
  in_review: 'review',
  approved: 'ok',
  rejected: 'rejected',
  changes_requested: 'changes',
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
  const { t } = useTranslation('curation')

  const getStatusLabel = (status: CurationStatus) => t(`status.${status}`)

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
        setCriteriaError(t('criteria_modal.validation_error'))
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

  // Obtiene el criteriaId existente o crea uno automáticamente si hay texto disponible.
  // No tiene side effects de UI — el caller es responsable de abrir modales si retorna null.
  const tryGetOrCreateCriteriaId = async (item: CurationItem): Promise<number | null> => {
    const existingId = item.criteriaVersionId || item.id || null
    if (existingId) return existingId

    const text = item.criteriaText || item.kpiCriteria || ''
    if (!text.trim()) return null

    const dataSource = item.assignmentDataSource || item.dataSource || 'Manual'
    const sourceConfig = item.assignmentSourceConfig || item.sourceConfig || ''

    const response = await api.post(`/curation/assignments/${item.assignmentId}/criteria`, {
      dataSource: dataSource || undefined,
      sourceConfig: sourceConfig || undefined,
      criteriaText: text,
    })
    return response.data?.id || null
  }

  const openCriteriaModalFor = (item: CurationItem) => {
    setCriteriaAssignmentId(item.assignmentId)
    setCriteriaDataSource(item.assignmentDataSource || '')
    setCriteriaSourceConfig(item.assignmentSourceConfig || '')
    setCriteriaText('')
    setShowCriteriaModal(true)
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
    const criteriaId = await tryGetOrCreateCriteriaId(item)
    if (!criteriaId) {
      openCriteriaModalFor(item)
      return
    }
    await reviewMutation.mutateAsync({ id: criteriaId, action, comment: undefined })
  }

  const handleReviewConfirm = async () => {
    if (!reviewModal) return
    const { item, action } = reviewModal
    if (action === 'reject' && !reviewComment.trim()) return
    const criteriaId = await tryGetOrCreateCriteriaId(item)
    if (!criteriaId) {
      openCriteriaModalFor(item)
      setReviewModal(null)
      return
    }
    await reviewMutation.mutateAsync({ id: criteriaId, action, comment: reviewComment.trim() || undefined })
    setReviewModal(null)
    setReviewComment('')
  }

  /* ── Outlier analysis map: assignmentId → OutlierAnalysis ── */
  const outlierMap = useMemo(() => {
    if (!assignments || !items) return new Map()
    const map = new Map<number, ReturnType<typeof detectOutlier>>()
    for (const item of items) {
      if (item.assignmentId == null) continue
      const currentAssignment = assignments.find((a: any) => a.id === item.assignmentId)
      if (!currentAssignment || currentAssignment.actual == null) continue
      const historicalValues = assignments
        .filter(
          (a: any) =>
            a.collaboratorId === currentAssignment.collaboratorId &&
            a.kpiId === currentAssignment.kpiId &&
            a.periodId !== currentAssignment.periodId &&
            a.actual != null &&
            Number.isFinite(Number(a.actual)) &&
            (a.status === 'approved' || a.status === 'closed')
        )
        .map((a: any) => Number(a.actual))
      map.set(item.assignmentId, detectOutlier(Number(currentAssignment.actual), historicalValues))
    }
    return map
  }, [assignments, items])

  const selectedScopeName = useMemo(() => {
    if (!scopeFilter || !orgScopes) return ''
    const scopeMatch = orgScopes.find((scope: any) => scope.id === scopeFilter)
    return scopeMatch?.name || ''
  }, [scopeFilter, orgScopes])

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
    { key: 'pending', label: t('tabs.pending') },
    { key: 'in_review', label: t('tabs.in_review') },
    { key: 'changes_requested', label: t('tabs.changes_requested') },
    { key: 'approved', label: t('tabs.approved') },
    { key: 'rejected', label: t('tabs.rejected') },
    { key: 'all', label: t('tabs.all') },
  ]

  const formatSource = (item: CurationItem) => {
    const source = item.dataSource || item.assignmentDataSource
    const config = item.sourceConfig || item.assignmentSourceConfig
    if (!source) return t('source_none')
    return config ? `${source} · ${config}` : source
  }

  const formatMeta = (item: CurationItem) => {
    const by = item.createdByName ? ` · ${item.createdByName}` : ''
    return item.createdAt ? `${item.createdAt}${by}` : '-'
  }

  const resolveStatus = (item: CurationItem): CurationStatus =>
    item.criteriaStatus || item.assignmentCurationStatus || 'pending'

  const resolveCriteriaText = (item: CurationItem) =>
    item.criteriaText || item.kpiCriteria || ''

  const displayItems = items || []

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
    const rows = displayItems.map((item) => [
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
      ...displayItems.map((item) => [
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
          <h1>{t('title')}</h1>
          <p className="subtitle">{t('subtitle')}</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={exportCsv}>{t('header.export_csv')}</button>
          <button className="btn-secondary" onClick={exportExcel}>{t('header.export_excel')}</button>
          <button
            className="btn-primary"
            onClick={() => {
              if (assignmentId) {
                setCriteriaAssignmentId(Number(assignmentId))
              }
              setShowCriteriaModal(true)
            }}
          >
            {t('header.new_criteria')}
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
          <label htmlFor="period-filter">{t('filters.period')}</label>
          <select
            id="period-filter"
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value ? Number(e.target.value) : '')}
            className="filter-select"
          >
            <option value="">{t('filters.all')}</option>
            {periods?.map((period: any) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="kpi-filter">{t('filters.kpi')}</label>
          <select
            id="kpi-filter"
            value={kpiFilter}
            onChange={(e) => setKpiFilter(e.target.value ? Number(e.target.value) : '')}
            className="filter-select"
          >
            <option value="">{t('filters.all')}</option>
            {filteredKpis?.map((kpi: any, index: number) => (
              <option key={kpi.id || kpi?.name || index} value={kpi.id || ''}>
                {typeof kpi === 'string' ? kpi : kpi.name || kpi.title || `KPI #${kpi.id}`}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="collaborator-filter">{t('filters.collaborator')}</label>
          <select
            id="collaborator-filter"
            value={collaboratorFilter}
            onChange={(e) => setCollaboratorFilter(e.target.value ? Number(e.target.value) : '')}
            className="filter-select"
          >
            <option value="">{t('filters.all')}</option>
            {filteredCollaborators?.map((collaborator: any) => (
              <option key={collaborator.id} value={collaborator.id}>
                {collaborator.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="scope-filter">{t('filters.scope')}</label>
          <select
            id="scope-filter"
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value ? Number(e.target.value) : '')}
            className="filter-select"
          >
            <option value="">{t('filters.all')}</option>
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
          {t('filters.hint')}
        </div>
      </div>

      <div className="card">
        <table className="curaduria-table">
          <thead>
            <tr>
              <th>{t('table.collaborator')}</th>
              <th>{t('table.kpi')}</th>
              <th>{t('table.period')}</th>
              <th>{t('table.source')}</th>
              <th>{t('table.criteria')}</th>
              <th>{t('table.ai')}</th>
              <th>{t('table.status')}</th>
              <th>{t('table.updated')}</th>
              <th>{t('table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="empty-row">{t('loading')}</td>
              </tr>
            ) : (
              displayItems.map((item) => {
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
                    <td className="outlier-td">
                      {(() => {
                        const o = outlierMap.get(item.assignmentId)
                        if (!o || o.severity === 'none') return <span className="outlier-chip outlier-chip-ok" title={t('outlier.ok_title')}>✓</span>
                        return (
                          <span
                            className={`outlier-chip outlier-chip-${o.severity}`}
                            title={o.message || ''}
                          >
                            {o.severity === 'high' ? t('outlier.unusual') : o.severity === 'medium' ? t('outlier.review') : t('outlier.info')}
                          </span>
                        )
                      })()}
                    </td>
                    <td>
                      <span className={`status-pill ${STATUS_PILL_CLASS[status]}`}>
                        {getStatusLabel(status)}
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
                          {t('actions.approve')}
                        </button>
                        <button
                          className="btn-reject-small"
                          onClick={() => handleReview(item, 'reject')}
                          disabled={status === 'rejected'}
                        >
                          {t('actions.reject')}
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => handleReview(item, 'request')}
                          disabled={status === 'changes_requested' || !canReview}
                        >
                          {t('actions.request_changes')}
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
                            {t('actions.create_criteria')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
            {displayItems.length === 0 && !isLoading && (
              <tr>
                <td colSpan={9} className="empty-row">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showCriteriaModal && (
        <div
          className="modal-overlay"
          onPointerDown={markOverlayPointerDown}
          onClick={(e) => closeOnOverlayClick(e, () => setShowCriteriaModal(false))}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('criteria_modal.title')}</h2>
              <button className="close-button" onClick={() => setShowCriteriaModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="criteria-assignment">{t('criteria_modal.assignment_label')}</label>
                <select
                  id="criteria-assignment"
                  value={criteriaAssignmentId}
                  onChange={(e) => setCriteriaAssignmentId(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">{t('criteria_modal.assignment_placeholder')}</option>
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
                  <label htmlFor="criteria-source">{t('criteria_modal.source_label')}</label>
                  <input
                    id="criteria-source"
                    type="text"
                    value={criteriaDataSource}
                    onChange={(e) => {
                      setCriteriaDataSource(e.target.value)
                      setCriteriaError('')
                    }}
                    placeholder={t('criteria_modal.source_placeholder')}
                  />
                  <small className="form-hint">{t('criteria_modal.source_hint')}</small>
                </div>
                <div className="form-group">
                  <label htmlFor="criteria-config">{t('criteria_modal.config_label')}</label>
                  <input
                    id="criteria-config"
                    type="text"
                    value={criteriaSourceConfig}
                    onChange={(e) => setCriteriaSourceConfig(e.target.value)}
                    placeholder={t('criteria_modal.config_placeholder')}
                  />
                  <small className="form-hint">{t('criteria_modal.config_hint')}</small>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="criteria-text">{t('criteria_modal.criteria_label')}</label>
                <textarea
                  id="criteria-text"
                  value={criteriaText}
                  onChange={(e) => {
                    setCriteriaText(e.target.value)
                    setCriteriaError('')
                  }}
                  rows={4}
                  placeholder={t('criteria_modal.criteria_placeholder')}
                />
                <small className="form-hint">{t('criteria_modal.criteria_hint')}</small>
              </div>
              <div className="form-group">
                <label htmlFor="criteria-evidence">{t('criteria_modal.evidence_label')}</label>
                <input
                  id="criteria-evidence"
                  type="text"
                  value={criteriaEvidenceUrl}
                  onChange={(e) => setCriteriaEvidenceUrl(e.target.value)}
                  placeholder={t('criteria_modal.evidence_placeholder')}
                />
              </div>
              {criteriaError ? <div className="form-error">{criteriaError}</div> : null}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowCriteriaModal(false)}>
                {t('criteria_modal.cancel')}
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
                {createCriteria.isLoading ? t('criteria_modal.submitting') : t('criteria_modal.submit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewModal && (
        <div
          className="modal-overlay"
          onPointerDown={markOverlayPointerDown}
          onClick={(e) => closeOnOverlayClick(e, () => setReviewModal(null))}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {reviewModal.action === 'reject' ? t('review_modal.title_reject') : t('review_modal.title_request')}
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
                    ? t('review_modal.comment_label_reject')
                    : t('review_modal.comment_label_request')}
                </label>
                <textarea
                  id="review-comment"
                  rows={3}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder={
                    reviewModal.action === 'reject'
                      ? t('review_modal.comment_placeholder_reject')
                      : t('review_modal.comment_placeholder_request')
                  }
                  autoFocus
                />
                {reviewModal.action === 'reject' && !reviewComment.trim() && (
                  <small className="form-hint" style={{ color: '#b91c1c' }}>
                    {t('review_modal.comment_required_hint')}
                  </small>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setReviewModal(null)}>
                {t('review_modal.cancel')}
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
                  ? t('review_modal.submitting')
                  : reviewModal.action === 'reject'
                  ? t('review_modal.confirm_reject')
                  : t('review_modal.confirm_request')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
