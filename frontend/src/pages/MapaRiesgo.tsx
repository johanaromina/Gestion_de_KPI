/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { Period, ScopeKPI, SubPeriod } from '../types'
import ScopeKPIDetailModal from '../components/ScopeKPIDetailModal'
import './MapaRiesgo.css'

/* ── Types (reuse executive-tree shape) ─────────────────── */
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
const toFinite = (v?: number | null) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const riskLevel = (variation: number | null): 'green' | 'yellow' | 'red' | 'none' => {
  if (variation == null) return 'none'
  if (variation >= 100) return 'green'
  if (variation >= 80) return 'yellow'
  return 'red'
}

const currentLocale = () => ((i18n.resolvedLanguage || i18n.language || 'es').startsWith('en') ? 'en-US' : 'es-AR')

const fmt = (v?: number | null, digits = 1) =>
  v == null ? '-' : new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: digits }).format(v)

const getScopeTypeLabel = (scopeType?: string | null) =>
  scopeType
    ? i18n.t(`executive:labels.scope_types.${scopeType}`, { defaultValue: scopeType.replace(/_/g, ' ') })
    : '-'

/* Flatten all leaf-ish nodes (areas + teams) from the tree */
const collectAreas = (nodes: ExecutiveTreeNode[]): ExecutiveTreeNode[] =>
  nodes.flatMap((n) => {
    const children = collectAreas(n.children)
    if (['area', 'business_unit', 'team'].includes(n.scope.type)) {
      return [n, ...children]
    }
    return children
  })

/* Collect all unique KPI names across an area + its descendants */
const collectKpiNames = (node: ExecutiveTreeNode): string[] => {
  const names = new Set<string>()
  const walk = (n: ExecutiveTreeNode) => {
    n.scopeKpis.forEach((k) => names.add(k.name))
    n.children.forEach(walk)
  }
  walk(node)
  return Array.from(names).sort()
}

/* Find a KPI by name in a node (own or descendant) */
const findKpi = (node: ExecutiveTreeNode, kpiName: string): ScopeKPI | null => {
  const own = node.scopeKpis.find((k) => k.name === kpiName)
  if (own) return own
  for (const child of node.children) {
    const found = findKpi(child, kpiName)
    if (found) return found
  }
  return null
}

/* Average variation of all kpis in a node */
const nodeAvg = (node: ExecutiveTreeNode): number | null => {
  const values: number[] = []
  const walk = (n: ExecutiveTreeNode) => {
    n.scopeKpis.forEach((k) => {
      const v = toFinite(k.variation)
      if (v != null) values.push(v)
    })
    n.children.forEach(walk)
  }
  walk(node)
  if (!values.length) return null
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1))
}

/* ── Cell component ─────────────────────────────────────── */
const HeatCell = ({
  scopeKpi,
  onOpen,
}: {
  scopeKpi: ScopeKPI | null
  onOpen: (k: ScopeKPI) => void
}) => {
  if (!scopeKpi) {
    return <div className="heat-cell heat-cell-empty" />
  }
  const v = toFinite(scopeKpi.variation)
  const lvl = riskLevel(v)
  return (
    <button
      type="button"
      className={`heat-cell heat-cell-${lvl}`}
      onClick={() => onOpen(scopeKpi)}
      title={`${scopeKpi.name}: ${fmt(v)}%`}
    >
      <span className="heat-cell-val">{v != null ? `${fmt(v)}%` : '—'}</span>
    </button>
  )
}

