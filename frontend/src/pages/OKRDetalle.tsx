import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api, { buildApiUrl } from '../services/api'
import { useDialog } from '../components/Dialog'
import { resolveDirection, calculateVariationPercent } from '../utils/kpi'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import './OKRDetalle.css'

type KRStatus = 'not_started' | 'on_track' | 'at_risk' | 'behind' | 'completed'

interface KpiLink {
  type: 'collaborator' | 'scope'
  id: number
  label: string
  weight?: number
  kpiName?: string | null
  actual?: number | null
  target?: number | null
  sourceName?: string | null
  kpiWeight?: number | null
}

interface KREditDraft {
  title: string
  description: string
  krType: 'simple' | 'kpi_linked'
  startValue: string
  targetValue: string
  unit: string
  kpiLinks: KpiLink[]
  weight: string
}

interface DataSource {
  krId: number
  krTitle: string
  krType: 'simple' | 'kpi_linked'
  krStatus: KRStatus
  sourceType: 'scope_kpi' | 'collaborator_kpi' | null
  kpiName: string | null
  kpiDirection?: string
  kpiType?: string
  actual: number | null
  target: number | null
  sources: {
    sourceType: 'collaborator' | 'scope'
    sourceName: string
    actual: number | null
    target: number | null
    variation?: number | null
    kpiName: string
    kpiDirection?: string
    kpiType?: string
    sourceStatus: string | null
  }[]
}

interface KeyResult {
  id: number
  title: string
  krType: 'simple' | 'kpi_linked'
  startValue?: number | null
  targetValue?: number | null
  currentValue?: number | null
  unit?: string | null
  kpiName?: string | null
  kpiActual?: number | null
  kpiTarget?: number | null
  weight: number
  status: KRStatus
  progressPercent: number
  ownerName?: string
  linkedKpis?: KpiLink[]
}

interface CheckIn {
  id: number
  value: number
  note?: string | null
  authorName?: string
  createdAt: string
}

interface Objective {
  id: number
  title: string
  description?: string | null
  progress: number
  status: 'draft' | 'active' | 'closed'
  ownerName?: string
  orgScopeName?: string
  periodName?: string
  keyResults?: KeyResult[]
}

const STATUS_COLOR: Record<KRStatus, string> = {
  not_started: '#9ca3af',
  on_track: '#16a34a',
  at_risk: '#d97706',
  behind: '#dc2626',
  completed: '#2563eb',
}

const progressColor = (p: number) => {
  if (p >= 70) return '#16a34a'
  if (p >= 40) return '#d97706'
  return '#dc2626'
}

const KR_STATUSES: KRStatus[] = ['not_started', 'on_track', 'at_risk', 'behind', 'completed']

