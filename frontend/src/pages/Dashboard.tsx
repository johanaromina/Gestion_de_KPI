import { useQuery } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import api from '../services/api'
import OnboardingWizard from '../components/OnboardingWizard'
import { calculateVariationPercent, calculateWeightedImpact, resolveDirection } from '../utils/kpi'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import './Dashboard.css'

// ─── Constants ────────────────────────────────────────────────────────────────

const DASHBOARD_STALE = 2 * 60 * 1000

const AREA_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16']

// ─── Static render helpers ────────────────────────────────────────────────────

function StatIcon({ name }: { name: 'users' | 'calendar' | 'target' | 'chart' | 'clipboard' | 'clock' }) {
  switch (name) {
    case 'users':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4ZM6 13a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm10 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Zm-10 .5C3.34 15.5 0 16.84 0 19.5V22h6v-2.5c0-1.14.47-2.06 1.2-2.78A8.3 8.3 0 0 0 6 15.5Z" fill="currentColor" />
        </svg>
      )
    case 'calendar':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1.5A2.5 2.5 0 0 1 22 6.5v13A2.5 2.5 0 0 1 19.5 22h-15A2.5 2.5 0 0 1 2 19.5v-13A2.5 2.5 0 0 1 4.5 4H6V3a1 1 0 0 1 1-1Zm-2.5 6V19.5c0 .55.45 1 1 1h15a1 1 0 0 0 1-1V8Z" fill="currentColor" />
        </svg>
      )
    case 'target':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm0 4a6 6 0 1 1-6 6 6 6 0 0 1 6-6Zm0 3a3 3 0 1 0 3 3 3 3 0 0 0-3-3Z" fill="currentColor" />
        </svg>
      )
    case 'chart':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 20a1 1 0 0 1-1-1V5a1 1 0 1 1 2 0v13h14a1 1 0 1 1 0 2Zm4-4a1 1 0 0 1-1-1V9a1 1 0 1 1 2 0v6a1 1 0 0 1-1 1Zm5 0a1 1 0 0 1-1-1V7a1 1 0 1 1 2 0v8a1 1 0 0 1-1 1Zm5 0a1 1 0 0 1-1-1v-4a1 1 0 1 1 2 0v4a1 1 0 0 1-1 1Z" fill="currentColor" />
        </svg>
      )
    case 'clipboard':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 2h6a2 2 0 0 1 2 2h1.5A1.5 1.5 0 0 1 20 5.5v14A2.5 2.5 0 0 1 17.5 22h-11A2.5 2.5 0 0 1 4 19.5v-14A1.5 1.5 0 0 1 5.5 4H7a2 2 0 0 1 2-2Zm0 2v1h6V4Zm-2 4a1 1 0 0 0-1 1v9.5c0 .55.45 1 1 1h10a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1Z" fill="currentColor" />
        </svg>
      )
    case 'clock':
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm1 5a1 1 0 0 0-2 0v5a1 1 0 0 0 .4.8l3 2.25a1 1 0 1 0 1.2-1.6L13 11.5Z" fill="currentColor" />
        </svg>
      )
  }
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-8 2-8 4.5V22h16v-3.5C20 16 16 14 12 14Z" fill="currentColor" />
    </svg>
  )
}

const progressColor = (p: number) =>
  p >= 70 ? '#16a34a' : p >= 40 ? '#d97706' : '#dc2626'

// ─── OKR Widget ───────────────────────────────────────────────────────────────

