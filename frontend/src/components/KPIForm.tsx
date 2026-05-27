import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { KPI } from '../types'
import { closeOnOverlayClick, markOverlayPointerDown } from '../utils/modal'
import './KPIForm.css'

interface KPIFormProps {
  kpi?: KPI
  onClose: () => void
  onSuccess?: () => void
}

export default function KPIForm({ kpi, onClose, onSuccess }: KPIFormProps) {
  const [formData, setFormData] = useState<Partial<KPI>>({
    name: kpi?.name || '',
    description: kpi?.description || '',
    type: kpi?.type || 'value',
    direction: kpi?.direction || (kpi?.type === 'sla' ? 'reduction' : 'growth'),
    criteria: kpi?.criteria || '',
    formula: kpi?.formula || '',
    macroKPIId: kpi?.macroKPIId || undefined,
    areas: kpi?.areas || [],
    periodIds: kpi?.periodIds || [],
    scopeWeights: kpi?.scopeWeights || [],
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const queryClient = useQueryClient()
  const { t } = useTranslation('kpis')

  const { data: periods } = useQuery(
    ['periods-for-kpi-form'],
    async () => {
      const res = await api.get('/periods')
      return res.data as { id: number; name: string }[]
    },
    { retry: false }
  )

  const { data: kpis } = useQuery<KPI[]>(
    ['kpis'],
    async () => {
      const response = await api.get('/kpis')
      return response.data
    },
    {
      retry: false,
    }
  )

  const { data: orgScopes } = useQuery(
    ['org-scopes-for-kpi-form'],
    async () => {
      const res = await api.get('/org-scopes')
      return res.data as any[]
    },
    { retry: false }
  )

  const scopesById = useMemo(() => {
    const map = new Map<number, any>()
    orgScopes?.forEach((scope: any) => map.set(scope.id, scope))
    return map
  }, [orgScopes])

  const buildScopeLabel = (scope: any): string => {
    const parts: string[] = []
    let current = scope
    let safety = 0
    while (current && safety < 6) {
      parts.unshift(current.name)
      current = current.parentId ? scopesById.get(current.parentId) : null
      safety += 1
    }
    return parts.join(' > ')
  }

  const areaScopes = (orgScopes || [])
    .filter((scope: any) => scope.type === 'area' && scope.active !== 0 && scope.active !== false)
    .map((scope: any) => ({ ...scope, label: buildScopeLabel(scope) }))
    .sort((a: any, b: any) => String(a.label).localeCompare(String(b.label)))

  const scopeWeightMap = useMemo(() => {
    const map = new Map<number, number>()
    ;(formData.scopeWeights || []).forEach((entry) => {
      if (Number.isFinite(Number(entry.scopeId))) {
        map.set(Number(entry.scopeId), Number(entry.weight) || 0)
      }
    })
    return map
  }, [formData.scopeWeights])

  const updateScopeWeight = (scopeId: number, weight: number) => {
    const next = new Map(scopeWeightMap)
    next.set(scopeId, Number(weight) || 0)
    setFormData({
      ...formData,
      scopeWeights: Array.from(next.entries()).map(([id, w]) => ({ scopeId: id, weight: w })),
    })
  }

  const totalScopeWeight = useMemo(() => {
    return Array.from(scopeWeightMap.values()).reduce((sum, w) => sum + (Number(w) || 0), 0)
  }, [scopeWeightMap])

  const createMutation = useMutation(
    async (data: Partial<KPI>) => {
      const response = await api.post('/kpis', data)
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('kpis')
        onSuccess?.()
        onClose()
      },
    }
  )

  const updateMutation = useMutation(
    async (data: Partial<KPI>) => {
      const response = await api.put(`/kpis/${kpi?.id}`, data)
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('kpis')
        onSuccess?.()
        onClose()
      },
    }
  )

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name?.trim()) {
      newErrors.name = t('form.errors.name_required')
    }

    if (!formData.type) {
      newErrors.type = t('form.errors.type_required')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      return
    }

    const submitData = {
      ...formData,
      macroKPIId: formData.macroKPIId || undefined,
      description: formData.description || undefined,
      criteria: formData.criteria || undefined,
      formula: formData.formula?.trim() || undefined,
      direction:
        formData.direction ||
        (formData.type === 'sla' ? 'reduction' : 'growth'),
    }

    if (kpi?.id) {
      updateMutation.mutate(submitData)
    } else {
      createMutation.mutate(submitData)
    }
  }

  const availableMacroKPIs = kpis?.filter((item) => item.id !== kpi?.id) || []

  const togglePeriod = (pid: number, checked: boolean) => {
    const current = new Set(formData.periodIds || [])
    if (checked) current.add(pid)
    else current.delete(pid)
    setFormData({ ...formData, periodIds: Array.from(current) })
  }

  return (
    <div
      className="modal-overlay"
      onPointerDown={markOverlayPointerDown}
      onClick={(e) => closeOnOverlayClick(e, onClose)}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{kpi?.id ? t('form.title_edit') : t('form.title_create')}</h2>
          <button className="close-button" onClick={onClose}>
            x
          </button>
        </div>

        <form onSubmit={handleSubmit} className="kpi-form">
          <div className="form-group">
            <label htmlFor="name">{t('form.name_label')}</label>
            <input
              type="text"
              id="name"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('form.name_placeholder')}
              className={errors.name ? 'error' : ''}
            />
            {errors.name && <span className="error-message">{errors.name}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="description">{t('form.description_label')}</label>
            <textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={t('form.description_placeholder')}
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="type">{t('form.type_label')}</label>
              <select
                id="type"
                value={formData.type || 'value'}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    type: e.target.value as KPI['type'],
                    direction: e.target.value === 'sla' ? 'reduction' : formData.direction || 'growth',
                  })
                }
                className={errors.type ? 'error' : ''}
              >
                <option value="manual">Manual</option>
                <option value="count">Count</option>
                <option value="ratio">Ratio</option>
                <option value="sla">SLA</option>
                <option value="value">Value</option>
              </select>
              {errors.type && <span className="error-message">{errors.type}</span>}
              <small className="form-hint">{t('form.type_hint')}</small>
            </div>

            <div className="form-group">
              <label htmlFor="direction">{t('form.direction_label')}</label>
              <select
                id="direction"
                value={formData.direction || (formData.type === 'sla' ? 'reduction' : 'growth')}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    direction: e.target.value as KPI['direction'],
                  })
                }
              >
                <option value="growth">{t('form.direction_growth')}</option>
                <option value="reduction">{t('form.direction_reduction')}</option>
                <option value="exact">{t('form.direction_exact')}</option>
              </select>
              <small className="form-hint">{t('form.direction_hint')}</small>
            </div>

            <div className="form-group">
              <label htmlFor="macroKPIId">{t('form.macro_label')}</label>
              <select
                id="macroKPIId"
                value={formData.macroKPIId || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    macroKPIId: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
              >
                <option value="">{t('form.macro_none')}</option>
                {availableMacroKPIs.map((macroKPI) => (
                  <option key={macroKPI.id} value={macroKPI.id}>
                    {macroKPI.name}
                  </option>
                ))}
              </select>
              <span className="helper-text">{t('form.macro_hint')}</span>
            </div>
          </div>

          {/* Áreas removidas del formulario: se definen en Asignaciones (scopes/colaboradores). */}

          <div className="form-group">
            <label>{t('form.periods_label')}</label>
            <div className="checkbox-list">
              {periods?.map((p) => (
                <label key={p.id} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={formData.periodIds?.includes(p.id) || false}
                    onChange={(e) => togglePeriod(p.id, e.target.checked)}
                  />
                  <span>{p.name}</span>
                </label>
              ))}
            </div>
            <small className="form-hint">{t('form.periods_hint')}</small>
          </div>

          <div className="form-group">
            <label>{t('form.scope_weights_label')}</label>
            <div className="scope-weights">
              {areaScopes.length === 0 ? (
                <div className="form-hint">{t('form.scope_weights_no_areas')}</div>
              ) : (
                areaScopes.map((scope) => (
                  <div key={scope.id} className="scope-weight-row">
                    <span className="scope-label">{scope.label}</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={scopeWeightMap.get(scope.id) ?? ''}
                      onChange={(e) => updateScopeWeight(scope.id, Number(e.target.value))}
                      placeholder={t('form.scope_weights_placeholder')}
                    />
                  </div>
                ))
              )}
            </div>
            <small className="form-hint">{t('form.scope_weights_hint')}</small>
            {totalScopeWeight > 0 && (
              <small className="form-hint">{t('form.scope_weights_total', { value: totalScopeWeight.toFixed(1) })}</small>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="criteria">{t('form.criteria_label')}</label>
            <textarea
              id="criteria"
              value={formData.criteria || ''}
              onChange={(e) => setFormData({ ...formData, criteria: e.target.value })}
              placeholder={t('form.criteria_placeholder')}
              rows={3}
            />
            <small className="form-hint">{t('form.criteria_hint')}</small>
          </div>

          <div className="form-group">
            <label htmlFor="formula">
              {t('form.formula_label')}
              <span className="formula-help-icon" title={t('form.formula_help_title')}>??</span>
            </label>
            <textarea
              id="formula"
              value={formData.formula || ''}
              onChange={(e) => setFormData({ ...formData, formula: e.target.value })}
              placeholder={t('form.formula_placeholder')}
              rows={3}
              className={errors.formula ? 'error' : ''}
            />
            {errors.formula && <span className="error-message">{errors.formula}</span>}
            <small className="form-hint">
              <strong>{t('form.formula_vars_label')}:</strong> <code>target</code>, <code>actual</code>
              <br />
              <strong>{t('form.formula_ops_label')}:</strong> +, -, *, /, ( )
              <br />
              <strong>{t('form.formula_examples_label')}:</strong>
              <br />
              ➜ {t('direction.growth')}: <code>(actual / target) * 100</code>
              <br />
              ➜ {t('direction.reduction')}: <code>(target / actual) * 100</code>
              <br />
              ➜ {t('direction.exact')}: <code>100 - (Math.abs(actual - target) / target) * 100</code>
              <br />
              <em>{t('form.formula_hint')}</em>
            </small>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('form.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={createMutation.isLoading || updateMutation.isLoading}>
              {createMutation.isLoading || updateMutation.isLoading
                ? t('form.saving')
                : kpi?.id
                ? t('form.update')
                : t('form.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
