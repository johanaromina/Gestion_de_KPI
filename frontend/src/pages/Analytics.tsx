/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useQuery } from 'react-query'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import api from '../services/api'
import './Analytics.css'

type Tab = 'tree' | 'trends' | 'checkins'

const formatWeek = (dateStr: string) => {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

const flattenTree = (nodes: any[], depth = 0): any[] => {
  const result: any[] = []
  for (const node of nodes) {
    result.push({ ...node, depth })
    if (node.children?.length) result.push(...flattenTree(node.children, depth + 1))
  }
  return result
}

const completionColor = (rate: number) =>
  rate >= 80 ? '#16a34a' : rate >= 50 ? '#d97706' : '#dc2626'

export default function Analytics() {
  const [tab, setTab] = useState<Tab>('tree')
  const [periodId, setPeriodId] = useState<number | null>(null)
  const [checkInWeeks, setCheckInWeeks] = useState(12)

  const { data: periods } = useQuery<any[]>(
    'periods',
    async () => (await api.get('/periods')).data
  )

  const activePeriodId =
    periodId ??
    periods?.find((p: any) => p.status === 'open')?.id ??
    periods?.[0]?.id ??
    null

  const { data: treeData, isLoading: loadingTree } = useQuery(
    ['executive-tree-analytics', activePeriodId],
    async () =>
      (await api.get('/dashboard/executive-tree', { params: { periodId: activePeriodId } })).data,
    { enabled: !!activePeriodId && tab === 'tree' }
  )

  const { data: trends, isLoading: loadingTrends } = useQuery(
    ['executive-trends-analytics', activePeriodId],
    async () =>
      (await api.get('/dashboard/executive-trends', { params: { periodId: activePeriodId } })).data,
    { enabled: tab === 'trends' }
  )

  const { data: checkInSummary, isLoading: loadingCheckIns } = useQuery(
    ['check-in-summary-analytics', checkInWeeks],
    async () =>
      (await api.get('/check-ins/team-summary', { params: { weeks: checkInWeeks } })).data,
    { enabled: tab === 'checkins' }
  )

  const treeRows = treeData?.companies ? flattenTree(treeData.companies) : []

  const checkInChartData = ((checkInSummary ?? []) as any[])
    .slice()
    .reverse()
    .map((row) => ({
      semana: formatWeek(row.weekStart),
      'Check-ins': Number(row.total),
      'Mood': row.avgMood ? Number(Number(row.avgMood).toFixed(1)) : null,
    }))

  return (
    <div className="analytics-page">
      <div className="analytics-header">
        <div>
          <h1>Analítica</h1>
          <p className="subtitle">Árbol ejecutivo, tendencias de KPIs y pulso del equipo</p>
        </div>
        <select
          className="analytics-period-select"
          value={activePeriodId ?? ''}
          onChange={(e) => setPeriodId(e.target.value ? Number(e.target.value) : null)}
        >
          {(periods ?? []).map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="analytics-tabs">
        <button className={`analytics-tab ${tab === 'tree' ? 'active' : ''}`} onClick={() => setTab('tree')}>
          Árbol ejecutivo
        </button>
        <button className={`analytics-tab ${tab === 'trends' ? 'active' : ''}`} onClick={() => setTab('trends')}>
          Tendencias KPI
        </button>
        <button className={`analytics-tab ${tab === 'checkins' ? 'active' : ''}`} onClick={() => setTab('checkins')}>
          Check-ins
        </button>
      </div>

      {/* ── Árbol ejecutivo ────────────────────────────────────── */}
      {tab === 'tree' && (
        <div className="analytics-section">
          {loadingTree ? (
            <div className="analytics-empty">Cargando...</div>
          ) : treeRows.length === 0 ? (
            <div className="analytics-empty">No hay datos para este período.</div>
          ) : (
            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Scope</th>
                    <th>KPIs totales</th>
                    <th>Aprobados</th>
                    <th>Completitud</th>
                    <th>Variación prom.</th>
                    <th>Resultado pond.</th>
                  </tr>
                </thead>
                <tbody>
                  {treeRows.map((row: any, i: number) => {
                    const s = row.summary
                    return (
                      <tr key={i} className={`tree-row depth-${Math.min(row.depth, 2)}`}>
                        <td>
                          <span className="tree-label" style={{ paddingLeft: `${row.depth * 18}px` }}>
                            {row.depth > 0 ? <span className="tree-arrow">↳</span> : null}
                            {row.scope.name}
                            <span className="tree-type-badge">{row.scope.type}</span>
                          </span>
                        </td>
                        <td>{s.totalScopeKpis}</td>
                        <td>{s.approvedScopeKpis}</td>
                        <td>
                          <div className="completion-bar-wrap">
                            <div
                              className="completion-bar"
                              style={{
                                width: `${Math.min(s.completionRate ?? 0, 100)}%`,
                                background: completionColor(s.completionRate ?? 0),
                              }}
                            />
                            <span className="completion-pct">{(s.completionRate ?? 0).toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className={
                          s.averageVariation == null ? '' :
                          s.averageVariation >= 100 ? 'cell-green' :
                          s.averageVariation >= 80 ? 'cell-amber' : 'cell-red'
                        }>
                          {s.averageVariation != null ? `${s.averageVariation.toFixed(1)}%` : '—'}
                        </td>
                        <td>{s.weightedResultTotal != null ? s.weightedResultTotal.toFixed(1) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tendencias KPI ─────────────────────────────────────── */}
      {tab === 'trends' && (
        <div className="analytics-section">
          {trends?.scope && (
            <p className="analytics-meta">
              Scope: <strong>{trends.scope.name}</strong>
              {trends.periodName && <> · Período: <strong>{trends.periodName}</strong></>}
            </p>
          )}
          {loadingTrends ? (
            <div className="analytics-empty">Cargando...</div>
          ) : !trends?.periodSeries?.length ? (
            <div className="analytics-empty">No hay tendencias disponibles para este período.</div>
          ) : (
            <div className="analytics-charts">
              <div className="analytics-chart-card">
                <h3>Resultado ponderado y variación por período</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trends.periodSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="periodName" tick={{ fontSize: 12 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="weightedResultTotal" stroke="#f97316" name="Resultado pond." dot strokeWidth={2} />
                    <Line type="monotone" dataKey="averageVariation" stroke="#6366f1" name="Variación prom. %" dot strokeDasharray="4 2" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="analytics-chart-card">
                <h3>Completitud por período</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={trends.periodSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="periodName" tick={{ fontSize: 12 }} />
                    <YAxis unit="%" domain={[0, 100]} />
                    <Tooltip />
                    <Bar dataKey="completionRate" fill="#f97316" name="Completitud %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {trends.subPeriodSeries?.length > 0 && (
                <div className="analytics-chart-card">
                  <h3>Resultado pond. por subperíodo ({trends.periodName})</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={trends.subPeriodSeries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="subPeriodName" tick={{ fontSize: 12 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="weightedResultTotal" fill="#6366f1" name="Resultado pond." />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Check-ins ──────────────────────────────────────────── */}
      {tab === 'checkins' && (
        <div className="analytics-section">
          <div className="analytics-toolbar">
            <label>
              Últimas semanas
              <select value={checkInWeeks} onChange={(e) => setCheckInWeeks(Number(e.target.value))}>
                <option value={4}>4</option>
                <option value={8}>8</option>
                <option value={12}>12</option>
                <option value={24}>24</option>
              </select>
            </label>
          </div>

          {loadingCheckIns ? (
            <div className="analytics-empty">Cargando...</div>
          ) : !checkInChartData.length ? (
            <div className="analytics-empty">No hay check-ins registrados en este período.</div>
          ) : (
            <div className="analytics-charts">
              <div className="analytics-chart-card">
                <h3>Participación semanal</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={checkInChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="Check-ins" fill="#f97316" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="analytics-chart-card">
                <h3>Mood promedio del equipo (1 = muy mal · 5 = muy bien)</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={checkInChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                    <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="Mood"
                      stroke="#6366f1"
                      dot
                      strokeWidth={2}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
