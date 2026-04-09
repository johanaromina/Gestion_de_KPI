import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../services/api'
import './OKRDetalle.css'

type KRStatus = 'not_started' | 'on_track' | 'at_risk' | 'behind' | 'completed'

interface KeyResult {
  id: number
  title: string
  krType: 'simple' | 'kpi_linked'
  startValue?: number | null
  targetValue?: number | null
  currentValue?: number | null
  unit?: string | null
  kpiName?: string | null
  kpiActual?: number | null
  kpiTarget?: number | null
  weight: number
  status: KRStatus
  progressPercent: number
  ownerName?: string
}

interface CheckIn {
  id: number
  value: number
  note?: string | null
  authorName?: string
  createdAt: string
}

interface Objective {
  id: number
  title: string
  description?: string | null
  progress: number
  status: 'draft' | 'active' | 'closed'
  ownerName?: string
  orgScopeName?: string
  periodName?: string
  keyResults?: KeyResult[]
}

const STATUS_LABEL: Record<KRStatus, string> = {
  not_started: 'Sin iniciar',
  on_track: 'En camino',
  at_risk: 'En riesgo',
  behind: 'Atrasado',
  completed: 'Completado',
}

const STATUS_COLOR: Record<KRStatus, string> = {
  not_started: '#9ca3af',
  on_track: '#16a34a',
  at_risk: '#d97706',
  behind: '#dc2626',
  completed: '#2563eb',
}

const progressColor = (p: number) => {
  if (p >= 70) return '#16a34a'
  if (p >= 40) return '#d97706'
  return '#dc2626'
}

