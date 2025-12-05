import { useQuery } from 'react-query'
import { useParams } from 'react-router-dom'
import api from '../services/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import './MiParrilla.css'

interface CollaboratorKPI {
  id: number
  collaboratorId: number
  kpiId: number
  periodId: number
  subPeriodId?: number
  target: number
  actual?: number
  weight: number
  variation?: number
  weightedResult?: number
  status: 'draft' | 'proposed' | 'approved' | 'closed'
  comments?: string
  kpiName?: string
  kpiDescription?: string
  kpiCriteria?: string
  kpiType?: 'growth' | 'reduction' | 'exact'
  periodName?: string
  periodStatus?: string
}

export default function MiParrilla() {
  const { collaboratorId } = useParams<{ collaboratorId: string }>()
  const id = collaboratorId || '1' // Por ahora, usar ID 1 como default

  const { data: collaborator, isLoading: loadingCollaborator } = useQuery(
    ['collaborator', id],
    async () => {
      const response = await api.get(`/collaborators/${id}`)
      return response.data
    }
  )

  const { data: kpis, isLoading: loadingKPIs } = useQuery<CollaboratorKPI[]>(
    ['collaborator-kpis', id],
    async () => {
      const response = await api.get(`/collaborator-kpis/collaborator/${id}`)
      return response.data
    },
    {
      enabled: !!id,
    }
  )

  // Obtener período actual (el más reciente abierto)
  const currentPeriod = kpis?.[0]?.periodName || 'No hay período activo'
  const periodStatus = kpis?.[0]?.periodStatus || 'closed'

  // Calcular resultado global
  const totalWeightedResult = kpis?.reduce((sum, kpi) => {
    return sum + (kpi.weightedResult || 0)
  }, 0) || 0

  const totalWeight = kpis?.reduce((sum, kpi) => {
    return sum + kpi.weight
  }, 0) || 0

  const globalResult = totalWeight > 0 ? (totalWeightedResult / totalWeight) * 100 : 0

  // Datos para gráfico
  const chartData = kpis?.map((kpi) => ({
    name: kpi.kpiName || `KPI ${kpi.kpiId}`,
    target: kpi.target,
    actual: kpi.actual || 0,
    variation: kpi.variation || 0,
  })) || []

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      open: { label: 'Abierta', class: 'status-open' },
      in_review: { label: 'En Revisión', class: 'status-review' },
      closed: { label: 'Cerrada', class: 'status-closed' },
    }
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.closed
    return (
      <span className={`status-badge ${config.class}`}>
        {config.label}
      </span>
    )
  }

  if (loadingCollaborator || loadingKPIs) {
    return (
      <div className="mi-parrilla-page">
        <div className="loading">Cargando parrilla de objetivos...</div>
      </div>
    )
  }

  return (
    <div className="mi-parrilla-page">
      <div className="parrilla-header">
        <div>
          <h1>Mi Parrilla de Objetivos</h1>
          {collaborator && (
            <div className="collaborator-info">
              <p className="collaborator-name">{collaborator.name}</p>
              <p className="collaborator-details">
                {collaborator.position} • {collaborator.area}
              </p>
            </div>
          )}
        </div>
        <div className="period-info">
          <div>
            <span className="period-label">Período:</span>
            <span className="period-name">{currentPeriod}</span>
          </div>
          <div className="period-status">
            {getStatusBadge(periodStatus)}
          </div>
        </div>
      </div>

      <div className="global-result-card">
        <div className="result-content">
          <h2>Resultado Global del Período</h2>
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
            Promedio ponderado de todos los KPIs asignados
          </p>
        </div>
      </div>

      <div className="kpis-section">
        <h2>Lista de KPIs</h2>
        {kpis && kpis.length > 0 ? (
          <div className="kpis-table-container">
            <table className="kpis-table">
              <thead>
                <tr>
                  <th>KPI</th>
                  <th>Descripción</th>
                  <th>Target</th>
                  <th>Alcance</th>
                  <th>Variación</th>
                  <th>Ponderación</th>
                  <th>Alcance Ponderado</th>
                  <th>Criterio</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {kpis.map((kpi) => (
                  <tr key={kpi.id}>
                    <td className="kpi-name">{kpi.kpiName || `KPI ${kpi.kpiId}`}</td>
                    <td className="kpi-description">
                      {kpi.kpiDescription || '-'}
                    </td>
                    <td className="kpi-target">{kpi.target}</td>
                    <td className="kpi-actual">
                      {kpi.actual !== null && kpi.actual !== undefined
                        ? kpi.actual
                        : '-'}
                    </td>
                    <td className="kpi-variation">
                      {kpi.variation !== null && kpi.variation !== undefined
                        ? `${kpi.variation.toFixed(1)}%`
                        : '-'}
                    </td>
                    <td className="kpi-weight">{kpi.weight}%</td>
                    <td className="kpi-weighted">
                      {kpi.weightedResult !== null &&
                      kpi.weightedResult !== undefined
                        ? `${kpi.weightedResult.toFixed(1)}%`
                        : '-'}
                    </td>
                    <td className="kpi-criteria">
                      {kpi.kpiCriteria || '-'}
                    </td>
                    <td>
                      <span
                        className={`kpi-status kpi-status-${kpi.status}`}
                      >
                        {kpi.status === 'draft' && 'Borrador'}
                        {kpi.status === 'proposed' && 'Propuesto'}
                        {kpi.status === 'approved' && 'Aprobado'}
                        {kpi.status === 'closed' && 'Cerrado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <h3>No hay KPIs asignados</h3>
            <p>No tienes KPIs asignados para este período</p>
          </div>
        )}
      </div>

      {chartData.length > 0 && (
        <div className="chart-section">
          <h2>Gráfico de Resultados</h2>
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
                <YAxis />
                <Tooltip />
                <Bar dataKey="target" fill="#3b82f6" name="Target" />
                <Bar dataKey="actual" fill="#10b981" name="Actual" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
