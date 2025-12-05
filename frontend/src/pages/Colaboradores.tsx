import { useQuery } from 'react-query'
import api from '../services/api'
import { Collaborator } from '../types'
import './Colaboradores.css'

export default function Colaboradores() {
  const { data: collaborators, isLoading } = useQuery<Collaborator[]>(
    'collaborators',
    async () => {
      const response = await api.get('/collaborators')
      return response.data
    },
    {
      retry: false,
    }
  )

  return (
    <div className="colaboradores-page">
      <div className="page-header">
        <div>
          <h1>Colaboradores</h1>
          <p className="subtitle">Gestiona los colaboradores del sistema</p>
        </div>
        <button className="btn-primary">➕ Agregar Colaborador</button>
      </div>

      <div className="table-container">
        {isLoading ? (
          <div className="loading">Cargando colaboradores...</div>
        ) : collaborators && collaborators.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Cargo</th>
                <th>Área</th>
                <th>Rol</th>
                <th>Manager</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {collaborators.map((collaborator) => (
                <tr key={collaborator.id}>
                  <td>{collaborator.id}</td>
                  <td className="name-cell">{collaborator.name}</td>
                  <td>{collaborator.position}</td>
                  <td>{collaborator.area}</td>
                  <td>
                    <span className={`role-badge role-${collaborator.role}`}>
                      {collaborator.role}
                    </span>
                  </td>
                  <td>{collaborator.managerId || '-'}</td>
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
            <div className="empty-icon">👥</div>
            <h3>No hay colaboradores registrados</h3>
            <p>Comienza agregando tu primer colaborador al sistema</p>
            <button className="btn-primary">Agregar Colaborador</button>
          </div>
        )}
      </div>
    </div>
  )
}

