/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import api from '../services/api'
import './Analytics.css'

type Tab = 'tree' | 'trends' | 'checkins'

const formatWeek = (dateStr: string, locale: string) => {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
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
  const { t, i18n } = useTranslation(['analytics', 'common'])
  const [tab, setTab] = useState<Tab>('tree')
  const [periodId, setPeriodId] = useState<number | null>(null)
  const [checkInWeeks, setCheckInWeeks] = useState(12)
  const locale = i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'es-AR'

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
      week: formatWeek(row.weekStart, locale),
      checkIns: Number(row.total),
      mood: row.avgMood ? Number(Number(row.avgMood).toFixed(1)) : null,
    }))

  return (
    <div className="analytics-page">
      <div className="analytics-header">
        <div>
          <h1>{t('analytics:title')}</h1>
          <p className="subtitle">{t('analytics:subtitle')}</p>
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
          {t('analytics:tabs.tree')}
        </button>
        <button className={`analytics-tab ${tab === 'trends' ? 'active' : ''}`} onClick={() => setTab('trends')}>
          {t('analytics:tabs.trends')}
        </button>
        <button className={`analytics-tab ${tab === 'checkins' ? 'active' : ''}`} onClick={() => setTab('checkins')}>
          {t('analytics:tabs.checkins')}
        </button>
      </div>

      {/* ── Árbol ejecutivo ────────────────────────────────────── */}
      {tab === 'tree' && (
        <div className="analytics-section">
          {loadingTree ? (
            <div className="analytics-empty">{t('common:loading')}</div>
          ) : treeRows.length === 0 ? (
            <div className="analytics-empty">{t('analytics:empty.period_data')}</div>
          ) : (
            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>{t('analytics:table.scope')}</th>
                    <th>{t('analytics:table.total_kpis')}</th>
                    <th>{t('analytics:table.approved')}</th>
                    <th>{t('analytics:table.completion')}</th>
                    <th>{t('analytics:table.average_variation')}</th>
                    <th>{t('analytics:table.weighted_result')}</th>
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
              {t('analytics:meta.scope')} <strong>{trends.scope.name}</strong>
              {trends.periodName && <> · {t('analytics:meta.period')} <strong>{trends.periodName}</strong></>}
            </p>
          )}
          {loadingTrends ? (
            <div className="analytics-empty">{t('common:loading')}</div>
          ) : !trends?.periodSeries?.length ? (
            <div className="analytics-empty">{t('analytics:empty.trends')}</div>
          ) : (
            <div className="analytics-charts">
              <div className="analytics-chart-card">
                <h3>{t('analytics:charts.weighted_and_variation')}</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trends.periodSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="periodName" tick={{ fontSize: 12 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="weightedResultTotal" stroke="#f97316" name={t('analytics:series.weighted_result')} dot strokeWidth={2} />
                    <Line type="monotone" dataKey="averageVariation" stroke="#6366f1" name={t('analytics:series.average_variation')} dot strokeDasharray="4 2" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="analytics-chart-card">
                <h3>{t('analytics:charts.completion_by_period')}</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={trends.periodSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="periodName" tick={{ fontSize: 12 }} />
                    <YAxis unit="%" domain={[0, 100]} />
                    <Tooltip />
                    <Bar dataKey="completionRate" fill="#f97316" name={t('analytics:series.completion')} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {trends.subPeriodSeries?.length > 0 && (
                <div className="analytics-chart-card">
                  <h3>{t('analytics:charts.weighted_by_subperiod', { period: trends.periodName })}</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={trends.subPeriodSeries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="subPeriodName" tick={{ fontSize: 12 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="weightedResultTotal" fill="#6366f1" name={t('analytics:series.weighted_result')} />
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
              {t('analytics:toolbar.last_weeks')}
              <select value={checkInWeeks} onChange={(e) => setCheckInWeeks(Number(e.target.value))}>
                <option value={4}>4</option>
                <option value={8}>8</option>
                <option value={12}>12</option>
                <option value={24}>24</option>
              </select>
            </label>
          </div>

          {loadingCheckIns ? (
            <div className="analytics-empty">{t('common:loading')}</div>
          ) : !checkInChartData.length ? (
            <div className="analytics-empty">{t('analytics:empty.checkins')}</div>
          ) : (
            <div className="analytics-charts">
              <div className="analytics-chart-card">
                <h3>{t('analytics:charts.weekly_participation')}</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={checkInChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="checkIns" fill="#f97316" name={t('analytics:series.checkins')} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="analytics-chart-card">
                <h3>{t('analytics:charts.team_mood')}</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={checkInChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="mood"
                      stroke="#6366f1"
                      name={t('analytics:series.mood')}
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
