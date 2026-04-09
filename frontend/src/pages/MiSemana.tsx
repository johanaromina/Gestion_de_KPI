import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import './MiSemana.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface KRItem {
  krId: number
  krTitle: string
  startValue: number | null
  targetValue: number | null
  currentValue: number | null
  unit: string | null
  krStatus: string
  objectiveId: number
  objectiveTitle: string
  objectiveProgress: number
  periodName: string
  lastCheckin: string | null
}

interface KPIItem {
  id: number
  kpiName: string
  actual: number | null
  target: number | null
  weightedResult: number | null
  status: string
  periodName: string
  subPeriodName: string | null
  inputMode: string
}

interface MiSemanaData {
  krs: KRItem[]
  kpis: KPIItem[]
  checkIn: { id: number; q1: string; q2: string; q3: string; mood: number | null } | null
  weekStart: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const krProgress = (kr: KRItem): number => {
  const start = kr.startValue ?? 0
  const target = kr.targetValue ?? 0
  const current = kr.currentValue ?? start
  if (target === start) return current >= target ? 100 : 0
  return Math.min(100, Math.max(0, ((current - start) / (target - start)) * 100))
}

const kpiProgress = (kpi: KPIItem): number => {
  if (!kpi.target || kpi.target <= 0) return 0
  return Math.min(100, Math.max(0, ((kpi.actual ?? 0) / kpi.target) * 100))
}

const progressColor = (p: number) => {
  if (p >= 70) return '#16a34a'
  if (p >= 40) return '#d97706'
  return '#dc2626'
}

const formatWeek = (dateStr: string) => {
  const d = new Date(dateStr + 'T12:00:00')
  const end = new Date(d)
  end.setDate(d.getDate() + 6)
  return `${d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`
}

const daysSince = (dateStr: string | null) => {
  if (!dateStr) return null
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (diff === 0) return 'hoy'
  if (diff === 1) return 'ayer'
  return `hace ${diff} días`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MiSemana() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // inline edit state: krId or kpiId → input value string
  const [editing, setEditing] = useState<{ type: 'kr' | 'kpi'; id: number; value: string; note: string } | null>(null)
  const [saved, setSaved] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery<MiSemanaData>(
    'mi-semana',
    () => api.get('/mi-semana').then((r) => r.data),
    { refetchOnWindowFocus: false }
  )

  const markSaved = (key: string) => {
    setSaved((prev) => new Set(prev).add(key))
    setTimeout(() => setSaved((prev) => { const n = new Set(prev); n.delete(key); return n }), 3000)
  }

  const krMutation = useMutation(
    ({ krId, value, note }: { krId: number; value: number; note: string }) =>
      api.patch(`/mi-semana/kr/${krId}`, { value, note }),
    {
      onSuccess: (_, vars) => {
        queryClient.invalidateQueries('mi-semana')
        setEditing(null)
        markSaved(`kr-${vars.krId}`)
      },
    }
  )

  const kpiMutation = useMutation(
    ({ kpiId, actual }: { kpiId: number; actual: number }) =>
      api.patch(`/mi-semana/kpi/${kpiId}`, { actual }),
    {
      onSuccess: (_, vars) => {
        queryClient.invalidateQueries('mi-semana')
        setEditing(null)
        markSaved(`kpi-${vars.kpiId}`)
      },
    }
  )

  const handleSave = () => {
    if (!editing) return
    const val = parseFloat(editing.value)
    if (isNaN(val)) return
    if (editing.type === 'kr') {
      krMutation.mutate({ krId: editing.id, value: val, note: editing.note })
    } else {
      kpiMutation.mutate({ kpiId: editing.id, actual: val })
    }
  }

  const isSubmitting = krMutation.isLoading || kpiMutation.isLoading

  if (isLoading) {
    return <div className="mi-semana-loading">Cargando tu semana...</div>
  }

  const { krs = [], kpis = [], checkIn, weekStart = '' } = data ?? {}
  const hasAnything = krs.length > 0 || kpis.length > 0

  return (
    <div className="mi-semana">
      {/* Header */}
      <div className="ms-header">
        <div>
          <h2 className="ms-title">Mi semana</h2>
          {weekStart && (
            <p className="ms-subtitle">Semana del {formatWeek(weekStart)}</p>
          )}
        </div>
        <div className="ms-header-right">
          {checkIn ? (
            <span className="ms-checkin-done">Check-in ✓</span>
          ) : (
            <button className="ms-btn-checkin" onClick={() => navigate('/check-ins')}>
              Hacer check-in semanal
            </button>
          )}
        </div>
      </div>

      {!hasAnything && (
        <div className="ms-empty">
          <p>No tenés KRs ni KPIs activos asignados esta semana.</p>
        </div>
      )}

      {/* Key Results */}
      {krs.length > 0 && (
        <section className="ms-section">
          <h3 className="ms-section-title">Key Results que te asignaron</h3>
          <div className="ms-cards">
            {krs.map((kr) => {
              const pct = krProgress(kr)
              const color = progressColor(pct)
              const isEditing = editing?.type === 'kr' && editing.id === kr.krId
              const isSaved = saved.has(`kr-${kr.krId}`)

              return (
                <div key={kr.krId} className={`ms-card ${isEditing ? 'ms-card--editing' : ''}`}>
                  <div className="ms-card-meta">
                    <span
                      className="ms-card-obj"
                      onClick={() => navigate(`/okr/${kr.objectiveId}`)}
                      title="Ver objetivo"
                    >
                      {kr.objectiveTitle}
                    </span>
                    <span className="ms-card-period">{kr.periodName}</span>
                  </div>

                  <p className="ms-card-title">{kr.krTitle}</p>

                  {/* Barra de progreso */}
                  <div className="ms-progress-row">
                    <div className="ms-progress-track">
                      <div className="ms-progress-fill" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <span className="ms-progress-pct" style={{ color }}>{Math.round(pct)}%</span>
                  </div>

                  <div className="ms-card-values">
                    <span>
                      {kr.currentValue ?? kr.startValue ?? 0} / {kr.targetValue ?? 0}
                      {kr.unit ? ` ${kr.unit}` : ''}
                    </span>
                    {kr.lastCheckin && (
                      <span className="ms-last-update">Último: {daysSince(kr.lastCheckin)}</span>
                    )}
                  </div>

                  {/* Inline edit */}
                  {isEditing ? (
                    <div className="ms-inline-edit">
                      <input
                        type="number"
                        className="ms-input"
                        placeholder="Nuevo valor"
                        value={editing.value}
                        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                        autoFocus
                      />
                      <input
                        type="text"
                        className="ms-input ms-input--note"
                        placeholder="Nota (opcional)"
                        value={editing.note}
                        onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                      />
                      <div className="ms-inline-actions">
                        <button className="ms-btn-save" onClick={handleSave} disabled={isSubmitting}>
                          {isSubmitting ? '...' : 'Guardar'}
                        </button>
                        <button className="ms-btn-cancel" onClick={() => setEditing(null)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className={`ms-btn-update ${isSaved ? 'ms-btn-update--saved' : ''}`}
                      onClick={() => setEditing({ type: 'kr', id: kr.krId, value: String(kr.currentValue ?? ''), note: '' })}
                    >
                      {isSaved ? '✓ Guardado' : 'Actualizar'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* KPIs */}
      {kpis.length > 0 && (
        <section className="ms-section">
          <h3 className="ms-section-title">Mis KPIs del período</h3>
          <div className="ms-cards">
            {kpis.map((kpi) => {
              const pct = kpiProgress(kpi)
              const color = progressColor(pct)
              const isEditing = editing?.type === 'kpi' && editing.id === kpi.id
              const isSaved = saved.has(`kpi-${kpi.id}`)

              return (
                <div key={kpi.id} className={`ms-card ${isEditing ? 'ms-card--editing' : ''}`}>
                  <div className="ms-card-meta">
                    <span className="ms-card-period">{kpi.periodName}</span>
                    {kpi.subPeriodName && (
                      <span className="ms-card-sub">{kpi.subPeriodName}</span>
                    )}
                  </div>

                  <p className="ms-card-title">{kpi.kpiName}</p>

                  <div className="ms-progress-row">
                    <div className="ms-progress-track">
                      <div className="ms-progress-fill" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <span className="ms-progress-pct" style={{ color }}>{Math.round(pct)}%</span>
                  </div>

                  <div className="ms-card-values">
                    <span>
                      {kpi.actual ?? '—'} / {kpi.target ?? '—'}
                    </span>
                    {kpi.weightedResult != null && (
                      <span className="ms-weighted">Resultado: {Number(kpi.weightedResult).toFixed(1)}%</span>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="ms-inline-edit">
                      <input
                        type="number"
                        className="ms-input"
                        placeholder="Nuevo valor"
                        value={editing.value}
                        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                        autoFocus
                      />
                      <div className="ms-inline-actions">
                        <button className="ms-btn-save" onClick={handleSave} disabled={isSubmitting}>
                          {isSubmitting ? '...' : 'Guardar'}
                        </button>
                        <button className="ms-btn-cancel" onClick={() => setEditing(null)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className={`ms-btn-update ${isSaved ? 'ms-btn-update--saved' : ''}`}
                      onClick={() => setEditing({ type: 'kpi', id: kpi.id, value: String(kpi.actual ?? ''), note: '' })}
                    >
                      {isSaved ? '✓ Guardado' : 'Actualizar'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
