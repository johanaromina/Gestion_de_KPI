import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import api from '../services/api'
import './Organigrama.css'

type OrgScope = {
  id: number
  name: string
  type: string
  parentId: number | null
  calendarProfileId?: number | null
  active?: number | boolean
}

type ScopeKPI = {
  id: number
  orgScopeId: number
  name: string
  actual?: number | null
  target?: number | null
  variation?: number | null
}

type ScopeNode = OrgScope & {
  children: ScopeNode[]
  kpis: ScopeKPI[]
  collaboratorCount: number
  totalCollaboratorCount: number
}

const TYPE_LABEL: Record<string, string> = {
  company: 'Empresa',
  area: 'Área',
  team: 'Equipo',
  business_unit: 'Unidad de negocio',
}

const TYPE_COLOR: Record<string, string> = {
  company: '#7c3aed',
  area: '#1d4ed8',
  team: '#0369a1',
  business_unit: '#0f766e',
}

const TYPE_ICON: Record<string, string> = {
  company: '🏢',
  area: '📂',
  team: '👥',
  business_unit: '🏭',
}

function getVariationColor(v: number | null | undefined) {
  if (v == null) return '#9ca3af'
  if (v >= 90) return '#16a34a'
  if (v >= 70) return '#d97706'
  return '#dc2626'
}

function avgVariation(kpis: ScopeKPI[]): number | null {
  const valid = kpis.filter((k) => k.variation != null)
  if (valid.length === 0) return null
  return valid.reduce((s, k) => s + Number(k.variation), 0) / valid.length
}

function countDescendants(node: ScopeNode): number {
  return node.children.reduce((acc, c) => acc + 1 + countDescendants(c), 0)
}

// ─── Tarjeta de nivel ────────────────────────────────────────────────────────

