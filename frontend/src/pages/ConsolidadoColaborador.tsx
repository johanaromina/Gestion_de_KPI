
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { Collaborator, Period, CollaboratorKPI } from '../types'
import { calculateVariationPercent, calculateWeightedImpact, resolveDirection } from '../utils/kpi'
import './ConsolidadoColaborador.css'

type ConsolidatedKPI = CollaboratorKPI & {
  kpiName?: string
  kpiDescription?: string
  kpiCriteria?: string
  kpiType?: string
  kpiDirection?: 'growth' | 'reduction' | 'exact'
  subPeriodName?: string
  subPeriodWeight?: number | null
}

type ConsolidatedSubPeriod = {
  id: number | null
  name: string
  weight: number | null
  totalWeight: number
  totalWeightedResult: number
  kpiCount: number
  result: number
  kpis: ConsolidatedKPI[]
}

type ConsolidatedResponse = {
  collaborator: { id: number; name: string }
  period: { id: number; name: string; startDate: string; endDate: string }
  overall: {
    totalWeight: number
    totalWeightedResult: number
    resultByKpiWeight: number
    resultBySubPeriodWeight: number
  }
  subPeriods: ConsolidatedSubPeriod[]
}

function formatPercent(value: number) {
  if (Number.isNaN(value)) return '0%'
  return `${value.toFixed(1)}%`
}

