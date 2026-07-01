/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import ScopeKPIForm from '../components/ScopeKPIForm'
import ScopeKPIDetailModal from '../components/ScopeKPIDetailModal'
import ScopeKPILinksForm from '../components/ScopeKPILinksForm'
import CopyScopeKPIModal from '../components/CopyScopeKPIModal'
import { ScopeKPI } from '../types'
import './Asignaciones.css'

export default function AsignacionesScope() {
  const { t } = useTranslation(['assignments', 'common'])
  const queryClient = useQueryClient()
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null)
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null)
  const [selectedSubPeriodId, setSelectedSubPeriodId] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Scope activo para sub-periods y filtro client-side
  const selectedScopeId = selectedAreaId ?? selectedCompanyId
  const [editingScopeKpi, setEditingScopeKpi] = useState<ScopeKPI | undefined>(undefined)
  const [showForm, setShowForm] = useState(false)
  const [linksScopeKpi, setLinksScopeKpi] = useState<ScopeKPI | null>(null)
  const [detailScopeKpi, setDetailScopeKpi] = useState<ScopeKPI | null>(null)
  const [copyingScopeKpi, setCopyingScopeKpi] = useState<ScopeKPI | null>(null)

  const { data: periods } = useQuery('periods', async () => (await api.get('/periods')).data)
  const { data: orgScopes } = useQuery('org-scopes', async () => (await api.get('/org-scopes')).data)

  const companyScopes = useMemo(
    () => (orgScopes || []).filter((s: any) => s.type === 'company' && s.active !== 0 && s.active !== false),
    [orgScopes]
  )

  const areaScopes = useMemo(
    () =>
      (orgScopes || []).filter((s: any) => {
        if (s.type !== 'area' || s.active === 0 || s.active === false) return false
        if (selectedCompanyId) return Number(s.parentId) === selectedCompanyId
        return true
      }),
    [orgScopes, selectedCompanyId]
  )

  // BFS para obtener todos los IDs descendientes del scope activo (para filtrado client-side)
  const activeScopeDescendantIds = useMemo<Set<number>>(() => {
    const set = new Set<number>()
    if (!selectedScopeId) return set
    const allScopes: any[] = orgScopes || []
    const queue = [selectedScopeId]
    while (queue.length > 0) {
      const current = queue.shift()!
      set.add(current)
      allScopes.filter((s) => Number(s.parentId) === current).forEach((s) => queue.push(Number(s.id)))
    }
    return set
  }, [orgScopes, selectedScopeId])

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
    ['scope-kpis', selectedPeriodId, selectedCompanyId, selectedAreaId, selectedSubPeriodId],
    async () =>
      (
        await api.get('/scope-kpis', {
          params: {
            periodId: selectedPeriodId || undefined,
            // Solo pasamos orgScopeId al backend cuando hay un área seleccionada (match directo)
            // Si hay solo empresa, filtramos client-side por descendantIds
            orgScopeId: selectedAreaId || undefined,
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
      // Filtrado por jerarquía de scope (company → descendientes)
      if (activeScopeDescendantIds.size > 0 && !selectedAreaId) {
        if (!activeScopeDescendantIds.has(Number(item.orgScopeId))) return false
      }
      if (!normalized) return true
      return [item.name, item.kpiName, item.orgScopeName, item.ownerLevel, item.sourceMode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized))
    })
  }, [scopeKpis, searchTerm, activeScopeDescendantIds, selectedAreaId])

  const getStatusLabel = (status?: string) => {
    if (!status) return t('status.unknown')
    const normalized = status.toLowerCase()
    const known = ['draft', 'proposed', 'approved', 'closed']
    if (known.includes(normalized)) {
      return t(`status.${normalized}`)
    }
    return status
  }

  const getOwnerLevelLabel = (ownerLevel?: string) => {
    if (!ownerLevel) return '-'
    const normalized = ownerLevel.toLowerCase()
    const known = ['team', 'area', 'business_unit', 'company', 'executive']
    if (known.includes(normalized)) {
      return t(`scope_kpis.owner_levels.${normalized}`)
    }
    return ownerLevel
  }

  const getSourceModeLabel = (sourceMode?: string) => {
    if (!sourceMode) return '-'
    const normalized = sourceMode.toLowerCase()
    const known = ['direct', 'aggregated', 'mixed']
    if (known.includes(normalized)) {
      return t(`scope_kpis.source_modes.${normalized}`)
    }
    return sourceMode
  }

  return (
    <div className="asignaciones-page">
      <div className="page-header">
        <div>
          <h1>{t('scope_kpis.title')}</h1>
          <p className="subtitle">{t('scope_kpis.subtitle')}</p>
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
            {t('scope_kpis.new_btn')}
          </button>
        </div>
      </div>

      <div className="filters-section">
        <div className="search-group">
          <label>{t('scope_kpis.filters.search_label')}</label>
          <input className="filter-select" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder={t('scope_kpis.filters.search_placeholder')} />
        </div>
        <div className="filter-group">
          <label>{t('scope_kpis.filters.period_label')}</label>
          <select className="filter-select" value={selectedPeriodId || ''} onChange={(e) => setSelectedPeriodId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t('scope_kpis.filters.all')}</option>
            {(periods || []).map((period: any) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>{t('scope_kpis.filters.company_label', 'Empresa')}</label>
          <select
            className="filter-select"
            value={selectedCompanyId || ''}
            onChange={(e) => {
              setSelectedCompanyId(e.target.value ? Number(e.target.value) : null)
              setSelectedAreaId(null)
            }}
          >
            <option value="">{t('scope_kpis.filters.all')}</option>
            {companyScopes.map((scope: any) => (
              <option key={scope.id} value={scope.id}>
                {scope.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>{t('scope_kpis.filters.area_label', 'Área')}</label>
          <select
            className="filter-select"
            value={selectedAreaId || ''}
            onChange={(e) => setSelectedAreaId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t('scope_kpis.filters.all')}</option>
            {areaScopes.map((scope: any) => (
              <option key={scope.id} value={scope.id}>
                {scope.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>{t('scope_kpis.filters.subperiod_label')}</label>
          <select className="filter-select" value={selectedSubPeriodId || ''} onChange={(e) => setSelectedSubPeriodId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t('scope_kpis.filters.all')}</option>
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
              <th>{t('scope_kpis.table.name')}</th>
              <th>{t('scope_kpis.table.kpi_base')}</th>
              <th>{t('scope_kpis.table.scope')}</th>
              <th>{t('scope_kpis.table.owner')}</th>
              <th>{t('scope_kpis.table.source')}</th>
              <th>{t('scope_kpis.table.target')}</th>
              <th>{t('scope_kpis.table.actual')}</th>
              <th>{t('scope_kpis.table.variation')}</th>
              <th>{t('scope_kpis.table.result')}</th>
              <th>{t('scope_kpis.table.status')}</th>
              <th className="actions-column">{t('scope_kpis.table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading &&
              filteredItems.map((item) => (
                <tr key={item.id}>
                  <td className="name-cell">
                    <div>{item.name}</div>
                    {item.objectiveNames?.length ? (
                      <div className="muted">{t('scope_kpis.objectives_prefix')} {item.objectiveNames.join(' · ')}</div>
                    ) : null}
                    {item.sourceMode === 'mixed' ? (
                      <div className="muted">
                        {item.mixedConfig?.directLabel || t('scope_kpis.direct_label')}: {item.directActual ?? '-'} · {item.mixedConfig?.aggregatedLabel || t('scope_kpis.aggregated_label')}:{' '}
                        {item.aggregatedActual ?? '-'}
                      </div>
                    ) : null}
                  </td>
                  <td>{item.kpiName || item.kpiId}</td>
                  <td>{item.orgScopeName || item.orgScopeId}</td>
                  <td>{getOwnerLevelLabel(item.ownerLevel)}</td>
                  <td>{getSourceModeLabel(item.sourceMode)}</td>
                  <td className="number-cell">{item.target}</td>
                  <td className="number-cell">{item.actual ?? '-'}</td>
                  <td className="number-cell">{item.variation ?? '-'}</td>
                  <td className="number-cell">{item.weightedResult ?? '-'}</td>
                  <td>{getStatusLabel(item.status)}</td>
                  <td className="actions-column">
                    <div className="action-buttons">
                      <button type="button" className="action-button view" onClick={() => setDetailScopeKpi(item)}>
                        {t('scope_kpis.actions.detail')}
                      </button>
                      <button type="button" className="action-button edit" onClick={() => { setEditingScopeKpi(item); setShowForm(true) }}>
                        {t('scope_kpis.actions.edit')}
                      </button>
                      <button type="button" className="action-button approve" onClick={() => setLinksScopeKpi(item)}>
                        {t('scope_kpis.actions.links')}
                      </button>
                      <button type="button" className="action-button edit" onClick={() => setCopyingScopeKpi(item)}>
                        {t('scope_kpis.actions.copy')}
                      </button>
                      <button type="button" className="action-button view" onClick={() => actionMutation.mutate({ id: item.id, action: 'recalculate' })}>
                        {t('scope_kpis.actions.recalculate')}
                      </button>
                      {item.status === 'closed' ? (
                        <button type="button" className="action-button reopen" onClick={() => actionMutation.mutate({ id: item.id, action: 'reopen' })}>
                          {t('scope_kpis.actions.reopen')}
                        </button>
                      ) : (
                        <button type="button" className="action-button reject" onClick={() => actionMutation.mutate({ id: item.id, action: 'close' })}>
                          {t('scope_kpis.actions.close')}
                        </button>
                      )}
                      <button type="button" className="action-button delete" onClick={() => deleteMutation.mutate(item.id)}>
                        {t('scope_kpis.actions.delete')}
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
      {copyingScopeKpi && (
        <CopyScopeKPIModal
          scopeKpi={copyingScopeKpi}
          onClose={() => setCopyingScopeKpi(null)}
        />
      )}
    </div>
  )
}
