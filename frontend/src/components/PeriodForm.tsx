import { useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import api from '../services/api'
import { closeOnOverlayClick, markOverlayPointerDown } from '../utils/modal'
import './PeriodForm.css'

interface Period {
  id?: number
  name: string
  startDate: string
  endDate: string
  status: 'open' | 'in_review' | 'closed'
}

interface PeriodFormProps {
  period?: Period
  onClose: () => void
  onSuccess?: () => void
}

export default function PeriodForm({ period, onClose, onSuccess }: PeriodFormProps) {
  const [formData, setFormData] = useState<Period>({
    name: period?.name || '',
    startDate: period?.startDate || '',
    endDate: period?.endDate || '',
    status: period?.status || 'open',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const queryClient = useQueryClient()

  const createMutation = useMutation(
    async (data: Period) => {
      const response = await api.post('/periods', data)
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('periods')
        onSuccess?.()
        onClose()
      },
    }
  )

  const updateMutation = useMutation(
    async (data: Period) => {
      const response = await api.put(`/periods/${period?.id}`, data)
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('periods')
        onSuccess?.()
        onClose()
      },
    }
  )

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre del período es requerido'
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

      // Validar duración mínima y máxima (permitir trimestres de ~3-4 meses y hasta 14 meses)
      const monthsDiffInclusive = (end.getFullYear() - start.getFullYear()) * 12 +
        (end.getMonth() - start.getMonth()) + 1

      if (monthsDiffInclusive < 3 || monthsDiffInclusive > 14) {
        newErrors.endDate = 'El período debe durar entre 3 y 14 meses'
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

    if (period?.id) {
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
          <h2>{period?.id ? 'Editar Período' : 'Crear Período'}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="period-form">
          <div className="form-group">
            <label htmlFor="name">Nombre del Período *</label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej: 2025-03-01 a 2026-02-01"
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
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
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
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className={errors.endDate ? 'error' : ''}
              />
              {errors.endDate && (
                <span className="error-message">{errors.endDate}</span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="status">Estado</label>
            <select
              id="status"
              value={formData.status}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  status: e.target.value as 'open' | 'in_review' | 'closed',
                })
              }
            >
              <option value="open">Abierto</option>
              <option value="in_review">En Revisión</option>
              <option value="closed">Cerrado</option>
            </select>
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
                : period?.id
                ? 'Actualizar'
                : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

