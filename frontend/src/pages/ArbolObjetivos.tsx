import { useState } from 'react'
import { useQuery } from 'react-query'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { resolveDirection, calculateVariationPercent } from '../utils/kpi'
import './ArbolObjetivos.css'

interface KpiLink {
  kpiName: string | null
  actual: number | null
  target: number | null
  type: 'collaborator' | 'scope'
  sourceName: string | null
  direction?: string
  kpiWeight?: number
}

interface KeyResult {
  id: number
  title: string
  krType: 'simple' | 'kpi_linked'
  status: string
  progressPercent: number
  startValue: number | null
  targetValue: number | null
  currentValue: number | null
  unit: string | null
  weight: number
  ownerName: string | null
  linkedKpis: KpiLink[]
}

interface OKRNode {
  id: number
  title: string
  description: string | null
  status: 'draft' | 'active' | 'closed'
  progress: number
  ownerName: string | null
  periodName: string | null
  parentId: number | null
  keyResults: KeyResult[]
}

interface ScopeGroup {
  scopeId: number | null
  scopeName: string
  objectives: OKRNode[]
}

const progressColor = (p: number) => {
  if (p >= 70) return '#16a34a'
  if (p >= 40) return '#d97706'
  return '#dc2626'
}

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Sin iniciar',
  on_track: 'En camino',
  at_risk: 'En riesgo',
  behind: 'Atrasado',
  completed: 'Completado',
}

const STATUS_DOT: Record<string, string> = {
  not_started: '#9ca3af',
  on_track: '#16a34a',
  at_risk: '#d97706',
  behind: '#dc2626',
  completed: '#2563eb',
}

