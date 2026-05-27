/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import api from '../services/api'
import { Period, ScopeKPI, SubPeriod } from '../types'
import './Simulador.css'

/* ── Types ───────────────────────────────────────────────── */
type ExecutiveTreeNode = {
  scope: { id: number; name: string; type: string; parentId?: number | null }
  summary: any
  objectives: string[]
  scopeKpis: ScopeKPI[]
  children: ExecutiveTreeNode[]
}

type ExecutiveTreeResponse = {
  periodId: number | null
  periodName?: string | null
  subPeriodId: number | null
  companies: ExecutiveTreeNode[]
}

/* ── Helpers ─────────────────────────────────────────────── */
const toFinite = (v?: number | null): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const riskLevel = (v: number | null): 'green' | 'yellow' | 'red' | 'none' => {
  if (v == null) return 'none'
  if (v >= 100) return 'green'
  if (v >= 80) return 'yellow'
  return 'red'
}

const currentLocale = () => ((i18n.resolvedLanguage || i18n.language || 'es').startsWith('en') ? 'en-US' : 'es-AR')

const fmt = (v: number | null, digits = 1) =>
  v == null ? '-' : new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: digits }).format(v)

const getScopeTypeLabel = (scopeType?: string | null) =>
  scopeType
    ? i18n.t(`executive:labels.scope_types.${scopeType}`, { defaultValue: scopeType.replace(/_/g, ' ') })
    : '-'

/* Collect all scope KPIs from the entire tree */
const collectAllKpis = (nodes: ExecutiveTreeNode[]): ScopeKPI[] =>
  nodes.flatMap((n) => [...n.scopeKpis, ...collectAllKpis(n.children)])

/* Collect all non-company nodes */
const collectAreas = (nodes: ExecutiveTreeNode[]): ExecutiveTreeNode[] =>
  nodes.flatMap((n) => {
    const children = collectAreas(n.children)
    if (['area', 'business_unit', 'team'].includes(n.scope.type)) {
      return [n, ...children]
    }
    return children
  })

/* Compute simulated average for a node */
const simNodeAvg = (
  node: ExecutiveTreeNode,
  simValues: Record<number, number>
): number | null => {
  const values: number[] = []
  const walk = (n: ExecutiveTreeNode) => {
    n.scopeKpis.forEach((k) => {
      const v = simValues[k.id] !== undefined ? simValues[k.id] : toFinite(k.variation)
      if (v != null) values.push(v)
    })
    n.children.forEach(walk)
  }
  walk(node)
  if (!values.length) return null
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1))
}

/* ── Impact delta badge ───────────────────────────────────── */
const DeltaBadge = ({ before, after }: { before: number | null; after: number | null }) => {
  if (before == null || after == null) return null
  const delta = after - before
  if (Math.abs(delta) < 0.05) return <span className="sim-delta-neutral">±0</span>
  return (
    <span className={`sim-delta ${delta > 0 ? 'positive' : 'negative'}`}>
      {delta > 0 ? '▲' : '▼'} {fmt(Math.abs(delta))}pp
    </span>
  )
}

/* ── Level transition indicator ─────────────────────────────*/
const LevelTransition = ({
  before,
  after,
}: {
  before: number | null
  after: number | null
}) => {
  const { t } = useTranslation('executive')
  const lvlBefore = riskLevel(before)
  const lvlAfter = riskLevel(after)
  if (lvlBefore === lvlAfter) return null

  const getLevelLabel = (lvl: string): string => {
    switch (lvl) {
      case 'red': return t('risk.at_risk')
      case 'yellow': return t('risk.warning')
      case 'green': return t('risk.on_track')
      default: return t('risk.no_data')
    }
  }

  return (
    <span className={`sim-transition sim-transition-${lvlAfter}`}>
      {getLevelLabel(lvlBefore)} → {getLevelLabel(lvlAfter)}
    </span>
  )
}

