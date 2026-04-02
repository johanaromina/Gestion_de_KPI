/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import api from '../services/api'
import { ScopeKPILink } from '../types'
import './MacroKPIForm.css'

type ScopeKPILinksFormProps = {
  scopeKpiId: number
  periodId: number
  onClose: () => void
}

export default function ScopeKPILinksForm({ scopeKpiId, periodId, onClose }: ScopeKPILinksFormProps) {
  const queryClient = useQueryClient()
  const [editingLink, setEditingLink] = useState<ScopeKPILink | null>(null)
  const [formData, setFormData] = useState({
    childType: 'collaborator',
    collaboratorAssignmentId: '',
    childScopeKpiId: '',
    contributionWeight: '',
    aggregationMethod: 'weighted_avg',
    sortOrder: 0,
  })

  const { data: links } = useQuery(['scope-kpi-links', scopeKpiId], async () => (await api.get(`/scope-kpis/${scopeKpiId}/links`)).data)
  const { data: collaboratorAssignments } = useQuery(
    ['collaborator-kpis', periodId],
    async () => (await api.get(`/collaborator-kpis/period/${periodId}`)).data,
    { enabled: !!periodId }
  )
  const { data: scopeOptions } = useQuery(
    ['scope-kpis', periodId],
    async () => (await api.get('/scope-kpis', { params: { periodId } })).data,
    { enabled: !!periodId }
  )

  const availableScopeOptions = useMemo(
    () => (scopeOptions || []).filter((item: any) => Number(item.id) !== Number(scopeKpiId)),
    [scopeOptions, scopeKpiId]
  )

  const resetForm = () => {
    setEditingLink(null)
    setFormData({
      childType: 'collaborator',
      collaboratorAssignmentId: '',
      childScopeKpiId: '',
      contributionWeight: '',
      aggregationMethod: 'weighted_avg',
      sortOrder: 0,
    })
  }

  const mutation = useMutation(
    async () => {
      const payload = {
        childType: formData.childType,
        collaboratorAssignmentId: formData.childType === 'collaborator' ? Number(formData.collaboratorAssignmentId) : null,
        childScopeKpiId: formData.childType === 'scope' ? Number(formData.childScopeKpiId) : null,
        contributionWeight: formData.contributionWeight === '' ? null : Number(formData.contributionWeight),
        aggregationMethod: formData.aggregationMethod,
        sortOrder: Number(formData.sortOrder) || 0,
      }
      if (editingLink) {
        await api.put(`/scope-kpis/links/${editingLink.id}`, payload)
      } else {
        await api.post(`/scope-kpis/${scopeKpiId}/links`, payload)
      }
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['scope-kpi-links', scopeKpiId])
        resetForm()
      },
    }
  )

  const deleteMutation = useMutation(async (id: number) => api.delete(`/scope-kpis/links/${id}`), {
    onSuccess: () => {
      queryClient.invalidateQueries(['scope-kpi-links', scopeKpiId])
    },
  })

  const recalcMutation = useMutation(async () => api.post(`/scope-kpis/${scopeKpiId}/recalculate`), {
    onSuccess: () => {
      queryClient.invalidateQueries('scope-kpis')
    },
  })

  return (
    <div className="macro-form-overlay">
      <div className="macro-form-modal macro-links-modal">
        <div className="macro-form-header">
          <h2>Contribuciones del KPI Grupal</h2>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="macro-form-grid">
          <label>
            Tipo de hijo
            <select value={formData.childType} onChange={(e) => setFormData((prev) => ({ ...prev, childType: e.target.value }))}>
              <option value="collaborator">KPI colaborador</option>
              <option value="scope">KPI Grupal</option>
            </select>
          </label>
          {formData.childType === 'collaborator' ? (
            <label className="macro-form-span">
              Asignación colaborador
              <select value={formData.collaboratorAssignmentId} onChange={(e) => setFormData((prev) => ({ ...prev, collaboratorAssignmentId: e.target.value }))}>
                <option value="">Selecciona una asignación</option>
                {(collaboratorAssignments || []).map((item: any) => (
                  <option key={item.id} value={item.id}>
                    {item.collaboratorName || item.collaboratorId} - {item.kpiName || item.kpiId}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="macro-form-span">
              KPI Grupal hijo
              <select value={formData.childScopeKpiId} onChange={(e) => setFormData((prev) => ({ ...prev, childScopeKpiId: e.target.value }))}>
                <option value="">Seleccioná un KPI Grupal</option>
                {(availableScopeOptions || []).map((item: any) => (
                  <option key={item.id} value={item.id}>
                    {item.name} - {item.orgScopeName || item.orgScopeId}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Método
            <select value={formData.aggregationMethod} onChange={(e) => setFormData((prev) => ({ ...prev, aggregationMethod: e.target.value }))}>
              <option value="weighted_avg">Weighted avg</option>
              <option value="avg">Avg</option>
              <option value="sum">Sum</option>
            </select>
          </label>
          <label>
            Peso de contribución
            <input value={formData.contributionWeight} onChange={(e) => setFormData((prev) => ({ ...prev, contributionWeight: e.target.value }))} />
          </label>
          <label>
            Orden
            <input type="number" value={formData.sortOrder} onChange={(e) => setFormData((prev) => ({ ...prev, sortOrder: Number(e.target.value) }))} />
          </label>
        </div>
        <div className="macro-form-actions">
          <button type="button" className="btn-secondary" onClick={resetForm}>
            Limpiar
          </button>
          <button type="button" className="btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isLoading}>
            {mutation.isLoading ? 'Guardando...' : editingLink ? 'Actualizar link' : 'Agregar link'}
          </button>
          <button type="button" className="btn-primary" onClick={() => recalcMutation.mutate()} disabled={recalcMutation.isLoading}>
            {recalcMutation.isLoading ? 'Recalculando...' : 'Recalcular'}
          </button>
        </div>
        <div className="table-container">
          <table className="data-table compact">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Origen</th>
                <th>Método</th>
                <th>Peso</th>
                <th>Orden</th>
                <th className="actions-column">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(links || []).map((link: ScopeKPILink) => (
                <tr key={link.id}>
                  <td>{link.childType}</td>
                  <td>{link.childType === 'collaborator' ? `${link.collaboratorName || '-'} / ${link.collaboratorKpiName || '-'}` : link.childScopeKpiName || '-'}</td>
                  <td>{link.aggregationMethod}</td>
                  <td>{link.contributionWeight ?? '-'}</td>
                  <td>{link.sortOrder ?? 0}</td>
                  <td className="actions-column">
                    <div className="action-buttons">
                      <button
                        type="button"
                        className="action-button edit"
                        onClick={() => {
                          setEditingLink(link)
                          setFormData({
                            childType: link.childType,
                            collaboratorAssignmentId: String(link.collaboratorAssignmentId || ''),
                            childScopeKpiId: String(link.childScopeKpiId || ''),
                            contributionWeight: String(link.contributionWeight ?? ''),
                            aggregationMethod: link.aggregationMethod,
                            sortOrder: Number(link.sortOrder || 0),
                          })
                        }}
                      >
                        Editar
                      </button>
                      <button type="button" className="action-button delete" onClick={() => deleteMutation.mutate(link.id)}>
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
