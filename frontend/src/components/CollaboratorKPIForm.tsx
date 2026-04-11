/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient, useQuery } from 'react-query'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { closeOnOverlayClick, markOverlayPointerDown } from '../utils/modal'
import { useDialog } from './Dialog'
import './CollaboratorKPIForm.css'

const toNumber = (value: any): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
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
  curationStatus?: 'pending' | 'in_review' | 'approved' | 'rejected'
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
        curationStatus: data.curationStatus,
        inputMode: data.inputMode,
        createCriteriaVersion: data.createCriteriaVersion,
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
        void dialog.alert(error?.response?.data?.error || 'No se pudo cerrar la asignación', { title: 'Error', variant: 'danger' })
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
        void dialog.alert(error?.response?.data?.error || 'No se pudo reabrir la asignación', { title: 'Error', variant: 'danger' })
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
      newErrors.periodId = 'No se pueden crear asignaciones en periodos cerrados'
    }

    if (!formData.collaboratorId || formData.collaboratorId === 0) {
      newErrors.collaboratorId = 'Debe seleccionar un colaborador'
    }

    if (!formData.kpiId || formData.kpiId === 0) {
      newErrors.kpiId = 'Debe seleccionar un KPI'
    }

    if (!assignment?.id) {
      if (!targetValue || targetValue <= 0) {
        newErrors.target = 'El target debe ser mayor a 0'
      }

      if (!weightValue || weightValue <= 0) {
        newErrors.weight = 'La ponderación debe ser mayor a 0'
      }

      if (weightValue > 100) {
        newErrors.weight = 'La ponderación no puede ser mayor a 100%'
      }

      // La validación de suma de pesos solo aplica a asignaciones resumen (sin subperíodo)
      // Las asignaciones de subperíodo tienen su propio cálculo de peso y no se suman al total general
      if (!formData.subPeriodId) {
        const totalWeight = toNumber(calculateTotalWeight())
        if (totalWeight > 100) {
          newErrors.weight = `La suma de ponderaciones sería ${totalWeight.toFixed(
            1
          )}%. Debe ser máximo 100%`
        }
      }
    }

    if (assignment?.id) {
      if (actualValue === null || Number.isNaN(actualValue)) {
        newErrors.actual = 'Ingresa el valor actual'
      } else if (actualValue < 0) {
        newErrors.actual = 'El valor actual no puede ser negativo'
      }
    }

    if (!formData.dataSource) {
      newErrors.dataSource = 'Selecciona una fuente'
    }

    if (!formData.criteriaText?.trim()) {
      newErrors.criteriaText = 'El criterio es requerido'
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
  const planProgressTotal = planTargetTotal > 0 ? (planActualTotal / planTargetTotal) * 100 : 0

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
        setPlanErrors(err?.response?.data?.error || 'Error al guardar plan mensual')
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
            <h2>{assignment?.id ? 'Editar Asignación de KPI' : 'Asignar KPI a Colaborador'}</h2>
            <p className="modal-subtitle">Completa en orden: Scope → Colaborador → KPI → Target.</p>
          </div>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        {isPeriodClosed && (
          <div className="period-closed-warning">
            <strong>⚠ Periodo Cerrado:</strong>{' '}
            {assignment?.id
              ? 'Solo se puede actualizar el valor actual (alcance).'
              : 'No se pueden crear nuevas asignaciones en periodos cerrados.'}
          </div>
        )}

        {isAssignmentClosed && (
          <div className="closed-warning">
            <strong>🔒 Asignación Cerrada</strong>
            <p>Esta asignación está cerrada. Solo administradores y directores pueden reabrirla.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="collaborator-kpi-form">
          <div className="form-section-title">1) Selección base</div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label htmlFor="scopeId">Scope *</label>
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
                <option value="">Seleccione un scope</option>
                {areaScopes.map((scope: any) => (
                  <option key={scope.id} value={scope.id}>
                    {scope.label}
                  </option>
                ))}
              </select>
              <small className="form-hint">Esto filtra colaboradores disponibles.</small>
              {selectedCalendarProfile && (
                <div className="calendar-pill">
                  Calendario: {selectedCalendarProfile.name} ({selectedCalendarProfile.frequency})
                </div>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="collaboratorId">Colaborador *</label>
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
                <option value="0">Seleccione un colaborador</option>
                {collaboratorsByScope?.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name} - {c.position}
                  </option>
                ))}
              </select>
              {errors.collaboratorId && <span className="error-message">{errors.collaboratorId}</span>}
              <small className="form-hint">Selecciona un colaborador del scope.</small>
            </div>

            <div className="form-group">
              <label htmlFor="kpiId">KPI *</label>
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
                <option value="0">Seleccione un KPI</option>
                {kpis?.map((k: any) => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.type})
                  </option>
                ))}
              </select>
              {errors.kpiId && <span className="error-message">{errors.kpiId}</span>}
              <small className="form-hint">Los KPIs se aplican por asignación, no por área.</small>
            </div>
          </div>

          {subPeriods && subPeriods.length > 0 && (
            <>
              <div className="form-section-title">2) Periodo y subperiodo</div>
              <div className="calendar-timeline">
                {subPeriods.map((sp: any) => (
                  <span
                    key={sp.id}
                    className={`calendar-chip ${sp.status === 'closed' ? 'closed' : 'open'}`}
                    title={`${sp.name}${sp.weight ? ` · ${sp.weight}%` : ''}`}
                  >
                    {sp.name}
                  </span>
                ))}
              </div>
              <div className="form-group">
              <label htmlFor="subPeriodId">Subperiodo (opcional)</label>
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
                <option value="">Sin subperiodo específico</option>
                {subPeriods.map((sp: any) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name} {sp.weight ? `(${sp.weight}%)` : ''}
                  </option>
                ))}
              </select>
              </div>
            </>
          )}

          {!assignment?.id && (
            <>
              <div className="form-section-title">3) Target y ponderación</div>
              <div className="form-row">
                <div className="form-group">
                <label htmlFor="target">Target *</label>
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
                  placeholder="Ej: 100"
                  disabled={isReadOnlyCollaborator}
                />
                {errors.target && <span className="error-message">{errors.target}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="weight">Ponderación (%) *</label>
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
                  placeholder="Ej: 25.00"
                  disabled={isReadOnlyCollaborator}
                />
                {errors.weight && <span className="error-message">{errors.weight}</span>}
                {!assignment?.id && selectedKpi && selectedScopeId && !scopeWeightForSelection && (
                  <small className="form-hint warning">
                    No hay ponderación definida para este KPI en el scope seleccionado. Definila en KPIs para que se
                    precargue automáticamente.
                  </small>
                )}
                {!assignment?.id && scopeWeightForSelection && !weightDirty && (
                  <small className="form-hint">
                    Ponderación precargada desde KPI por scope.
                  </small>
                )}
                <div className="weight-info">
                  <span className="weight-total">Total ponderación: {totalWeight.toFixed(1)}%</span>
                  {remainingWeight >= 0 && (
                    <span className="weight-remaining">Restante: {remainingWeight.toFixed(1)}%</span>
                  )}
                  {totalWeight === 100 && <span className="weight-perfect">✓ Suma perfecta (100%)</span>}
                  {totalWeight > 100 && (
                    <span className="weight-error">⚠ Excede 100% por {(totalWeight - 100).toFixed(1)}%</span>
                  )}
                </div>
              </div>
            </div>
            </>
          )}

          <div className="curation-section">
            <div className="curation-header">
              <h3>Fuente y criterio (Curaduría)</h3>
              <span className={`curation-pill curation-${formData.curationStatus}`}>
                {formData.curationStatus === 'pending'
                  ? 'Pendiente'
                  : formData.curationStatus === 'in_review'
                  ? 'En revision'
                  : formData.curationStatus === 'approved'
                  ? 'Aprobado'
                  : 'Rechazado'}
              </span>
            </div>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label htmlFor="inputMode">Modo de carga</label>
                <select
                  id="inputMode"
                  value={formData.inputMode || 'manual'}
                  onChange={(e) =>
                    setFormData({ ...formData, inputMode: e.target.value as CollaboratorKPI['inputMode'] })
                  }
                  disabled={isReadOnlyCollaborator}
                >
                  <option value="manual">Manual</option>
                  <option value="import">Import</option>
                  <option value="auto">Auto</option>
                </select>
                <span className="helper-text">
                  Todo KPI entra primero como manual. La automatización reemplaza la carga, no el KPI.
                </span>
              </div>
              <div className="form-group">
                <label htmlFor="dataSource">Fuente del dato *</label>
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
                  <option value="">Seleccione una fuente</option>
                  {dataSourceOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {errors.dataSource && <span className="error-message">{errors.dataSource}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="sourceConfig">Origen / Query / Endpoint</label>
                <input
                  type="text"
                  id="sourceConfig"
                  value={formData.sourceConfig || ''}
                  onChange={(e) => {
                    setCriteriaDirty(true)
                    setCriteriaPrefilled(false)
                    setFormData({ ...formData, sourceConfig: e.target.value })
                  }}
                  placeholder="JQL / SQL / URL / reporte"
                  disabled={isReadOnlyCollaborator}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="criteriaText">Criterio de cálculo *</label>
              <textarea
                id="criteriaText"
                value={formData.criteriaText || ''}
                onChange={(e) => {
                  setCriteriaDirty(true)
                  setCriteriaPrefilled(false)
                  setFormData({ ...formData, criteriaText: e.target.value })
                }}
                rows={3}
                placeholder="Describe cómo se calcula target/alcance/variación"
                className={errors.criteriaText ? 'error' : ''}
                disabled={isReadOnlyCollaborator}
              />
              {errors.criteriaText && <span className="error-message">{errors.criteriaText}</span>}
              {criteriaPrefilled && !criteriaDirty && (
                <small className="form-hint">Se copió desde el KPI macro. Podés editarlo si cambia la fuente.</small>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="evidenceUrl">Evidencia / adjunto (opcional)</label>
                <input
                  type="text"
                  id="evidenceUrl"
                  value={formData.evidenceUrl || ''}
                  onChange={(e) => {
                    setCriteriaDirty(true)
                    setCriteriaPrefilled(false)
                    setFormData({ ...formData, evidenceUrl: e.target.value })
                  }}
                  placeholder="Link o referencia"
                  disabled={isReadOnlyCollaborator}
                />
              </div>
              <div className="form-group">
                <label>Responsable de curaduría</label>
                <div className="role-pill">Data Curator</div>
                <small className="form-hint">Se asigna por rol, no por persona.</small>
              </div>
            </div>

            <div className="curation-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setFormData({ ...formData, curationStatus: 'in_review', createCriteriaVersion: true })}
                disabled={isReadOnlyCollaborator}
              >
                Enviar a curaduría
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
                  Actualizar criterio
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
                  <option value="pending">Pendiente</option>
                  <option value="in_review">En revision</option>
                  <option value="approved">Aprobado</option>
                  <option value="rejected">Rechazado</option>
                </select>
              )}
            </div>
          </div>

          {assignment?.id && (
            <div className="form-row">
              <div className="form-group">
                <label>Target</label>
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
                <label>Ponderación (%)</label>
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
            <label htmlFor="actual">Valor Actual (Alcance) *</label>
            <input
              type="number"
              id="actual"
              min="0"
              step="0.01"
              value={formData.actual ?? ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  actual: e.target.value === '' ? undefined : parseFloat(e.target.value),
                })
              }
              placeholder="Ingresa el valor logrado este mes"
              className={errors.actual ? 'error' : ''}
              disabled={isReadOnlyCollaborator}
            />
            {errors.actual && <span className="error-message">{errors.actual}</span>}
            <small className="form-hint">
              Actualiza aquí el valor alcanzado mes a mes. Target y ponderación no se editan al actualizar.
            </small>
          </div>

          {!isPeriodClosed && (
            <div className="form-group">
              <label htmlFor="status">Estado</label>
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
                <option value="proposed">Propuesto</option>
                <option value="approved">Aprobado</option>
                <option value="draft">Borrador</option>
                <option value="closed">Cerrado</option>
              </select>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="comments">Comentarios</label>
            <textarea
              id="comments"
              value={formData.comments || ''}
              onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
              rows={3}
              placeholder="Comentarios adicionales sobre esta asignación..."
              disabled={isReadOnlyCollaborator}
            />
          </div>

          {subPeriods && subPeriods.length > 0 && formData.kpiId !== 0 && formData.collaboratorId !== 0 && (
            <div className="plan-section">
              <div className="plan-header">
                <h3>Plan mensual por subperiodo</h3>
                <span className="plan-helper">
                  Ajusta targets mensuales. El peso temporal viene del período.
                </span>
              </div>
              {canOverrideWeight && (
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={weightOverrideEnabled}
                    onChange={(e) => setWeightOverrideEnabled(e.target.checked)}
                  />
                  <span>Override de ponderación (solo casos especiales)</span>
                </label>
              )}
              {planErrors && <div className="error-message">{planErrors}</div>}
              <table className="plan-table">
                <thead>
                  <tr>
                    <th>Subperiodo</th>
                    <th>Target</th>
                    <th>Peso periodo</th>
                    {weightOverrideEnabled && <th>Override</th>}
                    <th>Actual</th>
                    <th>% Mes</th>
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
                          ? `${((Number(row.actual) / Number(row.target)) * 100).toFixed(1)}%`
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="plan-footer">
                <span>Peso total periodo: {planWeightTotal.toFixed(2)}%</span>
                <span>Target acumulado: {planTargetTotal.toFixed(2)}</span>
                <span>Actual acumulado: {planActualTotal.toFixed(2)}</span>
                <span>Avance acumulado: {planProgressTotal.toFixed(1)}%</span>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!canEditPlan || upsertPlanMutation.isLoading}
                  onClick={() => {
                    setPlanErrors(null)
                    upsertPlanMutation.mutate(planRows)
                  }}
                >
                  {upsertPlanMutation.isLoading ? 'Guardando plan...' : 'Guardar plan'}
                </button>
              </div>
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            {canCloseAssignment && (
              <button
                type="button"
                className="btn-secondary"
                onClick={async () => {
                  const ok = await dialog.confirm('¿Cerrar este KPI? Se bloquearán ediciones.', {
                    title: 'Cerrar KPI', confirmLabel: 'Cerrar', variant: 'warning'
                  })
                  if (ok) closeAssignmentMutation.mutate()
                }}
                disabled={closeAssignmentMutation.isLoading}
              >
                Cerrar KPI
              </button>
            )}
            {canReopenAssignment && (
              <button
                type="button"
                className="btn-secondary"
                onClick={async () => {
                  const ok = await dialog.confirm('¿Reabrir este KPI? Volverá a ser editable.', {
                    title: 'Reabrir KPI', confirmLabel: 'Reabrir', variant: 'info'
                  })
                  if (ok) reopenAssignmentMutation.mutate()
                }}
                disabled={reopenAssignmentMutation.isLoading}
              >
                Reabrir KPI
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
                ? 'Guardando...'
                : assignment?.id
                ? 'Actualizar'
                : 'Asignar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
