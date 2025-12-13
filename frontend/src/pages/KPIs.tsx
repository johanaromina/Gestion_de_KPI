import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import api from '../services/api'
import { KPI } from '../types'
import KPIForm from '../components/KPIForm'
import './KPIs.css'

export default function KPIs() {
  const [showForm, setShowForm] = useState(false)
  const [editingKPI, setEditingKPI] = useState<KPI | undefined>(undefined)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('')

  const queryClient = useQueryClient()

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

  const deleteMutation = useMutation(
    async (id: number) => {
      await api.delete(`/kpis/${id}`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('kpis')
      },
      onError: (error: any) => {
        alert(
          error.response?.data?.error ||
            'Error al eliminar KPI. Verifica que no tenga asignaciones asociadas.'
        )
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

    return matchesSearch && matchesType
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
          <select
            id="filter-type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">Todos los tipos</option>
            <option value="growth">Crecimiento</option>
            <option value="reduction">Reducción</option>
            <option value="exact">Exacto</option>
          </select>
        </div>
        {(searchTerm || filterType) && (
          <button
            className="btn-clear-filters"
            onClick={() => {
              setSearchTerm('')
              setFilterType('')
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
                      <p className="meta-value mono">
                        {kpi.formula ? kpi.formula : 'Por defecto'}
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
            <div className="empty-icon">??</div>
            <h3>No se encontraron KPIs</h3>
            <p>Intenta ajustar los filtros de búsqueda</p>
            <button
              className="btn-primary"
              onClick={() => {
                setSearchTerm('')
                setFilterType('')
              }}
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">??</div>
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