export default function OKRDetalle() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [selectedKR, setSelectedKR] = useState<number | null>(null)
  const [checkInValue, setCheckInValue] = useState('')
  const [checkInNote, setCheckInNote] = useState('')
  const [newKRStatus, setNewKRStatus] = useState<Record<number, KRStatus>>({})
  const [treeNodeId, setTreeNodeId] = useState('')

  const { data: objective, isLoading } = useQuery<Objective>(
    ['okr-objective', id],
    () => api.get(`/okr/${id}`).then((r) => r.data),
    { enabled: !!id }
  )

  const { data: checkIns = [] } = useQuery<CheckIn[]>(
    ['okr-check-ins', selectedKR],
    () => api.get(`/okr/key-results/${selectedKR}/check-ins`).then((r) => r.data),
    { enabled: !!selectedKR }
  )

  const checkInMutation = useMutation(
    (data: { keyResultId: number; value: number; note?: string }) =>
      api.post(`/okr/key-results/${data.keyResultId}/check-ins`, {
        value: data.value,
        note: data.note,
      }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['okr-check-ins', selectedKR])
        queryClient.invalidateQueries(['okr-objective', id])
        setCheckInValue('')
        setCheckInNote('')
      },
    }
  )

  const updateKRStatusMutation = useMutation(
    ({ krId, status }: { krId: number; status: KRStatus }) =>
      api.put(`/okr/${id}/key-results/${krId}`, { status }),
    {
      onSuccess: () => queryClient.invalidateQueries(['okr-objective', id]),
    }
  )

  const closeObjectiveMutation = useMutation(
    () => api.put(`/okr/${id}`, { status: 'closed' }),
    { onSuccess: () => queryClient.invalidateQueries(['okr-objective', id]) }
  )

  const { data: treeLinks = [] } = useQuery<{ objectiveTreeId: number; objectiveTreeName: string; level: string }[]>(
    ['okr-tree-links', id],
    () => api.get(`/okr/${id}/tree-links`).then((r) => r.data),
    { enabled: !!id }
  )

  const { data: allTreeNodes = [] } = useQuery<{ id: number; name: string; level: string }[]>(
    'objective-trees-flat',
    () => api.get('/objective-trees').then((r) => r.data.map((n: any) => ({ id: n.id, name: n.name, level: n.level }))),
    { staleTime: 60000 }
  )

  const linkTreeMutation = useMutation(
    (objectiveTreeId: number) => api.post(`/okr/${id}/tree-links`, { objectiveTreeId }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['okr-tree-links', id])
        setTreeNodeId('')
      },
    }
  )

  const unlinkTreeMutation = useMutation(
    (treeId: number) => api.delete(`/okr/${id}/tree-links/${treeId}`),
    { onSuccess: () => queryClient.invalidateQueries(['okr-tree-links', id]) }
  )

  const linkedTreeIds = new Set(treeLinks.map((l) => l.objectiveTreeId))
  const availableNodes = allTreeNodes.filter((n) => !linkedTreeIds.has(n.id))

  if (isLoading) return <div className="okr-detalle-loading">Cargando...</div>
  if (!objective) return <div className="okr-detalle-loading">Objetivo no encontrado.</div>

  const handleCheckIn = () => {
    if (!selectedKR || !checkInValue) return
    checkInMutation.mutate({ keyResultId: selectedKR, value: Number(checkInValue), note: checkInNote || undefined })
  }

  return (
    <div className="okr-detalle">
      <div className="okr-detalle-header">
        <button className="btn-back" onClick={() => navigate('/okr')}>← OKRs</button>
        <div className="okr-detalle-actions">
          <button
            className="btn-export btn-export-pdf"
            title="Exportar a PDF"
            onClick={() => window.open(
              `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/export/okr/${id}/pdf`,
              '_blank'
            )}
          >
            📄 PDF
          </button>
          <button
            className="btn-export btn-export-excel"
            title="Exportar a Excel"
            onClick={() => window.open(
              `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/export/okr/${id}/excel`,
              '_blank'
            )}
          >
            📊 Excel
          </button>
          {objective.status !== 'closed' && (
            <>
              <button
                className="btn-secondary"
                onClick={() => navigate(`/okr/${id}/editar`)}
              >
                Editar
              </button>
              <button
                className="btn-secondary"
                onClick={() => { if (window.confirm('¿Cerrar este objetivo?')) closeObjectiveMutation.mutate() }}
              >
                Cerrar objetivo
              </button>
            </>
          )}
        </div>
      </div>

      {/* Objetivo */}
      <div className="okr-detalle-card">
        <div className="okr-detalle-meta">
          {objective.orgScopeName && <span className="okr-badge okr-badge--scope">{objective.orgScopeName}</span>}
          {objective.periodName && <span className="okr-badge okr-badge--period">{objective.periodName}</span>}
          <span className={`okr-status-pill okr-status-pill--${objective.status}`}>
            {objective.status === 'active' ? 'Activo' : objective.status === 'draft' ? 'Borrador' : 'Cerrado'}
          </span>
        </div>

        <h2 className="okr-detalle-title">{objective.title}</h2>
        {objective.description && <p className="okr-detalle-desc">{objective.description}</p>}
        {objective.ownerName && <p className="okr-detalle-owner">Responsable: {objective.ownerName}</p>}

        <div className="okr-detalle-progress">
          <div className="okr-progress-label">
            <span>Progreso general</span>
            <strong style={{ color: progressColor(objective.progress) }}>{Math.round(objective.progress)}%</strong>
          </div>
          <div className="okr-progress-track">
            <div
              className="okr-progress-fill"
              style={{ width: `${objective.progress}%`, background: progressColor(objective.progress) }}
            />
          </div>
        </div>
      </div>

      {/* Key Results */}
      <div className="okr-kr-section">
        <h3>Key Results</h3>

        {(!objective.keyResults || objective.keyResults.length === 0) && (
          <p className="okr-empty-inline">Sin key results definidos.</p>
        )}

        {objective.keyResults?.map((kr) => (
          <div
            key={kr.id}
            className={`okr-kr-card ${selectedKR === kr.id ? 'okr-kr-card--selected' : ''}`}
          >
            <div className="okr-kr-card-header">
              <div>
                <span className="okr-kr-card-title">{kr.title}</span>
                {kr.ownerName && <span className="okr-kr-owner"> — {kr.ownerName}</span>}
              </div>
              <div className="okr-kr-card-right">
                <select
                  className="kr-status-select"
                  value={newKRStatus[kr.id] ?? kr.status}
                  style={{ color: STATUS_COLOR[newKRStatus[kr.id] ?? kr.status] }}
                  onChange={(e) => {
                    const s = e.target.value as KRStatus
                    setNewKRStatus((prev) => ({ ...prev, [kr.id]: s }))
                    updateKRStatusMutation.mutate({ krId: kr.id, status: s })
                  }}
                >
                  {(Object.keys(STATUS_LABEL) as KRStatus[]).map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="okr-kr-progress-section">
              <div className="okr-progress-track">
                <div
                  className="okr-progress-fill"
                  style={{
                    width: `${kr.progressPercent}%`,
                    background: STATUS_COLOR[newKRStatus[kr.id] ?? kr.status],
                  }}
                />
              </div>
              <span className="okr-kr-pct">{Math.round(kr.progressPercent)}%</span>
            </div>

            <div className="okr-kr-values-row">
              {kr.krType === 'kpi_linked' ? (
                <span className="okr-kr-linked-badge">
                  KPI vinculado: {kr.kpiName ?? 'KPI'} — actual: {kr.kpiActual ?? '—'} / meta: {kr.kpiTarget ?? '—'}
                </span>
              ) : (
                <span className="okr-kr-value-text">
                  {kr.currentValue ?? kr.startValue ?? 0} / {kr.targetValue ?? 0}{kr.unit ? ` ${kr.unit}` : ''}
                </span>
              )}

              {kr.krType === 'simple' && (
                <button
                  className="btn-checkin"
                  onClick={() => setSelectedKR(selectedKR === kr.id ? null : kr.id)}
                >
                  {selectedKR === kr.id ? 'Cerrar' : 'Actualizar progreso'}
                </button>
              )}
            </div>

            {/* Panel check-in */}
            {selectedKR === kr.id && kr.krType === 'simple' && (
              <div className="checkin-panel">
                <div className="checkin-form">
                  <input
                    type="number"
                    placeholder="Nuevo valor"
                    value={checkInValue}
                    onChange={(e) => setCheckInValue(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Nota opcional"
                    value={checkInNote}
                    onChange={(e) => setCheckInNote(e.target.value)}
                  />
                  <button
                    className="btn-primary"
                    onClick={handleCheckIn}
                    disabled={!checkInValue || checkInMutation.isLoading}
                  >
                    Registrar
                  </button>
                </div>

                {checkIns.length > 0 && (
                  <div className="checkin-history">
                    <p className="checkin-history-title">Historial</p>
                    {checkIns.map((ci) => (
                      <div key={ci.id} className="checkin-row">
                        <span className="checkin-value">{ci.value}{kr.unit ? ` ${kr.unit}` : ''}</span>
                        {ci.note && <span className="checkin-note">{ci.note}</span>}
                        <span className="checkin-meta">
                          {ci.authorName} · {new Date(ci.createdAt).toLocaleDateString('es-AR')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Vinculos con Arbol de Objetivos */}
      <div className="okr-tree-links-section">
        <h3>Arbol de Objetivos vinculado</h3>

        {treeLinks.length === 0 && (
          <p className="okr-empty-inline">Sin vinculos al arbol organizacional.</p>
        )}

        {treeLinks.length > 0 && (
          <div className="okr-tree-links-list">
            {treeLinks.map((link) => (
              <div key={link.objectiveTreeId} className="okr-tree-link-row">
                <div>
                  <span className="okr-tree-link-name">{link.objectiveTreeName}</span>
                  <span className="okr-tree-link-level">{link.level}</span>
                </div>
                <button
                  className="btn-remove-kr"
                  onClick={() => unlinkTreeMutation.mutate(link.objectiveTreeId)}
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}

        {objective?.status !== 'closed' && availableNodes.length > 0 && (
          <div className="okr-tree-link-add">
            <select value={treeNodeId} onChange={(e) => setTreeNodeId(e.target.value)}>
              <option value="">Vincular a nodo del arbol...</option>
              {availableNodes.map((n) => (
                <option key={n.id} value={n.id}>{n.name} ({n.level})</option>
              ))}
            </select>
            <button
              className="btn-primary"
              disabled={!treeNodeId || linkTreeMutation.isLoading}
              onClick={() => linkTreeMutation.mutate(Number(treeNodeId))}
            >
              Vincular
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
