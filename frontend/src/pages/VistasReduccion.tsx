/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import './VistasReduccion.css'

interface ReductionKPI {
  kpiId: number
  kpiName: string
  kpiDescription: string
  kpiCriteria: string
  kpiFormula?: string
  assignments: Array<{
    assignmentId: number
    collaboratorId: number
    collaboratorName: string
    collaboratorArea: string
    collaboratorPosition: string
    periodId: number
    periodName: string
    periodStartDate: string
    periodEndDate: string
    target: number
    actual: number | null
    weight: number
    variation: number | null
    weightedResult: number | null
    status: string
    comments?: string
  }>
  evolution: Array<{
    periodId: number
    periodName: string
    periodStartDate: string
    periodEndDate: string
    target: number
    actual: number | null
    variation: number | null
    weightedResult: number | null
    status: string
  }>
}

interface ReductionStatistic {
  kpiId: number
  kpiName: string
  totalCollaborators: number
  totalAssignments: number
  avgTarget: number
  avgActual: number
  avgVariation: number
  avgWeightedResult: number
  minActual: number | null
  maxActual: number | null
  completedCount: number
  pendingCount: number
  completionRate: number
}

export default function VistasReduccion() {
  const { t, i18n } = useTranslation(['views', 'grid', 'common'])
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [selectedArea, setSelectedArea] = useState<string>('')
  const [selectedKPI, setSelectedKPI] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'overview' | 'evolution'>('overview')
  const { user } = useAuth()
  const canViewCompany = Boolean(user?.hasSuperpowers)
  const teamArea = user?.area || ''
  const locale = i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'es-AR'

  const getStatusLabel = (status?: string) => {
    if (!status) return '-'
    const normalized = status.toLowerCase()
    if (normalized === 'proposed') return t('grid:status.proposed')
    const commonStatuses = ['draft', 'approved', 'closed', 'pending', 'in_review', 'rejected', 'changes_requested', 'open']
    if (commonStatuses.includes(normalized)) {
      return t(`common:${normalized}`)
    }
    return status
  }

  // Obtener períodos
  const { data: periods } = useQuery('periods', async () => {
    const response = await api.get('/periods')
    return response.data
  })

  // Obtener áreas únicas
  const { data: collaborators } = useQuery('collaborators', async () => {
    const response = await api.get('/collaborators')
    return response.data
  })

  const areas = Array.from(
    new Set(collaborators?.map((c: any) => c.area).filter(Boolean) || [])
  ) as string[]

  useEffect(() => {
    if (!canViewCompany && teamArea) {
      setSelectedArea(teamArea)
    }
  }, [canViewCompany, teamArea])

  // Obtener KPIs de reducción
  const { data: reductionKPIs, isLoading: isLoadingKPIs } = useQuery<
    ReductionKPI[]
  >(
    ['reduction-kpis', selectedPeriodId, selectedArea],
    async () => {
      const params = new URLSearchParams()
      if (selectedPeriodId) params.append('periodId', selectedPeriodId.toString())
      if (selectedArea) params.append('area', selectedArea)
      const response = await api.get(
        `/reduction-kpis?${params.toString()}`
      )
      return response.data
    },
    { enabled: true }
  )

  // Obtener estadísticas
  const { data: statistics, isLoading: isLoadingStats } = useQuery<
    ReductionStatistic[]
  >(
    ['reduction-statistics', selectedPeriodId, selectedArea],
    async () => {
      const params = new URLSearchParams()
      if (selectedPeriodId) params.append('periodId', selectedPeriodId.toString())
      if (selectedArea) params.append('area', selectedArea)
      const response = await api.get(
        `/reduction-statistics?${params.toString()}`
      )
      return response.data
    },
    { enabled: true }
  )

  // Obtener evolución de un KPI específico
  const { data: evolution, isLoading: isLoadingEvolution } = useQuery(
    ['reduction-evolution', selectedKPI],
    async () => {
      if (!selectedKPI) return null
      const response = await api.get(`/reduction-evolution/${selectedKPI}`)
      return response.data
    },
    { enabled: !!selectedKPI && viewMode === 'evolution' }
  )

  // Preparar datos para gráfico de evolución
  const evolutionChartData =
    evolution?.map((item: any) => ({
      period: item.periodName,
      fecha: new Date(item.periodStartDate).toLocaleDateString(locale, {
        month: 'short',
        year: 'numeric',
      }),
      target: item.target,
      actual: item.actual,
      variation: item.variation,
    })) || []

  // Preparar datos para gráfico de estadísticas
  const statisticsChartData =
    statistics?.map((stat) => ({
      kpi: stat.kpiName,
      promedioActual: stat.avgActual,
      promedioTarget: stat.avgTarget,
      cumplimiento: stat.avgVariation,
    })) || []

  return (
    <div className="vistas-reduccion-page">
      <div className="page-header">
        <div>
          <h1>📉 {t('reduction.title')}</h1>
          <p className="subtitle">{t('reduction.subtitle')}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="period-filter">{t('reduction.filters.period_label')}:</label>
          <select
            id="period-filter"
            value={selectedPeriodId || ''}
            onChange={(e) =>
              setSelectedPeriodId(
                e.target.value ? parseInt(e.target.value) : null
              )
            }
          >
            <option value="">{t('reduction.filters.all_periods')}</option>
            {periods?.map((period: any) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="area-filter">{t('reduction.filters.area_label')}:</label>
          <select
            id="area-filter"
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            disabled={!canViewCompany && !!teamArea}
          >
            {!(!canViewCompany && teamArea) && <option value="">{t('reduction.filters.all_areas')}</option>}
            {(canViewCompany ? areas : teamArea ? [teamArea] : areas).map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="view-mode">{t('reduction.filters.view_label')}:</label>
          <select
            id="view-mode"
            value={viewMode}
            onChange={(e) =>
              setViewMode(e.target.value as 'overview' | 'evolution')
            }
          >
            <option value="overview">{t('reduction.view_modes.overview')}</option>
            <option value="evolution">{t('reduction.view_modes.evolution')}</option>
          </select>
        </div>
      </div>

      {viewMode === 'overview' ? (
        <>
          {/* Estadísticas Generales */}
          <div className="stats-section">
            <h2>{t('reduction.stats.title')}</h2>
            {isLoadingStats ? (
              <div className="loading">{t('reduction.stats.loading')}</div>
            ) : statistics && statistics.length > 0 ? (
              <div className="stats-grid">
                {statistics.map((stat) => (
                  <div key={stat.kpiId} className="stat-card">
                    <h3>{stat.kpiName}</h3>
                    <div className="stat-details">
                      <div className="stat-item">
                        <span className="stat-label">{t('reduction.stats.collaborators')}</span>
                        <span className="stat-value">
                          {stat.totalCollaborators}
                        </span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">{t('reduction.stats.avg_target')}</span>
                        <span className="stat-value">
                          {stat.avgTarget.toFixed(2)}
                        </span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">{t('reduction.stats.avg_actual')}</span>
                        <span className="stat-value">
                          {stat.avgActual.toFixed(2)}
                        </span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">{t('reduction.stats.compliance_pct')}</span>
                        <span
                          className={`stat-value ${
                            stat.avgVariation >= 100
                              ? 'positive'
                              : stat.avgVariation >= 80
                              ? 'warning'
                              : 'negative'
                          }`}
                        >
                          {stat.avgVariation.toFixed(2)}%
                        </span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">{t('reduction.stats.completion_rate')}</span>
                        <span className="stat-value">
                          {stat.completionRate.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>{t('reduction.stats.empty')}</p>
              </div>
            )}
          </div>

          {/* Gráfico de Comparación */}
          {statisticsChartData.length > 0 && (
            <div className="chart-section">
              <h2>{t('reduction.chart.comparison_title')}</h2>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={statisticsChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="kpi" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="promedioTarget" fill="#8884d8" name={t('reduction.chart.target_avg')} />
                  <Bar dataKey="promedioActual" fill="#82ca9d" name={t('reduction.chart.actual_avg')} />
                  <Bar dataKey="cumplimiento" fill="#ffc658" name={t('reduction.chart.compliance_pct')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabla de Detalles */}
          <div className="table-section">
            <h2>{t('reduction.table.title')}</h2>
            {isLoadingKPIs ? (
              <div className="loading">{t('reduction.table.loading')}</div>
            ) : reductionKPIs && reductionKPIs.length > 0 ? (
              <div className="kpi-groups">
                {reductionKPIs.map((kpiGroup) => (
                  <div key={kpiGroup.kpiId} className="kpi-group">
                    <h3>{kpiGroup.kpiName}</h3>
                    {kpiGroup.kpiDescription && (
                      <p className="kpi-description">
                        {kpiGroup.kpiDescription}
                      </p>
                    )}
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>{t('reduction.table.header_collaborator')}</th>
                          <th>{t('reduction.table.header_area')}</th>
                          <th>{t('reduction.table.header_period')}</th>
                          <th>{t('reduction.table.header_target')}</th>
                          <th>{t('reduction.table.header_actual')}</th>
                          <th>{t('reduction.table.header_compliance')}</th>
                          <th>{t('reduction.table.header_status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kpiGroup.assignments.map((assignment) => (
                          <tr key={assignment.assignmentId}>
                            <td>{assignment.collaboratorName}</td>
                            <td>{assignment.collaboratorArea}</td>
                            <td>{assignment.periodName}</td>
                            <td>{assignment.target.toFixed(2)}</td>
                            <td>
                              {assignment.actual !== null
                                ? assignment.actual.toFixed(2)
                                : '-'}
                            </td>
                            <td
                              className={
                                assignment.variation !== null
                                  ? assignment.variation >= 100
                                    ? 'positive'
                                    : assignment.variation >= 80
                                    ? 'warning'
                                    : 'negative'
                                  : ''
                              }
                            >
                              {assignment.variation !== null
                                ? `${assignment.variation.toFixed(2)}%`
                                : '-'}
                            </td>
                            <td>
                              <span
                                className={`status-badge status-${assignment.status}`}
                              >
                                {getStatusLabel(assignment.status)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>{t('reduction.table.empty')}</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Vista de Evolución Temporal */}
          <div className="evolution-section">
            <h2>{t('reduction.evolution.title')}</h2>
            <div className="kpi-selector">
              <label htmlFor="kpi-select">{t('reduction.evolution.kpi_label')}</label>
              <select
                id="kpi-select"
                value={selectedKPI || ''}
                onChange={(e) =>
                  setSelectedKPI(
                    e.target.value ? parseInt(e.target.value) : null
                  )
                }
              >
                <option value="">{t('reduction.evolution.select_kpi')}</option>
                {reductionKPIs?.map((kpi) => (
                  <option key={kpi.kpiId} value={kpi.kpiId}>
                    {kpi.kpiName}
                  </option>
                ))}
              </select>
            </div>

            {selectedKPI && (
              <>
                {isLoadingEvolution ? (
                  <div className="loading">{t('reduction.evolution.loading')}</div>
                ) : evolution && evolution.length > 0 ? (
                  <>
                    <div className="chart-section">
                      <h3>{t('reduction.evolution.chart_target_actual')}</h3>
                      <ResponsiveContainer width="100%" height={400}>
                        <LineChart data={evolutionChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="period" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="target"
                            stroke="#8884d8"
                            name={t('reduction.evolution.table.target')}
                            strokeWidth={2}
                          />
                          <Line
                            type="monotone"
                            dataKey="actual"
                            stroke="#82ca9d"
                            name={t('reduction.evolution.table.actual')}
                            strokeWidth={2}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="chart-section">
                      <h3>{t('reduction.evolution.chart_compliance')}</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={evolutionChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="period" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="variation"
                            stroke="#ffc658"
                            name={t('reduction.evolution.table.compliance')}
                            strokeWidth={2}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="evolution-table">
                      <h3>{t('reduction.evolution.data_title')}</h3>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>{t('reduction.evolution.table.period')}</th>
                            <th>{t('reduction.evolution.table.target')}</th>
                            <th>{t('reduction.evolution.table.actual')}</th>
                            <th>{t('reduction.evolution.table.compliance')}</th>
                            <th>{t('reduction.evolution.table.status')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {evolution.map((item: any) => (
                            <tr key={item.periodId}>
                              <td>{item.periodName}</td>
                              <td>{item.target.toFixed(2)}</td>
                              <td>
                                {item.actual !== null
                                  ? item.actual.toFixed(2)
                                  : '-'}
                              </td>
                              <td
                                className={
                                  item.variation !== null
                                    ? item.variation >= 100
                                      ? 'positive'
                                      : item.variation >= 80
                                      ? 'warning'
                                      : 'negative'
                                    : ''
                                }
                              >
                                {item.variation !== null
                                  ? `${item.variation.toFixed(2)}%`
                                  : '-'}
                              </td>
                              <td>
                                <span
                                  className={`status-badge status-${item.status}`}
                                >
                                  {getStatusLabel(item.status)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    <p>{t('reduction.evolution.empty')}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
