/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { ScopeKPI } from '../types'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import './MacroKPIForm.css'

type CopyResult = {
  orgScopeId: number
  status: 'created' | 'skipped'
  newId?: number
  reason?: string
  copiedLinksCount?: number
  skippedLinksCount?: number
}

type Props = {
  scopeKpi: ScopeKPI
  onClose: () => void
}

export default function CopyScopeKPIModal({ scopeKpi, onClose }: Props) {
  const { t } = useTranslation(['assignments', 'common'])
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [copyLinks, setCopyLinks] = useState(false)
  const [results, setResults] = useState<CopyResult[] | null>(null)

  const { data: orgScopes } = useQuery('org-scopes', async () => (await api.get('/org-scopes')).data)

  const getScopeTypeLabel = (type: string | null | undefined, form: 'one' | 'other') =>
    t(`assignments:copy_scope_modal.scope_types.${String(type || 'default')}.${form}`, {
      defaultValue: t(`assignments:copy_scope_modal.scope_types.default.${form}`),
    })

  const scopeTypeLabels = useMemo(() => {
    return {
      plural: getScopeTypeLabel(scopeKpi.orgScopeType, 'other'),
      singular: getScopeTypeLabel(scopeKpi.orgScopeType, 'one'),
    }
  }, [scopeKpi.orgScopeType, t])

  const availableScopes = useMemo(
    () =>
      (orgScopes || []).filter((s: any) =>
        Number(s.id) !== Number(scopeKpi.orgScopeId) &&
        (!scopeKpi.orgScopeType || s.type === scopeKpi.orgScopeType) &&
        s.active !== 0
      ),
    [orgScopes, scopeKpi.orgScopeId, scopeKpi.orgScopeType]
  )

  const toggleScope = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const copyMutation = useMutation(
    async () => {
      const res = await api.post(`/scope-kpis/${scopeKpi.id}/copy`, {
        targetScopeIds: Array.from(selectedIds),
        copyLinks,
      })
      return res.data
    },
    {
      onSuccess: (data) => {
        setResults(data.results)
        queryClient.invalidateQueries('scope-kpis')
      },
    }
  )

  const copyErrorMessage = copyMutation.isError
    ? resolveApiErrorMessage(copyMutation.error as any, t, {
        fallbackKey: 'assignments:copy_scope_modal.error_default',
      })
    : ''

  const allSelected = availableScopes.length > 0 && selectedIds.size === availableScopes.length
  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(availableScopes.map((s: any) => Number(s.id))))
    }
  }

  const translateResultReason = (reason?: string) => {
    switch (reason) {
      case 'Es el equipo origen':
        return t('assignments:copy_scope_modal.reasons.source_scope')
      case 'El scope destino no existe':
        return t('assignments:copy_scope_modal.reasons.target_missing')
      case 'El destino no es del mismo tipo que el origen':
        return t('assignments:copy_scope_modal.reasons.type_mismatch')
      case 'Ya existe un KPI grupal con esa combinación':
        return t('assignments:copy_scope_modal.reasons.already_exists')
      default:
        return reason || t('assignments:copy_scope_modal.error_default')
    }
  }

  return (
    <div className="macro-form-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="macro-form-modal" style={{ width: 'min(560px, 100%)' }}>
        <div className="macro-form-header">
          <div>
            <h2 style={{ margin: 0 }}>{t('assignments:copy_scope_modal.title')}</h2>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 14 }}>
              <strong>{scopeKpi.name}</strong> ({scopeKpi.kpiName}) — {t('assignments:copy_scope_modal.origin')}: {scopeKpi.orgScopeName}
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common:close')}
          </button>
        </div>

        {!results ? (
          <>
            <div style={{ margin: '20px 0 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontWeight: 600 }}>
                {t('assignments:copy_scope_modal.select_targets', { type: scopeTypeLabels.plural })}
              </label>
              <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={toggleAll}>
                {allSelected ? t('assignments:copy_scope_modal.deselect_all') : t('assignments:copy_scope_modal.select_all')}
              </button>
            </div>

            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, maxHeight: 280, overflowY: 'auto', marginBottom: 16 }}>
              {availableScopes.length === 0 ? (
                <p style={{ padding: 16, color: '#6b7280', margin: 0 }}>
                  {t('assignments:copy_scope_modal.empty')}
                </p>
              ) : (
                availableScopes.map((scope: any) => (
                  <label
                    key={scope.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 14px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f3f4f6',
                      background: selectedIds.has(Number(scope.id)) ? '#eff6ff' : undefined,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(Number(scope.id))}
                      onChange={() => toggleScope(Number(scope.id))}
                    />
                    <span>
                      {scope.name}
                      <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 6 }}>
                        ({t(`assignments:scope_kpis.scope_types.${scope.type}`, { defaultValue: scope.type })})
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, cursor: 'pointer' }}>
              <input type="checkbox" checked={copyLinks} onChange={(e) => setCopyLinks(e.target.checked)} />
              <span style={{ fontSize: 14 }}>
                {t('assignments:copy_scope_modal.copy_links')}
                <span style={{ color: '#9ca3af', marginLeft: 4 }}>— {t('assignments:copy_scope_modal.copy_links_hint')}</span>
              </span>
            </label>

            {copyMutation.isError && (
              <p style={{ color: '#dc2626', marginBottom: 12 }}>
                {copyErrorMessage}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={onClose}>
                {t('common:cancel')}
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={selectedIds.size === 0 || copyMutation.isLoading}
                onClick={() => copyMutation.mutate()}
              >
                {copyMutation.isLoading
                  ? t('assignments:copy_scope_modal.copying')
                  : t('assignments:copy_scope_modal.copy_button', {
                      count: selectedIds.size,
                      type: selectedIds.size !== 1 ? scopeTypeLabels.plural : scopeTypeLabels.singular,
                    })}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ margin: '20px 0 16px' }}>
              <p style={{ fontWeight: 600, marginBottom: 12 }}>{t('assignments:copy_scope_modal.results_title')}</p>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                {results.map((r) => {
                  const scope = (orgScopes || []).find((s: any) => Number(s.id) === Number(r.orgScopeId))
                  return (
                    <div
                      key={r.orgScopeId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        borderBottom: '1px solid #f3f4f6',
                        background: r.status === 'created' ? '#f0fdf4' : '#fef9c3',
                      }}
                    >
                      <span style={{ fontSize: 18 }}>{r.status === 'created' ? '✓' : '⚠'}</span>
                      <div>
                        <div style={{ fontWeight: 500 }}>
                          {scope?.name || t('assignments:copy_scope_modal.fallback_scope', { id: r.orgScopeId })}
                        </div>
                        {r.status === 'created' ? (
                          <div style={{ fontSize: 12, color: '#16a34a' }}>
                            {t('assignments:copy_scope_modal.result.created', { id: r.newId })}
                            {copyLinks
                              ? ` · ${t('assignments:copy_scope_modal.result.links_summary', {
                                  copied: r.copiedLinksCount ?? 0,
                                  skipped: r.skippedLinksCount ?? 0,
                                })}`
                              : ''}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: '#92400e' }}>{translateResultReason(r.reason)}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-primary" onClick={onClose}>
                {t('common:close')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
