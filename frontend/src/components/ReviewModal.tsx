/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { closeOnOverlayClick, markOverlayPointerDown } from '../utils/modal'
import { useDialog } from './Dialog'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import './ReviewModal.css'

interface ReviewModalProps {
  assignment: {
    id: number
    kpiName?: string
    collaboratorName?: string
    actual?: number
    status: string
    comments?: string
  }
  action: 'approve' | 'reject'
  onClose: () => void
  onSuccess?: () => void
}

export default function ReviewModal({
  assignment,
  action,
  onClose,
  onSuccess,
}: ReviewModalProps) {
  const { t } = useTranslation('assignments')
  const [comments, setComments] = useState<string>(assignment.comments || '')

  const queryClient = useQueryClient()
  const dialog = useDialog()

  const reviewMutation = useMutation(
    async (data: { comments?: string }) => {
      const endpoint =
        action === 'approve'
          ? `/collaborator-kpis/${assignment.id}/approve`
          : `/collaborator-kpis/${assignment.id}/reject`
      const response = await api.post(endpoint, data)
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
            fallbackKey: action === 'approve' ? 'review.error_approve' : 'review.error_reject',
          }),
          { title: t('common:error_title'), variant: 'danger' }
        )
      },
    }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    reviewMutation.mutate({
      comments: comments.trim() || undefined,
    })
  }

  return (
    <div
      className="modal-overlay"
      onPointerDown={markOverlayPointerDown}
      onClick={(e) => closeOnOverlayClick(e, onClose)}
    >
      <div className="modal-content review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {action === 'approve' ? t('review.title_approve') : t('review.title_reject')}
          </h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="review-form">
          <div className="review-info">
            <p>
              <strong>{t('review.collaborator')}</strong>{' '}
              {assignment.collaboratorName || 'N/A'}
            </p>
            <p>
              <strong>{t('review.kpi')}</strong> {assignment.kpiName || 'N/A'}
            </p>
            {assignment.actual !== undefined && (
              <p>
                <strong>{t('review.proposed_value')}</strong> {assignment.actual}
              </p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="comments">
              {t('review.comments_label')} {action === 'reject' && t('review.comments_recommended')}
            </label>
            <textarea
              id="comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder={
                action === 'approve'
                  ? t('review.comments_placeholder_approve')
                  : t('review.comments_placeholder_reject')
              }
              rows={4}
            />
            <small className="form-hint">
              {action === 'approve' ? t('review.hint_approve') : t('review.hint_reject')}
            </small>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('review.cancel')}
            </button>
            <button
              type="submit"
              className={action === 'approve' ? 'btn-approve' : 'btn-reject'}
              disabled={reviewMutation.isLoading}
            >
              {reviewMutation.isLoading
                ? action === 'approve'
                  ? t('review.approving')
                  : t('review.rejecting')
                : action === 'approve'
                ? t('review.approve')
                : t('review.reject')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
