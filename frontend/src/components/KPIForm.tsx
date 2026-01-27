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
    periodIds: kpi?.periodIds || [],
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const queryClient = useQueryClient()

  const { data: areas } = useQuery<string[]>(
    ['areas-for-kpi-form'],
    async () => {
      const res = await api.get('/areas')
      return (res.data || []).map((a: { name: string }) => a.name)
    },
    { retry: false }
  )

  const { data: periods } = useQuery(
    ['periods-for-kpi-form'],
    async () => {
      const res = await api.get('/periods')
      return res.data as { id: number; name: string }[]
    },
    { retry: false }
  )

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
      macroKPIId: formData.macroKPIId || undefined,
      description: formData.description || undefined,
      criteria: formData.criteria || undefined,
      formula: formData.formula?.trim() || undefined,
    }

    if (kpi?.id) {
      updateMutation.mutate(submitData)
    } else {
      createMutation.mutate(submitData)
    }
  }

  const availableMacroKPIs = kpis?.filter((item) => item.id !== kpi?.id) || []

  const toggleArea = (area: string, checked: boolean) => {
    const current = new Set(formData.areas || [])
    if (checked) current.add(area)
    else current.delete(area)
    setFormData({ ...formData, areas: Array.from(current) })
  }

  const togglePeriod = (pid: number, checked: boolean) => {
    const current = new Set(formData.periodIds || [])
    if (checked) current.add(pid)
    else current.delete(pid)
    setFormData({ ...formData, periodIds: Array.from(current) })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{kpi?.id ? 'Editar KPI' : 'Crear KPI'}</h2>
          <button className="close-button" onClick={onClose}>
            x
          </button>
        </div>

        <form onSubmit={handleSubmit} className="kpi-form">
          <div className="form-group">
            <label htmlFor="name">Nombre del KPI *</label>
            <input
              type="text"
              id="name"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
              {errors.type && <span className="error-message">{errors.type}</span>}
              <small className="form-hint">
                Crecimiento: mayor es mejor | Reducción: menor es mejor | Exacto: debe alcanzar el valor exacto
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
                    macroKPIId: e.target.value ? parseInt(e.target.value) : undefined,
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
            <label>Áreas</label>
            <div className="checkbox-list">
              {areas?.map((area) => (
                <label key={area} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={formData.areas?.includes(area) || false}
                    onChange={(e) => toggleArea(area, e.target.checked)}
                  />
                  <span>{area}</span>
                </label>
              ))}
            </div>
            <small className="form-hint">Selecciona todas las áreas donde aplica este KPI.</small>
          </div>

          <div className="form-group">
            <label>Períodos</label>
            <div className="checkbox-list">
              {periods?.map((p) => (
                <label key={p.id} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={formData.periodIds?.includes(p.id) || false}
                    onChange={(e) => togglePeriod(p.id, e.target.checked)}
                  />
                  <span>{p.name}</span>
                </label>
              ))}
            </div>
            <small className="form-hint">Selecciona los períodos donde estará vigente este KPI.</small>
          </div>

          <div className="form-group">
            <label htmlFor="criteria">Criterio de Cálculo</label>
            <textarea
              id="criteria"
              value={formData.criteria || ''}
              onChange={(e) => setFormData({ ...formData, criteria: e.target.value })}
              placeholder="Describe cómo se calcula este KPI (fórmulas, reglas, etc.)"
              rows={3}
            />
            <small className="form-hint">Ej: (Actual - Target) / Target * 100 para crecimiento</small>
          </div>

          <div className="form-group">
            <label htmlFor="formula">
              Fórmula Personalizada (Opcional)
              <span className="formula-help-icon" title="Ver ayuda">??</span>
            </label>
            <textarea
              id="formula"
              value={formData.formula || ''}
              onChange={(e) => setFormData({ ...formData, formula: e.target.value })}
              placeholder="Ej: (actual / target) * 100"
              rows={3}
              className={errors.formula ? 'error' : ''}
            />
            {errors.formula && <span className="error-message">{errors.formula}</span>}
            <small className="form-hint">
              <strong>Variables disponibles:</strong> <code>target</code>, <code>actual</code>
              <br />
              <strong>Operadores:</strong> +, -, *, /, ( )
              <br />
              <strong>Ejemplos:</strong>
              <br />
              ➜ Crecimiento: <code>(actual / target) * 100</code>
              <br />
              ➜ Reducción: <code>(target / actual) * 100</code>
              <br />
              ➜ Exacto: <code>100 - (Math.abs(actual - target) / target) * 100</code>
              <br />
              <em>Si se deja vacío, se usará la fórmula por defecto según el tipo de KPI.</em>
            </small>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={createMutation.isLoading || updateMutation.isLoading}>
              {createMutation.isLoading || updateMutation.isLoading ? 'Guardando...' : kpi?.id ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
