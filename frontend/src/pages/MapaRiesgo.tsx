/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
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

const riskLabel = (variation: number | null) => {
  if (variation == null) return 'Sin datos'
  if (variation >= 100) return 'En track'
  if (variation >= 80) return 'Atención'
  return 'En riesgo'
}

const fmt = (v?: number | null, digits = 1) =>
  v == null ? '-' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(v)

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
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [selectedSubPeriodId, setSelectedSubPeriodId] = useState<number | null>(null)
  const [detailScopeKpi, setDetailScopeKpi] = useState<ScopeKPI | null>(null)
  const [filterRisk, setFilterRisk] = useState<'all' | 'red' | 'yellow'>('all')
  const [filterType, setFilterType] = useState<'all' | 'area' | 'business_unit' | 'team'>('all')

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
        <div className="mapa-empty">Este mapa está disponible para liderazgo y administración.</div>
      </div>
    )
  }

  return (
    <div className="mapa-riesgo-page">
      {/* Header */}
      <div className="mapa-header">
        <div>
          <h1>Mapa de Riesgo Organizacional</h1>
          <p className="subtitle">
            Vista de calor: KPIs × Áreas — identificá dónde está el problema sin hacer drill-down.
          </p>
        </div>
        <div className="mapa-summary-pills">
          <span className="mapa-pill green">{summary.green} en track</span>
          <span className="mapa-pill yellow">{summary.yellow} atención</span>
          <span className="mapa-pill red">{summary.red} en riesgo</span>
          {summary.none > 0 && <span className="mapa-pill none">{summary.none} sin datos</span>}
        </div>
      </div>

      {/* Filters */}
      <div className="mapa-filters">
        <label>
          Período
          <select
            value={selectedPeriodId || ''}
            onChange={(e) => {
              setSelectedPeriodId(e.target.value ? Number(e.target.value) : null)
              setSelectedSubPeriodId(null)
            }}
          >
            <option value="">Auto</option>
            {(periods || []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label>
          Subperíodo
          <select
            value={selectedSubPeriodId || ''}
            onChange={(e) => setSelectedSubPeriodId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Auto</option>
            {(subPeriods || []).map((sp) => (
              <option key={sp.id} value={sp.id}>{sp.name}</option>
            ))}
          </select>
        </label>
        <label>
          Mostrar
          <select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value as any)}>
            <option value="all">Todos los estados</option>
            <option value="red">Solo en riesgo (&lt;80%)</option>
            <option value="yellow">Solo atención (80-99%)</option>
          </select>
        </label>
        <label>
          Nivel
          <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)}>
            <option value="all">Todos los niveles</option>
            <option value="area">Áreas</option>
            <option value="business_unit">Business Units</option>
            <option value="team">Teams</option>
          </select>
        </label>
      </div>

      {/* Legend */}
      <div className="mapa-legend">
        <span className="legend-dot green" /> En track (≥100%)
        <span className="legend-dot yellow" /> Atención (80–99%)
        <span className="legend-dot red" /> En riesgo (&lt;80%)
        <span className="legend-dot none" /> Sin datos
        <span className="legend-hint">Hacé click en una celda para ver el detalle del KPI</span>
      </div>

      {isLoading ? (
        <div className="mapa-empty">Cargando mapa de riesgo...</div>
      ) : !filteredAreas.length ? (
        <div className="mapa-empty">No hay áreas que coincidan con los filtros.</div>
      ) : !allKpiNames.length ? (
        <div className="mapa-empty">No hay KPIs grupales en el período seleccionado.</div>
      ) : (
        <div className="mapa-table-wrap">
          <table className="mapa-table">
            <thead>
              <tr>
                <th className="mapa-th-area">Área / Unidad</th>
                <th className="mapa-th-type">Nivel</th>
                <th className="mapa-th-avg">Promedio</th>
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
                      <span className="mapa-type-badge">{area.scope.type.replace('_', ' ')}</span>
                    </td>
                    <td className={`mapa-td-avg heat-cell-${lvl}`}>
                      <span className="mapa-avg-val">{fmt(avg)}%</span>
                      <span className="mapa-avg-label">{riskLabel(avg)}</span>
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
          <h3>KPIs con más áreas en riesgo</h3>
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
                        title={`${redCount} en riesgo`}
                      >
                        {redCount}
                      </div>
                    )}
                    {yellowCount > 0 && (
                      <div
                        className="mapa-kpi-bar-seg yellow"
                        style={{ flex: yellowCount }}
                        title={`${yellowCount} en atención`}
                      >
                        {yellowCount}
                      </div>
                    )}
                    {greenCount > 0 && (
                      <div
                        className="mapa-kpi-bar-seg green"
                        style={{ flex: greenCount }}
                        title={`${greenCount} en track`}
                      >
                        {greenCount}
                      </div>
                    )}
                  </div>
                  <span className={`mapa-kpi-bar-avg heat-cell-${riskLevel(avgVal)}`}>
                    {avgVal != null ? `${fmt(avgVal)}%` : '-'} prom.
                  </span>
                  <span className="mapa-kpi-bar-total">{total} áreas</span>
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
