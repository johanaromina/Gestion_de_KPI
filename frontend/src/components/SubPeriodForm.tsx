import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
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
    startDate: toDateInputValue(subPeriod?.startDate),
    endDate: toDateInputValue(subPeriod?.endDate),
    weight: subPeriod?.weight || 0,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const queryClient = useQueryClient()
  const { t } = useTranslation('periods')

  useEffect(() => {
    setFormData({
      periodId: subPeriod?.periodId || periodId,
      calendarProfileId: subPeriod?.calendarProfileId ?? calendarProfileId ?? null,
      name: subPeriod?.name || '',
      startDate: toDateInputValue(subPeriod?.startDate),
      endDate: toDateInputValue(subPeriod?.endDate),
      weight: subPeriod?.weight || 0,
    })
    setErrors({})
  }, [subPeriod, periodId, calendarProfileId])

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
      newErrors.name = t('subperiod_form.errors.name_required')
    }

    if (!formData.startDate) {
      newErrors.startDate = t('subperiod_form.errors.start_required')
    }

    if (!formData.endDate) {
      newErrors.endDate = t('subperiod_form.errors.end_required')
    }

    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate)
      const end = new Date(formData.endDate)

      if (start >= end) {
        newErrors.endDate = t('subperiod_form.errors.end_after_start')
      }
    }

    if (formData.weight !== undefined && formData.weight !== null) {
      if (formData.weight < 0 || formData.weight > 100) {
        newErrors.weight = t('subperiod_form.errors.weight_range')
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
          <h2>{subPeriod?.id ? t('subperiod_form.title_edit') : t('subperiod_form.title_create')}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="subperiod-form">
          <div className="form-group">
            <label htmlFor="name">{t('subperiod_form.name_label')}</label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('subperiod_form.name_placeholder')}
              className={errors.name ? 'error' : ''}
            />
            {errors.name && <span className="error-message">{errors.name}</span>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="startDate">{t('subperiod_form.start_date_label')}</label>
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
              <label htmlFor="endDate">{t('subperiod_form.end_date_label')}</label>
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
            <label htmlFor="weight">{t('subperiod_form.weight_label')}</label>
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
              placeholder={t('subperiod_form.weight_placeholder')}
              className={errors.weight ? 'error' : ''}
            />
            {errors.weight && (
              <span className="error-message">{errors.weight}</span>
            )}
            <small className="form-hint">
              {t('subperiod_form.weight_hint')}
            </small>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('subperiod_form.cancel')}
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={createMutation.isLoading || updateMutation.isLoading}
            >
              {createMutation.isLoading || updateMutation.isLoading
                ? t('subperiod_form.saving')
                : subPeriod?.id
                ? t('subperiod_form.update')
                : t('subperiod_form.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
