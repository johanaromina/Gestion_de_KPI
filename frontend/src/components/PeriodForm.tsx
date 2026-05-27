import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
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

const toDateInputValue = (value?: string | Date | null): string => {
  if (!value) return ''
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (match) return match[1]
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return ''
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`
  }
  if (Number.isNaN(value.getTime())) return ''
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
}

export default function PeriodForm({ period, onClose, onSuccess }: PeriodFormProps) {
  const [formData, setFormData] = useState<Period>({
    name: period?.name || '',
    startDate: toDateInputValue(period?.startDate),
    endDate: toDateInputValue(period?.endDate),
    status: period?.status || 'open',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const queryClient = useQueryClient()
  const { t } = useTranslation('periods')

  useEffect(() => {
    setFormData({
      name: period?.name || '',
      startDate: toDateInputValue(period?.startDate),
      endDate: toDateInputValue(period?.endDate),
      status: period?.status || 'open',
    })
    setErrors({})
  }, [period])

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
      newErrors.name = t('form.errors.name_required')
    }

    if (!formData.startDate) {
      newErrors.startDate = t('form.errors.start_required')
    }

    if (!formData.endDate) {
      newErrors.endDate = t('form.errors.end_required')
    }

    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate)
      const end = new Date(formData.endDate)

      if (start >= end) {
        newErrors.endDate = t('form.errors.end_after_start')
      }

      // Validar duración mínima y máxima (permitir trimestres de ~3-4 meses y hasta 14 meses)
      const monthsDiffInclusive = (end.getFullYear() - start.getFullYear()) * 12 +
        (end.getMonth() - start.getMonth()) + 1

      if (monthsDiffInclusive < 3 || monthsDiffInclusive > 14) {
        newErrors.endDate = t('form.errors.duration')
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
          <h2>{period?.id ? t('form.title_edit') : t('form.title_create')}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="period-form">
          <div className="form-group">
            <label htmlFor="name">{t('form.name_label')}</label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('form.name_placeholder')}
              className={errors.name ? 'error' : ''}
            />
            {errors.name && <span className="error-message">{errors.name}</span>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="startDate">{t('form.start_date_label')}</label>
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
              <label htmlFor="endDate">{t('form.end_date_label')}</label>
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
            <label htmlFor="status">{t('form.status_label')}</label>
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
              <option value="open">{t('status.open')}</option>
              <option value="in_review">{t('status.in_review')}</option>
              <option value="closed">{t('status.closed')}</option>
            </select>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('form.cancel')}
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={createMutation.isLoading || updateMutation.isLoading}
            >
              {createMutation.isLoading || updateMutation.isLoading
                ? t('form.saving')
                : period?.id
                ? t('form.update')
                : t('form.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
