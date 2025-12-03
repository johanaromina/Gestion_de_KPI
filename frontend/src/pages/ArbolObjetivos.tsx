import { useQuery } from 'react-query'
import api from '../services/api'
import { ObjectiveTree } from '../types'
import './ArbolObjetivos.css'

export default function ArbolObjetivos() {
  const { data: objectives, isLoading } = useQuery<ObjectiveTree[]>(
    'objective-trees',
    async () => {
      // TODO: Implementar endpoint en backend
      // const response = await api.get('/objective-trees')
      // return response.data
      return []
    },
    {
      retry: false,
    }
  )

  const getLevelBadge = (level: ObjectiveTree['level']) => {
    const levelConfig = {
      company: { label: 'Empresa', class: 'level-company' },
      direction: { label: 'Dirección', class: 'level-direction' },
      management: { label: 'Gerencia', class: 'level-management' },
      leadership: { label: 'Liderazgo', class: 'level-leadership' },
      individual: { label: 'Individual', class: 'level-individual' },
    }
    const config = levelConfig[level]
    return (
      <span className={`level-badge ${config.class}`}>
        {config.label}
      </span>
    )
  }

  return (
    <div className="arbol-objetivos-page">
      <div className="page-header">
        <div>
          <h1>Árbol de Objetivos</h1>
          <p className="subtitle">Visualiza la jerarquía de objetivos organizacionales</p>
        </div>
        <button className="btn-primary">➕ Agregar Objetivo</button>
      </div>

      <div className="table-container">
        {isLoading ? (
          <div className="loading">Cargando objetivos...</div>
        ) : objectives && objectives.length > 0 ? (
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
            <tbody>
              {objectives.map((objective) => (
                <tr key={objective.id}>
                  <td>{objective.id}</td>
                  <td className="name-cell">{objective.name}</td>
                  <td>{getLevelBadge(objective.level)}</td>
                  <td>{objective.parentId ? `Objetivo #${objective.parentId}` : '-'}</td>
                  <td>{objective.kpis?.length || 0} KPIs</td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-icon" title="Editar">✏️</button>
                      <button className="btn-icon" title="Ver Detalles">👁️</button>
                      <button className="btn-icon" title="Eliminar">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">🌳</div>
            <h3>No hay objetivos definidos</h3>
            <p>Comienza creando el árbol de objetivos de tu organización</p>
            <button className="btn-primary">Agregar Objetivo</button>
          </div>
        )}
      </div>
    </div>
  )
}