function OkrWidget({
  summary,
  title,
  onNavigate,
}: {
  summary: { active: number; avgProgress: number; atRisk: number }
  title: string
  onNavigate: () => void
}) {
  const { t } = useTranslation('dashboard')
  return (
    <div className="okr-widget">
      <div className="okr-widget-header">
        <h3>{title}</h3>
        <button className="okr-widget-link" onClick={onNavigate}>{t('okr_widget.see_all')}</button>
      </div>
      <div className="okr-widget-stats">
        <div className="okr-widget-stat">
          <span className="okr-widget-value">{summary.active}</span>
          <span className="okr-widget-label">{t('okr_widget.active_objectives')}</span>
        </div>
        <div className="okr-widget-stat">
          <span className="okr-widget-value" style={{ color: progressColor(summary.avgProgress) }}>
            {summary.avgProgress}%
          </span>
          <span className="okr-widget-label">{t('okr_widget.avg_progress')}</span>
        </div>
        {summary.atRisk > 0 && (
          <div className="okr-widget-stat">
            <span className="okr-widget-value" style={{ color: '#dc2626' }}>{summary.atRisk}</span>
            <span className="okr-widget-label">{t('okr_widget.at_risk')}</span>
          </div>
        )}
      </div>
      <div className="okr-widget-bar-wrap">
        <div className="okr-widget-bar-track">
          <div
            className="okr-widget-bar-fill"
            style={{ width: `${summary.avgProgress}%`, background: progressColor(summary.avgProgress) }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  totalCollaborators: number
  activePeriods: number
  totalKPIs: number
  totalAssignments: number
  completedAssignments: number
  pendingAssignments: number
  averageCompliance: number
}

interface TeamStats {
  teamMembers: number
  teamAverageCompliance: number
  teamCompletedKPIs: number
  teamPendingKPIs: number
}

interface AreaStats {
  area: string
  scopeType: string
  collaborators: number
  averageCompliance: number
  completedKPIs: number
}

interface KPICompliance {
  kpiName: string
  target: number
  actual: number
  compliance: number
}

interface NotificationSummary {
  totals: {
    missingActual: number
    atRisk: number
    periodsExpiring: number
  }
  samples: {
    missingActual: { collaboratorName: string; count: number }[]
    atRisk: { collaboratorName: string; kpiName: string; variation: number }[]
    periodsExpiring: { periodName: string; daysLeft: number }[]
  }
}

interface CollaboratorKPI {
  id: number
  collaboratorId: number
  kpiId: number
  periodId: number
  subPeriodId?: number
  subPeriodName?: string
  target: number
  actual?: number
  weight: number
  subPeriodWeight?: number | null
  variation?: number
  weightedResult?: number
  status: 'draft' | 'proposed' | 'approved' | 'closed'
  kpiName?: string
  kpiType?: string
  kpiDirection?: 'growth' | 'reduction' | 'exact'
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { t, i18n } = useTranslation('dashboard')
  const locale = i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'es-AR'
  const navigate = useNavigate()
  const { user, isLoading: authLoading, isHR, isLeadership, isCollaborator, canConfig } = useAuth()
  const [wizardDismissed, setWizardDismissed] = useState(
    () => localStorage.getItem('onboarding-dismissed') === 'true'
  )
  const [areaTypeFilter, setAreaTypeFilter] = useState<string>('area')
  const handleDismissWizard = () => {
    localStorage.setItem('onboarding-dismissed', 'true')
    setWizardDismissed(true)
  }
  const formatNumber = (value: number, digits = 2) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)
  const formatPercent = (value: number, digits = 1) => `${formatNumber(value, digits)}%`

  const { data: stats } = useQuery<DashboardStats>(
    'dashboard-stats',
    async () => (await api.get('/dashboard/stats')).data,
    { enabled: isHR, retry: false, staleTime: DASHBOARD_STALE }
  )

  const { data: areaStats } = useQuery<AreaStats[]>(
    'dashboard-area-stats',
    async () => (await api.get('/dashboard/area-stats')).data,
    { enabled: isHR, retry: false, staleTime: DASHBOARD_STALE }
  )

  const { data: teamStats } = useQuery<TeamStats>(
    ['dashboard-team-stats', user?.collaboratorId],
    async () => (await api.get(`/dashboard/team-stats/${user?.collaboratorId}`)).data,
    { enabled: isLeadership && !!user?.collaboratorId, retry: false, staleTime: DASHBOARD_STALE }
  )

  const { data: teamKPIs } = useQuery<KPICompliance[]>(
    ['dashboard-team-kpis', user?.collaboratorId],
    async () => (await api.get(`/dashboard/team-kpis/${user?.collaboratorId}`)).data,
    { enabled: isCollaborator && !!user?.collaboratorId, retry: false, staleTime: DASHBOARD_STALE }
  )

  const { data: collaboratorKPIs } = useQuery<CollaboratorKPI[]>(
    ['collaborator-kpis-dashboard', user?.collaboratorId],
    async () => (await api.get(`/collaborator-kpis/collaborator/${user?.collaboratorId}`)).data,
    { enabled: isCollaborator && !!user?.collaboratorId, retry: false, staleTime: DASHBOARD_STALE }
  )

  // Vista org-wide — solo HR
  const { data: complianceByPeriod } = useQuery(
    'dashboard-compliance-period',
    async () => (await api.get('/dashboard/compliance-by-period')).data,
    { enabled: isHR, retry: false, staleTime: DASHBOARD_STALE }
  )

  // Vista filtrada al equipo — solo Liderazgo
  const { data: teamComplianceByPeriod } = useQuery(
    ['dashboard-team-compliance-period', user?.collaboratorId],
    async () => (await api.get(`/dashboard/team-compliance-by-period/${user?.collaboratorId}`)).data,
    { enabled: isLeadership && !!user?.collaboratorId, retry: false, staleTime: DASHBOARD_STALE }
  )

  const { data: notificationSummary } = useQuery<NotificationSummary>(
    'notification-summary',
    async () => (await api.get('/notifications/summary')).data,
    { enabled: canConfig, retry: false, staleTime: DASHBOARD_STALE }
  )

  const { data: okrSummary } = useQuery<{ active: number; avgProgress: number; atRisk: number }>(
    'okr-dashboard-summary',
    async () => {
      const res = await api.get('/okr', { params: { status: 'active' } })
      const objectives: { progress: number }[] = Array.isArray(res.data) ? res.data : []
      const active = objectives.length
      const avgProgress = active > 0
        ? Math.round(objectives.reduce((s, o) => s + (Number(o.progress) || 0), 0) / active)
        : 0
      const atRisk = objectives.filter((o) => (Number(o.progress) || 0) < 40).length
      return { active, avgProgress, atRisk }
    },
    { enabled: !!user, retry: false, staleTime: DASHBOARD_STALE }
  )

  const summaryKPIs = useMemo(() => {
    if (!collaboratorKPIs || collaboratorKPIs.length === 0) return []
    const summary = collaboratorKPIs.filter(
      (k) => k.subPeriodId === null || k.subPeriodId === undefined
    )
    return summary.length > 0 ? summary : collaboratorKPIs
  }, [collaboratorKPIs])

  const impactKPIs = useMemo(() => {
    if (!collaboratorKPIs || collaboratorKPIs.length === 0) return []
    const hasSubPeriods = collaboratorKPIs.some((k) => k.subPeriodId !== null && k.subPeriodId !== undefined)
    if (hasSubPeriods) {
      return collaboratorKPIs.filter((k) => k.subPeriodId !== null && k.subPeriodId !== undefined)
    }
    return summaryKPIs
  }, [collaboratorKPIs, summaryKPIs])

  const collaboratorSummary = useMemo(() => {
    if (!summaryKPIs || summaryKPIs.length === 0) return null
    const totalWeight = summaryKPIs.reduce((sum, k) => sum + (k.weight || 0), 0) || 0
    const weightedAchieved =
      impactKPIs.reduce((sum, k) => {
        const direction = resolveDirection(
          (k as any).assignmentDirection,
          (k as any).kpiDirection,
          k.kpiType
        )
        const variation =
          k.variation ?? calculateVariationPercent(direction, k.target, k.actual ?? null)
        const impact = calculateWeightedImpact(variation, k.weight, k.subPeriodWeight)
        return sum + (impact || 0)
      }, 0) || 0

    const totalGap =
      summaryKPIs.reduce((sum, k) => {
        const target = Number(k.target) || 0
        const actual = Number(k.actual) || 0
        const direction = resolveDirection(
          (k as any).assignmentDirection,
          (k as any).kpiDirection,
          k.kpiType
        )
        const gap =
          direction === 'reduction'
            ? Math.max(actual - target, 0)
            : direction === 'exact'
            ? Math.abs(target - actual)
            : Math.max(target - actual, 0)
        return sum + gap
      }, 0) || 0

    const monthly = collaboratorKPIs
      ?.filter((k) => k.subPeriodId !== null && k.subPeriodId !== undefined)
      .reduce<Record<string, { name: string; weight: number; target: number; actual: number; weightedVariation: number; variationWeight: number }>>(
        (acc, k) => {
          const key = k.subPeriodName || String(k.subPeriodId || 'Subperiodo')
          const weight = Number(k.subPeriodWeight ?? k.weight) || 0
          const target = Number(k.target) || 0
          const actual = Number(k.actual) || 0
          const direction = resolveDirection((k as any).assignmentDirection, k.kpiDirection, k.kpiType)
          const variation = k.variation ?? calculateVariationPercent(direction, target, k.actual ?? null)
          if (!acc[key]) {
            acc[key] = { name: key, weight: 0, target: 0, actual: 0, weightedVariation: 0, variationWeight: 0 }
          }
          acc[key].weight += weight
          acc[key].target += target
          acc[key].actual += actual
          if (variation !== null && weight > 0) {
            acc[key].weightedVariation += variation * weight
            acc[key].variationWeight += weight
          }
          return acc
        },
        {}
      )

    return {
      totalWeight,
      overall: weightedAchieved,
      totalGap,
      monthly: monthly ? Object.values(monthly) : [],
    }
  }, [collaboratorKPIs, summaryKPIs, impactKPIs])

  const progressInsights = useMemo(() => {
    if (!summaryKPIs || summaryKPIs.length === 0) return null

    const computed = summaryKPIs.map((kpi) => {
      const targetValue = Number(kpi.target) || 0
      const actualValue =
        kpi.actual !== null && kpi.actual !== undefined ? Number(kpi.actual) : null
      const direction = resolveDirection(
        (kpi as any).assignmentDirection,
        (kpi as any).kpiDirection,
        kpi.kpiType
      )
      const variation =
        kpi.variation ?? calculateVariationPercent(direction, targetValue, actualValue)
      return {
        ...kpi,
        targetValue,
        actualValue,
        variation,
        isOnTrack: variation !== null && variation >= 100,
        isRisk: variation !== null && variation < 80,
      }
    })

    return {
      total: computed.length,
      withoutActual: computed.filter((k) => k.actualValue === null).length,
      onTrack: computed.filter((k) => k.isOnTrack).length,
      atRisk: computed.filter((k) => k.isRisk).length,
      topRisk: computed
        .filter((k) => k.isRisk && k.variation !== null)
        .sort((a, b) => (a.variation ?? 0) - (b.variation ?? 0))
        .slice(0, 3),
    }
  }, [summaryKPIs])

  if (authLoading) {
    return (
      <div className="dashboard">
        <div className="loading">{t('loading')}</div>
      </div>
    )
  }

  // ─── Vista HR ────────────────────────────────────────────────────────────────

  if (isHR) {
    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <div>
            <h1>{t('hr.title')}</h1>
            <p className="subtitle">{t('hr.subtitle')}</p>
          </div>
          <div className="user-info">
            <span className="user-name">
              <span className="user-icon"><UserIcon /></span>
              {user?.name}
            </span>
            <span className="user-role">{t('hr.role')}</span>
          </div>
        </div>

        {!wizardDismissed && stats && (
          <OnboardingWizard stats={stats} onDismiss={handleDismissWizard} />
        )}

        {(stats || notificationSummary) && (
          <div className="pending-actions-panel">
            <h3>{t('notifications.pending_actions')}</h3>
            <div className="pending-actions-list">
              {(stats?.pendingAssignments ?? 0) > 0 ? (
                <div className="pending-action-item warning">
                  <span>{t('notifications.pending_assignments_many', { count: stats!.pendingAssignments })}</span>
                  <button className="pending-action-link" onClick={() => navigate('/asignaciones')}>{t('notifications.see_assignments')}</button>
                </div>
              ) : stats ? (
                <div className="pending-action-item success">
                  <span>{t('notifications.all_assignments_complete')}</span>
                </div>
              ) : null}
              {(notificationSummary?.totals.missingActual ?? 0) > 0 && (
                <div className="pending-action-item warning">
                  <span>{t('notifications.missing_actual', { count: notificationSummary!.totals.missingActual })}</span>
                  <button className="pending-action-link" onClick={() => navigate('/input-datos')}>{t('notifications.go_to_input')}</button>
                </div>
              )}
              {(notificationSummary?.totals.atRisk ?? 0) > 0 && (
                <div className="pending-action-item error">
                  <span>{t('notifications.at_risk', { count: notificationSummary!.totals.atRisk })}</span>
                  <button className="pending-action-link" onClick={() => navigate('/asignaciones')}>{t('notifications.see_kpis')}</button>
                </div>
              )}
              {(notificationSummary?.totals.periodsExpiring ?? 0) > 0 && (
                <div className="pending-action-item info">
                  <span>{t('notifications.periods_expiring', { count: notificationSummary!.totals.periodsExpiring })}</span>
                  <button className="pending-action-link" onClick={() => navigate('/periodos')}>{t('notifications.see_periods')}</button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="dashboard-grid">
          <div className="stat-card">
            <div className="stat-icon"><StatIcon name="users" /></div>
            <div className="stat-content">
              <h3>{t('hr.stats.collaborators')}</h3>
              <p className="stat-value">{stats?.totalCollaborators || 0}</p>
              <p className="stat-label">{t('hr.stats.collaborators_label')}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><StatIcon name="calendar" /></div>
            <div className="stat-content">
              <h3>{t('hr.stats.periods')}</h3>
              <p className="stat-value">{stats?.activePeriods || 0}</p>
              <p className="stat-label">{t('hr.stats.periods_label')}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><StatIcon name="target" /></div>
            <div className="stat-content">
              <h3>{t('hr.stats.kpis')}</h3>
              <p className="stat-value">{stats?.totalKPIs || 0}</p>
              <p className="stat-label">{t('hr.stats.kpis_label')}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><StatIcon name="chart" /></div>
            <div className="stat-content">
              <h3>{t('hr.stats.compliance')}</h3>
              <p className="stat-value" style={{ color: stats ? progressColor(stats.averageCompliance) : undefined }}>
                {stats ? formatPercent(stats.averageCompliance, 1) : '0.0%'}
              </p>
              <p className="stat-label">{t('hr.stats.compliance_label')}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><StatIcon name="clipboard" /></div>
            <div className="stat-content">
              <h3>{t('hr.stats.assignments')}</h3>
              <p className="stat-value">
                {stats?.completedAssignments || 0}
                <span className="stat-value-sub"> / {stats?.totalAssignments || 0}</span>
              </p>
              <p className="stat-label">{t('hr.stats.assignments_label')}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><StatIcon name="clock" /></div>
            <div className="stat-content">
              <h3>{t('hr.stats.pending')}</h3>
              <p className="stat-value" style={{ color: (stats?.pendingAssignments ?? 0) > 0 ? '#d97706' : '#16a34a' }}>
                {stats?.pendingAssignments || 0}
              </p>
              <p className="stat-label">{t('hr.stats.pending_label')}</p>
            </div>
          </div>
        </div>

        {okrSummary && okrSummary.active > 0 && (
          <div className="dashboard-section">
            <OkrWidget summary={okrSummary} title={t('okr_widget.hr_title')} onNavigate={() => navigate('/okr')} />
          </div>
        )}

        {areaStats && areaStats.length > 0 && (() => {
          const CHART_LIMIT = 15
          const availableTypes = Array.from(new Set(areaStats.map((s) => s.scopeType))).sort()
          const effectiveFilter = availableTypes.includes(areaTypeFilter) ? areaTypeFilter : availableTypes[0]
          const filtered = areaStats.filter((s) => s.scopeType === effectiveFilter)
          const typeLabel: Record<string, string> = {
            company: t('scope_types.company', { defaultValue: 'Empresa' }),
            area: t('scope_types.area', { defaultValue: 'Áreas' }),
            team: t('scope_types.team', { defaultValue: 'Equipos' }),
            business_unit: t('scope_types.business_unit', { defaultValue: 'Unidades de negocio' }),
          }
          const complianceBarColor = (value: number) =>
            value >= 90 ? '#16a34a' : value >= 70 ? '#d97706' : '#dc2626'

          const isManyItems = filtered.length > CHART_LIMIT
          // Bar chart: worst-first (most actionable), capped at CHART_LIMIT
          const chartData = isManyItems
            ? [...filtered].sort((a, b) => a.averageCompliance - b.averageCompliance).slice(0, CHART_LIMIT)
            : filtered
          // Right panel: table when many items, pie when few
          const showRankedTable = filtered.length > 10
          const rankedRows = [...filtered].sort((a, b) => a.averageCompliance - b.averageCompliance)

          return (
            <div className="charts-section">
              <div className="charts-section-header">
                <h2>{t('hr.charts.section_title', { defaultValue: 'Rendimiento por unidad' })}</h2>
                <div className="chart-type-tabs">
                  {availableTypes.map((type) => (
                    <button
                      key={type}
                      className={`chart-type-tab${effectiveFilter === type ? ' chart-type-tab--active' : ''}`}
                      onClick={() => setAreaTypeFilter(type)}
                    >
                      {typeLabel[type] || type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="charts-grid">
                <div className="chart-card">
                  <h3>
                    {t('hr.charts.compliance_by_area')}
                    {isManyItems && (
                      <span className="chart-subtitle">
                        {` — peor cumplimiento (${CHART_LIMIT} de ${filtered.length})`}
                      </span>
                    )}
                  </h3>
                  {filtered.length === 0 ? (
                    <p className="chart-empty">{t('hr.charts.no_data', { defaultValue: 'Sin datos para este tipo de unidad.' })}</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={chartData} margin={{ bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="area"
                          angle={-40}
                          textAnchor="end"
                          interval={0}
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v: string) => v.length > 16 ? `${v.slice(0, 14)}…` : v}
                        />
                        <YAxis
                          domain={[0, (dataMax: number) => Math.ceil(Math.max(dataMax, 100) / 10) * 10]}
                          tickFormatter={(v: number) => `${v}%`}
                          width={45}
                        />
                        <Tooltip
                          formatter={(value: number) => [`${Number(value).toFixed(1)}%`, t('charts.compliance_pct')]}
                          labelFormatter={(label: string) => label}
                        />
                        <Bar dataKey="averageCompliance" name={t('charts.compliance_pct')} radius={[4, 4, 0, 0]}>
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={complianceBarColor(entry.averageCompliance)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="chart-card">
                  <h3>{t('hr.charts.collaborators_by_area')}</h3>
                  {filtered.length === 0 ? (
                    <p className="chart-empty">{t('hr.charts.no_data', { defaultValue: 'Sin datos para este tipo de unidad.' })}</p>
                  ) : showRankedTable ? (
                    <div className="ranked-table-wrap">
                      <table className="ranked-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Unidad</th>
                            <th>Colab.</th>
                            <th>Cumplimiento</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rankedRows.map((row, i) => (
                            <tr key={row.area}>
                              <td className="ranked-rank">{i + 1}</td>
                              <td className="ranked-name" title={row.area}>
                                {row.area.length > 22 ? `${row.area.slice(0, 20)}…` : row.area}
                              </td>
                              <td className="ranked-collab">{row.collaborators}</td>
                              <td className="ranked-compliance">
                                <div className="ranked-bar-track">
                                  <div
                                    className="ranked-bar-fill"
                                    style={{
                                      width: `${Math.min(row.averageCompliance, 100)}%`,
                                      background: complianceBarColor(row.averageCompliance),
                                    }}
                                  />
                                </div>
                                <span
                                  className="ranked-pct"
                                  style={{ color: complianceBarColor(row.averageCompliance) }}
                                >
                                  {row.averageCompliance.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={320}>
                      <PieChart>
                        <Pie
                          data={filtered}
                          dataKey="collaborators"
                          nameKey="area"
                          cx="50%"
                          cy="45%"
                          outerRadius={100}
                          label={({ name, percent }: { name: string; percent: number }) =>
                            `${name.length > 14 ? `${name.slice(0, 12)}…` : name} (${(percent * 100).toFixed(0)}%)`
                          }
                          labelLine={false}
                        >
                          {filtered.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={AREA_COLORS[index % AREA_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => [v, t('hr.charts.collaborators_label', { defaultValue: 'colaboradores' })]} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {complianceByPeriod && complianceByPeriod.length > 0 && (
                  <div className="chart-card chart-card--wide">
                    <h3>{t('hr.charts.compliance_evolution')}</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={complianceByPeriod} margin={{ left: 10, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                        <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} width={45} />
                        <Tooltip formatter={(value: number) => [`${Number(value).toFixed(1)}%`, t('charts.compliance_pct')]} />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="compliance"
                          stroke="#0ea5e9"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          name={t('charts.compliance_pct')}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        <div className="dashboard-section">
          <h2>{t('hr.quick_actions.title')}</h2>
          <div className="quick-actions">
            <button className="action-btn" onClick={() => navigate('/periodos')}>{t('hr.quick_actions.create_period')}</button>
            <button className="action-btn" onClick={() => navigate('/colaboradores')}>{t('hr.quick_actions.add_collaborator')}</button>
            <button className="action-btn" onClick={() => navigate('/kpis')}>{t('hr.quick_actions.define_kpi')}</button>
            <button className="action-btn" onClick={() => navigate('/asignaciones')}>{t('hr.quick_actions.new_assignment')}</button>
            <button className="action-btn" onClick={() => navigate('/vistas-agregadas')}>{t('hr.quick_actions.aggregate_views')}</button>
            <button className="action-btn" onClick={() => navigate('/auditoria')}>{t('hr.quick_actions.audit')}</button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Vista Liderazgo ──────────────────────────────────────────────────────────

  if (isLeadership) {
    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <div>
            <h1>{t('leadership.title')}</h1>
            <p className="subtitle">{t('leadership.subtitle')}</p>
          </div>
          <div className="user-info">
            <span className="user-name">
              <span className="user-icon"><UserIcon /></span>
              {user?.name}
            </span>
            <span className="user-role">{t('leadership.role')}</span>
          </div>
        </div>

        {(teamStats || notificationSummary) && (
          <div className="pending-actions-panel">
            <h3>{t('notifications.pending_actions')}</h3>
            <div className="pending-actions-list">
              {(teamStats?.teamPendingKPIs ?? 0) > 0 ? (
                <div className="pending-action-item warning">
                  <span>{t('notifications.team_pending_many', { count: teamStats!.teamPendingKPIs })}</span>
                  <button className="pending-action-link" onClick={() => navigate('/input-datos')}>{t('notifications.load_data')}</button>
                </div>
              ) : teamStats ? (
                <div className="pending-action-item success">
                  <span>{t('notifications.team_all_complete')}</span>
                </div>
              ) : null}
              {(notificationSummary?.totals.missingActual ?? 0) > 0 && (
                <div className="pending-action-item warning">
                  <span>{t('notifications.missing_actual', { count: notificationSummary!.totals.missingActual })}</span>
                  <button className="pending-action-link" onClick={() => navigate('/input-datos')}>{t('notifications.go_to_input')}</button>
                </div>
              )}
              {(notificationSummary?.totals.atRisk ?? 0) > 0 && (
                <div className="pending-action-item error">
                  <span>{t('notifications.at_risk', { count: notificationSummary!.totals.atRisk })}</span>
                  <button className="pending-action-link" onClick={() => navigate('/asignaciones')}>{t('notifications.see_kpis')}</button>
                </div>
              )}
              {(notificationSummary?.totals.periodsExpiring ?? 0) > 0 && (
                <div className="pending-action-item info">
                  <span>{t('notifications.periods_expiring', { count: notificationSummary!.totals.periodsExpiring })}</span>
                  <button className="pending-action-link" onClick={() => navigate('/periodos')}>{t('notifications.see_periods')}</button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="dashboard-grid">
          <div className="stat-card">
            <div className="stat-icon"><StatIcon name="users" /></div>
            <div className="stat-content">
              <h3>{t('leadership.stats.team_members')}</h3>
              <p className="stat-value">{teamStats?.teamMembers || 0}</p>
              <p className="stat-label">{t('leadership.stats.team_members_label')}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><StatIcon name="chart" /></div>
            <div className="stat-content">
              <h3>{t('leadership.stats.team_compliance')}</h3>
              <p className="stat-value">{teamStats?.teamAverageCompliance?.toFixed(1) || 0}%</p>
              <p className="stat-label">{t('leadership.stats.team_compliance_label')}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><StatIcon name="clipboard" /></div>
            <div className="stat-content">
              <h3>{t('leadership.stats.completed_kpis')}</h3>
              <p className="stat-value">{teamStats?.teamCompletedKPIs || 0}</p>
              <p className="stat-label">{t('leadership.stats.completed_label')}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon"><StatIcon name="clock" /></div>
            <div className="stat-content">
              <h3>{t('leadership.stats.pending_kpis')}</h3>
              <p className="stat-value">{teamStats?.teamPendingKPIs || 0}</p>
              <p className="stat-label">{t('leadership.stats.pending_label')}</p>
            </div>
          </div>
        </div>

        {okrSummary && okrSummary.active > 0 && (
          <div className="dashboard-section">
            <OkrWidget summary={okrSummary} title={t('okr_widget.leadership_title')} onNavigate={() => navigate('/okr')} />
          </div>
        )}

        {teamComplianceByPeriod && teamComplianceByPeriod.length > 0 && (
          <div className="charts-section">
            <div className="charts-grid">
              <div className="chart-card chart-card--wide">
                <h3>{t('leadership.charts.team_compliance_evolution')}</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={teamComplianceByPeriod} margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} width={45} />
                    <Tooltip formatter={(value: number) => [`${Number(value).toFixed(1)}%`, t('charts.compliance_pct')]} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="compliance"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      name={t('charts.compliance_pct')}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        <div className="dashboard-section">
          <h2>{t('leadership.quick_actions.title')}</h2>
          <div className="quick-actions">
            <button className="action-btn" onClick={() => navigate('/asignaciones')}>{t('leadership.quick_actions.manage_assignments')}</button>
            <button className="action-btn" onClick={() => navigate('/mi-parrilla')}>{t('leadership.quick_actions.my_grid')}</button>
            <button className="action-btn" onClick={() => navigate('/vistas-agregadas')}>{t('leadership.quick_actions.stats')}</button>
            <button className="action-btn" onClick={() => navigate('/colaboradores')}>{t('leadership.quick_actions.view_collaborators')}</button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Vista Colaborador ────────────────────────────────────────────────────────

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>{t('collab.title')}</h1>
          <p className="subtitle">{t('collab.subtitle')}</p>
        </div>
        <div className="user-info">
          <span className="user-name">
            <span className="user-icon"><UserIcon /></span>
            {user?.name}
          </span>
          <span className="user-role">{t('collab.role')}</span>
        </div>
      </div>

      {progressInsights && (
        <div className="pending-actions-panel">
          <h3>{t('notifications.pending_actions')}</h3>
          <div className="pending-actions-list">
            {progressInsights.withoutActual > 0 ? (
              <div className="pending-action-item warning">
                <span>{progressInsights.withoutActual > 1
                  ? t('notifications.collab_without_actual_many', { count: progressInsights.withoutActual })
                  : t('notifications.collab_without_actual_one', { count: progressInsights.withoutActual })}</span>
                <button className="pending-action-link" onClick={() => navigate('/input-datos')}>{t('notifications.load_data')}</button>
              </div>
            ) : (
              <div className="pending-action-item success">
                <span>{t('notifications.collab_all_data_loaded')}</span>
              </div>
            )}
            {progressInsights.atRisk > 0 && (
              <div className="pending-action-item error">
                <span>{progressInsights.atRisk > 1
                  ? t('notifications.collab_at_risk_many', { count: progressInsights.atRisk })
                  : t('notifications.collab_at_risk_one', { count: progressInsights.atRisk })}</span>
                <button className="pending-action-link" onClick={() => navigate('/mi-parrilla')}>{t('notifications.see_grid')}</button>
              </div>
            )}
            {progressInsights.onTrack === progressInsights.total && progressInsights.total > 0 && (
              <div className="pending-action-item success">
                <span>{t('notifications.collab_all_on_track')}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="dashboard-section">
        <h2>{t('collab.section_summary')}</h2>
        <div className="collab-summary-grid">
          <div className="collab-card">
            <p className="stat-label">{t('collab.summary.assigned_kpis')}</p>
            <p className="stat-value">{summaryKPIs.length}</p>
          </div>
          <div className="collab-card">
            <p className="stat-label">{t('collab.summary.weighted_progress')}</p>
            <p className="stat-value">
              {collaboratorSummary ? formatPercent(collaboratorSummary.overall, 1) : '0.0%'}
            </p>
          </div>
          <div className="collab-card">
            <p className="stat-label">{t('collab.summary.annual_gap')}</p>
            <p className="stat-value">
              {collaboratorSummary ? formatNumber(collaboratorSummary.totalGap, 2) : '0'}
            </p>
          </div>
          <div className="collab-card">
            <p className="stat-label">{t('collab.summary.total_weight')}</p>
            <p className="stat-value">
              {collaboratorSummary ? formatPercent(collaboratorSummary.totalWeight, 1) : '0.0%'}
            </p>
          </div>
        </div>
      </div>

      <div className="dashboard-section">
        <h2>{t('collab.section_kpis')}</h2>
        {summaryKPIs.length > 0 ? (
          <div className="table-wrapper">
            <table className="collab-kpi-table">
              <thead>
                <tr>
                  <th>{t('collab.table.kpi')}</th>
                  <th>{t('collab.table.target')}</th>
                  <th>{t('collab.table.actual')}</th>
                  <th>{t('collab.table.progress')}</th>
                  <th>{t('collab.table.gap')}</th>
                  <th>{t('collab.table.weight')}</th>
                </tr>
              </thead>
              <tbody>
                {summaryKPIs.map((kpi) => {
                  const weightValue = Number(kpi.weight) || 0
                  const targetValue = Number(kpi.target) || 0
                  const actualValue =
                    kpi.actual !== null && kpi.actual !== undefined ? Number(kpi.actual) : null
                  const direction = resolveDirection(
                    (kpi as any).assignmentDirection,
                    kpi.kpiDirection,
                    kpi.kpiType
                  )
                  const variation =
                    kpi.variation ?? calculateVariationPercent(direction, targetValue, actualValue)
                  const gap =
                    actualValue === null
                      ? targetValue
                      : direction === 'reduction'
                      ? Math.max(actualValue - targetValue, 0)
                      : direction === 'exact'
                      ? Math.abs(targetValue - actualValue)
                      : Math.max(targetValue - actualValue, 0)
                  return (
                    <tr key={kpi.id}>
                      <td>{kpi.kpiName || `KPI ${kpi.kpiId}`}</td>
                      <td>{formatNumber(targetValue, 2)}</td>
                      <td>{actualValue === null ? t('collab.table.no_actual') : formatNumber(actualValue, 2)}</td>
                      <td>
                        <span
                          className={`compliance-badge ${
                            (variation || 0) >= 100
                              ? 'excellent'
                              : (variation || 0) >= 80
                              ? 'good'
                              : (variation || 0) >= 60
                              ? 'warning'
                              : 'poor'
                          }`}
                        >
                          {variation === null ? '-' : formatPercent(variation, 1)}
                        </span>
                      </td>
                      <td>{formatNumber(gap, 2)}</td>
                      <td>{formatPercent(weightValue, 2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <p>{t('collab.empty')}</p>
          </div>
        )}
      </div>

      {progressInsights && (
        <div className="dashboard-section">
          <h2>{t('collab.section_progress')}</h2>
          <div className="progress-grid">
            <div className="progress-card">
              <p className="progress-label">{t('collab.progress.on_track')}</p>
              <p className="progress-value">{progressInsights.onTrack}/{progressInsights.total}</p>
              <p className="progress-caption">{t('collab.progress.on_track_caption')}</p>
            </div>
            <div className="progress-card">
              <p className="progress-label">{t('collab.progress.without_actual')}</p>
              <p className="progress-value">{progressInsights.withoutActual}</p>
              <p className="progress-caption">{t('collab.progress.without_actual_caption')}</p>
            </div>
            <div className="progress-card">
              <p className="progress-label">{t('collab.progress.at_risk')}</p>
              <p className="progress-value">{progressInsights.atRisk}</p>
              <p className="progress-caption">{t('collab.progress.at_risk_caption')}</p>
            </div>
          </div>

          <div className="progress-detail">
            <div className="detail-card">
              <h3>{t('collab.progress_detail.critical_targets')}</h3>
              {progressInsights.topRisk.length > 0 ? (
                <ul className="risk-list">
                  {progressInsights.topRisk.map((kpi) => (
                    <li key={kpi.id}>
                      <span className="risk-name">{kpi.kpiName || `KPI ${kpi.kpiId}`}</span>
                      <span className="risk-value">
                        {kpi.variation === null ? '-' : formatPercent(kpi.variation, 1)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-note">{t('collab.progress_detail.no_at_risk')}</p>
              )}
            </div>
            <div className="detail-card highlight">
              <h3>{t('collab.progress_detail.next_step_title')}</h3>
              <p>
                {progressInsights.withoutActual > 0
                  ? t('collab.progress_detail.next_step_pending')
                  : progressInsights.atRisk > 0
                  ? t('collab.progress_detail.next_step_risk')
                  : t('collab.progress_detail.next_step_ok')}
              </p>
              <button className="btn-primary ghost" onClick={() => navigate('/mi-parrilla')}>
                {t('collab.progress_detail.see_grid')}
              </button>
            </div>
          </div>
        </div>
      )}

      {collaboratorSummary && collaboratorSummary.monthly.length > 0 && (
        <div className="dashboard-section">
          <h2>{t('collab.section_monthly')}</h2>
          <div className="mini-grid">
            {collaboratorSummary.monthly.map((m) => {
              const monthlyProgress = m.variationWeight > 0 ? m.weightedVariation / m.variationWeight : null
              return (
                <div key={m.name} className="mini-card">
                  <div className="mini-card-header">
                    <span className="mini-title">{m.name}</span>
                    <span className="mini-weight">{formatPercent(m.weight, 2)} peso</span>
                  </div>
                  <div className="mini-body">
                    <div><span className="detail-label">{t('collab.monthly.target')}</span> {formatNumber(m.target, 2)}</div>
                    <div><span className="detail-label">{t('collab.monthly.actual')}</span> {formatNumber(m.actual, 2)}</div>
                    <div>
                      <span className="detail-label">{t('collab.monthly.progress')}</span>{' '}
                      {monthlyProgress === null ? '-' : formatPercent(monthlyProgress, 1)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {teamKPIs && teamKPIs.length > 0 && (
        <div className="dashboard-section">
          <h2>{t('collab.section_team_kpis')}</h2>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={teamKPIs} margin={{ bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="kpiName"
                  angle={-40}
                  textAnchor="end"
                  interval={0}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v: string) => v.length > 18 ? `${v.slice(0, 16)}…` : v}
                />
                <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} width={45} />
                <Tooltip
                  formatter={(value: number, name: string) => [`${Number(value).toFixed(1)}%`, name]}
                  labelFormatter={(label: string) => label}
                />
                <Bar dataKey="compliance" name={t('charts.compliance_pct')} radius={[4, 4, 0, 0]}>
                  {teamKPIs.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.compliance >= 90 ? '#16a34a' : entry.compliance >= 70 ? '#d97706' : '#dc2626'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {okrSummary && okrSummary.active > 0 && (
        <div className="dashboard-section">
          <OkrWidget summary={okrSummary} title={t('okr_widget.collab_title')} onNavigate={() => navigate('/okr')} />
        </div>
      )}

      <div className="dashboard-section">
        <h2>{t('collab.quick_actions.title')}</h2>
        <div className="quick-actions">
          <button className="action-btn" onClick={() => navigate('/mi-parrilla')}>{t('collab.quick_actions.my_grid')}</button>
          <button className="action-btn" onClick={() => navigate('/historial')}>{t('collab.quick_actions.my_history')}</button>
          <button className="action-btn" onClick={() => navigate('/okr')}>{t('collab.quick_actions.my_okrs')}</button>
        </div>
      </div>
    </div>
  )
}
