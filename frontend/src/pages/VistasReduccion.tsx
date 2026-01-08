/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useQuery } from 'react-query'
import api from '../services/api'
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
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [selectedArea, setSelectedArea] = useState<string>('')
  const [selectedKPI, setSelectedKPI] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'overview' | 'evolution'>('overview')

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
  )

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
      fecha: new Date(item.periodStartDate).toLocaleDateString('es-ES', {
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
          <h1>📉 Vistas de Reducción</h1>
          <p className="subtitle">
            Reportes y evolución temporal de objetivos de reducción
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="period-filter">Período:</label>
          <select
            id="period-filter"
            value={selectedPeriodId || ''}
            onChange={(e) =>
              setSelectedPeriodId(
                e.target.value ? parseInt(e.target.value) : null
              )
            }
          >
            <option value="">Todos los períodos</option>
            {periods?.map((period: any) => (
              <option key={period.id} value={period.id}>
                {period.name}
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
          >
            <option value="">Todas las áreas</option>
            {areas.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="view-mode">Vista:</label>
          <select
            id="view-mode"
            value={viewMode}
            onChange={(e) =>
              setViewMode(e.target.value as 'overview' | 'evolution')
            }
          >
            <option value="overview">Resumen</option>
            <option value="evolution">Evolución Temporal</option>
          </select>
        </div>
      </div>

      {viewMode === 'overview' ? (
        <>
          {/* Estadísticas Generales */}
          <div className="stats-section">
            <h2>Estadísticas Generales</h2>
            {isLoadingStats ? (
              <div className="loading">Cargando estadísticas...</div>
            ) : statistics && statistics.length > 0 ? (
              <div className="stats-grid">
                {statistics.map((stat) => (
                  <div key={stat.kpiId} className="stat-card">
                    <h3>{stat.kpiName}</h3>
                    <div className="stat-details">
                      <div className="stat-item">
                        <span className="stat-label">Colaboradores:</span>
                        <span className="stat-value">
                          {stat.totalCollaborators}
                        </span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Promedio Target:</span>
                        <span className="stat-value">
                          {stat.avgTarget.toFixed(2)}
                        </span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Promedio Actual:</span>
                        <span className="stat-value">
                          {stat.avgActual.toFixed(2)}
                        </span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">% Cumplimiento:</span>
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
                        <span className="stat-label">Completitud:</span>
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
                <p>No hay datos de reducción para los filtros seleccionados</p>
              </div>
            )}
          </div>

          {/* Gráfico de Comparación */}
          {statisticsChartData.length > 0 && (
            <div className="chart-section">
              <h2>Comparación de KPIs de Reducción</h2>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={statisticsChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="kpi" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="promedioTarget" fill="#8884d8" name="Target Promedio" />
                  <Bar dataKey="promedioActual" fill="#82ca9d" name="Actual Promedio" />
                  <Bar dataKey="cumplimiento" fill="#ffc658" name="% Cumplimiento" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabla de Detalles */}
          <div className="table-section">
            <h2>Detalles por KPI y Colaborador</h2>
            {isLoadingKPIs ? (
              <div className="loading">Cargando datos...</div>
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
                          <th>Colaborador</th>
                          <th>Área</th>
                          <th>Período</th>
                          <th>Target</th>
                          <th>Actual</th>
                          <th>% Cumplimiento</th>
                          <th>Estado</th>
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
                                {assignment.status}
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
                <p>No hay KPIs de reducción para los filtros seleccionados</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Vista de Evolución Temporal */}
          <div className="evolution-section">
            <h2>Evolución Temporal</h2>
            <div className="kpi-selector">
              <label htmlFor="kpi-select">Seleccionar KPI:</label>
              <select
                id="kpi-select"
                value={selectedKPI || ''}
                onChange={(e) =>
                  setSelectedKPI(
                    e.target.value ? parseInt(e.target.value) : null
                  )
                }
              >
                <option value="">Selecciona un KPI</option>
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
                  <div className="loading">Cargando evolución...</div>
                ) : evolution && evolution.length > 0 ? (
                  <>
                    <div className="chart-section">
                      <h3>Evolución de Target vs Actual</h3>
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
                            name="Target"
                            strokeWidth={2}
                          />
                          <Line
                            type="monotone"
                            dataKey="actual"
                            stroke="#82ca9d"
                            name="Actual"
                            strokeWidth={2}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="chart-section">
                      <h3>Evolución del % de Cumplimiento</h3>
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
                            name="% Cumplimiento"
                            strokeWidth={2}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="evolution-table">
                      <h3>Datos de Evolución</h3>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Período</th>
                            <th>Target</th>
                            <th>Actual</th>
                            <th>% Cumplimiento</th>
                            <th>Estado</th>
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
                                  {item.status}
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
                    <p>No hay datos de evolución para este KPI</p>
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
