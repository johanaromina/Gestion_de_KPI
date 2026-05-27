/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient, useQuery } from 'react-query'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from 'react-i18next'
import { closeOnOverlayClick, markOverlayPointerDown } from '../utils/modal'
import { resolveDirection, calculateVariationPercent, supportsNegativeActual } from '../utils/kpi'
import { useDialog } from './Dialog'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import './CollaboratorKPIForm.css'

const toNumber = (value: any): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const ASSIGNMENT_ACTION_API_ERROR_KEYS: Record<string, string> = {
  ASSIGNMENT_NOT_FOUND: 'assignments:error.api_errors.not_found',
  ASSIGNMENT_CLOSE_FORBIDDEN: 'assignments:error.api_errors.close_forbidden',
  ASSIGNMENT_ALREADY_CLOSED: 'assignments:error.api_errors.already_closed',
  ASSIGNMENT_REOPEN_FORBIDDEN: 'assignments:error.api_errors.reopen_forbidden',
  ASSIGNMENT_NOT_CLOSED: 'assignments:error.api_errors.not_closed',
}

const ASSIGNMENT_PLAN_API_ERROR_KEYS: Record<string, string> = {
  ASSIGNMENT_PLAN_IDENTIFIERS_REQUIRED: 'assignments:form.api_errors.plan_identifiers_required',
  ASSIGNMENT_PLAN_CONFIG_FORBIDDEN: 'assignments:form.api_errors.plan_config_forbidden',
  ASSIGNMENT_PLAN_ITEMS_REQUIRED: 'assignments:form.api_errors.plan_items_required',
  ASSIGNMENT_PLAN_TARGET_NEGATIVE: 'assignments:form.api_errors.plan_target_negative',
  ASSIGNMENT_PLAN_WEIGHT_OVERRIDE_INVALID: 'assignments:form.api_errors.plan_weight_override_invalid',
}

interface CollaboratorKPI {
  id?: number
  collaboratorId: number
  kpiId: number
  periodId: number
  calendarProfileId?: number | null
  subPeriodId?: number
  target: number
  actual?: number
  weight: number
  status: 'draft' | 'proposed' | 'approved' | 'closed'
  comments?: string
  dataSource?: string
  sourceConfig?: string
  criteriaText?: string
  evidenceUrl?: string
  curatorAssignee?: string
  curationStatus?: 'pending' | 'in_review' | 'approved' | 'rejected' | 'changes_requested'
  inputMode?: 'manual' | 'import' | 'auto'
  createCriteriaVersion?: boolean
}

interface CollaboratorKPIFormProps {
  assignment?: CollaboratorKPI
  periodId: number
  collaboratorId?: number
  onClose: () => void
  onSuccess?: () => void
}

