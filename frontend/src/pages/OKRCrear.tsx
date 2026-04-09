import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import './OKRCrear.css'

interface Period { id: number; name: string }
interface OrgScope { id: number; name: string }
interface Collaborator { id: number; name: string }
interface CollaboratorKPI { id: number; kpiName: string; collaboratorName: string; target: number }
interface ScopeKPI { id: number; name: string; orgScopeName: string; target: number }

interface KRDraft {
  tempId: string
  title: string
  description: string
  krType: 'simple' | 'kpi_linked'
  startValue: string
  targetValue: string
  unit: string
  collaboratorKpiId: string
  scopeKpiId: string
  weight: string
}

const emptyKR = (): KRDraft => ({
  tempId: Math.random().toString(36).slice(2),
  title: '',
  description: '',
  krType: 'simple',
  startValue: '0',
  targetValue: '',
  unit: '',
  collaboratorKpiId: '',
  scopeKpiId: '',
  weight: '1',
})

export default function OKRCrear() {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const isEdit = !!id
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [periodId, setPeriodId] = useState('')
  const [orgScopeId, setOrgScopeId] = useState('')
  const [ownerId, setOwnerId] = useState(String(user?.id ?? ''))
  const [status, setStatus] = useState<'draft' | 'active'>('active')
  const [krs, setKrs] = useState<KRDraft[]>([emptyKR()])
  const [error, setError] = useState('')

  // Cargar datos existentes en modo edicion
  const { data: existingObjective } = useQuery(
    ['okr-objective-edit', id],
    () => api.get(`/okr/${id}`).then((r) => r.data),
    { enabled: isEdit, retry: false }
  )

  useEffect(() => {
    if (!existingObjective) return
    setTitle(existingObjective.title ?? '')
    setDescription(existingObjective.description ?? '')
    setPeriodId(String(existingObjective.periodId ?? ''))
    setOrgScopeId(String(existingObjective.orgScopeId ?? ''))
    setOwnerId(String(existingObjective.ownerId ?? ''))
    setStatus(existingObjective.status === 'draft' ? 'draft' : 'active')
    if (existingObjective.keyResults && existingObjective.keyResults.length > 0) {
      setKrs(existingObjective.keyResults.map((kr: any) => ({
        tempId: String(kr.id),
        existingId: kr.id,
        title: kr.title ?? '',
        description: kr.description ?? '',
        krType: kr.krType ?? 'simple',
        startValue: String(kr.startValue ?? '0'),
        targetValue: String(kr.targetValue ?? ''),
        unit: kr.unit ?? '',
        collaboratorKpiId: String(kr.collaboratorKpiId ?? ''),
        scopeKpiId: String(kr.scopeKpiId ?? ''),
        weight: String(kr.weight ?? '1'),
      })))
    }
  }, [existingObjective])

  const { data: periods = [] } = useQuery<Period[]>('periods', () =>
    api.get('/periods').then((r) => r.data)
  )
  const { data: scopes = [] } = useQuery<OrgScope[]>('org-scopes', () =>
    api.get('/org-scopes').then((r) => r.data)
  )
  const { data: collaborators = [] } = useQuery<Collaborator[]>('collaborators', () =>
    api.get('/collaborators').then((r) => r.data)
  )
  const { data: collabKpis = [] } = useQuery<CollaboratorKPI[]>(
    ['collab-kpis-for-okr', periodId],
    () => api.get('/collaborator-kpis', { params: { periodId } }).then((r) =>
      r.data.map((ck: any) => ({
        id: ck.id,
        kpiName: ck.kpiName ?? `KPI #${ck.kpiId}`,
        collaboratorName: ck.collaboratorName ?? '',
        target: ck.target,
      }))
    ),
    { enabled: !!periodId }
  )
  const { data: scopeKpis = [] } = useQuery<ScopeKPI[]>(
    ['scope-kpis-for-okr', periodId],
    () => api.get('/scope-kpis', { params: { periodId } }).then((r) =>
      r.data.map((sk: any) => ({
        id: sk.id,
        name: sk.name,
        orgScopeName: sk.orgScopeName ?? '',
        target: sk.target,
      }))
    ),
    { enabled: !!periodId }
  )

  const buildKrPayload = (kr: KRDraft) => ({
    title: kr.title,
    description: kr.description || null,
    krType: kr.krType,
    startValue: kr.krType === 'simple' ? Number(kr.startValue) : null,
    targetValue: kr.krType === 'simple' ? Number(kr.targetValue) : null,
    unit: kr.unit || null,
    collaboratorKpiId: kr.krType === 'kpi_linked' && kr.collaboratorKpiId ? Number(kr.collaboratorKpiId) : null,
    scopeKpiId: kr.krType === 'kpi_linked' && kr.scopeKpiId ? Number(kr.scopeKpiId) : null,
    weight: Number(kr.weight) || 1,
  })

  const createMutation = useMutation(
    async () => {
      const objRes = await api.post('/okr', {
        title,
        description: description || null,
        periodId: Number(periodId),
        orgScopeId: orgScopeId ? Number(orgScopeId) : null,
        ownerId: Number(ownerId),
        status,
      })
      const objectiveId = objRes.data.id
      for (const kr of krs) {
        if (!kr.title.trim()) continue
        await api.post(`/okr/${objectiveId}/key-results`, buildKrPayload(kr))
      }
      return objectiveId
    },
    {
      onSuccess: (objectiveId) => {
        queryClient.invalidateQueries('okr-objectives')
        navigate(`/okr/${objectiveId}`)
      },
      onError: () => setError('Error al guardar el objetivo. Verifica los campos.'),
    }
  )

  const editMutation = useMutation(
    async () => {
      // Actualizar el objetivo
      await api.put(`/okr/${id}`, {
        title,
        description: description || null,
        orgScopeId: orgScopeId ? Number(orgScopeId) : null,
        status,
      })

      const existingKrIds = new Set(
        (existingObjective?.keyResults ?? []).map((kr: any) => kr.id)
      )
      const updatedKrIds = new Set(
        krs.filter((kr) => (kr as any).existingId).map((kr) => Number((kr as any).existingId))
      )

      // Eliminar KRs que fueron quitados
      for (const existingId of existingKrIds) {
        if (!updatedKrIds.has(existingId as number)) {
          await api.delete(`/okr/${id}/key-results/${existingId}`)
        }
      }

      // Actualizar o crear KRs
      for (const kr of krs) {
        if (!kr.title.trim()) continue
        const existingId = (kr as any).existingId
        if (existingId) {
          await api.put(`/okr/${id}/key-results/${existingId}`, buildKrPayload(kr))
        } else {
          await api.post(`/okr/${id}/key-results`, buildKrPayload(kr))
        }
      }

      return Number(id)
    },
    {
      onSuccess: (objectiveId) => {
        queryClient.invalidateQueries('okr-objectives')
        queryClient.invalidateQueries(['okr-objective', String(objectiveId)])
        navigate(`/okr/${objectiveId}`)
      },
      onError: () => setError('Error al actualizar el objetivo. Verifica los campos.'),
    }
  )

  const isSubmitting = createMutation.isLoading || editMutation.isLoading

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!title.trim()) { setError('El titulo es requerido'); return }
    if (!isEdit && !periodId) { setError('El periodo es requerido'); return }
    if (!ownerId) { setError('El responsable es requerido'); return }
    if (isEdit) {
      editMutation.mutate()
    } else {
      createMutation.mutate()
    }
  }

  const updateKR = (tempId: string, field: keyof KRDraft, value: string) => {
    setKrs((prev) => prev.map((kr) => kr.tempId === tempId ? { ...kr, [field]: value } : kr))
  }

  const removeKR = (tempId: string) => {
    setKrs((prev) => prev.filter((kr) => kr.tempId !== tempId))
  }

  return (
    <div className="okr-crear">
      <div className="okr-crear-header">
        <button className="btn-back" onClick={() => navigate('/okr')}>← Volver</button>
        <h2>{isEdit ? 'Editar objetivo' : 'Nuevo objetivo OKR'}</h2>
      </div>

      <form onSubmit={handleSubmit} className="okr-crear-form">
        {error && <div className="okr-error">{error}</div>}

        {/* Objetivo */}
        <section className="okr-section">
          <h3>Objetivo</h3>

          <div className="form-group">
            <label>Titulo *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Aumentar la satisfaccion del cliente en Q1"
            />
          </div>

          <div className="form-group">
            <label>Descripcion</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contexto adicional sobre este objetivo..."
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Periodo {!isEdit && '*'}</label>
              <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} disabled={isEdit}>
                <option value="">Seleccionar...</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {isEdit && <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>El periodo no se puede cambiar</span>}
            </div>

            <div className="form-group">
              <label>Area / Scope</label>
              <select value={orgScopeId} onChange={(e) => setOrgScopeId(e.target.value)}>
                <option value="">Sin scope</option>
                {scopes.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Responsable *</label>
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">Seleccionar...</option>
                {collaborators.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Estado</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option value="active">Activo</option>
                <option value="draft">Borrador</option>
              </select>
            </div>
          </div>
        </section>

        {/* Key Results */}
        <section className="okr-section">
          <div className="okr-kr-section-header">
            <h3>Key Results</h3>
            <button type="button" className="btn-add-kr" onClick={() => setKrs((p) => [...p, emptyKR()])}>
              + Agregar KR
            </button>
          </div>

          {krs.map((kr, idx) => (
            <div key={kr.tempId} className="kr-block">
              <div className="kr-block-header">
                <span className="kr-number">KR {idx + 1}</span>
                {krs.length > 1 && (
                  <button type="button" className="btn-remove-kr" onClick={() => removeKR(kr.tempId)}>
                    Quitar
                  </button>
                )}
              </div>

              <div className="form-group">
                <label>Titulo del KR</label>
                <input
                  type="text"
                  value={kr.title}
                  onChange={(e) => updateKR(kr.tempId, 'title', e.target.value)}
                  placeholder="Ej: Reducir tiempo de respuesta a menos de 2h"
                />
              </div>

              <div className="form-group">
                <label>Tipo de medicion</label>
                <div className="kr-type-toggle">
                  <button
                    type="button"
                    className={`kr-type-btn ${kr.krType === 'simple' ? 'active' : ''}`}
                    onClick={() => updateKR(kr.tempId, 'krType', 'simple')}
                  >
                    Valor manual
                  </button>
                  <button
                    type="button"
                    className={`kr-type-btn ${kr.krType === 'kpi_linked' ? 'active' : ''}`}
                    onClick={() => updateKR(kr.tempId, 'krType', 'kpi_linked')}
                    disabled={!periodId}
                    title={!periodId ? 'Selecciona un periodo primero' : ''}
                  >
                    Vinculado a KPI
                  </button>
                </div>
              </div>

              {kr.krType === 'simple' && (
                <div className="form-row">
                  <div className="form-group">
                    <label>Valor inicial</label>
                    <input type="number" value={kr.startValue} onChange={(e) => updateKR(kr.tempId, 'startValue', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Meta</label>
                    <input type="number" value={kr.targetValue} onChange={(e) => updateKR(kr.tempId, 'targetValue', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Unidad</label>
                    <input type="text" value={kr.unit} onChange={(e) => updateKR(kr.tempId, 'unit', e.target.value)} placeholder="%, tickets, $..." />
                  </div>
                </div>
              )}

              {kr.krType === 'kpi_linked' && (
                <div className="form-row">
                  <div className="form-group">
                    <label>KPI individual (collaborator KPI)</label>
                    <select value={kr.collaboratorKpiId} onChange={(e) => updateKR(kr.tempId, 'collaboratorKpiId', e.target.value)}>
                      <option value="">Sin vinculo individual</option>
                      {collabKpis.map((ck) => (
                        <option key={ck.id} value={ck.id}>
                          {ck.kpiName} — {ck.collaboratorName} (meta: {ck.target})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>KPI grupal (scope KPI)</label>
                    <select value={kr.scopeKpiId} onChange={(e) => updateKR(kr.tempId, 'scopeKpiId', e.target.value)}>
                      <option value="">Sin vinculo grupal</option>
                      {scopeKpis.map((sk) => (
                        <option key={sk.id} value={sk.id}>
                          {sk.name} — {sk.orgScopeName} (meta: {sk.target})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="form-group form-group--small">
                <label>Peso (para progreso del objetivo)</label>
                <input
                  type="number"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={kr.weight}
                  onChange={(e) => updateKR(kr.tempId, 'weight', e.target.value)}
                />
              </div>
            </div>
          ))}
        </section>

        <div className="okr-crear-actions">
          <button type="button" className="btn-secondary" onClick={() => navigate('/okr')}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Guardar objetivo'}
          </button>
        </div>
      </form>
    </div>
  )
}
