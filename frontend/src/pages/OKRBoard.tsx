import { useState } from 'react'
import { useQuery } from 'react-query'
import { useNavigate } from 'react-router-dom'
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

export default function OKRBoard() {
  const navigate = useNavigate()
  const [selectedPeriod, setSelectedPeriod] = useState<number | ''>('')
  const [statusFilter, setStatusFilter] = useState<string>('')

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
    { enabled: true }
  )

  // Enrich with key results
  const { data: enriched = [] } = useQuery<Objective[]>(
    ['okr-objectives-enriched', objectives.map((o) => o.id).join(',')],
    async () => {
      const results = await Promise.all(
        objectives.map(async (obj) => {
          const res = await api.get(`/okr/${obj.id}`)
          return res.data as Objective
        })
      )
      return results
    },
    { enabled: objectives.length > 0 }
  )

  const displayed = enriched.length > 0 ? enriched : objectives

  return (
    <div className="okr-board">
      <div className="okr-board-header">
        <div>
          <h2>OKRs</h2>
          <p className="okr-board-subtitle">Objetivos y Resultados Clave</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/okr/nuevo')}>
          + Nuevo objetivo
        </button>
      </div>

      <div className="okr-filters">
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">Todos los periodos</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="draft">Borrador</option>
          <option value="closed">Cerrado</option>
        </select>

        {selectedPeriod && (
          <>
            <button
              className="btn-export btn-export-pdf"
              title="Exportar período a PDF"
              onClick={() => window.open(
                `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/export/okr/period/${selectedPeriod}/pdf`,
                '_blank'
              )}
            >
              📄 PDF
            </button>
            <button
              className="btn-export btn-export-excel"
              title="Exportar período a Excel"
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

      {isLoading && <div className="okr-loading">Cargando objetivos...</div>}

      {!isLoading && displayed.length === 0 && (
        <div className="okr-empty">
          <p>No hay objetivos todavia.</p>
          <button className="btn-primary" onClick={() => navigate('/okr/nuevo')}>
            Crear primer objetivo
          </button>
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
                {obj.status === 'active' ? 'Activo' : obj.status === 'draft' ? 'Borrador' : 'Cerrado'}
              </span>
            </div>

            <h3 className="okr-card-title">{obj.title}</h3>
            {obj.description && <p className="okr-card-desc">{obj.description}</p>}
            {obj.ownerName && <p className="okr-card-owner">Responsable: {obj.ownerName}</p>}

            {/* Progress bar */}
            <div className="okr-progress-section">
              <div className="okr-progress-label">
                <span>Progreso</span>
                <span style={{ color: progressColor(obj.progress) }}>{Math.round(obj.progress)}%</span>
              </div>
              <div className="okr-progress-track">
                <div
                  className="okr-progress-fill"
                  style={{ width: `${obj.progress}%`, background: progressColor(obj.progress) }}
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
                        {STATUS_LABEL[kr.status]}
                      </span>
                    </div>
                    <div className="okr-kr-progress-track">
                      <div
                        className="okr-kr-progress-fill"
                        style={{
                          width: `${kr.progressPercent}%`,
                          background: STATUS_COLOR[kr.status],
                        }}
                      />
                    </div>
                    <div className="okr-kr-values">
                      {kr.krType === 'kpi_linked' ? (
                        <span className="okr-kr-linked-badge">KPI: {kr.kpiName ?? 'vinculado'}</span>
                      ) : (
                        <span>
                          {kr.currentValue ?? kr.startValue ?? 0} / {kr.targetValue ?? 0}
                          {kr.unit ? ` ${kr.unit}` : ''}
                        </span>
                      )}
                      <span>{Math.round(kr.progressPercent)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