export default function CollaboratorKPIForm({
  assignment,
  periodId,
  collaboratorId,
  onClose,
  onSuccess,
}: CollaboratorKPIFormProps) {
  const [formData, setFormData] = useState<CollaboratorKPI>({
    collaboratorId: assignment?.collaboratorId || collaboratorId || 0,
    kpiId: assignment?.kpiId || 0,
    periodId: assignment?.periodId || periodId,
    calendarProfileId: (assignment as any)?.calendarProfileId ?? null,
    subPeriodId: assignment?.subPeriodId,
    target: assignment?.target ?? 0,
    actual: assignment?.actual,
    weight: assignment?.weight ?? 0,
    status: assignment?.status || 'draft',
    comments: assignment?.comments || '',
    dataSource: assignment?.dataSource || 'Manual',
    sourceConfig: assignment?.sourceConfig || '',
    criteriaText: assignment?.criteriaText || '',
    evidenceUrl: assignment?.evidenceUrl || '',
    curatorAssignee: assignment?.curatorAssignee || 'Data Curator',
    curationStatus: assignment?.curationStatus || 'pending',
    inputMode: assignment?.inputMode || 'manual',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [criteriaDirty, setCriteriaDirty] = useState(false)
  const [weightDirty, setWeightDirty] = useState(false)
  const [criteriaPrefilled, setCriteriaPrefilled] = useState(false)

  const { t } = useTranslation('assignments')
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const dialog = useDialog()
  const isReadOnlyCollaborator = user?.role === 'collaborator'
  const canCurate =
    user?.role === 'admin' ||
    user?.role === 'director' ||
    user?.permissions?.includes('curation.manage')

  const dataSourceOptions = ['Jira', 'Xray', 'DB MySQL', 'CSV upload', 'Manual', 'Otro']

  const { data: collaborators } = useQuery('collaborators', async () => {
    const response = await api.get('/collaborators')
    return response.data
  })

  const selectedCollaborator = collaborators?.find((c: any) => c.id === formData.collaboratorId)
  const collaboratorArea = selectedCollaborator?.area
  const [selectedScopeId, setSelectedScopeId] = useState<number | null>(null)

  const { data: orgScopes } = useQuery('org-scopes', async () => {
    const response = await api.get('/org-scopes')
    return response.data
  })

  const { data: calendarProfiles } = useQuery(
    'calendar-profiles',
    async () => {
      const response = await api.get('/calendar-profiles')
      return response.data
    },
    { staleTime: 5 * 60 * 1000 }
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

  const selectedScope = selectedScopeId ? scopesById.get(selectedScopeId) : null
  const selectedScopeName = selectedScope?.name || ''
  const selectedCalendarProfileId = selectedScope?.calendarProfileId || null
  const selectedCalendarProfile = useMemo(() => {
    if (!calendarProfiles || !selectedCalendarProfileId) return null
    return calendarProfiles.find((profile: any) => Number(profile.id) === Number(selectedCalendarProfileId)) || null
  }, [calendarProfiles, selectedCalendarProfileId])

  const collaboratorsByScope = useMemo(() => {
    if (!collaborators) return []
    if (!selectedScopeId) return collaborators
    return collaborators.filter(
      (c: any) => c.orgScopeId === selectedScopeId || (!c.orgScopeId && c.area === selectedScopeName)
    )
  }, [collaborators, selectedScopeId, selectedScopeName])

  useEffect(() => {
    if (selectedScopeId) return
    if (selectedCollaborator?.orgScopeId) {
      setSelectedScopeId(selectedCollaborator.orgScopeId)
      return
    }
    if (!collaboratorArea) return
    const scopeMatch = areaScopes.find((scope: any) => scope.name === collaboratorArea)
    if (scopeMatch) {
      setSelectedScopeId(scopeMatch.id)
    }
  }, [selectedScopeId, selectedCollaborator?.orgScopeId, collaboratorArea, areaScopes])

  const { data: kpis } = useQuery(
    ['kpis'],
    async () => {
      const response = await api.get('/kpis')
      return response.data
    },
    {
      // Siempre activo; si no hay área, traerá todos.
      enabled: true,
    }
  )

  const selectedKpi = useMemo(() => {
    if (!kpis || !formData.kpiId) return null
    return kpis.find((k: any) => k.id === formData.kpiId) || null
  }, [kpis, formData.kpiId])
  const negativeActualAllowed = supportsNegativeActual(
    selectedKpi?.direction,
    selectedKpi?.formula,
    selectedKpi?.type
  )

  const scopeWeightForSelection = useMemo(() => {
    if (!selectedKpi || !selectedScopeId) return null
    const scopeWeights = selectedKpi.scopeWeights || []
    return scopeWeights.find((entry: any) => Number(entry.scopeId) === Number(selectedScopeId)) || null
  }, [selectedKpi, selectedScopeId])

  useEffect(() => {
    if (!formData.kpiId || !selectedKpi) return
    const nextDataSource = formData.dataSource || selectedKpi.defaultDataSource || 'Manual'
    const kpiCriteria = selectedKpi.criteria || selectedKpi.defaultCriteriaTemplate || ''

    if (!assignment?.id) {
      if (!formData.dataSource || formData.dataSource === 'Manual') {
        setFormData((prev) => ({
          ...prev,
          dataSource: nextDataSource,
        }))
      }
    }

    if (!criteriaDirty && !formData.criteriaText?.trim() && kpiCriteria) {
      setFormData((prev) => ({
        ...prev,
        criteriaText: kpiCriteria,
      }))
      setCriteriaPrefilled(true)
    }
  }, [assignment?.id, formData.kpiId, selectedKpi, formData.dataSource, formData.criteriaText, criteriaDirty])

  useEffect(() => {
    if (assignment?.id) return
    if (!selectedScopeId || !selectedKpi) return
    if (weightDirty) return
    const match = scopeWeightForSelection
    if (!match) return
    if (Number(formData.weight || 0) > 0) return
    setFormData((prev) => ({
      ...prev,
      weight: Number(match.weight) || 0,
    }))
  }, [assignment?.id, selectedScopeId, selectedKpi, formData.weight, weightDirty, scopeWeightForSelection])

  useEffect(() => {
    if (!selectedScopeId) return
    setFormData((prev) => ({
      ...prev,
      calendarProfileId: selectedCalendarProfileId,
    }))
  }, [selectedScopeId, selectedCalendarProfileId])

  useEffect(() => {
    if (assignment?.id) return
    if (!selectedScopeId) return
    if (!formData.collaboratorId) return
    const collaborator = collaborators?.find((c: any) => c.id === formData.collaboratorId)
    if (collaborator?.orgScopeId && collaborator.orgScopeId !== selectedScopeId) {
      setFormData((prev) => ({ ...prev, collaboratorId: 0, kpiId: 0 }))
      return
    }
    if (!collaborator?.orgScopeId && collaborator?.area && collaborator.area !== selectedScopeName) {
      setFormData((prev) => ({ ...prev, collaboratorId: 0, kpiId: 0 }))
    }
  }, [assignment?.id, selectedScopeId, selectedScopeName, formData.collaboratorId, collaborators])

  const { data: subPeriods } = useQuery(
    ['sub-periods', periodId, selectedCalendarProfileId],
    async () => {
      const response = await api.get(`/periods/${periodId}/sub-periods`, {
        params: {
          calendarProfileId: selectedCalendarProfileId || undefined,
        },
      })
      return response.data
    },
    { enabled: !!periodId }
  )

  const { data: periodInfo } = useQuery(
    ['period', periodId],
    async () => {
      const response = await api.get(`/periods/${periodId}`)
      return response.data
    },
    { enabled: !!periodId }
  )

  const isPeriodClosed = periodInfo?.status === 'closed'
  const canConfig = useMemo(
    () =>
      !!(
        user?.hasSuperpowers ||
        user?.permissions?.includes('config.manage') ||
        user?.permissions?.includes('config.view')
      ),
    [user]
  )
  const canEditPlan = canConfig && !isReadOnlyCollaborator
  const canOverrideWeight =
    user?.role === 'admin' ||
    user?.role === 'director' ||
    user?.permissions?.includes('curation.manage') ||
    user?.permissions?.includes('config.manage')

  const { data: existingAssignments } = useQuery(
    ['collaborator-kpis', formData.collaboratorId, periodId],
    async () => {
      if (!formData.collaboratorId || !periodId) return []
      const response = await api.get(
        `/collaborator-kpis/collaborator/${formData.collaboratorId}`,
        { params: { periodId } }
      )
      return response.data
    },
    { enabled: !!formData.collaboratorId && !!periodId }
  )

  const createMutation = useMutation(
    async (data: CollaboratorKPI) => {
      const response = await api.post('/collaborator-kpis', data)
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('collaborator-kpis')
        queryClient.invalidateQueries('collaborators')
        onSuccess?.()
        onClose()
      },
    }
  )

  const updateMutation = useMutation(
    async (data: CollaboratorKPI) => {
      if (!assignment?.id) throw new Error('Falta ID de asignación')
      const hasCriteriaPayload = [data.criteriaText, data.dataSource, data.sourceConfig, data.evidenceUrl].some(
        (value) => String(value || '').trim().length > 0
      )
      const shouldCreateCriteriaVersion = Boolean(data.createCriteriaVersion || (criteriaDirty && hasCriteriaPayload))
      const nextCurationStatus =
        shouldCreateCriteriaVersion && !canCurate
          ? 'in_review'
          : data.curationStatus
      const payload = {
        collaboratorId: assignment.collaboratorId,
        kpiId: assignment.kpiId,
        periodId: assignment.periodId,
        calendarProfileId: (assignment as any).calendarProfileId ?? formData.calendarProfileId ?? null,
        subPeriodId: data.subPeriodId,
        target: data.target ?? assignment.target ?? 0,
        weight: data.weight ?? assignment.weight ?? 0,
        status: data.status,
        comments: data.comments,
        actual: data.actual,
        dataSource: data.dataSource,
        sourceConfig: data.sourceConfig,
        criteriaText: data.criteriaText,
        evidenceUrl: data.evidenceUrl,
        curatorAssignee: data.curatorAssignee,
        curationStatus: nextCurationStatus,
        inputMode: data.inputMode,
        createCriteriaVersion: shouldCreateCriteriaVersion,
      }
      const response = await api.put(`/collaborator-kpis/${assignment.id}`, payload)
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('collaborator-kpis')
        onSuccess?.()
        onClose()
      },
    }
  )

  const closeAssignmentMutation = useMutation(
    async () => {
      if (!assignment?.id) return
      await api.post(`/collaborator-kpis/${assignment.id}/close`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('collaborator-kpis')
        onSuccess?.()
        onClose()
      },
      onError: (error: any) => {
        void dialog.alert(
          resolveApiErrorMessage(error, t, {
            codeMap: ASSIGNMENT_ACTION_API_ERROR_KEYS,
            fallbackKey: 'error.close_assignment',
          }),
          { title: t('common:error_title'), variant: 'danger' }
        )
      },
    }
  )

  const reopenAssignmentMutation = useMutation(
    async () => {
      if (!assignment?.id) return
      await api.post(`/collaborator-kpis/${assignment.id}/reopen`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('collaborator-kpis')
        onSuccess?.()
        onClose()
      },
      onError: (error: any) => {
        void dialog.alert(
          resolveApiErrorMessage(error, t, {
            codeMap: ASSIGNMENT_ACTION_API_ERROR_KEYS,
            fallbackKey: 'error.reopen_assignment',
          }),
          { title: t('common:error_title'), variant: 'danger' }
        )
      },
    }
  )

  const calculateTotalWeight = (): number => {
    if (!existingAssignments) return toNumber(formData.weight)

    // Solo cuenta filas resumen (sin subPeriodId) para no inflar el total con asignaciones de subperíodo
    const otherAssignments = existingAssignments.filter(
      (a: any) => a.id !== assignment?.id && (a.subPeriodId === null || a.subPeriodId === undefined)
    )
    const otherWeights = otherAssignments.reduce((sum: number, a: any) => sum + toNumber(a.weight), 0)
    return otherWeights + toNumber(formData.weight)
  }

  const isAssignmentClosed = assignment?.status === 'closed'
  const canCloseAssignment =
    Boolean(assignment?.id) && !isAssignmentClosed && !isReadOnlyCollaborator
  const canReopenAssignment =
    Boolean(assignment?.id) &&
    isAssignmentClosed &&
    (user?.role === 'admin' || user?.role === 'director' || user?.hasSuperpowers)

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    const weightValue = toNumber(formData.weight)
    const targetValue = toNumber(formData.target)
    const actualValue =
      formData.actual !== undefined && formData.actual !== null ? Number(formData.actual) : null

    if (isPeriodClosed && !assignment?.id) {
      newErrors.periodId = t('form.error_no_period')
    }

    if (!formData.collaboratorId || formData.collaboratorId === 0) {
      newErrors.collaboratorId = t('form.error_no_collaborator')
    }

    if (!formData.kpiId || formData.kpiId === 0) {
      newErrors.kpiId = t('form.error_no_kpi')
    }

    if (!assignment?.id) {
      if (!targetValue || targetValue <= 0) {
        newErrors.target = t('form.error_target_positive')
      }

      if (!weightValue || weightValue <= 0) {
        newErrors.weight = t('form.error_weight_positive')
      }

      if (weightValue > 100) {
        newErrors.weight = t('form.error_weight_max')
      }

      // La validación de suma de pesos solo aplica a asignaciones resumen (sin subperíodo)
      // Las asignaciones de subperíodo tienen su propio cálculo de peso y no se suman al total general
      if (!formData.subPeriodId) {
        const totalWeight = toNumber(calculateTotalWeight())
        if (totalWeight > 100) {
          newErrors.weight = t('form.error_weight_sum', { value: totalWeight.toFixed(1) })
        }
      }
    }

    if (assignment?.id) {
      if (actualValue === null || Number.isNaN(actualValue)) {
        newErrors.actual = t('form.error_actual_required')
      } else if (actualValue < 0 && !negativeActualAllowed) {
        newErrors.actual = t('form.error_actual_negative')
      }
    }

    if (!formData.dataSource) {
      newErrors.dataSource = t('form.error_no_source')
    }

    if (!formData.criteriaText?.trim()) {
      newErrors.criteriaText = t('form.error_no_criteria')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (isReadOnlyCollaborator) return

    if (!validate()) return

    if (assignment?.id) {
      updateMutation.mutate(formData)
    } else {
      createMutation.mutate(formData)
    }
  }

  const totalWeight = toNumber(calculateTotalWeight())
  const remainingWeight = 100 - (totalWeight - toNumber(formData.weight))

  // --- PLAN MENSUAL POR SUBPERIODO ---
  const shouldLoadPlan = !!formData.collaboratorId && !!formData.kpiId && !!periodId
  const { data: planData, refetch: refetchPlan } = useQuery(
    ['plan', formData.collaboratorId, formData.kpiId, periodId],
    async () => {
      const res = await api.get(
        `/collaborator-kpis/plan/${formData.collaboratorId}/${formData.kpiId}/${periodId}`
      )
      return res.data
    },
    { enabled: shouldLoadPlan }
  )

  type PlanRow = {
    subPeriodId: number
    name: string
    target: number | ''
    weightOverride: number | ''
    subPeriodWeight: number
    actual: number | ''
  }
  const [planRows, setPlanRows] = useState<PlanRow[]>([])
  const [planErrors, setPlanErrors] = useState<string | null>(null)
  const [weightOverrideEnabled, setWeightOverrideEnabled] = useState(false)

  useEffect(() => {
    if (!subPeriods || !Array.isArray(subPeriods)) return
    const planMap = new Map<number, { target: number; weightOverride: number | null }>()
    if (Array.isArray(planData)) {
      for (const p of planData) {
        planMap.set(p.subPeriodId, {
          target: Number(p.target ?? 0),
          weightOverride: p.weightOverride !== null && p.weightOverride !== undefined ? Number(p.weightOverride) : null,
        })
      }
    }
    const totalWeight = subPeriods.reduce((acc: number, sp: any) => acc + Number(sp.weight || 0), 0)
    const useUniform = totalWeight < 99.5 || totalWeight > 100.5
    const uniformWeight = subPeriods.length > 0 ? 100 / subPeriods.length : 0

    const merged = subPeriods.map((sp: any) => {
      const plan = planMap.get(sp.id)
      const subPeriodWeight = useUniform ? uniformWeight : Number(sp.weight || 0)
      const actualValue =
        existingAssignments?.find(
          (a: any) => a.kpiId === formData.kpiId && a.subPeriodId === sp.id
        )?.actual ?? ''
      return {
        subPeriodId: sp.id,
        name: sp.name,
        target: plan?.target ?? '',
        weightOverride: plan?.weightOverride ?? '',
        subPeriodWeight,
        actual: actualValue === null || actualValue === undefined ? '' : Number(actualValue),
      }
    })
    setPlanRows(merged as any)
  }, [planData, subPeriods, existingAssignments, formData.kpiId])

  const planWeightTotal = planRows.reduce((acc, r) => acc + (Number(r.subPeriodWeight) || 0), 0)
  const planTargetTotal = planRows.reduce((acc, r) => acc + (Number(r.target) || 0), 0)
  const planActualTotal = planRows.reduce((acc, r) => acc + (Number(r.actual) || 0), 0)
  const planProgressTotal = (() => {
    const kpiDirection = resolveDirection(undefined, selectedKpi?.direction, selectedKpi?.type)
    let weightedSum = 0
    let weightSum = 0
    for (const r of planRows) {
      if (r.actual === '' || r.target === '' || !r.target) continue
      const v = calculateVariationPercent(kpiDirection, Number(r.target), Number(r.actual))
      if (v === null) continue
      const w = Number(r.subPeriodWeight) || 0
      weightedSum += v * w
      weightSum += w
    }
    return weightSum > 0 ? weightedSum / weightSum : 0
  })()

  const upsertPlanMutation = useMutation(
    async (items: PlanRow[]) => {
      const body = {
        items: items.map((r) => ({
          subPeriodId: r.subPeriodId,
          target: Number(r.target) || 0,
          weightOverride: weightOverrideEnabled ? Number(r.weightOverride) || null : null,
        })),
      }
      return api.post(
        `/collaborator-kpis/plan/${formData.collaboratorId}/${formData.kpiId}/${periodId}`,
        body
      )
    },
    {
      onSuccess: () => {
        refetchPlan()
        queryClient.invalidateQueries(['collaborator-kpis', formData.collaboratorId, periodId])
      },
      onError: (err: any) => {
        setPlanErrors(
          resolveApiErrorMessage(err, t, {
            codeMap: ASSIGNMENT_PLAN_API_ERROR_KEYS,
            fallbackKey: 'form.plan_save_error',
          })
        )
      },
    }
  )

  // Prefill target/peso desde el plan mensual cuando se selecciona un subperiodo (solo en creación)
  useEffect(() => {
    if (assignment?.id) return
    if (!formData.subPeriodId) return
    const row = planRows.find((r) => r.subPeriodId === formData.subPeriodId)
    if (!row) return
    setFormData((prev) => ({
      ...prev,
      target: row.target !== '' ? Number(row.target) : prev.target,
    }))
  }, [assignment?.id, formData.subPeriodId, planRows])

  return (
    <div
      className="modal-overlay"
      onPointerDown={markOverlayPointerDown}
      onClick={(e) => closeOnOverlayClick(e, onClose)}
    >
      <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{assignment?.id ? t('form.title_edit') : t('form.title_create')}</h2>
            <p className="modal-subtitle">{t('form.subtitle')}</p>
          </div>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        {isPeriodClosed && (
          <div className="period-closed-warning">
            <strong>{t('form.period_closed_prefix')}</strong>{' '}
            {assignment?.id
              ? t('form.period_closed_edit')
              : t('form.period_closed_create')}
          </div>
        )}

        {isAssignmentClosed && (
          <div className="closed-warning">
            <strong>{t('form.assignment_closed_title')}</strong>
            <p>{t('form.assignment_closed_hint')}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="collaborator-kpi-form">
          <div className="form-section-title">{t('form.section_base')}</div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label htmlFor="scopeId">{t('form.scope_label')}</label>
              <select
                id="scopeId"
                value={selectedScopeId || ''}
                onChange={(e) => {
                  const nextScopeId = e.target.value ? Number(e.target.value) : null
                  setSelectedScopeId(nextScopeId)
                  setFormData((prev) => ({
                    ...prev,
                    collaboratorId: nextScopeId ? 0 : prev.collaboratorId,
                    kpiId: nextScopeId ? 0 : prev.kpiId,
                  }))
                }}
                disabled={!!assignment?.id || isReadOnlyCollaborator}
              >
                <option value="">{t('form.scope_placeholder')}</option>
                {areaScopes.map((scope: any) => (
                  <option key={scope.id} value={scope.id}>
                    {scope.label}
                  </option>
                ))}
              </select>
              <small className="form-hint">{t('form.scope_hint')}</small>
              {selectedCalendarProfile && (
                <div className="calendar-pill">
                  {t('form.calendar_label')} {selectedCalendarProfile.name} ({selectedCalendarProfile.frequency})
                </div>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="collaboratorId">{t('form.collaborator_label')}</label>
              <select
                id="collaboratorId"
                value={formData.collaboratorId}
                onChange={(e) =>
                  {
                    const nextId = parseInt(e.target.value)
                    const nextCollaborator = collaborators?.find((c: any) => c.id === nextId)
                    if (nextCollaborator?.orgScopeId) {
                      setSelectedScopeId(nextCollaborator.orgScopeId)
                    } else if (nextCollaborator?.area) {
                      const scopeMatch = areaScopes.find((scope: any) => scope.name === nextCollaborator.area)
                      if (scopeMatch) {
                        setSelectedScopeId(scopeMatch.id)
                      }
                    }
                    setFormData({
                      ...formData,
                      collaboratorId: nextId,
                    })
                  }
                }
                disabled={!!assignment?.id || !!collaboratorId || isPeriodClosed || isReadOnlyCollaborator}
                className={errors.collaboratorId ? 'error' : ''}
              >
                <option value="0">{t('form.collaborator_placeholder')}</option>
                {collaboratorsByScope?.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name} - {c.position}
                  </option>
                ))}
              </select>
              {errors.collaboratorId && <span className="error-message">{errors.collaboratorId}</span>}
              <small className="form-hint">{t('form.collaborator_hint')}</small>
            </div>

            <div className="form-group">
              <label htmlFor="kpiId">{t('form.kpi_label')}</label>
              <select
                id="kpiId"
                value={formData.kpiId}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    kpiId: parseInt(e.target.value),
                  })
                }
                disabled={!!assignment?.id || isPeriodClosed || isReadOnlyCollaborator}
                className={errors.kpiId ? 'error' : ''}
              >
                <option value="0">{t('form.kpi_placeholder')}</option>
                {kpis?.map((k: any) => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.type})
                  </option>
                ))}
              </select>
              {errors.kpiId && <span className="error-message">{errors.kpiId}</span>}
              <small className="form-hint">{t('form.kpi_hint')}</small>
            </div>
          </div>

          <div className="form-section-title">{t('form.section_period')}</div>
          <div className="form-group">
            <label>{t('form.period_label')}</label>
            <div className="period-badge">
              {periodInfo?.name || `#${periodId}`}
              {periodInfo?.status && (
                <span className={`period-status-tag period-status-${periodInfo.status}`}>
                  {periodInfo.status === 'open' ? t('form.period_open') : periodInfo.status === 'closed' ? t('form.period_closed') : periodInfo.status}
                </span>
              )}
            </div>
          </div>

          {subPeriods && subPeriods.length > 0 && (
            <>
              <div className="form-group" style={{ marginTop: 12 }}>
                <label htmlFor="subPeriodId">
                  {t('form.subperiod_label')} <span className="field-optional">{t('form.subperiod_optional')}</span>
                </label>
                <select
                  id="subPeriodId"
                  value={formData.subPeriodId || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      subPeriodId: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  disabled={isReadOnlyCollaborator}
                >
                  <option value="">{t('form.subperiod_empty')}</option>
                  {subPeriods.map((sp: any) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name} {sp.weight ? `(${sp.weight}%)` : ''}
                    </option>
                  ))}
                </select>
                {!formData.subPeriodId && (
                  <small className="form-hint">
                    {t('form.subperiod_hint_empty')}
                  </small>
                )}
                {formData.subPeriodId && (
                  <small className="form-hint">
                    {t('form.subperiod_hint_selected')}
                  </small>
                )}
              </div>
              <div className="calendar-timeline">
                {subPeriods.map((sp: any) => (
                  <span
                    key={sp.id}
                    className={`calendar-chip ${formData.subPeriodId === sp.id ? 'selected' : sp.status === 'closed' ? 'closed' : 'open'}`}
                    title={`${sp.name}${sp.weight ? ` · ${sp.weight}%` : ''}`}
                    onClick={() => !isReadOnlyCollaborator && setFormData((prev) => ({
                      ...prev,
                      subPeriodId: prev.subPeriodId === sp.id ? undefined : sp.id,
                    }))}
                    style={{ cursor: isReadOnlyCollaborator ? 'default' : 'pointer' }}
                  >
                    {sp.name}
                  </span>
                ))}
              </div>
            </>
          )}

          {!assignment?.id && (
            <>
              <div className="form-section-title">{t('form.section_target')}</div>
              <div className="form-row">
                <div className="form-group">
                <label htmlFor="target">{t('form.target_label')}</label>
                <input
                  type="number"
                  id="target"
                  min="0"
                  step="0.01"
                  value={formData.target || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      target: parseFloat(e.target.value) || 0,
                    })
                  }
                  className={errors.target ? 'error' : ''}
                  placeholder={t('form.target_placeholder')}
                  disabled={isReadOnlyCollaborator}
                />
                {errors.target && <span className="error-message">{errors.target}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="weight">{t('form.weight_label')}</label>
                <input
                  type="number"
                  id="weight"
                  min="0"
                  max="100"
                  step="0.01"
                  value={formData.weight || ''}
                  onChange={(e) => {
                    setWeightDirty(true)
                    setFormData({
                      ...formData,
                      weight: parseFloat(e.target.value) || 0,
                    })
                  }}
                  className={errors.weight ? 'error' : ''}
                  placeholder={t('form.weight_placeholder')}
                  disabled={isReadOnlyCollaborator}
                />
                {errors.weight && <span className="error-message">{errors.weight}</span>}
                {!assignment?.id && selectedKpi && selectedScopeId && !scopeWeightForSelection && (
                  <small className="form-hint warning">
                    {t('form.weight_no_scope')}
                  </small>
                )}
                {!assignment?.id && scopeWeightForSelection && !weightDirty && (
                  <small className="form-hint">
                    {t('form.weight_preloaded')}
                  </small>
                )}
                <div className="weight-info">
                  <span className="weight-total">{t('form.weight_total', { value: totalWeight.toFixed(1) })}</span>
                  {remainingWeight >= 0 && (
                    <span className="weight-remaining">{t('form.weight_remaining', { value: remainingWeight.toFixed(1) })}</span>
                  )}
                  {totalWeight === 100 && <span className="weight-perfect">{t('form.weight_perfect')}</span>}
                  {totalWeight > 100 && (
                    <span className="weight-error">{t('form.weight_exceeds', { value: (totalWeight - 100).toFixed(1) })}</span>
                  )}
                </div>
              </div>
            </div>
            </>
          )}

          {subPeriods && subPeriods.length > 0 && formData.kpiId !== 0 && formData.collaboratorId !== 0 && !formData.subPeriodId && (
            <div className="plan-section">
              <div className="plan-header">
                <h3>{t('form.plan_title')}</h3>
                <span className="plan-helper">
                  {t('form.plan_helper')}
                </span>
              </div>
              {canOverrideWeight && (
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={weightOverrideEnabled}
                    onChange={(e) => setWeightOverrideEnabled(e.target.checked)}
                  />
                  <span>{t('form.plan_override_toggle')}</span>
                </label>
              )}
              {planErrors && <div className="error-message">{planErrors}</div>}
              <table className="plan-table">
                <thead>
                  <tr>
                    <th>{t('form.plan_table_subperiod')}</th>
                    <th>{t('form.plan_table_target')}</th>
                    <th>{t('form.plan_table_weight')}</th>
                    {weightOverrideEnabled && <th>{t('form.plan_table_override')}</th>}
                    <th>{t('form.plan_table_actual')}</th>
                    <th>{t('form.plan_table_pct')}</th>
                  </tr>
                </thead>
                <tbody>
                  {planRows.map((row) => (
                    <tr key={row.subPeriodId}>
                      <td>{row.name}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.target}
                          disabled={!canEditPlan}
                          onChange={(e) =>
                            setPlanRows((prev) =>
                              prev.map((r) =>
                                r.subPeriodId === row.subPeriodId
                                  ? { ...r, target: e.target.value === '' ? '' : parseFloat(e.target.value) }
                                  : r
                              )
                            )
                          }
                        />
                      </td>
                      <td>
                        <input type="number" value={row.subPeriodWeight.toFixed(2)} disabled />
                      </td>
                      {weightOverrideEnabled && (
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={row.weightOverride}
                            disabled={!canEditPlan || !canOverrideWeight}
                            onChange={(e) =>
                              setPlanRows((prev) =>
                                prev.map((r) =>
                                  r.subPeriodId === row.subPeriodId
                                    ? {
                                        ...r,
                                        weightOverride: e.target.value === '' ? '' : parseFloat(e.target.value),
                                      }
                                    : r
                                )
                              )
                            }
                          />
                        </td>
                      )}
                      <td>{row.actual !== '' ? Number(row.actual).toFixed(2) : '-'}</td>
                      <td>
                        {row.target && row.actual !== ''
                          ? (() => {
                              const dir = resolveDirection(undefined, selectedKpi?.direction, selectedKpi?.type)
                              const v = calculateVariationPercent(dir, Number(row.target), Number(row.actual))
                              return v !== null ? `${Math.min(100, Math.max(0, v)).toFixed(1)}%` : '-'
                            })()
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="plan-footer">
                <span>{t('form.plan_footer_weight', { value: planWeightTotal.toFixed(2) })}</span>
                <span>{t('form.plan_footer_target', { value: planTargetTotal.toFixed(2) })}</span>
                <span>{t('form.plan_footer_actual', { value: planActualTotal.toFixed(2) })}</span>
                <span>{t('form.plan_footer_progress', { value: planProgressTotal.toFixed(1) })}</span>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!canEditPlan || upsertPlanMutation.isLoading}
                  onClick={() => {
                    setPlanErrors(null)
                    upsertPlanMutation.mutate(planRows)
                  }}
                >
                  {upsertPlanMutation.isLoading ? t('form.plan_saving') : t('form.plan_save')}
                </button>
              </div>
            </div>
          )}

          <div className="curation-section">
            <div className="curation-header">
              <h3>{t('form.curation_section_title')}</h3>
              <span className={`curation-pill curation-${formData.curationStatus}`}>
                {formData.curationStatus === 'pending'
                  ? t('curation.pending')
                  : formData.curationStatus === 'in_review'
                  ? t('curation.in_review')
                  : formData.curationStatus === 'approved'
                  ? t('curation.approved')
                  : formData.curationStatus === 'changes_requested'
                  ? t('curation.changes_requested')
                  : t('curation.rejected')}
              </span>
            </div>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label htmlFor="inputMode">{t('form.input_mode_label')}</label>
                <select
                  id="inputMode"
                  value={formData.inputMode || 'manual'}
                  onChange={(e) =>
                    setFormData({ ...formData, inputMode: e.target.value as CollaboratorKPI['inputMode'] })
                  }
                  disabled={isReadOnlyCollaborator}
                >
                  <option value="manual">{t('input.manual')}</option>
                  <option value="import">{t('input.import')}</option>
                  <option value="auto">{t('input.auto')}</option>
                </select>
                <span className="helper-text">
                  {t('form.input_mode_hint')}
                </span>
              </div>
              <div className="form-group">
                <label htmlFor="dataSource">{t('form.data_source_label')}</label>
                <select
                  id="dataSource"
                  value={formData.dataSource || ''}
                  onChange={(e) => {
                    setCriteriaDirty(true)
                    setCriteriaPrefilled(false)
                    setFormData({ ...formData, dataSource: e.target.value })
                  }}
                  className={errors.dataSource ? 'error' : ''}
                  disabled={isReadOnlyCollaborator}
                >
                  <option value="">{t('form.data_source_placeholder')}</option>
                  {dataSourceOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {errors.dataSource && <span className="error-message">{errors.dataSource}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="sourceConfig">{t('form.source_config_label')}</label>
                <input
                  type="text"
                  id="sourceConfig"
                  value={formData.sourceConfig || ''}
                  onChange={(e) => {
                    setCriteriaDirty(true)
                    setCriteriaPrefilled(false)
                    setFormData({ ...formData, sourceConfig: e.target.value })
                  }}
                  placeholder={t('form.source_config_placeholder')}
                  disabled={isReadOnlyCollaborator}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="criteriaText">{t('form.criteria_label')}</label>
              <textarea
                id="criteriaText"
                value={formData.criteriaText || ''}
                onChange={(e) => {
                  setCriteriaDirty(true)
                  setCriteriaPrefilled(false)
                  setFormData({ ...formData, criteriaText: e.target.value })
                }}
                rows={3}
                placeholder={t('form.criteria_placeholder')}
                className={errors.criteriaText ? 'error' : ''}
                disabled={isReadOnlyCollaborator}
              />
              {errors.criteriaText && <span className="error-message">{errors.criteriaText}</span>}
              {criteriaPrefilled && !criteriaDirty && (
                <small className="form-hint">{t('form.criteria_prefilled_hint')}</small>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="evidenceUrl">{t('form.evidence_label')}</label>
                <input
                  type="text"
                  id="evidenceUrl"
                  value={formData.evidenceUrl || ''}
                  onChange={(e) => {
                    setCriteriaDirty(true)
                    setCriteriaPrefilled(false)
                    setFormData({ ...formData, evidenceUrl: e.target.value })
                  }}
                  placeholder={t('form.evidence_placeholder')}
                  disabled={isReadOnlyCollaborator}
                />
              </div>
              <div className="form-group">
                <label>{t('form.curator_label')}</label>
                <div className="role-pill">Data Curator</div>
                <small className="form-hint">{t('form.curator_hint')}</small>
              </div>
            </div>

            <div className="curation-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setFormData({ ...formData, curationStatus: 'in_review', createCriteriaVersion: true })}
                disabled={isReadOnlyCollaborator}
              >
                {t('form.curation_submit')}
              </button>
              {assignment?.id && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      curationStatus: 'in_review',
                      createCriteriaVersion: true,
                    })
                  }
                  disabled={!criteriaDirty || isReadOnlyCollaborator}
                >
                  {t('form.curation_update')}
                </button>
              )}
              {canCurate && (
                <select
                  value={formData.curationStatus}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      curationStatus: e.target.value as CollaboratorKPI['curationStatus'],
                    })
                  }
                >
                  <option value="pending">{t('curation.pending')}</option>
                  <option value="in_review">{t('curation.in_review')}</option>
                  <option value="approved">{t('curation.approved')}</option>
                  <option value="rejected">{t('curation.rejected')}</option>
                  <option value="changes_requested">{t('curation.changes_requested')}</option>
                </select>
              )}
            </div>
          </div>

          {assignment?.id && (
            <div className="form-row">
              <div className="form-group">
                <label>{t('form.target_edit_label')}</label>
                <input
                  type="number"
                  value={formData.target || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, target: parseFloat(e.target.value) || 0 })
                  }
                  disabled={isPeriodClosed || isAssignmentClosed || isReadOnlyCollaborator}
                />
              </div>
              <div className="form-group">
                <label>{t('form.weight_edit_label')}</label>
                <input
                  type="number"
                  value={formData.weight || ''}
                  onChange={(e) => {
                    setWeightDirty(true)
                    setFormData({ ...formData, weight: parseFloat(e.target.value) || 0 })
                  }}
                  disabled={isPeriodClosed || isAssignmentClosed || isReadOnlyCollaborator}
                />
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="actual">{t('form.actual_label')}</label>
            <input
              type="number"
              id="actual"
              step="0.01"
              value={formData.actual ?? ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  actual: e.target.value === '' ? undefined : parseFloat(e.target.value),
                })
              }
              placeholder={t('form.actual_placeholder')}
              className={errors.actual ? 'error' : ''}
              disabled={isReadOnlyCollaborator}
            />
            {errors.actual && <span className="error-message">{errors.actual}</span>}
            <small className="form-hint">
              {negativeActualAllowed
                ? t('form.actual_hint_negative')
                : t('form.actual_hint_normal')}
            </small>
          </div>

          {!isPeriodClosed && (
            <div className="form-group">
              <label htmlFor="status">{t('form.status_label')}</label>
              <select
                id="status"
                value={formData.status}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    status: e.target.value as CollaboratorKPI['status'],
                  })
                }
                disabled={isReadOnlyCollaborator}
              >
                <option value="proposed">{t('status.proposed')}</option>
                <option value="approved">{t('status.approved')}</option>
                <option value="draft">{t('status.draft')}</option>
                <option value="closed">{t('status.closed')}</option>
              </select>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="comments">{t('form.comments_label')}</label>
            <textarea
              id="comments"
              value={formData.comments || ''}
              onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
              rows={3}
              placeholder={t('form.comments_placeholder')}
              disabled={isReadOnlyCollaborator}
            />
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('form.cancel')}
            </button>
            {canCloseAssignment && (
              <button
                type="button"
                className="btn-secondary"
                onClick={async () => {
                  const ok = await dialog.confirm(t('form.dialog_close_kpi'), {
                    title: t('form.dialog_close_kpi_title'), confirmLabel: t('form.dialog_close_kpi_confirm'), variant: 'warning'
                  })
                  if (ok) closeAssignmentMutation.mutate()
                }}
                disabled={closeAssignmentMutation.isLoading}
              >
                {t('form.close_kpi')}
              </button>
            )}
            {canReopenAssignment && (
              <button
                type="button"
                className="btn-secondary"
                onClick={async () => {
                  const ok = await dialog.confirm(t('form.dialog_reopen_kpi'), {
                    title: t('form.dialog_reopen_kpi_title'), confirmLabel: t('form.dialog_reopen_kpi_confirm'), variant: 'info'
                  })
                  if (ok) reopenAssignmentMutation.mutate()
                }}
                disabled={reopenAssignmentMutation.isLoading}
              >
                {t('form.reopen_kpi')}
              </button>
            )}
            <button
              type="submit"
              className="btn-primary"
              disabled={
                createMutation.isLoading ||
                updateMutation.isLoading ||
                isAssignmentClosed ||
                isReadOnlyCollaborator
              }
            >
              {createMutation.isLoading || updateMutation.isLoading
                ? t('form.saving')
                : assignment?.id
                ? t('form.update')
                : t('form.assign')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
