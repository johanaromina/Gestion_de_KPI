import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { Tree, TreeNode } from 'react-organizational-chart'
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

function getVariationColor(v: number | null | undefined) {
  if (v == null) return '#9ca3af'
  if (v >= 90) return '#16a34a'
  if (v >= 70) return '#d97706'
  return '#dc2626'
}

function avgVariation(kpis: ScopeKPI[]): number | null {
  const valid = kpis.filter((k) => k.variation != null)
  if (!valid.length) return null
  return valid.reduce((s, k) => s + Number(k.variation), 0) / valid.length
}

// ─── Tarjeta del nodo ────────────────────────────────────────────────────────

function ScopeCard({
  node,
  depth,
  onDrill,
}: {
  node: ScopeNode
  depth: number
  onDrill: (n: ScopeNode) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const color = TYPE_COLOR[node.type] || '#374151'
  const avg = avgVariation(node.kpis)
  const hasDeeper = node.children.length > 0

  return (
    <div className={`org-card org-card--d${Math.min(depth, 2)}`} style={{ borderTopColor: color }}>
      <div className="org-card-type" style={{ color }}>
        {TYPE_LABEL[node.type] || node.type}
      </div>
      <div className="org-card-name">{node.name}</div>

      {node.totalCollaboratorCount > 0 && (
        <div className="org-card-meta">
          👤 {node.totalCollaboratorCount}
          {node.collaboratorCount !== node.totalCollaboratorCount && node.collaboratorCount > 0 && (
            <span className="org-card-meta-dim"> ({node.collaboratorCount} dir.)</span>
          )}
        </div>
      )}

      {avg !== null && (
        <div className="org-card-kpi-pct" style={{ color: getVariationColor(avg) }}>
          {avg.toFixed(0)}%
        </div>
      )}

      {node.kpis.length > 0 && (
        <button className="org-card-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? '▲' : `▼ ${node.kpis.length} KPI${node.kpis.length !== 1 ? 's' : ''}`}
        </button>
      )}

      {expanded && (
        <div className="org-card-kpis">
          {node.kpis.map((k) => (
            <div key={k.id} className="org-kpi-row">
              <span className="org-kpi-name">{k.name}</span>
              {k.variation != null ? (
                <span className="org-kpi-val" style={{ color: getVariationColor(k.variation) }}>
                  {Number(k.variation).toFixed(0)}%
                </span>
              ) : (
                <span className="org-kpi-val org-kpi-val--empty">–</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Botón drill-down: solo en nivel 2 y si tiene hijos */}
      {depth >= 2 && hasDeeper && (
        <button className="org-card-drill" onClick={() => onDrill(node)}>
          Ver {node.children.length} sub-unidad{node.children.length !== 1 ? 'es' : ''} →
        </button>
      )}
    </div>
  )
}

// ─── Renderizado recursivo del árbol (máx 3 niveles) ────────────────────────

const MAX_DEPTH = 2

function renderTree(
  node: ScopeNode,
  depth: number,
  onDrill: (n: ScopeNode) => void
): JSX.Element {
  const card = <ScopeCard node={node} depth={depth} onDrill={onDrill} />

  // En el nivel máximo o sin hijos: nodo hoja (los hijos se acceden via drill)
  if (depth >= MAX_DEPTH || node.children.length === 0) {
    return <TreeNode key={node.id} label={card} />
  }

  return (
    <TreeNode key={node.id} label={card}>
      {node.children.map((child) => renderTree(child, depth + 1, onDrill))}
    </TreeNode>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Organigrama() {
  // drillPath vacío = vista raíz del árbol completo
  // drillPath con items = árbol desde ese nodo hacia abajo
  const [drillPath, setDrillPath] = useState<ScopeNode[]>([])

  const { data: orgScopes, isLoading } = useQuery<OrgScope[]>('org-scopes', async () =>
    (await api.get('/org-scopes')).data
  )

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
      byId.set(s.id, {
        ...s,
        children: [],
        kpis: kpisByScope.get(s.id) || [],
        collaboratorCount: directCount.get(s.id) || 0,
        totalCollaboratorCount: 0,
      })
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

  const handleDrill = (node: ScopeNode) => {
    setDrillPath((prev) => [...prev, node])
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleBreadcrumb = (index: number) => {
    setDrillPath((prev) => prev.slice(0, index + 1))
  }

  // Raíces que se muestran en el árbol actual
  const currentRoots = drillPath.length === 0
    ? tree
    : drillPath[drillPath.length - 1].children

  const totalNodes = useMemo(() => {
    const count = (nodes: ScopeNode[]): number => nodes.reduce((acc, n) => acc + 1 + count(n.children), 0)
    return count(tree)
  }, [tree])

  if (isLoading) {
    return <div className="organigrama-page"><div className="org-loading">Cargando estructura…</div></div>
  }

  if (tree.length === 0) {
    return (
      <div className="organigrama-page">
        <div className="page-header">
          <div><h1>Organigrama</h1><p className="subtitle">Estructura jerárquica</p></div>
        </div>
        <div className="org-empty">
          <div className="org-empty-icon">🏢</div>
          <h3>No hay unidades organizacionales</h3>
          <p>Creá las áreas en <a href="/configuracion">Configuración → Estructura Organizacional</a>.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="organigrama-page">
      <div className="page-header">
        <div>
          <h1>Organigrama</h1>
          <p className="subtitle">{totalNodes} unidades · vista árbol (3 niveles)</p>
        </div>
      </div>

      {/* Breadcrumb — solo cuando se hizo drill-down */}
      {drillPath.length > 0 && (
        <nav className="org-breadcrumb">
          <button className="org-breadcrumb-item" onClick={() => setDrillPath([])}>
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
      )}

      {/* Cabecera del nivel actual cuando es drill-down */}
      {drillPath.length > 0 && (() => {
        const parent = drillPath[drillPath.length - 1]
        const color = TYPE_COLOR[parent.type] || '#374151'
        return (
          <div className="org-level-header" style={{ borderLeftColor: color }}>
            <div className="org-level-header-type" style={{ color }}>
              {TYPE_LABEL[parent.type] || parent.type}
            </div>
            <div className="org-level-header-name">{parent.name}</div>
          </div>
        )
      })()}

      {/* Árbol */}
      <div className="org-tree-wrap">
        {currentRoots.map((root) => (
          <div key={root.id} className="org-tree-root">
            <Tree
              lineWidth="2px"
              lineColor="#e2e8f0"
              lineBorderRadius="6px"
              label={<ScopeCard node={root} depth={0} onDrill={handleDrill} />}
            >
              {root.children.map((child) => renderTree(child, 1, handleDrill))}
            </Tree>
          </div>
        ))}
      </div>
    </div>
  )
}
