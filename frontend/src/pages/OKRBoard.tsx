import { useState } from 'react'
import { useQuery } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import './OKRBoard.css'

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
  linkedKpis?: Array<{ kpiName?: string | null; sourceName?: string | null; actual?: number | null; target?: number | null; kpiWeight?: number | null }>
  weight: number
  status: KRStatus
  progressPercent: number
  ownerName?: string
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

interface Period {
  id: number
  name: string
  status: string
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

const PAGE_SIZE = 12

export default function OKRBoard() {
  const navigate = useNavigate()
  const { t } = useTranslation('okr')
  const [selectedPeriod, setSelectedPeriod] = useState<number | ''>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [page, setPage] = useState(1)

  const { data: periods = [] } = useQuery<Period[]>('periods', async () => {
    const res = await api.get('/periods')
    return res.data
  })

  const { data: objectives = [], isLoading } = useQuery<Objective[]>(
    ['okr-objectives', selectedPeriod, statusFilter],
    async () => {
      const params: Record<string, any> = {}
      if (selectedPeriod) params.periodId = selectedPeriod
      if (statusFilter) params.status = statusFilter
      const res = await api.get('/okr', { params })
      return res.data
    },
    { enabled: true, keepPreviousData: true }
  )

  // Reset page when filters change
  const handlePeriodChange = (v: string) => { setSelectedPeriod(v ? Number(v) : ''); setPage(1) }
  const handleStatusChange = (v: string) => { setStatusFilter(v); setPage(1) }

  const totalPages = Math.max(1, Math.ceil(objectives.length / PAGE_SIZE))
  const displayed = objectives.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="okr-board">
      <div className="okr-board-header">
        <div>
          <h2>{t('title')}</h2>
          <p className="okr-board-subtitle">{t('subtitle')}</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/okr/nuevo')}>
          {t('new_objective')}
        </button>
      </div>

      <div className="okr-filters">
        <select value={selectedPeriod} onChange={(e) => handlePeriodChange(e.target.value)}>
          <option value="">{t('filters.all_periods')}</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select value={statusFilter} onChange={(e) => handleStatusChange(e.target.value)}>
          <option value="">{t('filters.all_states')}</option>
          <option value="active">{t('status.active')}</option>
          <option value="draft">{t('status.draft')}</option>
          <option value="closed">{t('status.closed')}</option>
        </select>

        {selectedPeriod && (
          <>
            <button
              className="btn-export btn-export-pdf"
              title={t('export.pdf_title')}
              onClick={() => window.open(
                `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/export/okr/period/${selectedPeriod}/pdf`,
                '_blank'
              )}
            >
              📄 PDF
            </button>
            <button
              className="btn-export btn-export-excel"
              title={t('export.excel_title')}
              onClick={() => window.open(
                `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/export/okr/period/${selectedPeriod}/excel`,
                '_blank'
              )}
            >
              📊 Excel
            </button>
          </>
        )}
      </div>

      {isLoading && <div className="okr-loading">{t('loading')}</div>}

      {!isLoading && displayed.length === 0 && (
        <div className="okr-empty">
          <p>{t('empty.message')}</p>
          <button className="btn-primary" onClick={() => navigate('/okr/nuevo')}>
            {t('empty.create')}
          </button>
        </div>
      )}

      {totalPages > 1 && (
        <div className="okr-pagination">
          <button className="okr-page-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>{t('pagination.prev')}</button>
          <span className="okr-page-info">{t('pagination.info', { page, totalPages, count: objectives.length })}</span>
          <button className="okr-page-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>{t('pagination.next')}</button>
        </div>
      )}

      <div className="okr-cards">
        {displayed.map((obj) => (
          <div
            key={obj.id}
            className={`okr-card okr-card--${obj.status}`}
            onClick={() => navigate(`/okr/${obj.id}`)}
          >
            <div className="okr-card-header">
              <div className="okr-card-meta">
                {obj.orgScopeName && <span className="okr-badge okr-badge--scope">{obj.orgScopeName}</span>}
                {obj.periodName && <span className="okr-badge okr-badge--period">{obj.periodName}</span>}
              </div>
              <span className={`okr-status-pill okr-status-pill--${obj.status}`}>
                {t(`status.${obj.status}`)}
              </span>
            </div>

            <h3 className="okr-card-title">{obj.title}</h3>
            {obj.description && <p className="okr-card-desc">{obj.description}</p>}
            {obj.ownerName && <p className="okr-card-owner">{t('card.owner', { name: obj.ownerName })}</p>}

            {/* Progress bar */}
            <div className="okr-progress-section">
              <div className="okr-progress-label">
                <span>{t('card.progress')}</span>
                <span style={{ color: progressColor(Number(obj.progress) || 0) }}>{Math.round(Number(obj.progress) || 0)}%</span>
              </div>
              <div className="okr-progress-track">
                <div
                  className="okr-progress-fill"
                  style={{ width: `${Number(obj.progress) || 0}%`, background: progressColor(Number(obj.progress) || 0) }}
                />
              </div>
            </div>

            {/* Key Results */}
            {obj.keyResults && obj.keyResults.length > 0 && (
              <div className="okr-kr-list">
                {obj.keyResults.map((kr) => (
                  <div key={kr.id} className="okr-kr-row">
                    <div className="okr-kr-row-top">
                      <span className="okr-kr-title">{kr.title}</span>
                      <span
                        className="okr-kr-status"
                        style={{ color: STATUS_COLOR[kr.status] }}
                      >
                        {t(`status.${kr.status}`)}
                      </span>
                    </div>
                    <div className="okr-kr-progress-track">
                      <div
                        className="okr-kr-progress-fill"
                        style={{
                          width: `${Number(kr.progressPercent) || 0}%`,
                          background: STATUS_COLOR[kr.status],
                        }}
                      />
                    </div>
                    <div className="okr-kr-values">
                      {kr.krType === 'kpi_linked' ? (
                        <div className="okr-kr-linked-kpis">
                          {(kr.linkedKpis && kr.linkedKpis.length > 0)
                            ? kr.linkedKpis.map((lk, i) => (
                                <span key={i} className="okr-kr-linked-badge">
                                  {lk.kpiName ?? 'KPI'}{lk.sourceName ? ` — ${lk.sourceName}` : ''}{': '}
                                  {lk.actual ?? '—'} / {lk.target ?? '—'}
                                  {kr.linkedKpis!.length > 1 && lk.kpiWeight ? ` (${Math.round(lk.kpiWeight * 100)}%)` : ''}
                                </span>
                              ))
                            : <span className="okr-kr-linked-badge">KPI: {kr.kpiName ?? '—'} — {kr.kpiActual ?? '—'} / {kr.kpiTarget ?? '—'}</span>
                          }
                        </div>
                      ) : (
                        <span>
                          {kr.currentValue ?? kr.startValue ?? 0} / {kr.targetValue ?? 0}
                          {kr.unit ? ` ${kr.unit}` : ''}
                        </span>
                      )}
                      <span>{Math.round(Number(kr.progressPercent) || 0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="okr-pagination okr-pagination--bottom">
          <button className="okr-page-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>{t('pagination.prev')}</button>
          <span className="okr-page-info">{t('pagination.info_short', { page, totalPages })}</span>
          <button className="okr-page-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>{t('pagination.next')}</button>
        </div>
      )}
    </div>
  )
}
