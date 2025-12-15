import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import api from '../services/api'
import { KPI } from '../types'
import './KPIForm.css'

interface KPIFormProps {
  kpi?: KPI
  onClose: () => void
  onSuccess?: () => void
}

export default function KPIForm({ kpi, onClose, onSuccess }: KPIFormProps) {
  const [formData, setFormData] = useState<Partial<KPI>>({
    name: kpi?.name || '',
    description: kpi?.description || '',
    type: kpi?.type || 'growth',
    criteria: kpi?.criteria || '',
    formula: kpi?.formula || '',
    macroKPIId: kpi?.macroKPIId || undefined,
    areas: kpi?.areas || [],
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const queryClient = useQueryClient()

  // Obtener lista de KPIs para el selector de macro KPI
  const { data: kpis } = useQuery<KPI[]>(
    ['kpis'],
    async () => {
      const response = await api.get('/kpis')
      return response.data
    },
    {
      retry: false,
    }
  )

  const createMutation = useMutation(
    async (data: Partial<KPI>) => {
      const response = await api.post('/kpis', data)
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('kpis')
        onSuccess?.()
        onClose()
      },
    }
  )

  const updateMutation = useMutation(
    async (data: Partial<KPI>) => {
      const response = await api.put(`/kpis/${kpi?.id}`, data)
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('kpis')
        onSuccess?.()
        onClose()
      },
    }
  )

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name?.trim()) {
      newErrors.name = 'El nombre es requerido'
    }

    if (!formData.type) {
      newErrors.type = 'El tipo es requerido'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      return
    }

    const submitData = {
      ...formData,
      macroKPIId: formData.macroKPIId || null,
      description: formData.description || null,
      criteria: formData.criteria || null,
      formula: formData.formula?.trim() || null,
    }

    if (kpi?.id) {
      updateMutation.mutate(submitData)
    } else {
      createMutation.mutate(submitData)
    }
  }

  // Filtrar KPIs para el selector de macro KPI (excluir el actual si está editando)
  const availableMacroKPIs = kpis?.filter((k) => k.id !== kpi?.id) || []

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{kpi?.id ? 'Editar KPI' : 'Crear KPI'}</h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="kpi-form">
          <div className="form-group">
            <label htmlFor="name">Nombre del KPI *</label>
            <input
              type="text"
              id="name"
              value={formData.name || ''}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="Ej: Tiempo de respuesta promedio"
              className={errors.name ? 'error' : ''}
            />
            {errors.name && <span className="error-message">{errors.name}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="description">Descripción</label>
            <textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Describe el KPI y cómo se mide..."
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="type">Tipo de KPI *</label>
              <select
                id="type"
                value={formData.type || 'growth'}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    type: e.target.value as KPI['type'],
                  })
                }
                className={errors.type ? 'error' : ''}
              >
                <option value="growth">Crecimiento</option>
                <option value="reduction">Reducción</option>
                <option value="exact">Exacto</option>
              </select>
              {errors.type && (
                <span className="error-message">{errors.type}</span>
              )}
              <small className="form-hint">
                Crecimiento: mayor es mejor | Reducción: menor es mejor |
                Exacto: debe alcanzar el valor exacto
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="macroKPIId">KPI Macro (Opcional)</label>
              <select
                id="macroKPIId"
                value={formData.macroKPIId || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    macroKPIId: e.target.value
                      ? parseInt(e.target.value)
                      : undefined,
                  })
                }
              >
                <option value="">Sin KPI macro</option>
                {availableMacroKPIs.map((macroKPI) => (
                  <option key={macroKPI.id} value={macroKPI.id}>
                    {macroKPI.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="areas">Áreas</label>
            <input
              type="text"
              id="areas"
              value={(formData.areas || []).join(', ')}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  areas: e.target.value
                    .split(',')
                    .map((a) => a.trim())
                    .filter((a) => a.length > 0),
                })
              }
              placeholder="Ej: QA, Desarrollo, Producto"
            />
            <small className="form-hint">Separa múltiples áreas con coma.</small>
          </div>

          <div className="form-group">
            <label htmlFor="criteria">Criterio de Cálculo</label>
            <textarea
              id="criteria"
              value={formData.criteria || ''}
              onChange={(e) =>
                setFormData({ ...formData, criteria: e.target.value })
              }
              placeholder="Describe cómo se calcula este KPI (fórmulas, reglas, etc.)"
              rows={3}
            />
            <small className="form-hint">
              Ej: (Actual - Target) / Target * 100 para crecimiento
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="formula">
              Fórmula Personalizada (Opcional)
              <span className="formula-help-icon" title="Ver ayuda">ℹ️</span>
            </label>
            <textarea
              id="formula"
              value={formData.formula || ''}
              onChange={(e) =>
                setFormData({ ...formData, formula: e.target.value })
              }
              placeholder="Ej: (actual / target) * 100"
              rows={3}
              className={errors.formula ? 'error' : ''}
            />
            {errors.formula && (
              <span className="error-message">{errors.formula}</span>
            )}
            <small className="form-hint">
              <strong>Variables disponibles:</strong> <code>target</code>,{' '}
              <code>actual</code>
              <br />
              <strong>Operadores:</strong> +, -, *, /, ( )
              <br />
              <strong>Ejemplos:</strong>
              <br />
              • Crecimiento: <code>(actual / target) * 100</code>
              <br />
              • Reducción: <code>(target / actual) * 100</code>
              <br />
              • Exacto: <code>100 - (Math.abs(actual - target) / target) * 100</code>
              <br />
              <em>
                Si se deja vacío, se usará la fórmula por defecto según el tipo
                de KPI.
              </em>
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
                : kpi?.id
                ? 'Actualizar'
                : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