export default function ArbolObjetivos() {
  const navigate = useNavigate()
  const [expandedScopes, setExpandedScopes] = useState<Set<string>>(new Set())
  const [expandedOkrs, setExpandedOkrs] = useState<Set<number>>(new Set())
  const [expandedKrs, setExpandedKrs] = useState<Set<number>>(new Set())
  const [filterPeriod, setFilterPeriod] = useState('')

  const { data: tree = [], isLoading } = useQuery<ScopeGroup[]>(
    'okr-full-tree',
    () => api.get('/okr/full-tree').then((r) => r.data),
    { retry: false }
  )

  const toggleScope = (key: string) => {
    setExpandedScopes((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const toggleOkr = (id: number) => {
    setExpandedOkrs((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleKr = (id: number) => {
    setExpandedKrs((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Collect unique period names for filter
  const allPeriods = Array.from(
    new Set(
      tree.flatMap((g) => g.objectives.map((o) => o.periodName).filter(Boolean) as string[])
    )
  ).sort()

  const filteredTree = tree.map((group) => ({
    ...group,
    objectives: group.objectives.filter((o) => !filterPeriod || o.periodName === filterPeriod),
  })).filter((group) => group.objectives.length > 0)

  const totalObjectives = filteredTree.reduce((s, g) => s + g.objectives.length, 0)
  const totalKrs = filteredTree.reduce((s, g) => s + g.objectives.reduce((ss, o) => ss + o.keyResults.length, 0), 0)

  if (isLoading) {
    return <div className="arbol-loading">Cargando árbol de objetivos...</div>
  }

  return (
    <div className="arbol-page">
      <div className="arbol-header">
        <div>
          <h1>Árbol de Objetivos</h1>
          <p className="arbol-subtitle">
            Jerarquía real de OKRs, Key Results y KPIs por área
          </p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/okr/nuevo')}>
          + Nuevo OKR
        </button>
      </div>

      <div className="arbol-toolbar">
        <div className="arbol-stats">
          <span><strong>{filteredTree.length}</strong> áreas</span>
          <span><strong>{totalObjectives}</strong> objetivos</span>
          <span><strong>{totalKrs}</strong> key results</span>
        </div>
        {allPeriods.length > 1 && (
          <select
            className="arbol-period-filter"
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
          >
            <option value="">Todos los períodos</option>
            {allPeriods.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}
      </div>

      {filteredTree.length === 0 ? (
        <div className="arbol-empty">
          <div className="arbol-empty-icon">📋</div>
          <h3>No hay objetivos activos</h3>
          <p>Creá tu primer OKR para verlo aquí organizado por área y período.</p>
          <button className="btn-primary" onClick={() => navigate('/okr/nuevo')}>
            Crear OKR
          </button>
        </div>
      ) : (
        <div className="arbol-tree">
          {filteredTree.map((group) => {
            const scopeKey = group.scopeId ? String(group.scopeId) : '__sin_area__'
            const scopeOpen = expandedScopes.has(scopeKey)

            return (
              <div key={scopeKey} className="arbol-scope-block">
                {/* ── NIVEL 1: Área / Scope ── */}
                <button
                  className="arbol-scope-header"
                  onClick={() => toggleScope(scopeKey)}
                >
                  <span className="arbol-scope-chevron">{scopeOpen ? '▼' : '▶'}</span>
                  <span className="arbol-scope-icon">🏢</span>
                  <span className="arbol-scope-name">{group.scopeName}</span>
                  <span className="arbol-scope-count">{group.objectives.length} OKR{group.objectives.length !== 1 ? 's' : ''}</span>
                </button>

                {scopeOpen && (
                  <div className="arbol-scope-body">
                    {group.objectives.map((okr) => {
                      const okrOpen = expandedOkrs.has(okr.id)

                      return (
                        <div key={okr.id} className="arbol-okr-block">
                          {/* ── NIVEL 2: OKR ── */}
                          <div className="arbol-okr-row">
                            <button
                              className="arbol-expand-btn"
                              onClick={() => toggleOkr(okr.id)}
                              disabled={okr.keyResults.length === 0}
                              title={okr.keyResults.length === 0 ? 'Sin Key Results' : undefined}
                            >
                              {okr.keyResults.length > 0 ? (okrOpen ? '▼' : '▶') : '·'}
                            </button>
                            <div className="arbol-okr-main">
                              <div className="arbol-okr-top">
                                <span className="arbol-okr-badge">OKR</span>
                                <span className="arbol-okr-title">{okr.title}</span>
                                <span className={`arbol-status-pill arbol-status-pill--${okr.status}`}>
                                  {okr.status === 'active' ? 'Activo' : okr.status === 'draft' ? 'Borrador' : 'Cerrado'}
                                </span>
                              </div>
                              <div className="arbol-okr-meta">
                                {okr.periodName && <span>📅 {okr.periodName}</span>}
                                {okr.ownerName && <span>👤 {okr.ownerName}</span>}
                                <span>{okr.keyResults.length} KR{okr.keyResults.length !== 1 ? 's' : ''}</span>
                              </div>
                              <div className="arbol-progress-row">
                                <div className="arbol-progress-track">
                                  <div
                                    className="arbol-progress-fill"
                                    style={{ width: `${okr.progress}%`, background: progressColor(okr.progress) }}
                                  />
                                </div>
                                <span className="arbol-progress-pct" style={{ color: progressColor(okr.progress) }}>
                                  {Math.round(okr.progress)}%
                                </span>
                              </div>
                            </div>
                            <button
                              className="arbol-goto-btn"
                              onClick={() => navigate(`/okr/${okr.id}`)}
                              title="Ver detalle del OKR"
                            >
                              Ver →
                            </button>
                          </div>

                          {/* ── NIVEL 3: Key Results ── */}
                          {okrOpen && okr.keyResults.map((kr) => {
                            const krOpen = expandedKrs.has(kr.id)
                            const hasKpis = kr.linkedKpis.length > 0

                            return (
                              <div key={kr.id} className="arbol-kr-block">
                                <div className="arbol-kr-row">
                                  <button
                                    className="arbol-expand-btn arbol-expand-btn--sm"
                                    onClick={() => toggleKr(kr.id)}
                                    disabled={!hasKpis}
                                    title={!hasKpis ? 'Sin KPIs vinculados' : undefined}
                                  >
                                    {hasKpis ? (krOpen ? '▼' : '▶') : '·'}
                                  </button>
                                  <div className="arbol-kr-main">
                                    <div className="arbol-kr-top">
                                      <span className="arbol-kr-badge">KR</span>
                                      <span className="arbol-kr-title">{kr.title}</span>
                                      {kr.ownerName && (
                                        <span className="arbol-kr-owner">👤 {kr.ownerName}</span>
                                      )}
                                      <span
                                        className="arbol-kr-status-dot"
                                        style={{ background: STATUS_DOT[kr.status] ?? '#9ca3af' }}
                                        title={STATUS_LABEL[kr.status] ?? kr.status}
                                      />
                                      <span className="arbol-kr-status-label">
                                        {STATUS_LABEL[kr.status] ?? kr.status}
                                      </span>
                                    </div>
                                    <div className="arbol-kr-values">
                                      {kr.krType === 'kpi_linked' ? (
                                        <span className="arbol-kr-linked">
                                          🔗 Vinculado a {kr.linkedKpis.length} KPI{kr.linkedKpis.length !== 1 ? 's' : ''}
                                        </span>
                                      ) : (
                                        <span className="arbol-kr-manual">
                                          {kr.currentValue ?? kr.startValue ?? 0} / {kr.targetValue ?? 0}
                                          {kr.unit ? ` ${kr.unit}` : ''}
                                        </span>
                                      )}
                                    </div>
                                    <div className="arbol-progress-row">
                                      <div className="arbol-progress-track arbol-progress-track--sm">
                                        <div
                                          className="arbol-progress-fill"
                                          style={{ width: `${kr.progressPercent}%`, background: STATUS_DOT[kr.status] ?? progressColor(kr.progressPercent) }}
                                        />
                                      </div>
                                      <span className="arbol-progress-pct arbol-progress-pct--sm">
                                        {Math.round(kr.progressPercent)}%
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* ── NIVEL 4: KPIs ── */}
                                {krOpen && hasKpis && (
                                  <div className="arbol-kpi-list">
                                    {kr.linkedKpis.map((lk, i) => {
                                      const direction = resolveDirection(undefined, lk.direction, undefined)
                                      const variation = calculateVariationPercent(direction, lk.target ?? 0, lk.actual ?? null)
                                      const pct = Math.min(100, Math.max(0, Math.round(variation ?? 0)))
                                      return (
                                        <div key={i} className="arbol-kpi-row">
                                          <span className={`arbol-kpi-type-badge arbol-kpi-type-badge--${lk.type}`}>
                                            {lk.type === 'collaborator' ? '👤' : '🏢'}
                                          </span>
                                          <span className="arbol-kpi-name">
                                            {lk.kpiName ?? 'KPI'}
                                            {lk.sourceName && <span className="arbol-kpi-source"> — {lk.sourceName}</span>}
                                          </span>
                                          <span className="arbol-kpi-values">
                                            {lk.actual ?? '—'} / {lk.target ?? '—'}
                                          </span>
                                          <div className="arbol-progress-track arbol-progress-track--xs">
                                            <div
                                              className="arbol-progress-fill"
                                              style={{ width: `${pct}%`, background: progressColor(pct) }}
                                            />
                                          </div>
                                          <span className="arbol-kpi-pct" style={{ color: progressColor(pct) }}>
                                            {pct}%
                                          </span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
