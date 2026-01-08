/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import api from '../services/api'
import './Auditoria.css'

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'CLOSE' | 'REOPEN' | 'APPROVE' | 'REJECT'

interface AuditLog {
  id: number
  entityType: string
  entityId: number
  action: AuditAction
  userId?: number
  userName?: string
  oldValues?: any
  newValues?: any
  changes?: Record<string, { old: any; new: any }>
  ipAddress?: string
  userAgent?: string
  success?: boolean
  createdAt: string
  durationMs?: number
}

export default function Auditoria() {
  const [filters, setFilters] = useState({
    entityType: '',
    entityId: '',
    action: '',
    userId: '',
    startDate: '',
    endDate: '',
    success: '',
    kpiId: '',
    collaboratorId: '',
    periodId: '',
  })
  const [page, setPage] = useState(1)
  const limit = 50
  const [search, setSearch] = useState('')

  const { data: auditData, isLoading } = useQuery<{ logs: AuditLog[]; total: number }>(
    ['audit-logs', filters, page, search],
    async () => {
      const params = new URLSearchParams()
      if (filters.entityType) params.append('entityType', filters.entityType)
      if (filters.entityId) params.append('entityId', filters.entityId)
      if (filters.action) params.append('action', filters.action)
      if (filters.userId) params.append('userId', filters.userId)
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)
      if (filters.success !== '') params.append('success', filters.success)
      if (filters.kpiId) params.append('kpiId', filters.kpiId)
      if (filters.collaboratorId) params.append('collaboratorId', filters.collaboratorId)
      if (filters.periodId) params.append('periodId', filters.periodId)
      if (search) params.append('search', search)
      params.append('limit', limit.toString())
      params.append('offset', ((page - 1) * limit).toString())
      const response = await api.get(`/audit-logs?${params.toString()}`)
      return response.data
    },
    { keepPreviousData: true }
  )

  const totalPages = Math.max(1, Math.ceil((auditData?.total || 0) / limit))

  const actionConfig: Record<
    string,
    { label: string; class: string; critical?: boolean }
  > = {
    CREATE: { label: 'Crear', class: 'badge-success' },
    UPDATE: { label: 'Actualizar', class: 'badge-info' },
    DELETE: { label: 'Eliminar', class: 'badge-critical', critical: true },
    CLOSE: { label: 'Cerrar', class: 'badge-critical', critical: true },
    REOPEN: { label: 'Reabrir', class: 'badge-info' },
    APPROVE: { label: 'Aprobar', class: 'badge-success' },
    REJECT: { label: 'Rechazar', class: 'badge-warn' },
  }

  const getActionBadge = (action: string) => {
    const cfg = actionConfig[action] || { label: action, class: 'badge-info' }
    return <span className={`badge-action ${cfg.class}`}>{cfg.label}</span>
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

  const formatChanges = (log: AuditLog) => {
    const changes = log.changes
    if (!changes) return null
    return (
      <div className="diff-grid">
        {Object.entries(changes).map(([field, change]) => (
          <div key={field} className="diff-item">
            <span className="diff-label">{field}:</span>
            <span className="diff-old">{JSON.stringify(change.old)}</span> →{' '}
            <span className="diff-new">{JSON.stringify(change.new)}</span>
          </div>
        ))}
      </div>
    )
  }

  const filteredLogs = useMemo(() => auditData?.logs || [], [auditData])

  return (
    <div className="auditoria-page">
      <div className="page-header">
        <div>
          <h1>Auditoría</h1>
          <p className="subtitle">Historial de cambios en el sistema</p>
        </div>
      </div>

      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="entity-type">Tipo de Entidad:</label>
          <select
            id="entity-type"
            value={filters.entityType}
            onChange={(e) => {
              setFilters({ ...filters, entityType: e.target.value })
              setPage(1)
            }}
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
            onChange={(e) => {
              setFilters({ ...filters, action: e.target.value })
              setPage(1)
            }}
          >
            <option value="">Todas</option>
            <option value="CREATE">Crear</option>
            <option value="UPDATE">Actualizar</option>
            <option value="DELETE">Eliminar</option>
            <option value="CLOSE">Cerrar</option>
            <option value="REOPEN">Reabrir</option>
            <option value="APPROVE">Aprobar</option>
            <option value="REJECT">Rechazar</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="entity-id">ID de Entidad:</label>
          <input
            type="number"
            id="entity-id"
            value={filters.entityId}
            onChange={(e) => {
              setFilters({ ...filters, entityId: e.target.value })
              setPage(1)
            }}
            placeholder="Ej: 123"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="user-id">Usuario ID:</label>
          <input
            type="number"
            id="user-id"
            value={filters.userId}
            onChange={(e) => {
              setFilters({ ...filters, userId: e.target.value })
              setPage(1)
            }}
            placeholder="Ej: 12"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="success">Resultado:</label>
          <select
            id="success"
            value={filters.success}
            onChange={(e) => {
              setFilters({ ...filters, success: e.target.value })
              setPage(1)
            }}
          >
            <option value="">Todos</option>
            <option value="true">Éxito</option>
            <option value="false">Error</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="kpi-id">KPI ID:</label>
          <input
            type="number"
            id="kpi-id"
            value={filters.kpiId}
            onChange={(e) => {
              setFilters({ ...filters, kpiId: e.target.value })
              setPage(1)
            }}
            placeholder="Ej: 28"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="collab-id">Colaborador ID:</label>
          <input
            type="number"
            id="collab-id"
            value={filters.collaboratorId}
            onChange={(e) => {
              setFilters({ ...filters, collaboratorId: e.target.value })
              setPage(1)
            }}
            placeholder="Ej: 63"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="period-id">Período ID:</label>
          <input
            type="number"
            id="period-id"
            value={filters.periodId}
            onChange={(e) => {
              setFilters({ ...filters, periodId: e.target.value })
              setPage(1)
            }}
            placeholder="Ej: 1"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="start-date">Fecha Inicio:</label>
          <input
            type="date"
            id="start-date"
            value={filters.startDate}
            onChange={(e) => {
              setFilters({ ...filters, startDate: e.target.value })
              setPage(1)
            }}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="end-date">Fecha Fin:</label>
          <input
            type="date"
            id="end-date"
            value={filters.endDate}
            onChange={(e) => {
              setFilters({ ...filters, endDate: e.target.value })
              setPage(1)
            }}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="search">Buscar</label>
          <input
            id="search"
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Usuario, KPI, comentario..."
          />
        </div>

        <div className="filter-group">
          <button
            className="btn-clear-filters"
            onClick={() => {
              setFilters({
                entityType: '',
                entityId: '',
                action: '',
                userId: '',
                startDate: '',
                endDate: '',
                success: '',
                kpiId: '',
                collaboratorId: '',
                periodId: '',
              })
              setSearch('')
              setPage(1)
            }}
          >
            Limpiar Filtros
          </button>
        </div>
      </div>

      <div className="table-section">
        {isLoading ? (
          <div className="loading">Cargando logs de auditoría...</div>
        ) : filteredLogs.length > 0 ? (
          <>
            <div className="table-info">
              Mostrando {filteredLogs.length} de {auditData?.total || 0} registros
            </div>
            <div className="table-container">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Usuario</th>
                    <th>Acción</th>
                    <th>Entidad</th>
                    <th>ID</th>
                    <th>Resultado</th>
                    <th>Duración</th>
                    <th>IP</th>
                    <th>UA</th>
                    <th>Cambios</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => {
                    const isCritical = actionConfig[log.action]?.critical
                    return (
                      <tr key={log.id}>
                        <td className="date-cell">{new Date(log.createdAt).toLocaleString()}</td>
                        <td>
                          <div>{log.userName || `User #${log.userId ?? '-'}`}</div>
                          <div className="text-muted">#{log.userId ?? '-'}</div>
                        </td>
                        <td>
                          {getActionBadge(log.action)}
                          {isCritical && <span className="pill">Crítico</span>}
                        </td>
                        <td>{getEntityTypeLabel(log.entityType)}</td>
                        <td>{log.entityId}</td>
                        <td>
                          {log.success === undefined ? (
                            '-'
                          ) : log.success ? (
                            <span className="badge-action badge-success">Éxito</span>
                          ) : (
                            <span className="badge-action badge-critical">Error</span>
                          )}
                        </td>
                        <td>{log.durationMs ? `${log.durationMs} ms` : '-'}</td>
                        <td className="ip-cell">{log.ipAddress || '-'}</td>
                        <td className="text-muted">{log.userAgent ? log.userAgent.slice(0, 25) + '…' : '-'}</td>
                        <td className="changes-cell">{formatChanges(log) || <span className="text-muted">-</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <button
                className="btn-pagination"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Anterior
              </button>
              <span className="page-info">
                Página {page} de {totalPages}
              </span>
              <button
                className="btn-pagination"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Siguiente
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">:(</div>
            <h3>Sin registros</h3>
            <p>Prueba ajustando los filtros</p>
          </div>
        )}
      </div>
    </div>
  )
}