function DrillCard({ node, onDrillDown }: { node: ScopeNode; onDrillDown: (n: ScopeNode) => void }) {
  const color = TYPE_COLOR[node.type] || '#374151'
  const icon = TYPE_ICON[node.type] || '📁'
  const avg = avgVariation(node.kpis)
  const hasChildren = node.children.length > 0
  const subCount = node.children.length
  const descCount = countDescendants(node)

  return (
    <div
      className={`org-drill-card${hasChildren ? ' org-drill-card--has-children' : ' org-drill-card--leaf'}`}
      style={{ borderTopColor: color }}
      onClick={() => hasChildren && onDrillDown(node)}
      role={hasChildren ? 'button' : undefined}
      tabIndex={hasChildren ? 0 : undefined}
      onKeyDown={(e) => e.key === 'Enter' && hasChildren && onDrillDown(node)}
    >
      <div className="org-drill-card-top">
        <span className="org-drill-card-icon">{icon}</span>
        <span className="org-drill-card-type" style={{ color }}>{TYPE_LABEL[node.type] || node.type}</span>
      </div>

      <div className="org-drill-card-name">{node.name}</div>

      <div className="org-drill-card-stats">
        {node.totalCollaboratorCount > 0 && (
          <span className="org-stat">
            👤 {node.totalCollaboratorCount} persona{node.totalCollaboratorCount !== 1 ? 's' : ''}
          </span>
        )}
        {hasChildren && (
          <span className="org-stat">
            📂 {subCount} sub-unidad{subCount !== 1 ? 'es' : ''}
            {descCount > subCount && <span className="org-stat-dim"> · {descCount} en total</span>}
          </span>
        )}
      </div>

      {avg !== null && (
        <div className="org-drill-card-kpi-summary">
          <div className="org-kpi-bar-wrap">
            <div
              className="org-kpi-bar-fill"
              style={{ width: `${Math.min(avg, 100)}%`, background: getVariationColor(avg) }}
            />
          </div>
          <span className="org-kpi-pct-label" style={{ color: getVariationColor(avg) }}>
            {avg.toFixed(0)}% cumplimiento
          </span>
        </div>
      )}

      {!hasChildren && node.kpis.length > 0 && (
        <div className="org-drill-card-kpis">
          {node.kpis.slice(0, 4).map((k) => (
            <div key={k.id} className="org-kpi-row">
              <span className="org-kpi-name">{k.name}</span>
              {k.variation != null ? (
                <span className="org-kpi-pct" style={{ color: getVariationColor(k.variation) }}>
                  {Number(k.variation).toFixed(0)}%
                </span>
              ) : (
                <span className="org-kpi-pct org-kpi-pct--empty">–</span>
              )}
            </div>
          ))}
          {node.kpis.length > 4 && (
            <span className="org-kpi-more">+{node.kpis.length - 4} KPIs más</span>
          )}
        </div>
      )}

      {!hasChildren && node.kpis.length === 0 && (
        <div className="org-no-kpi">Sin KPIs asignados</div>
      )}

      {hasChildren && (
        <div className="org-drill-card-footer">
          Ver {subCount} sub-unidad{subCount !== 1 ? 'es' : ''} →
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Organigrama() {
  const [drillPath, setDrillPath] = useState<ScopeNode[]>([])

  const { data: orgScopes, isLoading } = useQuery<OrgScope[]>('org-scopes', async () => {
    const res = await api.get('/org-scopes')
    return res.data
  })

  const { data: collaborators } = useQuery<{ id: number; orgScopeId?: number | null }[]>(
    'organigrama-collaborators',
    async () => (await api.get('/collaborators')).data,
    { retry: false }
  )

  const { data: scopeKpis } = useQuery<ScopeKPI[]>(
    'scope-kpis-organigrama',
    async () => (await api.get('/scope-kpis')).data,
    { retry: false }
  )

  const tree = useMemo<ScopeNode[]>(() => {
    if (!orgScopes) return []
    const active = orgScopes.filter((s) => s.active !== 0 && s.active !== false)

    const kpisByScope = new Map<number, ScopeKPI[]>()
    if (scopeKpis) {
      for (const k of scopeKpis) {
        if (!kpisByScope.has(k.orgScopeId)) kpisByScope.set(k.orgScopeId, [])
        kpisByScope.get(k.orgScopeId)!.push(k)
      }
    }

    const directCount = new Map<number, number>()
    if (collaborators) {
      for (const c of collaborators) {
        if (c.orgScopeId) directCount.set(c.orgScopeId, (directCount.get(c.orgScopeId) || 0) + 1)
      }
    }

    const byId = new Map<number, ScopeNode>()
    for (const s of active) {
      byId.set(s.id, { ...s, children: [], kpis: kpisByScope.get(s.id) || [], collaboratorCount: directCount.get(s.id) || 0, totalCollaboratorCount: 0 })
    }

    const roots: ScopeNode[] = []
    for (const node of byId.values()) {
      if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node)
      else roots.push(node)
    }

    const calcTotal = (n: ScopeNode): number => {
      const childTotal = n.children.reduce((s, c) => s + calcTotal(c), 0)
      n.totalCollaboratorCount = n.collaboratorCount + childTotal
      return n.totalCollaboratorCount
    }
    const sortChildren = (n: ScopeNode) => {
      n.children.sort((a, b) => a.name.localeCompare(b.name))
      n.children.forEach(sortChildren)
    }
    roots.sort((a, b) => a.name.localeCompare(b.name))
    roots.forEach(sortChildren)
    roots.forEach(calcTotal)
    return roots
  }, [orgScopes, scopeKpis, collaborators])

  // Nodos del nivel actual
  const currentNodes = useMemo(
    () => (drillPath.length === 0 ? tree : drillPath[drillPath.length - 1].children),
    [drillPath, tree]
  )

  const currentParent = drillPath.length > 0 ? drillPath[drillPath.length - 1] : null

  const handleDrillDown = (node: ScopeNode) => {
    setDrillPath((prev) => [...prev, node])
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleBreadcrumb = (index: number) => {
    setDrillPath((prev) => prev.slice(0, index + 1))
  }

  const totalNodes = useMemo(() => {
    const count = (nodes: ScopeNode[]): number => nodes.reduce((acc, n) => acc + 1 + count(n.children), 0)
    return count(tree)
  }, [tree])

  if (isLoading) {
    return (
      <div className="organigrama-page">
        <div className="org-loading">Cargando estructura organizacional…</div>
      </div>
    )
  }

  if (tree.length === 0) {
    return (
      <div className="organigrama-page">
        <div className="page-header">
          <div>
            <h1>Organigrama</h1>
            <p className="subtitle">Estructura jerárquica de la organización</p>
          </div>
        </div>
        <div className="org-empty">
          <div className="org-empty-icon">🏢</div>
          <h3>No hay unidades organizacionales</h3>
          <p>
            Creá las áreas y equipos en{' '}
            <a href="/configuracion">Configuración → Estructura Organizacional</a>{' '}
            y aparecerán aquí.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="organigrama-page">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Organigrama</h1>
          <p className="subtitle">
            {totalNodes} unidades · {drillPath.length === 0 ? 'Vista general' : `Nivel ${drillPath.length + 1} de 4`}
          </p>
        </div>
      </div>

      {/* Breadcrumb */}
      <nav className="org-breadcrumb">
        <button
          className={`org-breadcrumb-item ${drillPath.length === 0 ? 'org-breadcrumb-item--active' : ''}`}
          onClick={() => setDrillPath([])}
        >
          🏠 Inicio
        </button>
        {drillPath.map((node, i) => (
          <span key={node.id} className="org-breadcrumb-entry">
            <span className="org-breadcrumb-sep">›</span>
            <button
              className={`org-breadcrumb-item ${i === drillPath.length - 1 ? 'org-breadcrumb-item--active' : ''}`}
              onClick={() => handleBreadcrumb(i)}
            >
              {node.name}
            </button>
          </span>
        ))}
      </nav>

      {/* Cabecera del nivel actual */}
      {currentParent && (
        <div className="org-level-header" style={{ borderLeftColor: TYPE_COLOR[currentParent.type] || '#374151' }}>
          <div className="org-level-header-type" style={{ color: TYPE_COLOR[currentParent.type] || '#374151' }}>
            {TYPE_ICON[currentParent.type] || '📁'} {TYPE_LABEL[currentParent.type] || currentParent.type}
          </div>
          <div className="org-level-header-name">{currentParent.name}</div>
          <div className="org-level-header-meta">
            {currentParent.totalCollaboratorCount > 0 && (
              <span>{currentParent.totalCollaboratorCount} personas en total</span>
            )}
            <span>{currentNodes.length} sub-unidad{currentNodes.length !== 1 ? 'es' : ''}</span>
          </div>
        </div>
      )}

      {/* Grilla del nivel actual */}
      {currentNodes.length === 0 ? (
        <div className="org-level-empty">
          <p>Este nivel no tiene sub-unidades.</p>
        </div>
      ) : (
        <div className={`org-drill-grid org-drill-grid--level-${Math.min(drillPath.length, 3)}`}>
          {currentNodes.map((node) => (
            <DrillCard key={node.id} node={node} onDrillDown={handleDrillDown} />
          ))}
        </div>
      )}

      {/* Indicador de profundidad */}
      {drillPath.length > 0 && (
        <div className="org-depth-indicator">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`org-depth-dot ${i < drillPath.length ? 'org-depth-dot--done' : i === drillPath.length ? 'org-depth-dot--current' : ''}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
