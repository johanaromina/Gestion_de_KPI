import { useQuery } from 'react-query'
import api from '../services/api'
import { Period } from '../types'
import { format } from 'date-fns'
import './Periodos.css'

export default function Periodos() {
  const { data: periods, isLoading } = useQuery<Period[]>(
    'periods',
    async () => {
      // TODO: Implementar endpoint en backend
      // const response = await api.get('/periods')
      // return response.data
      return []
    },
    {
      retry: false,
    }
  )

  const getStatusBadge = (status: Period['status']) => {
    const statusConfig = {
      open: { label: 'Abierto', class: 'status-open' },
      in_review: { label: 'En Revisión', class: 'status-review' },
      closed: { label: 'Cerrado', class: 'status-closed' },
    }
    const config = statusConfig[status]
    return (
      <span className={`status-badge ${config.class}`}>
        {config.label}
      </span>
    )
  }

  return (
    <div className="periodos-page">
      <div className="page-header">
        <div>
          <h1>Períodos</h1>
          <p className="subtitle">Gestiona los períodos de evaluación</p>
        </div>
        <button className="btn-primary">➕ Crear Período</button>
      </div>

      <div className="table-container">
        {isLoading ? (
          <div className="loading">Cargando períodos...</div>
        ) : periods && periods.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Fecha Inicio</th>
                <th>Fecha Fin</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => (
                <tr key={period.id}>
                  <td>{period.id}</td>
                  <td className="name-cell">{period.name}</td>
                  <td>
                    {format(new Date(period.startDate), 'dd MMM yyyy')}
                  </td>
                  <td>
                    {format(new Date(period.endDate), 'dd MMM yyyy')}
                  </td>
                  <td>{getStatusBadge(period.status)}</td>
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
            <div className="empty-icon">📅</div>
            <h3>No hay períodos registrados</h3>
            <p>Crea un nuevo período para comenzar a evaluar KPIs</p>
            <button className="btn-primary">Crear Período</button>
          </div>
        )}
      </div>
    </div>
  )
}

