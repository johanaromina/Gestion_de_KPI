/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAuth } from '../hooks/useAuth'
import { calculateVariationPercent, calculateWeightedImpact, resolveDirection } from '../utils/kpi'
import './HistorialIndividual.css'

interface Period {
  id: number
  name: string
  startDate: string
  endDate: string
  status: 'open' | 'in_review' | 'closed'
}

interface SubPeriod {
  id: number
  periodId: number
  name: string
  startDate: string
  endDate: string
  weight?: number
}

interface CollaboratorKPI {
  id: number
  collaboratorId: number
  kpiId: number
  periodId: number
  subPeriodId?: number
  target: number
  actual?: number
  weight: number
  subPeriodWeight?: number | null
  variation?: number
  weightedResult?: number
  status: 'draft' | 'proposed' | 'approved' | 'closed'
  comments?: string
  kpiName?: string
  kpiDescription?: string
  kpiCriteria?: string
  kpiType?: string
  kpiDirection?: 'growth' | 'reduction' | 'exact'
  periodName?: string
  subPeriodName?: string
}

interface Collaborator {
  id: number
  name: string
  position: string
  area: string
  status?: 'active' | 'inactive'
  inactiveAt?: string | null
  inactiveReason?: string | null
}

interface CollaboratorEvent {
  id: number
  collaboratorId: number
  eventType: 'role_change' | 'termination' | 'reactivation'
  oldValue?: string | null
  newValue?: string | null
  reason?: string | null
  createdByName?: string | null
  createdAt: string
}

interface PeriodSummary {
  id: number
  periodId: number
  collaboratorId: number
  collaboratorName: string
  totalWeight: number
  totalWeightedResult: number
  overallResult: number
  generatedAt?: string
}

interface PeriodSummaryItem {
  id: number
  summaryId: number
  kpiId: number
  kpiName: string
  target?: number | null
  actual?: number | null
  variation?: number | null
  weight?: number | null
  weightedResult?: number | null
  status?: string
}

