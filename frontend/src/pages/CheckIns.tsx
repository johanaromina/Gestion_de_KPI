/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import './CheckIns.css'

type CheckIn = {
  id: number
  collaboratorId: number
  collaboratorName: string
  position?: string
  weekStart: string
  q1: string
  q2: string
  q3: string
  mood: number | null
  kpiName?: string | null
  createdAt: string
}

const MOODS = [
  { value: 1, emoji: '😞', label: 'Muy mal' },
  { value: 2, emoji: '😕', label: 'Mal' },
  { value: 3, emoji: '😐', label: 'Neutro' },
  { value: 4, emoji: '🙂', label: 'Bien' },
  { value: 5, emoji: '😄', label: 'Muy bien' },
]

const getMonday = (offset = 0): string => {
  const today = new Date()
  const day = today.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(today)
  monday.setDate(today.getDate() + diff + offset * 7)
  return monday.toISOString().slice(0, 10)
}

const formatWeek = (dateStr: string): string => {
  const d = new Date(dateStr + 'T12:00:00')
  const end = new Date(d)
  end.setDate(d.getDate() + 6)
  return `${d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

const moodColor = (mood: number | null) => {
  if (mood == null) return '#9ca3af'
  if (mood >= 4) return '#15803d'
  if (mood >= 3) return '#b45309'
  return '#b91c1c'
}

export default function CheckIns() {
  const { user, isCollaborator } = useAuth()
  const queryClient = useQueryClient()

  const [q1, setQ1] = useState('')
  const [q2, setQ2] = useState('')
  const [q3, setQ3] = useState('')
  const [mood, setMood] = useState<number | null>(null)
  const [formError, setFormError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [filterCollaborator, setFilterCollaborator] = useState<number | ''>('')
  const [filterWeeks, setFilterWeeks] = useState(8)

  const thisWeek = getMonday()

  /* Current week's own check-in */
  const { data: currentCheckIn, isLoading: loadingCurrent } = useQuery<CheckIn | null>(
    'check-in-current',
    async () => (await api.get('/check-ins/current-week')).data,
    { onSuccess: (data) => { if (data) { setQ1(data.q1); setQ2(data.q2); setQ3(data.q3); setMood(data.mood) } } }
  )

  /* All check-ins (leaders see team; collaborators see own) */
  const { data: checkIns, isLoading } = useQuery<CheckIn[]>(
    ['check-ins', filterCollaborator, filterWeeks],
    async () =>
      (
        await api.get('/check-ins', {
          params: {
            collaboratorId: filterCollaborator || undefined,
            weekStart: getMonday(-(filterWeeks - 1)),
          },
        })
      ).data
  )

  /* Team summary (leaders only) */
  const { data: teamSummary } = useQuery<any[]>(
    ['check-in-team-summary', filterWeeks],
    async () => (await api.get('/check-ins/team-summary', { params: { weeks: filterWeeks } })).data,
    { enabled: !isCollaborator }
  )

  const { data: collaborators } = useQuery<any[]>(
    'collaborators',
    async () => (await api.get('/collaborators')).data,
    { enabled: !isCollaborator }
  )

  const { data: myKpis } = useQuery<any[]>(
    ['my-kpis-checkin', user?.id],
    async () => (await api.get(`/collaborator-kpis/collaborator/${user?.id}`)).data,
    { enabled: !!user?.id }
  )

  const saveMutation = useMutation(
    async () => {
      if (!q1.trim() || !q2.trim() || !q3.trim()) {
        setFormError('Las tres preguntas son obligatorias.')
        return
      }
      setFormError('')
      await api.post('/check-ins', { q1: q1.trim(), q2: q2.trim(), q3: q3.trim(), mood })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('check-in-current')
        queryClient.invalidateQueries('check-ins')
        queryClient.invalidateQueries('check-in-team-summary')
        setShowForm(false)
      },
    }
  )

  const alreadySubmitted = !!currentCheckIn
  const canEdit = alreadySubmitted || showForm

  return (
    <div className="checkins-page">
      {/* Header */}
      <div className="checkins-header">
        <div>
          <h1>Check-ins semanales</h1>
          <p className="subtitle">
            3 preguntas · cada lunes · visibles para tu líder. Conecta tu semana con los KPIs del período.
          </p>
        </div>
        {isCollaborator && !canEdit && (
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            Hacer check-in esta semana
          </button>
        )}
        {isCollaborator && alreadySubmitted && !showForm && (
          <button className="btn-secondary" onClick={() => setShowForm(true)}>
            Editar check-in
          </button>
        )}
      </div>

      {/* Check-in form */}
      {isCollaborator && (showForm || (!loadingCurrent && !alreadySubmitted)) && (
        <div className="checkin-form-card">
          <div className="checkin-form-header">
            <div>
              <span className="checkin-week-label">Semana del {formatWeek(thisWeek)}</span>
              {alreadySubmitted && <span className="checkin-edit-badge">Editando</span>}
            </div>
          </div>

          {/* Mood selector */}
          <div className="checkin-mood-row">
            <span className="checkin-mood-label">¿Cómo te sentiste esta semana?</span>
            <div className="checkin-mood-options">
              {MOODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className={`checkin-mood-btn ${mood === m.value ? 'selected' : ''}`}
                  onClick={() => setMood(mood === m.value ? null : m.value)}
                  title={m.label}
                >
                  {m.emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="checkin-questions">
            <div className="checkin-question">
              <label>1. ¿Cómo avanzaste esta semana respecto a tus KPIs?</label>
              <textarea
                value={q1}
                onChange={(e) => setQ1(e.target.value)}
                rows={3}
                placeholder="Describí los avances, logros o lo que completaste..."
                className={formError && !q1.trim() ? 'error' : ''}
              />
            </div>
            <div className="checkin-question">
              <label>2. ¿Qué obstáculos encontraste?</label>
              <textarea
                value={q2}
                onChange={(e) => setQ2(e.target.value)}
                rows={3}
                placeholder="Blockers, dependencias, problemas sin resolver..."
                className={formError && !q2.trim() ? 'error' : ''}
              />
            </div>
            <div className="checkin-question">
              <label>3. ¿Cuál es tu foco principal para la próxima semana?</label>
              <textarea
                value={q3}
                onChange={(e) => setQ3(e.target.value)}
                rows={3}
                placeholder="Tus 1-2 prioridades para los próximos 7 días..."
                className={formError && !q3.trim() ? 'error' : ''}
              />
            </div>
          </div>

          {formError && <p className="checkin-error">{formError}</p>}

          <div className="checkin-form-actions">
            {showForm && (
              <button className="btn-secondary" onClick={() => { setShowForm(false); if (currentCheckIn) { setQ1(currentCheckIn.q1); setQ2(currentCheckIn.q2); setQ3(currentCheckIn.q3); setMood(currentCheckIn.mood) } }}>
                Cancelar
              </button>
            )}
            <button
              className="btn-primary"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isLoading}
            >
              {saveMutation.isLoading ? 'Guardando...' : alreadySubmitted ? 'Actualizar check-in' : 'Enviar check-in'}
            </button>
          </div>
        </div>
      )}

      {/* Already submitted — read-only card */}
      {isCollaborator && alreadySubmitted && !showForm && (
        <div className="checkin-submitted-card">
          <div className="checkin-submitted-header">
            <span className="checkin-week-label">Semana del {formatWeek(currentCheckIn!.weekStart)}</span>
            <span className="checkin-submitted-badge">Enviado ✓</span>
          </div>
          {currentCheckIn!.mood && (
            <div className="checkin-submitted-mood">
              {MOODS.find((m) => m.value === currentCheckIn!.mood)?.emoji} {MOODS.find((m) => m.value === currentCheckIn!.mood)?.label}
            </div>
          )}
          <div className="checkin-qa-list">
            <div className="checkin-qa-item"><span className="checkin-q">¿Cómo avanzaste?</span><p className="checkin-a">{currentCheckIn!.q1}</p></div>
            <div className="checkin-qa-item"><span className="checkin-q">¿Obstáculos?</span><p className="checkin-a">{currentCheckIn!.q2}</p></div>
            <div className="checkin-qa-item"><span className="checkin-q">¿Foco siguiente semana?</span><p className="checkin-a">{currentCheckIn!.q3}</p></div>
          </div>
        </div>
      )}

      {/* Leader: team summary */}
      {!isCollaborator && teamSummary && teamSummary.length > 0 && (
        <div className="checkin-team-summary">
          <h3>Participación del equipo</h3>
          <div className="checkin-summary-bars">
            {teamSummary.map((row) => (
              <div key={row.weekStart} className="checkin-summary-row">
                <span className="checkin-summary-week">{formatWeek(row.weekStart)}</span>
                <div className="checkin-summary-bar-wrap">
                  <div
                    className="checkin-summary-bar"
                    style={{ width: `${Math.min((row.total / ((collaborators?.length || 1))) * 100, 100)}%` }}
                  />
                </div>
                <span className="checkin-summary-count">{row.total} check-ins</span>
                {row.avgMood && (
                  <span className="checkin-summary-mood" style={{ color: moodColor(row.avgMood) }}>
                    {MOODS.find((m) => m.value === Math.round(row.avgMood))?.emoji || ''} {Number(row.avgMood).toFixed(1)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters (leaders) */}
      {!isCollaborator && (
        <div className="checkins-filters">
          <label>
            Colaborador
            <select value={filterCollaborator} onChange={(e) => setFilterCollaborator(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Todos</option>
              {(collaborators || []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Últimas semanas
            <select value={filterWeeks} onChange={(e) => setFilterWeeks(Number(e.target.value))}>
              <option value={4}>4 semanas</option>
              <option value={8}>8 semanas</option>
              <option value={12}>12 semanas</option>
              <option value={24}>24 semanas</option>
            </select>
          </label>
        </div>
      )}

      {/* History list */}
      <div className="checkins-list">
        <h3>{isCollaborator ? 'Mis check-ins anteriores' : 'Check-ins del equipo'}</h3>
        {isLoading ? (
          <div className="checkins-empty">Cargando...</div>
        ) : !checkIns?.length ? (
          <div className="checkins-empty">No hay check-ins registrados.</div>
        ) : (
          checkIns
            .filter((ci) => isCollaborator ? ci.weekStart !== thisWeek : true)
            .map((ci) => (
              <div key={ci.id} className="checkin-history-card">
                <div className="checkin-history-header">
                  <div>
                    {!isCollaborator && (
                      <span className="checkin-history-name">{ci.collaboratorName}</span>
                    )}
                    <span className="checkin-history-week">{formatWeek(ci.weekStart)}</span>
                  </div>
                  {ci.mood && (
                    <span className="checkin-history-mood">
                      {MOODS.find((m) => m.value === ci.mood)?.emoji}
                    </span>
                  )}
                </div>
                <div className="checkin-qa-list compact">
                  <div className="checkin-qa-item"><span className="checkin-q">Avances</span><p className="checkin-a">{ci.q1}</p></div>
                  <div className="checkin-qa-item"><span className="checkin-q">Obstáculos</span><p className="checkin-a">{ci.q2}</p></div>
                  <div className="checkin-qa-item"><span className="checkin-q">Foco próxima semana</span><p className="checkin-a">{ci.q3}</p></div>
                </div>
              </div>
            ))
        )}
      </div>

      {/* My KPIs quick access (collaborators) */}
      {isCollaborator && myKpis && myKpis.length > 0 && showForm && (
        <div className="checkin-kpi-hint">
          <span>Tus KPIs activos:</span>
          {myKpis.filter((k: any) => k.status !== 'closed').slice(0, 5).map((k: any) => (
            <span key={k.id} className="checkin-kpi-chip">
              {k.kpiName || `KPI #${k.kpiId}`}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
