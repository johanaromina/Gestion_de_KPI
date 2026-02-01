
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'react-query'
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

function formatDate(date: string) {
  const parsed = new Date(date)
  return parsed.toLocaleDateString('es-CL')
}

export default function ConsolidadoColaborador() {
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState<number | null>(null)
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)

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
          <h1>Consolidado por colaborador</h1>
          <p className="subtitle">Promedio ponderado por subperiodo y KPIs</p>
        </div>
        {consolidated && (
          <div className="period-chip">
            <span className="chip-label">Periodo</span>
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
          <label htmlFor="collaborator-select">Colaborador</label>
          <select
            id="collaborator-select"
            value={selectedCollaboratorId || ''}
            onChange={(e) => setSelectedCollaboratorId(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">Seleccione</option>
            {collaborators?.map((collaborator) => (
              <option key={collaborator.id} value={collaborator.id}>
                {collaborator.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="period-select">Periodo</label>
          <select
            id="period-select"
            value={selectedPeriodId || ''}
            onChange={(e) => setSelectedPeriodId(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">Seleccione</option>
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
          <h3>Seleccione colaborador y periodo</h3>
          <p>El consolidado se muestra una vez elegidos los filtros.</p>
        </div>
      )}

      {selectedCollaboratorId && selectedPeriodId && isLoading && (
        <div className="loading">Cargando consolidado...</div>
      )}

      {selectedCollaboratorId && selectedPeriodId && !isLoading && !consolidated && (
        <div className="empty-state">
          <div className="empty-icon">ℹ️</div>
          <h3>Sin datos para los filtros</h3>
          <p>No hay asignaciones para el colaborador y periodo seleccionados.</p>
        </div>
      )}

      {selectedCollaboratorId && selectedPeriodId && consolidated && (
        <>
          <div className="summary-cards">
            <div className="summary-card primary">
              <div className="card-label">Resultado ponderado por subperiodo</div>
              <div className="card-value">{formatPercent(consolidated.overall.resultBySubPeriodWeight)}</div>
              <p className="card-help">
                Usa peso de subperiodos (o peso total de KPIs cuando no hay peso definido).
              </p>
            </div>
            <div className="summary-card">
              <div className="card-label">Resultado ponderado por KPI</div>
              <div className="card-value">{formatPercent(consolidated.overall.resultByKpiWeight)}</div>
              <p className="card-help">Basado en el peso individual de cada KPI.</p>
            </div>
            <div className="summary-card compact">
              <div className="card-label">Peso total subperiodos</div>
              <div className="card-value small">{subPeriodTotals}%</div>
              <p className="card-help">Suma de pesos definidos en subperiodos.</p>
            </div>
          </div>

          <div className="subperiod-grid">
            {consolidated.subPeriods.map((sub) => (
              <div key={sub.id ?? 'none'} className="subperiod-card">
                <div className="subperiod-header">
                  <div>
                    <h3>{sub.name}</h3>
                    <p>{sub.kpiCount} KPI(s)</p>
                  </div>
                  <div className="subperiod-score">
                    <span>{formatPercent(sub.result)}</span>
                    <small>Ponderado</small>
                  </div>
                </div>
                <div className="subperiod-meta">
                  <span>Peso: {sub.weight ?? 's/d'}%</span>
                  <span>Peso KPIs: {sub.totalWeight}%</span>
                </div>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>KPI</th>
                        <th>Target</th>
                        <th>Alcance</th>
                        <th>Variacion</th>
                        <th>Ponderacion</th>
                        <th>Ponderado</th>
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
