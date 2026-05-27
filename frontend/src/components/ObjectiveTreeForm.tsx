/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { ObjectiveTree, KPI, ScopeKPI } from '../types'
import { closeOnOverlayClick, markOverlayPointerDown } from '../utils/modal'
import './ObjectiveTreeForm.css'

interface ObjectiveTreeFormProps {
  objective?: ObjectiveTree
  onClose: () => void
  onSuccess?: () => void
}

export default function ObjectiveTreeForm({
  objective,
  onClose,
  onSuccess,
}: ObjectiveTreeFormProps) {
  const { t } = useTranslation(['okr', 'common'])
  const [formData, setFormData] = useState<Partial<ObjectiveTree>>({
    name: objective?.name || '',
    level: objective?.level || 'individual',
    parentId: objective?.parentId || undefined,
    kpis: objective?.kpis || [],
  })

  const [selectedKpiIds, setSelectedKpiIds] = useState<number[]>(
    objective?.kpis?.map((k) => k.id) || []
  )
  const [selectedScopeKpiIds, setSelectedScopeKpiIds] = useState<number[]>(
    objective?.scopeKpis?.map((scopeKpi) => scopeKpi.id) || []
  )

  const [errors, setErrors] = useState<Record<string, string>>({})

  const queryClient = useQueryClient()

  // Obtener lista de objetivos para el selector de padre
  const { data: objectives } = useQuery<ObjectiveTree[]>(
    'objective-trees',
    async () => {
      const response = await api.get('/objective-trees')
      return response.data
    },
    {
      retry: false,
    }
  )

  // Obtener lista de KPIs
  const { data: kpis } = useQuery<KPI[]>(
    'kpis',
    async () => {
      const response = await api.get('/kpis')
      return response.data
    },
    {
      retry: false,
    }
  )

  const { data: scopeKpis } = useQuery<ScopeKPI[]>(
    'objective-tree-scope-kpis',
    async () => {
      const response = await api.get('/scope-kpis')
      return response.data
    },
    {
      retry: false,
    }
  )

  const createMutation = useMutation(
    async (data: any) => {
      const response = await api.post('/objective-trees', data)
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('objective-trees')
        onSuccess?.()
        onClose()
      },
    }
  )

  const updateMutation = useMutation(
    async (data: any) => {
      const response = await api.put(`/objective-trees/${objective?.id}`, data)
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('objective-trees')
        onSuccess?.()
        onClose()
      },
    }
  )

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name?.trim()) {
      newErrors.name = t('okr:tree_form.errors.name_required')
    }

    if (!formData.level) {
      newErrors.level = t('okr:tree_form.errors.level_required')
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
      name: formData.name,
      level: formData.level,
      parentId: formData.parentId || null,
      kpiIds: selectedKpiIds,
      scopeKpiIds: selectedScopeKpiIds,
    }

    if (objective?.id) {
      updateMutation.mutate(submitData)
    } else {
      createMutation.mutate(submitData)
    }
  }

  const handleKpiToggle = (kpiId: number) => {
    if (selectedKpiIds.includes(kpiId)) {
      setSelectedKpiIds(selectedKpiIds.filter((id) => id !== kpiId))
    } else {
      setSelectedKpiIds([...selectedKpiIds, kpiId])
    }
  }

  const handleScopeKpiToggle = (scopeKpiId: number) => {
    if (selectedScopeKpiIds.includes(scopeKpiId)) {
      setSelectedScopeKpiIds(selectedScopeKpiIds.filter((id) => id !== scopeKpiId))
    } else {
      setSelectedScopeKpiIds([...selectedScopeKpiIds, scopeKpiId])
    }
  }

  // Filtrar objetivos para el selector de padre (excluir el actual si está editando)
  const availableParents = objectives?.filter(
    (o) => o.id !== objective?.id
  ) || []

  // Filtrar por nivel para mostrar solo padres válidos según jerarquía
  const levelHierarchy: Record<string, string[]> = {
    company: [],
    direction: ['company'],
    management: ['company', 'direction'],
    leadership: ['company', 'direction', 'management'],
    individual: ['company', 'direction', 'management', 'leadership'],
  }

  const validParents = availableParents.filter((parent) => {
    const validLevels = levelHierarchy[formData.level || 'individual'] || []
    return validLevels.includes(parent.level)
  })
  const levelLabel = (level: string) =>
    t(`okr:tree_form.levels.${level}`, { defaultValue: level })
  const isSaving = createMutation.isLoading || updateMutation.isLoading

  return (
    <div
      className="modal-overlay"
      onPointerDown={markOverlayPointerDown}
      onClick={(e) => closeOnOverlayClick(e, onClose)}
    >
      <div className="modal-content objective-tree-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {objective?.id ? t('okr:tree_form.title_edit') : t('okr:tree_form.title_new')}
          </h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="objective-tree-form">
          <div className="form-group">
            <label htmlFor="name">{t('okr:tree_form.fields.name')}</label>
            <input
              type="text"
              id="name"
              value={formData.name || ''}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder={t('okr:tree_form.fields.name_placeholder')}
              className={errors.name ? 'error' : ''}
            />
            {errors.name && (
              <span className="error-message">{errors.name}</span>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="level">{t('okr:tree_form.fields.level')}</label>
              <select
                id="level"
                value={formData.level || 'individual'}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    level: e.target.value as ObjectiveTree['level'],
                    parentId: undefined, // Reset parent cuando cambia el nivel
                  })
                }
                className={errors.level ? 'error' : ''}
              >
                <option value="company">{levelLabel('company')}</option>
                <option value="direction">{levelLabel('direction')}</option>
                <option value="management">{levelLabel('management')}</option>
                <option value="leadership">{levelLabel('leadership')}</option>
                <option value="individual">{levelLabel('individual')}</option>
              </select>
              {errors.level && (
                <span className="error-message">{errors.level}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="parentId">{t('okr:tree_form.fields.parent')}</label>
              <select
                id="parentId"
                value={formData.parentId || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    parentId: e.target.value
                      ? parseInt(e.target.value)
                      : undefined,
                  })
                }
              >
                <option value="">{t('okr:tree_form.fields.parent_placeholder')}</option>
                {validParents.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    [{levelLabel(parent.level)}] {parent.name}
                  </option>
                ))}
              </select>
              <small className="form-hint">
                {t('okr:tree_form.fields.parent_hint')}
              </small>
            </div>
          </div>

          <div className="form-group">
            <label>{t('okr:tree_form.fields.kpis')}</label>
            <div className="kpi-selection">
              {kpis && kpis.length > 0 ? (
                kpis.map((kpi) => (
                  <label key={kpi.id} className="kpi-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedKpiIds.includes(kpi.id)}
                      onChange={() => handleKpiToggle(kpi.id)}
                    />
                    <span>
                      {kpi.name}
                      {kpi.macroKPIId && (
                        <span className="macro-indicator">
                          {' '}
                          ({t('okr:tree_form.badges.macro', { id: kpi.macroKPIId })})
                        </span>
                      )}
                    </span>
                  </label>
                ))
              ) : (
                <p className="no-kpis">{t('okr:tree_form.empty.kpis')}</p>
              )}
            </div>
            <small className="form-hint">
              {t('okr:tree_form.fields.kpis_hint')}
            </small>
          </div>

          <div className="form-group">
            <label>{t('okr:tree_form.fields.scope_kpis')}</label>
            <div className="kpi-selection">
              {scopeKpis && scopeKpis.length > 0 ? (
                scopeKpis.map((scopeKpi) => (
                  <label key={scopeKpi.id} className="kpi-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedScopeKpiIds.includes(scopeKpi.id)}
                      onChange={() => handleScopeKpiToggle(scopeKpi.id)}
                    />
                    <span>
                      {scopeKpi.name}
                      <span className="macro-indicator">
                        {' '}
                        ({scopeKpi.orgScopeName || t('okr:tree_form.badges.scope', { id: scopeKpi.orgScopeId })})
                      </span>
                    </span>
                  </label>
                ))
              ) : (
                <p className="no-kpis">{t('okr:tree_form.empty.scope_kpis')}</p>
              )}
            </div>
            <small className="form-hint">
              {t('okr:tree_form.fields.scope_kpis_hint')}
            </small>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('common:cancel')}
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSaving}
            >
              {isSaving
                ? t('okr:tree_form.actions.saving')
                : objective?.id
                ? t('okr:tree_form.actions.update')
                : t('okr:tree_form.actions.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