/* ── Main component ──────────────────────────────────────── */
export default function MapaRiesgo() {
  const { isCollaborator } = useAuth()
  const { t } = useTranslation('executive')
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [selectedSubPeriodId, setSelectedSubPeriodId] = useState<number | null>(null)
  const [detailScopeKpi, setDetailScopeKpi] = useState<ScopeKPI | null>(null)
  const [filterRisk, setFilterRisk] = useState<'all' | 'red' | 'yellow'>('all')
  const [filterType, setFilterType] = useState<'all' | 'area' | 'business_unit' | 'team'>('all')

  const getRiskLabel = (variation: number | null): string => {
    if (variation == null) return t('risk.no_data')
    if (variation >= 100) return t('risk.on_track')
    if (variation >= 80) return t('risk.warning')
    return t('risk.at_risk')
  }

  const { data: periods } = useQuery<Period[]>('periods', async () => (await api.get('/periods')).data)

  const { data: subPeriods } = useQuery<SubPeriod[]>(
    ['mapa-riesgo-sub-periods', selectedPeriodId],
    async () => {
      if (!selectedPeriodId) return []
      return (await api.get(`/periods/${selectedPeriodId}/sub-periods`)).data
    },
    { enabled: !!selectedPeriodId }
  )

  const { data: tree, isLoading } = useQuery<ExecutiveTreeResponse>(
    ['mapa-riesgo-tree', selectedPeriodId, selectedSubPeriodId],
    async () =>
      (
        await api.get('/dashboard/executive-tree', {
          params: {
            periodId: selectedPeriodId || undefined,
            subPeriodId: selectedSubPeriodId || undefined,
          },
        })
      ).data,
    { retry: false }
  )

  /* Derive all areas and all KPI names */
  const allAreas = useMemo(() => {
    const companies = tree?.companies || []
    return companies.flatMap((c) => collectAreas(c.children.length ? c.children : [c]))
  }, [tree])

  const allKpiNames = useMemo(() => {
    const names = new Set<string>()
    allAreas.forEach((a) => collectKpiNames(a).forEach((n) => names.add(n)))
    return Array.from(names).sort()
  }, [allAreas])

  /* Filter areas */
  const filteredAreas = useMemo(() => {
    let areas = allAreas
    if (filterType !== 'all') areas = areas.filter((a) => a.scope.type === filterType)
    if (filterRisk !== 'all') {
      areas = areas.filter((a) => {
        const avg = nodeAvg(a)
        return filterRisk === 'red' ? avg != null && avg < 80 : avg != null && avg >= 80 && avg < 100
      })
    }
    return areas
  }, [allAreas, filterRisk, filterType])

  /* Summary counters */
  const summary = useMemo(() => {
    const counts = { green: 0, yellow: 0, red: 0, none: 0 }
    allAreas.forEach((a) => {
      const avg = nodeAvg(a)
      counts[riskLevel(avg)]++
    })
    return counts
  }, [allAreas])

  if (isCollaborator) {
    return (
      <div className="mapa-riesgo-page">
        <div className="mapa-empty">{t('mapa.restricted')}</div>
      </div>
    )
  }

  return (
    <div className="mapa-riesgo-page">
      {/* Header */}
      <div className="mapa-header">
        <div>
          <h1>{t('mapa.title')}</h1>
          <p className="subtitle">{t('mapa.subtitle')}</p>
        </div>
        <div className="mapa-summary-pills">
          <span className="mapa-pill green">{t('mapa.summary_on_track', { count: summary.green })}</span>
          <span className="mapa-pill yellow">{t('mapa.summary_warning', { count: summary.yellow })}</span>
          <span className="mapa-pill red">{t('mapa.summary_at_risk', { count: summary.red })}</span>
          {summary.none > 0 && <span className="mapa-pill none">{t('mapa.summary_no_data', { count: summary.none })}</span>}
        </div>
      </div>

      {/* Filters */}
      <div className="mapa-filters">
        <label>
          {t('mapa.filter_period')}
          <select
            value={selectedPeriodId || ''}
            onChange={(e) => {
              setSelectedPeriodId(e.target.value ? Number(e.target.value) : null)
              setSelectedSubPeriodId(null)
            }}
          >
            <option value="">{t('mapa.filter_auto')}</option>
            {(periods || []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label>
          {t('mapa.filter_subperiod')}
          <select
            value={selectedSubPeriodId || ''}
            onChange={(e) => setSelectedSubPeriodId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t('mapa.filter_auto')}</option>
            {(subPeriods || []).map((sp) => (
              <option key={sp.id} value={sp.id}>{sp.name}</option>
            ))}
          </select>
        </label>
        <label>
          {t('mapa.filter_show')}
          <select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value as any)}>
            <option value="all">{t('mapa.filter_show_all')}</option>
            <option value="red">{t('mapa.filter_show_red')}</option>
            <option value="yellow">{t('mapa.filter_show_yellow')}</option>
          </select>
        </label>
        <label>
          {t('mapa.filter_level')}
          <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)}>
            <option value="all">{t('mapa.filter_level_all')}</option>
            <option value="area">{t('mapa.filter_level_area')}</option>
            <option value="business_unit">{t('mapa.filter_level_bu')}</option>
            <option value="team">{t('mapa.filter_level_team')}</option>
          </select>
        </label>
      </div>

      {/* Legend */}
      <div className="mapa-legend">
        <span className="legend-dot green" /> {t('mapa.legend_on_track')}
        <span className="legend-dot yellow" /> {t('mapa.legend_warning')}
        <span className="legend-dot red" /> {t('mapa.legend_at_risk')}
        <span className="legend-dot none" /> {t('mapa.legend_no_data')}
        <span className="legend-hint">{t('mapa.legend_hint')}</span>
      </div>

      {isLoading ? (
        <div className="mapa-empty">{t('mapa.loading')}</div>
      ) : !filteredAreas.length ? (
        <div className="mapa-empty">{t('mapa.no_areas')}</div>
      ) : !allKpiNames.length ? (
        <div className="mapa-empty">{t('mapa.no_kpis')}</div>
      ) : (
        <div className="mapa-table-wrap">
          <table className="mapa-table">
            <thead>
              <tr>
                <th className="mapa-th-area">{t('mapa.table_area')}</th>
                <th className="mapa-th-type">{t('mapa.table_level')}</th>
                <th className="mapa-th-avg">{t('mapa.table_avg')}</th>
                {allKpiNames.map((name) => (
                  <th key={`kpi-col-${name}`} className="mapa-th-kpi">
                    <span>{name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAreas.map((area) => {
                const avg = nodeAvg(area)
                const lvl = riskLevel(avg)
                return (
                  <tr key={`area-row-${area.scope.id}`}>
                    <td className="mapa-td-area">
                      <span className="mapa-area-name">{area.scope.name}</span>
                    </td>
                    <td className="mapa-td-type">
                      <span className="mapa-type-badge">{getScopeTypeLabel(area.scope.type)}</span>
                    </td>
                    <td className={`mapa-td-avg heat-cell-${lvl}`}>
                      <span className="mapa-avg-val">{fmt(avg)}%</span>
                      <span className="mapa-avg-label">{getRiskLabel(avg)}</span>
                    </td>
                    {allKpiNames.map((kpiName) => {
                      const kpi = findKpi(area, kpiName)
                      return (
                        <td key={`cell-${area.scope.id}-${kpiName}`} className="mapa-td-cell">
                          <HeatCell scopeKpi={kpi} onOpen={setDetailScopeKpi} />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* KPI column totals row */}
      {!isLoading && filteredAreas.length > 0 && allKpiNames.length > 0 && (
        <div className="mapa-column-summary">
          <h3>{t('mapa.risk_bars_title')}</h3>
          <div className="mapa-kpi-risk-bars">
            {allKpiNames
              .map((kpiName) => {
                const values = filteredAreas
                  .map((a) => toFinite(findKpi(a, kpiName)?.variation))
                  .filter((v): v is number => v != null)
                const redCount = values.filter((v) => v < 80).length
                const yellowCount = values.filter((v) => v >= 80 && v < 100).length
                const greenCount = values.filter((v) => v >= 100).length
                const avgVal = values.length
                  ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1))
                  : null
                return { kpiName, redCount, yellowCount, greenCount, avgVal, total: values.length }
              })
              .sort((a, b) => b.redCount - a.redCount || b.yellowCount - a.yellowCount)
              .slice(0, 12)
              .map(({ kpiName, redCount, yellowCount, greenCount, avgVal, total }) => (
                <div key={`bar-${kpiName}`} className="mapa-kpi-bar-row">
                  <span className="mapa-kpi-bar-name">{kpiName}</span>
                  <div className="mapa-kpi-bar-track">
                    {redCount > 0 && (
                      <div
                        className="mapa-kpi-bar-seg red"
                        style={{ flex: redCount }}
                        title={t('mapa.risk_tooltip_red', { count: redCount })}
                      >
                        {redCount}
                      </div>
                    )}
                    {yellowCount > 0 && (
                      <div
                        className="mapa-kpi-bar-seg yellow"
                        style={{ flex: yellowCount }}
                        title={t('mapa.risk_tooltip_yellow', { count: yellowCount })}
                      >
                        {yellowCount}
                      </div>
                    )}
                    {greenCount > 0 && (
                      <div
                        className="mapa-kpi-bar-seg green"
                        style={{ flex: greenCount }}
                        title={t('mapa.risk_tooltip_green', { count: greenCount })}
                      >
                        {greenCount}
                      </div>
                    )}
                  </div>
                  <span className={`mapa-kpi-bar-avg heat-cell-${riskLevel(avgVal)}`}>
                    {avgVal != null ? t('mapa.risk_prom', { value: fmt(avgVal) }) : '-'}
                  </span>
                  <span className="mapa-kpi-bar-total">{t('mapa.risk_areas', { count: total })}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {detailScopeKpi && (
        <ScopeKPIDetailModal
          scopeKpiId={detailScopeKpi.id}
          initialScopeKpi={detailScopeKpi}
          onClose={() => setDetailScopeKpi(null)}
        />
      )}
    </div>
  )
}
