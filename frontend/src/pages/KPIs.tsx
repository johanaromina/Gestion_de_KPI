/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import api from '../services/api'
import { KPI } from '../types'
import KPIForm from '../components/KPIForm'
import './KPIs.css'

const defaultFormula = (type: KPI['type']) => {
  switch (type) {
    case 'growth':
      return '(actual / target) * 100'
    case 'reduction':
      return '(target / actual) * 100'
    case 'exact':
      return '100 - (Math.abs(actual - target) / target) * 100'
    default:
      return '(actual / target) * 100'
  }
}

const sampleResult = (type: KPI['type']) => {
  switch (type) {
    case 'growth':
      return 'Ej: target 100, actual 120 → 120%'
    case 'reduction':
      return 'Ej: target 100, actual 80 → 125%'
    case 'exact':
      return 'Ej: target 100, actual 120 → 80% (penaliza desvío)'
    default:
      return ''
  }
}

export default function KPIs() {
  const [showForm, setShowForm] = useState(false)
  const [editingKPI, setEditingKPI] = useState<KPI | undefined>(undefined)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterPeriodId, setFilterPeriodId] = useState<number | ''>('') // filtro por período

  const queryClient = useQueryClient()

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
        alert(error.response?.data?.error || 'Error al eliminar KPI. Verifica que no tenga asignaciones asociadas.')
      },
    }
  )

  const getTypeBadge = (type: KPI['type']) => {
    const typeConfig = {
      growth: { label: 'Crecimiento', class: 'type-growth' },
      reduction: { label: 'Reducción', class: 'type-reduction' },
      exact: { label: 'Exacto', class: 'type-exact' },
    }
    const config = typeConfig[type]
    return <span className={`type-badge ${config.class}`}>{config.label}</span>
  }

  const handleCreate = () => {
    setEditingKPI(undefined)
    setShowForm(true)
  }

  const handleEdit = (kpi: KPI) => {
    setEditingKPI(kpi)
    setShowForm(true)
  }

  const handleDelete = async (id: number, name: string) => {
    if (
      window.confirm(
        `¿Estás seguro de eliminar el KPI "${name}"? Esta acción no se puede deshacer y eliminará todas las asignaciones asociadas.`
      )
    ) {
      deleteMutation.mutate(id)
    }
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
    growth: filteredKPIs?.filter((k) => k.type === 'growth').length || 0,
    reduction: filteredKPIs?.filter((k) => k.type === 'reduction').length || 0,
    exact: filteredKPIs?.filter((k) => k.type === 'exact').length || 0,
  }

  return (
    <div className="kpis-page">
      <div className="page-header">
        <div>
          <h1>KPIs</h1>
          <p className="subtitle">Gestiona las definiciones de KPIs</p>
        </div>
        <button className="btn-primary" onClick={handleCreate}>
          + Crear KPI
        </button>
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
            <option value="growth">Crecimiento</option>
            <option value="reduction">Reducción</option>
            <option value="exact">Exacto</option>
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
          <div className="stat-pill stat-growth">
            <span className="stat-label">Crecimiento</span>
            <span className="stat-value">{totals.growth}</span>
          </div>
          <div className="stat-pill stat-reduction">
            <span className="stat-label">Reducción</span>
            <span className="stat-value">{totals.reduction}</span>
          </div>
          <div className="stat-pill stat-exact">
            <span className="stat-label">Exacto</span>
            <span className="stat-value">{totals.exact}</span>
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
                    {getTypeBadge(kpi.type)}
                  </div>
                  <p className="kpi-description">{kpi.description || 'Sin descripción'}</p>
                  <div className="kpi-meta">
                    <div>
                      <span className="meta-label">Criterio</span>
                      <p className="meta-value">{kpi.criteria || 'No definido'}</p>
                    </div>
                    <div>
                      <span className="meta-label">Fórmula</span>
                      <p className="meta-value mono" title={kpi.formula || defaultFormula(kpi.type)}>
                        {kpi.formula ? 'Personalizada' : 'Por defecto'} - {sampleResult(kpi.type)}
                      </p>
                    </div>
                    {kpi.macroKPIId && (
                      <div>
                        <span className="meta-label">KPI Macro</span>
                        <p className="meta-value">ID {kpi.macroKPIId}</p>
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
            <div className="empty-icon">:)</div>
            <h3>No hay KPIs definidos</h3>
            <p>Crea tu primer KPI para comenzar a evaluar el desempeño</p>
            <button className="btn-primary" onClick={handleCreate}>
              Crear KPI
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
