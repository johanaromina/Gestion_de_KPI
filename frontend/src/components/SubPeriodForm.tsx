import { useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import api from '../services/api'
import { closeOnOverlayClick, markOverlayPointerDown } from '../utils/modal'
import './SubPeriodForm.css'

interface SubPeriod {
  id?: number
  periodId: number
  calendarProfileId?: number | null
  name: string
  startDate: string
  endDate: string
  weight?: number
}

interface SubPeriodFormProps {
  periodId: number
  calendarProfileId?: number | null
  subPeriod?: SubPeriod
  onClose: () => void
  onSuccess?: () => void
}

export default function SubPeriodForm({
  periodId,
  calendarProfileId,
  subPeriod,
  onClose,
  onSuccess,
}: SubPeriodFormProps) {
  const [formData, setFormData] = useState<SubPeriod>({
    periodId: subPeriod?.periodId || periodId,
    calendarProfileId: subPeriod?.calendarProfileId ?? calendarProfileId ?? null,
    name: subPeriod?.name || '',
    startDate: subPeriod?.startDate || '',
    endDate: subPeriod?.endDate || '',
    weight: subPeriod?.weight || 0,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const queryClient = useQueryClient()

  const createMutation = useMutation(
    async (data: SubPeriod) => {
      const response = await api.post('/sub-periods', data)
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['sub-periods', periodId, calendarProfileId ?? null])
        queryClient.invalidateQueries('periods')
        onSuccess?.()
        onClose()
      },
    }
  )

  const updateMutation = useMutation(
    async (data: SubPeriod) => {
      const response = await api.put(`/sub-periods/${subPeriod?.id}`, data)
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['sub-periods', periodId, calendarProfileId ?? null])
        queryClient.invalidateQueries('periods')
        onSuccess?.()
        onClose()
      },
    }
  )

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre del subperíodo es requerido'
    }

    if (!formData.startDate) {
      newErrors.startDate = 'La fecha de inicio es requerida'
    }

    if (!formData.endDate) {
      newErrors.endDate = 'La fecha de fin es requerida'
    }

    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate)
      const end = new Date(formData.endDate)

      if (start >= end) {
        newErrors.endDate = 'La fecha de fin debe ser posterior a la fecha de inicio'
      }
    }

    if (formData.weight !== undefined && formData.weight !== null) {
      if (formData.weight < 0 || formData.weight > 100) {
        newErrors.weight = 'El peso debe estar entre 0 y 100'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      return
    }

    if (subPeriod?.id) {
      updateMutation.mutate(formData)
    } else {
      createMutation.mutate(formData)
    }
  }

  return (
    <div
      className="modal-overlay"
      onPointerDown={markOverlayPointerDown}
      onClick={(e) => closeOnOverlayClick(e, onClose)}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{subPeriod?.id ? 'Editar Subperíodo' : 'Crear Subperíodo'}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="subperiod-form">
          <div className="form-group">
            <label htmlFor="name">Nombre del Subperíodo *</label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej: Q1 2025, Enero 2025, etc."
              className={errors.name ? 'error' : ''}
            />
            {errors.name && <span className="error-message">{errors.name}</span>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="startDate">Fecha de Inicio *</label>
              <input
                type="date"
                id="startDate"
                value={formData.startDate}
                onChange={(e) =>
                  setFormData({ ...formData, startDate: e.target.value })
                }
                className={errors.startDate ? 'error' : ''}
              />
              {errors.startDate && (
                <span className="error-message">{errors.startDate}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="endDate">Fecha de Fin *</label>
              <input
                type="date"
                id="endDate"
                value={formData.endDate}
                onChange={(e) =>
                  setFormData({ ...formData, endDate: e.target.value })
                }
                className={errors.endDate ? 'error' : ''}
              />
              {errors.endDate && (
                <span className="error-message">{errors.endDate}</span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="weight">Peso Relativo (%)</label>
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
                  weight: e.target.value ? parseFloat(e.target.value) : 0,
                })
              }
              placeholder="Ej: 25.00"
              className={errors.weight ? 'error' : ''}
            />
            {errors.weight && (
              <span className="error-message">{errors.weight}</span>
            )}
            <small className="form-hint">
              Peso relativo del subperíodo dentro del período (0-100%)
            </small>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={createMutation.isLoading || updateMutation.isLoading}
            >
              {createMutation.isLoading || updateMutation.isLoading
                ? 'Guardando...'
                : subPeriod?.id
                ? 'Actualizar'
                : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

