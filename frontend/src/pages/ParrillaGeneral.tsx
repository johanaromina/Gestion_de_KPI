import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { Navigate, useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { CollaboratorKPI } from '../types'
import './ParrillaGeneral.css'

const toNumber = (val: any): number | null => {
  const n = Number(val)
  return Number.isFinite(n) ? n : null
}

export default function ParrillaGeneral() {
  const { user } = useAuth()
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  if (!user?.hasSuperpowers) {
    return <Navigate to="/" replace />
  }

  const { data: periods } = useQuery('periods', async () => {
    const res = await api.get('/periods')
    return res.data
  })

  const { data: collaborators } = useQuery('collaborators', async () => {
    const res = await api.get('/collaborators')
    return res.data
  })

  const { data: assignments, isLoading } = useQuery<CollaboratorKPI[]>(
    ['collaborator-kpis', selectedPeriodId, selectedCollaboratorId],
    async () => {
      let url = '/collaborator-kpis'
      if (selectedPeriodId) {
        url = `/collaborator-kpis/period/${selectedPeriodId}`
      } else if (selectedCollaboratorId) {
        url = `/collaborator-kpis/collaborator/${selectedCollaboratorId}`
      }
      const res = await api.get(url)
      return res.data
    },
    { enabled: true }
  )

  const summaryRows = useMemo(
    () => assignments?.filter((a) => (a as any).subPeriodId == null) || [],
    [assignments]
  )

  const monthlyByKey = useMemo(() => {
    const map = new Map<string, CollaboratorKPI[]>()
    assignments
      ?.filter((a) => (a as any).subPeriodId !== null)
      ?.forEach((a: any) => {
        const key = `${a.collaboratorId}-${a.kpiId}-${a.periodId}`
        const arr = map.get(key) || []
        arr.push(a)
        map.set(key, arr)
      })
    // sort by subPeriodId asc
    map.forEach((arr, key) => {
      arr.sort((a: any, b: any) => (a.subPeriodId || 0) - (b.subPeriodId || 0))
    })
    return map
  }, [assignments])

  const filtered = summaryRows.filter((a) => {
    const matchPeriod = !selectedPeriodId || a.periodId === selectedPeriodId
    const matchCollab = !selectedCollaboratorId || a.collaboratorId === selectedCollaboratorId
    const matchSearch =
      !search ||
      (collaborators?.find((c: any) => c.id === a.collaboratorId)?.name || '')
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      (a as any).kpiName?.toLowerCase().includes(search.toLowerCase())
    return matchPeriod && matchCollab && matchSearch
  })

  const cardsByCollaborator = useMemo(() => {
    const grouped: Record<
      number,
      {
        collabName: string
        totalKpis: number
        weightSum: number
        avgVariation: number | null
        worstVariation: number | null
      }
    > = {}
    filtered.forEach((a) => {
      const name = collaborators?.find((c: any) => c.id === a.collaboratorId)?.name || String(a.collaboratorId)
      const key = a.collaboratorId
      const variation = toNumber((a as any).variation)
      if (!grouped[key]) {
        grouped[key] = { collabName: name, totalKpis: 0, weightSum: 0, avgVariation: 0, worstVariation: null }
      }
      grouped[key].totalKpis += 1
      grouped[key].weightSum += toNumber(a.weight) || 0
      if (variation !== null) {
        grouped[key].avgVariation = (grouped[key].avgVariation || 0) + variation
        grouped[key].worstVariation =
          grouped[key].worstVariation === null ? variation : Math.min(grouped[key].worstVariation, variation)
      }
    })
    Object.values(grouped).forEach((g) => {
      g.avgVariation = g.totalKpis > 0 ? Number(((g.avgVariation || 0) / g.totalKpis).toFixed(1)) : null
    })
    return grouped
  }, [filtered, collaborators])

  const variationClass = (v: number | null) => {
    if (v === null) return ''
    if (v >= 100) return 'var-good'
    if (v >= 90) return 'var-warn'
    return 'var-bad'
  }

  return (
    <div className="parrilla-general-page">
      <div className="page-header">
        <div>
          <h1>Parrilla General (solo superpoderes)</h1>
          <p className="subtitle">Resumen de KPI por colaborador</p>
        </div>
      </div>

      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="pg-search">Buscar</label>
          <input
            id="pg-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por colaborador o KPI..."
          />
        </div>

        <div className="filter-group">
          <label htmlFor="pg-period">Período</label>
          <select
            id="pg-period"
            value={selectedPeriodId || ''}
            onChange={(e) => setSelectedPeriodId(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">Todos</option>
            {periods?.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="pg-collab">Colaborador</label>
          <select
            id="pg-collab"
            value={selectedCollaboratorId || ''}
            onChange={(e) => setSelectedCollaboratorId(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">Todos</option>
            {collaborators?.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="cards-grid">
        {Object.entries(cardsByCollaborator).map(([collabId, data]) => (
          <div
            key={collabId}
            className={`summary-card ${data.weightSum === 100 ? 'ok' : data.weightSum > 100 ? 'error' : 'warn'}`}
          >
            <div className="card-title">{data.collabName}</div>
            <div className="card-meta">KPIs: {data.totalKpis}</div>
            <div className="card-row">
              <span>Peso total</span>
              <strong>{data.weightSum.toFixed(1)}%</strong>
            </div>
            <div className="card-row">
              <span>Avg variación</span>
              <strong className={variationClass(data.avgVariation)}>{data.avgVariation ?? '-'}%</strong>
            </div>
            <div className="card-row">
              <span>Peor variación</span>
              <strong className={variationClass(data.worstVariation)}>{data.worstVariation ?? '-'}%</strong>
            </div>
          </div>
        ))}
      </div>

      <div className="table-container">
        {isLoading ? (
          <div className="loading">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>Sin datos</h3>
            <p>Prueba con otros filtros</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>KPI</th>
                <th>Período</th>
                <th>Tipo</th>
                <th>Target</th>
                <th>Actual</th>
                <th>Peso</th>
                <th>Variación</th>
                <th>Estado</th>
                <th>Tendencia</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td>{collaborators?.find((c: any) => c.id === a.collaboratorId)?.name || a.collaboratorId}</td>
                  <td>{(a as any).kpiName || a.kpiId}</td>
                  <td>{(a as any).periodName || a.periodId}</td>
                  <td>
                    <span className={`badge-type ${(a as any).kpiType || ''}`}>{(a as any).kpiType || 'kpi'}</span>
                  </td>
                  <td className="number-cell">{toNumber(a.target) ?? '-'}</td>
                  <td className="number-cell">{toNumber(a.actual) ?? '-'}</td>
                  <td className="number-cell">{toNumber(a.weight) ?? 0}%</td>
                  <td className={`number-cell ${variationClass(toNumber((a as any).variation))}`}>
                    {toNumber(a.variation) !== null ? `${toNumber(a.variation)?.toFixed(1)}%` : '-'}
                  </td>
                  <td>{a.status}</td>
                  <td>
                    <div className="sparkline">
                      {(monthlyByKey.get(`${a.collaboratorId}-${a.kpiId}-${a.periodId}`) || []).map((m: any) => {
                        const v = toNumber(m.variation) ?? 0
                        const h = Math.max(5, Math.min(40, v / 3)) // scale
                        return <span key={m.id} className={`bar ${variationClass(v)}`} style={{ height: `${h}px` }} />
                      })}
                    </div>
                  </td>
                  <td>
                    <button
                      className="btn-link"
                      onClick={() =>
                        navigate(
                          `/asignaciones?periodId=${a.periodId}&collaboratorId=${a.collaboratorId}&kpiId=${a.kpiId}`
                        )
                      }
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
