import { useState } from 'react'
import { useQuery } from 'react-query'
import api from '../services/api'
import './Auditoria.css'

interface AuditLog {
  id: number
  entityType: string
  entityId: number
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  userId?: number
  userName?: string
  oldValues?: any
  newValues?: any
  changes?: any
  ipAddress?: string
  userAgent?: string
  createdAt: string
}

export default function Auditoria() {
  const [filters, setFilters] = useState({
    entityType: '',
    entityId: '',
    action: '',
    userId: '',
    startDate: '',
    endDate: '',
  })
  const [page, setPage] = useState(1)
  const limit = 50

  const { data: auditData, isLoading } = useQuery<{
    logs: AuditLog[]
    total: number
  }>(
    ['audit-logs', filters, page],
    async () => {
      const params = new URLSearchParams()
      if (filters.entityType) params.append('entityType', filters.entityType)
      if (filters.entityId) params.append('entityId', filters.entityId)
      if (filters.action) params.append('action', filters.action)
      if (filters.userId) params.append('userId', filters.userId)
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)
      params.append('limit', limit.toString())
      params.append('offset', ((page - 1) * limit).toString())

      const response = await api.get(`/audit-logs?${params.toString()}`)
      return response.data
    },
    { enabled: true }
  )

  const getActionBadge = (action: string) => {
    const config = {
      CREATE: { label: 'Crear', class: 'action-create' },
      UPDATE: { label: 'Actualizar', class: 'action-update' },
      DELETE: { label: 'Eliminar', class: 'action-delete' },
    }
    const actionConfig = config[action as keyof typeof config] || config.UPDATE
    return (
      <span className={`action-badge ${actionConfig.class}`}>
        {actionConfig.label}
      </span>
    )
  }

  const getEntityTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      collaborators: 'Colaboradores',
      kpis: 'KPIs',
      collaborator_kpis: 'Asignaciones',
      periods: 'Períodos',
      sub_periods: 'Subperíodos',
      objective_trees: 'Árbol de Objetivos',
    }
    return labels[type] || type
  }

  const formatChanges = (changes: any) => {
    if (!changes) return null
    return Object.entries(changes).map(([key, value]: [string, any]) => (
      <div key={key} className="change-item">
        <strong>{key}:</strong>{' '}
        <span className="old-value">{JSON.stringify(value.old)}</span> →{' '}
        <span className="new-value">{JSON.stringify(value.new)}</span>
      </div>
    ))
  }

  const totalPages = Math.ceil((auditData?.total || 0) / limit)

  return (
    <div className="auditoria-page">
      <div className="page-header">
        <div>
          <h1>📋 Auditoría</h1>
          <p className="subtitle">Historial de cambios en el sistema</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="entity-type">Tipo de Entidad:</label>
          <select
            id="entity-type"
            value={filters.entityType}
            onChange={(e) =>
              setFilters({ ...filters, entityType: e.target.value, page: 1 })
            }
          >
            <option value="">Todos</option>
            <option value="collaborators">Colaboradores</option>
            <option value="kpis">KPIs</option>
            <option value="collaborator_kpis">Asignaciones</option>
            <option value="periods">Períodos</option>
            <option value="sub_periods">Subperíodos</option>
            <option value="objective_trees">Árbol de Objetivos</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="action">Acción:</label>
          <select
            id="action"
            value={filters.action}
            onChange={(e) =>
              setFilters({ ...filters, action: e.target.value, page: 1 })
            }
          >
            <option value="">Todas</option>
            <option value="CREATE">Crear</option>
            <option value="UPDATE">Actualizar</option>
            <option value="DELETE">Eliminar</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="entity-id">ID de Entidad:</label>
          <input
            type="number"
            id="entity-id"
            value={filters.entityId}
            onChange={(e) =>
              setFilters({ ...filters, entityId: e.target.value, page: 1 })
            }
            placeholder="Ej: 123"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="start-date">Fecha Inicio:</label>
          <input
            type="date"
            id="start-date"
            value={filters.startDate}
            onChange={(e) =>
              setFilters({ ...filters, startDate: e.target.value, page: 1 })
            }
          />
        </div>

        <div className="filter-group">
          <label htmlFor="end-date">Fecha Fin:</label>
          <input
            type="date"
            id="end-date"
            value={filters.endDate}
            onChange={(e) =>
              setFilters({ ...filters, endDate: e.target.value, page: 1 })
            }
          />
        </div>

        <div className="filter-group">
          <button
            className="btn-clear-filters"
            onClick={() =>
              setFilters({
                entityType: '',
                entityId: '',
                action: '',
                userId: '',
                startDate: '',
                endDate: '',
              })
            }
          >
            Limpiar Filtros
          </button>
        </div>
      </div>

      {/* Tabla de logs */}
      <div className="table-section">
        {isLoading ? (
          <div className="loading">Cargando logs de auditoría...</div>
        ) : auditData && auditData.logs.length > 0 ? (
          <>
            <div className="table-info">
              <p>
                Mostrando {auditData.logs.length} de {auditData.total} registros
              </p>
            </div>
            <div className="table-container">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Fecha/Hora</th>
                    <th>Entidad</th>
                    <th>ID</th>
                    <th>Acción</th>
                    <th>Usuario</th>
                    <th>Cambios</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {auditData.logs.map((log) => (
                    <tr key={log.id}>
                      <td className="date-cell">
                        {new Date(log.createdAt).toLocaleString('es-ES')}
                      </td>
                      <td>{getEntityTypeLabel(log.entityType)}</td>
                      <td>{log.entityId}</td>
                      <td>{getActionBadge(log.action)}</td>
                      <td>{log.userName || log.userId || 'Sistema'}</td>
                      <td className="changes-cell">
                        {log.changes ? (
                          <details>
                            <summary>Ver cambios</summary>
                            <div className="changes-detail">
                              {formatChanges(log.changes)}
                            </div>
                          </details>
                        ) : log.action === 'CREATE' ? (
                          <span className="text-muted">Nuevo registro</span>
                        ) : log.action === 'DELETE' ? (
                          <span className="text-muted">Registro eliminado</span>
                        ) : (
                          <span className="text-muted">Sin cambios</span>
                        )}
                      </td>
                      <td className="ip-cell">{log.ipAddress || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="btn-pagination"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                >
                  Anterior
                </button>
                <span className="page-info">
                  Página {page} de {totalPages}
                </span>
                <button
                  className="btn-pagination"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <p>No hay registros de auditoría para los filtros seleccionados</p>
          </div>
        )}
      </div>
    </div>
  )
}

