/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import api from '../services/api'
import { closeOnOverlayClick, markOverlayPointerDown } from '../utils/modal'
import { useDialog } from './Dialog'
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
          error.response?.data?.error ||
            `Error al ${action === 'approve' ? 'aprobar' : 'rechazar'} la asignación.`,
          { title: 'Error', variant: 'danger' }
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
            {action === 'approve' ? 'Aprobar Asignación' : 'Rechazar Asignación'}
          </h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="review-form">
          <div className="review-info">
            <p>
              <strong>Colaborador:</strong>{' '}
              {assignment.collaboratorName || 'N/A'}
            </p>
            <p>
              <strong>KPI:</strong> {assignment.kpiName || 'N/A'}
            </p>
            {assignment.actual !== undefined && (
              <p>
                <strong>Valor Propuesto:</strong> {assignment.actual}
              </p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="comments">
              Comentarios {action === 'reject' && '(Recomendado)'}
            </label>
            <textarea
              id="comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder={
                action === 'approve'
                  ? 'Agrega comentarios sobre la aprobación...'
                  : 'Explica las razones del rechazo...'
              }
              rows={4}
            />
            <small className="form-hint">
              {action === 'approve'
                ? 'Los comentarios son opcionales pero recomendados'
                : 'Es recomendable explicar por qué se rechaza para que el colaborador pueda corregir'}
            </small>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className={action === 'approve' ? 'btn-approve' : 'btn-reject'}
              disabled={reviewMutation.isLoading}
            >
              {reviewMutation.isLoading
                ? action === 'approve'
                  ? 'Aprobando...'
                  : 'Rechazando...'
                : action === 'approve'
                ? 'Aprobar'
                : 'Rechazar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
