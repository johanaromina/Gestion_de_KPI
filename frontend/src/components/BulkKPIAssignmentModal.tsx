/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import './BulkKPIAssignmentModal.css'

interface Props {
  /** Si se pasa, pre-llena el paso 1 y arranca en paso 2 (modo Replicar) */
  prefill?: {
    kpiId: number
    kpiName: string
    periodId: number
    periodName: string
    target: number
    weight: number
  }
  onClose: () => void
  onSuccess: (created: number, skipped: number) => void
}

const dataSourceOptions = ['Jira', 'Xray', 'DB MySQL', 'CSV upload', 'Manual', 'Otro']

export default function BulkKPIAssignmentModal({ prefill, onClose, onSuccess }: Props) {
  const { t } = useTranslation(['assignments', 'common'])
  const getRoleLabel = (role: string) => t(`common:roles.${role}`, { defaultValue: role })
  const queryClient = useQueryClient()
  const [step, setStep] = useState<1 | 2>(prefill ? 2 : 1)

  // Paso 1
  const [kpiId, setKpiId] = useState(prefill ? String(prefill.kpiId) : '')
  const [periodId, setPeriodId] = useState(prefill ? String(prefill.periodId) : '')
  const [target, setTarget] = useState(prefill ? String(prefill.target) : '')
  const [weight, setWeight] = useState(prefill ? String(prefill.weight) : '0')
  const [applyAdvancedOptions, setApplyAdvancedOptions] = useState(false)
  const [assignmentStatus, setAssignmentStatus] = useState<'draft' | 'proposed' | 'approved' | 'closed'>('draft')
  const [curationStatus, setCurationStatus] = useState<'pending' | 'in_review' | 'approved' | 'rejected'>('pending')
  const [inputMode, setInputMode] = useState<'manual' | 'import' | 'auto'>('manual')
  const [dataSource, setDataSource] = useState('')
  const [sourceConfig, setSourceConfig] = useState('')
  const [criteriaText, setCriteriaText] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')

  // Paso 2
  const [scopeId, setScopeId] = useState('')
  const [selectedRole, setSelectedRole] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const { data: kpis = [] } = useQuery<any[]>('kpis', () => api.get('/kpis').then(r => r.data))
  const { data: periods = [] } = useQuery<any[]>('periods', () => api.get('/periods').then(r => r.data))
  const { data: orgScopes = [] } = useQuery<any[]>('org-scopes', () => api.get('/org-scopes').then(r => r.data))
  const { data: collaborators = [] } = useQuery<any[]>('collaborators', () => api.get('/collaborators').then(r => r.data))

  // Asignaciones del período seleccionado (para detectar duplicados)
  const { data: existingAssignments = [] } = useQuery<any[]>(
    ['collaborator-kpis', 'period', periodId],
    () => api.get(`/collaborator-kpis/period/${periodId}`).then(r => r.data),
    { enabled: !!periodId && step === 2 }
  )

  // Scopes asignables (todos excepto type=person)
  const scopeById = useMemo(() => {
    const m = new Map<number, any>()
    orgScopes.forEach((s: any) => m.set(s.id, s))
    return m
  }, [orgScopes])

  const buildLabel = (scope: any): string => {
    const parts: string[] = []
    let cur = scope
    let safety = 0
    while (cur && safety < 5) { parts.unshift(cur.name); cur = cur.parentId ? scopeById.get(cur.parentId) : null; safety++ }
    return parts.join(' › ')
  }

  const assignableScopes = useMemo(() =>
    orgScopes
      .filter((s: any) => s.type !== 'person' && s.active !== 0)
      .map((s: any) => ({ ...s, label: buildLabel(s) }))
      .sort((a: any, b: any) => a.label.localeCompare(b.label))
  , [orgScopes, scopeById])

  // Colaboradores según el scope seleccionado y sus hijos
  const descendantScopeIds = useMemo(() => {
    if (!scopeId) return new Set<number>()
    const result = new Set<number>([Number(scopeId)])
    const queue = [Number(scopeId)]
    while (queue.length) {
      const parent = queue.shift()!
      orgScopes.filter((s: any) => s.parentId === parent).forEach((s: any) => {
        result.add(s.id); queue.push(s.id)
      })
    }
    return result
  }, [scopeId, orgScopes])

  const descendantScopeNames = useMemo(() => {
    if (!scopeId) return new Set<string>()
    return new Set(
      Array.from(descendantScopeIds)
        .map((id) => scopeById.get(id)?.name)
        .filter(Boolean)
        .map((name) => String(name).trim().toLowerCase())
    )
  }, [scopeId, descendantScopeIds, scopeById])

  const activeCollaborators = useMemo(
    () => collaborators.filter((c: any) => c.status !== 'inactive'),
    [collaborators]
  )

  const availableRoles = useMemo<string[]>(() =>
    Array.from(
      new Set<string>(
        activeCollaborators
          .map((c: any) => String(c.role || ''))
          .filter(Boolean)
      )
    ).sort((a, b) => getRoleLabel(a).localeCompare(getRoleLabel(b)))
  , [activeCollaborators])

  const scopeFilteredCollaborators = useMemo(() => {
    if (!scopeId) return activeCollaborators
    return activeCollaborators.filter((c: any) => {
      const collaboratorScopeId = Number(c.orgScopeId)
      if (Number.isFinite(collaboratorScopeId) && collaboratorScopeId > 0) {
        return descendantScopeIds.has(collaboratorScopeId)
      }
      return descendantScopeNames.has(String(c.area || '').trim().toLowerCase())
    })
  }, [activeCollaborators, scopeId, descendantScopeIds, descendantScopeNames])

  const filteredCollaborators = useMemo(() => {
    if (!selectedRole) return scopeFilteredCollaborators
    return scopeFilteredCollaborators.filter((c: any) => c.role === selectedRole)
  }, [scopeFilteredCollaborators, selectedRole])

  // Detectar cuáles ya tienen el KPI asignado en este período
  const alreadyAssignedIds = useMemo(() => {
    const set = new Set<number>()
    existingAssignments
      .filter((a: any) => a.kpiId === Number(kpiId) && !a.subPeriodId)
      .forEach((a: any) => set.add(a.collaboratorId))
    return set
  }, [existingAssignments, kpiId])

  const eligibleCollaborators = useMemo(
    () => filteredCollaborators.filter((c: any) => !alreadyAssignedIds.has(c.id)),
    [filteredCollaborators, alreadyAssignedIds]
  )

  const filteredAlreadyAssignedCount = useMemo(
    () => filteredCollaborators.filter((c: any) => alreadyAssignedIds.has(c.id)).length,
    [filteredCollaborators, alreadyAssignedIds]
  )

  useEffect(() => {
    const eligibleIds = new Set<number>(eligibleCollaborators.map((c: any) => c.id))
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => eligibleIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [eligibleCollaborators])

  const toggleAll = () => {
    if (selectedIds.size === eligibleCollaborators.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(eligibleCollaborators.map((c: any) => c.id)))
    }
  }

  const toggleOne = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const bulkMutation = useMutation(
    () => {
      const payload: Record<string, any> = {
        kpiId: Number(kpiId),
        periodId: Number(periodId),
        collaboratorIds: Array.from(selectedIds),
        target: Number(target),
        weight: Number(weight),
      }

      if (applyAdvancedOptions) {
        payload.status = assignmentStatus
        payload.curationStatus = curationStatus
        payload.inputMode = inputMode
        payload.dataSource = dataSource
        payload.sourceConfig = sourceConfig
        payload.criteriaText = criteriaText
        payload.evidenceUrl = evidenceUrl
      }

      return api.post('/collaborator-kpis/bulk', payload).then(r => r.data)
    },
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('collaborator-kpis')
        onSuccess(data.created, data.skipped)
      },
    }
  )

  const step1Valid = kpiId && periodId && target && Number(target) > 0

  const selectedKpi = useMemo(
    () => kpis.find((k: any) => k.id === Number(kpiId)) ?? null,
    [kpis, kpiId]
  )

  useEffect(() => {
    if (!applyAdvancedOptions || !selectedKpi) return
    const defaultCriteria = selectedKpi.criteria || selectedKpi.defaultCriteriaTemplate || ''
    setDataSource((prev) => prev || selectedKpi.defaultDataSource || '')
    setCriteriaText((prev) => prev || defaultCriteria)
  }, [applyAdvancedOptions, selectedKpi?.id])

  const selectedKpiName = prefill?.kpiName ?? selectedKpi?.name ?? ''
  const selectedPeriodName = prefill?.periodName ?? periods.find((p: any) => p.id === Number(periodId))?.name ?? ''
  const eligibleCount = eligibleCollaborators.length

  return (
    <div className="bulk-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bulk-modal">
        <div className="bulk-modal-header">
          <div>
            <h2>{prefill ? t('bulk.title_replicate') : t('bulk.title')}</h2>
            <p className="bulk-modal-sub">
              {step === 1 ? t('bulk.step1_subtitle') : t('bulk.step2_subtitle')}
            </p>
          </div>
          <button className="bulk-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="bulk-modal-steps">
          <div className={`bulk-step-dot ${step >= 1 ? 'active' : ''}`}>1</div>
          <div className="bulk-step-line" />
          <div className={`bulk-step-dot ${step >= 2 ? 'active' : ''}`}>2</div>
        </div>

        <div className="bulk-modal-body">
          {/* ── PASO 1 ── */}
          {step === 1 && (
            <div className="bulk-step">
              <div className="bulk-form-row">
                <div className="bulk-field">
                  <label>{t('bulk.kpi_label')}</label>
                  <select value={kpiId} onChange={e => setKpiId(e.target.value)}>
                    <option value="">{t('bulk.kpi_placeholder')}</option>
                    {kpis.map((k: any) => (
                      <option key={k.id} value={k.id}>{k.name}</option>
                    ))}
                  </select>
                </div>
                <div className="bulk-field">
                  <label>{t('bulk.period_label')}</label>
                  <select value={periodId} onChange={e => setPeriodId(e.target.value)}>
                    <option value="">{t('bulk.period_placeholder')}</option>
                    {periods.filter((p: any) => p.status !== 'closed').map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="bulk-form-row">
                <div className="bulk-field">
                  <label>{t('bulk.target_label')}</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={target}
                    onChange={e => setTarget(e.target.value)}
                    placeholder={t('form.target_placeholder')}
                  />
                  <small>{t('bulk.target_hint')}</small>
                </div>
                <div className="bulk-field">
                  <label>{t('bulk.weight_label')}</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={weight}
                    onChange={e => setWeight(e.target.value)}
                    placeholder={t('form.weight_placeholder')}
                  />
                  <small>{t('bulk.weight_hint')}</small>
                </div>
              </div>

              <div className="bulk-advanced-toggle">
                <label>
                  <input
                    type="checkbox"
                    checked={applyAdvancedOptions}
                    onChange={(e) => setApplyAdvancedOptions(e.target.checked)}
                  />
                  {t('bulk.advanced_toggle')}
                </label>
                <small>{t('bulk.advanced_hint')}</small>
              </div>

              {applyAdvancedOptions && (
                <div className="bulk-advanced-panel">
                  <div className="bulk-form-row">
                    <div className="bulk-field">
                      <label>{t('bulk.status_label')}</label>
                      <select value={assignmentStatus} onChange={e => setAssignmentStatus(e.target.value as any)}>
                        <option value="draft">{t('status.draft')}</option>
                        <option value="proposed">{t('status.proposed')}</option>
                        <option value="approved">{t('status.approved')}</option>
                        <option value="closed">{t('status.closed')}</option>
                      </select>
                    </div>
                    <div className="bulk-field">
                      <label>{t('bulk.curation_label')}</label>
                      <select value={curationStatus} onChange={e => setCurationStatus(e.target.value as any)}>
                        <option value="pending">{t('curation.pending')}</option>
                        <option value="in_review">{t('curation.in_review')}</option>
                        <option value="approved">{t('curation.approved')}</option>
                        <option value="rejected">{t('curation.rejected')}</option>
                      </select>
                    </div>
                    <div className="bulk-field">
                      <label>{t('bulk.input_mode_label')}</label>
                      <select value={inputMode} onChange={e => setInputMode(e.target.value as any)}>
                        <option value="manual">{t('input.manual')}</option>
                        <option value="import">{t('input.import')}</option>
                        <option value="auto">{t('input.auto')}</option>
                      </select>
                    </div>
                  </div>

                  <div className="bulk-form-row">
                    <div className="bulk-field">
                      <label>{t('bulk.data_source_label')}</label>
                      <select value={dataSource} onChange={e => setDataSource(e.target.value)}>
                        <option value="">{t('bulk.data_source_empty')}</option>
                        {dataSourceOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                    <div className="bulk-field">
                      <label>{t('bulk.source_config_label')}</label>
                      <input
                        type="text"
                        value={sourceConfig}
                        onChange={e => setSourceConfig(e.target.value)}
                        placeholder={t('form.source_config_placeholder')}
                      />
                    </div>
                  </div>

                  <div className="bulk-field">
                    <label>{t('bulk.criteria_label')}</label>
                    <textarea
                      value={criteriaText}
                      onChange={e => setCriteriaText(e.target.value)}
                      rows={3}
                      placeholder={t('form.criteria_placeholder')}
                    />
                  </div>

                  <div className="bulk-field">
                    <label>{t('bulk.evidence_label')}</label>
                    <input
                      type="text"
                      value={evidenceUrl}
                      onChange={e => setEvidenceUrl(e.target.value)}
                      placeholder={t('form.evidence_placeholder')}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PASO 2 ── */}
          {step === 2 && (
            <div className="bulk-step">
              {/* Resumen paso 1 */}
              <div className="bulk-summary-bar">
                <span><strong>{t('bulk.summary_kpi')}</strong> {selectedKpiName}</span>
                <span><strong>{t('bulk.summary_period')}</strong> {selectedPeriodName}</span>
                <span><strong>{t('bulk.summary_target')}</strong> {target}</span>
                <span><strong>{t('bulk.summary_weight')}</strong> {weight}%</span>
                <button className="bulk-edit-step1" onClick={() => setStep(1)}>{t('bulk.summary_edit')}</button>
              </div>

              {/* Filtros de destinatarios */}
              <div className="bulk-form-row" style={{ marginBottom: 12 }}>
                <div className="bulk-field">
                  <label>{t('bulk.filter_scope_label')}</label>
                  <select value={scopeId} onChange={e => setScopeId(e.target.value)}>
                    <option value="">{t('bulk.filter_scope_all')}</option>
                    {assignableScopes.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="bulk-field">
                  <label>{t('bulk.filter_role_label')}</label>
                  <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)}>
                    <option value="">{t('bulk.filter_role_all')}</option>
                    {availableRoles.map((role) => (
                      <option key={role} value={role}>{getRoleLabel(role)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Controles selección */}
              <div className="bulk-select-controls">
                <span className="bulk-count-label">
                  {t('bulk.collaborators_count', {
                    total: filteredCollaborators.length,
                    already: filteredAlreadyAssignedCount,
                    eligible: eligibleCount,
                  })}
                </span>
                {eligibleCount > 0 && (
                  <button className="bulk-select-all" onClick={toggleAll}>
                    {selectedIds.size === eligibleCount ? t('bulk.deselect_all') : t('bulk.select_all')}
                  </button>
                )}
              </div>

              {/* Lista de colaboradores */}
              <div className="bulk-collaborator-list">
                {filteredCollaborators.length === 0 && (
                  <div className="bulk-empty">{t('bulk.empty')}</div>
                )}
                {filteredCollaborators.map((c: any) => {
                  const already = alreadyAssignedIds.has(c.id)
                  const checked = selectedIds.has(c.id)
                  const scopeName = c.orgScopeId ? scopeById.get(Number(c.orgScopeId))?.name : c.area
                  const collaboratorRole = getRoleLabel(c.role)
                  return (
                    <label
                      key={c.id}
                      className={`bulk-collab-row ${already ? 'bulk-collab-row--taken' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={already}
                        onChange={() => toggleOne(c.id)}
                      />
                      <div className="bulk-collab-info">
                        <span className="bulk-collab-name">{c.name}</span>
                        {(collaboratorRole || c.position) && (
                          <span className="bulk-collab-pos">
                            {collaboratorRole}
                            {c.position ? ` · ${c.position}` : ''}
                          </span>
                        )}
                        {scopeName && <span className="bulk-collab-scope">{scopeName}</span>}
                      </div>
                      {already && <span className="bulk-collab-taken">{t('bulk.already_assigned')}</span>}
                    </label>
                  )
                })}
              </div>

              {selectedIds.size > 0 && (
                <div className="bulk-selection-summary">
                  {selectedIds.size !== 1
                    ? t('bulk.selection_many', { count: selectedIds.size })
                    : t('bulk.selection_one', { count: selectedIds.size })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bulk-modal-footer">
          {step === 1 ? (
            <>
              <button className="btn-secondary" onClick={onClose}>{t('bulk.cancel')}</button>
              <button
                className="btn-primary"
                onClick={() => setStep(2)}
                disabled={!step1Valid}
              >
                {t('bulk.next')}
              </button>
            </>
          ) : (
            <>
              {!prefill && (
                <button className="btn-secondary" onClick={() => setStep(1)}>{t('bulk.back')}</button>
              )}
              {prefill && <button className="btn-secondary" onClick={onClose}>{t('bulk.cancel')}</button>}
              <button
                className="btn-primary"
                onClick={() => bulkMutation.mutate()}
                disabled={selectedIds.size === 0 || bulkMutation.isLoading}
              >
                {bulkMutation.isLoading
                  ? t('bulk.creating')
                  : selectedIds.size !== 1
                    ? t('bulk.assign_many', { count: selectedIds.size })
                    : t('bulk.assign_one', { count: selectedIds.size })}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
