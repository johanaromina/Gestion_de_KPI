import { Fragment, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import api from '../services/api'
import { ObjectiveTree } from '../types'
import ObjectiveTreeForm from '../components/ObjectiveTreeForm'
import './ArbolObjetivos.css'

export default function ArbolObjetivos() {
  const [showForm, setShowForm] = useState(false)
  const [editingObjective, setEditingObjective] = useState<ObjectiveTree | undefined>(undefined)
  const [expandedObjectives, setExpandedObjectives] = useState<Set<number>>(new Set())

  const queryClient = useQueryClient()

  const { data: objectives, isLoading } = useQuery<ObjectiveTree[]>(
    'objective-trees',
    async () => {
      const response = await api.get('/objective-trees')
      return response.data
    },
    { retry: false }
  )

  const deleteMutation = useMutation(
    async (id: number) => {
      await api.delete(`/objective-trees/${id}`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('objective-trees')
      },
      onError: (error: any) => {
        alert(
          error.response?.data?.error ||
            'Error al eliminar objetivo. Verifica que no tenga objetivos hijos asociados.'
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
    if (
      window.confirm(
        `¿Estás seguro de eliminar el objetivo "${name}"? Esta acción eliminará también todos los objetivos hijos asociados.`
      )
    ) {
      deleteMutation.mutate(id)
    }
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

  const isOKR = (name?: string) => {
    if (!name) return false
    return name.trim().toUpperCase().startsWith('OKR')
  }

  const isCompany = (obj?: ObjectiveTree) => {
    if (!obj) return false
    return obj.level === 'company' || (obj.name || '').toLowerCase().includes('compa')
  }

  const buildHierarchy = (): (ObjectiveTree & { level: number; children?: any[] })[] => {
    if (!objectives) return []

    const rootObjectives = objectives.filter((o) => !o.parentId)
    const childrenMap = new Map<number, ObjectiveTree[]>()

    objectives.forEach((obj) => {
      if (obj.parentId) {
        if (!childrenMap.has(obj.parentId)) {
          childrenMap.set(obj.parentId, [])
        }
        childrenMap.get(obj.parentId)!.push(obj)
      }
    })

    const buildTree = (
      parent: ObjectiveTree,
      level: number = 0
    ): ObjectiveTree & { level: number; children?: any[] } => {
      const children = childrenMap.get(parent.id) || []
      const sortedChildren = [...children].sort((a, b) => {
        const okrA = isOKR(a.name) ? 0 : 1
        const okrB = isOKR(b.name) ? 0 : 1
        if (okrA !== okrB) return okrA - okrB
        return (a.name || '').localeCompare(b.name || '')
      })
      return {
        ...parent,
        level,
        children: sortedChildren.map((child) => buildTree(child, level + 1)),
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
    objective: ObjectiveTree & { level?: number; children?: any[] },
    isChild: boolean = false
  ) => {
    const hasChildren = objective.children && objective.children.length > 0
    const isExpanded = expandedObjectives.has(objective.id)
    const okr = isOKR(objective.name)

    return (
      <Fragment key={objective.id}>
        <tr className={`${isChild ? 'child-row' : ''} ${okr ? 'okr-row' : ''}`}>
          <td>{objective.id}</td>
          <td className="name-cell" style={{ paddingLeft: `${(objective.level || 0) * 20}px` }}>
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
          <td>{objective.kpis?.length || 0} KPIs</td>
          <td>
            <div className="action-buttons">
              <button className="btn-icon" title="Editar" onClick={() => handleEdit(objective)}>
                ✎
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
    </div>
  )
}
