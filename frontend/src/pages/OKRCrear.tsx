import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { useDialog } from '../components/Dialog'
import './OKRCrear.css'

interface Period { id: number; name: string }
interface OrgScope { id: number; name: string }
interface Collaborator { id: number; name: string }
interface CollaboratorKPI { id: number; kpiName: string; collaboratorName: string; target: number }
interface ScopeKPI { id: number; name: string; orgScopeName: string; target: number }

interface KpiLink { type: 'collaborator' | 'scope'; id: number; label: string; weight?: number }

interface KRDraft {
  tempId: string
  title: string
  description: string
  krType: 'simple' | 'kpi_linked'
  startValue: string
  targetValue: string
  unit: string
  kpiLinks: KpiLink[]
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
  kpiLinks: [],
  weight: '100',
})

export default function OKRCrear() {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const isEdit = !!id
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const dialog = useDialog()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [periodId, setPeriodId] = useState('')
  const [orgScopeId, setOrgScopeId] = useState('')
  const [ownerId, setOwnerId] = useState(String(user?.id ?? ''))
  const [parentId, setParentId] = useState('')
  const [status, setStatus] = useState<'draft' | 'active'>('active')
  const [krs, setKrs] = useState<KRDraft[]>([emptyKR()])
  const [error, setError] = useState('')
  const [krErrors, setKrErrors] = useState<Record<string, string>>({})

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
    setParentId(String(existingObjective.parentId ?? ''))
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
        kpiLinks: (kr.linkedKpis ?? []).map((lk: any) => ({
          type: lk.type as 'collaborator' | 'scope',
          id: lk.collaboratorKpiId ?? lk.scopeKpiId ?? lk.id,
          label: lk.kpiName
            ? `${lk.kpiName}${lk.sourceName ? ` — ${lk.sourceName}` : ''}`
            : lk.sourceName
              ? `KPI — ${lk.sourceName}`
              : `KPI #${lk.collaboratorKpiId ?? lk.scopeKpiId ?? lk.id}`,
          weight: Math.round((lk.kpiWeight ?? 1) * 100),
        })),
        weight: String(Math.round((kr.weight ?? 1) * 100)),
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

  // Objetivos del mismo período para selector de padre (excluye el actual en edición)
  const { data: siblingObjectives = [] } = useQuery<{ id: number; title: string }[]>(
    ['okr-objectives-for-parent', periodId],
    () => api.get('/okr', { params: { periodId } }).then((r) => r.data),
    { enabled: !!periodId }
  )
  const parentOptions = siblingObjectives.filter((o) => !id || String(o.id) !== id)

  const buildKrPayload = (kr: KRDraft) => ({
    title: kr.title,
    description: kr.description || null,
    krType: kr.krType,
    startValue: kr.krType === 'simple' ? Number(kr.startValue) : null,
    targetValue: kr.krType === 'simple' ? Number(kr.targetValue) : null,
    unit: kr.unit || null,
    kpiLinks: kr.krType === 'kpi_linked'
      ? kr.kpiLinks.map((lk) => ({ ...lk, weight: (Number(lk.weight ?? 100)) / 100 }))
      : [],
    weight: (Number(kr.weight) || 100) / 100,
  })

  const addKpiLink = (tempId: string, link: KpiLink) => {
    setKrs((prev) => prev.map((kr) => {
      if (kr.tempId !== tempId) return kr
      if (kr.kpiLinks.some((l) => l.type === link.type && l.id === link.id)) return kr
      return { ...kr, kpiLinks: [...kr.kpiLinks, link] }
    }))
  }

  const removeKpiLink = (tempId: string, type: string, linkId: number) => {
    setKrs((prev) => prev.map((kr) =>
      kr.tempId !== tempId ? kr : { ...kr, kpiLinks: kr.kpiLinks.filter((l) => !(l.type === type && l.id === linkId)) }
    ))
  }

  const updateKpiLinkWeight = (tempId: string, type: string, linkId: number, weight: number) => {
    setKrs((prev) => prev.map((kr) => {
      if (kr.tempId !== tempId) return kr
      return { ...kr, kpiLinks: kr.kpiLinks.map((l) => l.type === type && l.id === linkId ? { ...l, weight } : l) }
    }))
  }

  const getKrWeightWarning = (drafts: KRDraft[]) => {
    const validKrs = drafts.filter((kr) => kr.title.trim())
    if (validKrs.length <= 1) return null
    const totalKrWeight = validKrs.reduce((sum, kr) => sum + Number(kr.weight ?? 0), 0)
    if (Math.abs(totalKrWeight - 100) <= 0.5) return null
    return `Advertencia: la suma de los pesos de los KRs es ${totalKrWeight.toFixed(0)}%. Se va a guardar igual, pero se recomienda dejarla en 100% cuando termines de redistribuirlos.`
  }

  const createMutation = useMutation(
    async () => {
      const objRes = await api.post('/okr', {
        title,
        description: description || null,
        periodId: Number(periodId),
        orgScopeId: orgScopeId ? Number(orgScopeId) : null,
        ownerId: Number(ownerId),
        parentId: parentId ? Number(parentId) : null,
        status,
      })
      const objectiveId = objRes.data.id
      const krFailures: string[] = []
      for (const kr of krs) {
        if (!kr.title.trim()) continue
        try {
          await api.post(`/okr/${objectiveId}/key-results`, buildKrPayload(kr))
        } catch (krErr: any) {
          const msg = krErr?.response?.data?.error || `Error al guardar el KR "${kr.title}"`
          krFailures.push(msg)
        }
      }
      return { objectiveId, krFailures }
    },
    {
      onSuccess: ({ objectiveId, krFailures }) => {
        queryClient.invalidateQueries('okr-objectives')
        if (krFailures.length > 0) {
          setError(`El objetivo fue guardado, pero algunos Key Results no pudieron cargarse: ${krFailures.join(' | ')}`)
        }
        navigate(`/okr/${objectiveId}`)
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || 'No se pudo guardar el objetivo. Verificá los datos e intentá de nuevo.'
        setError(msg)
      },
    }
  )

  const editMutation = useMutation(
    async () => {
      // Actualizar el objetivo
      await api.put(`/okr/${id}`, {
        title,
        description: description || null,
        orgScopeId: orgScopeId ? Number(orgScopeId) : null,
        ownerId: Number(ownerId),
        parentId: parentId ? Number(parentId) : null,
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
      onError: (err: any) => {
        const msg = err?.response?.data?.error || 'No se pudo actualizar el objetivo. Verificá los datos e intentá de nuevo.'
        setError(msg)
      },
    }
  )

  const isSubmitting = createMutation.isLoading || editMutation.isLoading

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setKrErrors({})

    if (!title.trim()) { setError('El título es requerido'); return }
    if (!isEdit && !periodId) { setError('El período es requerido'); return }
    if (!ownerId) { setError('El responsable es requerido'); return }

    // Validar KRs numéricos
    const newKrErrors: Record<string, string> = {}
    for (const kr of krs) {
      if (!kr.title.trim()) continue
      const w = Number(kr.weight)
      if (w <= 0 || w > 100) {
        newKrErrors[kr.tempId] = 'El peso del KR debe estar entre 1 y 100 (%)'
        continue
      }
      if (kr.krType === 'simple') {
        const start = Number(kr.startValue)
        const target = Number(kr.targetValue)
        if (!kr.targetValue) {
          newKrErrors[kr.tempId] = 'La meta es requerida'
        } else if (target === start) {
          newKrErrors[kr.tempId] = `La meta no puede ser igual al valor inicial (${start})`
        }
      }
      if (kr.krType === 'kpi_linked' && kr.kpiLinks.length > 1) {
        const badLink = kr.kpiLinks.find((lk) => { const lw = Number(lk.weight ?? 100); return lw <= 0 || lw > 100 })
        if (badLink) {
          newKrErrors[kr.tempId] = 'El peso de cada KPI vinculado debe estar entre 1 y 100 (%)'
        } else {
          const totalKpiWeight = kr.kpiLinks.reduce((sum, lk) => sum + Number(lk.weight ?? 100), 0)
          if (Math.abs(totalKpiWeight - 100) > 0.5) {
            newKrErrors[kr.tempId] = `Los pesos de los KPIs deben sumar 100% (actualmente suman ${totalKpiWeight}%)`
          }
        }
      }
    }
    if (Object.keys(newKrErrors).length > 0) {
      setKrErrors(newKrErrors)
      setError('Corregí los errores en los Key Results')
      return
    }

    const krWeightWarning = getKrWeightWarning(krs)
    if (krWeightWarning) {
      await dialog.alert(krWeightWarning, { title: 'Advertencia de pesos', variant: 'warning' })
    }

    if (isEdit) {
      editMutation.mutate()
    } else {
      createMutation.mutate()
    }
  }

  const updateKR = (tempId: string, field: keyof KRDraft, value: string) => {
    setKrs((prev) => prev.map((kr) => kr.tempId === tempId ? { ...kr, [field]: value } : kr))
    // limpiar error del KR al editar
    setKrErrors((prev) => { const next = { ...prev }; delete next[tempId]; return next })
  }

  const removeKR = async (tempId: string, hasTitle: boolean) => {
    if (hasTitle) {
      const ok = await dialog.confirm('¿Eliminar este Key Result?', {
        title: 'Quitar KR',
        confirmLabel: 'Eliminar',
        variant: 'danger',
      })
      if (!ok) return
    }
    setKrs((prev) => prev.filter((kr) => kr.tempId !== tempId))
    setKrErrors((prev) => { const next = { ...prev }; delete next[tempId]; return next })
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

          {parentOptions.length > 0 && (
            <div className="form-group">
              <label>Objetivo padre <span className="form-label-optional">(opcional)</span></label>
              <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">— Sin padre (objetivo raíz) —</option>
                {parentOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.title}</option>
                ))}
              </select>
              <small className="form-hint">
                Usalo para crear un objetivo subordinado a otro del mismo período. Los objetivos padre muestran el progreso agregado de sus hijos en el árbol de alineación.
              </small>
            </div>
          )}
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
                  <button type="button" className="btn-remove-kr" onClick={() => removeKR(kr.tempId, !!kr.title.trim())}>
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
                <label>Tipo de medición</label>
                <div className="kr-type-toggle">
                  <button
                    type="button"
                    className={`kr-type-btn ${kr.krType === 'simple' ? 'active' : ''}`}
                    onClick={() => updateKR(kr.tempId, 'krType', 'simple')}
                  >
                    📝 Valor manual
                  </button>
                  <button
                    type="button"
                    className={`kr-type-btn ${kr.krType === 'kpi_linked' ? 'active' : ''}`}
                    onClick={() => updateKR(kr.tempId, 'krType', 'kpi_linked')}
                    disabled={!periodId}
                    title={!periodId ? 'Seleccioná un período primero' : ''}
                  >
                    🔗 Vinculado a KPI
                  </button>
                </div>
                <small className="form-hint">
                  {kr.krType === 'simple'
                    ? 'Vas a cargar el progreso manualmente con check-ins. Usalo para métricas que no están en el sistema (NPS, encuestas, metas cualitativas).'
                    : 'El progreso se actualiza automáticamente desde el KPI asignado. No hace falta cargar check-ins.'}
                </small>
              </div>

              {kr.krType === 'simple' && (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Valor inicial</label>
                      <input type="number" value={kr.startValue} onChange={(e) => updateKR(kr.tempId, 'startValue', e.target.value)} />
                      <small className="form-hint">Punto de partida (puede ser 0).</small>
                    </div>
                    <div className="form-group">
                      <label>Meta *</label>
                      <input
                        type="number"
                        value={kr.targetValue}
                        onChange={(e) => updateKR(kr.tempId, 'targetValue', e.target.value)}
                        className={krErrors[kr.tempId] ? 'input-error' : ''}
                      />
                      <small className="form-hint">Valor a alcanzar para considerar este KR completado.</small>
                    </div>
                    <div className="form-group">
                      <label>Unidad</label>
                      <input type="text" value={kr.unit} onChange={(e) => updateKR(kr.tempId, 'unit', e.target.value)} placeholder="%, tickets, $, días…" />
                    </div>
                  </div>
                  {krErrors[kr.tempId] && (
                    <div className="kr-error-msg">{krErrors[kr.tempId]}</div>
                  )}
                </>
              )}

              {kr.krType === 'kpi_linked' && (
                <div className="form-group">
                  <label>KPIs vinculados</label>
                  {kr.kpiLinks.length > 0 && (
                    <div className="kpi-chips">
                      {kr.kpiLinks.map((lk) => (
                        <span key={`${lk.type}-${lk.id}`} className={`kpi-chip kpi-chip--${lk.type}`}>
                          {lk.label}
                          {kr.kpiLinks.length > 1 && (
                            <span className="kpi-chip-weight-wrap">
                              <span className="kpi-chip-weight-label">Peso %</span>
                              <input
                                type="number"
                                className="kpi-chip-weight"
                                min="1"
                                max="100"
                                step="1"
                                value={lk.weight ?? 100}
                                onChange={(e) => updateKpiLinkWeight(kr.tempId, lk.type, lk.id, Number(e.target.value))}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </span>
                          )}
                          <button type="button" className="kpi-chip-remove" onClick={() => removeKpiLink(kr.tempId, lk.type, lk.id)}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <select
                    value=""
                    onChange={(e) => {
                      const [type, rawId] = e.target.value.split(':')
                      const id = Number(rawId)
                      if (!type || !id) return
                      if (type === 'collaborator') {
                        const ck = collabKpis.find((c) => c.id === id)
                        if (ck) addKpiLink(kr.tempId, { type: 'collaborator', id, label: `${ck.kpiName} — ${ck.collaboratorName}` })
                      } else {
                        const sk = scopeKpis.find((s) => s.id === id)
                        if (sk) addKpiLink(kr.tempId, { type: 'scope', id, label: `${sk.name} — ${sk.orgScopeName}` })
                      }
                    }}
                  >
                    <option value="">+ Agregar KPI...</option>
                    {collabKpis.filter((ck) => !kr.kpiLinks.some((l) => l.type === 'collaborator' && l.id === ck.id)).map((ck) => (
                      <option key={`collaborator:${ck.id}`} value={`collaborator:${ck.id}`}>
                        👤 {ck.kpiName} — {ck.collaboratorName} (meta: {ck.target})
                      </option>
                    ))}
                    {scopeKpis.filter((sk) => !kr.kpiLinks.some((l) => l.type === 'scope' && l.id === sk.id)).map((sk) => (
                      <option key={`scope:${sk.id}`} value={`scope:${sk.id}`}>
                        🏢 {sk.name} — {sk.orgScopeName} (meta: {sk.target})
                      </option>
                    ))}
                  </select>
                  <small className="form-hint">Podés vincular uno o más KPIs (individuales o grupales). El progreso del KR se calcula como el promedio de todos.</small>
                </div>
              )}

              <div className="form-group form-group--small">
                <label title="Porcentaje de peso de este KR en el objetivo. Se recomienda que la suma de todos los KRs sea 100%.">
                  Peso relativo (%) ⓘ
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={kr.weight}
                  onChange={(e) => updateKR(kr.tempId, 'weight', e.target.value)}
                />
                <small className="form-hint">
                  Ingresá el porcentaje (1–100). Idealmente la suma total de KRs debería quedar en 100%.
                </small>
              </div>
            </div>
          ))}

          {/* Resumen de pesos */}
          {krs.filter((kr) => kr.title.trim()).length > 1 && (() => {
            const total = krs.filter((kr) => kr.title.trim()).reduce((sum, kr) => sum + (Number(kr.weight) || 0), 0)
            const isOver = total > 100.5
            const isUnder = total < 99.5
            const isExact = !isOver && !isUnder
            return (
              <div className={`kr-weight-summary ${isOver ? 'kr-weight-summary--over' : isExact ? 'kr-weight-summary--ok' : ''}`}>
                <span>Suma de pesos: <strong>{total.toFixed(0)}%</strong> / 100%</span>
                {isOver && <span className="kr-weight-warning"> ⚠ La suma supera 100% — reducí algún peso.</span>}
                {isUnder && <span className="kr-weight-warning"> · Falta distribuir {(100 - total).toFixed(0)}% entre los KRs.</span>}
                {isExact && <span className="kr-weight-ok"> ✓ Distribución completa</span>}
              </div>
            )
          })()}
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
