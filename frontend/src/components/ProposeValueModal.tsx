import { useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import api from '../services/api'
import './ProposeValueModal.css'

interface ProposeValueModalProps {
  assignment: {
    id: number
    kpiName?: string
    target: number
    actual?: number
    status: string
  }
  onClose: () => void
  onSuccess?: () => void
}

export default function ProposeValueModal({
  assignment,
  onClose,
  onSuccess,
}: ProposeValueModalProps) {
  const [actual, setActual] = useState<string>(
    assignment.actual?.toString() || ''
  )
  const [comments, setComments] = useState<string>('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const queryClient = useQueryClient()

  const proposeMutation = useMutation(
    async (data: { actual?: number; comments?: string }) => {
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
        alert(
          error.response?.data?.error ||
            'Error al proponer valores. Verifica que el período no esté cerrado.'
        )
      },
    }
  )

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!actual.trim()) {
      newErrors.actual = 'El valor actual es requerido'
    } else {
      const value = parseFloat(actual)
      if (isNaN(value)) {
        newErrors.actual = 'Debe ser un número válido'
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

    proposeMutation.mutate({
      actual: parseFloat(actual),
      comments: comments.trim() || undefined,
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content propose-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Proponer Valores</h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="propose-form">
          <div className="propose-info">
            <p>
              <strong>KPI:</strong> {assignment.kpiName || `KPI #${assignment.id}`}
            </p>
            <p>
              <strong>Target:</strong> {assignment.target}
            </p>
          </div>

          <div className="form-group">
            <label htmlFor="actual">Valor Actual (Alcance) *</label>
            <input
              type="number"
              step="any"
              id="actual"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              placeholder="Ingresa el valor alcanzado"
              className={errors.actual ? 'error' : ''}
              autoFocus
            />
            {errors.actual && (
              <span className="error-message">{errors.actual}</span>
            )}
            <small className="form-hint">
              Este valor será propuesto para revisión por tu jefe
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="comments">Comentarios (Opcional)</label>
            <textarea
              id="comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Agrega comentarios sobre este valor propuesto..."
              rows={4}
            />
            <small className="form-hint">
              Explica el contexto o razones de este valor propuesto
            </small>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={proposeMutation.isLoading}
            >
              {proposeMutation.isLoading ? 'Proponiendo...' : 'Proponer Valores'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

