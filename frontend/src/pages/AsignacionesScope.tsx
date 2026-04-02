/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import api from '../services/api'
import ScopeKPIForm from '../components/ScopeKPIForm'
import ScopeKPIDetailModal from '../components/ScopeKPIDetailModal'
import ScopeKPILinksForm from '../components/ScopeKPILinksForm'
import { ScopeKPI } from '../types'
import './Asignaciones.css'

export default function AsignacionesScope() {
  const queryClient = useQueryClient()
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [selectedScopeId, setSelectedScopeId] = useState<number | null>(null)
  const [selectedSubPeriodId, setSelectedSubPeriodId] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [editingScopeKpi, setEditingScopeKpi] = useState<ScopeKPI | undefined>(undefined)
  const [showForm, setShowForm] = useState(false)
  const [linksScopeKpi, setLinksScopeKpi] = useState<ScopeKPI | null>(null)
  const [detailScopeKpi, setDetailScopeKpi] = useState<ScopeKPI | null>(null)

  const { data: periods } = useQuery('periods', async () => (await api.get('/periods')).data)
  const { data: orgScopes } = useQuery('org-scopes', async () => (await api.get('/org-scopes')).data)
  const { data: subPeriods } = useQuery(
    ['scope-sub-periods', selectedPeriodId, selectedScopeId],
    async () => {
      if (!selectedPeriodId) return []
      const scope = (orgScopes || []).find((item: any) => Number(item.id) === Number(selectedScopeId))
      const response = await api.get(`/periods/${selectedPeriodId}/sub-periods`, {
        params: { calendarProfileId: scope?.calendarProfileId || undefined },
      })
      return response.data
    },
    { enabled: !!selectedPeriodId }
  )
  const { data: scopeKpis, isLoading } = useQuery<ScopeKPI[]>(
    ['scope-kpis', selectedPeriodId, selectedScopeId, selectedSubPeriodId],
    async () =>
      (
        await api.get('/scope-kpis', {
          params: {
            periodId: selectedPeriodId || undefined,
            orgScopeId: selectedScopeId || undefined,
            subPeriodId: selectedSubPeriodId || undefined,
          },
        })
      ).data
  )

  const deleteMutation = useMutation(async (id: number) => api.delete(`/scope-kpis/${id}`), {
    onSuccess: () => queryClient.invalidateQueries('scope-kpis'),
  })

  const actionMutation = useMutation(
    async ({ id, action }: { id: number; action: 'close' | 'reopen' | 'recalculate' }) => api.post(`/scope-kpis/${id}/${action}`),
    {
      onSuccess: () => queryClient.invalidateQueries('scope-kpis'),
    }
  )

  const filteredItems = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase()
    return (scopeKpis || []).filter((item) => {
      if (!normalized) return true
      return [item.name, item.kpiName, item.orgScopeName, item.ownerLevel, item.sourceMode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized))
    })
  }, [scopeKpis, searchTerm])

  return (
    <div className="asignaciones-page">
      <div className="page-header">
        <div>
          <h1>KPIs Grupales</h1>
          <p className="subtitle">KPIs asignados a equipos, áreas, unidades de negocio y nivel ejecutivo.</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setEditingScopeKpi(undefined)
              setShowForm(true)
            }}
          >
            Nuevo KPI Grupal
          </button>
        </div>
      </div>

      <div className="filters-section">
        <div className="search-group">
          <label>Buscar</label>
          <input className="filter-select" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Nombre, área, responsable..." />
        </div>
        <div className="filter-group">
          <label>Periodo</label>
          <select className="filter-select" value={selectedPeriodId || ''} onChange={(e) => setSelectedPeriodId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Todos</option>
            {(periods || []).map((period: any) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Área / Equipo</label>
          <select className="filter-select" value={selectedScopeId || ''} onChange={(e) => setSelectedScopeId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Todos</option>
            {(orgScopes || []).map((scope: any) => (
              <option key={scope.id} value={scope.id}>
                {scope.name} ({scope.type})
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Subperiodo</label>
          <select className="filter-select" value={selectedSubPeriodId || ''} onChange={(e) => setSelectedSubPeriodId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Todos</option>
            {(subPeriods || []).map((item: any) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>KPI base</th>
              <th>Área / Equipo</th>
              <th>Responsable</th>
              <th>Origen</th>
              <th>Target</th>
              <th>Actual</th>
              <th>Variación</th>
              <th>Resultado</th>
              <th>Estado</th>
              <th className="actions-column">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading &&
              filteredItems.map((item) => (
                <tr key={item.id}>
                  <td className="name-cell">
                    <div>{item.name}</div>
                    {item.objectiveNames?.length ? (
                      <div className="muted">Objetivos: {item.objectiveNames.join(' · ')}</div>
                    ) : null}
                    {item.sourceMode === 'mixed' ? (
                      <div className="muted">
                        {item.mixedConfig?.directLabel || 'Directo'}: {item.directActual ?? '-'} · {item.mixedConfig?.aggregatedLabel || 'Agregado'}:{' '}
                        {item.aggregatedActual ?? '-'}
                      </div>
                    ) : null}
                  </td>
                  <td>{item.kpiName || item.kpiId}</td>
                  <td>{item.orgScopeName || item.orgScopeId}</td>
                  <td>{item.ownerLevel}</td>
                  <td>{item.sourceMode}</td>
                  <td className="number-cell">{item.target}</td>
                  <td className="number-cell">{item.actual ?? '-'}</td>
                  <td className="number-cell">{item.variation ?? '-'}</td>
                  <td className="number-cell">{item.weightedResult ?? '-'}</td>
                  <td>{item.status}</td>
                  <td className="actions-column">
                    <div className="action-buttons">
                      <button type="button" className="action-button view" onClick={() => setDetailScopeKpi(item)}>
                        Detalle
                      </button>
                      <button type="button" className="action-button edit" onClick={() => { setEditingScopeKpi(item); setShowForm(true) }}>
                        Editar
                      </button>
                      <button type="button" className="action-button approve" onClick={() => setLinksScopeKpi(item)}>
                        Links
                      </button>
                      <button type="button" className="action-button view" onClick={() => actionMutation.mutate({ id: item.id, action: 'recalculate' })}>
                        Recalcular
                      </button>
                      {item.status === 'closed' ? (
                        <button type="button" className="action-button reopen" onClick={() => actionMutation.mutate({ id: item.id, action: 'reopen' })}>
                          Reabrir
                        </button>
                      ) : (
                        <button type="button" className="action-button reject" onClick={() => actionMutation.mutate({ id: item.id, action: 'close' })}>
                          Cerrar
                        </button>
                      )}
                      <button type="button" className="action-button delete" onClick={() => deleteMutation.mutate(item.id)}>
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <ScopeKPIForm
          scopeKpi={editingScopeKpi}
          defaultPeriodId={selectedPeriodId}
          defaultScopeId={selectedScopeId}
          onClose={() => setShowForm(false)}
        />
      )}
      {linksScopeKpi && (
        <ScopeKPILinksForm
          scopeKpiId={linksScopeKpi.id}
          periodId={linksScopeKpi.periodId}
          onClose={() => setLinksScopeKpi(null)}
        />
      )}
      {detailScopeKpi && (
        <ScopeKPIDetailModal
          scopeKpiId={detailScopeKpi.id}
          initialScopeKpi={detailScopeKpi}
          onClose={() => setDetailScopeKpi(null)}
        />
      )}
    </div>
  )
}
