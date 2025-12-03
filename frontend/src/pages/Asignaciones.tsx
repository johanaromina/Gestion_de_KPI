import { useQuery } from 'react-query'
import api from '../services/api'
import { CollaboratorKPI } from '../types'
import './Asignaciones.css'

export default function Asignaciones() {
  const { data: assignments, isLoading } = useQuery<CollaboratorKPI[]>(
    'collaborator-kpis',
    async () => {
      // TODO: Implementar endpoint en backend
      // const response = await api.get('/collaborator-kpis')
      // return response.data
      return []
    },
    {
      retry: false,
    }
  )

  const getStatusBadge = (status: CollaboratorKPI['status']) => {
    const statusConfig = {
      draft: { label: 'Borrador', class: 'status-draft' },
      proposed: { label: 'Propuesto', class: 'status-proposed' },
      approved: { label: 'Aprobado', class: 'status-approved' },
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
    <div className="asignaciones-page">
      <div className="page-header">
        <div>
          <h1>Asignaciones de KPIs</h1>
          <p className="subtitle">Gestiona las asignaciones de KPIs a colaboradores</p>
        </div>
        <button className="btn-primary">➕ Nueva Asignación</button>
      </div>

      <div className="table-container">
        {isLoading ? (
          <div className="loading">Cargando asignaciones...</div>
        ) : assignments && assignments.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Colaborador</th>
                <th>KPI</th>
                <th>Período</th>
                <th>Meta</th>
                <th>Actual</th>
                <th>Peso</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td>{assignment.id}</td>
                  <td>Colaborador #{assignment.collaboratorId}</td>
                  <td>KPI #{assignment.kpiId}</td>
                  <td>Período #{assignment.periodId}</td>
                  <td>{assignment.target}</td>
                  <td>{assignment.actual ?? '-'}</td>
                  <td>{assignment.weight}%</td>
                  <td>{getStatusBadge(assignment.status)}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-icon" title="Editar">✏️</button>
                      <button className="btn-icon" title="Ver Detalles">👁️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>No hay asignaciones registradas</h3>
            <p>Crea una nueva asignación para vincular KPIs con colaboradores</p>
            <button className="btn-primary">Nueva Asignación</button>
          </div>
        )}
      </div>
    </div>
  )
}

