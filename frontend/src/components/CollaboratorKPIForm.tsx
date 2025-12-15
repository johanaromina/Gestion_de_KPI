import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient, useQuery } from 'react-query'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
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
  subPeriodId?: number
  target: number
  actual?: number
  weight: number
  status: 'draft' | 'proposed' | 'approved' | 'closed'
  comments?: string
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
    subPeriodId: assignment?.subPeriodId,
    target: assignment?.target ?? 0,
    actual: assignment?.actual,
    weight: assignment?.weight ?? 0,
    status: assignment?.status || 'draft',
    comments: assignment?.comments || '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isReadOnlyCollaborator = user?.role === 'collaborator'

  const { data: collaborators } = useQuery('collaborators', async () => {
    const response = await api.get('/collaborators')
    return response.data
  })

  const selectedCollaborator = collaborators?.find((c: any) => c.id === formData.collaboratorId)
  const collaboratorArea = selectedCollaborator?.area

  const { data: kpis } = useQuery(
    ['kpis', collaboratorArea],
    async () => {
      const response = await api.get('/kpis', {
        params: collaboratorArea ? { area: collaboratorArea } : undefined,
      })
      return response.data
    },
    {
      // Permitir fetch inicial aunque no haya área para que no quede vacío cuando aún no se seleccionó
      enabled: true,
    }
  )

  const { data: subPeriods } = useQuery(
    ['sub-periods', periodId],
    async () => {
      const response = await api.get(`/periods/${periodId}/sub-periods`)
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
        subPeriodId: data.subPeriodId,
        target: assignment.target ?? 0,
        weight: assignment.weight ?? 0,
        status: data.status,
        comments: data.comments,
        actual: data.actual,
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

  const calculateTotalWeight = (): number => {
    if (!existingAssignments) return toNumber(formData.weight)

    const otherAssignments = existingAssignments.filter((a: any) => a.id !== assignment?.id)
    const otherWeights = otherAssignments.reduce((sum: number, a: any) => sum + toNumber(a.weight), 0)
    return otherWeights + toNumber(formData.weight)
  }

  const isAssignmentClosed = assignment?.status === 'closed'

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

      const totalWeight = toNumber(calculateTotalWeight())
      if (totalWeight > 100) {
        newErrors.weight = `La suma de ponderaciones sería ${totalWeight.toFixed(
          1
        )}%. Debe ser máximo 100%`
      }
    }

    if (assignment?.id) {
      if (actualValue === null || Number.isNaN(actualValue)) {
        newErrors.actual = 'Ingresa el valor actual'
      } else if (actualValue < 0) {
        newErrors.actual = 'El valor actual no puede ser negativo'
      }
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

  type PlanRow = { subPeriodId: number; name: string; target: number | ''; weight: number | '' }
  const [planRows, setPlanRows] = useState<PlanRow[]>([])
  const [planErrors, setPlanErrors] = useState<string | null>(null)

  useEffect(() => {
    if (!subPeriods || !Array.isArray(subPeriods)) return
    const planMap = new Map<number, { target: number; weight: number }>()
    if (Array.isArray(planData)) {
      for (const p of planData) {
        planMap.set(p.subPeriodId, { target: Number(p.target ?? 0), weight: Number(p.weight ?? 0) })
      }
    }
    const merged = subPeriods.map((sp: any) => ({
      subPeriodId: sp.id,
      name: sp.name,
      target: planMap.get(sp.id)?.target ?? '',
      weight: planMap.get(sp.id)?.weight ?? '',
    }))
    setPlanRows(merged)
  }, [planData, subPeriods])

  const planWeightTotal = planRows.reduce((acc, r) => acc + (Number(r.weight) || 0), 0)

  const upsertPlanMutation = useMutation(
    async (items: PlanRow[]) => {
      const body = {
        items: items.map((r) => ({
          subPeriodId: r.subPeriodId,
          target: Number(r.target) || 0,
          weight: Number(r.weight) || 0,
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{assignment?.id ? 'Editar Asignación de KPI' : 'Asignar KPI a Colaborador'}</h2>
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
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="collaboratorId">Colaborador *</label>
              <select
                id="collaboratorId"
                value={formData.collaboratorId}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    collaboratorId: parseInt(e.target.value),
                  })
                }
                disabled={!!assignment?.id || !!collaboratorId || isPeriodClosed || isReadOnlyCollaborator}
                className={errors.collaboratorId ? 'error' : ''}
              >
                <option value="0">Seleccione un colaborador</option>
                {collaborators?.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name} - {c.position}
                  </option>
                ))}
              </select>
              {errors.collaboratorId && <span className="error-message">{errors.collaboratorId}</span>}
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
            </div>
          </div>

          {subPeriods && subPeriods.length > 0 && (
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
          )}

          {!assignment?.id && (
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
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      weight: parseFloat(e.target.value) || 0,
                    })
                  }
                  className={errors.weight ? 'error' : ''}
                  placeholder="Ej: 25.00"
                  disabled={isReadOnlyCollaborator}
                />
                {errors.weight && <span className="error-message">{errors.weight}</span>}
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
          )}

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
                  onChange={(e) =>
                    setFormData({ ...formData, weight: parseFloat(e.target.value) || 0 })
                  }
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
                  Ajusta target y peso por mes. Solo usuarios con permisos de configuración pueden editar.
                </span>
              </div>
              {planErrors && <div className="error-message">{planErrors}</div>}
              <table className="plan-table">
                <thead>
                  <tr>
                    <th>Subperiodo</th>
                    <th>Target</th>
                    <th>Ponderación (%)</th>
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
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={row.weight}
                          disabled={!canEditPlan}
                          onChange={(e) =>
                            setPlanRows((prev) =>
                              prev.map((r) =>
                                r.subPeriodId === row.subPeriodId
                                  ? { ...r, weight: e.target.value === '' ? '' : parseFloat(e.target.value) }
                                  : r
                              )
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="plan-footer">
                <span>Total ponderación plan: {planWeightTotal.toFixed(2)}%</span>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!canEditPlan || upsertPlanMutation.isLoading}
                  onClick={() => {
                    setPlanErrors(null)
                    const total = planRows.reduce((acc, r) => acc + (Number(r.weight) || 0), 0)
                    if (total > 100.01) {
                      setPlanErrors(`La suma de ponderaciones del plan no puede superar 100% (actual: ${total.toFixed(2)}%)`)
                      return
                    }
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
