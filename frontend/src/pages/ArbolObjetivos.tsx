/* eslint-disable @typescript-eslint/no-explicit-any */
import { Fragment, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import api from '../services/api'
import { ObjectiveTree } from '../types'
import ObjectiveTreeForm from '../components/ObjectiveTreeForm'
import ScopeKPIDetailModal from '../components/ScopeKPIDetailModal'
import { useDialog } from '../components/Dialog'
import './ArbolObjetivos.css'

type ObjectiveDrilldownScopeLink = {
  id: number
  childType: 'collaborator' | 'scope'
  contributionWeight?: number | null
  aggregationMethod: string
  collaboratorName?: string | null
  collaboratorKpiName?: string | null
  collaboratorActual?: number | null
  collaboratorTarget?: number | null
  collaboratorWeightedResult?: number | null
  collaboratorPeriodName?: string | null
  collaboratorSubPeriodName?: string | null
  childScopeKpiName?: string | null
  childScopeOrgScopeName?: string | null
  childScopeActual?: number | null
  childScopeTarget?: number | null
  childScopeWeightedResult?: number | null
  childScopeStatus?: string | null
  childScopePeriodName?: string | null
  childScopeSubPeriodName?: string | null
}

type ObjectiveDrilldownScopeKpi = {
  id: number
  name: string
  orgScopeName?: string | null
  ownerLevel?: string | null
  sourceMode?: string | null
  status?: string | null
  actual?: number | null
  directActual?: number | null
  aggregatedActual?: number | null
  mixedConfig?: {
    directWeight: number
    aggregatedWeight: number
    directLabel?: string | null
    aggregatedLabel?: string | null
  } | null
  target?: number | null
  variation?: number | null
  weightedResult?: number | null
  periodName?: string | null
  subPeriodName?: string | null
  links?: ObjectiveDrilldownScopeLink[]
}

type ObjectiveDrilldown = Omit<ObjectiveTree, 'scopeKpis'> & {
  scopeKpis?: ObjectiveDrilldownScopeKpi[]
}

export default function ArbolObjetivos() {
  const [showForm, setShowForm] = useState(false)
  const [editingObjective, setEditingObjective] = useState<ObjectiveTree | undefined>(undefined)
  const [expandedObjectives, setExpandedObjectives] = useState<Set<number>>(new Set())
  const [expandedKpis, setExpandedKpis] = useState<Set<number>>(new Set())
  const [drilldownObjectiveId, setDrilldownObjectiveId] = useState<number | null>(null)
  const [detailScopeKpi, setDetailScopeKpi] = useState<ObjectiveDrilldownScopeKpi | null>(null)

  const queryClient = useQueryClient()
  const dialog = useDialog()

  const { data: objectives, isLoading } = useQuery<ObjectiveTree[]>(
    'objective-trees',
    async () => {
      const response = await api.get('/objective-trees')
      return response.data
    },
    { retry: false }
  )

  const { data: collaborators } = useQuery(
    'collaborators',
    async () => {
      const res = await api.get('/collaborators')
      return res.data as any[]
    },
    { retry: false }
  )
  const { data: drilldownObjective, isLoading: isLoadingDrilldown } = useQuery<ObjectiveDrilldown>(
    ['objective-tree-drilldown', drilldownObjectiveId],
    async () => {
      const response = await api.get(`/objective-trees/${drilldownObjectiveId}/drilldown`)
      return response.data
    },
    {
      enabled: !!drilldownObjectiveId,
      retry: false,
    }
  )
  const collaboratorNames = new Set((collaborators || []).map((c: any) => (c.name || '').trim().toLowerCase()))

  const deleteMutation = useMutation(
    async (id: number) => {
      await api.delete(`/objective-trees/${id}`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('objective-trees')
      },
      onError: (error: any) => {
        void dialog.alert(
          error.response?.data?.error ||
            'Error al eliminar objetivo. Verificá que no tenga objetivos hijos asociados.',
          { title: 'Error al eliminar', variant: 'danger' }
        )
      },
    }
  )

  const getLevelBadge = (level?: ObjectiveTree['level']) => {
    const levelConfig = {
      company: { label: 'Empresa', class: 'level-company' },
      direction: { label: 'Dirección', class: 'level-direction' },
      management: { label: 'Gerencia', class: 'level-management' },
      leadership: { label: 'Liderazgo', class: 'level-leadership' },
      individual: { label: 'Individual', class: 'level-individual' },
    }
    const config = (level && (levelConfig as any)[level]) || {
      label: level || 'N/A',
      class: 'level-unknown',
    }
    return <span className={`level-badge ${config.class}`}>{config.label}</span>
  }

  const handleCreate = () => {
    setEditingObjective(undefined)
    setShowForm(true)
  }

  const handleEdit = (objective: ObjectiveTree) => {
    setEditingObjective(objective)
    setShowForm(true)
  }

  const handleDelete = async (id: number, name: string) => {
    const ok = await dialog.confirm(
      `¿Estás seguro de eliminar el objetivo "${name}"? Esta acción eliminará también todos los objetivos hijos asociados.`,
      { title: 'Eliminar objetivo', confirmLabel: 'Eliminar', variant: 'danger' }
    )
    if (ok) deleteMutation.mutate(id)
  }

  const toggleExpansion = (id: number) => {
    const next = new Set(expandedObjectives)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setExpandedObjectives(next)
  }

  const toggleKpiExpansion = (id: number) => {
    const next = new Set(expandedKpis)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setExpandedKpis(next)
  }

  const isOKR = (name?: string) => {
    if (!name) return false
    return name.trim().toUpperCase().startsWith('OKR')
  }

  const isCompany = (obj?: ObjectiveTree) => {
    if (!obj) return false
    return obj.level === 'company' || (obj.name || '').toLowerCase().includes('compa')
  }

  const buildHierarchy = (): (ObjectiveTree & { depth: number; children?: any[] })[] => {
    if (!objectives) return []

    const filtered = objectives.filter((o) => {
      const isCollaboratorName = collaboratorNames.has((o.name || '').trim().toLowerCase())
      return !isCollaboratorName
    })

    const rootObjectives = filtered.filter((o) => !o.parentId)
    const childrenMap = new Map<number, ObjectiveTree[]>()

    filtered.forEach((obj) => {
      if (obj.parentId) {
        if (!childrenMap.has(obj.parentId)) {
          childrenMap.set(obj.parentId, [])
        }
        childrenMap.get(obj.parentId)!.push(obj)
      }
    })

    const buildTree = (
      parent: ObjectiveTree,
      depth: number = 0
    ): ObjectiveTree & { depth: number; children?: any[] } => {
      const children = childrenMap.get(parent.id) || []
      const sortedChildren = [...children].sort((a, b) => {
        const okrA = isOKR(a.name) ? 0 : 1
        const okrB = isOKR(b.name) ? 0 : 1
        if (okrA !== okrB) return okrA - okrB
        return (a.name || '').localeCompare(b.name || '')
      })
      return {
        ...parent,
        depth,
        children: sortedChildren.map((child) => buildTree(child, depth + 1)),
      }
    }

    // Ordenar raíces: compañía primero, luego OKRs, luego resto
    const companyRoot = rootObjectives.find((r) => isCompany(r))
    const remainingRoots = rootObjectives.filter((r) => r !== companyRoot)
    const orderedRoots = [
      ...(companyRoot ? [companyRoot] : []),
      ...remainingRoots.sort((a, b) => {
        const okrA = isOKR(a.name) ? 0 : 1
        const okrB = isOKR(b.name) ? 0 : 1
        if (okrA !== okrB) return okrA - okrB
        return (a.name || '').localeCompare(b.name || '')
      }),
    ]

    return orderedRoots.map((root) => buildTree(root))
  }

  const renderObjectiveRow = (
    objective: ObjectiveTree & { depth?: number; children?: any[] },
    isChild: boolean = false
  ) => {
    const hasChildren = objective.children && objective.children.length > 0
    const isExpanded = expandedObjectives.has(objective.id)
    const isKpiExpanded = expandedKpis.has(objective.id)
    const okr = isOKR(objective.name)
    const kpiCount = objective.kpis?.length || 0
    const scopeKpiCount = objective.scopeKpis?.length || 0
    const totalLinkedItems = kpiCount + scopeKpiCount

    return (
      <Fragment key={objective.id}>
        <tr className={`${isChild ? 'child-row' : ''} ${okr ? 'okr-row' : ''}`}>
          <td>{objective.id}</td>
          <td className="name-cell" style={{ paddingLeft: `${(objective.depth || 0) * 20}px` }}>
            {hasChildren && (
              <button className="expand-button" onClick={() => toggleExpansion(objective.id)}>
                {isExpanded ? '▼' : '▶'}
              </button>
            )}
            {!hasChildren && <span className="expand-spacer" />}
            {okr && <span className="okr-badge">OKR</span>}
            {objective.name}
          </td>
          <td>{getLevelBadge(objective.level || 'individual')}</td>
          <td>
            {objective.parentId
              ? objectives?.find((o) => o.id === objective.parentId)?.name ||
                `Objetivo #${objective.parentId}`
              : '-'}
          </td>
          <td>
            <div className="kpis-cell">
              <span>
                {kpiCount} KPIs · {scopeKpiCount} Scope KPIs
              </span>
              {totalLinkedItems > 0 && (
                <button className="link-button" onClick={() => toggleKpiExpansion(objective.id)}>
                  {isKpiExpanded ? 'Ocultar' : 'Ver'}
                </button>
              )}
            </div>
          </td>
          <td>
            <div className="action-buttons">
              <button className="btn-icon" title="Editar" onClick={() => handleEdit(objective)}>
                ✎
              </button>
              <button className="btn-icon" title="Drill-down" onClick={() => setDrilldownObjectiveId(objective.id)}>
                ⇲
              </button>
              <button
                className="btn-icon"
                title="Eliminar"
                onClick={() => handleDelete(objective.id, objective.name)}
                disabled={deleteMutation.isLoading}
              >
                🗑
              </button>
            </div>
          </td>
        </tr>
        {isKpiExpanded && totalLinkedItems > 0 && (
          <tr className="kpi-row">
            <td />
            <td colSpan={4}>
              <div className="kpi-list">
                {objective.kpis?.map((kpi) => (
                  <div key={`kpi-${kpi.id}`} className="kpi-pill">
                    <div className="kpi-title">{kpi.name}</div>
                    <div className="kpi-meta">
                      <span className="kpi-type">{kpi.type}</span>
                      {((kpi as any).area || (kpi as any).areas) && (
                        <span className="kpi-area">
                          Área: {(kpi as any).area || ((kpi as any).areas || []).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {objective.scopeKpis?.map((scopeKpi) => (
                  <div key={`scope-kpi-${scopeKpi.id}`} className="kpi-pill">
                    <div className="kpi-title">{scopeKpi.name}</div>
                    <div className="kpi-meta">
                      <span className="kpi-type">scope KPI</span>
                      <span className="kpi-area">
                        Scope: {scopeKpi.orgScopeName || `#${scopeKpi.orgScopeId}`}
                      </span>
                      {scopeKpi.periodName ? <span className="kpi-area">Periodo: {scopeKpi.periodName}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </td>
            <td />
          </tr>
        )}
        {hasChildren && isExpanded && objective.children?.map((child) => renderObjectiveRow(child, true))}
      </Fragment>
    )
  }

  const hierarchicalObjectives = buildHierarchy()

  return (
    <div className="arbol-objetivos-page">
      <div className="page-header">
        <div>
          <h1>Árbol de Objetivos</h1>
          <p className="subtitle">Visualiza la jerarquía de objetivos organizacionales</p>
        </div>
        <button className="btn-primary" onClick={handleCreate}>
          + Agregar Objetivo
        </button>
      </div>

      <div className="table-container">
        {isLoading ? (
          <div className="loading">Cargando objetivos...</div>
        ) : hierarchicalObjectives && hierarchicalObjectives.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Nivel</th>
                <th>Padre</th>
                <th>KPIs Asociados</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>{hierarchicalObjectives.map((objective) => renderObjectiveRow(objective))}</tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📄</div>
            <h3>No hay objetivos definidos</h3>
            <p>Comienza creando el árbol de objetivos de tu organización</p>
            <button className="btn-primary" onClick={handleCreate}>
              Agregar Objetivo
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <ObjectiveTreeForm
          objective={editingObjective}
          onClose={() => {
            setShowForm(false)
            setEditingObjective(undefined)
          }}
          onSuccess={() => {
            setShowForm(false)
            setEditingObjective(undefined)
          }}
        />
      )}

      {drilldownObjectiveId && (
        <div className="modal-overlay" onClick={() => setDrilldownObjectiveId(null)}>
          <div className="modal-content objective-drilldown-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{drilldownObjective?.name || 'Drill-down objetivo'}</h2>
                <p className="subtitle">
                  {drilldownObjective?.level ? `Nivel ${drilldownObjective.level}` : 'Cargando relación estratégica...'}
                </p>
              </div>
              <button className="close-button" onClick={() => setDrilldownObjectiveId(null)}>
                ×
              </button>
            </div>

            {isLoadingDrilldown ? (
              <div className="loading">Cargando drill-down...</div>
            ) : drilldownObjective ? (
              <div className="objective-drilldown-content">
                <div className="objective-drilldown-summary">
                  <div className="objective-drilldown-stat">
                    <span className="objective-drilldown-label">KPIs base</span>
                    <strong>{drilldownObjective.kpis?.length || 0}</strong>
                  </div>
                  <div className="objective-drilldown-stat">
                    <span className="objective-drilldown-label">Scope KPIs</span>
                    <strong>{drilldownObjective.scopeKpis?.length || 0}</strong>
                  </div>
                </div>

                {drilldownObjective.kpis?.length ? (
                  <div className="objective-drilldown-section">
                    <h3>KPIs base asociados</h3>
                    <div className="kpi-list">
                      {drilldownObjective.kpis.map((kpi) => (
                        <div key={`drilldown-kpi-${kpi.id}`} className="kpi-pill">
                          <div className="kpi-title">{kpi.name}</div>
                          <div className="kpi-meta">
                            <span className="kpi-type">{kpi.type}</span>
                            {((kpi as any).area || (kpi as any).areas) && (
                              <span className="kpi-area">
                                Área: {(kpi as any).area || ((kpi as any).areas || []).join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="objective-drilldown-section">
                  <h3>Scope KPIs vinculados</h3>
                  {drilldownObjective.scopeKpis?.length ? (
                    <div className="objective-scope-grid">
                      {drilldownObjective.scopeKpis.map((scopeKpi: ObjectiveDrilldownScopeKpi) => (
                        <div key={`drilldown-scope-${scopeKpi.id}`} className="objective-scope-card">
                          <div className="objective-scope-header">
                            <div>
                              <h4>{scopeKpi.name}</h4>
                              <p>
                                {scopeKpi.orgScopeName || 'Scope'} · {scopeKpi.ownerLevel || 'owner'}
                              </p>
                            </div>
                            <span className={`level-badge level-${scopeKpi.status === 'approved' ? 'management' : 'individual'}`}>
                              {scopeKpi.status || 'draft'}
                            </span>
                          </div>

                          <div className="objective-scope-metrics">
                            <div>
                              <span>Actual</span>
                              <strong>{scopeKpi.actual ?? '-'}</strong>
                            </div>
                            <div>
                              <span>Target</span>
                              <strong>{scopeKpi.target ?? '-'}</strong>
                            </div>
                            <div>
                              <span>Resultado</span>
                              <strong>{scopeKpi.weightedResult ?? '-'}</strong>
                            </div>
                          </div>

                          <div className="objective-scope-meta">
                            <span>Source: {scopeKpi.sourceMode || '-'}</span>
                            {scopeKpi.periodName ? <span>Período: {scopeKpi.periodName}</span> : null}
                            {scopeKpi.subPeriodName ? <span>Subperíodo: {scopeKpi.subPeriodName}</span> : null}
                          </div>
                          {scopeKpi.sourceMode === 'mixed' ? (
                            <div className="objective-scope-meta">
                              <span>
                                {scopeKpi.mixedConfig?.directLabel || 'Directo'}: {scopeKpi.directActual ?? '-'}
                              </span>
                              <span>
                                {scopeKpi.mixedConfig?.aggregatedLabel || 'Agregado'}: {scopeKpi.aggregatedActual ?? '-'}
                              </span>
                              <span>
                                Mix: {scopeKpi.mixedConfig?.directWeight ?? 50}/{scopeKpi.mixedConfig?.aggregatedWeight ?? 50}
                              </span>
                            </div>
                          ) : null}

                          <div className="objective-scope-links">
                            <h5>Contribuciones</h5>
                            <div className="objective-scope-actions">
                              <button
                                type="button"
                                className="link-button"
                                onClick={() => setDetailScopeKpi(scopeKpi)}
                              >
                                Ver detalle
                              </button>
                            </div>
                            {scopeKpi.links?.length ? (
                              <div className="objective-link-list">
                                {scopeKpi.links.map((link: ObjectiveDrilldownScopeLink) => (
                                  <div key={`drilldown-link-${link.id}`} className="objective-link-item">
                                    <div className="objective-link-main">
                                      <strong>
                                        {link.childType === 'collaborator'
                                          ? `${link.collaboratorName || 'Colaborador'} · ${link.collaboratorKpiName || 'KPI'}`
                                          : `${link.childScopeKpiName || 'Scope KPI'} · ${link.childScopeOrgScopeName || 'Scope'}`}
                                      </strong>
                                      <span>
                                        {link.aggregationMethod}
                                        {link.contributionWeight != null ? ` · peso ${link.contributionWeight}` : ''}
                                      </span>
                                    </div>
                                    <div className="objective-link-meta">
                                      {link.childType === 'collaborator' ? (
                                        <>
                                          <span>Actual: {link.collaboratorActual ?? '-'}</span>
                                          <span>Target: {link.collaboratorTarget ?? '-'}</span>
                                          <span>Resultado: {link.collaboratorWeightedResult ?? '-'}</span>
                                          {link.collaboratorSubPeriodName || link.collaboratorPeriodName ? (
                                            <span>
                                              {link.collaboratorSubPeriodName || link.collaboratorPeriodName}
                                            </span>
                                          ) : null}
                                        </>
                                      ) : (
                                        <>
                                          <span>Actual: {link.childScopeActual ?? '-'}</span>
                                          <span>Target: {link.childScopeTarget ?? '-'}</span>
                                          <span>Resultado: {link.childScopeWeightedResult ?? '-'}</span>
                                          {link.childScopeSubPeriodName || link.childScopePeriodName ? (
                                            <span>{link.childScopeSubPeriodName || link.childScopePeriodName}</span>
                                          ) : null}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="helper-text">Este Scope KPI todavía no tiene contribuciones configuradas.</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state compact">
                      <p>Este objetivo todavía no tiene Scope KPIs vinculados.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty-state compact">
                <p>No se pudo cargar el drill-down del objetivo.</p>
              </div>
            )}
          </div>
        </div>
      )}
      {detailScopeKpi ? (
        <ScopeKPIDetailModal
          scopeKpiId={detailScopeKpi.id}
          initialScopeKpi={detailScopeKpi as any}
          onClose={() => setDetailScopeKpi(null)}
        />
      ) : null}
    </div>
  )
}
