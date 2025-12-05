import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from 'react-query'
import api from '../services/api'
import './CollaboratorKPIForm.css'

interface CollaboratorKPI {
  id?: number
  collaboratorId: number
  kpiId: number
  periodId: number
  subPeriodId?: number
  target: number
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
    target: assignment?.target || 0,
    weight: assignment?.weight || 0,
    status: assignment?.status || 'draft',
    comments: assignment?.comments || '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const queryClient = useQueryClient()

  // Obtener colaboradores
  const { data: collaborators } = useQuery('collaborators', async () => {
    const response = await api.get('/collaborators')
    return response.data
  })

  // Obtener KPIs
  const { data: kpis } = useQuery('kpis', async () => {
    const response = await api.get('/kpis')
    return response.data
  })

  // Obtener subperíodos del período
  const { data: subPeriods } = useQuery(
    ['sub-periods', periodId],
    async () => {
      const response = await api.get(`/periods/${periodId}/sub-periods`)
      return response.data
    },
    {
      enabled: !!periodId,
    }
  )

  // Obtener información del período para verificar si está cerrado
  const { data: periodInfo } = useQuery(
    ['period', periodId],
    async () => {
      const response = await api.get(`/periods/${periodId}`)
      return response.data
    },
    {
      enabled: !!periodId,
    }
  )

  const isPeriodClosed = periodInfo?.status === 'closed'

  // Obtener asignaciones existentes del colaborador para calcular suma de ponderaciones
  const { data: existingAssignments } = useQuery(
    ['collaborator-kpis', formData.collaboratorId, periodId],
    async () => {
      if (!formData.collaboratorId || !periodId) return []
      const response = await api.get(
        `/collaborator-kpis/collaborator/${formData.collaboratorId}`,
        {
          params: { periodId },
        }
      )
      return response.data
    },
    {
      enabled: !!formData.collaboratorId && !!periodId,
    }
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
      const response = await api.put(`/collaborator-kpis/${assignment?.id}`, data)
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

  // Calcular suma de ponderaciones
  const calculateTotalWeight = (): number => {
    if (!existingAssignments) return formData.weight

    const otherAssignments = existingAssignments.filter(
      (a: any) => a.id !== assignment?.id
    )
    const otherWeights = otherAssignments.reduce(
      (sum: number, a: any) => sum + (a.weight || 0),
      0
    )
    return otherWeights + formData.weight
  }

  const isAssignmentClosed = assignment?.status === 'closed'

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    // Validar si el período está cerrado
    if (isPeriodClosed && !assignment?.id) {
      newErrors.periodId = 'No se pueden crear asignaciones en períodos cerrados'
    }

    if (!formData.collaboratorId || formData.collaboratorId === 0) {
      newErrors.collaboratorId = 'Debe seleccionar un colaborador'
    }

    if (!formData.kpiId || formData.kpiId === 0) {
      newErrors.kpiId = 'Debe seleccionar un KPI'
    }

    if (!formData.target || formData.target <= 0) {
      newErrors.target = 'El target debe ser mayor a 0'
    }

    if (!formData.weight || formData.weight <= 0) {
      newErrors.weight = 'La ponderación debe ser mayor a 0'
    }

    if (formData.weight > 100) {
      newErrors.weight = 'La ponderación no puede ser mayor a 100%'
    }

    // Validar suma de ponderaciones
    const totalWeight = calculateTotalWeight()
    if (totalWeight > 100) {
      newErrors.weight = `La suma de ponderaciones sería ${totalWeight.toFixed(1)}%. Debe ser máximo 100%`
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      return
    }

    if (assignment?.id) {
      updateMutation.mutate(formData)
    } else {
      createMutation.mutate(formData)
    }
  }

  const totalWeight = calculateTotalWeight()
  const remainingWeight = 100 - (totalWeight - formData.weight)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {assignment?.id
              ? 'Editar Asignación de KPI'
              : 'Asignar KPI a Colaborador'}
          </h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        {isPeriodClosed && (
          <div className="period-closed-warning">
            <strong>⚠️ Período Cerrado:</strong> Este período está cerrado. 
            {assignment?.id
              ? ' Solo se puede actualizar el valor actual (alcance) con permisos especiales.'
              : ' No se pueden crear nuevas asignaciones en períodos cerrados.'}
          </div>
        )}

