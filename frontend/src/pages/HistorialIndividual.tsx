/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { useParams } from 'react-router-dom'
import api from '../services/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAuth } from '../hooks/useAuth'
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

export default function HistorialIndividual() {
  const { collaboratorId } = useParams<{ collaboratorId: string }>()
  const { user } = useAuth()
  const resolvedId = useMemo(() => {
    if (collaboratorId) return collaboratorId
    if (user?.collaboratorId) return String(user.collaboratorId)
    return ''
  }, [collaboratorId, user?.collaboratorId])

  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [selectedSubPeriodId, setSelectedSubPeriodId] = useState<number | null>(null)

  const { data: collaborator } = useQuery<Collaborator>(
    ['collaborator', resolvedId],
    async () => {
      const response = await api.get(`/collaborators/${resolvedId}`)
      return response.data
    },
    { enabled: !!resolvedId }
  )

  const { data: events } = useQuery<CollaboratorEvent[]>(
    ['collaborator-events', resolvedId],
    async () => {
      const response = await api.get(`/collaborators/${resolvedId}/events`)
      return response.data
    },
    { enabled: !!resolvedId }
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

  const { data: kpis, isLoading: loadingKPIs } = useQuery<CollaboratorKPI[]>(
    ['collaborator-kpis-historical', resolvedId],
    async () => {
      const response = await api.get(`/collaborator-kpis/collaborator/${resolvedId}`)
      return response.data
    },
    {
      enabled: !!resolvedId,
    }
  )

  const availablePeriods = useMemo(() => {
    if (!kpis) return []
    const seen = new Map<number, { id: number; name: string; status?: string }>()
    kpis.forEach((kpi) => {
      if (!seen.has(kpi.periodId)) {
        seen.set(kpi.periodId, {
          id: kpi.periodId,
          name: kpi.periodName || `Periodo ${kpi.periodId}`,
          status: (kpi as any).periodStatus,
        })
      }
    })
    return Array.from(seen.values())
  }, [kpis])

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

  const totalWeightedResult =
    filteredKPIs?.reduce((sum, kpi) => {
      return sum + (kpi.weightedResult || 0)
    }, 0) || 0

  const totalWeight =
    filteredKPIs?.reduce((sum, kpi) => {
      return sum + kpi.weight
    }, 0) || 0

  const globalResult = totalWeight > 0 ? (totalWeightedResult / totalWeight) * 100 : 0

  const chartData =
    filteredKPIs?.map((kpi) => ({
      name: kpi.kpiName || `KPI ${kpi.kpiId}`,
      target: kpi.target,
      actual: kpi.actual || 0,
      variation: kpi.variation || 0,
    })) || []

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
          <h1>Historico Individual</h1>
          {collaborator && (
            <div className="collaborator-info">
              <p className="collaborator-name">{collaborator.name}</p>
              <p className="collaborator-details">
                {collaborator.position} · {collaborator.area}
              </p>
              <div className="status-line">
                <span className={`status-pill ${collaborator.status === 'inactive' ? 'inactive' : 'active'}`}>
                  {collaborator.status === 'inactive' ? 'Inactivo' : 'Activo'}
                </span>
                {collaborator.status === 'inactive' && collaborator.inactiveAt && (
                  <span className="muted">Desde: {new Date(collaborator.inactiveAt).toLocaleDateString('es-ES')}</span>
                )}
                {collaborator.inactiveReason && <span className="muted">Motivo: {collaborator.inactiveReason}</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {events && events.length > 0 && (
        <div className="event-timeline">
          <h3>Eventos del colaborador</h3>
          <ul>
            {events.map((event) => (
              <li key={event.id}>
                <span className="event-date">
                  {new Date(event.createdAt).toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit',
                  })}
                </span>
                <span className="event-desc">
                  {event.eventType === 'termination' && 'Desvinculacion'}
                  {event.eventType === 'reactivation' && 'Reactivacion'}
                  {event.eventType === 'role_change' && 'Cambio de rol'}
                </span>
                {event.oldValue && event.newValue && (
                  <span className="muted">
                    {event.oldValue} → {event.newValue}
                  </span>
                )}
                {event.reason && <span className="muted">Motivo: {event.reason}</span>}
                {event.createdByName && <span className="muted">Por: {event.createdByName}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="period-select">Periodo:</label>
          <select
            id="period-select"
            value={selectedPeriodId || ''}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="filter-select"
          >
            <option value="">Seleccione un periodo</option>
            {optionsPeriods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </div>

        {selectedPeriodId && subPeriods && subPeriods.length > 0 && (
          <div className="filter-group">
            <label htmlFor="subperiod-select">Subperiodo (opcional):</label>
            <select
              id="subperiod-select"
              value={selectedSubPeriodId || ''}
              onChange={(e) => handleSubPeriodChange(e.target.value)}
              className="filter-select"
            >
              <option value="">Todos los subperiodos</option>
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
          <h3>Selecciona un periodo</h3>
          <p>Elige un periodo para ver el historico de resultados</p>
        </div>
      )}

      {selectedPeriodId && loadingKPIs && <div className="loading">Cargando resultados...</div>}

      {selectedPeriodId && !loadingKPIs && filteredKPIs && filteredKPIs.length > 0 && (
        <>
          <div className="global-result-card">
            <div className="result-content">
              <h2>Resultado Global del Periodo</h2>
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
                Promedio ponderado de todos los KPIs del periodo seleccionado
                {selectedSubPeriodId && ' (filtrado por subperiodo)'}
              </p>
            </div>
          </div>

          <div className="kpis-section">
            <h2>KPIs del Periodo</h2>
            <div className="read-only-badge">Modo Solo Lectura</div>
            <div className="kpis-table-container">
              <table className="kpis-table">
                <thead>
                  <tr>
                    <th>KPI</th>
                    <th>Descripcion</th>
                    <th>Target</th>
                    <th>Alcance</th>
                    <th>Variacion</th>
                    <th>Ponderacion</th>
                    <th>Alcance Ponderado</th>
                    <th>Criterio</th>
                    <th>Estado</th>
                    {selectedSubPeriodId && <th>Subperiodo</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredKPIs.map((kpi) => (
                    <tr key={kpi.id}>
                      <td className="kpi-name">{kpi.kpiName || `KPI ${kpi.kpiId}`}</td>
                      <td className="kpi-description">{kpi.kpiDescription || '-'}</td>
                      <td className="kpi-target">{kpi.target}</td>
                  <td className="kpi-actual">
                    {kpi.actual !== null && kpi.actual !== undefined ? kpi.actual : '-'}
                  </td>
                  <td className="kpi-variation">
                    {kpi.variation !== null && kpi.variation !== undefined
                      ? `${Number(kpi.variation).toFixed(1)}%`
                      : '-'}
                  </td>
                  <td className="kpi-weight">{kpi.weight}%</td>
                  <td className="kpi-weighted">
                    {kpi.weightedResult !== null && kpi.weightedResult !== undefined
                      ? `${Number(kpi.weightedResult).toFixed(1)}%`
                      : '-'}
                      </td>
                      <td className="kpi-criteria">{kpi.kpiCriteria || '-'}</td>
                      <td>
                        <span className={`kpi-status kpi-status-${kpi.status}`}>
                          {kpi.status === 'draft' && 'Borrador'}
                          {kpi.status === 'proposed' && 'Propuesto'}
                          {kpi.status === 'approved' && 'Aprobado'}
                          {kpi.status === 'closed' && 'Cerrado'}
                        </span>
                      </td>
                      {selectedSubPeriodId && <td>{kpi.subPeriodName || '-'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="chart-section">
              <h2>Grafico de Resultados</h2>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="target" fill="#e5e7eb" name="Target" />
                    <Bar dataKey="actual" fill="#f97316" name="Actual" />
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
          <h3>No hay resultados para este periodo</h3>
          <p>No se encontraron KPIs asignados para el periodo seleccionado</p>
        </div>
      )}
    </div>
  )
}
