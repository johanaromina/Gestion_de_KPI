/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
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
  note?: string | null
  kpiName?: string | null
  createdAt: string
}

const MOODS = [
  { value: 1, emoji: '😞' },
  { value: 2, emoji: '😕' },
  { value: 3, emoji: '😐' },
  { value: 4, emoji: '🙂' },
  { value: 5, emoji: '😄' },
]

const getMonday = (offset = 0): string => {
  const today = new Date()
  const day = today.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(today)
  monday.setDate(today.getDate() + diff + offset * 7)
  return monday.toISOString().slice(0, 10)
}

const moodColor = (mood: number | null) => {
  if (mood == null) return '#9ca3af'
  if (mood >= 4) return '#15803d'
  if (mood >= 3) return '#b45309'
  return '#b91c1c'
}

export default function CheckIns() {
  const { t, i18n } = useTranslation('checkins')
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
  const [noteEditId, setNoteEditId] = useState<number | null>(null)
  const [noteText, setNoteText] = useState('')

  const thisWeek = getMonday()

  const locale = i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'es-AR'

  const formatWeek = (dateStr: string): string => {
    const d = new Date(dateStr + 'T12:00:00')
    const end = new Date(d)
    end.setDate(d.getDate() + 6)
    return `${d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`
  }

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

  const noteMutation = useMutation(
    async ({ id, note }: { id: number; note: string }) => {
      await api.patch(`/check-ins/${id}/note`, { note })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('check-ins')
        queryClient.invalidateQueries('check-in-current')
        setNoteEditId(null)
      },
    }
  )

  const saveMutation = useMutation(
    async () => {
      if (!q1.trim() || !q2.trim() || !q3.trim()) {
        setFormError(t('form.error_required'))
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

  /* Own check-in history (for leaders who also report up) */
  const { data: myOwnCheckIns } = useQuery<CheckIn[]>(
    ['my-own-check-ins', user?.collaboratorId, filterWeeks],
    async () =>
      (
        await api.get('/check-ins', {
          params: {
            collaboratorId: user?.collaboratorId,
            weekStart: getMonday(-(filterWeeks - 1)),
          },
        })
      ).data,
    { enabled: !isCollaborator && !!user?.collaboratorId }
  )

  const alreadySubmitted = !!currentCheckIn
  const canEdit = alreadySubmitted || showForm

  return (
    <div className="checkins-page">
      {/* Header */}
      <div className="checkins-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="subtitle">{t('subtitle')}</p>
        </div>
        {!canEdit && (
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            {t('actions.do_checkin')}
          </button>
        )}
        {alreadySubmitted && !showForm && (
          <button className="btn-secondary" onClick={() => setShowForm(true)}>
            {t('actions.edit_checkin')}
          </button>
        )}
      </div>

      {/* Check-in form */}
      {(showForm || (!loadingCurrent && !alreadySubmitted)) && (
        <div className="checkin-form-card">
          <div className="checkin-form-header">
            <div>
              <span className="checkin-week-label">{t('form.week_label', { week: formatWeek(thisWeek) })}</span>
              {alreadySubmitted && <span className="checkin-edit-badge">{t('form.editing_badge')}</span>}
            </div>
          </div>

          {/* Mood selector */}
          <div className="checkin-mood-row">
            <span className="checkin-mood-label">{t('form.mood_question')}</span>
            <div className="checkin-mood-options">
              {MOODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className={`checkin-mood-btn ${mood === m.value ? 'selected' : ''}`}
                  onClick={() => setMood(mood === m.value ? null : m.value)}
                  title={t(`mood.${m.value}`)}
                >
                  {m.emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="checkin-questions">
            <div className="checkin-question">
              <label>{t('form.q1_label')}</label>
              <textarea
                value={q1}
                onChange={(e) => setQ1(e.target.value)}
                rows={3}
                placeholder={t('form.q1_placeholder')}
                className={formError && !q1.trim() ? 'error' : ''}
              />
            </div>
            <div className="checkin-question">
              <label>{t('form.q2_label')}</label>
              <textarea
                value={q2}
                onChange={(e) => setQ2(e.target.value)}
                rows={3}
                placeholder={t('form.q2_placeholder')}
                className={formError && !q2.trim() ? 'error' : ''}
              />
            </div>
            <div className="checkin-question">
              <label>{t('form.q3_label')}</label>
              <textarea
                value={q3}
                onChange={(e) => setQ3(e.target.value)}
                rows={3}
                placeholder={t('form.q3_placeholder')}
                className={formError && !q3.trim() ? 'error' : ''}
              />
            </div>
          </div>

          {formError && <p className="checkin-error">{formError}</p>}

          <div className="checkin-form-actions">
            {showForm && (
              <button className="btn-secondary" onClick={() => { setShowForm(false); if (currentCheckIn) { setQ1(currentCheckIn.q1); setQ2(currentCheckIn.q2); setQ3(currentCheckIn.q3); setMood(currentCheckIn.mood) } }}>
                {t('actions.cancel')}
              </button>
            )}
            <button
              className="btn-primary"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isLoading}
            >
              {saveMutation.isLoading ? t('actions.saving') : alreadySubmitted ? t('actions.update') : t('actions.submit')}
            </button>
          </div>
        </div>
      )}

      {/* Already submitted — read-only card */}
      {alreadySubmitted && !showForm && (
        <div className="checkin-submitted-card">
          <div className="checkin-submitted-header">
            <span className="checkin-week-label">{t('form.week_label', { week: formatWeek(currentCheckIn!.weekStart) })}</span>
            <span className="checkin-submitted-badge">{t('submitted.badge')}</span>
          </div>
          {currentCheckIn!.mood && (
            <div className="checkin-submitted-mood">
              {MOODS.find((m) => m.value === currentCheckIn!.mood)?.emoji} {t(`mood.${currentCheckIn!.mood}`)}
            </div>
          )}
          <div className="checkin-qa-list">
            <div className="checkin-qa-item"><span className="checkin-q">{t('submitted.q1_label')}</span><p className="checkin-a">{currentCheckIn!.q1}</p></div>
            <div className="checkin-qa-item"><span className="checkin-q">{t('submitted.q2_label')}</span><p className="checkin-a">{currentCheckIn!.q2}</p></div>
            <div className="checkin-qa-item"><span className="checkin-q">{t('submitted.q3_label')}</span><p className="checkin-a">{currentCheckIn!.q3}</p></div>
          </div>
          {currentCheckIn!.note && (
            <div className="checkin-leader-note">
              <span className="checkin-note-label">{t('submitted.leader_note_label')}</span>
              <p className="checkin-a">{currentCheckIn!.note}</p>
            </div>
          )}
        </div>
      )}

      {/* Leader: team summary */}
      {!isCollaborator && teamSummary && teamSummary.length > 0 && (
        <div className="checkin-team-summary">
          <h3>{t('team_summary.title')}</h3>
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
                <span className="checkin-summary-count">{t('team_summary.count', { total: row.total })}</span>
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

      {/* Leader: own check-in history */}
      {!isCollaborator && (
        <div className="checkins-list">
          <h3>{t('history.my_title')}</h3>
          {!myOwnCheckIns ? (
            <div className="checkins-empty">{t('history.loading')}</div>
          ) : myOwnCheckIns.filter((ci) => ci.weekStart !== thisWeek).length === 0 ? (
            <div className="checkins-empty">{t('history.empty_own')}</div>
          ) : (
            myOwnCheckIns
              .filter((ci) => ci.weekStart !== thisWeek)
              .map((ci) => (
                <div key={ci.id} className="checkin-history-card">
                  <div className="checkin-history-header">
                    <span className="checkin-history-week">{formatWeek(ci.weekStart)}</span>
                    {ci.mood && (
                      <span className="checkin-history-mood">
                        {MOODS.find((m) => m.value === ci.mood)?.emoji}
                      </span>
                    )}
                  </div>
                  <div className="checkin-qa-list compact">
                    <div className="checkin-qa-item"><span className="checkin-q">{t('history.q1_short')}</span><p className="checkin-a">{ci.q1}</p></div>
                    <div className="checkin-qa-item"><span className="checkin-q">{t('history.q2_short')}</span><p className="checkin-a">{ci.q2}</p></div>
                    <div className="checkin-qa-item"><span className="checkin-q">{t('history.q3_short')}</span><p className="checkin-a">{ci.q3}</p></div>
                  </div>
                </div>
              ))
          )}
        </div>
      )}

      {/* Filters (leaders) */}
      {!isCollaborator && (
        <div className="checkins-filters">
          <label>
            {t('filters.collaborator_label')}
            <select value={filterCollaborator} onChange={(e) => setFilterCollaborator(e.target.value ? Number(e.target.value) : '')}>
              <option value="">{t('filters.all_collaborators')}</option>
              {(collaborators || []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            {t('filters.weeks_label')}
            <select value={filterWeeks} onChange={(e) => setFilterWeeks(Number(e.target.value))}>
              {[4, 8, 12, 24].map((n) => (
                <option key={n} value={n}>{t('filters.weeks_option', { count: n })}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* History list */}
      <div className="checkins-list">
        <h3>{isCollaborator ? t('history.my_title') : t('history.team_title')}</h3>
        {isLoading ? (
          <div className="checkins-empty">{t('history.loading')}</div>
        ) : !checkIns?.length ? (
          <div className="checkins-empty">{t('history.empty')}</div>
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
                  <div className="checkin-qa-item"><span className="checkin-q">{t('history.q1_short')}</span><p className="checkin-a">{ci.q1}</p></div>
                  <div className="checkin-qa-item"><span className="checkin-q">{t('history.q2_short')}</span><p className="checkin-a">{ci.q2}</p></div>
                  <div className="checkin-qa-item"><span className="checkin-q">{t('history.q3_short')}</span><p className="checkin-a">{ci.q3}</p></div>
                </div>
                {isCollaborator && ci.note && (
                  <div className="checkin-leader-note">
                    <span className="checkin-note-label">{t('history.leader_note_label')}</span>
                    <p className="checkin-a">{ci.note}</p>
                  </div>
                )}
                {!isCollaborator && (
                  <div className="checkin-note-section">
                    {noteEditId === ci.id ? (
                      <div className="checkin-note-edit">
                        <textarea
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          rows={2}
                          placeholder={t('history.note_placeholder')}
                        />
                        <div className="checkin-note-actions">
                          <button className="btn-secondary btn-sm" onClick={() => setNoteEditId(null)}>
                            {t('actions.cancel')}
                          </button>
                          <button
                            className="btn-primary btn-sm"
                            disabled={noteMutation.isLoading}
                            onClick={() => noteMutation.mutate({ id: ci.id, note: noteText })}
                          >
                            {noteMutation.isLoading ? t('history.saving_note') : t('actions.save_comment')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="checkin-note-display">
                        {ci.note && (
                          <p className="checkin-note-text">{ci.note}</p>
                        )}
                        <button
                          className="checkin-note-btn"
                          onClick={() => { setNoteEditId(ci.id); setNoteText(ci.note ?? '') }}
                        >
                          {ci.note ? t('actions.edit_comment') : t('actions.add_comment')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
        )}
      </div>

      {/* My KPIs quick access */}
      {myKpis && myKpis.length > 0 && showForm && (
        <div className="checkin-kpi-hint">
          <span>{t('kpi_hint')}</span>
          {myKpis.filter((k: any) => k.status !== 'closed').slice(0, 5).map((k: any) => (
            <span key={k.id} className="checkin-kpi-chip">
              {k.kpiName || t('kpi_fallback', { id: k.kpiId })}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
