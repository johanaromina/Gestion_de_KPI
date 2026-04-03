/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
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

const fmt = (v: number | null, digits = 1) =>
  v == null ? '-' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(v)

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
  const lvlBefore = riskLevel(before)
  const lvlAfter = riskLevel(after)
  if (lvlBefore === lvlAfter) return null
  const labels: Record<string, string> = {
    red: 'En riesgo',
    yellow: 'Atención',
    green: 'En track',
    none: 'Sin datos',
  }
  return (
    <span className={`sim-transition sim-transition-${lvlAfter}`}>
      {labels[lvlBefore]} → {labels[lvlAfter]}
    </span>
  )
}

/* ── Main component ──────────────────────────────────────── */
export default function Simulador() {
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
          <h1>Simulador ¿Qué pasa si...?</h1>
          <p className="sim-subtitle">
            Ajustá los valores de cualquier KPI grupal y visualizá el impacto en cascada sobre toda la organización — sin modificar datos reales.
          </p>
        </div>
        {hasChanges && (
          <button className="btn-secondary sim-reset-btn" onClick={handleReset}>
            Reiniciar simulación
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="sim-filters">
        <label>
          Período
          <select
            value={selectedPeriodId || ''}
            onChange={(e) => {
              setSelectedPeriodId(e.target.value ? Number(e.target.value) : null)
              setSelectedSubPeriodId(null)
              setSimValues({})
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
            onChange={(e) => {
              setSelectedSubPeriodId(e.target.value ? Number(e.target.value) : null)
              setSimValues({})
            }}
          >
            <option value="">Auto</option>
            {(subPeriods || []).map((sp) => (
              <option key={sp.id} value={sp.id}>{sp.name}</option>
            ))}
          </select>
        </label>
        <label>
          Filtrar por KPI
          <select value={filterKpiName} onChange={(e) => setFilterKpiName(e.target.value)}>
            <option value="all">Todos los KPIs</option>
            {uniqueKpiNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
      </div>

      {isLoading ? (
        <div className="sim-empty">Cargando datos...</div>
      ) : !allKpis.length ? (
        <div className="sim-empty">No hay KPIs grupales en el período seleccionado.</div>
      ) : (
        <>
          {/* Impact summary bar */}
          {hasChanges && (
            <div className="sim-impact-summary">
              <span className="sim-impact-title">Impacto simulado</span>
              <div className="sim-impact-pills">
                <div className="sim-impact-col">
                  <span className="sim-impact-label">Antes</span>
                  <div className="sim-impact-row">
                    <span className="mapa-pill green">{orgSummary.before.green} en track</span>
                    <span className="mapa-pill yellow">{orgSummary.before.yellow} atención</span>
                    <span className="mapa-pill red">{orgSummary.before.red} en riesgo</span>
                  </div>
                </div>
                <span className="sim-arrow">→</span>
                <div className="sim-impact-col">
                  <span className="sim-impact-label">Después</span>
                  <div className="sim-impact-row">
                    <span className="mapa-pill green">{orgSummary.after.green} en track</span>
                    <span className="mapa-pill yellow">{orgSummary.after.yellow} atención</span>
                    <span className="mapa-pill red">{orgSummary.after.red} en riesgo</span>
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
              Ajustar KPIs {hasChanges ? `(${Object.keys(simValues).length} modificados)` : ''}
            </button>
            <button
              className={`sim-tab ${activeTab === 'impact' ? 'active' : ''}`}
              onClick={() => setActiveTab('impact')}
            >
              Ver impacto por área
            </button>
          </div>

          {/* Sliders panel */}
          {activeTab === 'sliders' && (
            <div className="sim-sliders-panel">
              {visibleKpis.length === 0 ? (
                <div className="sim-empty">No hay KPIs para mostrar.</div>
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
                          Original: {originalVal != null ? `${fmt(originalVal)}%` : 'Sin datos'}
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
                          title="Restaurar valor original"
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
                    <th>Área / Unidad</th>
                    <th>Nivel</th>
                    <th>Promedio actual</th>
                    <th>Promedio simulado</th>
                    <th>Variación</th>
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
                            {area.scope.type.replace('_', ' ')}
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
                <p className="sim-impact-hint">
                  Ajustá los sliders en la pestaña "Ajustar KPIs" para ver el impacto aquí.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
