/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar } from 'recharts'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import './Evolutivo.css'

interface Collaborator {
  id: number
  name: string
  area: string
}

interface KPI {
  id: number
  name: string
  type: string
}

interface Period {
  id: number
  name: string
}

interface EvolutionPoint {
  id: number
  monthDate: string
  planValue: number | null
  actualValue: number | null
  variation: number | null
  collaboratorName: string
  collaboratorArea: string
  kpiName: string
  kpiType: string
  kpiDirection?: 'growth' | 'reduction' | 'exact'
  periodName?: string
}

export default function Evolutivo() {
  const { user } = useAuth()
  const { t, i18n } = useTranslation('history')
  const locale = i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'es-AR'
  const [selectedCollaborator, setSelectedCollaborator] = useState<number | null>(null)
  const [selectedKPI, setSelectedKPI] = useState<number | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState<number | ''>('')
  const [collaboratorKpis, setCollaboratorKpis] = useState<KPI[]>([])

  const { data: collaborators } = useQuery<Collaborator[]>('collaborators', async () => {
    const response = await api.get('/collaborators')
    return response.data
  })

  const { data: kpis } = useQuery<KPI[]>('kpis', async () => {
    const response = await api.get('/kpis')
    return response.data
  })

  const { data: periods } = useQuery<Period[]>('periods', async () => {
    const response = await api.get('/periods')
    return response.data
  })

  const { data: evolution, isLoading } = useQuery<EvolutionPoint[]>(
    ['evolution', selectedCollaborator, selectedKPI, selectedPeriod],
    async () => {
      const params: any = {}
      if (selectedCollaborator) params.collaboratorId = selectedCollaborator
      if (selectedKPI) params.kpiId = selectedKPI
      if (selectedPeriod) params.periodId = selectedPeriod
      const response = await api.get('/evolution', { params })
      return response.data
    },
    {
      enabled: !!selectedCollaborator && !!selectedKPI,
    }
  )

  useEffect(() => {
    if (user?.collaboratorId) {
      setSelectedCollaborator(user.collaboratorId)
    }
  }, [user?.collaboratorId])

  useEffect(() => {
    const loadKpis = async () => {
      if (!selectedCollaborator) {
        setCollaboratorKpis([])
        return
      }
      const params: any = {}
      if (selectedPeriod) params.periodId = selectedPeriod
      const res = await api.get(`/collaborator-kpis/collaborator/${selectedCollaborator}`, { params })
      const seen = new Map<number, KPI>()
      res.data.forEach((item: any) => {
        if (!seen.has(item.kpiId)) {
          seen.set(item.kpiId, { id: item.kpiId, name: item.kpiName || `KPI #${item.kpiId}`, type: item.kpiType })
        }
      })
      setCollaboratorKpis(Array.from(seen.values()))
    }
    loadKpis()
  }, [selectedCollaborator, selectedPeriod])

  const chartData = useMemo(() => {
    return (
      evolution?.map((point) => ({
        month: new Date(point.monthDate).toLocaleDateString(locale, {
          month: 'short',
          year: '2-digit',
        }),
        plan: point.planValue ?? 0,
        actual: point.actualValue ?? 0,
        variation: point.variation ?? 0,
      })) || []
    )
  }, [evolution, locale])

  const latest = evolution && evolution.length > 0 ? evolution[evolution.length - 1] : null
  const collaboratorName = evolution && evolution[0]?.collaboratorName
  const kpiName = evolution && evolution[0]?.kpiName

  return (
    <div className="evolutivo-page">
      <div className="evolutivo-header">
        <div>
          <h1>{t('evolution.title')}</h1>
          <p>{t('evolution.subtitle')}</p>
        </div>
        {latest && (
          <div className="kpi-pill">
            <div className="pill-title">{kpiName}</div>
            <div className="pill-sub">
              {collaboratorName} {latest.collaboratorArea ? `· ${latest.collaboratorArea}` : ''}
            </div>
          </div>
        )}
      </div>

      <div className="filters">
        <div className="filter">
          <label>{t('evolution.filter_collaborator')}</label>
          <select
            value={selectedCollaborator || ''}
            onChange={(e) => setSelectedCollaborator(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t('evolution.filter_collaborator_placeholder')}</option>
            {collaborators?.map((col) => (
              <option key={col.id} value={col.id}>
                {col.name} {col.area ? `(${col.area})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="filter">
          <label>{t('evolution.filter_kpi')}</label>
          <select
            value={selectedKPI || ''}
            onChange={(e) => setSelectedKPI(e.target.value ? Number(e.target.value) : null)}
            disabled={!selectedCollaborator}
          >
            <option value="">{t('evolution.filter_kpi_placeholder')}</option>
            {(selectedCollaborator ? collaboratorKpis : kpis || []).map((kpi) => (
              <option key={kpi.id} value={kpi.id}>
                {kpi.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter">
          <label>{t('evolution.filter_period')}</label>
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">{t('evolution.filter_all_periods')}</option>
            {periods?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!selectedCollaborator || !selectedKPI ? (
        <div className="empty-state">
          <div className="empty-icon">🗂️</div>
          <h3>{t('evolution.empty_select_title')}</h3>
          <p>{t('evolution.empty_select_subtitle')}</p>
        </div>
      ) : isLoading ? (
        <div className="loading">{t('evolution.loading')}</div>
      ) : evolution && evolution.length > 0 ? (
        <>
          <div className="cards">
            <div className="card">
              <p className="card-label">{t('evolution.card_last_plan')}</p>
              <p className="card-value">{latest?.planValue ?? '-'}</p>
            </div>
            <div className="card">
              <p className="card-label">{t('evolution.card_last_actual')}</p>
              <p className="card-value accent">{latest?.actualValue ?? '-'}</p>
            </div>
            <div className="card">
              <p className="card-label">{t('evolution.card_variation')}</p>
              <p className="card-value">{latest?.variation !== null && latest?.variation !== undefined ? `${latest.variation.toFixed(1)}%` : '-'}</p>
            </div>
          </div>

          <div className="chart-block">
            <h3>{t('evolution.chart_plan_actual_title')}</h3>
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="plan" name={t('evolution.line_plan')} stroke="#a3a3a3" />
                <Line type="monotone" dataKey="actual" name={t('evolution.line_actual')} stroke="#f97316" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-block">
            <h3>{t('evolution.chart_variation_title')}</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="variation" name={t('evolution.bar_variation')} fill="#16a34a" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="table-block">
            <h3>{t('evolution.table_title')}</h3>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>{t('evolution.table_month')}</th>
                    <th>{t('evolution.table_plan')}</th>
                    <th>{t('evolution.table_actual')}</th>
                    <th>{t('evolution.table_variation')}</th>
                    <th>{t('evolution.table_period')}</th>
                  </tr>
                </thead>
                <tbody>
                  {evolution.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {new Date(item.monthDate).toLocaleDateString(locale, {
                          month: 'long',
                          year: 'numeric',
                        })}
                      </td>
                      <td>{item.planValue ?? '-'}</td>
                      <td>{item.actualValue ?? '-'}</td>
                      <td>{item.variation !== null && item.variation !== undefined ? `${item.variation.toFixed(1)}%` : '-'}</td>
                      <td>{item.periodName || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">🤷</div>
          <h3>{t('evolution.empty_no_data_title')}</h3>
          <p>{t('evolution.empty_no_data_subtitle')}</p>
        </div>
      )}
    </div>
  )
}
