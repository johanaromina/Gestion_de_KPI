/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('audit')
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

  const actionConfig: Record<string, { class: string; critical?: boolean }> = {
    CREATE: { class: 'badge-success' },
    UPDATE: { class: 'badge-info' },
    DELETE: { class: 'badge-critical', critical: true },
    CLOSE: { class: 'badge-critical', critical: true },
    REOPEN: { class: 'badge-info' },
    APPROVE: { class: 'badge-success' },
    REJECT: { class: 'badge-warn' },
  }

  const getActionBadge = (action: string) => {
    const cfg = actionConfig[action] || { class: 'badge-info' }
    return (
      <span className={`badge-action ${cfg.class}`}>
        {t(`actions.${action}`, { defaultValue: action })}
      </span>
    )
  }

  const getEntityTypeLabel = (type: string) =>
    t(`entity_types.${type}`, { defaultValue: type })

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
          <h1>{t('title')}</h1>
          <p className="subtitle">{t('subtitle')}</p>
        </div>
      </div>

      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="entity-type">{t('filters.entity_type_label')}</label>
          <select
            id="entity-type"
            value={filters.entityType}
            onChange={(e) => {
              setFilters({ ...filters, entityType: e.target.value })
              setPage(1)
            }}
          >
            <option value="">{t('filters.entity_type_all')}</option>
            <option value="collaborators">{t('entity_types.collaborators')}</option>
            <option value="kpis">{t('entity_types.kpis')}</option>
            <option value="collaborator_kpis">{t('entity_types.collaborator_kpis')}</option>
            <option value="periods">{t('entity_types.periods')}</option>
            <option value="calendar_subperiods">{t('entity_types.calendar_subperiods')}</option>
            <option value="objective_trees">{t('entity_types.objective_trees')}</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="action">{t('filters.action_label')}</label>
          <select
            id="action"
            value={filters.action}
            onChange={(e) => {
              setFilters({ ...filters, action: e.target.value })
              setPage(1)
            }}
          >
            <option value="">{t('filters.action_all')}</option>
            <option value="CREATE">{t('actions.CREATE')}</option>
            <option value="UPDATE">{t('actions.UPDATE')}</option>
            <option value="DELETE">{t('actions.DELETE')}</option>
            <option value="CLOSE">{t('actions.CLOSE')}</option>
            <option value="REOPEN">{t('actions.REOPEN')}</option>
            <option value="APPROVE">{t('actions.APPROVE')}</option>
            <option value="REJECT">{t('actions.REJECT')}</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="entity-id">{t('filters.entity_id_label')}</label>
          <input
            type="number"
            id="entity-id"
            value={filters.entityId}
            onChange={(e) => {
              setFilters({ ...filters, entityId: e.target.value })
              setPage(1)
            }}
            placeholder={t('filters.entity_id_placeholder')}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="user-id">{t('filters.user_id_label')}</label>
          <input
            type="number"
            id="user-id"
            value={filters.userId}
            onChange={(e) => {
              setFilters({ ...filters, userId: e.target.value })
              setPage(1)
            }}
            placeholder={t('filters.user_id_placeholder')}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="success">{t('filters.result_label')}</label>
          <select
            id="success"
            value={filters.success}
            onChange={(e) => {
              setFilters({ ...filters, success: e.target.value })
              setPage(1)
            }}
          >
            <option value="">{t('filters.result_all')}</option>
            <option value="true">{t('result_success')}</option>
            <option value="false">{t('result_error')}</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="kpi-id">{t('filters.kpi_id_label')}</label>
          <input
            type="number"
            id="kpi-id"
            value={filters.kpiId}
            onChange={(e) => {
              setFilters({ ...filters, kpiId: e.target.value })
              setPage(1)
            }}
            placeholder={t('filters.kpi_id_placeholder')}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="collab-id">{t('filters.collab_id_label')}</label>
          <input
            type="number"
            id="collab-id"
            value={filters.collaboratorId}
            onChange={(e) => {
              setFilters({ ...filters, collaboratorId: e.target.value })
              setPage(1)
            }}
            placeholder={t('filters.collab_id_placeholder')}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="period-id">{t('filters.period_id_label')}</label>
          <input
            type="number"
            id="period-id"
            value={filters.periodId}
            onChange={(e) => {
              setFilters({ ...filters, periodId: e.target.value })
              setPage(1)
            }}
            placeholder={t('filters.period_id_placeholder')}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="start-date">{t('filters.start_date_label')}</label>
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
          <label htmlFor="end-date">{t('filters.end_date_label')}</label>
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
          <label htmlFor="search">{t('filters.search_label')}</label>
          <input
            id="search"
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder={t('filters.search_placeholder')}
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
            {t('filters.clear_btn')}
          </button>
        </div>
      </div>

      <div className="table-section">
        {isLoading ? (
          <div className="loading">{t('loading')}</div>
        ) : filteredLogs.length > 0 ? (
          <>
            <div className="table-info">
              {t('showing', { shown: filteredLogs.length, total: auditData?.total || 0 })}
            </div>
            <div className="table-container">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>{t('table.date')}</th>
                    <th>{t('table.user')}</th>
                    <th>{t('table.action')}</th>
                    <th>{t('table.entity')}</th>
                    <th>{t('table.id')}</th>
                    <th>{t('table.result')}</th>
                    <th>{t('table.duration')}</th>
                    <th>{t('table.ip')}</th>
                    <th>{t('table.ua')}</th>
                    <th>{t('table.changes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => {
                    const isCritical = actionConfig[log.action]?.critical
                    return (
                      <tr key={log.id}>
                        <td className="date-cell">{new Date(log.createdAt).toLocaleString()}</td>
                        <td>
                          <div>{log.userName || t('user_fallback', { id: log.userId ?? '-' })}</div>
                          <div className="text-muted">#{log.userId ?? '-'}</div>
                        </td>
                        <td>
                          {getActionBadge(log.action)}
                          {isCritical && <span className="pill">{t('critical_badge')}</span>}
                        </td>
                        <td>{getEntityTypeLabel(log.entityType)}</td>
                        <td>{log.entityId}</td>
                        <td>
                          {log.success === undefined ? (
                            '-'
                          ) : log.success ? (
                            <span className="badge-action badge-success">{t('result_success')}</span>
                          ) : (
                            <span className="badge-action badge-critical">{t('result_error')}</span>
                          )}
                        </td>
                        <td>{log.durationMs ? t('duration_ms', { value: log.durationMs }) : '-'}</td>
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
                {t('pagination.prev')}
              </button>
              <span className="page-info">
                {t('pagination.page_of', { page, total: totalPages })}
              </span>
              <button
                className="btn-pagination"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                {t('pagination.next')}
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">:(</div>
            <h3>{t('empty_title')}</h3>
            <p>{t('empty_subtitle')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
