/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import api from '../services/api'
import { ScopeKPI } from '../types'
import './MacroKPIForm.css'

type ScopeKPIFormProps = {
  scopeKpi?: ScopeKPI
  defaultPeriodId?: number | null
  defaultScopeId?: number | null
  onClose: () => void
  onSuccess?: () => void
}

export default function ScopeKPIForm({
  scopeKpi,
  defaultPeriodId,
  defaultScopeId,
  onClose,
  onSuccess,
}: ScopeKPIFormProps) {
  const queryClient = useQueryClient()
  const initialMixedConfig = scopeKpi?.mixedConfig || {
    directWeight: 50,
    aggregatedWeight: 50,
    directLabel: 'Componente directo',
    aggregatedLabel: 'Componente agregado',
  }
  const [formData, setFormData] = useState({
    name: scopeKpi?.name || '',
    description: scopeKpi?.description || '',
    kpiId: scopeKpi?.kpiId || 0,
    orgScopeId: scopeKpi?.orgScopeId || defaultScopeId || 0,
    periodId: scopeKpi?.periodId || defaultPeriodId || 0,
    subPeriodId: scopeKpi?.subPeriodId || '',
    ownerLevel: scopeKpi?.ownerLevel || 'area',
    sourceMode: scopeKpi?.sourceMode || 'direct',
    target: scopeKpi?.target ?? 0,
    weight: scopeKpi?.weight ?? 0,
    status: scopeKpi?.status || 'draft',
    curationStatus: scopeKpi?.curationStatus || 'pending',
    actualValue: scopeKpi?.sourceMode === 'mixed' ? scopeKpi?.directActual ?? '' : scopeKpi?.actual ?? '',
    directWeight: initialMixedConfig.directWeight ?? 50,
    aggregatedWeight: initialMixedConfig.aggregatedWeight ?? 50,
    directLabel: initialMixedConfig.directLabel || 'Componente directo',
    aggregatedLabel: initialMixedConfig.aggregatedLabel || 'Componente agregado',
  })
  const [error, setError] = useState<string | null>(null)

  const { data: kpis } = useQuery('kpis', async () => (await api.get('/kpis')).data)
  const { data: orgScopes } = useQuery('org-scopes', async () => (await api.get('/org-scopes')).data)
  const { data: periods } = useQuery('periods', async () => (await api.get('/periods')).data)
  const { data: subPeriods } = useQuery(
    ['scope-form-subperiods', formData.periodId, formData.orgScopeId],
    async () => {
      if (!formData.periodId) return []
      const selectedScope = (orgScopes || []).find((scope: any) => Number(scope.id) === Number(formData.orgScopeId))
      const response = await api.get(`/periods/${formData.periodId}/sub-periods`, {
        params: { calendarProfileId: selectedScope?.calendarProfileId || undefined },
      })
      return response.data
    },
    { enabled: !!formData.periodId }
  )

  useEffect(() => {
    if (!formData.name && formData.kpiId && Array.isArray(kpis)) {
      const match = kpis.find((item: any) => Number(item.id) === Number(formData.kpiId))
      if (match) {
        setFormData((prev) => ({ ...prev, name: match.name }))
      }
    }
  }, [formData.kpiId, formData.name, kpis])

  const mutation = useMutation(
    async () => {
      const payload = {
        name: formData.name,
        description: formData.description || null,
        kpiId: Number(formData.kpiId),
        orgScopeId: Number(formData.orgScopeId),
        periodId: Number(formData.periodId),
        subPeriodId: formData.subPeriodId ? Number(formData.subPeriodId) : null,
        ownerLevel: formData.ownerLevel,
        sourceMode: formData.sourceMode,
        target: Number(formData.target),
        weight: Number(formData.weight),
        status: formData.status,
        curationStatus: formData.curationStatus,
        mixedConfig:
          formData.sourceMode === 'mixed'
            ? {
                directWeight: Number(formData.directWeight),
                aggregatedWeight: Number(formData.aggregatedWeight),
                directLabel: formData.directLabel || null,
                aggregatedLabel: formData.aggregatedLabel || null,
              }
            : null,
      }
      if (!payload.name || !payload.kpiId || !payload.orgScopeId || !payload.periodId) {
        throw new Error('Completá nombre, KPI, área/equipo y período')
      }
      if (payload.sourceMode === 'mixed' && payload.mixedConfig) {
        const totalWeight = Number(payload.mixedConfig.directWeight || 0) + Number(payload.mixedConfig.aggregatedWeight || 0)
        if (totalWeight <= 0) {
          throw new Error('En modo mixed, los pesos directo y agregado deben sumar más de 0')
        }
      }
      const response = scopeKpi
        ? await api.put(`/scope-kpis/${scopeKpi.id}`, payload)
        : await api.post('/scope-kpis', payload)
      const id = scopeKpi?.id || response.data.id
      if (formData.actualValue !== '' && formData.actualValue !== null && formData.actualValue !== undefined) {
        await api.post('/measurements', {
          scopeKpiId: id,
          value: Number(formData.actualValue),
          mode: 'manual',
          status: 'approved',
        })
      }
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('scope-kpis')
        queryClient.invalidateQueries('measurements')
        onSuccess?.()
        onClose()
      },
      onError: (err: any) => {
        setError(err?.response?.data?.error || err?.message || 'Error al guardar el KPI Grupal')
      },
    }
  )

  return (
    <div className="macro-form-overlay">
      <div className="macro-form-modal">
        <div className="macro-form-header">
          <h2>{scopeKpi ? 'Editar KPI Grupal' : 'Nuevo KPI Grupal'}</h2>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="macro-form-grid">
          <label>
            Nombre
            <input value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} />
          </label>
          <label>
            KPI base
            <select value={formData.kpiId} onChange={(e) => setFormData((prev) => ({ ...prev, kpiId: Number(e.target.value) }))}>
              <option value={0}>Selecciona un KPI</option>
              {(kpis || []).map((kpi: any) => (
                <option key={kpi.id} value={kpi.id}>
                  {kpi.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Área / Equipo
            <select value={formData.orgScopeId} onChange={(e) => setFormData((prev) => ({ ...prev, orgScopeId: Number(e.target.value) }))}>
              <option value={0}>Seleccioná un área o equipo</option>
              {(orgScopes || []).map((scope: any) => (
                <option key={scope.id} value={scope.id}>
                  {scope.name} ({scope.type})
                </option>
              ))}
            </select>
          </label>
          <label>
            Período
            <select value={formData.periodId} onChange={(e) => setFormData((prev) => ({ ...prev, periodId: Number(e.target.value) }))}>
              <option value={0}>Selecciona un período</option>
              {(periods || []).map((period: any) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Subperíodo
            <select value={formData.subPeriodId} onChange={(e) => setFormData((prev) => ({ ...prev, subPeriodId: e.target.value }))}>
              <option value="">Sin subperíodo</option>
              {(subPeriods || []).map((subPeriod: any) => (
                <option key={subPeriod.id} value={subPeriod.id}>
                  {subPeriod.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Owner level
            <select value={formData.ownerLevel} onChange={(e) => setFormData((prev) => ({ ...prev, ownerLevel: e.target.value as any }))}>
              <option value="team">Team</option>
              <option value="area">Area</option>
              <option value="business_unit">Business Unit</option>
              <option value="company">Company</option>
              <option value="executive">Executive</option>
            </select>
          </label>
          <label>
            Source mode
            <select value={formData.sourceMode} onChange={(e) => setFormData((prev) => ({ ...prev, sourceMode: e.target.value as any }))}>
              <option value="direct">Direct</option>
              <option value="aggregated">Aggregated</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>
          <label>
            Target
            <input type="number" value={formData.target} onChange={(e) => setFormData((prev) => ({ ...prev, target: Number(e.target.value) }))} />
          </label>
          <label>
            Peso
            <input type="number" value={formData.weight} onChange={(e) => setFormData((prev) => ({ ...prev, weight: Number(e.target.value) }))} />
          </label>
          <label>
            Estado
            <select value={formData.status} onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value as any }))}>
              <option value="draft">Borrador</option>
              <option value="proposed">Propuesto</option>
              <option value="approved">Aprobado</option>
              <option value="closed">Cerrado</option>
            </select>
          </label>
          <label>
            Curaduría
            <select value={formData.curationStatus} onChange={(e) => setFormData((prev) => ({ ...prev, curationStatus: e.target.value as any }))}>
              <option value="pending">Pendiente</option>
              <option value="in_review">En revisión</option>
              <option value="approved">Aprobada</option>
              <option value="rejected">Rechazada</option>
            </select>
          </label>
          <label>
            {formData.sourceMode === 'mixed' ? 'Actual directo inicial' : 'Actual inicial'}
            <input
              type="number"
              value={formData.actualValue}
              onChange={(e) => setFormData((prev) => ({ ...prev, actualValue: e.target.value }))}
            />
          </label>
          {formData.sourceMode === 'mixed' ? (
            <>
              <div className="macro-form-span macro-form-note">
                El valor manual/integrado se tomará como componente directo. La agregación desde links completará el componente agregado.
              </div>
              <label>
                Peso directo
                <input
                  type="number"
                  value={formData.directWeight}
                  onChange={(e) => setFormData((prev) => ({ ...prev, directWeight: Number(e.target.value) }))}
                />
              </label>
              <label>
                Peso agregado
                <input
                  type="number"
                  value={formData.aggregatedWeight}
                  onChange={(e) => setFormData((prev) => ({ ...prev, aggregatedWeight: Number(e.target.value) }))}
                />
              </label>
              <label>
                Etiqueta directo
                <input
                  value={formData.directLabel}
                  onChange={(e) => setFormData((prev) => ({ ...prev, directLabel: e.target.value }))}
                />
              </label>
              <label>
                Etiqueta agregado
                <input
                  value={formData.aggregatedLabel}
                  onChange={(e) => setFormData((prev) => ({ ...prev, aggregatedLabel: e.target.value }))}
                />
              </label>
            </>
          ) : null}
          <label className="macro-form-span">
            Descripción
            <textarea value={formData.description} onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))} rows={3} />
          </label>
        </div>
        {error && <div className="error-message">{error}</div>}
        <div className="macro-form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isLoading}>
            {mutation.isLoading ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
