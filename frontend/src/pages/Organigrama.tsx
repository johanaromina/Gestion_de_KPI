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

function getVariationColor(variation: number | null | undefined): string {
  if (variation === null || variation === undefined) return '#9ca3af'
  if (variation >= 90) return '#16a34a'
  if (variation >= 70) return '#d97706'
  return '#dc2626'
}

function ScopeCard({ node, depth }: { node: ScopeNode; depth: number }) {
  const [expanded, setExpanded] = useState(false)
  const color = TYPE_COLOR[node.type] || '#374151'
  const avgVariation =
    node.kpis.length > 0
      ? node.kpis
          .filter((k) => k.variation !== null && k.variation !== undefined)
          .reduce((sum, k) => sum + Number(k.variation), 0) /
        (node.kpis.filter((k) => k.variation !== null && k.variation !== undefined).length || 1)
      : null

  return (
    <div className={`org-card org-card--depth-${Math.min(depth, 3)}`} style={{ borderTopColor: color }}>
      <div className="org-card-type" style={{ color }}>
        {TYPE_LABEL[node.type] || node.type}
      </div>
      <div className="org-card-name">{node.name}</div>
      {node.totalCollaboratorCount > 0 && (
        <div className="org-card-collab-count">
          {node.totalCollaboratorCount === 1 ? '1 persona' : `${node.totalCollaboratorCount} personas`}
          {node.collaboratorCount !== node.totalCollaboratorCount && node.collaboratorCount > 0 && (
            <span className="org-card-collab-direct"> ({node.collaboratorCount} directa{node.collaboratorCount !== 1 ? 's' : ''})</span>
          )}
        </div>
      )}
      {avgVariation !== null && (
        <div className="org-card-kpi" style={{ color: getVariationColor(avgVariation) }}>
          {avgVariation.toFixed(0)}% cumplimiento
        </div>
      )}
      {node.kpis.length === 0 && (
        <div className="org-card-no-kpi">Sin KPIs asignados</div>
      )}
      {node.kpis.length > 0 && (
        <button
          className="org-card-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '▲ Ocultar KPIs' : `▼ ${node.kpis.length} KPI${node.kpis.length !== 1 ? 's' : ''}`}
        </button>
      )}
      {expanded && (
        <div className="org-card-kpis">
          {node.kpis.map((k) => (
            <div key={k.id} className="org-kpi-row">
              <span className="org-kpi-name">{k.name}</span>
              {k.variation !== null && k.variation !== undefined ? (
                <span
                  className="org-kpi-pct"
                  style={{ color: getVariationColor(k.variation) }}
                >
                  {Number(k.variation).toFixed(0)}%
                </span>
              ) : (
                <span className="org-kpi-pct org-kpi-pct--empty">–</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function renderTree(node: ScopeNode, depth = 0): JSX.Element {
  if (node.children.length === 0) {
    return (
      <TreeNode key={node.id} label={<ScopeCard node={node} depth={depth} />} />
    )
  }
  return (
    <TreeNode key={node.id} label={<ScopeCard node={node} depth={depth} />}>
      {node.children.map((child) => renderTree(child, depth + 1))}
    </TreeNode>
  )
}

export default function Organigrama() {
  const [filterType, setFilterType] = useState<string>('all')

  const { data: orgScopes, isLoading: loadingScopes } = useQuery<OrgScope[]>(
    'org-scopes',
    async () => {
      const res = await api.get('/org-scopes')
      return res.data
    }
  )

  const { data: collaborators } = useQuery<{ id: number; orgScopeId?: number | null }[]>(
    'organigrama-collaborators',
    async () => {
      const res = await api.get('/collaborators')
      return res.data
    },
    { retry: false }
  )

  const { data: scopeKpis } = useQuery<ScopeKPI[]>(
    'scope-kpis-organigrama',
    async () => {
      const res = await api.get('/scope-kpis')
      return res.data
    },
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

    const directCountByScope = new Map<number, number>()
    if (collaborators) {
      for (const c of collaborators) {
        if (c.orgScopeId) {
          directCountByScope.set(c.orgScopeId, (directCountByScope.get(c.orgScopeId) || 0) + 1)
        }
      }
    }

    const nodesById = new Map<number, ScopeNode>()
    for (const s of active) {
      nodesById.set(s.id, {
        ...s,
        children: [],
        kpis: kpisByScope.get(s.id) || [],
        collaboratorCount: directCountByScope.get(s.id) || 0,
        totalCollaboratorCount: 0,
      })
    }

    const roots: ScopeNode[] = []
    for (const node of nodesById.values()) {
      if (node.parentId && nodesById.has(node.parentId)) {
        nodesById.get(node.parentId)!.children.push(node)
      } else {
        roots.push(node)
      }
    }

    // Calcular totalCollaboratorCount (directos + descendientes)
    const calcTotal = (n: ScopeNode): number => {
      const childTotal = n.children.reduce((sum, c) => sum + calcTotal(c), 0)
      n.totalCollaboratorCount = n.collaboratorCount + childTotal
      return n.totalCollaboratorCount
    }

    // Ordenar hijos por nombre
    const sortChildren = (n: ScopeNode) => {
      n.children.sort((a, b) => a.name.localeCompare(b.name))
      n.children.forEach(sortChildren)
    }
    roots.sort((a, b) => a.name.localeCompare(b.name))
    roots.forEach(sortChildren)
    roots.forEach(calcTotal)

    return roots
  }, [orgScopes, scopeKpis, collaborators])

  const types = useMemo(() => {
    const set = new Set<string>()
    orgScopes?.forEach((s) => set.add(s.type))
    return Array.from(set)
  }, [orgScopes])

  const filteredTree = useMemo(() => {
    if (filterType === 'all') return tree
    const filterNode = (node: ScopeNode): ScopeNode | null => {
      const filteredChildren = node.children.map(filterNode).filter(Boolean) as ScopeNode[]
      if (node.type === filterType || filteredChildren.length > 0) {
        return { ...node, children: filteredChildren }
      }
      return null
    }
    return tree.map(filterNode).filter(Boolean) as ScopeNode[]
  }, [tree, filterType])

  const totalNodes = useMemo(() => {
    const count = (nodes: ScopeNode[]): number =>
      nodes.reduce((acc, n) => acc + 1 + count(n.children), 0)
    return count(tree)
  }, [tree])

  if (loadingScopes) {
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
            y aparecerán aquí con su jerarquía.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="organigrama-page">
      <div className="page-header">
        <div>
          <h1>Organigrama</h1>
          <p className="subtitle">
            Estructura jerárquica de la organización · {totalNodes} unidades
          </p>
        </div>
        <div className="org-filters">
          <select
            className="org-filter-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">Todos los tipos</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t] || t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="org-legend">
        {Object.entries(TYPE_LABEL).filter(([k]) => types.includes(k)).map(([k, label]) => (
          <span key={k} className="org-legend-item">
            <span className="org-legend-dot" style={{ background: TYPE_COLOR[k] || '#374151' }} />
            {label}
          </span>
        ))}
      </div>

      <div className="org-tree-wrap">
        {filteredTree.map((root) => (
          <div key={root.id} className="org-tree-root">
            <Tree
              lineWidth="2px"
              lineColor="#e2e8f0"
              lineBorderRadius="6px"
              label={<ScopeCard node={root} depth={0} />}
            >
              {root.children.map((child) => renderTree(child, 1))}
            </Tree>
          </div>
        ))}
      </div>
    </div>
  )
}