export default function HistorialIndividual() {
  const { collaboratorId } = useParams<{ collaboratorId: string }>()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const { t, i18n } = useTranslation('history')
  const locale = i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'es-AR'
  const isGlobalView = collaboratorId === 'all' || collaboratorId === 'global'
  const resolvedId = useMemo(() => {
    if (isGlobalView) return ''
    if (collaboratorId) return collaboratorId
    if (user?.collaboratorId) return String(user.collaboratorId)
    return ''
  }, [collaboratorId, isGlobalView, user?.collaboratorId])

  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [selectedSubPeriodId, setSelectedSubPeriodId] = useState<number | null>(null)

  useEffect(() => {
    const periodParam = searchParams.get('periodId')
    if (!periodParam) return
    const parsed = Number(periodParam)
    if (Number.isFinite(parsed)) {
      setSelectedPeriodId(parsed)
    }
  }, [searchParams])

  const { data: collaborator } = useQuery<Collaborator>(
    ['collaborator', resolvedId],
    async () => {
      const response = await api.get(`/collaborators/${resolvedId}`)
      return response.data
    },
    { enabled: !!resolvedId && !isGlobalView }
  )

  const { data: events } = useQuery<CollaboratorEvent[]>(
    ['collaborator-events', resolvedId],
    async () => {
      const response = await api.get(`/collaborators/${resolvedId}/events`)
      return response.data
    },
    { enabled: !!resolvedId && !isGlobalView }
  )

  const { data: periods } = useQuery<Period[]>('periods', async () => {
    const response = await api.get('/periods')
    return response.data
  })

  const { data: subPeriods } = useQuery<SubPeriod[]>(
    ['sub-periods', selectedPeriodId],
    async () => {
      if (!selectedPeriodId) return []
      const response = await api.get(`/periods/${selectedPeriodId}/sub-periods`)
      return response.data
    },
    {
      enabled: !!selectedPeriodId,
    }
  )

  const { data: periodSummary } = useQuery<{
    summaries: PeriodSummary[]
    items: PeriodSummaryItem[]
  }>(
    ['period-summary', selectedPeriodId],
    async () => {
      if (!selectedPeriodId) return { summaries: [], items: [] }
      const response = await api.get(`/periods/${selectedPeriodId}/summary`)
      return response.data
    },
    { enabled: !!selectedPeriodId }
  )

  const { data: kpis, isLoading: loadingKPIs } = useQuery<CollaboratorKPI[]>(
    ['collaborator-kpis-historical', resolvedId],
    async () => {
      const response = await api.get(`/collaborator-kpis/collaborator/${resolvedId}`)
      return response.data
    },
    {
      enabled: !!resolvedId && !isGlobalView,
    }
  )

  const availablePeriods = useMemo(() => {
    if (!kpis) return []
    const seen = new Map<number, { id: number; name: string; status?: string }>()
    kpis.forEach((kpi) => {
      if (!seen.has(kpi.periodId)) {
        seen.set(kpi.periodId, {
          id: kpi.periodId,
          name: kpi.periodName || t('individual.filter_period_fallback', { id: kpi.periodId }),
          status: (kpi as any).periodStatus,
        })
      }
    })
    return Array.from(seen.values())
  }, [kpis, t])

  const optionsPeriods =
    availablePeriods.length > 0
      ? availablePeriods
      : (periods || []).map((p) => ({ id: p.id, name: p.name, status: p.status }))

  useEffect(() => {
    if (!selectedPeriodId && optionsPeriods.length > 0) {
      setSelectedPeriodId(optionsPeriods[0].id)
      setSelectedSubPeriodId(null)
    }
  }, [optionsPeriods, selectedPeriodId])

  useEffect(() => {
    if (!selectedPeriodId && availablePeriods.length > 0) {
      setSelectedPeriodId(availablePeriods[0].id)
      setSelectedSubPeriodId(null)
    }
  }, [availablePeriods, selectedPeriodId])

  const filteredKPIs = useMemo(() => {
    const byPeriod = selectedPeriodId ? kpis?.filter((kpi) => kpi.periodId === selectedPeriodId) : kpis
    return selectedSubPeriodId ? byPeriod?.filter((kpi) => kpi.subPeriodId === selectedSubPeriodId) : byPeriod
  }, [kpis, selectedPeriodId, selectedSubPeriodId])

  const summaryForCollaborator = useMemo(() => {
    if (!periodSummary || !resolvedId) return null
    const collaboratorIdNum = Number(resolvedId)
    const summary = periodSummary.summaries?.find(
      (item) => Number(item.collaboratorId) === collaboratorIdNum
    )
    if (!summary) return null
    const items = periodSummary.items?.filter((item) => item.summaryId === summary.id) || []
    return { summary, items }
  }, [periodSummary, resolvedId])

  const summaryForGlobal = useMemo(() => {
    if (!filteredKPIs || filteredKPIs.length === 0) return []
    const hasSubPeriods = filteredKPIs.some((kpi) => kpi.subPeriodId !== null && kpi.subPeriodId !== undefined)
    if (hasSubPeriods) {
      return filteredKPIs.filter((kpi) => kpi.subPeriodId !== null && kpi.subPeriodId !== undefined)
    }
    const summary = filteredKPIs.filter((kpi) => kpi.subPeriodId === null || kpi.subPeriodId === undefined)
    return summary.length > 0 ? summary : filteredKPIs
  }, [filteredKPIs])

  const totalWeightedImpact =
    summaryForGlobal?.reduce((sum, kpi) => {
      const direction = resolveDirection((kpi as any).assignmentDirection, kpi.kpiDirection, kpi.kpiType)
      const variation =
        kpi.variation ?? calculateVariationPercent(direction, kpi.target, kpi.actual ?? null)
      const impact = calculateWeightedImpact(variation, kpi.weight, kpi.subPeriodWeight)
      return sum + (impact || 0)
    }, 0) || 0

  const globalResult = totalWeightedImpact

  const chartData =
    filteredKPIs?.map((kpi) => {
      const direction = resolveDirection((kpi as any).assignmentDirection, kpi.kpiDirection, kpi.kpiType)
      const variation =
        kpi.variation ?? calculateVariationPercent(direction, kpi.target, kpi.actual ?? null) ?? 0
      return {
        name: kpi.kpiName || `KPI ${kpi.kpiId}`,
        target: kpi.target,
        actual: kpi.actual || 0,
        variation,
      }
    }) || []

  const handlePeriodChange = (periodId: string) => {
    const periodIdNum = periodId ? parseInt(periodId) : null
    setSelectedPeriodId(periodIdNum)
    setSelectedSubPeriodId(null)
  }

  const handleSubPeriodChange = (subPeriodId: string) => {
    const subPeriodIdNum = subPeriodId ? parseInt(subPeriodId) : null
    setSelectedSubPeriodId(subPeriodIdNum)
  }

  return (
    <div className="historial-individual-page">
      <div className="historial-header">
        <div>
          <h1>{isGlobalView ? t('individual.title_global') : t('individual.title_individual')}</h1>
          {!isGlobalView && collaborator && (
            <div className="collaborator-info">
              <p className="collaborator-name">{collaborator.name}</p>
              <p className="collaborator-details">
                {collaborator.position} · {collaborator.area}
              </p>
              <div className="status-line">
                <span className={`status-pill ${collaborator.status === 'inactive' ? 'inactive' : 'active'}`}>
                  {collaborator.status === 'inactive' ? t('individual.status_inactive') : t('individual.status_active')}
                </span>
                {collaborator.status === 'inactive' && collaborator.inactiveAt && (
                  <span className="muted">{t('individual.since_prefix')} {new Date(collaborator.inactiveAt).toLocaleDateString(locale)}</span>
                )}
                {collaborator.inactiveReason && <span className="muted">{t('individual.reason_prefix')} {collaborator.inactiveReason}</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {!isGlobalView && events && events.length > 0 && (
        <div className="event-timeline">
          <h3>{t('individual.events_title')}</h3>
          <ul>
            {events.map((event) => (
              <li key={event.id}>
                <span className="event-date">
                  {new Date(event.createdAt).toLocaleDateString(locale, {
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit',
                  })}
                </span>
                <span className="event-desc">
                  {event.eventType === 'termination' && t('individual.event_termination')}
                  {event.eventType === 'reactivation' && t('individual.event_reactivation')}
                  {event.eventType === 'role_change' && t('individual.event_role_change')}
                </span>
                {event.oldValue && event.newValue && (
                  <span className="muted">
                    {event.oldValue} → {event.newValue}
                  </span>
                )}
                {event.reason && <span className="muted">{t('individual.reason_prefix')} {event.reason}</span>}
                {event.createdByName && <span className="muted">{t('individual.by_prefix')} {event.createdByName}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="period-select">{t('individual.filter_period_label')}</label>
          <select
            id="period-select"
            value={selectedPeriodId || ''}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="filter-select"
          >
            <option value="">{t('individual.filter_period_placeholder')}</option>
            {optionsPeriods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </div>

        {selectedPeriodId && subPeriods && subPeriods.length > 0 && (
          <div className="filter-group">
            <label htmlFor="subperiod-select">{t('individual.filter_subperiod_label')}</label>
            <select
              id="subperiod-select"
              value={selectedSubPeriodId || ''}
              onChange={(e) => handleSubPeriodChange(e.target.value)}
              className="filter-select"
            >
              <option value="">{t('individual.filter_all_subperiods')}</option>
              {subPeriods.map((subPeriod) => (
                <option key={subPeriod.id} value={subPeriod.id}>
                  {subPeriod.name} ({subPeriod.weight ? `${subPeriod.weight}%` : ''})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!selectedPeriodId && (
        <div className="empty-state">
          <div className="empty-icon">:/</div>
          <h3>{t('individual.empty_select_period_title')}</h3>
          <p>{t('individual.empty_select_period_subtitle')}</p>
        </div>
      )}

      {selectedPeriodId && loadingKPIs && !isGlobalView && (
        <div className="loading">{t('individual.loading')}</div>
      )}

      {isGlobalView && selectedPeriodId && (
        <>
          {periodSummary && periodSummary.summaries?.length > 0 ? (
            <div className="annual-summary-card">
              <div className="summary-header">
                <h2>{t('individual.annual_summary_title')}</h2>
              </div>
              <div className="summary-table-container">
                <table className="summary-table">
                  <thead>
                    <tr>
                      <th>{t('individual.summary_table_collaborator')}</th>
                      <th>{t('individual.summary_table_total_weight')}</th>
                      <th>{t('individual.summary_table_weighted_result')}</th>
                      <th>{t('individual.summary_table_final_result')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodSummary.summaries.map((summary) => (
                      <tr key={summary.id}>
                        <td>{summary.collaboratorName}</td>
                        <td>{summary.totalWeight?.toFixed(1)}%</td>
                        <td>{summary.totalWeightedResult?.toFixed(1)}</td>
                        <td>{summary.overallResult?.toFixed(1)}%</td>
                        <td>
                          <button
                            className="btn-text"
                            onClick={() =>
                              window.location.assign(
                                `/historial/${summary.collaboratorId}?periodId=${selectedPeriodId}`
                              )
                            }
                          >
                            {t('individual.summary_detail_btn')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">:/</div>
              <h3>{t('individual.no_annual_summary_title')}</h3>
              <p>{t('individual.no_annual_summary_subtitle')}</p>
            </div>
          )}
        </>
      )}

      {!isGlobalView && selectedPeriodId && !loadingKPIs && filteredKPIs && filteredKPIs.length > 0 && (
        <>
          {summaryForCollaborator && (
            <div className="annual-summary-card">
              <div className="summary-header">
                <h2>{t('individual.annual_summary_closed_title')}</h2>
                <span className="summary-pill">
                  {summaryForCollaborator.summary.overallResult.toFixed(1)}%
                </span>
              </div>
              <div className="summary-metrics">
                <div>
                  <span className="metric-label">{t('individual.metric_total_weight')}</span>
                  <span className="metric-value">
                    {summaryForCollaborator.summary.totalWeight.toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="metric-label">{t('individual.metric_weighted_result')}</span>
                  <span className="metric-value">
                    {summaryForCollaborator.summary.totalWeightedResult.toFixed(1)}
                  </span>
                </div>
              </div>
              {summaryForCollaborator.items.length > 0 && (
                <div className="summary-table-container">
                  <table className="summary-table">
                    <thead>
                      <tr>
                        <th>{t('individual.kpi_table_kpi')}</th>
                        <th>{t('individual.kpi_table_target')}</th>
                        <th>{t('individual.kpi_table_actual')}</th>
                        <th>{t('individual.kpi_table_variation')}</th>
                        <th>{t('individual.kpi_table_weight')}</th>
                        <th>{t('individual.kpi_table_weighted')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryForCollaborator.items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.kpiName}</td>
                          <td>{item.target ?? '-'}</td>
                          <td>{item.actual ?? '-'}</td>
                          <td>
                            {item.variation !== null && item.variation !== undefined
                              ? `${Number(item.variation).toFixed(1)}%`
                              : '-'}
                          </td>
                          <td>
                            {item.weight !== null && item.weight !== undefined
                              ? `${Number(item.weight).toFixed(1)}%`
                              : '-'}
                          </td>
                          <td>
                            {item.weightedResult !== null && item.weightedResult !== undefined
                              ? Number(item.weightedResult).toFixed(1)
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="global-result-card">
            <div className="result-content">
              <h2>{t('individual.global_result_title')}</h2>
              <div className="result-value">
                <span className="result-number">{globalResult.toFixed(1)}%</span>
                <div className="result-bar">
                  <div
                    className="result-fill"
                    style={{ width: `${Math.min(globalResult, 100)}%` }}
                  />
                </div>
              </div>
              <p className="result-description">
                {t('individual.global_result_desc')}
                {selectedSubPeriodId && t('individual.global_result_subperiod_suffix')}
              </p>
            </div>
          </div>

          <div className="kpis-section">
            <h2>{t('individual.kpis_title')}</h2>
            <div className="read-only-badge">{t('individual.read_only_badge')}</div>
            <div className="kpis-table-container">
              <table className="kpis-table">
                <thead>
                  <tr>
                    <th>{t('individual.table_kpi')}</th>
                    <th>{t('individual.table_description')}</th>
                    <th>{t('individual.table_target')}</th>
                    <th>{t('individual.table_actual')}</th>
                    <th>{t('individual.table_variation')}</th>
                    <th>{t('individual.table_weight')}</th>
                    <th>{t('individual.table_weighted')}</th>
                    <th>{t('individual.table_criteria')}</th>
                    <th>{t('individual.table_status')}</th>
                    {selectedSubPeriodId && <th>{t('individual.table_subperiod')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredKPIs.map((kpi) => {
                    const direction = resolveDirection(
                      (kpi as any).assignmentDirection,
                      kpi.kpiDirection,
                      kpi.kpiType
                    )
                    const variation =
                      kpi.variation ?? calculateVariationPercent(direction, kpi.target, kpi.actual ?? null)
                    const weightedImpact = calculateWeightedImpact(variation, kpi.weight, kpi.subPeriodWeight)
                    return (
                    <tr key={kpi.id}>
                      <td className="kpi-name">{kpi.kpiName || `KPI ${kpi.kpiId}`}</td>
                      <td className="kpi-description">{kpi.kpiDescription || '-'}</td>
                      <td className="kpi-target">{kpi.target}</td>
                  <td className="kpi-actual">
                    {kpi.actual !== null && kpi.actual !== undefined ? kpi.actual : '-'}
                  </td>
                  <td className="kpi-variation">
                    {variation !== null && variation !== undefined
                      ? `${Number(variation).toFixed(1)}%`
                      : '-'}
                  </td>
                  <td className="kpi-weight">{kpi.weight}%</td>
                  <td className="kpi-weighted">
                    {weightedImpact !== null && weightedImpact !== undefined
                      ? `${Number(weightedImpact).toFixed(1)}%`
                      : '-'}
                      </td>
                      <td className="kpi-criteria">{kpi.kpiCriteria || '-'}</td>
                      <td>
                        <span className={`kpi-status kpi-status-${kpi.status}`}>
                          {kpi.status === 'draft' && t('individual.status_draft')}
                          {kpi.status === 'proposed' && t('individual.status_proposed')}
                          {kpi.status === 'approved' && t('individual.status_approved')}
                          {kpi.status === 'closed' && t('individual.status_closed')}
                        </span>
                      </td>
                      {selectedSubPeriodId && <td>{kpi.subPeriodName || '-'}</td>}
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="chart-section">
              <h2>{t('individual.chart_title')}</h2>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="target" fill="#e5e7eb" name={t('individual.bar_target')} />
                    <Bar dataKey="actual" fill="#f97316" name={t('individual.bar_actual')} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}

      {selectedPeriodId && !loadingKPIs && (!filteredKPIs || filteredKPIs.length === 0) && (
        <div className="empty-state">
          <div className="empty-icon">:/</div>
          <h3>{t('individual.no_results_title')}</h3>
          <p>{t('individual.no_results_subtitle')}</p>
        </div>
      )}
    </div>
  )
}
