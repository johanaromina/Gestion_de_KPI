import { useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { closeOnOverlayClick, markOverlayPointerDown } from '../utils/modal'
import './CloseParrillaModal.css'

interface CloseParrillaModalProps {
  periodId: number
  collaboratorId?: number
  collaboratorName?: string
  periodName?: string
  onClose: () => void
  onSuccess?: () => void
}

export default function CloseParrillaModal({
  periodId,
  collaboratorId,
  collaboratorName,
  periodName,
  onClose,
  onSuccess,
}: CloseParrillaModalProps) {
  const { t } = useTranslation(['assignments', 'common'])
  const [confirmText, setConfirmText] = useState('')
  const requiredText = t('assignments:close_grid_modal.confirm_word').toUpperCase()

  const queryClient = useQueryClient()

  const closeMutation = useMutation(
    async () => {
      const response = await api.post('/collaborator-kpis/close-period', {
        periodId,
        collaboratorId,
      })
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('collaborator-kpis')
        queryClient.invalidateQueries('periods')
        onSuccess?.()
        onClose()
      },
    }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (confirmText !== requiredText) {
      return
    }

    closeMutation.mutate()
  }

  const isConfirmValid = confirmText === requiredText

  return (
    <div
      className="modal-overlay"
      onPointerDown={markOverlayPointerDown}
      onClick={(e) => closeOnOverlayClick(e, onClose)}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header warning">
          <h2>{`⚠️ ${t('assignments:close_grid_modal.title')}`}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="close-parrilla-form">
          <div className="warning-message">
            <p>
              <strong>{t('assignments:close_grid_modal.warning_title')}</strong>
            </p>
            <p>
              {t('assignments:close_grid_modal.warning_body')}
            </p>
          </div>

          <div className="parrilla-info">
            <div className="info-row">
              <span className="info-label">{t('assignments:close_grid_modal.period_label')}</span>
              <span className="info-value">
                {periodName || t('assignments:close_grid_modal.fallback_period', { id: periodId })}
              </span>
            </div>
            {collaboratorId && (
              <div className="info-row">
                <span className="info-label">{t('assignments:close_grid_modal.collaborator_label')}</span>
                <span className="info-value">
                  {collaboratorName || t('assignments:close_grid_modal.fallback_collaborator', { id: collaboratorId })}
                </span>
              </div>
            )}
            {!collaboratorId && (
              <div className="info-row">
                <span className="info-label">{t('assignments:close_grid_modal.scope_label')}</span>
                <span className="info-value">{t('assignments:close_grid_modal.all_collaborators')}</span>
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="confirm">
              {t('assignments:close_grid_modal.confirm_label', { word: requiredText })}
            </label>
            <input
              type="text"
              id="confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              placeholder={requiredText}
              className={!isConfirmValid && confirmText ? 'error' : ''}
            />
            {!isConfirmValid && confirmText && (
              <span className="error-message">
                {t('assignments:close_grid_modal.confirm_error', { word: requiredText })}
              </span>
            )}
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('common:cancel')}
            </button>
            <button
              type="submit"
              className="btn-danger"
              disabled={!isConfirmValid || closeMutation.isLoading}
            >
              {closeMutation.isLoading
                ? t('assignments:close_grid_modal.submitting')
                : t('assignments:close_grid_modal.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