export default function OKRDetalle() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation('okr')
  const locale = i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'es-AR'
  const queryClient = useQueryClient()
  const dialog = useDialog()

  const [selectedKR, setSelectedKR] = useState<number | null>(null)
  const [checkInValue, setCheckInValue] = useState('')
  const [checkInNote, setCheckInNote] = useState('')
  const [newKRStatus, setNewKRStatus] = useState<Record<number, KRStatus>>({})
  const [treeNodeId, setTreeNodeId] = useState('')
  const [treeSearch, setTreeSearch] = useState('')
  const [treeDropdownOpen, setTreeDropdownOpen] = useState(false)
  const [expandedSources, setExpandedSources] = useState<Set<number>>(new Set())
  const [editingKrId, setEditingKrId] = useState<number | null>(null)
  const [krEditDraft, setKrEditDraft] = useState<KREditDraft | null>(null)
  const [krEditError, setKrEditError] = useState<string | null>(null)

  const { data: objective, isLoading } = useQuery<Objective>(
    ['okr-objective', id],
    () => api.get(`/okr/${id}`).then((r) => r.data),
    { enabled: !!id }
  )

  const { data: dataSources = [] } = useQuery<DataSource[]>(
    ['okr-data-sources', id],
    () => api.get(`/okr/${id}/data-sources`).then((r) => r.data),
    { enabled: !!id }
  )

  const dataSourceByKr = new Map(dataSources.map((ds) => [ds.krId, ds]))

  const toggleSources = (krId: number) =>
    setExpandedSources((prev) => {
      const next = new Set(prev)
      next.has(krId) ? next.delete(krId) : next.add(krId)
      return next
    })

  const { data: checkIns = [] } = useQuery<CheckIn[]>(
    ['okr-check-ins', selectedKR],
    () => api.get(`/okr/key-results/${selectedKR}/check-ins`).then((r) => r.data),
    { enabled: !!selectedKR }
  )

  const checkInMutation = useMutation(
    (data: { keyResultId: number; value: number; note?: string }) =>
      api.post(`/okr/key-results/${data.keyResultId}/check-ins`, {
        value: data.value,
        note: data.note,
      }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['okr-check-ins', selectedKR])
        queryClient.invalidateQueries(['okr-objective', id])
        setCheckInValue('')
        setCheckInNote('')
      },
    }
  )

  const updateKRStatusMutation = useMutation(
    ({ krId, status }: { krId: number; status: KRStatus }) =>
      api.put(`/okr/${id}/key-results/${krId}`, { status }),
    {
      onSuccess: () => queryClient.invalidateQueries(['okr-objective', id]),
    }
  )

  const closeObjectiveMutation = useMutation(
    () => api.put(`/okr/${id}`, { status: 'closed' }),
    { onSuccess: () => queryClient.invalidateQueries(['okr-objective', id]) }
  )

  const { data: treeLinks = [] } = useQuery<{ objectiveTreeId: number; objectiveTreeName: string; level: string }[]>(
    ['okr-tree-links', id],
    () => api.get(`/okr/${id}/tree-links`).then((r) => r.data),
    { enabled: !!id }
  )

  const { data: allTreeNodes = [] } = useQuery<{ id: number; name: string; level: string }[]>(
    'objective-trees-flat',
    () => api.get('/objective-trees').then((r) => r.data.map((n: any) => ({ id: n.id, name: n.name, level: n.level }))),
    { staleTime: 60000 }
  )

  const linkTreeMutation = useMutation(
    (objectiveTreeId: number) => api.post(`/okr/${id}/tree-links`, { objectiveTreeId }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['okr-tree-links', id])
        setTreeNodeId('')
      },
    }
  )

  const unlinkTreeMutation = useMutation(
    (treeId: number) => api.delete(`/okr/${id}/tree-links/${treeId}`),
    { onSuccess: () => queryClient.invalidateQueries(['okr-tree-links', id]) }
  )

  const linkedTreeIds = new Set(treeLinks.map((l) => l.objectiveTreeId))
  const availableNodes = allTreeNodes.filter((n) => !linkedTreeIds.has(n.id))

  const periodId = (objective as any)?.periodId
  const { data: collabKpis = [] } = useQuery<{ id: number; kpiName: string; collaboratorName: string; target: number }[]>(
    ['collab-kpis-det', periodId],
    () => api.get('/collaborator-kpis', { params: { periodId } }).then((r) =>
      r.data.map((ck: any) => ({ id: ck.id, kpiName: ck.kpiName ?? `KPI #${ck.kpiId}`, collaboratorName: ck.collaboratorName ?? '', target: ck.target }))
    ),
    { enabled: !!periodId && editingKrId !== null }
  )
  const { data: scopeKpis = [] } = useQuery<{ id: number; name: string; orgScopeName: string; target: number }[]>(
    ['scope-kpis-det', periodId],
    () => api.get('/scope-kpis', { params: { periodId } }).then((r) =>
      r.data.map((sk: any) => ({ id: sk.id, name: sk.name, orgScopeName: sk.orgScopeName ?? '', target: sk.target }))
    ),
    { enabled: !!periodId && editingKrId !== null }
  )

  const updateKrMutation = useMutation(
    ({ krId, data }: { krId: number; data: object }) =>
      api.put(`/okr/${id}/key-results/${krId}`, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['okr-objective', id])
        setEditingKrId(null)
        setKrEditDraft(null)
        setKrEditError(null)
      },
      onError: (err: any) => {
        const msg = resolveApiErrorMessage(err, t, {
          fallbackKey: 'detail.kr_edit.save_error_fallback',
        })
        setKrEditError(msg)
      },
    }
  )

  const openKrEdit = (kr: KeyResult) => {
    setEditingKrId(kr.id)
    setKrEditDraft({
      title: kr.title,
      description: '',
      krType: kr.krType,
      startValue: String(kr.startValue ?? '0'),
      targetValue: String(kr.targetValue ?? ''),
      unit: kr.unit ?? '',
      kpiLinks: (kr.linkedKpis ?? []).map((lk: any) => ({
        type: lk.type as 'collaborator' | 'scope',
        id: lk.collaboratorKpiId ?? lk.scopeKpiId ?? lk.id,
        label: lk.kpiName
          ? `${lk.kpiName}${lk.sourceName ? ` — ${lk.sourceName}` : ''}`
          : lk.sourceName
            ? `KPI — ${lk.sourceName}`
            : `KPI #${lk.collaboratorKpiId ?? lk.scopeKpiId ?? lk.id}`,
        weight: Math.round((lk.kpiWeight ?? 1) * 100),
      })),
      weight: String(Math.round((kr.weight ?? 1) * 100)),
    })
  }

  const addKrKpiLink = (link: KpiLink) => {
    setKrEditDraft((prev) => {
      if (!prev) return prev
      if (prev.kpiLinks.some((l) => l.type === link.type && l.id === link.id)) return prev
      return { ...prev, kpiLinks: [...prev.kpiLinks, link] }
    })
  }

  const removeKrKpiLink = (type: string, linkId: number) => {
    setKrEditDraft((prev) =>
      prev ? { ...prev, kpiLinks: prev.kpiLinks.filter((l) => !(l.type === type && l.id === linkId)) } : prev
    )
  }

  const updateKrKpiLinkWeight = (type: string, linkId: number, weight: number) => {
    setKrEditDraft((prev) =>
      prev ? { ...prev, kpiLinks: prev.kpiLinks.map((l) => l.type === type && l.id === linkId ? { ...l, weight } : l) } : prev
    )
  }

  const getKrWeightWarning = (krId: number, nextWeight: number) => {
    if (!objective?.keyResults || objective.keyResults.length <= 1) return null
    const othersWeight = objective.keyResults
      .filter((kr: any) => kr.id !== krId)
      .reduce((sum: number, kr: any) => sum + Math.round((kr.weight ?? 1) * 100), 0)
    const totalKrWeight = othersWeight + nextWeight
    if (Math.abs(totalKrWeight - 100) <= 0.5) return null
    return t('detail.kr_edit.errors.kr_weight_warning', { total: totalKrWeight.toFixed(0) })
  }

  const saveKrEdit = async (krId: number) => {
    if (!krEditDraft) return
    const w = Number(krEditDraft.weight)
    if (w <= 0 || w > 100) {
      setKrEditError(t('detail.kr_edit.errors.weight_range'))
      return
    }
    if (krEditDraft.krType === 'kpi_linked' && krEditDraft.kpiLinks.length > 1) {
      const badLink = krEditDraft.kpiLinks.find((lk) => { const lw = Number(lk.weight ?? 100); return lw <= 0 || lw > 100 })
      if (badLink) {
        setKrEditError(t('detail.kr_edit.errors.kpi_weight_range'))
        return
      }
      const totalKpiWeight = krEditDraft.kpiLinks.reduce((sum, lk) => sum + Number(lk.weight ?? 100), 0)
      if (Math.abs(totalKpiWeight - 100) > 0.5) {
        setKrEditError(t('detail.kr_edit.errors.kpi_weight_sum', { total: totalKpiWeight }))
        return
      }
    }
    const krWeightWarning = getKrWeightWarning(krId, w)
    if (krWeightWarning) {
      await dialog.alert(krWeightWarning, { title: t('detail.kr_edit.weight_warning_title'), variant: 'warning' })
    }
    setKrEditError(null)
    updateKrMutation.mutate({
      krId,
      data: {
        title: krEditDraft.title,
        krType: krEditDraft.krType,
        startValue: krEditDraft.krType === 'simple' ? Number(krEditDraft.startValue) : null,
        targetValue: krEditDraft.krType === 'simple' ? Number(krEditDraft.targetValue) : null,
        unit: krEditDraft.unit || null,
        kpiLinks: krEditDraft.krType === 'kpi_linked'
          ? krEditDraft.kpiLinks.map((lk) => ({ ...lk, weight: (Number(lk.weight ?? 100)) / 100 }))
          : [],
        weight: w / 100,
      },
    })
  }

  if (isLoading) return <div className="okr-detalle-loading">{t('detail.loading')}</div>
  if (!objective) return <div className="okr-detalle-loading">{t('detail.not_found')}</div>

  const handleCheckIn = () => {
    if (!selectedKR || !checkInValue) return
    checkInMutation.mutate({ keyResultId: selectedKR, value: Number(checkInValue), note: checkInNote || undefined })
  }

  return (
    <div className="okr-detalle">
      <div className="okr-detalle-header">
        <button className="btn-back" onClick={() => navigate('/okr')}>{t('detail.back')}</button>
        <div className="okr-detalle-actions">
          <button
            className="btn-export btn-export-pdf"
            title={t('detail.export.pdf_title')}
            onClick={() => window.open(
              buildApiUrl(`/export/okr/${id}/pdf`),
              '_blank'
            )}
          >
            📄 PDF
          </button>
          <button
            className="btn-export btn-export-excel"
            title={t('detail.export.excel_title')}
            onClick={() => window.open(
              buildApiUrl(`/export/okr/${id}/excel`),
              '_blank'
            )}
          >
            📊 Excel
          </button>
          {objective.status !== 'closed' && (
            <>
              <button
                className="btn-secondary"
                onClick={() => navigate(`/okr/${id}/editar`)}
              >
                {t('detail.actions.edit')}
              </button>
              <button
                className="btn-secondary"
                onClick={() => { if (window.confirm(t('detail.actions.close_confirm'))) closeObjectiveMutation.mutate() }}
              >
                {t('detail.actions.close')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Objetivo */}
      <div className="okr-detalle-card">
        <div className="okr-detalle-meta">
          {objective.orgScopeName && <span className="okr-badge okr-badge--scope">{objective.orgScopeName}</span>}
          {objective.periodName && <span className="okr-badge okr-badge--period">{objective.periodName}</span>}
          <span className={`okr-status-pill okr-status-pill--${objective.status}`}>
            {t(`status.${objective.status}`)}
          </span>
        </div>

        <h2 className="okr-detalle-title">{objective.title}</h2>
        {objective.description && <p className="okr-detalle-desc">{objective.description}</p>}
        {objective.ownerName && <p className="okr-detalle-owner">{t('card.owner', { name: objective.ownerName })}</p>}

        <div className="okr-detalle-progress">
          <div className="okr-progress-label">
            <span>{t('detail.progress_label')}</span>
            <strong style={{ color: progressColor(objective.progress) }}>{Math.round(objective.progress)}%</strong>
          </div>
          <div className="okr-progress-track">
            <div
              className="okr-progress-fill"
              style={{ width: `${objective.progress}%`, background: progressColor(objective.progress) }}
            />
          </div>
        </div>
      </div>

      {/* Key Results */}
      <div className="okr-kr-section">
        <h3>{t('detail.kr_section_title')}</h3>

        {(!objective.keyResults || objective.keyResults.length === 0) && (
          <p className="okr-empty-inline">{t('detail.kr_empty')}</p>
        )}

        {objective.keyResults?.map((kr) => (
          <div
            key={kr.id}
            className={`okr-kr-card ${selectedKR === kr.id ? 'okr-kr-card--selected' : ''}`}
          >
            <div className="okr-kr-card-header">
              <div>
                <span className="okr-kr-card-title">{kr.title}</span>
                {kr.ownerName && <span className="okr-kr-owner"> — {kr.ownerName}</span>}
              </div>
              <div className="okr-kr-card-right">
                {objective.status !== 'closed' && (
                  <button
                    className="btn-checkin"
                    onClick={() => editingKrId === kr.id ? (setEditingKrId(null), setKrEditDraft(null)) : openKrEdit(kr)}
                  >
                    {editingKrId === kr.id ? t('detail.kr_actions.cancel_edit') : t('detail.kr_actions.edit')}
                  </button>
                )}
                <select
                  className="kr-status-select"
                  value={newKRStatus[kr.id] ?? kr.status}
                  style={{ color: STATUS_COLOR[newKRStatus[kr.id] ?? kr.status] }}
                  onChange={(e) => {
                    const s = e.target.value as KRStatus
                    setNewKRStatus((prev) => ({ ...prev, [kr.id]: s }))
                    updateKRStatusMutation.mutate({ krId: kr.id, status: s })
                  }}
                >
                  {KR_STATUSES.map((s) => (
                    <option key={s} value={s}>{t(`status.${s}`)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="okr-kr-progress-section">
              <div className="okr-progress-track">
                <div
                  className="okr-progress-fill"
                  style={{
                    width: `${kr.progressPercent}%`,
                    background: STATUS_COLOR[newKRStatus[kr.id] ?? kr.status],
                  }}
                />
              </div>
              <span className="okr-kr-pct">{Math.round(kr.progressPercent)}%</span>
            </div>

            <div className="okr-kr-values-row">
              {kr.krType === 'kpi_linked' ? (
                <div className="okr-kr-linked-kpis">
                  {(kr.linkedKpis && kr.linkedKpis.length > 0)
                    ? (kr.linkedKpis as any[]).map((lk: any, i: number) => (
                        <span key={i} className="okr-kr-linked-badge">
                          {lk.kpiName ?? 'KPI'}
                          {lk.sourceName ? ` — ${lk.sourceName}` : ''}
                          {': '}
                          {lk.actual ?? '—'} / {lk.target ?? '—'}
                          {(kr.linkedKpis as any[]).length > 1 && lk.kpiWeight
                            ? ` (${Math.round(lk.kpiWeight * 100)}%)`
                            : ''}
                        </span>
                      ))
                    : (
                        <span className="okr-kr-linked-badge">
                          {t('detail.kpi_values', { name: kr.kpiName ?? '—', actual: kr.kpiActual ?? '—', target: kr.kpiTarget ?? '—' })}
                        </span>
                      )
                  }
                </div>
              ) : (
                <span className="okr-kr-value-text">
                  {kr.currentValue ?? kr.startValue ?? 0} / {kr.targetValue ?? 0}{kr.unit ? ` ${kr.unit}` : ''}
                </span>
              )}

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {kr.krType === 'kpi_linked' && dataSourceByKr.get(kr.id)?.sources?.length ? (
                  <button
                    className="btn-checkin"
                    onClick={() => toggleSources(kr.id)}
                  >
                    {expandedSources.has(kr.id) ? t('detail.kr_actions.hide_sources') : t('detail.kr_actions.show_sources', { count: dataSourceByKr.get(kr.id)!.sources.length })}
                  </button>
                ) : null}
                {kr.krType === 'kpi_linked' && (
                  <span className="okr-kr-auto-badge" title={t('detail.kr_badges.automatic_title')}>
                    {t('detail.kr_badges.automatic')}
                  </span>
                )}
                {kr.krType === 'simple' && (
                  <button
                    className="btn-checkin"
                    onClick={() => setSelectedKR(selectedKR === kr.id ? null : kr.id)}
                  >
                    {selectedKR === kr.id ? t('detail.kr_actions.checkin_close') : t('detail.kr_actions.checkin')}
                  </button>
                )}
              </div>
            </div>

            {/* Panel de trazabilidad — fuentes de datos reales */}
            {kr.krType === 'kpi_linked' && expandedSources.has(kr.id) && (() => {
              const ds = dataSourceByKr.get(kr.id)
              if (!ds || ds.sources.length === 0) return null
              return (
                <div className="datasource-panel">
                  <p className="datasource-panel-title">
                    {t('detail.datasource.title')}
                  </p>
                  <div className="datasource-list">
                    {ds.sources.map((src, i) => {
                      const direction = resolveDirection(undefined, src.kpiDirection, src.kpiType)
                      const variation = src.variation ?? calculateVariationPercent(direction, src.target ?? 0, src.actual ?? null)
                      const pct = Math.min(100, Math.max(0, Math.round(variation ?? 0)))
                      const color = pct >= 70 ? '#16a34a' : pct >= 40 ? '#d97706' : '#dc2626'
                      return (
                        <div key={i} className="datasource-row">
                          <div className="datasource-row-top">
                            <span className="datasource-name">
                              <span className={`datasource-type-badge datasource-type-badge--${src.sourceType}`}>
                                {src.sourceType === 'collaborator' ? t('detail.datasource.collaborator') : t('detail.datasource.area')}
                              </span>
                              {src.sourceName}
                            </span>
                            <span className="datasource-pct" style={{ color }}>{pct}%</span>
                          </div>
                          <div className="datasource-bar-track">
                            <div className="datasource-bar-fill" style={{ width: `${pct}%`, background: color }} />
                          </div>
                          <span className="datasource-values">
                            {src.actual ?? '—'} / {src.target ?? '—'}
                            {src.kpiName ? ` · ${src.kpiName}` : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Panel edición inline de KR */}
            {editingKrId === kr.id && krEditDraft && (
              <div className="kr-edit-panel">
                <div className="kr-edit-panel-title">{t('detail.kr_edit.title')}</div>
                <div className="kr-edit-body">

                  <div className="kr-edit-field kr-edit-field--full">
                    <label>{t('detail.kr_edit.field_title')}</label>
                    <input
                      type="text"
                      value={krEditDraft.title}
                      onChange={(e) => setKrEditDraft((p) => p ? { ...p, title: e.target.value } : p)}
                    />
                  </div>

                  <div className="kr-edit-field kr-edit-field--full">
                    <label>{t('detail.kr_edit.field_type')}</label>
                    <div className="kr-type-toggle">
                      <button
                        type="button"
                        className={`kr-type-btn ${krEditDraft.krType === 'simple' ? 'active' : ''}`}
                        onClick={() => setKrEditDraft((p) => p ? { ...p, krType: 'simple' } : p)}
                      >
                        {t('detail.kr_edit.type_simple')}
                      </button>
                      <button
                        type="button"
                        className={`kr-type-btn ${krEditDraft.krType === 'kpi_linked' ? 'active' : ''}`}
                        onClick={() => setKrEditDraft((p) => p ? { ...p, krType: 'kpi_linked' } : p)}
                      >
                        {t('detail.kr_edit.type_kpi_linked')}
                      </button>
                    </div>
                  </div>

                  {krEditDraft.krType === 'simple' && (
                    <>
                      <div className="kr-edit-field">
                        <label>{t('detail.kr_edit.field_start_value')}</label>
                        <input type="number" value={krEditDraft.startValue} onChange={(e) => setKrEditDraft((p) => p ? { ...p, startValue: e.target.value } : p)} />
                      </div>
                      <div className="kr-edit-field">
                        <label>{t('detail.kr_edit.field_target')}</label>
                        <input type="number" value={krEditDraft.targetValue} onChange={(e) => setKrEditDraft((p) => p ? { ...p, targetValue: e.target.value } : p)} />
                      </div>
                      <div className="kr-edit-field">
                        <label>{t('detail.kr_edit.field_unit')}</label>
                        <input type="text" value={krEditDraft.unit} placeholder={t('detail.kr_edit.unit_placeholder')} onChange={(e) => setKrEditDraft((p) => p ? { ...p, unit: e.target.value } : p)} />
                      </div>
                    </>
                  )}

                  {krEditDraft.krType === 'kpi_linked' && (
                    <div className="kr-edit-field kr-edit-field--full">
                      <label>{t('detail.kr_edit.field_kpi_links')}</label>
                      {krEditDraft.kpiLinks.length > 0 && (
                        <div className="kpi-chips">
                          {krEditDraft.kpiLinks.map((lk) => (
                            <span key={`${lk.type}-${lk.id}`} className={`kpi-chip kpi-chip--${lk.type}`}>
                              {lk.label}
                              {krEditDraft.kpiLinks.length > 1 && (
                                <span className="kpi-chip-weight-wrap">
                                  <span className="kpi-chip-weight-label">{t('detail.kr_edit.chip_weight_label')}</span>
                                  <input
                                    type="number"
                                    className="kpi-chip-weight"
                                    min="1"
                                    max="100"
                                    step="1"
                                    value={lk.weight ?? 100}
                                    onChange={(e) => updateKrKpiLinkWeight(lk.type, lk.id, Number(e.target.value))}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </span>
                              )}
                              <button type="button" className="kpi-chip-remove" onClick={() => removeKrKpiLink(lk.type, lk.id)}>×</button>
                            </span>
                          ))}
                        </div>
                      )}
                      <select
                        value=""
                        onChange={(e) => {
                          const [type, rawId] = e.target.value.split(':')
                          const lid = Number(rawId)
                          if (!type || !lid) return
                          if (type === 'collaborator') {
                            const ck = collabKpis.find((c) => c.id === lid)
                            if (ck) addKrKpiLink({ type: 'collaborator', id: lid, label: `${ck.kpiName} — ${ck.collaboratorName}` })
                          } else {
                            const sk = scopeKpis.find((s) => s.id === lid)
                            if (sk) addKrKpiLink({ type: 'scope', id: lid, label: `${sk.name} — ${sk.orgScopeName}` })
                          }
                        }}
                      >
                        <option value="">{t('detail.kr_edit.add_kpi')}</option>
                        {collabKpis.filter((ck) => !krEditDraft.kpiLinks.some((l) => l.type === 'collaborator' && l.id === ck.id)).map((ck) => (
                          <option key={`collaborator:${ck.id}`} value={`collaborator:${ck.id}`}>
                            👤 {ck.kpiName} — {ck.collaboratorName} ({t('detail.kr_edit.field_target')}: {ck.target})
                          </option>
                        ))}
                        {scopeKpis.filter((sk) => !krEditDraft.kpiLinks.some((l) => l.type === 'scope' && l.id === sk.id)).map((sk) => (
                          <option key={`scope:${sk.id}`} value={`scope:${sk.id}`}>
                            🏢 {sk.name} — {sk.orgScopeName} ({t('detail.kr_edit.field_target')}: {sk.target})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="kr-edit-field">
                    <label title={t('detail.kr_edit.field_kr_weight_tooltip')}>
                      {t('detail.kr_edit.field_kr_weight')}
                    </label>
                    <input
                      type="number" min="1" max="100" step="1"
                      value={krEditDraft.weight}
                      onChange={(e) => setKrEditDraft((p) => p ? { ...p, weight: e.target.value } : p)}
                    />
                  </div>

                  {krEditError && <div className="kr-edit-error">{krEditError}</div>}
                  <div className="kr-edit-actions">
                    <button
                      className="btn-primary"
                      onClick={() => saveKrEdit(kr.id)}
                      disabled={!krEditDraft.title.trim() || updateKrMutation.isLoading}
                    >
                      {updateKrMutation.isLoading ? t('detail.kr_edit.saving') : t('detail.kr_edit.save')}
                    </button>
                    <button className="btn-secondary" onClick={() => { setEditingKrId(null); setKrEditDraft(null); setKrEditError(null) }}>
                      {t('detail.kr_edit.cancel')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Panel check-in */}
            {selectedKR === kr.id && kr.krType === 'simple' && (
              <div className="checkin-panel">
                <div className="checkin-panel-header">
                  <span className="checkin-panel-title">{t('detail.checkin.title')}</span>
                  <span className="checkin-panel-hint">
                    {t('detail.checkin.hint')}
                  </span>
                </div>
                <div className="checkin-form">
                  <div className="checkin-field">
                    <label>{kr.unit ? t('detail.checkin.field_current_unit', { unit: kr.unit }) : t('detail.checkin.field_current')}</label>
                    <input
                      type="number"
                      placeholder={t('detail.checkin.target_placeholder', { target: kr.targetValue ?? '—' })}
                      value={checkInValue}
                      onChange={(e) => setCheckInValue(e.target.value)}
                    />
                  </div>
                  <div className="checkin-field checkin-field--wide">
                    <label>{t('detail.checkin.field_note')} <span className="field-optional">{t('detail.checkin.optional')}</span></label>
                    <input
                      type="text"
                      placeholder={t('detail.checkin.note_placeholder')}
                      value={checkInNote}
                      onChange={(e) => setCheckInNote(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn-primary"
                    onClick={handleCheckIn}
                    disabled={!checkInValue || checkInMutation.isLoading}
                  >
                    {checkInMutation.isLoading ? t('detail.checkin.saving') : t('detail.checkin.save')}
                  </button>
                </div>

                {checkIns.length > 0 && (
                  <div className="checkin-history">
                    <p className="checkin-history-title">{t('detail.checkin.history_title')}</p>
                    {checkIns.map((ci) => (
                      <div key={ci.id} className="checkin-row">
                        <span className="checkin-value">{ci.value}{kr.unit ? ` ${kr.unit}` : ''}</span>
                        {ci.note && <span className="checkin-note">{ci.note}</span>}
                        <span className="checkin-meta">
                          {ci.authorName} · {new Date(ci.createdAt).toLocaleDateString(locale)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Vinculos con Arbol de Objetivos */}
      <div className="okr-tree-links-section">
        <div className="okr-tree-links-header">
          <h3>{t('detail.tree_links.title')}</h3>
          <small className="okr-tree-hint">
            {t('detail.tree_links.hint')}
          </small>
        </div>

        {treeLinks.length === 0 && (
          <p className="okr-empty-inline">{t('detail.tree_links.empty')}</p>
        )}

        {treeLinks.length > 0 && (
          <div className="okr-tree-links-list">
            {treeLinks.map((link) => (
              <div key={link.objectiveTreeId} className="okr-tree-link-row">
                <div>
                  <span className="okr-tree-link-name">{link.objectiveTreeName}</span>
                  <span className="okr-tree-link-level">{link.level}</span>
                </div>
                <button
                  className="btn-remove-kr"
                  onClick={() => unlinkTreeMutation.mutate(link.objectiveTreeId)}
                >
                  {t('detail.tree_links.remove')}
                </button>
              </div>
            ))}
          </div>
        )}

        {objective?.status !== 'closed' && availableNodes.length > 0 && (
          <div className="okr-tree-link-add">
            <div className="tree-search-wrapper">
              <input
                className="tree-search-input"
                type="text"
                placeholder={t('detail.tree_links.search_placeholder')}
                value={treeSearch}
                onChange={(e) => { setTreeSearch(e.target.value); setTreeDropdownOpen(true); setTreeNodeId('') }}
                onFocus={() => setTreeDropdownOpen(true)}
                onBlur={() => setTimeout(() => setTreeDropdownOpen(false), 150)}
              />
              {treeDropdownOpen && treeSearch && (
                <div className="tree-search-dropdown">
                  {availableNodes
                    .filter((n) => n.name.toLowerCase().includes(treeSearch.toLowerCase()))
                    .slice(0, 15)
                    .map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        className="tree-search-option"
                        onMouseDown={() => {
                          setTreeNodeId(String(n.id))
                          setTreeSearch(n.name)
                          setTreeDropdownOpen(false)
                        }}
                      >
                        <span className="tree-option-name">{n.name}</span>
                        <span className="tree-option-level">{n.level}</span>
                      </button>
                    ))}
                  {availableNodes.filter((n) => n.name.toLowerCase().includes(treeSearch.toLowerCase())).length === 0 && (
                    <div className="tree-search-empty">{t('detail.tree_links.no_results', { search: treeSearch })}</div>
                  )}
                </div>
              )}
            </div>
            <button
              className="btn-primary"
              disabled={!treeNodeId || linkTreeMutation.isLoading}
              onClick={() => { linkTreeMutation.mutate(Number(treeNodeId)); setTreeSearch(''); setTreeNodeId('') }}
            >
              {t('detail.tree_links.link')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
