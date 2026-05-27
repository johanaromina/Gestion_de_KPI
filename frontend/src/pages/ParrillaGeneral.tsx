/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { CollaboratorKPI } from '../types'
import './ParrillaGeneral.css'

const toNumber = (val: any): number | null => {
  const n = Number(val)
  return Number.isFinite(n) ? n : null
}

export default function ParrillaGeneral() {
  const { t } = useTranslation(['grid', 'common'])
  const { user } = useAuth()
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  const canView = !!user?.hasSuperpowers

  const { data: periods } = useQuery(
    'periods',
    async () => {
    const res = await api.get('/periods')
    return res.data
    },
    { enabled: canView }
  )

  const { data: collaborators } = useQuery(
    'collaborators',
    async () => {
    const res = await api.get('/collaborators')
    return res.data
    },
    { enabled: canView }
  )

  const { data: assignments, isLoading } = useQuery<CollaboratorKPI[]>(
    ['collaborator-kpis', selectedPeriodId, selectedCollaboratorId],
    async () => {
      let url = '/collaborator-kpis'
      if (selectedPeriodId) {
        url = `/collaborator-kpis/period/${selectedPeriodId}`
      } else if (selectedCollaboratorId) {
        url = `/collaborator-kpis/collaborator/${selectedCollaboratorId}`
      }
      const res = await api.get(url)
      return res.data
    },
    { enabled: canView && (!!selectedPeriodId || !!selectedCollaboratorId) }
  )

  const summaryRows = useMemo(
    () => assignments?.filter((a) => (a as any).subPeriodId == null) || [],
    [assignments]
  )

  const monthlyByKey = useMemo(() => {
    const map = new Map<string, CollaboratorKPI[]>()
    assignments
      ?.filter((a) => (a as any).subPeriodId !== null)
      ?.forEach((a: any) => {
        const key = `${a.collaboratorId}-${a.kpiId}-${a.periodId}`
        const arr = map.get(key) || []
        arr.push(a)
        map.set(key, arr)
      })
    // sort by subPeriodId asc
    map.forEach((arr) => {
      arr.sort((a: any, b: any) => (a.subPeriodId || 0) - (b.subPeriodId || 0))
    })
    return map
  }, [assignments])

  const filtered = summaryRows.filter((a) => {
    const matchPeriod = !selectedPeriodId || a.periodId === selectedPeriodId
    const matchCollab = !selectedCollaboratorId || a.collaboratorId === selectedCollaboratorId
    const matchSearch =
      !search ||
      (collaborators?.find((c: any) => c.id === a.collaboratorId)?.name || '')
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      (a as any).kpiName?.toLowerCase().includes(search.toLowerCase())
    return matchPeriod && matchCollab && matchSearch
  })

  const cardsByCollaborator = useMemo(() => {
    const grouped: Record<
      number,
      {
        collabName: string
        totalKpis: number
        weightSum: number
        avgVariation: number | null
        worstVariation: number | null
      }
    > = {}
    filtered.forEach((a) => {
      const name = collaborators?.find((c: any) => c.id === a.collaboratorId)?.name || String(a.collaboratorId)
      const key = a.collaboratorId
      const variation = toNumber((a as any).variation)
      if (!grouped[key]) {
        grouped[key] = { collabName: name, totalKpis: 0, weightSum: 0, avgVariation: 0, worstVariation: null }
      }
      grouped[key].totalKpis += 1
      grouped[key].weightSum += toNumber(a.weight) || 0
      if (variation !== null) {
        grouped[key].avgVariation = (grouped[key].avgVariation || 0) + variation
        grouped[key].worstVariation =
          grouped[key].worstVariation === null ? variation : Math.min(grouped[key].worstVariation, variation)
      }
    })
    Object.values(grouped).forEach((g) => {
      g.avgVariation = g.totalKpis > 0 ? Number(((g.avgVariation || 0) / g.totalKpis).toFixed(1)) : null
    })
    return grouped
  }, [filtered, collaborators])

  const variationClass = (v: number | null) => {
    if (v === null) return ''
    if (v >= 100) return 'var-good'
    if (v >= 90) return 'var-warn'
    return 'var-bad'
  }

  const getStatusLabel = (status?: string) => {
    if (!status) return '-'
    const normalized = status.toLowerCase()
    if (normalized === 'proposed') return t('grid:status.proposed')
    const commonStatuses = ['draft', 'approved', 'closed', 'pending', 'in_review', 'rejected', 'changes_requested', 'open']
    if (commonStatuses.includes(normalized)) {
      return t(`common:${normalized}`)
    }
    return status
  }

  const getKpiTypeLabel = (type?: string) => {
    if (!type) return t('grid:general.types.kpi')
    const normalized = type.toLowerCase()
    const knownTypes = ['kpi', 'manual', 'count', 'ratio', 'sla', 'value', 'growth', 'reduction', 'exact']
    if (knownTypes.includes(normalized)) {
      return t(`grid:general.types.${normalized}`)
    }
    return type
  }

  if (!canView) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="parrilla-general-page">
      <div className="page-header">
        <div>
          <h1>{t('general.title')}</h1>
          <p className="subtitle">{t('general.subtitle')}</p>
        </div>
      </div>

      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="pg-search">{t('general.filters.search_label')}</label>
          <input
            id="pg-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('general.filters.search_placeholder')}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="pg-period">{t('general.filters.period_label')}</label>
          <select
            id="pg-period"
            value={selectedPeriodId || ''}
            onChange={(e) => setSelectedPeriodId(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">{t('general.filters.all')}</option>
            {periods?.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="pg-collab">{t('general.filters.collaborator_label')}</label>
          <select
            id="pg-collab"
            value={selectedCollaboratorId || ''}
            onChange={(e) => setSelectedCollaboratorId(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">{t('general.filters.all')}</option>
            {collaborators?.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="cards-grid">
        {Object.entries(cardsByCollaborator).map(([collabId, data]) => (
          <div
            key={collabId}
            className={`summary-card ${data.weightSum === 100 ? 'ok' : data.weightSum > 100 ? 'error' : 'warn'}`}
          >
            <div className="card-title">{data.collabName}</div>
            <div className="card-meta">{t('general.card.kpis', { count: data.totalKpis })}</div>
            <div className="card-row">
              <span>{t('general.card.total_weight')}</span>
              <strong>{data.weightSum.toFixed(1)}%</strong>
            </div>
            <div className="card-row">
              <span>{t('general.card.avg_variation')}</span>
              <strong className={variationClass(data.avgVariation)}>{data.avgVariation ?? '-'}%</strong>
            </div>
            <div className="card-row">
              <span>{t('general.card.worst_variation')}</span>
              <strong className={variationClass(data.worstVariation)}>{data.worstVariation ?? '-'}%</strong>
            </div>
          </div>
        ))}
      </div>

      <div className="table-container">
        {!selectedPeriodId && !selectedCollaboratorId ? (
          <div className="empty-state">
            <h3>{t('general.empty.select_filter_title')}</h3>
            <p>{t('general.empty.select_filter_text')}</p>
          </div>
        ) : isLoading ? (
          <div className="loading">{t('general.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>{t('general.empty.no_data_title')}</h3>
            <p>{t('general.empty.no_data_text')}</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('general.table.collaborator')}</th>
                <th>{t('general.table.kpi')}</th>
                <th>{t('general.table.period')}</th>
                <th>{t('general.table.type')}</th>
                <th>{t('general.table.target')}</th>
                <th>{t('general.table.actual')}</th>
                <th>{t('general.table.weight')}</th>
                <th>{t('general.table.variation')}</th>
                <th>{t('general.table.status')}</th>
                <th>{t('general.table.trend')}</th>
                <th>{t('general.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td>{collaborators?.find((c: any) => c.id === a.collaboratorId)?.name || a.collaboratorId}</td>
                  <td>{(a as any).kpiName || a.kpiId}</td>
                  <td>{(a as any).periodName || a.periodId}</td>
                  <td>
                    {(() => {
                      const kpiType = (a as any).kpiType || (a as any).type || 'kpi'
                      return <span className={`badge-type ${kpiType}`}>{getKpiTypeLabel(kpiType)}</span>
                    })()}
                  </td>
                  <td className="number-cell">{toNumber(a.target) ?? '-'}</td>
                  <td className="number-cell">{toNumber(a.actual) ?? '-'}</td>
                  <td className="number-cell">{toNumber(a.weight) ?? 0}%</td>
                  <td className={`number-cell ${variationClass(toNumber((a as any).variation))}`}>
                    {toNumber(a.variation) !== null ? `${toNumber(a.variation)?.toFixed(1)}%` : '-'}
                  </td>
                  <td>{getStatusLabel(a.status)}</td>
                  <td>
                    <div className="sparkline">
                      {(monthlyByKey.get(`${a.collaboratorId}-${a.kpiId}-${a.periodId}`) || []).map((m: any) => {
                        const v = toNumber(m.variation) ?? 0
                        const h = Math.max(5, Math.min(40, v / 3)) // scale
                        return <span key={m.id} className={`bar ${variationClass(v)}`} style={{ height: `${h}px` }} />
                      })}
                    </div>
                  </td>
                  <td>
                    <button
                      className="btn-link"
                      onClick={() =>
                        navigate(
                          `/asignaciones?periodId=${a.periodId}&collaboratorId=${a.collaboratorId}&kpiId=${a.kpiId}`
                        )
                      }
                    >
                      {t('general.table.view_detail')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
