import { useState } from 'react'
import { useQuery } from 'react-query'
import api from '../services/api'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
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
  const [viewType, setViewType] = useState<ViewType>('area')
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)

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

  const getViewLabel = (type: ViewType): string => {
    const labels = {
      direction: 'Por Dirección',
      management: 'Por Gerencia',
      leadership: 'Por Jefatura',
      area: 'Por Área',
    }
    return labels[type]
  }

  const formatStandardDeviation = (stdDev: number): string => {
    return `±${stdDev.toFixed(2)}%`
  }

  // Preparar datos para gráficos
  const getChartData = () => {
    if (!aggregatedData?.aggregatedData) return []

    return aggregatedData.aggregatedData.map((item) => {
      const label =
        item.area ||
        item.manager?.name ||
        item.leader?.name ||
        'Sin nombre'
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

  return (
    <div className="vistas-agregadas-page">
      <div className="page-header">
        <div>
          <h1>Vistas Agregadas</h1>
          <p className="subtitle">
            Tableros de cumplimiento por nivel organizacional
          </p>
        </div>
      </div>

      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="period-select">Período:</label>
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
            <option value="">Selecciona un período</option>
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
            Por Área
          </button>
          <button
            className={`view-type-btn ${
              viewType === 'direction' ? 'active' : ''
            }`}
            onClick={() => setViewType('direction')}
          >
            Por Dirección
          </button>
          <button
            className={`view-type-btn ${
              viewType === 'management' ? 'active' : ''
            }`}
            onClick={() => setViewType('management')}
          >
            Por Gerencia
          </button>
          <button
            className={`view-type-btn ${
              viewType === 'leadership' ? 'active' : ''
            }`}
            onClick={() => setViewType('leadership')}
          >
            Por Jefatura
          </button>
        </div>
      </div>

      {!selectedPeriodId ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h3>Selecciona un período</h3>
          <p>Elige un período para ver las vistas agregadas</p>
        </div>
      ) : isLoading ? (
        <div className="loading">Cargando datos agregados...</div>
      ) : aggregatedData && aggregatedData.aggregatedData.length > 0 ? (
        <>
          {/* Gráfico de barras con promedio */}
          <div className="chart-section">
            <h2>Promedio de Cumplimiento - {getViewLabel(viewType)}</h2>
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
                  <Bar dataKey="promedio" fill="#f97316" name="Promedio %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfico de rango (min-max) */}
          <div className="chart-section">
            <h2>Rango de Cumplimiento - {getViewLabel(viewType)}</h2>
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
                  <Bar dataKey="minimo" fill="#ef4444" name="Mínimo %" />
                  <Bar dataKey="maximo" fill="#10b981" name="Máximo %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabla de datos detallados */}
          <div className="table-section">
            <h2>Datos Detallados - {getViewLabel(viewType)}</h2>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>
                      {viewType === 'area' || viewType === 'direction'
                        ? 'Área'
                        : viewType === 'management'
                        ? 'Gerente'
                        : 'Líder'}
                    </th>
                    <th>Colaboradores</th>
                    <th>Promedio</th>
                    <th>Mínimo</th>
                    <th>Máximo</th>
                    <th>Dispersión (σ)</th>
                    <th>Rango</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregatedData.aggregatedData.map((item, index) => {
                    const label =
                      item.area ||
                      item.manager?.name ||
                      item.leader?.name ||
                      'Sin nombre'
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
          <h3>No hay datos disponibles</h3>
          <p>
            No se encontraron datos agregados para el período seleccionado
          </p>
        </div>
      )}
    </div>
  )
}