/* ── Main component ──────────────────────────────────────── */
export default function Simulador() {
  const { t } = useTranslation('executive')
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [selectedSubPeriodId, setSelectedSubPeriodId] = useState<number | null>(null)
  const [simValues, setSimValues] = useState<Record<number, number>>({})
  const [filterKpiName, setFilterKpiName] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<'sliders' | 'impact'>('sliders')

  const { data: periods } = useQuery<Period[]>('periods', async () => (await api.get('/periods')).data)

  const { data: subPeriods } = useQuery<SubPeriod[]>(
    ['sim-sub-periods', selectedPeriodId],
    async () => {
      if (!selectedPeriodId) return []
      return (await api.get(`/periods/${selectedPeriodId}/sub-periods`)).data
    },
    { enabled: !!selectedPeriodId }
  )

  const { data: tree, isLoading } = useQuery<ExecutiveTreeResponse>(
    ['sim-tree', selectedPeriodId, selectedSubPeriodId],
    async () =>
      (
        await api.get('/dashboard/executive-tree', {
          params: {
            periodId: selectedPeriodId || undefined,
            subPeriodId: selectedSubPeriodId || undefined,
          },
        })
      ).data,
    {
      retry: false,
      onSuccess: () => setSimValues({}),
    }
  )

  /* All unique KPI names */
  const allKpis = useMemo(() => {
    if (!tree) return []
    return collectAllKpis(tree.companies)
  }, [tree])

  const uniqueKpiNames = useMemo(() => {
    const names = new Set(allKpis.map((k) => k.name))
    return Array.from(names).sort()
  }, [allKpis])

  /* KPIs filtered by selected name */
  const visibleKpis = useMemo(() => {
    if (filterKpiName === 'all') return allKpis
    return allKpis.filter((k) => k.name === filterKpiName)
  }, [allKpis, filterKpiName])

  /* All areas with before/after averages */
  const areas = useMemo(() => {
    if (!tree) return []
    return collectAreas(tree.companies.flatMap((c) => (c.children.length ? c.children : [c])))
  }, [tree])

  const areasWithSim = useMemo(
    () =>
      areas.map((a) => ({
        area: a,
        before: simNodeAvg(a, {}),
        after: simNodeAvg(a, simValues),
      })),
    [areas, simValues]
  )

  /* Org-level summary */
  const orgSummary = useMemo(() => {
    const countBefore = { red: 0, yellow: 0, green: 0, none: 0 }
    const countAfter = { red: 0, yellow: 0, green: 0, none: 0 }
    areasWithSim.forEach(({ before, after }) => {
      countBefore[riskLevel(before)]++
      countAfter[riskLevel(after)]++
    })
    return { before: countBefore, after: countAfter }
  }, [areasWithSim])

  const hasChanges = Object.keys(simValues).length > 0

  const handleSlider = (kpiId: number, value: number) => {
    setSimValues((prev) => ({ ...prev, [kpiId]: value }))
  }

  const handleReset = () => setSimValues({})

  return (
    <div className="simulador-page">
      {/* Header */}
      <div className="sim-header">
        <div>
          <h1>{t('simulador.title')}</h1>
          <p className="sim-subtitle">{t('simulador.subtitle')}</p>
        </div>
        {hasChanges && (
          <button className="btn-secondary sim-reset-btn" onClick={handleReset}>
            {t('simulador.reset_btn')}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="sim-filters">
        <label>
          {t('simulador.filter_period')}
          <select
            value={selectedPeriodId || ''}
            onChange={(e) => {
              setSelectedPeriodId(e.target.value ? Number(e.target.value) : null)
              setSelectedSubPeriodId(null)
              setSimValues({})
            }}
          >
            <option value="">{t('simulador.filter_auto')}</option>
            {(periods || []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label>
          {t('simulador.filter_subperiod')}
          <select
            value={selectedSubPeriodId || ''}
            onChange={(e) => {
              setSelectedSubPeriodId(e.target.value ? Number(e.target.value) : null)
              setSimValues({})
            }}
          >
            <option value="">{t('simulador.filter_auto')}</option>
            {(subPeriods || []).map((sp) => (
              <option key={sp.id} value={sp.id}>{sp.name}</option>
            ))}
          </select>
        </label>
        <label>
          {t('simulador.filter_kpi')}
          <select value={filterKpiName} onChange={(e) => setFilterKpiName(e.target.value)}>
            <option value="all">{t('simulador.filter_all_kpis')}</option>
            {uniqueKpiNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
      </div>

      {isLoading ? (
        <div className="sim-empty">{t('simulador.loading')}</div>
      ) : !allKpis.length ? (
        <div className="sim-empty">{t('simulador.no_kpis')}</div>
      ) : (
        <>
          {/* Impact summary bar */}
          {hasChanges && (
            <div className="sim-impact-summary">
              <span className="sim-impact-title">{t('simulador.impact_title')}</span>
              <div className="sim-impact-pills">
                <div className="sim-impact-col">
                  <span className="sim-impact-label">{t('simulador.impact_before')}</span>
                  <div className="sim-impact-row">
                    <span className="mapa-pill green">{t('simulador.pill_on_track', { count: orgSummary.before.green })}</span>
                    <span className="mapa-pill yellow">{t('simulador.pill_warning', { count: orgSummary.before.yellow })}</span>
                    <span className="mapa-pill red">{t('simulador.pill_at_risk', { count: orgSummary.before.red })}</span>
                  </div>
                </div>
                <span className="sim-arrow">→</span>
                <div className="sim-impact-col">
                  <span className="sim-impact-label">{t('simulador.impact_after')}</span>
                  <div className="sim-impact-row">
                    <span className="mapa-pill green">{t('simulador.pill_on_track', { count: orgSummary.after.green })}</span>
                    <span className="mapa-pill yellow">{t('simulador.pill_warning', { count: orgSummary.after.yellow })}</span>
                    <span className="mapa-pill red">{t('simulador.pill_at_risk', { count: orgSummary.after.red })}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="sim-tabs">
            <button
              className={`sim-tab ${activeTab === 'sliders' ? 'active' : ''}`}
              onClick={() => setActiveTab('sliders')}
            >
              {hasChanges
                ? t('simulador.tab_sliders_modified', { count: Object.keys(simValues).length })
                : t('simulador.tab_sliders')}
            </button>
            <button
              className={`sim-tab ${activeTab === 'impact' ? 'active' : ''}`}
              onClick={() => setActiveTab('impact')}
            >
              {t('simulador.tab_impact')}
            </button>
          </div>

          {/* Sliders panel */}
          {activeTab === 'sliders' && (
            <div className="sim-sliders-panel">
              {visibleKpis.length === 0 ? (
                <div className="sim-empty">{t('simulador.no_kpis_panel')}</div>
              ) : (
                visibleKpis.map((kpi) => {
                  const originalVal = toFinite(kpi.variation)
                  const currentVal = simValues[kpi.id] !== undefined ? simValues[kpi.id] : (originalVal ?? 0)
                  const isModified = simValues[kpi.id] !== undefined
                  const lvl = riskLevel(currentVal)

                  return (
                    <div key={kpi.id} className={`sim-kpi-row ${isModified ? 'modified' : ''}`}>
                      <div className="sim-kpi-info">
                        <span className="sim-kpi-name">{kpi.name}</span>
                        <span className="sim-kpi-scope">{kpi.orgScopeName || ''}</span>
                        {isModified && originalVal != null && (
                          <DeltaBadge before={originalVal} after={currentVal} />
                        )}
                      </div>
                      <div className="sim-kpi-slider-wrap">
                        <span className="sim-kpi-original">
                          {originalVal != null
                            ? t('simulador.original_label', { value: fmt(originalVal) })
                            : t('simulador.original_no_data')}
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={150}
                          step={1}
                          value={currentVal}
                          onChange={(e) => handleSlider(kpi.id, Number(e.target.value))}
                          className={`sim-slider sim-slider-${lvl}`}
                        />
                        <span className={`sim-kpi-val sim-kpi-val-${lvl}`}>
                          {fmt(currentVal)}%
                        </span>
                      </div>
                      {isModified && (
                        <button
                          className="sim-kpi-reset"
                          onClick={() => {
                            const next = { ...simValues }
                            delete next[kpi.id]
                            setSimValues(next)
                          }}
                          title={t('simulador.restore_title')}
                        >
                          ↩
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* Impact panel */}
          {activeTab === 'impact' && (
            <div className="sim-impact-panel">
              <table className="sim-impact-table">
                <thead>
                  <tr>
                    <th>{t('simulador.impact_table_area')}</th>
                    <th>{t('simulador.impact_table_level')}</th>
                    <th>{t('simulador.impact_table_before')}</th>
                    <th>{t('simulador.impact_table_after')}</th>
                    <th>{t('simulador.impact_table_delta')}</th>
                  </tr>
                </thead>
                <tbody>
                  {areasWithSim.map(({ area, before, after }) => {
                    const lvlBefore = riskLevel(before)
                    const lvlAfter = riskLevel(after)
                    const changed = lvlBefore !== lvlAfter
                    return (
                      <tr
                        key={area.scope.id}
                        className={changed ? `sim-row-changed sim-row-to-${lvlAfter}` : ''}
                      >
                        <td className="sim-td-name">{area.scope.name}</td>
                        <td>
                          <span className="mapa-type-badge">
                            {getScopeTypeLabel(area.scope.type)}
                          </span>
                        </td>
                        <td>
                          <span className={`sim-avg-badge sim-avg-${lvlBefore}`}>
                            {before != null ? `${fmt(before)}%` : '-'}
                          </span>
                        </td>
                        <td>
                          <span className={`sim-avg-badge sim-avg-${lvlAfter}`}>
                            {after != null ? `${fmt(after)}%` : '-'}
                          </span>
                        </td>
                        <td>
                          <DeltaBadge before={before} after={after} />
                          <LevelTransition before={before} after={after} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!hasChanges && (
                <p className="sim-impact-hint">{t('simulador.impact_hint')}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
