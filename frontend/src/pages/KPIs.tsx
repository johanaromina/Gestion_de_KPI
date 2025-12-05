import { useQuery } from 'react-query'
import api from '../services/api'
import { KPI } from '../types'
import './KPIs.css'

export default function KPIs() {
  const { data: kpis, isLoading } = useQuery<KPI[]>(
    'kpis',
    async () => {
      const response = await api.get('/kpis')
      return response.data
    },
    {
      retry: false,
    }
  )

  const getTypeBadge = (type: KPI['type']) => {
    const typeConfig = {
      growth: { label: 'Crecimiento', class: 'type-growth' },
      reduction: { label: 'Reducción', class: 'type-reduction' },
      exact: { label: 'Exacto', class: 'type-exact' },
    }
    const config = typeConfig[type]
    return (
      <span className={`type-badge ${config.class}`}>
        {config.label}
      </span>
    )
  }

  return (
    <div className="kpis-page">
      <div className="page-header">
        <div>
          <h1>KPIs</h1>
          <p className="subtitle">Gestiona las definiciones de KPIs</p>
        </div>
        <button className="btn-primary">➕ Crear KPI</button>
      </div>

      <div className="table-container">
        {isLoading ? (
          <div className="loading">Cargando KPIs...</div>
        ) : kpis && kpis.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Descripción</th>
                <th>Tipo</th>
                <th>Criterio</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {kpis.map((kpi) => (
                <tr key={kpi.id}>
                  <td>{kpi.id}</td>
                  <td className="name-cell">{kpi.name}</td>
                  <td className="description-cell">{kpi.description || '-'}</td>
                  <td>{getTypeBadge(kpi.type)}</td>
                  <td className="criteria-cell">{kpi.criteria || '-'}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-icon" title="Editar">✏️</button>
                      <button className="btn-icon" title="Eliminar">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">🎯</div>
            <h3>No hay KPIs definidos</h3>
            <p>Crea tu primer KPI para comenzar a evaluar el desempeño</p>
            <button className="btn-primary">Crear KPI</button>
          </div>
        )}
      </div>
    </div>
  )
}

