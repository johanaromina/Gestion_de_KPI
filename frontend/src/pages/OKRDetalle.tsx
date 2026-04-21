import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../services/api'
import './OKRDetalle.css'

type KRStatus = 'not_started' | 'on_track' | 'at_risk' | 'behind' | 'completed'

interface KpiLink { type: 'collaborator' | 'scope'; id: number; label: string }

interface KREditDraft {
  title: string
  description: string
  krType: 'simple' | 'kpi_linked'
  startValue: string
  targetValue: string
  unit: string
  kpiLinks: KpiLink[]
  weight: string
}

interface DataSource {
  krId: number
  krTitle: string
  krType: 'simple' | 'kpi_linked'
  krStatus: KRStatus
  sourceType: 'scope_kpi' | 'collaborator_kpi' | null
  kpiName: string | null
  actual: number | null
  target: number | null
  sources: {
    sourceType: 'collaborator' | 'scope'
    sourceName: string
    actual: number | null
    target: number | null
    kpiName: string
    sourceStatus: string | null
  }[]
}

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
  linkedKpis?: KpiLink[]
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
  const [treeSearch, setTreeSearch] = useState('')
  const [treeDropdownOpen, setTreeDropdownOpen] = useState(false)
  const [expandedSources, setExpandedSources] = useState<Set<number>>(new Set())
  const [editingKrId, setEditingKrId] = useState<number | null>(null)
  const [krEditDraft, setKrEditDraft] = useState<KREditDraft | null>(null)

  const { data: objective, isLoading } = useQuery<Objective>(
    ['okr-objective', id],
    () => api.get(`/okr/${id}`).then((r) => r.data),
    { enabled: !!id }
  )

  const { data: dataSources = [] } = useQuery<DataSource[]>(
    ['okr-data-sources', id],
    () => api.get(`/okr/${id}/data-sources`).then((r) => r.data),
    { enabled: !!id }
  )

  const dataSourceByKr = new Map(dataSources.map((ds) => [ds.krId, ds]))

  const toggleSources = (krId: number) =>
    setExpandedSources((prev) => {
      const next = new Set(prev)
      next.has(krId) ? next.delete(krId) : next.add(krId)
      return next
    })

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

  const periodId = (objective as any)?.periodId
  const { data: collabKpis = [] } = useQuery<{ id: number; kpiName: string; collaboratorName: string; target: number }[]>(
    ['collab-kpis-det', periodId],
    () => api.get('/collaborator-kpis', { params: { periodId } }).then((r) =>
      r.data.map((ck: any) => ({ id: ck.id, kpiName: ck.kpiName ?? `KPI #${ck.kpiId}`, collaboratorName: ck.collaboratorName ?? '', target: ck.target }))
    ),
    { enabled: !!periodId && editingKrId !== null }
  )
  const { data: scopeKpis = [] } = useQuery<{ id: number; name: string; orgScopeName: string; target: number }[]>(
    ['scope-kpis-det', periodId],
    () => api.get('/scope-kpis', { params: { periodId } }).then((r) =>
      r.data.map((sk: any) => ({ id: sk.id, name: sk.name, orgScopeName: sk.orgScopeName ?? '', target: sk.target }))
    ),
    { enabled: !!periodId && editingKrId !== null }
  )

  const updateKrMutation = useMutation(
    ({ krId, data }: { krId: number; data: object }) =>
      api.put(`/okr/${id}/key-results/${krId}`, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['okr-objective', id])
        setEditingKrId(null)
        setKrEditDraft(null)
      },
    }
  )

  const openKrEdit = (kr: KeyResult) => {
    setEditingKrId(kr.id)
    setKrEditDraft({
      title: kr.title,
      description: '',
      krType: kr.krType,
      startValue: String(kr.startValue ?? '0'),
      targetValue: String(kr.targetValue ?? ''),
      unit: kr.unit ?? '',
      kpiLinks: kr.linkedKpis ?? [],
      weight: String(kr.weight ?? '1'),
    })
  }

  const addKrKpiLink = (link: KpiLink) => {
    setKrEditDraft((prev) => {
      if (!prev) return prev
      if (prev.kpiLinks.some((l) => l.type === link.type && l.id === link.id)) return prev
      return { ...prev, kpiLinks: [...prev.kpiLinks, link] }
    })
  }

  const removeKrKpiLink = (type: string, linkId: number) => {
    setKrEditDraft((prev) =>
      prev ? { ...prev, kpiLinks: prev.kpiLinks.filter((l) => !(l.type === type && l.id === linkId)) } : prev
    )
  }

  const saveKrEdit = (krId: number) => {
    if (!krEditDraft) return
    updateKrMutation.mutate({
      krId,
      data: {
        title: krEditDraft.title,
        krType: krEditDraft.krType,
        startValue: krEditDraft.krType === 'simple' ? Number(krEditDraft.startValue) : null,
        targetValue: krEditDraft.krType === 'simple' ? Number(krEditDraft.targetValue) : null,
        unit: krEditDraft.unit || null,
        kpiLinks: krEditDraft.krType === 'kpi_linked' ? krEditDraft.kpiLinks : [],
        weight: Number(krEditDraft.weight) || 1,
      },
    })
  }

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
                {objective.status !== 'closed' && (
                  <button
                    className="btn-checkin"
                    onClick={() => editingKrId === kr.id ? (setEditingKrId(null), setKrEditDraft(null)) : openKrEdit(kr)}
                  >
                    {editingKrId === kr.id ? 'Cancelar edición' : 'Editar KR'}
                  </button>
                )}
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

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {kr.krType === 'kpi_linked' && dataSourceByKr.get(kr.id)?.sources?.length ? (
                  <button
                    className="btn-checkin"
                    onClick={() => toggleSources(kr.id)}
                    title="Ver fuentes de datos que alimentan este KR"
                  >
                    {expandedSources.has(kr.id) ? 'Ocultar fuentes' : `Ver fuentes (${dataSourceByKr.get(kr.id)!.sources.length})`}
                  </button>
                ) : null}
                {kr.krType === 'kpi_linked' && (
                  <span className="okr-kr-auto-badge" title="El progreso se actualiza automáticamente desde el KPI vinculado">
                    Automático
                  </span>
                )}
                {kr.krType === 'simple' && (
                  <button
                    className="btn-checkin"
                    onClick={() => setSelectedKR(selectedKR === kr.id ? null : kr.id)}
                  >
                    {selectedKR === kr.id ? 'Cerrar' : '+ Registrar avance'}
                  </button>
                )}
              </div>
            </div>

            {/* Panel de trazabilidad — fuentes de datos reales */}
            {kr.krType === 'kpi_linked' && expandedSources.has(kr.id) && (() => {
              const ds = dataSourceByKr.get(kr.id)
              if (!ds || ds.sources.length === 0) return null
              return (
                <div className="datasource-panel">
                  <p className="datasource-panel-title">
                    Fuentes que alimentan este KR
                  </p>
                  <div className="datasource-list">
                    {ds.sources.map((src, i) => {
                      const pct = src.target && src.target > 0
                        ? Math.min(100, Math.round((Number(src.actual ?? 0) / Number(src.target)) * 100))
                        : 0
                      const color = pct >= 70 ? '#16a34a' : pct >= 40 ? '#d97706' : '#dc2626'
                      return (
                        <div key={i} className="datasource-row">
                          <div className="datasource-row-top">
                            <span className="datasource-name">
                              <span className={`datasource-type-badge datasource-type-badge--${src.sourceType}`}>
                                {src.sourceType === 'collaborator' ? 'Colaborador' : 'Área'}
                              </span>
                              {src.sourceName}
                            </span>
                            <span className="datasource-pct" style={{ color }}>{pct}%</span>
                          </div>
                          <div className="datasource-bar-track">
                            <div className="datasource-bar-fill" style={{ width: `${pct}%`, background: color }} />
                          </div>
                          <span className="datasource-values">
                            {src.actual ?? '—'} / {src.target ?? '—'}
                            {src.kpiName ? ` · ${src.kpiName}` : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Panel edición inline de KR */}
            {editingKrId === kr.id && krEditDraft && (
              <div className="kr-edit-panel">
                <div className="kr-edit-panel-title">Editar Key Result</div>
                <div className="checkin-form" style={{ flexDirection: 'column', gap: '12px' }}>
                  <div className="checkin-field checkin-field--wide">
                    <label>Título</label>
                    <input
                      type="text"
                      value={krEditDraft.title}
                      onChange={(e) => setKrEditDraft((p) => p ? { ...p, title: e.target.value } : p)}
                    />
                  </div>

                  <div className="checkin-field">
                    <label>Tipo de medición</label>
                    <div className="kr-type-toggle">
                      <button
                        type="button"
                        className={`kr-type-btn ${krEditDraft.krType === 'simple' ? 'active' : ''}`}
                        onClick={() => setKrEditDraft((p) => p ? { ...p, krType: 'simple' } : p)}
                      >
                        📝 Valor manual
                      </button>
                      <button
                        type="button"
                        className={`kr-type-btn ${krEditDraft.krType === 'kpi_linked' ? 'active' : ''}`}
                        onClick={() => setKrEditDraft((p) => p ? { ...p, krType: 'kpi_linked' } : p)}
                      >
                        🔗 Vinculado a KPI
                      </button>
                    </div>
                  </div>

                  {krEditDraft.krType === 'simple' && (
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <div className="checkin-field">
                        <label>Valor inicial</label>
                        <input type="number" value={krEditDraft.startValue} onChange={(e) => setKrEditDraft((p) => p ? { ...p, startValue: e.target.value } : p)} />
                      </div>
                      <div className="checkin-field">
                        <label>Meta</label>
                        <input type="number" value={krEditDraft.targetValue} onChange={(e) => setKrEditDraft((p) => p ? { ...p, targetValue: e.target.value } : p)} />
                      </div>
                      <div className="checkin-field">
                        <label>Unidad</label>
                        <input type="text" value={krEditDraft.unit} placeholder="%, días, $..." onChange={(e) => setKrEditDraft((p) => p ? { ...p, unit: e.target.value } : p)} />
                      </div>
                    </div>
                  )}

                  {krEditDraft.krType === 'kpi_linked' && (
                    <div className="checkin-field checkin-field--wide">
                      <label>KPIs vinculados</label>
                      {krEditDraft.kpiLinks.length > 0 && (
                        <div className="kpi-chips" style={{ marginBottom: '8px' }}>
                          {krEditDraft.kpiLinks.map((lk) => (
                            <span key={`${lk.type}-${lk.id}`} className={`kpi-chip kpi-chip--${lk.type}`}>
                              {lk.label}
                              <button type="button" className="kpi-chip-remove" onClick={() => removeKrKpiLink(lk.type, lk.id)}>×</button>
                            </span>
                          ))}
                        </div>
                      )}
                      <select
                        value=""
                        onChange={(e) => {
                          const [type, rawId] = e.target.value.split(':')
                          const lid = Number(rawId)
                          if (!type || !lid) return
                          if (type === 'collaborator') {
                            const ck = collabKpis.find((c) => c.id === lid)
                            if (ck) addKrKpiLink({ type: 'collaborator', id: lid, label: `${ck.kpiName} — ${ck.collaboratorName}` })
                          } else {
                            const sk = scopeKpis.find((s) => s.id === lid)
                            if (sk) addKrKpiLink({ type: 'scope', id: lid, label: `${sk.name} — ${sk.orgScopeName}` })
                          }
                        }}
                      >
                        <option value="">+ Agregar KPI...</option>
                        {collabKpis.filter((ck) => !krEditDraft.kpiLinks.some((l) => l.type === 'collaborator' && l.id === ck.id)).map((ck) => (
                          <option key={`collaborator:${ck.id}`} value={`collaborator:${ck.id}`}>
                            👤 {ck.kpiName} — {ck.collaboratorName} (meta: {ck.target})
                          </option>
                        ))}
                        {scopeKpis.filter((sk) => !krEditDraft.kpiLinks.some((l) => l.type === 'scope' && l.id === sk.id)).map((sk) => (
                          <option key={`scope:${sk.id}`} value={`scope:${sk.id}`}>
                            🏢 {sk.name} — {sk.orgScopeName} (meta: {sk.target})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="checkin-field">
                    <label>Peso relativo</label>
                    <input
                      type="number" min="0.1" max="10" step="0.1"
                      value={krEditDraft.weight}
                      onChange={(e) => setKrEditDraft((p) => p ? { ...p, weight: e.target.value } : p)}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn-primary"
                      onClick={() => saveKrEdit(kr.id)}
                      disabled={!krEditDraft.title.trim() || updateKrMutation.isLoading}
                    >
                      {updateKrMutation.isLoading ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                    <button className="btn-secondary" onClick={() => { setEditingKrId(null); setKrEditDraft(null) }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Panel check-in */}
            {selectedKR === kr.id && kr.krType === 'simple' && (
              <div className="checkin-panel">
                <div className="checkin-panel-header">
                  <span className="checkin-panel-title">Registrar avance</span>
                  <span className="checkin-panel-hint">
                    Ingresá el valor actual del KR. Se guarda en el historial y actualiza el progreso.
                  </span>
                </div>
                <div className="checkin-form">
                  <div className="checkin-field">
                    <label>Valor actual{kr.unit ? ` (${kr.unit})` : ''}</label>
                    <input
                      type="number"
                      placeholder={`Meta: ${kr.targetValue ?? '—'}`}
                      value={checkInValue}
                      onChange={(e) => setCheckInValue(e.target.value)}
                    />
                  </div>
                  <div className="checkin-field checkin-field--wide">
                    <label>Nota <span className="field-optional">(opcional)</span></label>
                    <input
                      type="text"
                      placeholder="¿Qué pasó esta semana? ¿Hubo bloqueos?"
                      value={checkInNote}
                      onChange={(e) => setCheckInNote(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn-primary"
                    onClick={handleCheckIn}
                    disabled={!checkInValue || checkInMutation.isLoading}
                  >
                    {checkInMutation.isLoading ? 'Guardando...' : 'Guardar avance'}
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
        <div className="okr-tree-links-header">
          <h3>Árbol de Objetivos vinculado</h3>
          <small className="okr-tree-hint">
            Vinculá este OKR a un nodo del árbol estratégico para que aparezca en el organigrama y análisis de alineación.
          </small>
        </div>

        {treeLinks.length === 0 && (
          <p className="okr-empty-inline">Sin vínculos al árbol organizacional.</p>
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
            <div className="tree-search-wrapper">
              <input
                className="tree-search-input"
                type="text"
                placeholder="Buscar nodo del árbol…"
                value={treeSearch}
                onChange={(e) => { setTreeSearch(e.target.value); setTreeDropdownOpen(true); setTreeNodeId('') }}
                onFocus={() => setTreeDropdownOpen(true)}
                onBlur={() => setTimeout(() => setTreeDropdownOpen(false), 150)}
              />
              {treeDropdownOpen && treeSearch && (
                <div className="tree-search-dropdown">
                  {availableNodes
                    .filter((n) => n.name.toLowerCase().includes(treeSearch.toLowerCase()))
                    .slice(0, 15)
                    .map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        className="tree-search-option"
                        onMouseDown={() => {
                          setTreeNodeId(String(n.id))
                          setTreeSearch(n.name)
                          setTreeDropdownOpen(false)
                        }}
                      >
                        <span className="tree-option-name">{n.name}</span>
                        <span className="tree-option-level">{n.level}</span>
                      </button>
                    ))}
                  {availableNodes.filter((n) => n.name.toLowerCase().includes(treeSearch.toLowerCase())).length === 0 && (
                    <div className="tree-search-empty">Sin resultados para "{treeSearch}"</div>
                  )}
                </div>
              )}
            </div>
            <button
              className="btn-primary"
              disabled={!treeNodeId || linkTreeMutation.isLoading}
              onClick={() => { linkTreeMutation.mutate(Number(treeNodeId)); setTreeSearch(''); setTreeNodeId('') }}
            >
              Vincular
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
