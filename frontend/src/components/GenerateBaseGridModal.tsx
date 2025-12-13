import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import api from '../services/api'
import { KPI } from '../types'
import './GenerateBaseGridModal.css'

interface GenerateBaseGridModalProps {
  onClose: () => void
  onSuccess?: () => void
}

export default function GenerateBaseGridModal({
  onClose,
  onSuccess,
}: GenerateBaseGridModalProps) {
  const [formData, setFormData] = useState({
    area: '',
    periodId: '',
    kpiIds: [] as number[],
    defaultTarget: '',
    defaultWeight: '',
    useAllKPIs: true,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const queryClient = useQueryClient()

  // Obtener períodos
  const { data: periods } = useQuery('periods', async () => {
    const response = await api.get('/periods')
    return response.data
  })

  // Obtener colaboradores para obtener áreas únicas
  const { data: collaborators } = useQuery('collaborators', async () => {
    const response = await api.get('/collaborators')
    return response.data
  })

  // Obtener KPIs
  const { data: kpis } = useQuery<KPI[]>('kpis', async () => {
    const response = await api.get('/kpis')
    return response.data
  })

  const generateMutation = useMutation(
    async (data: any) => {
      const response = await api.post('/collaborator-kpis/generate-base-grids', data)
      return response.data
    },
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('collaborator-kpis')
        alert(
          `Parrillas base generadas exitosamente.\n` +
            `- Asignaciones creadas: ${data.created}\n` +
            `- Colaboradores: ${data.details.collaboratorsCount}\n` +
            `- KPIs: ${data.details.kpisCount}`
        )
        onSuccess?.()
        onClose()
      },
      onError: (error: any) => {
        alert(
          error.response?.data?.error ||
            'Error al generar parrillas base. Verifica los datos ingresados.'
        )
      },
    }
  )

  // Obtener áreas únicas de colaboradores
  const uniqueAreas = Array.from(
    new Set(collaborators?.map((c: any) => c.area) || [])
  ).sort()

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.area) {
      newErrors.area = 'El área es requerida'
    }

    if (!formData.periodId) {
      newErrors.periodId = 'El período es requerido'
    }

    if (!formData.useAllKPIs && formData.kpiIds.length === 0) {
      newErrors.kpiIds = 'Debes seleccionar al menos un KPI'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      return
    }

    const submitData: any = {
      area: formData.area,
      periodId: parseInt(formData.periodId),
    }

    if (!formData.useAllKPIs && formData.kpiIds.length > 0) {
      submitData.kpiIds = formData.kpiIds
    }

    if (formData.defaultTarget) {
      submitData.defaultTarget = parseFloat(formData.defaultTarget)
    }

    if (formData.defaultWeight) {
      submitData.defaultWeight = parseFloat(formData.defaultWeight)
    }

    generateMutation.mutate(submitData)
  }

  const handleKpiToggle = (kpiId: number) => {
    if (formData.kpiIds.includes(kpiId)) {
      setFormData({
        ...formData,
        kpiIds: formData.kpiIds.filter((id) => id !== kpiId),
      })
    } else {
      setFormData({
        ...formData,
        kpiIds: [...formData.kpiIds, kpiId],
      })
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content generate-grid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Generar Parrillas Base</h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="generate-grid-form">
          <div className="form-group">
            <label htmlFor="area">Área *</label>
            <select
              id="area"
              value={formData.area}
              onChange={(e) =>
                setFormData({ ...formData, area: e.target.value })
              }
              className={errors.area ? 'error' : ''}
            >
              <option value="">Selecciona un área</option>
              {uniqueAreas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
            {errors.area && (
              <span className="error-message">{errors.area}</span>
            )}
            <small className="form-hint">
              Se generarán parrillas para todos los colaboradores de esta área
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="periodId">Período *</label>
            <select
              id="periodId"
              value={formData.periodId}
              onChange={(e) =>
                setFormData({ ...formData, periodId: e.target.value })
              }
              className={errors.periodId ? 'error' : ''}
            >
              <option value="">Selecciona un período</option>
              {periods?.map((period: any) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </select>
            {errors.periodId && (
              <span className="error-message">{errors.periodId}</span>
            )}
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={formData.useAllKPIs}
                onChange={(e) =>
                  setFormData({ ...formData, useAllKPIs: e.target.checked })
                }
              />
              <span style={{ marginLeft: '8px' }}>
                Usar todos los KPIs disponibles
              </span>
            </label>
          </div>

          {!formData.useAllKPIs && (
            <div className="form-group">
              <label>Seleccionar KPIs *</label>
              <div className="kpi-selection">
                {kpis && kpis.length > 0 ? (
                  kpis.map((kpi) => (
                    <label key={kpi.id} className="kpi-checkbox">
                      <input
                        type="checkbox"
                        checked={formData.kpiIds.includes(kpi.id)}
                        onChange={() => handleKpiToggle(kpi.id)}
                      />
                      <span>{kpi.name}</span>
                    </label>
                  ))
                ) : (
                  <p className="no-kpis">No hay KPIs disponibles</p>
                )}
              </div>
              {errors.kpiIds && (
                <span className="error-message">{errors.kpiIds}</span>
              )}
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="defaultTarget">Target por Defecto (Opcional)</label>
              <input
                type="number"
                step="any"
                id="defaultTarget"
                value={formData.defaultTarget}
                onChange={(e) =>
                  setFormData({ ...formData, defaultTarget: e.target.value })
                }
                placeholder="0"
              />
              <small className="form-hint">
                Si no se especifica, se usará 0 como valor inicial
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="defaultWeight">Ponderación por Defecto (Opcional)</label>
              <input
                type="number"
                step="any"
                id="defaultWeight"
                value={formData.defaultWeight}
                onChange={(e) =>
                  setFormData({ ...formData, defaultWeight: e.target.value })
                }
                placeholder="Auto (100% / cantidad de KPIs)"
              />
              <small className="form-hint">
                Si no se especifica, se distribuirá equitativamente
              </small>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={generateMutation.isLoading}
            >
              {generateMutation.isLoading
                ? 'Generando...'
                : 'Generar Parrillas Base'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