        {isPeriodClosed && (
          <div className="closed-warning">
            <strong>⚠️ Período Cerrado</strong>
            <p>Este período está cerrado. No se pueden crear nuevas asignaciones.</p>
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
                disabled={!!assignment?.id || !!collaboratorId || isPeriodClosed}
                className={errors.collaboratorId ? 'error' : ''}
              >
                <option value="0">Seleccione un colaborador</option>
                {collaborators?.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name} - {c.position}
                  </option>
                ))}
              </select>
              {errors.collaboratorId && (
                <span className="error-message">{errors.collaboratorId}</span>
              )}
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
                disabled={!!assignment?.id || isPeriodClosed}
                className={errors.kpiId ? 'error' : ''}
              >
                <option value="0">Seleccione un KPI</option>
                {kpis?.map((k: any) => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.type})
                  </option>
                ))}
              </select>
              {errors.kpiId && (
                <span className="error-message">{errors.kpiId}</span>
              )}
            </div>
          </div>

          {subPeriods && subPeriods.length > 0 && (
            <div className="form-group">
              <label htmlFor="subPeriodId">Subperíodo (opcional)</label>
              <select
                id="subPeriodId"
                value={formData.subPeriodId || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    subPeriodId: e.target.value
                      ? parseInt(e.target.value)
                      : undefined,
                  })
                }
              >
                <option value="">Sin subperíodo específico</option>
                {subPeriods.map((sp: any) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name} ({sp.weight ? `${sp.weight}%` : ''})
                  </option>
                ))}
              </select>
            </div>
          )}

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
                disabled={!!(isPeriodClosed && assignment?.id)}
                className={errors.target ? 'error' : ''}
                placeholder="Ej: 100"
              />
              {errors.target && (
                <span className="error-message">{errors.target}</span>
              )}
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
                disabled={!!(isPeriodClosed && assignment?.id)}
                className={errors.weight ? 'error' : ''}
                placeholder="Ej: 25.00"
              />
              {errors.weight && (
                <span className="error-message">{errors.weight}</span>
              )}
              <div className="weight-info">
                <span className="weight-total">
                  Total ponderación: {totalWeight.toFixed(1)}%
                </span>
                {remainingWeight >= 0 && (
                  <span className="weight-remaining">
                    Restante: {remainingWeight.toFixed(1)}%
                  </span>
                )}
                {totalWeight === 100 && (
                  <span className="weight-perfect">✓ Suma perfecta (100%)</span>
                )}
                {totalWeight > 100 && (
                  <span className="weight-error">
                    ⚠ Excede 100% por {(totalWeight - 100).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
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
              >
                <option value="draft">Borrador</option>
                <option value="proposed">Propuesto</option>
                <option value="approved">Aprobado</option>
                <option value="closed">Cerrado</option>
              </select>
            </div>
          )}

          {isPeriodClosed && assignment?.id && (
            <div className="form-group">
              <label htmlFor="actual">Valor Actual (Alcance) *</label>
              <input
                type="number"
                id="actual"
                min="0"
                step="0.01"
                value={(assignment as any).actual || ''}
                onChange={(e) => {
                  // Actualizar directamente usando el endpoint especial
                  const actualValue = parseFloat(e.target.value) || 0
                  api
                    .patch(`/collaborator-kpis/${assignment.id}/actual`, {
                      actual: actualValue,
                    })
                    .then(() => {
                      queryClient.invalidateQueries('collaborator-kpis')
                      onSuccess?.()
                    })
                    .catch((error) => {
                      alert(
                        error.response?.data?.error ||
                          'Error al actualizar valor actual'
                      )
                    })
                }}
                placeholder="Ingrese el valor actual alcanzado"
              />
              <small className="form-hint">
                Solo se puede actualizar el valor actual en períodos cerrados
              </small>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="comments">Comentarios</label>
            <textarea
              id="comments"
              value={formData.comments || ''}
              onChange={(e) =>
                setFormData({ ...formData, comments: e.target.value })
              }
              rows={3}
              placeholder="Comentarios adicionales sobre esta asignación..."
            />
          </div>

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
                isPeriodClosed ||
                isAssignmentClosed
              }
            >
              {createMutation.isLoading || updateMutation.isLoading
                ? 'Guardando...'
                : isPeriodClosed || isAssignmentClosed
                ? 'Bloqueado (Cerrado)'
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

