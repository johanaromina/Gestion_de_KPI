import { useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
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
  const [confirmText, setConfirmText] = useState('')
  const requiredText = 'CERRAR'

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
          <h2>⚠️ Cerrar Parrilla</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="close-parrilla-form">
          <div className="warning-message">
            <p>
              <strong>¿Estás seguro de cerrar esta parrilla?</strong>
            </p>
            <p>
              Una vez cerrada, no se podrán realizar ediciones a menos que un
              administrador o director la reabra.
            </p>
          </div>

          <div className="parrilla-info">
            <div className="info-row">
              <span className="info-label">Período:</span>
              <span className="info-value">{periodName || `Período #${periodId}`}</span>
            </div>
            {collaboratorId && (
              <div className="info-row">
                <span className="info-label">Colaborador:</span>
                <span className="info-value">
                  {collaboratorName || `Colaborador #${collaboratorId}`}
                </span>
              </div>
            )}
            {!collaboratorId && (
              <div className="info-row">
                <span className="info-label">Alcance:</span>
                <span className="info-value">Todos los colaboradores del período</span>
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="confirm">
              Escribe <strong>{requiredText}</strong> para confirmar:
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
                Debes escribir exactamente "{requiredText}"
              </span>
            )}
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-danger"
              disabled={!isConfirmValid || closeMutation.isLoading}
            >
              {closeMutation.isLoading ? 'Cerrando...' : 'Cerrar Parrilla'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

