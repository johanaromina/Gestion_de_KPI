/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { KPI } from '../types'
import KPIForm from '../components/KPIForm'
import { useAuth } from '../hooks/useAuth'
import { useDialog } from '../components/Dialog'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import './KPIs.css'

const defaultFormula = (direction?: KPI['direction']) => {
  switch (direction) {
    case 'reduction':
      return '(target / actual) * 100'
    case 'exact':
      return '100 - (Math.abs(actual - target) / target) * 100'
    default:
      return '(actual / target) * 100'
  }
}

const KPI_DELETE_API_ERROR_KEYS: Record<string, string> = {
  KPI_NOT_FOUND: 'kpis:dialogs.delete_error_msg',
  KPI_FORBIDDEN_DELETE: 'kpis:dialogs.api_errors.delete_forbidden',
  KPI_DELETE_IN_USE: 'kpis:dialogs.api_errors.delete_in_use',
}

const KPI_CLOSE_PERIOD_API_ERROR_KEYS: Record<string, string> = {
  ASSIGNMENT_CLOSE_PERIOD_REQUIRED: 'kpis:dialogs.api_errors.close_period_required',
}

export default function KPIs() {
  const [showForm, setShowForm] = useState(false)
  const [editingKPI, setEditingKPI] = useState<KPI | undefined>(undefined)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterPeriodId, setFilterPeriodId] = useState<number | ''>('')

  const queryClient = useQueryClient()
  const { isCollaborator } = useAuth()
  const dialog = useDialog()
  const { t } = useTranslation(['kpis', 'common'])

  const { data: kpis, isLoading } = useQuery<KPI[]>(
    'kpis',
    async () => {
      const response = await api.get('/kpis')
      return response.data
    },
    { retry: false }
  )

  const { data: assignments } = useQuery(
    'collaborator-kpis-summary',
    async () => {
      const res = await api.get('/collaborator-kpis')
      return res.data as any[]
    },
    { staleTime: 2 * 60 * 1000 }
  )

  const { data: periods } = useQuery(
    'periods',
    async () => {
      const res = await api.get('/periods')
      return res.data as any[]
    },
    { staleTime: 5 * 60 * 1000 }
  )

  const usageByKpi = useMemo(() => {
    const map: Record<number, { count: number; periods: Set<number> }> = {}
    assignments?.forEach((a: any) => {
      if (!map[a.kpiId]) map[a.kpiId] = { count: 0, periods: new Set() }
      map[a.kpiId].count += 1
      map[a.kpiId].periods.add(a.periodId)
    })
    return map
  }, [assignments])

  const deleteMutation = useMutation(
    async (id: number) => {
      await api.delete(`/kpis/${id}`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('kpis')
      },
      onError: (error: any) => {
        void dialog.alert(
          resolveApiErrorMessage(error, t, {
            codeMap: KPI_DELETE_API_ERROR_KEYS,
            fallbackKey: 'dialogs.delete_error_msg',
          }),
          { title: t('dialogs.delete_error_title'), variant: 'danger' }
        )
      },
    }
  )

  const closePeriodKpiMutation = useMutation(
    async ({ periodId, kpiId }: { periodId: number; kpiId: number }) => {
      await api.post('/collaborator-kpis/close-period', { periodId, kpiId })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('collaborator-kpis')
        queryClient.invalidateQueries('collaborator-kpis-summary')
      },
      onError: (error: any) => {
        void dialog.alert(
          resolveApiErrorMessage(error, t, {
            codeMap: KPI_CLOSE_PERIOD_API_ERROR_KEYS,
            fallbackKey: 'dialogs.close_period_error',
          }),
          { title: t('common:error_title'), variant: 'danger' }
        )
      },
    }
  )

  const getPeriodName = (periodId?: number | '') => {
    if (!periodId) return ''
    return periods?.find((p: any) => p.id === periodId)?.name || `Período #${periodId}`
  }

  const getTypeBadge = (type: KPI['type']) => {
    const typeConfig = {
      manual: { label: 'Manual', class: 'type-manual' },
      count: { label: 'Count', class: 'type-count' },
      ratio: { label: 'Ratio', class: 'type-ratio' },
      sla: { label: 'SLA', class: 'type-sla' },
      value: { label: 'Value', class: 'type-value' },
    }
    const config = typeConfig[type] || typeConfig.value
    return <span className={`type-badge ${config.class}`}>{config.label}</span>
  }

  const getDirectionBadge = (direction?: KPI['direction']) => {
    const dirConfig = {
      growth: { key: 'direction.growth', class: 'type-growth' },
      reduction: { key: 'direction.reduction', class: 'type-reduction' },
      exact: { key: 'direction.exact', class: 'type-exact' },
    }
    const config = dirConfig[direction || 'growth']
    return <span className={`type-badge ${config.class}`}>{t(config.key)}</span>
  }

  const getFormulaSample = (direction?: KPI['direction']) => {
    if (direction === 'reduction') return t('card.formula_sample_reduction')
    if (direction === 'exact') return t('card.formula_sample_exact')
    return t('card.formula_sample_growth')
  }

  const handleCreate = () => {
    if (isCollaborator) return
    setEditingKPI(undefined)
    setShowForm(true)
  }

  const handleEdit = (kpi: KPI) => {
    if (isCollaborator) return
    setEditingKPI(kpi)
    setShowForm(true)
  }

  const handleDelete = async (id: number, name: string) => {
    if (isCollaborator) return
    const ok = await dialog.confirm(
      t('dialogs.delete_msg', { name }),
      { title: t('dialogs.delete_title'), confirmLabel: t('dialogs.delete_confirm'), variant: 'danger' }
    )
    if (ok) deleteMutation.mutate(id)
  }

  const filteredKPIs = kpis?.filter((kpi) => {
    const matchesSearch =
      !searchTerm ||
      kpi.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (kpi.description && kpi.description.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesType = !filterType || kpi.type === filterType
    const matchesPeriod =
      !filterPeriodId ||
      kpi.periodIds?.includes(filterPeriodId as number) ||
      usageByKpi[kpi.id]?.periods.has(filterPeriodId as number)

    return matchesSearch && matchesType && matchesPeriod
  })

  const totals = {
    total: filteredKPIs?.length || 0,
    manual: filteredKPIs?.filter((k) => k.type === 'manual').length || 0,
    count: filteredKPIs?.filter((k) => k.type === 'count').length || 0,
    ratio: filteredKPIs?.filter((k) => k.type === 'ratio').length || 0,
    sla: filteredKPIs?.filter((k) => k.type === 'sla').length || 0,
    value: filteredKPIs?.filter((k) => k.type === 'value').length || 0,
  }

  return (
    <div className="kpis-page">
      <div className="page-header">
        <div>
          <h1>KPIs</h1>
          <p className="subtitle">{t('subtitle')}</p>
        </div>
        {!isCollaborator && (
          <button className="btn-primary" onClick={handleCreate}>
            {t('header.create')}
          </button>
        )}
      </div>

      <div className="filters-section">
        <div className="search-group">
          <label htmlFor="search">{t('filters.search_label')}</label>
          <input
            type="text"
            id="search"
            placeholder={t('filters.search_placeholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-group">
          <label htmlFor="filter-type">{t('filters.type')}</label>
          <select id="filter-type" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">{t('filters.all_types')}</option>
            <option value="manual">Manual</option>
            <option value="count">Count</option>
            <option value="ratio">Ratio</option>
            <option value="sla">SLA</option>
            <option value="value">Value</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="filter-period">{t('filters.period')}</label>
          <select
            id="filter-period"
            value={filterPeriodId}
            onChange={(e) => setFilterPeriodId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">{t('filters.all_periods')}</option>
            {periods?.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {(searchTerm || filterType || filterPeriodId) && (
          <button
            className="btn-clear-filters"
            onClick={() => {
              setSearchTerm('')
              setFilterType('')
              setFilterPeriodId('')
            }}
          >
            {t('filters.clear')}
          </button>
        )}
      </div>

      {!isLoading && filteredKPIs && filteredKPIs.length > 0 && (
        <div className="kpi-stats">
          <div className="stat-pill">
            <span className="stat-label">{t('stats.total')}</span>
            <span className="stat-value">{totals.total}</span>
          </div>
          <div className="stat-pill stat-manual">
            <span className="stat-label">Manual</span>
            <span className="stat-value">{totals.manual}</span>
          </div>
          <div className="stat-pill stat-count">
            <span className="stat-label">Count</span>
            <span className="stat-value">{totals.count}</span>
          </div>
          <div className="stat-pill stat-ratio">
            <span className="stat-label">Ratio</span>
            <span className="stat-value">{totals.ratio}</span>
          </div>
          <div className="stat-pill stat-sla">
            <span className="stat-label">SLA</span>
            <span className="stat-value">{totals.sla}</span>
          </div>
          <div className="stat-pill stat-value">
            <span className="stat-label">Value</span>
            <span className="stat-value">{totals.value}</span>
          </div>
        </div>
      )}

      <div className="table-container">
        {isLoading ? (
          <div className="loading">{t('loading')}</div>
        ) : filteredKPIs && filteredKPIs.length > 0 ? (
          <>
            <div className="results-info">
              {t('results.showing', { shown: filteredKPIs.length, total: kpis?.length || 0 })}
            </div>
            <div className="kpi-grid">
              {filteredKPIs.map((kpi) => (
                <div key={kpi.id} className="kpi-card">
                  <div className="kpi-card-header">
                    <div>
                      <p className="kpi-id">ID {kpi.id}</p>
                      <h3 className="kpi-name">{kpi.name}</h3>
                    </div>
                    <div className="badge-group">
                      {getTypeBadge(kpi.type)}
                      {getDirectionBadge(kpi.direction)}
                    </div>
                  </div>
                  <p className="kpi-description">{kpi.description || t('card.no_description')}</p>
                  <div className="kpi-meta">
                    <div>
                      <span className="meta-label">{t('card.criteria_label')}</span>
                      <p className="meta-value">{kpi.criteria || t('card.criteria_none')}</p>
                    </div>
                    <div>
                      <span className="meta-label">{t('card.formula_label')}</span>
                      <p className="meta-value mono" title={kpi.formula || defaultFormula(kpi.direction)}>
                        {kpi.formula ? t('card.formula_custom') : t('card.formula_default')} - {getFormulaSample(kpi.direction)}
                      </p>
                    </div>
                    {kpi.macroKPIId && (
                      <div>
                        <span
                          className="meta-label"
                          title={t('card.macro_tooltip')}
                        >
                          {t('card.macro_label')}
                        </span>
                        <p className="meta-value">
                          {kpis?.find((k: any) => k.id === kpi.macroKPIId)?.name || `KPI #${kpi.macroKPIId}`}
                        </p>
                      </div>
                    )}
                    <div>
                      <span className="meta-label">{t('card.usage_label')}</span>
                      <p className="meta-value">
                        {t('card.usage_value', {
                          count: usageByKpi[kpi.id]?.count || 0,
                          periods: usageByKpi[kpi.id] ? usageByKpi[kpi.id].periods.size : 0,
                        })}
                      </p>
                    </div>
                    <div>
                      <span className="meta-label">{t('card.periods_label')}</span>
                      <p className="meta-value">
                        {kpi.periodIds && kpi.periodIds.length > 0
                          ? kpi.periodIds
                              .map((pid) => periods?.find((p: any) => p.id === pid)?.name || `Período #${pid}`)
                              .join(', ')
                          : usageByKpi[kpi.id]?.periods.size
                          ? Array.from(usageByKpi[kpi.id].periods)
                              .map((pid) => periods?.find((p: any) => p.id === pid)?.name || `Período #${pid}`)
                              .join(', ')
                          : t('card.no_assignments')}
                      </p>
                    </div>
                  </div>
                  <div className="action-row">
                    {isCollaborator ? (
                      <span className="read-only-pill">{t('card.read_only')}</span>
                    ) : (
                      <>
                        <button className="btn-text" onClick={() => handleEdit(kpi)}>
                          {t('actions.edit')}
                        </button>
                        <button
                          className="btn-text danger"
                          onClick={() => handleDelete(kpi.id, kpi.name)}
                          disabled={deleteMutation.isLoading}
                        >
                          {t('actions.delete')}
                        </button>
                        <button
                          className="btn-text warning"
                          onClick={async () => {
                            if (!filterPeriodId) return
                            const periodName = getPeriodName(filterPeriodId)
                            const ok = await dialog.confirm(
                              t('dialogs.close_period_msg', { name: kpi.name, period: periodName }),
                              { title: t('dialogs.close_period_title'), confirmLabel: t('dialogs.close_period_confirm'), variant: 'warning' }
                            )
                            if (ok) {
                              closePeriodKpiMutation.mutate({
                                periodId: filterPeriodId as number,
                                kpiId: kpi.id,
                              })
                            }
                          }}
                          disabled={!filterPeriodId || closePeriodKpiMutation.isLoading}
                          title={
                            filterPeriodId
                              ? t('actions.close_period_title_active')
                              : t('actions.close_period_title_inactive')
                          }
                        >
                          {t('actions.close_period')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : kpis && kpis.length > 0 ? (
          <div className="empty-state">
            <div className="empty-icon">:(</div>
            <h3>{t('empty.no_results_title')}</h3>
            <p>{t('empty.no_results_subtitle')}</p>
            <button
              className="btn-primary"
              onClick={() => {
                setSearchTerm('')
                setFilterType('')
                setFilterPeriodId('')
              }}
            >
              {t('empty.no_results_clear')}
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <h3>{t('empty.no_data_title')}</h3>
            <p>{t('empty.no_data_subtitle')}</p>
            <p className="empty-state-hint">
              {t('empty.no_data_hint_pre')}<a href="/configuracion">{t('empty.no_data_hint_link')}</a>.
            </p>
            <button className="btn-primary" onClick={handleCreate}>
              {t('empty.no_data_btn')}
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <KPIForm
          kpi={editingKPI}
          onClose={() => {
            setShowForm(false)
            setEditingKPI(undefined)
          }}
          onSuccess={() => {
            setShowForm(false)
            setEditingKPI(undefined)
          }}
        />
      )}
    </div>
  )
}
