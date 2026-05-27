/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { ScopeKPI } from '../types'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import './MacroKPIForm.css'

type ScopeKPIFormProps = {
  scopeKpi?: ScopeKPI
  defaultPeriodId?: number | null
  defaultScopeId?: number | null
  onClose: () => void
  onSuccess?: () => void
}

export default function ScopeKPIForm({
  scopeKpi,
  defaultPeriodId,
  defaultScopeId,
  onClose,
  onSuccess,
}: ScopeKPIFormProps) {
  const { t } = useTranslation(['config', 'assignments', 'common'])
  const queryClient = useQueryClient()
  const defaultDirectLabel = t('config:scope_kpi_form.direct_label_default')
  const defaultAggregatedLabel = t('config:scope_kpi_form.aggregated_label_default')
  const initialMixedConfig = scopeKpi?.mixedConfig || {
    directWeight: 50,
    aggregatedWeight: 50,
    directLabel: defaultDirectLabel,
    aggregatedLabel: defaultAggregatedLabel,
  }
  const [formData, setFormData] = useState({
    name: scopeKpi?.name || '',
    description: scopeKpi?.description || '',
    kpiId: scopeKpi?.kpiId || 0,
    orgScopeId: scopeKpi?.orgScopeId || defaultScopeId || 0,
    periodId: scopeKpi?.periodId || defaultPeriodId || 0,
    subPeriodId: scopeKpi?.subPeriodId || '',
    ownerLevel: scopeKpi?.ownerLevel || 'area',
    sourceMode: scopeKpi?.sourceMode || 'direct',
    target: scopeKpi?.target ?? 0,
    weight: Math.round((scopeKpi?.weight ?? 0) * 100) || 0,
    status: scopeKpi?.status || 'draft',
    curationStatus: scopeKpi?.curationStatus || 'pending',
    actualValue: scopeKpi?.sourceMode === 'mixed' ? scopeKpi?.directActual ?? '' : scopeKpi?.actual ?? '',
    directWeight: initialMixedConfig.directWeight ?? 50,
    aggregatedWeight: initialMixedConfig.aggregatedWeight ?? 50,
    directLabel: initialMixedConfig.directLabel || defaultDirectLabel,
    aggregatedLabel: initialMixedConfig.aggregatedLabel || defaultAggregatedLabel,
  })
  const [error, setError] = useState<string | null>(null)

  const { data: kpis } = useQuery('kpis', async () => (await api.get('/kpis')).data)
  const { data: orgScopes } = useQuery('org-scopes', async () => (await api.get('/org-scopes')).data)
  const { data: periods } = useQuery('periods', async () => (await api.get('/periods')).data)
  const { data: subPeriods } = useQuery(
    ['scope-form-subperiods', formData.periodId, formData.orgScopeId],
    async () => {
      if (!formData.periodId) return []
      const selectedScope = (orgScopes || []).find((scope: any) => Number(scope.id) === Number(formData.orgScopeId))
      const response = await api.get(`/periods/${formData.periodId}/sub-periods`, {
        params: { calendarProfileId: selectedScope?.calendarProfileId || undefined },
      })
      return response.data
    },
    { enabled: !!formData.periodId }
  )

  useEffect(() => {
    if (!formData.name && formData.kpiId && Array.isArray(kpis)) {
      const match = kpis.find((item: any) => Number(item.id) === Number(formData.kpiId))
      if (match) {
        setFormData((prev) => ({ ...prev, name: match.name }))
      }
    }
  }, [formData.kpiId, formData.name, kpis])

  const mutation = useMutation(
    async () => {
      const payload = {
        name: formData.name,
        description: formData.description || null,
        kpiId: Number(formData.kpiId),
        orgScopeId: Number(formData.orgScopeId),
        periodId: Number(formData.periodId),
        subPeriodId: formData.subPeriodId ? Number(formData.subPeriodId) : null,
        ownerLevel: formData.ownerLevel,
        sourceMode: formData.sourceMode,
        target: Number(formData.target),
        weight: Number(formData.weight) / 100,
        status: formData.status,
        curationStatus: formData.curationStatus,
        mixedConfig:
          formData.sourceMode === 'mixed'
            ? {
                directWeight: Number(formData.directWeight),
                aggregatedWeight: Number(formData.aggregatedWeight),
                directLabel: formData.directLabel || null,
                aggregatedLabel: formData.aggregatedLabel || null,
              }
            : null,
      }
      if (!payload.name || !payload.kpiId || !payload.orgScopeId || !payload.periodId) {
        throw new Error(t('config:scope_kpi_form.error_required'))
      }
      if (payload.weight <= 0 || payload.weight > 1) {
        throw new Error(t('config:scope_kpi_form.error_weight_range'))
      }
      if (payload.sourceMode === 'mixed' && payload.mixedConfig) {
        const totalWeight = Number(payload.mixedConfig.directWeight || 0) + Number(payload.mixedConfig.aggregatedWeight || 0)
        if (totalWeight <= 0) {
          throw new Error(t('config:scope_kpi_form.error_mixed_weight'))
        }
      }
      const response = scopeKpi
        ? await api.put(`/scope-kpis/${scopeKpi.id}`, payload)
        : await api.post('/scope-kpis', payload)
      const id = scopeKpi?.id || response.data.id
      if (formData.actualValue !== '' && formData.actualValue !== null && formData.actualValue !== undefined) {
        await api.post('/measurements', {
          scopeKpiId: id,
          value: Number(formData.actualValue),
          mode: 'manual',
          status: 'approved',
        })
      }
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('scope-kpis')
        queryClient.invalidateQueries('measurements')
        onSuccess?.()
        onClose()
      },
      onError: (err: any) => {
        setError(
          resolveApiErrorMessage(err, t, {
            fallbackKey: 'config:scope_kpi_form.error_save',
            fallbackValue: err?.message || t('config:scope_kpi_form.error_save'),
          })
        )
      },
    }
  )

  const statusLabel = (status: string) =>
    t(`assignments:status.${status}`, { defaultValue: status })

  const curationStatusLabel = (status: string) =>
    t(`assignments:curation.${status}`, { defaultValue: status })

  const ownerLevelLabel = (level: string) =>
    t(`assignments:scope_kpis.owner_levels.${level}`, { defaultValue: level })

  const sourceModeLabel = (mode: string) =>
    t(`assignments:scope_kpis.source_modes.${mode}`, { defaultValue: mode })

  const scopeTypeLabel = (type: string) =>
    t(`assignments:scope_kpis.scope_types.${type}`, { defaultValue: type })

  return (
    <div className="macro-form-overlay">
      <div className="macro-form-modal">
        <div className="macro-form-header">
          <h2>{scopeKpi ? t('config:scope_kpi_form.title_edit') : t('config:scope_kpi_form.title_new')}</h2>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common:close')}
          </button>
        </div>
        <div className="macro-form-grid">
          <label>
            {t('config:scope_kpi_form.name_label')}
            <input value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} />
          </label>
          <label>
            {t('config:scope_kpi_form.base_kpi_label')}
            <select value={formData.kpiId} onChange={(e) => setFormData((prev) => ({ ...prev, kpiId: Number(e.target.value) }))}>
              <option value={0}>{t('config:scope_kpi_form.base_kpi_placeholder')}</option>
              {(kpis || []).map((kpi: any) => (
                <option key={kpi.id} value={kpi.id}>
                  {kpi.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('config:scope_kpi_form.scope_label')}
            <select value={formData.orgScopeId} onChange={(e) => setFormData((prev) => ({ ...prev, orgScopeId: Number(e.target.value) }))}>
              <option value={0}>{t('config:scope_kpi_form.scope_placeholder')}</option>
              {(orgScopes || []).map((scope: any) => {
                return (
                  <option key={scope.id} value={scope.id}>
                    {scope.name} ({scopeTypeLabel(scope.type)})
                  </option>
                )
              })}
            </select>
          </label>
          <label>
            {t('config:scope_kpi_form.period_label')}
            <select value={formData.periodId} onChange={(e) => setFormData((prev) => ({ ...prev, periodId: Number(e.target.value) }))}>
              <option value={0}>{t('config:scope_kpi_form.period_placeholder')}</option>
              {(periods || []).map((period: any) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('config:scope_kpi_form.subperiod_label')}
            <select value={formData.subPeriodId} onChange={(e) => setFormData((prev) => ({ ...prev, subPeriodId: e.target.value }))}>
              <option value="">{t('config:scope_kpi_form.subperiod_placeholder')}</option>
              {(subPeriods || []).map((subPeriod: any) => (
                <option key={subPeriod.id} value={subPeriod.id}>
                  {subPeriod.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('config:scope_kpi_form.owner_level_label')}
            <select value={formData.ownerLevel} onChange={(e) => setFormData((prev) => ({ ...prev, ownerLevel: e.target.value as any }))}>
              <option value="team">{ownerLevelLabel('team')}</option>
              <option value="area">{ownerLevelLabel('area')}</option>
              <option value="business_unit">{ownerLevelLabel('business_unit')}</option>
              <option value="company">{ownerLevelLabel('company')}</option>
              <option value="executive">{ownerLevelLabel('executive')}</option>
            </select>
          </label>
          <label>
            {t('config:scope_kpi_form.source_mode_label')}
            <select value={formData.sourceMode} onChange={(e) => setFormData((prev) => ({ ...prev, sourceMode: e.target.value as any }))}>
              <option value="direct">{sourceModeLabel('direct')}</option>
              <option value="aggregated">{sourceModeLabel('aggregated')}</option>
              <option value="mixed">{sourceModeLabel('mixed')}</option>
            </select>
          </label>
          <label>
            {t('config:scope_kpi_form.target_label')}
            <input type="number" value={formData.target} onChange={(e) => setFormData((prev) => ({ ...prev, target: Number(e.target.value) }))} />
          </label>
          <label title={t('config:scope_kpi_form.weight_hint')}>
            {t('config:scope_kpi_form.weight_label')}
            <input type="number" min="1" max="100" step="1" value={formData.weight} onChange={(e) => setFormData((prev) => ({ ...prev, weight: Number(e.target.value) }))} />
          </label>
          <label>
            {t('config:scope_kpi_form.status_label')}
            <select value={formData.status} onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value as any }))}>
              <option value="draft">{statusLabel('draft')}</option>
              <option value="proposed">{statusLabel('proposed')}</option>
              <option value="approved">{statusLabel('approved')}</option>
              <option value="closed">{statusLabel('closed')}</option>
            </select>
          </label>
          <label>
            {t('config:scope_kpi_form.curation_label')}
            <select value={formData.curationStatus} onChange={(e) => setFormData((prev) => ({ ...prev, curationStatus: e.target.value as any }))}>
              <option value="pending">{curationStatusLabel('pending')}</option>
              <option value="in_review">{curationStatusLabel('in_review')}</option>
              <option value="approved">{curationStatusLabel('approved')}</option>
              <option value="rejected">{curationStatusLabel('rejected')}</option>
            </select>
          </label>
          <label>
            {formData.sourceMode === 'mixed'
              ? t('config:scope_kpi_form.actual_direct_label')
              : t('config:scope_kpi_form.actual_label')}
            <input
              type="number"
              value={formData.actualValue}
              onChange={(e) => setFormData((prev) => ({ ...prev, actualValue: e.target.value }))}
            />
          </label>
          {formData.sourceMode === 'mixed' ? (
            <>
              <div className="macro-form-span macro-form-note">
                {t('config:scope_kpi_form.mixed_note')}
              </div>
              <label>
                {t('config:scope_kpi_form.direct_weight_label')}
                <input
                  type="number"
                  value={formData.directWeight}
                  onChange={(e) => setFormData((prev) => ({ ...prev, directWeight: Number(e.target.value) }))}
                />
              </label>
              <label>
                {t('config:scope_kpi_form.aggregated_weight_label')}
                <input
                  type="number"
                  value={formData.aggregatedWeight}
                  onChange={(e) => setFormData((prev) => ({ ...prev, aggregatedWeight: Number(e.target.value) }))}
                />
              </label>
              <label>
                {t('config:scope_kpi_form.direct_label_label')}
                <input
                  value={formData.directLabel}
                  onChange={(e) => setFormData((prev) => ({ ...prev, directLabel: e.target.value }))}
                />
              </label>
              <label>
                {t('config:scope_kpi_form.aggregated_label_label')}
                <input
                  value={formData.aggregatedLabel}
                  onChange={(e) => setFormData((prev) => ({ ...prev, aggregatedLabel: e.target.value }))}
                />
              </label>
            </>
          ) : null}
          <label className="macro-form-span">
            {t('config:scope_kpi_form.description_label')}
            <textarea value={formData.description} onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))} rows={3} />
          </label>
        </div>
        {error && <div className="error-message">{error}</div>}
        <div className="macro-form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common:cancel')}
          </button>
          <button type="button" className="btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isLoading}>
            {mutation.isLoading ? t('config:scope_kpi_form.saving') : t('config:scope_kpi_form.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
