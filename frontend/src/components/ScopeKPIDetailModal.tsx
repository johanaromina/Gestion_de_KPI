/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { ScopeKPI, ScopeKPILink } from '../types'
import './ScopeKPIDetailModal.css'

type ScopeKpiMeasurement = {
  id: number
  value: number
  mode: 'manual' | 'import' | 'auto'
  status: 'draft' | 'proposed' | 'approved' | 'rejected'
  capturedAt?: string
  capturedByName?: string
  sourceRunId?: string | null
  reason?: string | null
}

type ScopeKpiAggregationRun = {
  id: number
  status: string
  resultValue?: number | null
  message?: string | null
  createdAt?: string
  createdByName?: string | null
  inputCount?: number | null
}

type ScopeKPIDetailModalProps = {
  scopeKpiId: number
  initialScopeKpi?: ScopeKPI | null
  onClose: () => void
}

type ScopeNavigationEntry = {
  id: number
  label: string
}

export default function ScopeKPIDetailModal({ scopeKpiId, initialScopeKpi, onClose }: ScopeKPIDetailModalProps) {
  const { t, i18n } = useTranslation(['config', 'assignments', 'common'])
  const locale = i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'es-AR'
  const formatNumber = (value?: number | null) =>
    value == null
      ? '-'
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(value))

  const buildScopeLabel = (id: number, scopeKpi?: Pick<ScopeKPI, 'name'> | null) =>
    scopeKpi?.name?.trim() || t('config:scope_kpi_detail.fallbacks.scope_kpi', { id })

  const formatDate = (value?: string) => {
    if (!value) return '-'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale)
  }

  const ownerLevelLabel = (value?: string | null) =>
    value
      ? t(`assignments:scope_kpis.owner_levels.${value}`, { defaultValue: value })
      : '-'

  const sourceModeLabel = (value?: string | null) =>
    value
      ? t(`assignments:scope_kpis.source_modes.${value}`, { defaultValue: value })
      : '-'

  const statusLabel = (value?: string | null) =>
    value
      ? t(`assignments:status.${value}`, { defaultValue: value })
      : '-'

  const measurementModeLabel = (value?: string | null) =>
    value
      ? t(`assignments:input.${value}`, { defaultValue: value })
      : '-'

  const runStatusLabel = (value?: string | null) =>
    value
      ? t(`config:options.run_status.${value}`, { defaultValue: value })
      : '-'

  const childTypeLabel = (value?: string | null) =>
    value
      ? t(`config:scope_kpi_detail.child_types.${value}`, { defaultValue: value })
      : '-'

  const aggregationMethodLabel = (value?: string | null) =>
    value
      ? t(`config:scope_kpi_links.aggregation_methods.${value}`, { defaultValue: value })
      : '-'

  const [navigationStack, setNavigationStack] = useState<ScopeNavigationEntry[]>([
    {
      id: scopeKpiId,
      label: buildScopeLabel(scopeKpiId, initialScopeKpi || null),
    },
  ])

  useEffect(() => {
    setNavigationStack([
      {
        id: scopeKpiId,
        label: buildScopeLabel(scopeKpiId, initialScopeKpi || null),
      },
    ])
  }, [initialScopeKpi, scopeKpiId])

  const currentScopeKpiId = navigationStack[navigationStack.length - 1]?.id || scopeKpiId

  const { data: scopeKpi, isLoading: isLoadingScope } = useQuery<ScopeKPI>(
    ['scope-kpi-detail', currentScopeKpiId],
    async () => (await api.get(`/scope-kpis/${currentScopeKpiId}`)).data,
    {
      initialData: currentScopeKpiId === scopeKpiId ? initialScopeKpi || undefined : undefined,
      enabled: !!currentScopeKpiId,
    }
  )

  useEffect(() => {
    if (!scopeKpi?.id || !scopeKpi?.name) return
    setNavigationStack((current) => {
      if (!current.length) return current
      const next = [...current]
      const last = next[next.length - 1]
      if (last.id !== scopeKpi.id || last.label === scopeKpi.name) {
        return current
      }
      next[next.length - 1] = { ...last, label: scopeKpi.name }
      return next
    })
  }, [scopeKpi?.id, scopeKpi?.name])

  const { data: links } = useQuery<ScopeKPILink[]>(
    ['scope-kpi-detail-links', currentScopeKpiId],
    async () => (await api.get(`/scope-kpis/${currentScopeKpiId}/links`)).data,
    { enabled: !!currentScopeKpiId }
  )

  const { data: measurements } = useQuery<ScopeKpiMeasurement[]>(
    ['scope-kpi-detail-measurements', currentScopeKpiId],
    async () => (await api.get('/measurements', { params: { scopeKpiId: currentScopeKpiId } })).data,
    { enabled: !!currentScopeKpiId }
  )

  const { data: aggregationRuns } = useQuery<ScopeKpiAggregationRun[]>(
    ['scope-kpi-detail-runs', currentScopeKpiId],
    async () => (await api.get(`/scope-kpis/${currentScopeKpiId}/aggregation-runs`, { params: { limit: 6 } })).data,
    { enabled: !!currentScopeKpiId }
  )

  const recentMeasurements = useMemo(() => (measurements || []).slice(0, 6), [measurements])
  const recentRuns = useMemo(() => aggregationRuns || [], [aggregationRuns])

  const openScopeChild = (childScopeId: number, label?: string | null) => {
    setNavigationStack((current) => {
      const existingIndex = current.findIndex((item) => item.id === childScopeId)
      if (existingIndex >= 0) {
        return current.slice(0, existingIndex + 1)
      }
      return [...current, { id: childScopeId, label: label?.trim() || t('config:scope_kpi_detail.fallbacks.scope_kpi', { id: childScopeId }) }]
    })
  }

  const navigateToBreadcrumb = (index: number) => {
    setNavigationStack((current) => current.slice(0, index + 1))
  }

  const navigateBack = () => {
    setNavigationStack((current) => (current.length > 1 ? current.slice(0, -1) : current))
  }

  return (
    <div className="scope-detail-overlay">
      <div className="scope-detail-modal">
        <div className="scope-detail-header">
          <div>
            <div className="scope-detail-breadcrumbs">
              {navigationStack.map((entry, index) => (
                <div key={`${entry.id}-${index}`} className="scope-detail-breadcrumb-item">
                  {index > 0 ? <span className="scope-detail-breadcrumb-separator">/</span> : null}
                  <button
                    type="button"
                    className={`scope-detail-breadcrumb-button ${index === navigationStack.length - 1 ? 'active' : ''}`}
                    onClick={() => navigateToBreadcrumb(index)}
                    disabled={index === navigationStack.length - 1}
                  >
                    {entry.label}
                  </button>
                </div>
              ))}
            </div>
            <h2>{scopeKpi?.name || t('config:scope_kpi_detail.title_fallback')}</h2>
            <div className="scope-detail-subtitle">
              <span>{scopeKpi?.kpiName || t('config:scope_kpi_detail.base_kpi')}</span>
              <span>{scopeKpi?.orgScopeName || t('config:scope_kpi_detail.scope')}</span>
              <span>{t('config:scope_kpi_detail.owner')}: {ownerLevelLabel(scopeKpi?.ownerLevel)}</span>
              <span>{t('config:scope_kpi_detail.source')}: {sourceModeLabel(scopeKpi?.sourceMode)}</span>
              <span>{t('config:scope_kpi_detail.status')}: {statusLabel(scopeKpi?.status)}</span>
            </div>
          </div>
          <div className="scope-detail-header-actions">
            {navigationStack.length > 1 ? (
              <button type="button" className="btn-secondary" onClick={navigateBack}>
                {t('common:back')}
              </button>
            ) : null}
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('common:close')}
            </button>
          </div>
        </div>

        {isLoadingScope && !scopeKpi ? (
          <div className="scope-detail-empty">{t('config:scope_kpi_detail.loading')}</div>
        ) : (
          <div className="scope-detail-grid">
            <div className="scope-detail-stack">
              <section className="scope-detail-section">
                <h3>{t('config:scope_kpi_detail.summary')}</h3>
                <div className="scope-detail-summary">
                  <div className="scope-detail-stat">
                    <span>{t('config:scope_kpi_detail.actual')}</span>
                    <strong>{formatNumber(scopeKpi?.actual)}</strong>
                  </div>
                  <div className="scope-detail-stat">
                    <span>{t('config:scope_kpi_detail.target')}</span>
                    <strong>{formatNumber(scopeKpi?.target)}</strong>
                  </div>
                  <div className="scope-detail-stat">
                    <span>{t('config:scope_kpi_detail.variation')}</span>
                    <strong>{formatNumber(scopeKpi?.variation)}</strong>
                  </div>
                  <div className="scope-detail-stat">
                    <span>{t('config:scope_kpi_detail.result')}</span>
                    <strong>{formatNumber(scopeKpi?.weightedResult)}</strong>
                  </div>
                </div>
              </section>

              {scopeKpi?.sourceMode === 'mixed' ? (
                <section className="scope-detail-section">
                  <h3>{t('config:scope_kpi_detail.mixed_title')}</h3>
                  <div className="scope-detail-mix">
                    <div className="scope-detail-empty">
                      {t('config:scope_kpi_detail.mixed_note')}
                    </div>
                    <div className="scope-detail-mix-grid">
                      <div className="scope-detail-mix-card">
                        <span>{scopeKpi.mixedConfig?.directLabel || t('config:scope_kpi_detail.direct_component')}</span>
                        <strong>{formatNumber(scopeKpi.directActual)}</strong>
                        <small>{t('config:scope_kpi_detail.weight', { value: scopeKpi.mixedConfig?.directWeight ?? 50 })}</small>
                      </div>
                      <div className="scope-detail-mix-card">
                        <span>{scopeKpi.mixedConfig?.aggregatedLabel || t('config:scope_kpi_detail.aggregated_component')}</span>
                        <strong>{formatNumber(scopeKpi.aggregatedActual)}</strong>
                        <small>{t('config:scope_kpi_detail.weight', { value: scopeKpi.mixedConfig?.aggregatedWeight ?? 50 })}</small>
                      </div>
                      <div className="scope-detail-mix-card">
                        <span>{t('config:scope_kpi_detail.final_result')}</span>
                        <strong>{formatNumber(scopeKpi.actual)}</strong>
                        <small>
                          {t('config:scope_kpi_detail.mix_ratio', {
                            direct: scopeKpi.mixedConfig?.directWeight ?? 50,
                            aggregated: scopeKpi.mixedConfig?.aggregatedWeight ?? 50,
                          })}
                        </small>
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              <section className="scope-detail-section">
                <h3>{t('config:scope_kpi_detail.contributions')}</h3>
                {links?.length ? (
                  <div className="scope-detail-list">
                    {links.map((link) => (
                      <div key={link.id} className="scope-detail-item">
                        <div className="scope-detail-item-main">
                          <strong>
                            {link.childType === 'collaborator'
                              ? `${link.collaboratorName || t('config:scope_kpi_detail.fallbacks.collaborator')} · ${link.collaboratorKpiName || t('config:scope_kpi_detail.fallbacks.kpi')}`
                              : `${link.childScopeKpiName || t('config:scope_kpi_detail.fallbacks.child_scope')}`}
                          </strong>
                          <div className="scope-detail-item-actions">
                            <span>
                              {aggregationMethodLabel(link.aggregationMethod)}
                              {link.contributionWeight != null ? ` · ${t('common:weight').toLowerCase()} ${link.contributionWeight}` : ''}
                            </span>
                            {link.childType === 'scope' && link.childScopeKpiId ? (
                              <button
                                type="button"
                                className="scope-detail-link-button"
                                onClick={() => openScopeChild(link.childScopeKpiId as number, link.childScopeKpiName)}
                              >
                                {t('config:scope_kpi_detail.open_child')}
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="scope-detail-item-meta">
                          <span>{t('config:scope_kpi_detail.type')}: {childTypeLabel(link.childType)}</span>
                          <span>{t('config:scope_kpi_detail.order')}: {link.sortOrder ?? 0}</span>
                          {link.childType === 'scope' && link.childScopeKpiId ? <span>{t('config:scope_kpi_detail.child_scope', { id: link.childScopeKpiId })}</span> : null}
                          {link.childType === 'collaborator' && link.collaboratorAssignmentId ? (
                            <span>{t('config:scope_kpi_detail.assignment', { id: link.collaboratorAssignmentId })}</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="scope-detail-empty">{t('config:scope_kpi_detail.no_links')}</div>
                )}
              </section>
            </div>

            <div className="scope-detail-side">
              <section className="scope-detail-section">
                <h3>{t('config:scope_kpi_detail.objectives')}</h3>
                {scopeKpi?.objectiveNames?.length ? (
                  <div className="scope-detail-tags">
                    {scopeKpi.objectiveNames.map((objectiveName) => (
                      <span key={objectiveName} className="scope-detail-tag">
                        {objectiveName}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="scope-detail-empty">{t('config:scope_kpi_detail.no_objectives')}</div>
                )}
              </section>

              <section className="scope-detail-section">
                <h3>{t('config:scope_kpi_detail.runs')}</h3>
                {recentRuns.length ? (
                  <div className="scope-detail-list">
                    {recentRuns.map((run) => (
                      <div key={run.id} className="scope-detail-item">
                        <div className="scope-detail-item-main">
                          <strong>{formatNumber(run.resultValue)}</strong>
                          <span>{runStatusLabel(run.status)}</span>
                        </div>
                        <div className="scope-detail-item-meta">
                          <span>{run.message || t('config:scope_kpi_detail.no_message')}</span>
                          <span>{t('config:scope_kpi_detail.inputs', { count: run.inputCount ?? 0 })}</span>
                          <span>{formatDate(run.createdAt)}</span>
                          <span>{run.createdByName || t('config:scope_kpi_detail.system')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="scope-detail-empty">{t('config:scope_kpi_detail.no_runs')}</div>
                )}
              </section>

              <section className="scope-detail-section">
                <h3>{t('config:scope_kpi_detail.measurements')}</h3>
                {recentMeasurements.length ? (
                  <div className="scope-detail-list">
                    {recentMeasurements.map((measurement) => (
                      <div key={measurement.id} className="scope-detail-item">
                        <div className="scope-detail-item-main">
                          <strong>{formatNumber(measurement.value)}</strong>
                          <span>
                            {measurementModeLabel(measurement.mode)} · {statusLabel(measurement.status)}
                          </span>
                        </div>
                        <div className="scope-detail-item-meta">
                          <span>{formatDate(measurement.capturedAt)}</span>
                          <span>{measurement.capturedByName || measurement.sourceRunId || t('config:scope_kpi_detail.system')}</span>
                          {measurement.reason ? <span>{measurement.reason}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="scope-detail-empty">{t('config:scope_kpi_detail.no_measurements')}</div>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
