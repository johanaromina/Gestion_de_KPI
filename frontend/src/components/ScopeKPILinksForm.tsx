/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { ScopeKPILink } from '../types'
import './MacroKPIForm.css'

// ─── Assignment combobox ────────────────────────────────────────────────────

type AssignmentOption = {
  id: number
  collaboratorName: string
  kpiName: string
  orgScopeName?: string
}

function AssignmentCombobox({
  options,
  value,
  onChange,
  onQueryChange,
  isLoading,
  totalFromServer,
}: {
  options: AssignmentOption[]
  value: string
  onChange: (value: string) => void
  onQueryChange: (query: string) => void
  isLoading?: boolean
  totalFromServer: number
}) {
  const { t } = useTranslation(['config', 'common'])
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((o) => String(o.id) === value) ?? null

  const inputDisplay = isOpen ? query : selectedOption
    ? `${selectedOption.collaboratorName} — ${selectedOption.kpiName}`
    : ''

  // Local filter over the server-returned slice
  const filtered = useMemo(() => {
    if (!query.trim()) return options
    const q = query.toLowerCase()
    return options.filter(
      (o) =>
        o.collaboratorName.toLowerCase().includes(q) ||
        o.kpiName.toLowerCase().includes(q) ||
        (o.orgScopeName || '').toLowerCase().includes(q)
    )
  }, [options, query])

  // Sync query to parent for server-side refetch
  useEffect(() => { onQueryChange(query) }, [query, onQueryChange])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (opt: AssignmentOption) => {
    onChange(String(opt.id))
    setQuery('')
    setIsOpen(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    setIsOpen(true)
    if (!e.target.value) onChange('')
  }

  const showLimitWarning = totalFromServer >= 150 && !query.trim()

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={inputDisplay}
        onChange={handleInputChange}
        onFocus={() => { setQuery(''); setIsOpen(true) }}
        placeholder={t('config:scope_kpi_links.collaborator_search_placeholder', { defaultValue: 'Escribí para buscar colaborador o KPI...' })}
        style={{ width: '100%' }}
        autoComplete="off"
      />

      {/* Selected badge when closed */}
      {!isOpen && selectedOption && (
        <button
          type="button"
          onClick={() => { onChange(''); setQuery('') }}
          style={{
            position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary, #666)',
            fontSize: '1rem', lineHeight: 1, padding: '0 2px',
          }}
          title="Limpiar selección"
        >×</button>
      )}

      {isOpen && (
        <div style={{
          position: 'absolute', zIndex: 1000, top: 'calc(100% + 2px)', left: 0, right: 0,
          maxHeight: '260px', overflowY: 'auto',
          background: 'var(--color-surface, #fff)',
          border: '1px solid var(--color-border, #ccc)',
          borderRadius: '6px',
          boxShadow: '0 6px 16px rgba(0,0,0,0.15)',
        }}>
          {isLoading && (
            <div style={{ padding: '10px 12px', fontSize: '0.83rem', color: 'var(--color-text-secondary, #888)' }}>
              {t('common:loading', { defaultValue: 'Cargando...' })}
            </div>
          )}

          {!isLoading && showLimitWarning && (
            <div style={{
              padding: '6px 12px', fontSize: '0.78rem',
              background: 'var(--color-warning-bg, #fff8e1)',
              color: 'var(--color-warning, #b45309)',
              borderBottom: '1px solid var(--color-border, #eee)',
            }}>
              {t('config:scope_kpi_links.filter_limit_warning', { defaultValue: 'Hay más de 150 resultados. Usá los filtros de empresa/área o escribí un nombre para acotar.' })}
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: '0.83rem', color: 'var(--color-text-secondary, #888)' }}>
              {t('config:scope_kpi_links.no_results', { defaultValue: 'Sin resultados. Probá con otro término o cambiá los filtros.' })}
            </div>
          )}

          {filtered.map((opt) => {
            const isSelected = String(opt.id) === value
            return (
              <div
                key={opt.id}
                onMouseDown={() => handleSelect(opt)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: isSelected ? 'var(--color-primary-light, #e8f0fe)' : 'transparent',
                  borderBottom: '1px solid var(--color-border-light, #f0f0f0)',
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--color-hover, #f5f7fa)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? 'var(--color-primary-light, #e8f0fe)' : 'transparent' }}
              >
                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{opt.collaboratorName}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary, #666)' }}>
                  {opt.kpiName}
                  {opt.orgScopeName && (
                    <span style={{ marginLeft: '6px', color: 'var(--color-text-muted, #aaa)' }}>· {opt.orgScopeName}</span>
                  )}
                </div>
              </div>
            )
          })}

          {!isLoading && filtered.length > 0 && (
            <div style={{ padding: '4px 12px', fontSize: '0.75rem', color: 'var(--color-text-muted, #aaa)', borderTop: '1px solid var(--color-border-light, #f0f0f0)' }}>
              {filtered.length} de {totalFromServer} resultado{totalFromServer !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main form ──────────────────────────────────────────────────────────────

type ScopeKPILinksFormProps = {
  scopeKpiId: number
  periodId: number
  onClose: () => void
}

export default function ScopeKPILinksForm({ scopeKpiId, periodId, onClose }: ScopeKPILinksFormProps) {
  const { t } = useTranslation(['config', 'common'])
  const queryClient = useQueryClient()
  const [editingLink, setEditingLink] = useState<ScopeKPILink | null>(null)

  // Cascading filters
  const [filterCompanyId, setFilterCompanyId] = useState('')
  const [filterScopeId, setFilterScopeId] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [formData, setFormData] = useState({
    childType: 'collaborator',
    collaboratorAssignmentId: '',
    childScopeKpiId: '',
    contributionWeight: '',
    aggregationMethod: 'weighted_avg',
    sortOrder: 0,
  })

  // Debounce the combobox query before sending to server
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filterSearch), 350)
    return () => clearTimeout(timer)
  }, [filterSearch])

  // Reset sub-scope when company changes
  useEffect(() => { setFilterScopeId('') }, [filterCompanyId])

  const { data: links } = useQuery(
    ['scope-kpi-links', scopeKpiId],
    async () => (await api.get(`/scope-kpis/${scopeKpiId}/links`)).data
  )

  const { data: orgScopes } = useQuery(
    ['org-scopes'],
    async () => (await api.get('/org-scopes')).data,
    { staleTime: 5 * 60 * 1000 }
  )

  const effectiveOrgScopeId = filterScopeId || filterCompanyId

  const { data: collaboratorAssignments, isFetching: isLoadingAssignments } = useQuery(
    ['collaborator-kpis-links', periodId, effectiveOrgScopeId, debouncedSearch],
    async () => {
      const params: Record<string, any> = { summaryOnly: 'true', limit: 150 }
      if (effectiveOrgScopeId) params.orgScopeId = effectiveOrgScopeId
      if (debouncedSearch) params.search = debouncedSearch
      return (await api.get(`/collaborator-kpis/period/${periodId}`, { params })).data
    },
    { enabled: !!periodId, keepPreviousData: true }
  )

  const { data: scopeOptions } = useQuery(
    ['scope-kpis', periodId],
    async () => (await api.get('/scope-kpis', { params: { periodId } })).data,
    { enabled: !!periodId }
  )

  const companyScopes = useMemo(
    () => (orgScopes || []).filter((s: any) => s.type === 'company'),
    [orgScopes]
  )
  const subScopes = useMemo(
    () => filterCompanyId ? (orgScopes || []).filter((s: any) => String(s.parentId) === filterCompanyId) : [],
    [orgScopes, filterCompanyId]
  )

  const availableScopeOptions = useMemo(
    () => (scopeOptions || []).filter((item: any) => Number(item.id) !== Number(scopeKpiId)),
    [scopeOptions, scopeKpiId]
  )

  const assignmentList: AssignmentOption[] = useMemo(() => {
    const raw = Array.isArray(collaboratorAssignments)
      ? collaboratorAssignments
      : (collaboratorAssignments?.data || [])
    return raw.map((item: any) => ({
      id: item.id,
      collaboratorName: item.collaboratorName || String(item.collaboratorId),
      kpiName: item.kpiName || String(item.kpiId),
      orgScopeName: item.orgScopeName,
    }))
  }, [collaboratorAssignments])

  const assignmentTotal: number = Array.isArray(collaboratorAssignments)
    ? collaboratorAssignments.length
    : (collaboratorAssignments?.total ?? collaboratorAssignments?.data?.length ?? 0)

  const resetForm = () => {
    setEditingLink(null)
    setFilterCompanyId('')
    setFilterScopeId('')
    setFilterSearch('')
    setDebouncedSearch('')
    setFormData({
      childType: 'collaborator',
      collaboratorAssignmentId: '',
      childScopeKpiId: '',
      contributionWeight: '',
      aggregationMethod: 'weighted_avg',
      sortOrder: 0,
    })
  }

  const mutation = useMutation(
    async () => {
      const payload = {
        childType: formData.childType,
        collaboratorAssignmentId: formData.childType === 'collaborator' ? Number(formData.collaboratorAssignmentId) : null,
        childScopeKpiId: formData.childType === 'scope' ? Number(formData.childScopeKpiId) : null,
        contributionWeight: formData.contributionWeight === '' ? null : Number(formData.contributionWeight),
        aggregationMethod: formData.aggregationMethod,
        sortOrder: Number(formData.sortOrder) || 0,
      }
      if (editingLink) {
        await api.put(`/scope-kpis/links/${editingLink.id}`, payload)
      } else {
        await api.post(`/scope-kpis/${scopeKpiId}/links`, payload)
      }
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['scope-kpi-links', scopeKpiId])
        resetForm()
      },
    }
  )

  const deleteMutation = useMutation(
    async (id: number) => api.delete(`/scope-kpis/links/${id}`),
    { onSuccess: () => queryClient.invalidateQueries(['scope-kpi-links', scopeKpiId]) }
  )

  const recalcMutation = useMutation(
    async () => api.post(`/scope-kpis/${scopeKpiId}/recalculate`),
    { onSuccess: () => queryClient.invalidateQueries('scope-kpis') }
  )

  const childTypeLabel = (type: string) =>
    t(`config:scope_kpi_links.type_labels.${type}`, { defaultValue: type })

  const aggregationMethodLabel = (method: string) =>
    t(`config:scope_kpi_links.aggregation_methods.${method}`, { defaultValue: method })

  return (
    <div className="macro-form-overlay">
      <div className="macro-form-modal macro-links-modal">
        <div className="macro-form-header">
          <h2>{t('config:scope_kpi_links.title')}</h2>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common:close')}
          </button>
        </div>

        <div className="macro-form-grid">
          <label>
            {t('config:scope_kpi_links.child_type_label')}
            <select
              value={formData.childType}
              onChange={(e) => setFormData((prev) => ({ ...prev, childType: e.target.value }))}
            >
              <option value="collaborator">{t('config:scope_kpi_links.child_types.collaborator')}</option>
              <option value="scope">{t('config:scope_kpi_links.child_types.scope')}</option>
            </select>
          </label>

          {formData.childType === 'collaborator' ? (
            <label className="macro-form-span">
              {t('config:scope_kpi_links.collaborator_assignment_label')}

              {/* Cascading scope filters */}
              {companyScopes.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <select
                    value={filterCompanyId}
                    onChange={(e) => setFilterCompanyId(e.target.value)}
                    style={{ flex: '1', minWidth: '140px' }}
                  >
                    <option value="">
                      {t('config:scope_kpi_links.filter_company_placeholder', { defaultValue: 'Todas las empresas' })}
                    </option>
                    {companyScopes.map((s: any) => (
                      <option key={s.id} value={String(s.id)}>{s.name}</option>
                    ))}
                  </select>

                  {filterCompanyId && subScopes.length > 0 && (
                    <select
                      value={filterScopeId}
                      onChange={(e) => setFilterScopeId(e.target.value)}
                      style={{ flex: '1', minWidth: '140px' }}
                    >
                      <option value="">
                        {t('config:scope_kpi_links.filter_scope_placeholder', { defaultValue: 'Todas las áreas/equipos' })}
                      </option>
                      {subScopes.map((s: any) => (
                        <option key={s.id} value={String(s.id)}>{s.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Combobox with inline search + dropdown */}
              <AssignmentCombobox
                options={assignmentList}
                value={formData.collaboratorAssignmentId}
                onChange={(v) => setFormData((prev) => ({ ...prev, collaboratorAssignmentId: v }))}
                onQueryChange={setFilterSearch}
                isLoading={isLoadingAssignments}
                totalFromServer={assignmentTotal}
              />
            </label>
          ) : (
            <label className="macro-form-span">
              {t('config:scope_kpi_links.child_scope_label')}
              <select
                value={formData.childScopeKpiId}
                onChange={(e) => setFormData((prev) => ({ ...prev, childScopeKpiId: e.target.value }))}
              >
                <option value="">{t('config:scope_kpi_links.child_scope_placeholder')}</option>
                {availableScopeOptions.map((item: any) => (
                  <option key={item.id} value={item.id}>
                    {item.name} - {item.orgScopeName || item.orgScopeId}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            {t('config:scope_kpi_links.aggregation_method_label')}
            <select
              value={formData.aggregationMethod}
              onChange={(e) => setFormData((prev) => ({ ...prev, aggregationMethod: e.target.value }))}
            >
              <option value="weighted_avg">{t('config:scope_kpi_links.aggregation_methods.weighted_avg')}</option>
              <option value="avg">{t('config:scope_kpi_links.aggregation_methods.avg')}</option>
              <option value="sum">{t('config:scope_kpi_links.aggregation_methods.sum')}</option>
            </select>
          </label>
          <label>
            {t('config:scope_kpi_links.contribution_weight_label')}
            <input
              value={formData.contributionWeight}
              onChange={(e) => setFormData((prev) => ({ ...prev, contributionWeight: e.target.value }))}
            />
          </label>
          <label>
            {t('config:scope_kpi_links.sort_order_label')}
            <input
              type="number"
              value={formData.sortOrder}
              onChange={(e) => setFormData((prev) => ({ ...prev, sortOrder: Number(e.target.value) }))}
            />
          </label>
        </div>

        <div className="macro-form-actions">
          <button type="button" className="btn-secondary" onClick={resetForm}>
            {t('config:scope_kpi_links.reset')}
          </button>
          <button type="button" className="btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isLoading}>
            {mutation.isLoading
              ? t('config:scope_kpi_links.saving')
              : editingLink
                ? t('config:scope_kpi_links.update')
                : t('config:scope_kpi_links.add')}
          </button>
          <button type="button" className="btn-primary" onClick={() => recalcMutation.mutate()} disabled={recalcMutation.isLoading}>
            {recalcMutation.isLoading
              ? t('config:scope_kpi_links.recalculating')
              : t('config:scope_kpi_links.recalculate')}
          </button>
        </div>

        <div className="table-container">
          <table className="data-table compact">
            <thead>
              <tr>
                <th>{t('config:scope_kpi_links.table.type')}</th>
                <th>{t('config:scope_kpi_links.table.origin')}</th>
                <th>{t('config:scope_kpi_links.table.method')}</th>
                <th>{t('config:scope_kpi_links.table.weight')}</th>
                <th>{t('config:scope_kpi_links.table.order')}</th>
                <th className="actions-column">{t('config:scope_kpi_links.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {(links || []).map((link: ScopeKPILink) => (
                <tr key={link.id}>
                  <td>{childTypeLabel(link.childType)}</td>
                  <td>
                    {link.childType === 'collaborator'
                      ? `${link.collaboratorName || '-'} / ${link.collaboratorKpiName || '-'}`
                      : link.childScopeKpiName || '-'}
                  </td>
                  <td>{aggregationMethodLabel(link.aggregationMethod)}</td>
                  <td>{link.contributionWeight ?? '-'}</td>
                  <td>{link.sortOrder ?? 0}</td>
                  <td className="actions-column">
                    <div className="action-buttons">
                      <button
                        type="button"
                        className="action-button edit"
                        onClick={() => {
                          setEditingLink(link)
                          setFormData({
                            childType: link.childType,
                            collaboratorAssignmentId: String(link.collaboratorAssignmentId || ''),
                            childScopeKpiId: String(link.childScopeKpiId || ''),
                            contributionWeight: String(link.contributionWeight ?? ''),
                            aggregationMethod: link.aggregationMethod,
                            sortOrder: Number(link.sortOrder || 0),
                          })
                        }}
                      >
                        {t('common:edit')}
                      </button>
                      <button
                        type="button"
                        className="action-button delete"
                        onClick={() => deleteMutation.mutate(link.id)}
                      >
                        {t('common:delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
