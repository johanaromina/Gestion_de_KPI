import { useState } from 'react'
import { useQuery } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import './OKRAlineacion.css'

interface Period { id: number; name: string }

interface ObjNode {
  id: number
  title: string
  description?: string | null
  progress: number
  status: 'draft' | 'active' | 'closed'
  ownerName?: string
  orgScopeName?: string
  children?: ObjNode[]
}

const progressColor = (p: number) => {
  if (p >= 70) return '#16a34a'
  if (p >= 40) return '#d97706'
  return '#dc2626'
}

function ObjectiveNode({ node, depth = 0 }: { node: ObjNode; depth?: number }) {
  const navigate = useNavigate()
  const { t } = useTranslation('okr')
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children && node.children.length > 0

  return (
    <div className="tree-node" style={{ marginLeft: depth * 28 }}>
      <div
        className={`tree-card tree-card--${node.status}`}
        onClick={() => navigate(`/okr/${node.id}`)}
      >
        <div className="tree-card-left">
          {hasChildren && (
            <button
              className="tree-toggle"
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
            >
              {expanded ? '▾' : '▸'}
            </button>
          )}
          {!hasChildren && <span className="tree-leaf-dot" />}
          <div className="tree-card-info">
            <span className="tree-card-title">{node.title}</span>
            <span className="tree-card-meta">
              {node.ownerName && <span>{node.ownerName}</span>}
              {node.orgScopeName && <span className="tree-scope">{node.orgScopeName}</span>}
            </span>
          </div>
        </div>

        <div className="tree-card-right">
          <div className="tree-progress-wrap">
            <div className="tree-progress-track">
              <div
                className="tree-progress-fill"
                style={{ width: `${Number(node.progress) || 0}%`, background: progressColor(Number(node.progress) || 0) }}
              />
            </div>
            <span className="tree-progress-pct" style={{ color: progressColor(Number(node.progress) || 0) }}>
              {Math.round(Number(node.progress) || 0)}%
            </span>
          </div>
          <span className={`tree-status-pill tree-status-pill--${node.status}`}>
            {t(`status.${node.status}`)}
          </span>
        </div>
      </div>

      {hasChildren && expanded && (
        <div className="tree-children">
          {node.children!.map((child) => (
            <ObjectiveNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function OKRAlineacion() {
  const navigate = useNavigate()
  const { t } = useTranslation('okr')
  const [selectedPeriod, setSelectedPeriod] = useState<number | ''>('')

  const { data: periods = [] } = useQuery<Period[]>('periods', () =>
    api.get('/periods').then((r) => r.data)
  )

  const { data: tree = [], isLoading } = useQuery<ObjNode[]>(
    ['okr-alignment-tree', selectedPeriod],
    () => api.get('/okr/alignment-tree', { params: { periodId: selectedPeriod } }).then((r) => r.data),
    { enabled: !!selectedPeriod }
  )

  const totalObjectives = countNodes(tree)
  const avgProgress = totalObjectives > 0
    ? Math.round(collectAll(tree).reduce((s, n) => s + (Number(n.progress) || 0), 0) / totalObjectives)
    : 0

  return (
    <div className="okr-alineacion">
      <div className="okr-alineacion-header">
        <div>
          <h2>{t('alignment.title')}</h2>
          <p className="okr-alineacion-subtitle">{t('alignment.subtitle')}</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/okr/nuevo')}>
          {t('new_objective')}
        </button>
      </div>

      <div className="okr-alineacion-filters">
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">{t('alignment.select_period')}</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {selectedPeriod && !isLoading && totalObjectives > 0 && (
        <div className="okr-alineacion-summary">
          <div className="summary-stat">
            <span className="summary-value">{totalObjectives}</span>
            <span className="summary-label">{t('alignment.summary.objectives')}</span>
          </div>
          <div className="summary-stat">
            <span className="summary-value" style={{ color: progressColor(avgProgress) }}>
              {avgProgress}%
            </span>
            <span className="summary-label">{t('alignment.summary.avg_progress')}</span>
          </div>
        </div>
      )}

      {!selectedPeriod && (
        <div className="okr-empty">{t('alignment.no_period_selected')}</div>
      )}

      {selectedPeriod && isLoading && (
        <div className="okr-loading">{t('alignment.loading')}</div>
      )}

      {selectedPeriod && !isLoading && tree.length === 0 && (
        <div className="okr-empty">
          <p>{t('alignment.empty.message')}</p>
          <button className="btn-primary" onClick={() => navigate('/okr/nuevo')}>
            {t('empty.create')}
          </button>
        </div>
      )}

      {tree.length > 0 && (
        <div className="tree-root">
          {tree.map((node) => (
            <ObjectiveNode key={node.id} node={node} depth={0} />
          ))}
        </div>
      )}
    </div>
  )
}

function countNodes(nodes: ObjNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children ?? []), 0)
}

function collectAll(nodes: ObjNode[]): ObjNode[] {
  return nodes.flatMap((n) => [n, ...collectAll(n.children ?? [])])
}