export default function ConsolidadoColaborador() {
  const { t, i18n } = useTranslation('history')
  const locale = i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'es-AR'
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState<number | null>(null)
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)

  const formatDate = (date: string) => new Date(date).toLocaleDateString(locale)

  const { data: collaborators, isLoading: loadingCollaborators } = useQuery<Collaborator[]>(
    'collaborators',
    async () => {
      const response = await api.get('/collaborators')
      return response.data
    }
  )

  const { data: periods, isLoading: loadingPeriods } = useQuery<Period[]>(
    'periods',
    async () => {
      const response = await api.get('/periods')
      return response.data
    }
  )

  useEffect(() => {
    if (!selectedCollaboratorId && collaborators && collaborators.length > 0) {
      setSelectedCollaboratorId(collaborators[0].id)
    }
  }, [collaborators, selectedCollaboratorId])

  useEffect(() => {
    if (!selectedPeriodId && periods && periods.length > 0) {
      setSelectedPeriodId(periods[0].id)
    }
  }, [periods, selectedPeriodId])

  const {
    data: consolidated,
    isLoading: loadingConsolidated,
    isFetching: fetchingConsolidated,
  } = useQuery<ConsolidatedResponse | null>(
    ['consolidated', selectedCollaboratorId, selectedPeriodId],
    async () => {
      if (!selectedCollaboratorId || !selectedPeriodId) return null
      const response = await api.get(
        `/collaborator-kpis/collaborator/${selectedCollaboratorId}/consolidated`,
        { params: { periodId: selectedPeriodId } }
      )
      return response.data
    },
    {
      enabled: !!selectedCollaboratorId && !!selectedPeriodId,
    }
  )

  const isLoading =
    loadingCollaborators ||
    loadingPeriods ||
    loadingConsolidated ||
    fetchingConsolidated

  const subPeriodTotals = useMemo(() => {
    if (!consolidated) return 0
    return consolidated.subPeriods.reduce((sum, sp) => sum + (sp.weight || 0), 0)
  }, [consolidated])

  return (
    <div className="consolidado-page">
      <div className="page-header">
        <div>
          <h1>{t('consolidado.title')}</h1>
          <p className="subtitle">{t('consolidado.subtitle')}</p>
        </div>
        {consolidated && (
          <div className="period-chip">
            <span className="chip-label">{t('consolidado.period_chip_label')}</span>
            <div className="chip-value">
              <strong>{consolidated.period.name}</strong>
              <span>
                {formatDate(consolidated.period.startDate)} - {formatDate(consolidated.period.endDate)}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="filters">
        <div className="filter-group">
          <label htmlFor="collaborator-select">{t('consolidado.filter_collaborator_label')}</label>
          <select
            id="collaborator-select"
            value={selectedCollaboratorId || ''}
            onChange={(e) => setSelectedCollaboratorId(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">{t('consolidado.filter_collaborator_placeholder')}</option>
            {collaborators?.map((collaborator) => (
              <option key={collaborator.id} value={collaborator.id}>
                {collaborator.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="period-select">{t('consolidado.filter_period_label')}</label>
          <select
            id="period-select"
            value={selectedPeriodId || ''}
            onChange={(e) => setSelectedPeriodId(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">{t('consolidado.filter_period_placeholder')}</option>
            {periods?.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(!selectedCollaboratorId || !selectedPeriodId) && (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h3>{t('consolidado.empty_select_title')}</h3>
          <p>{t('consolidado.empty_select_subtitle')}</p>
        </div>
      )}

      {selectedCollaboratorId && selectedPeriodId && isLoading && (
        <div className="loading">{t('consolidado.loading')}</div>
      )}

      {selectedCollaboratorId && selectedPeriodId && !isLoading && !consolidated && (
        <div className="empty-state">
          <div className="empty-icon">ℹ️</div>
          <h3>{t('consolidado.no_data_title')}</h3>
          <p>{t('consolidado.no_data_subtitle')}</p>
        </div>
      )}

      {selectedCollaboratorId && selectedPeriodId && consolidated && (
        <>
          <div className="summary-cards">
            <div className="summary-card primary">
              <div className="card-label">{t('consolidado.card_subperiod_weight_label')}</div>
              <div className="card-value">{formatPercent(consolidated.overall.resultBySubPeriodWeight)}</div>
              <p className="card-help">{t('consolidado.card_subperiod_weight_help')}</p>
            </div>
            <div className="summary-card">
              <div className="card-label">{t('consolidado.card_kpi_weight_label')}</div>
              <div className="card-value">{formatPercent(consolidated.overall.resultByKpiWeight)}</div>
              <p className="card-help">{t('consolidado.card_kpi_weight_help')}</p>
            </div>
            <div className="summary-card compact">
              <div className="card-label">{t('consolidado.card_totals_label')}</div>
              <div className="card-value small">{subPeriodTotals}%</div>
              <p className="card-help">{t('consolidado.card_totals_help')}</p>
            </div>
          </div>

          <div className="subperiod-grid">
            {consolidated.subPeriods.map((sub) => (
              <div key={sub.id ?? 'none'} className="subperiod-card">
                <div className="subperiod-header">
                  <div>
                    <h3>{sub.name}</h3>
                    <p>{t('consolidado.kpi_count', { count: sub.kpiCount })}</p>
                  </div>
                  <div className="subperiod-score">
                    <span>{formatPercent(sub.result)}</span>
                    <small>{t('consolidado.score_label')}</small>
                  </div>
                </div>
                <div className="subperiod-meta">
                  <span>
                    {sub.weight != null
                      ? t('consolidado.meta_weight', { value: sub.weight })
                      : t('consolidado.meta_weight_sd')}
                  </span>
                  <span>{t('consolidado.meta_kpi_weight', { value: sub.totalWeight })}</span>
                </div>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('consolidado.table_kpi')}</th>
                        <th>{t('consolidado.table_target')}</th>
                        <th>{t('consolidado.table_actual')}</th>
                        <th>{t('consolidado.table_variation')}</th>
                        <th>{t('consolidado.table_weight')}</th>
                        <th>{t('consolidado.table_weighted')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sub.kpis.map((kpi) => {
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
                          <td>
                            <div className="kpi-name">{kpi.kpiName || `KPI ${kpi.kpiId}`}</div>
                            <div className="kpi-desc">{kpi.kpiDescription || '-'}</div>
                          </td>
                          <td>{kpi.target}</td>
                          <td>{kpi.actual ?? '-'}</td>
                          <td>{variation !== undefined && variation !== null ? formatPercent(variation) : '-'}</td>
                          <td>{kpi.weight}%</td>
                          <td>{weightedImpact !== undefined && weightedImpact !== null ? formatPercent(weightedImpact) : '-'}</td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
