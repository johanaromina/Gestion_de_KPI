/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import api from '../services/api'
import { ScopeKPI } from '../types'
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
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [copyLinks, setCopyLinks] = useState(false)
  const [results, setResults] = useState<CopyResult[] | null>(null)

  const { data: orgScopes } = useQuery('org-scopes', async () => (await api.get('/org-scopes')).data)

  const scopeTypeLabels = useMemo(() => {
    const map: Record<string, { plural: string; singular: string }> = {
      team: { plural: 'equipos', singular: 'equipo' },
      area: { plural: 'áreas', singular: 'área' },
      business_unit: { plural: 'unidades de negocio', singular: 'unidad de negocio' },
      company: { plural: 'compañías', singular: 'compañía' },
      executive: { plural: 'ámbitos ejecutivos', singular: 'ámbito ejecutivo' },
    }
    return map[String(scopeKpi.orgScopeType || '')] || { plural: 'destinos', singular: 'destino' }
  }, [scopeKpi.orgScopeType])

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

  const allSelected = availableScopes.length > 0 && selectedIds.size === availableScopes.length
  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(availableScopes.map((s: any) => Number(s.id))))
    }
  }

  return (
    <div className="macro-form-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="macro-form-modal" style={{ width: 'min(560px, 100%)' }}>
        <div className="macro-form-header">
          <div>
            <h2 style={{ margin: 0 }}>Copiar KPI grupal</h2>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 14 }}>
              <strong>{scopeKpi.name}</strong> ({scopeKpi.kpiName}) — origen: {scopeKpi.orgScopeName}
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {!results ? (
          <>
            <div style={{ margin: '20px 0 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontWeight: 600 }}>Seleccioná los {scopeTypeLabels.plural} destino</label>
              <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={toggleAll}>
                {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
              </button>
            </div>

            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, maxHeight: 280, overflowY: 'auto', marginBottom: 16 }}>
              {availableScopes.length === 0 ? (
                <p style={{ padding: 16, color: '#6b7280', margin: 0 }}>No hay otros destinos del mismo tipo disponibles.</p>
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
                      <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 6 }}>({scope.type})</span>
                    </span>
                  </label>
                ))
              )}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, cursor: 'pointer' }}>
              <input type="checkbox" checked={copyLinks} onChange={(e) => setCopyLinks(e.target.checked)} />
              <span style={{ fontSize: 14 }}>
                Copiar también los vínculos de ámbito (scope→scope)
                <span style={{ color: '#9ca3af', marginLeft: 4 }}>— los vínculos de colaboradores no se copian</span>
              </span>
            </label>

            {copyMutation.isError && (
              <p style={{ color: '#dc2626', marginBottom: 12 }}>
                {(copyMutation.error as any)?.response?.data?.error || 'Error al copiar'}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={selectedIds.size === 0 || copyMutation.isLoading}
                onClick={() => copyMutation.mutate()}
              >
                {copyMutation.isLoading ? 'Copiando...' : `Copiar a ${selectedIds.size} ${selectedIds.size !== 1 ? scopeTypeLabels.plural : scopeTypeLabels.singular}`}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ margin: '20px 0 16px' }}>
              <p style={{ fontWeight: 600, marginBottom: 12 }}>Resultado de la copia:</p>
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
                        <div style={{ fontWeight: 500 }}>{scope?.name || `Scope ${r.orgScopeId}`}</div>
                        {r.status === 'created' ? (
                          <div style={{ fontSize: 12, color: '#16a34a' }}>
                            Creado (ID {r.newId})
                            {copyLinks ? ` · links scope copiados: ${r.copiedLinksCount ?? 0} · omitidos: ${r.skippedLinksCount ?? 0}` : ''}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: '#92400e' }}>{r.reason}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-primary" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
