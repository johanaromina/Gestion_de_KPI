/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import './VistasAgregadas.css'

type ViewType = 'direction' | 'management' | 'leadership' | 'area'

interface Statistics {
  average: number
  min: number
  max: number
  standardDeviation: number
  count: number
}

interface AggregatedData {
  area?: string
  manager?: { id: number; name: string; position: string; area: string }
  leader?: { id: number; name: string; position: string; area: string }
  collaborators: any[]
  statistics: Statistics
  results: number[]
}

export default function VistasAgregadas() {
  const { t } = useTranslation('views')
  const [viewType, setViewType] = useState<ViewType>('area')
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const { user } = useAuth()
  const canViewCompany = Boolean(user?.hasSuperpowers)
  const teamArea = user?.area || ''

  // Obtener períodos
  const { data: periods } = useQuery('periods', async () => {
    const response = await api.get('/periods')
    return response.data
  })

  // Obtener datos agregados según el tipo de vista
  const { data: aggregatedData, isLoading } = useQuery<{
    periodId: number
    aggregatedData: AggregatedData[]
  }>(
    ['aggregated-views', viewType, selectedPeriodId],
    async () => {
      if (!selectedPeriodId) return null
      const response = await api.get(`/aggregated-views/${viewType}`, {
        params: { periodId: selectedPeriodId },
      })
      return response.data
    },
    {
      enabled: !!selectedPeriodId,
      retry: false,
    }
  )

  const getViewLabel = (type: ViewType): string => t(`aggregated.view_types.${type}`)

  const formatStandardDeviation = (stdDev: number): string => {
    return `±${stdDev.toFixed(2)}%`
  }

  const filteredAggregated = useMemo(() => {
    if (!aggregatedData?.aggregatedData) return []
    if (!canViewCompany && teamArea) {
      return aggregatedData.aggregatedData.filter((item) => item.area === teamArea)
    }
    return aggregatedData.aggregatedData
  }, [aggregatedData, canViewCompany, teamArea])

  // Preparar datos para gráficos
  const getChartData = () => {
    if (!filteredAggregated.length) return []

    return filteredAggregated.map((item) => {
      const label =
        item.area ||
        item.manager?.name ||
        item.leader?.name ||
        t('aggregated.no_name')
      return {
        name: label,
        promedio: item.statistics.average,
        minimo: item.statistics.min,
        maximo: item.statistics.max,
        count: item.statistics.count,
      }
    })
  }

  const chartData = getChartData()

  useEffect(() => {
    if (!canViewCompany && viewType !== 'area') {
      setViewType('area')
    }
  }, [canViewCompany, viewType])

  return (
    <div className="vistas-agregadas-page">
      <div className="page-header">
        <div>
          <h1>{t('aggregated.title')}</h1>
          <p className="subtitle">{t('aggregated.subtitle')}</p>
        </div>
      </div>

      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="period-select">{t('aggregated.filters.period_label')}:</label>
          <select
            id="period-select"
            value={selectedPeriodId || ''}
            onChange={(e) =>
              setSelectedPeriodId(
                e.target.value ? parseInt(e.target.value) : null
              )
            }
            className="filter-select"
          >
            <option value="">{t('aggregated.filters.select_period')}</option>
            {periods?.map((period: any) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </div>

        <div className="view-type-selector">
          <button
            className={`view-type-btn ${viewType === 'area' ? 'active' : ''}`}
            onClick={() => setViewType('area')}
          >
            {t('aggregated.view_types.area')}
          </button>
          {canViewCompany && (
            <>
              <button
                className={`view-type-btn ${viewType === 'direction' ? 'active' : ''}`}
                onClick={() => setViewType('direction')}
              >
                {t('aggregated.view_types.direction')}
              </button>
              <button
                className={`view-type-btn ${viewType === 'management' ? 'active' : ''}`}
                onClick={() => setViewType('management')}
              >
                {t('aggregated.view_types.management')}
              </button>
              <button
                className={`view-type-btn ${viewType === 'leadership' ? 'active' : ''}`}
                onClick={() => setViewType('leadership')}
              >
                {t('aggregated.view_types.leadership')}
              </button>
            </>
          )}
        </div>
      </div>

      {!selectedPeriodId ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h3>{t('aggregated.empty.no_period_title')}</h3>
          <p>{t('aggregated.empty.no_period_text')}</p>
        </div>
      ) : isLoading ? (
        <div className="loading">{t('aggregated.loading')}</div>
      ) : filteredAggregated.length > 0 ? (
        <>
          {/* Gráfico de barras con promedio */}
          <div className="chart-section">
            <h2>{t('aggregated.chart.avg_title', { view: getViewLabel(viewType) })}</h2>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                  />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="promedio" fill="#0891b2" name={t('aggregated.chart.bar_avg')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfico de rango (min-max) */}
          <div className="chart-section">
            <h2>{t('aggregated.chart.range_title', { view: getViewLabel(viewType) })}</h2>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                  />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="minimo" fill="#ef4444" name={t('aggregated.chart.bar_min')} />
                  <Bar dataKey="maximo" fill="#10b981" name={t('aggregated.chart.bar_max')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabla de datos detallados */}
          <div className="table-section">
            <h2>{t('aggregated.chart.detailed_title', { view: getViewLabel(viewType) })}</h2>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>
                      {viewType === 'management'
                        ? t('aggregated.table.header_manager')
                        : viewType === 'leadership'
                        ? t('aggregated.table.header_leader')
                        : t('aggregated.table.header_area')}
                    </th>
                    <th>{t('aggregated.table.header_collaborators')}</th>
                    <th>{t('aggregated.table.header_avg')}</th>
                    <th>{t('aggregated.table.header_min')}</th>
                    <th>{t('aggregated.table.header_max')}</th>
                    <th>{t('aggregated.table.header_dispersion')}</th>
                    <th>{t('aggregated.table.header_range')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAggregated.map((item, index) => {
                    const label =
                      item.area ||
                      item.manager?.name ||
                      item.leader?.name ||
                      t('aggregated.no_name')
                    const stats = item.statistics
                    const range = stats.max - stats.min

                    return (
                      <tr key={index}>
                        <td className="name-cell">
                          {label}
                          {item.manager && (
                            <div className="sub-info">
                              {item.manager.position} - {item.manager.area}
                            </div>
                          )}
                          {item.leader && (
                            <div className="sub-info">
                              {item.leader.position} - {item.leader.area}
                            </div>
                          )}
                        </td>
                        <td>{stats.count}</td>
                        <td className="number-cell">
                          {stats.average.toFixed(2)}%
                        </td>
                        <td className="number-cell">{stats.min.toFixed(2)}%</td>
                        <td className="number-cell">{stats.max.toFixed(2)}%</td>
                        <td className="number-cell">
                          {formatStandardDeviation(stats.standardDeviation)}
                        </td>
                        <td className="number-cell">{range.toFixed(2)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h3>{t('aggregated.empty.no_data_title')}</h3>
          <p>{t('aggregated.empty.no_data_text')}</p>
        </div>
      )}
    </div>
  )
}
