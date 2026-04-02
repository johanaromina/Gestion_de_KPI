/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import api from '../services/api'
import { ScopeKPI, ScopeKPILink } from '../types'
import './ScopeKPIDetailModal.css'

type ScopeKpiMeasurement = {
  id: number
  value: number
  mode: 'manual' | 'import' | 'auto'
  status: 'draft' | 'proposed' | 'approved' | 'rejected'
  capturedAt?: string
  capturedByName?: string
  sourceRunId?: string | null
  reason?: string | null
}

type ScopeKpiAggregationRun = {
  id: number
  status: string
  resultValue?: number | null
  message?: string | null
  createdAt?: string
  createdByName?: string | null
  inputCount?: number | null
}

type ScopeKPIDetailModalProps = {
  scopeKpiId: number
  initialScopeKpi?: ScopeKPI | null
  onClose: () => void
}

type ScopeNavigationEntry = {
  id: number
  label: string
}

const formatNumber = (value?: number | null) => (value == null ? '-' : Number(value).toFixed(2))

const buildScopeLabel = (scopeKpiId: number, scopeKpi?: Pick<ScopeKPI, 'name'> | null) =>
  scopeKpi?.name?.trim() || `Scope KPI #${scopeKpiId}`

const formatDate = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-AR')
}

export default function ScopeKPIDetailModal({ scopeKpiId, initialScopeKpi, onClose }: ScopeKPIDetailModalProps) {
  const [navigationStack, setNavigationStack] = useState<ScopeNavigationEntry[]>([
    {
      id: scopeKpiId,
      label: buildScopeLabel(scopeKpiId, initialScopeKpi || null),
    },
  ])

  useEffect(() => {
    setNavigationStack([
      {
        id: scopeKpiId,
        label: buildScopeLabel(scopeKpiId, initialScopeKpi || null),
      },
    ])
  }, [initialScopeKpi, scopeKpiId])

  const currentScopeKpiId = navigationStack[navigationStack.length - 1]?.id || scopeKpiId

  const { data: scopeKpi, isLoading: isLoadingScope } = useQuery<ScopeKPI>(
    ['scope-kpi-detail', currentScopeKpiId],
    async () => (await api.get(`/scope-kpis/${currentScopeKpiId}`)).data,
    {
      initialData: currentScopeKpiId === scopeKpiId ? initialScopeKpi || undefined : undefined,
      enabled: !!currentScopeKpiId,
    }
  )

  useEffect(() => {
    if (!scopeKpi?.id || !scopeKpi?.name) return
    setNavigationStack((current) => {
      if (!current.length) return current
      const next = [...current]
      const last = next[next.length - 1]
      if (last.id !== scopeKpi.id || last.label === scopeKpi.name) {
        return current
      }
      next[next.length - 1] = { ...last, label: scopeKpi.name }
      return next
    })
  }, [scopeKpi?.id, scopeKpi?.name])

  const { data: links } = useQuery<ScopeKPILink[]>(
    ['scope-kpi-detail-links', currentScopeKpiId],
    async () => (await api.get(`/scope-kpis/${currentScopeKpiId}/links`)).data,
    { enabled: !!currentScopeKpiId }
  )

  const { data: measurements } = useQuery<ScopeKpiMeasurement[]>(
    ['scope-kpi-detail-measurements', currentScopeKpiId],
    async () => (await api.get('/measurements', { params: { scopeKpiId: currentScopeKpiId } })).data,
    { enabled: !!currentScopeKpiId }
  )

  const { data: aggregationRuns } = useQuery<ScopeKpiAggregationRun[]>(
    ['scope-kpi-detail-runs', currentScopeKpiId],
    async () => (await api.get(`/scope-kpis/${currentScopeKpiId}/aggregation-runs`, { params: { limit: 6 } })).data,
    { enabled: !!currentScopeKpiId }
  )

  const recentMeasurements = useMemo(() => (measurements || []).slice(0, 6), [measurements])
  const recentRuns = useMemo(() => aggregationRuns || [], [aggregationRuns])

  const openScopeChild = (childScopeId: number, label?: string | null) => {
    setNavigationStack((current) => {
      const existingIndex = current.findIndex((item) => item.id === childScopeId)
      if (existingIndex >= 0) {
        return current.slice(0, existingIndex + 1)
      }
      return [...current, { id: childScopeId, label: label?.trim() || `Scope KPI #${childScopeId}` }]
    })
  }

  const navigateToBreadcrumb = (index: number) => {
    setNavigationStack((current) => current.slice(0, index + 1))
  }

  const navigateBack = () => {
    setNavigationStack((current) => (current.length > 1 ? current.slice(0, -1) : current))
  }

  return (
    <div className="scope-detail-overlay">
      <div className="scope-detail-modal">
        <div className="scope-detail-header">
          <div>
            <div className="scope-detail-breadcrumbs">
              {navigationStack.map((entry, index) => (
                <div key={`${entry.id}-${index}`} className="scope-detail-breadcrumb-item">
                  {index > 0 ? <span className="scope-detail-breadcrumb-separator">/</span> : null}
                  <button
                    type="button"
                    className={`scope-detail-breadcrumb-button ${index === navigationStack.length - 1 ? 'active' : ''}`}
                    onClick={() => navigateToBreadcrumb(index)}
                    disabled={index === navigationStack.length - 1}
                  >
                    {entry.label}
                  </button>
                </div>
              ))}
            </div>
            <h2>{scopeKpi?.name || 'Detalle Scope KPI'}</h2>
            <div className="scope-detail-subtitle">
              <span>{scopeKpi?.kpiName || 'KPI base'}</span>
              <span>{scopeKpi?.orgScopeName || 'Scope'}</span>
              <span>Owner: {scopeKpi?.ownerLevel || '-'}</span>
              <span>Source: {scopeKpi?.sourceMode || '-'}</span>
              <span>Estado: {scopeKpi?.status || '-'}</span>
            </div>
          </div>
          <div className="scope-detail-header-actions">
            {navigationStack.length > 1 ? (
              <button type="button" className="btn-secondary" onClick={navigateBack}>
                Volver
              </button>
            ) : null}
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>

        {isLoadingScope && !scopeKpi ? (
          <div className="scope-detail-empty">Cargando detalle...</div>
        ) : (
          <div className="scope-detail-grid">
            <div className="scope-detail-stack">
              <section className="scope-detail-section">
                <h3>Resumen</h3>
                <div className="scope-detail-summary">
                  <div className="scope-detail-stat">
                    <span>Actual</span>
                    <strong>{formatNumber(scopeKpi?.actual)}</strong>
                  </div>
                  <div className="scope-detail-stat">
                    <span>Target</span>
                    <strong>{formatNumber(scopeKpi?.target)}</strong>
                  </div>
                  <div className="scope-detail-stat">
                    <span>Variación</span>
                    <strong>{formatNumber(scopeKpi?.variation)}</strong>
                  </div>
                  <div className="scope-detail-stat">
                    <span>Resultado</span>
                    <strong>{formatNumber(scopeKpi?.weightedResult)}</strong>
                  </div>
                </div>
              </section>

              {scopeKpi?.sourceMode === 'mixed' ? (
                <section className="scope-detail-section">
                  <h3>Composición Mixed</h3>
                  <div className="scope-detail-mix">
                    <div className="scope-detail-empty">
                      El valor final combina el componente directo y el agregado. Las mediciones manuales/importadas alimentan el directo; el
                      recálculo desde links actualiza el agregado.
                    </div>
                    <div className="scope-detail-mix-grid">
                      <div className="scope-detail-mix-card">
                        <span>{scopeKpi.mixedConfig?.directLabel || 'Componente directo'}</span>
                        <strong>{formatNumber(scopeKpi.directActual)}</strong>
                        <small>Peso: {scopeKpi.mixedConfig?.directWeight ?? 50}</small>
                      </div>
                      <div className="scope-detail-mix-card">
                        <span>{scopeKpi.mixedConfig?.aggregatedLabel || 'Componente agregado'}</span>
                        <strong>{formatNumber(scopeKpi.aggregatedActual)}</strong>
                        <small>Peso: {scopeKpi.mixedConfig?.aggregatedWeight ?? 50}</small>
                      </div>
                      <div className="scope-detail-mix-card">
                        <span>Resultado final</span>
                        <strong>{formatNumber(scopeKpi.actual)}</strong>
                        <small>
                          Mix {scopeKpi.mixedConfig?.directWeight ?? 50}/{scopeKpi.mixedConfig?.aggregatedWeight ?? 50}
                        </small>
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              <section className="scope-detail-section">
                <h3>Contribuciones</h3>
                {links?.length ? (
                  <div className="scope-detail-list">
                    {links.map((link) => (
                      <div key={link.id} className="scope-detail-item">
                        <div className="scope-detail-item-main">
                          <strong>
                            {link.childType === 'collaborator'
                              ? `${link.collaboratorName || 'Colaborador'} · ${link.collaboratorKpiName || 'KPI'}`
                              : `${link.childScopeKpiName || 'Scope KPI'}`}
                          </strong>
                          <div className="scope-detail-item-actions">
                            <span>
                              {link.aggregationMethod}
                              {link.contributionWeight != null ? ` · peso ${link.contributionWeight}` : ''}
                            </span>
                            {link.childType === 'scope' && link.childScopeKpiId ? (
                              <button
                                type="button"
                                className="scope-detail-link-button"
                                onClick={() => openScopeChild(link.childScopeKpiId as number, link.childScopeKpiName)}
                              >
                                Abrir hijo
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="scope-detail-item-meta">
                          <span>Tipo: {link.childType}</span>
                          <span>Orden: {link.sortOrder ?? 0}</span>
                          {link.childType === 'scope' && link.childScopeKpiId ? <span>Scope hijo #{link.childScopeKpiId}</span> : null}
                          {link.childType === 'collaborator' && link.collaboratorAssignmentId ? (
                            <span>Asignación #{link.collaboratorAssignmentId}</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="scope-detail-empty">Este Scope KPI todavía no tiene links configurados.</div>
                )}
              </section>
            </div>

            <div className="scope-detail-side">
              <section className="scope-detail-section">
                <h3>Objetivos vinculados</h3>
                {scopeKpi?.objectiveNames?.length ? (
                  <div className="scope-detail-tags">
                    {scopeKpi.objectiveNames.map((objectiveName) => (
                      <span key={objectiveName} className="scope-detail-tag">
                        {objectiveName}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="scope-detail-empty">Sin objetivos estratégicos asociados.</div>
                )}
              </section>

              <section className="scope-detail-section">
                <h3>Corridas de agregación</h3>
                {recentRuns.length ? (
                  <div className="scope-detail-list">
                    {recentRuns.map((run) => (
                      <div key={run.id} className="scope-detail-item">
                        <div className="scope-detail-item-main">
                          <strong>{formatNumber(run.resultValue)}</strong>
                          <span>{run.status}</span>
                        </div>
                        <div className="scope-detail-item-meta">
                          <span>{run.message || 'Sin mensaje'}</span>
                          <span>Inputs: {run.inputCount ?? 0}</span>
                          <span>{formatDate(run.createdAt)}</span>
                          <span>{run.createdByName || 'Sistema'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="scope-detail-empty">No hay corridas de agregación para este Scope KPI.</div>
                )}
              </section>

              <section className="scope-detail-section">
                <h3>Mediciones recientes</h3>
                {recentMeasurements.length ? (
                  <div className="scope-detail-list">
                    {recentMeasurements.map((measurement) => (
                      <div key={measurement.id} className="scope-detail-item">
                        <div className="scope-detail-item-main">
                          <strong>{formatNumber(measurement.value)}</strong>
                          <span>
                            {measurement.mode} · {measurement.status}
                          </span>
                        </div>
                        <div className="scope-detail-item-meta">
                          <span>{formatDate(measurement.capturedAt)}</span>
                          <span>{measurement.capturedByName || measurement.sourceRunId || 'Sistema'}</span>
                          {measurement.reason ? <span>{measurement.reason}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="scope-detail-empty">No hay mediciones recientes para este Scope KPI.</div>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
