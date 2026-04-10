/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import api from '../services/api'
import { KPI } from '../types'
import KPIForm from '../components/KPIForm'
import { useAuth } from '../hooks/useAuth'
import { useDialog } from '../components/Dialog'
import './KPIs.css'

const defaultFormula = (direction?: KPI['direction']) => {
  switch (direction) {
    case 'reduction':
      return '(target / actual) * 100'
    case 'exact':
      return '100 - (Math.abs(actual - target) / target) * 100'
    default:
      return '(actual / target) * 100'
  }
}

const sampleResult = (direction?: KPI['direction']) => {
  switch (direction) {
    case 'reduction':
      return 'Ej: target 100, actual 80 → 125%'
    case 'exact':
      return 'Ej: target 100, actual 120 → 80% (penaliza desvío)'
    default:
      return 'Ej: target 100, actual 120 → 120%'
  }
}

export default function KPIs() {
  const [showForm, setShowForm] = useState(false)
  const [editingKPI, setEditingKPI] = useState<KPI | undefined>(undefined)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterPeriodId, setFilterPeriodId] = useState<number | ''>('') // filtro por período

  const queryClient = useQueryClient()
  const { isCollaborator } = useAuth()
  const dialog = useDialog()

  const { data: kpis, isLoading } = useQuery<KPI[]>(
    'kpis',
    async () => {
      const response = await api.get('/kpis')
      return response.data
    },
    { retry: false }
  )

  const { data: assignments } = useQuery(
    'collaborator-kpis-summary',
    async () => {
      const res = await api.get('/collaborator-kpis')
      return res.data as any[]
    },
    { staleTime: 2 * 60 * 1000 }
  )

  const { data: periods } = useQuery(
    'periods',
    async () => {
      const res = await api.get('/periods')
      return res.data as any[]
    },
    { staleTime: 5 * 60 * 1000 }
  )

  const usageByKpi = useMemo(() => {
    const map: Record<number, { count: number; periods: Set<number> }> = {}
    assignments?.forEach((a: any) => {
      if (!map[a.kpiId]) map[a.kpiId] = { count: 0, periods: new Set() }
      map[a.kpiId].count += 1
      map[a.kpiId].periods.add(a.periodId)
    })
    return map
  }, [assignments])

  const deleteMutation = useMutation(
    async (id: number) => {
      await api.delete(`/kpis/${id}`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('kpis')
      },
      onError: (error: any) => {
        void dialog.alert(error.response?.data?.error || 'Error al eliminar KPI. Verificá que no tenga asignaciones asociadas.', { title: 'Error al eliminar', variant: 'danger' })
      },
    }
  )

  const closePeriodKpiMutation = useMutation(
    async ({ periodId, kpiId }: { periodId: number; kpiId: number }) => {
      await api.post('/collaborator-kpis/close-period', { periodId, kpiId })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('collaborator-kpis')
        queryClient.invalidateQueries('collaborator-kpis-summary')
      },
      onError: (error: any) => {
        void dialog.alert(error.response?.data?.error || 'Error al cerrar el KPI en el período.', { title: 'Error', variant: 'danger' })
      },
    }
  )

  const getPeriodName = (periodId?: number | '') => {
    if (!periodId) return ''
    return periods?.find((p: any) => p.id === periodId)?.name || `Período #${periodId}`
  }

  const getTypeBadge = (type: KPI['type']) => {
    const typeConfig = {
      manual: { label: 'Manual', class: 'type-manual' },
      count: { label: 'Count', class: 'type-count' },
      ratio: { label: 'Ratio', class: 'type-ratio' },
      sla: { label: 'SLA', class: 'type-sla' },
      value: { label: 'Value', class: 'type-value' },
    }
    const config = typeConfig[type] || typeConfig.value
    return <span className={`type-badge ${config.class}`}>{config.label}</span>
  }

  const getDirectionBadge = (direction?: KPI['direction']) => {
    const dirConfig = {
      growth: { label: 'Crecimiento', class: 'type-growth' },
      reduction: { label: 'Reducción', class: 'type-reduction' },
      exact: { label: 'Exacto', class: 'type-exact' },
    }
    const config = dirConfig[direction || 'growth']
    return <span className={`type-badge ${config.class}`}>{config.label}</span>
  }

  const handleCreate = () => {
  if (isCollaborator) return
  setEditingKPI(undefined)
  setShowForm(true)
}

  const handleEdit = (kpi: KPI) => {
  if (isCollaborator) return
  setEditingKPI(kpi)
  setShowForm(true)
}

  const handleDelete = async (id: number, name: string) => {
    if (isCollaborator) return
    const ok = await dialog.confirm(
      `¿Estás seguro de eliminar el KPI "${name}"? Esta acción no se puede deshacer y eliminará todas las asignaciones asociadas.`,
      { title: 'Eliminar KPI', confirmLabel: 'Eliminar', variant: 'danger' }
    )
    if (ok) deleteMutation.mutate(id)
  }

  const filteredKPIs = kpis?.filter((kpi) => {
    const matchesSearch =
      !searchTerm ||
      kpi.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (kpi.description && kpi.description.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesType = !filterType || kpi.type === filterType
    const matchesPeriod =
      !filterPeriodId ||
      kpi.periodIds?.includes(filterPeriodId as number) ||
      usageByKpi[kpi.id]?.periods.has(filterPeriodId as number)

    return matchesSearch && matchesType && matchesPeriod
  })

  const totals = {
    total: filteredKPIs?.length || 0,
    manual: filteredKPIs?.filter((k) => k.type === 'manual').length || 0,
    count: filteredKPIs?.filter((k) => k.type === 'count').length || 0,
    ratio: filteredKPIs?.filter((k) => k.type === 'ratio').length || 0,
    sla: filteredKPIs?.filter((k) => k.type === 'sla').length || 0,
    value: filteredKPIs?.filter((k) => k.type === 'value').length || 0,
  }

  return (
    <div className="kpis-page">
      <div className="page-header">
        <div>
          <h1>KPIs</h1>
          <p className="subtitle">Gestiona las definiciones de KPIs</p>
        </div>
        {!isCollaborator && (
          <button className="btn-primary" onClick={handleCreate}>
            + Crear KPI
          </button>
        )}
      </div>

      <div className="filters-section">
        <div className="search-group">
          <label htmlFor="search">Buscar:</label>
          <input
            type="text"
            id="search"
            placeholder="Buscar por nombre o descripción..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-group">
          <label htmlFor="filter-type">Tipo:</label>
          <select id="filter-type" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">Todos los tipos</option>
            <option value="manual">Manual</option>
            <option value="count">Count</option>
            <option value="ratio">Ratio</option>
            <option value="sla">SLA</option>
            <option value="value">Value</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="filter-period">Período:</label>
          <select
            id="filter-period"
            value={filterPeriodId}
            onChange={(e) => setFilterPeriodId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Todos</option>
            {periods?.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {(searchTerm || filterType || filterPeriodId) && (
          <button
            className="btn-clear-filters"
            onClick={() => {
              setSearchTerm('')
              setFilterType('')
              setFilterPeriodId('')
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {!isLoading && filteredKPIs && filteredKPIs.length > 0 && (
        <div className="kpi-stats">
          <div className="stat-pill">
            <span className="stat-label">Total</span>
            <span className="stat-value">{totals.total}</span>
          </div>
          <div className="stat-pill stat-manual">
            <span className="stat-label">Manual</span>
            <span className="stat-value">{totals.manual}</span>
          </div>
          <div className="stat-pill stat-count">
            <span className="stat-label">Count</span>
            <span className="stat-value">{totals.count}</span>
          </div>
          <div className="stat-pill stat-ratio">
            <span className="stat-label">Ratio</span>
            <span className="stat-value">{totals.ratio}</span>
          </div>
          <div className="stat-pill stat-sla">
            <span className="stat-label">SLA</span>
            <span className="stat-value">{totals.sla}</span>
          </div>
          <div className="stat-pill stat-value">
            <span className="stat-label">Value</span>
            <span className="stat-value">{totals.value}</span>
          </div>
        </div>
      )}

      <div className="table-container">
        {isLoading ? (
          <div className="loading">Cargando KPIs...</div>
        ) : filteredKPIs && filteredKPIs.length > 0 ? (
          <>
            <div className="results-info">
              Mostrando {filteredKPIs.length} de {kpis?.length || 0} KPIs
            </div>
            <div className="kpi-grid">
              {filteredKPIs.map((kpi) => (
                <div key={kpi.id} className="kpi-card">
                  <div className="kpi-card-header">
                    <div>
                      <p className="kpi-id">ID {kpi.id}</p>
                      <h3 className="kpi-name">{kpi.name}</h3>
                    </div>
                    <div className="badge-group">
                      {getTypeBadge(kpi.type)}
                      {getDirectionBadge(kpi.direction)}
                    </div>
                  </div>
                  <p className="kpi-description">{kpi.description || 'Sin descripción'}</p>
                  <div className="kpi-meta">
                    <div>
                      <span className="meta-label">Criterio</span>
                      <p className="meta-value">{kpi.criteria || 'No definido'}</p>
                    </div>
                    <div>
                      <span className="meta-label">Fórmula</span>
                      <p className="meta-value mono" title={kpi.formula || defaultFormula(kpi.direction)}>
                        {kpi.formula ? 'Personalizada' : 'Por defecto'} - {sampleResult(kpi.direction)}
                      </p>
                    </div>
                    {kpi.macroKPIId && (
                      <div>
                        <span
                          className="meta-label"
                          title="KPI Macro: agrupa varios KPIs individuales bajo un mismo indicador padre. Su resultado es el promedio ponderado de los KPIs que lo componen."
                        >
                          KPI agrupador ⓘ
                        </span>
                        <p className="meta-value">
                          {kpis?.find((k: any) => k.id === kpi.macroKPIId)?.name || `KPI #${kpi.macroKPIId}`}
                        </p>
                      </div>
                    )}
                    <div>
                      <span className="meta-label">Uso</span>
                      <p className="meta-value">
                        {usageByKpi[kpi.id]?.count || 0} asignaciones ·{' '}
                        {usageByKpi[kpi.id] ? usageByKpi[kpi.id].periods.size : 0} períodos
                      </p>
                    </div>
                    <div>
                      <span className="meta-label">Períodos</span>
                      <p className="meta-value">
                        {kpi.periodIds && kpi.periodIds.length > 0
                          ? kpi.periodIds
                              .map((pid) => periods?.find((p: any) => p.id === pid)?.name || `Período #${pid}`)
                              .join(', ')
                          : usageByKpi[kpi.id]?.periods.size
                          ? Array.from(usageByKpi[kpi.id].periods)
                              .map((pid) => periods?.find((p: any) => p.id === pid)?.name || `Período #${pid}`)
                              .join(', ')
                          : 'Sin asignaciones'}
                      </p>
                    </div>
                  </div>
                  <div className="action-row">
                    {isCollaborator ? (
                      <span className="read-only-pill">Solo lectura</span>
                    ) : (
                      <>
                        <button className="btn-text" onClick={() => handleEdit(kpi)}>
                          Editar
                        </button>
                        <button
                          className="btn-text danger"
                          onClick={() => handleDelete(kpi.id, kpi.name)}
                          disabled={deleteMutation.isLoading}
                        >
                          Eliminar
                        </button>
                        <button
                          className="btn-text warning"
                          onClick={async () => {
                            if (!filterPeriodId) return
                            const periodName = getPeriodName(filterPeriodId)
                            const ok = await dialog.confirm(
                              `¿Cerrar el KPI "${kpi.name}" en ${periodName}? Esta acción cerrará todas sus asignaciones en ese período.`,
                              { title: 'Cerrar KPI en período', confirmLabel: 'Cerrar', variant: 'warning' }
                            )
                            if (ok) {
                              closePeriodKpiMutation.mutate({
                                periodId: filterPeriodId as number,
                                kpiId: kpi.id,
                              })
                            }
                          }}
                          disabled={!filterPeriodId || closePeriodKpiMutation.isLoading}
                          title={
                            filterPeriodId
                              ? 'Cerrar KPI en el período seleccionado'
                              : 'Selecciona un período para cerrar el KPI'
                          }
                        >
                          Cerrar KPI (período)
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : kpis && kpis.length > 0 ? (
          <div className="empty-state">
            <div className="empty-icon">:(</div>
            <h3>No se encontraron KPIs</h3>
            <p>Intenta ajustar los filtros de búsqueda</p>
            <button
              className="btn-primary"
              onClick={() => {
                setSearchTerm('')
                setFilterType('')
                setFilterPeriodId('')
              }}
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <h3>Todavía no hay KPIs definidos</h3>
            <p>Un KPI es el indicador que vas a medir: ventas mensuales, tickets resueltos, NPS, cumplimiento de entregas, etc.</p>
            <p className="empty-state-hint">Antes de crear KPIs asegurate de tener al menos un área configurada en <a href="/configuracion">Configuración</a>.</p>
            <button className="btn-primary" onClick={handleCreate}>
              Crear primer KPI
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <KPIForm
          kpi={editingKPI}
          onClose={() => {
            setShowForm(false)
            setEditingKPI(undefined)
          }}
          onSuccess={() => {
            setShowForm(false)
            setEditingKPI(undefined)
          }}
        />
      )}
    </div>
  )
}
