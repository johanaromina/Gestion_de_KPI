import { useState } from 'react'
import { useQuery } from 'react-query'
import { useParams } from 'react-router-dom'
import api from '../services/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
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
  variation?: number
  weightedResult?: number
  status: 'draft' | 'proposed' | 'approved' | 'closed'
  comments?: string
  kpiName?: string
  kpiDescription?: string
  kpiCriteria?: string
  kpiType?: 'growth' | 'reduction' | 'exact'
  periodName?: string
  subPeriodName?: string
}

export default function HistorialIndividual() {
  const { collaboratorId } = useParams<{ collaboratorId: string }>()
  const id = collaboratorId || '1'

  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [selectedSubPeriodId, setSelectedSubPeriodId] = useState<number | null>(null)

  // Obtener colaborador
  const { data: collaborator } = useQuery(
    ['collaborator', id],
    async () => {
      const response = await api.get(`/collaborators/${id}`)
      return response.data
    }
  )

  // Obtener todos los períodos
  const { data: periods } = useQuery<Period[]>(
    'periods',
    async () => {
      const response = await api.get('/periods')
      return response.data
    }
  )

  // Obtener subperíodos del período seleccionado
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

  // Obtener KPIs del colaborador para el período/subperíodo seleccionado
  const { data: kpis, isLoading: loadingKPIs } = useQuery<CollaboratorKPI[]>(
    ['collaborator-kpis-historical', id, selectedPeriodId, selectedSubPeriodId],
    async () => {
      const response = await api.get(`/collaborator-kpis/collaborator/${id}`, {
        params: {
          periodId: selectedPeriodId,
        },
      })
      return response.data
    },
    {
      enabled: !!selectedPeriodId,
    }
  )

  // Filtrar KPIs por subperíodo si está seleccionado
  const filteredKPIs = selectedSubPeriodId
    ? kpis?.filter((kpi) => kpi.subPeriodId === selectedSubPeriodId)
    : kpis

  // Calcular resultado global
  const totalWeightedResult = filteredKPIs?.reduce((sum, kpi) => {
    return sum + (kpi.weightedResult || 0)
  }, 0) || 0

  const totalWeight = filteredKPIs?.reduce((sum, kpi) => {
    return sum + kpi.weight
  }, 0) || 0

  const globalResult = totalWeight > 0 ? (totalWeightedResult / totalWeight) * 100 : 0

  // Datos para gráfico
  const chartData = filteredKPIs?.map((kpi) => ({
    name: kpi.kpiName || `KPI ${kpi.kpiId}`,
    target: kpi.target,
    actual: kpi.actual || 0,
    variation: kpi.variation || 0,
  })) || []

  // Datos para gráfico de evolución (si hay múltiples períodos)
  const evolutionData = periods?.map((period) => {
    // Esto requeriría una consulta adicional, por ahora placeholder
    return {
      period: period.name,
      result: 0, // Se calcularía con los KPIs de ese período
    }
  }) || []

  const handlePeriodChange = (periodId: string) => {
    const periodIdNum = periodId ? parseInt(periodId) : null
    setSelectedPeriodId(periodIdNum)
    setSelectedSubPeriodId(null) // Reset subperíodo al cambiar período
  }

  const handleSubPeriodChange = (subPeriodId: string) => {
    const subPeriodIdNum = subPeriodId ? parseInt(subPeriodId) : null
    setSelectedSubPeriodId(subPeriodIdNum)
  }

  return (
    <div className="historial-individual-page">
      <div className="historial-header">
        <div>
          <h1>Histórico Individual</h1>
          {collaborator && (
            <div className="collaborator-info">
              <p className="collaborator-name">{collaborator.name}</p>
              <p className="collaborator-details">
                {collaborator.position} • {collaborator.area}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="period-select">Período:</label>
          <select
            id="period-select"
            value={selectedPeriodId || ''}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="filter-select"
          >
            <option value="">Seleccione un período</option>
            {periods?.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name} ({new Date(period.startDate).getFullYear()})
              </option>
            ))}
          </select>
        </div>

        {selectedPeriodId && subPeriods && subPeriods.length > 0 && (
          <div className="filter-group">
            <label htmlFor="subperiod-select">Subperíodo (opcional):</label>
            <select
              id="subperiod-select"
              value={selectedSubPeriodId || ''}
              onChange={(e) => handleSubPeriodChange(e.target.value)}
              className="filter-select"
            >
              <option value="">Todos los subperíodos</option>
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
          <div className="empty-icon">📅</div>
          <h3>Selecciona un período</h3>
          <p>Elige un período para ver el histórico de resultados</p>
        </div>
      )}

      {selectedPeriodId && loadingKPIs && (
        <div className="loading">Cargando resultados...</div>
      )}

      {selectedPeriodId && !loadingKPIs && filteredKPIs && filteredKPIs.length > 0 && (
        <>
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
                Promedio ponderado de todos los KPIs del período seleccionado
                {selectedSubPeriodId && ' (filtrado por subperíodo)'}
              </p>
            </div>
          </div>

          <div className="kpis-section">
            <h2>KPIs del Período</h2>
            <div className="read-only-badge">Modo Solo Lectura</div>
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
                    {selectedSubPeriodId && <th>Subperíodo</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredKPIs.map((kpi) => (
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
                      {selectedSubPeriodId && (
                        <td>{kpi.subPeriodName || '-'}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
        </>
      )}

      {selectedPeriodId && !loadingKPIs && (!filteredKPIs || filteredKPIs.length === 0) && (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h3>No hay resultados para este período</h3>
          <p>No se encontraron KPIs asignados para el período seleccionado</p>
        </div>
      )}
    </div>
  )
}

