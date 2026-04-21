/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import api from '../services/api'
import './BulkKPIAssignmentModal.css'

interface Props {
  /** Si se pasa, pre-llena el paso 1 y arranca en paso 2 (modo Replicar) */
  prefill?: {
    kpiId: number
    kpiName: string
    periodId: number
    periodName: string
    target: number
    weight: number
  }
  onClose: () => void
  onSuccess: (created: number, skipped: number) => void
}

export default function BulkKPIAssignmentModal({ prefill, onClose, onSuccess }: Props) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<1 | 2>(prefill ? 2 : 1)

  // Paso 1
  const [kpiId, setKpiId] = useState(prefill ? String(prefill.kpiId) : '')
  const [periodId, setPeriodId] = useState(prefill ? String(prefill.periodId) : '')
  const [target, setTarget] = useState(prefill ? String(prefill.target) : '')
  const [weight, setWeight] = useState(prefill ? String(prefill.weight) : '0')

  // Paso 2
  const [scopeId, setScopeId] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const { data: kpis = [] } = useQuery<any[]>('kpis', () => api.get('/kpis').then(r => r.data))
  const { data: periods = [] } = useQuery<any[]>('periods', () => api.get('/periods').then(r => r.data))
  const { data: orgScopes = [] } = useQuery<any[]>('org-scopes', () => api.get('/org-scopes').then(r => r.data))
  const { data: collaborators = [] } = useQuery<any[]>('collaborators', () => api.get('/collaborators').then(r => r.data))

  // Asignaciones del período seleccionado (para detectar duplicados)
  const { data: existingAssignments = [] } = useQuery<any[]>(
    ['collaborator-kpis', 'period', periodId],
    () => api.get(`/collaborator-kpis/period/${periodId}`).then(r => r.data),
    { enabled: !!periodId && step === 2 }
  )

  // Scopes asignables (todos excepto type=person)
  const scopeById = useMemo(() => {
    const m = new Map<number, any>()
    orgScopes.forEach((s: any) => m.set(s.id, s))
    return m
  }, [orgScopes])

  const buildLabel = (scope: any): string => {
    const parts: string[] = []
    let cur = scope
    let safety = 0
    while (cur && safety < 5) { parts.unshift(cur.name); cur = cur.parentId ? scopeById.get(cur.parentId) : null; safety++ }
    return parts.join(' › ')
  }

  const assignableScopes = useMemo(() =>
    orgScopes
      .filter((s: any) => s.type !== 'person' && s.active !== 0)
      .map((s: any) => ({ ...s, label: buildLabel(s) }))
      .sort((a: any, b: any) => a.label.localeCompare(b.label))
  , [orgScopes, scopeById])

  // Colaboradores según el scope seleccionado y sus hijos
  const descendantScopeIds = useMemo(() => {
    if (!scopeId) return new Set<number>()
    const result = new Set<number>([Number(scopeId)])
    const queue = [Number(scopeId)]
    while (queue.length) {
      const parent = queue.shift()!
      orgScopes.filter((s: any) => s.parentId === parent).forEach((s: any) => {
        result.add(s.id); queue.push(s.id)
      })
    }
    return result
  }, [scopeId, orgScopes])

  const filteredCollaborators = useMemo(() => {
    if (!scopeId) return collaborators.filter((c: any) => c.status !== 'inactive')
    return collaborators.filter((c: any) =>
      c.status !== 'inactive' && c.orgScopeId && descendantScopeIds.has(c.orgScopeId)
    )
  }, [collaborators, scopeId, descendantScopeIds])

  // Detectar cuáles ya tienen el KPI asignado en este período
  const alreadyAssignedIds = useMemo(() => {
    const set = new Set<number>()
    existingAssignments
      .filter((a: any) => a.kpiId === Number(kpiId) && !a.subPeriodId)
      .forEach((a: any) => set.add(a.collaboratorId))
    return set
  }, [existingAssignments, kpiId])

  const toggleAll = () => {
    const eligible = filteredCollaborators.filter((c: any) => !alreadyAssignedIds.has(c.id))
    if (selectedIds.size === eligible.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(eligible.map((c: any) => c.id)))
    }
  }

  const toggleOne = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const bulkMutation = useMutation(
    () => api.post('/collaborator-kpis/bulk', {
      kpiId: Number(kpiId),
      periodId: Number(periodId),
      collaboratorIds: Array.from(selectedIds),
      target: Number(target),
      weight: Number(weight),
    }).then(r => r.data),
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('collaborator-kpis')
        onSuccess(data.created, data.skipped)
      },
    }
  )

  const step1Valid = kpiId && periodId && target && Number(target) > 0

  const selectedKpiName = prefill?.kpiName ?? kpis.find((k: any) => k.id === Number(kpiId))?.name ?? ''
  const selectedPeriodName = prefill?.periodName ?? periods.find((p: any) => p.id === Number(periodId))?.name ?? ''
  const eligibleCount = filteredCollaborators.filter((c: any) => !alreadyAssignedIds.has(c.id)).length

  return (
    <div className="bulk-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bulk-modal">
        <div className="bulk-modal-header">
          <div>
            <h2>{prefill ? 'Replicar KPI' : 'Asignación masiva de KPI'}</h2>
            <p className="bulk-modal-sub">
              {step === 1 ? 'Paso 1: configurar el KPI a asignar' : 'Paso 2: seleccionar destinatarios'}
            </p>
          </div>
          <button className="bulk-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="bulk-modal-steps">
          <div className={`bulk-step-dot ${step >= 1 ? 'active' : ''}`}>1</div>
          <div className="bulk-step-line" />
          <div className={`bulk-step-dot ${step >= 2 ? 'active' : ''}`}>2</div>
        </div>

        <div className="bulk-modal-body">
          {/* ── PASO 1 ── */}
          {step === 1 && (
            <div className="bulk-step">
              <div className="bulk-form-row">
                <div className="bulk-field">
                  <label>KPI *</label>
                  <select value={kpiId} onChange={e => setKpiId(e.target.value)}>
                    <option value="">Seleccioná un KPI...</option>
                    {kpis.map((k: any) => (
                      <option key={k.id} value={k.id}>{k.name}</option>
                    ))}
                  </select>
                </div>
                <div className="bulk-field">
                  <label>Período *</label>
                  <select value={periodId} onChange={e => setPeriodId(e.target.value)}>
                    <option value="">Seleccioná un período...</option>
                    {periods.filter((p: any) => p.status !== 'closed').map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="bulk-form-row">
                <div className="bulk-field">
                  <label>Meta (target) *</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={target}
                    onChange={e => setTarget(e.target.value)}
                    placeholder="Ej: 100"
                  />
                  <small>Misma meta para todos los seleccionados</small>
                </div>
                <div className="bulk-field">
                  <label>Ponderación (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={weight}
                    onChange={e => setWeight(e.target.value)}
                    placeholder="Ej: 20"
                  />
                  <small>Peso del KPI en el total del colaborador</small>
                </div>
              </div>
            </div>
          )}

          {/* ── PASO 2 ── */}
          {step === 2 && (
            <div className="bulk-step">
              {/* Resumen paso 1 */}
              <div className="bulk-summary-bar">
                <span><strong>KPI:</strong> {selectedKpiName}</span>
                <span><strong>Período:</strong> {selectedPeriodName}</span>
                <span><strong>Meta:</strong> {target}</span>
                <span><strong>Peso:</strong> {weight}%</span>
                {!prefill && (
                  <button className="bulk-edit-step1" onClick={() => setStep(1)}>Editar</button>
                )}
              </div>

              {/* Filtro por equipo/área */}
              <div className="bulk-field" style={{ marginBottom: 12 }}>
                <label>Filtrar por equipo / área</label>
                <select value={scopeId} onChange={e => { setScopeId(e.target.value); setSelectedIds(new Set()) }}>
                  <option value="">Todos los colaboradores activos</option>
                  {assignableScopes.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Controles selección */}
              <div className="bulk-select-controls">
                <span className="bulk-count-label">
                  {filteredCollaborators.length} colaboradores
                  {alreadyAssignedIds.size > 0 && ` · ${alreadyAssignedIds.size} ya asignados`}
                  {` · ${eligibleCount} disponibles`}
                </span>
                {eligibleCount > 0 && (
                  <button className="bulk-select-all" onClick={toggleAll}>
                    {selectedIds.size === eligibleCount ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </button>
                )}
              </div>

              {/* Lista de colaboradores */}
              <div className="bulk-collaborator-list">
                {filteredCollaborators.length === 0 && (
                  <div className="bulk-empty">No hay colaboradores activos en este equipo.</div>
                )}
                {filteredCollaborators.map((c: any) => {
                  const already = alreadyAssignedIds.has(c.id)
                  const checked = selectedIds.has(c.id)
                  const scopeName = c.orgScopeId ? scopeById.get(c.orgScopeId)?.name : c.area
                  return (
                    <label
                      key={c.id}
                      className={`bulk-collab-row ${already ? 'bulk-collab-row--taken' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={already}
                        onChange={() => toggleOne(c.id)}
                      />
                      <div className="bulk-collab-info">
                        <span className="bulk-collab-name">{c.name}</span>
                        {c.position && <span className="bulk-collab-pos">{c.position}</span>}
                        {scopeName && <span className="bulk-collab-scope">{scopeName}</span>}
                      </div>
                      {already && <span className="bulk-collab-taken">ya asignado</span>}
                    </label>
                  )
                })}
              </div>

              {selectedIds.size > 0 && (
                <div className="bulk-selection-summary">
                  {selectedIds.size} colaborador{selectedIds.size !== 1 ? 'es' : ''} seleccionado{selectedIds.size !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bulk-modal-footer">
          {step === 1 ? (
            <>
              <button className="btn-secondary" onClick={onClose}>Cancelar</button>
              <button
                className="btn-primary"
                onClick={() => setStep(2)}
                disabled={!step1Valid}
              >
                Siguiente →
              </button>
            </>
          ) : (
            <>
              {!prefill && (
                <button className="btn-secondary" onClick={() => setStep(1)}>← Atrás</button>
              )}
              {prefill && <button className="btn-secondary" onClick={onClose}>Cancelar</button>}
              <button
                className="btn-primary"
                onClick={() => bulkMutation.mutate()}
                disabled={selectedIds.size === 0 || bulkMutation.isLoading}
              >
                {bulkMutation.isLoading
                  ? 'Creando...'
                  : `Asignar a ${selectedIds.size} colaborador${selectedIds.size !== 1 ? 'es' : ''}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
