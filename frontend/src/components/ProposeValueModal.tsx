/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { useDialog } from './Dialog'
import { useOutlierDetection } from '../hooks/useOutlierDetection'
import { closeOnOverlayClick, markOverlayPointerDown } from '../utils/modal'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import './ProposeValueModal.css'

interface ProposeValueModalProps {
  assignment: {
    id: number
    kpiName?: string
    target: number
    actual?: number
    status: string
    collaboratorId?: number
    kpiId?: number
    periodId?: number
  }
  requiresReason?: boolean
  evidenceEnabled?: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function ProposeValueModal({
  assignment,
  requiresReason = false,
  evidenceEnabled = false,
  onClose,
  onSuccess,
}: ProposeValueModalProps) {
  const { t, i18n } = useTranslation('assignments')
  const locale = i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'es-AR'
  const [actual, setActual] = useState<string>(
    assignment.actual?.toString() || ''
  )
  const [comments, setComments] = useState<string>('')
  const [reason, setReason] = useState<string>('')
  const [evidenceUrl, setEvidenceUrl] = useState<string>('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const queryClient = useQueryClient()
  const dialog = useDialog()

  const parsedActual = actual.trim() !== '' && !isNaN(parseFloat(actual)) ? parseFloat(actual) : null
  const outlier = useOutlierDetection(
    assignment.collaboratorId,
    assignment.kpiId,
    assignment.periodId,
    parsedActual
  )

  const proposeMutation = useMutation(
    async (data: { actual?: number; comments?: string; reason?: string; evidenceUrl?: string }) => {
      const response = await api.post(
        `/collaborator-kpis/${assignment.id}/propose`,
        data
      )
      return response.data
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
            fallbackKey: 'propose.error_default',
          }),
          { title: t('common:error_title'), variant: 'danger' }
        )
      },
    }
  )

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!actual.trim()) {
      newErrors.actual = t('propose.error_actual_required')
    } else {
      const value = parseFloat(actual)
      if (isNaN(value)) {
        newErrors.actual = t('propose.error_actual_invalid')
      }
    }

    if (requiresReason && !reason.trim()) {
      newErrors.reason = t('propose.error_reason_required')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      return
    }

    proposeMutation.mutate({
      actual: parseFloat(actual),
      comments: comments.trim() || undefined,
      reason: reason.trim() || undefined,
      evidenceUrl: evidenceUrl.trim() || undefined,
    })
  }

  return (
    <div
      className="modal-overlay"
      onPointerDown={markOverlayPointerDown}
      onClick={(e) => closeOnOverlayClick(e, onClose)}
    >
      <div className="modal-content propose-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('propose.title')}</h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="propose-form">
          <div className="propose-info">
            <p>
              <strong>{t('propose.kpi')}</strong> {assignment.kpiName || `KPI #${assignment.id}`}
            </p>
            <p>
              <strong>{t('propose.target')}</strong> {assignment.target}
            </p>
          </div>

          {outlier.severity !== 'none' && outlier.message && (
            <div className={`outlier-banner outlier-banner-${outlier.severity}`}>
              <span className="outlier-icon">
                {outlier.severity === 'high' ? '⚠️' : outlier.severity === 'medium' ? '🔍' : 'ℹ️'}
              </span>
              <div className="outlier-body">
                <span className="outlier-title">
                  {outlier.severity === 'high'
                    ? t('propose.outlier_high')
                    : outlier.severity === 'medium'
                    ? t('propose.outlier_medium')
                    : t('propose.outlier_low')}
                </span>
                <span className="outlier-message">{outlier.message}</span>
                {outlier.sampleSize > 0 && (
                  <span className="outlier-stats">
                    {t('propose.outlier_mean')} {outlier.mean != null ? new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(outlier.mean) : '-'}
                    {outlier.zScore != null && ` · ${t('propose.outlier_zscore')} ${outlier.zScore.toFixed(2)}`}
                    {` · ${t('propose.outlier_sample', { count: outlier.sampleSize })}`}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="actual">{t('propose.actual_label')}</label>
            <input
              type="number"
              step="any"
              id="actual"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              placeholder={t('propose.actual_placeholder')}
              className={errors.actual ? 'error' : ''}
              autoFocus
            />
            {errors.actual && (
              <span className="error-message">{errors.actual}</span>
            )}
            <small className="form-hint">
              {t('propose.actual_hint')}
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="comments">{t('propose.comments_label')}</label>
            <textarea
              id="comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder={t('propose.comments_placeholder')}
              rows={4}
            />
            <small className="form-hint">
              {t('propose.comments_hint')}
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="reason">
              {t('propose.reason_label')} {requiresReason && t('propose.reason_required_suffix')}
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('propose.reason_placeholder')}
              rows={3}
              className={errors.reason ? 'error' : ''}
            />
            {errors.reason && (
              <span className="error-message">{errors.reason}</span>
            )}
          </div>

          {evidenceEnabled && (
            <div className="form-group">
              <label htmlFor="evidenceUrl">{t('propose.evidence_label')}</label>
              <input
                type="text"
                id="evidenceUrl"
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                placeholder={t('propose.evidence_placeholder')}
              />
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('propose.cancel')}
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={proposeMutation.isLoading}
            >
              {proposeMutation.isLoading ? t('propose.submitting') : t('propose.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
