import { useQuery } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import api from '../services/api'
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

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, isLoading: authLoading, isHR, isLeadership, isCollaborator, canConfig } = useAuth()
  const formatNumber = (value: number, digits = 2) =>
    new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits }).format(value)
  const formatPercent = (value: number, digits = 1) => `${formatNumber(value, digits)}%`
  const renderStatIcon = (name: 'users' | 'calendar' | 'target' | 'chart' | 'clipboard' | 'clock') => {
    switch (name) {
      case 'users':
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4ZM6 13a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm10 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Zm-10 .5C3.34 15.5 0 16.84 0 19.5V22h6v-2.5c0-1.14.47-2.06 1.2-2.78A8.3 8.3 0 0 0 6 15.5Z"
              fill="currentColor"
            />
          </svg>
        )
      case 'calendar':
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1.5A2.5 2.5 0 0 1 22 6.5v13A2.5 2.5 0 0 1 19.5 22h-15A2.5 2.5 0 0 1 2 19.5v-13A2.5 2.5 0 0 1 4.5 4H6V3a1 1 0 0 1 1-1Zm-2.5 6V19.5c0 .55.45 1 1 1h15a1 1 0 0 0 1-1V8Z"
              fill="currentColor"
            />
          </svg>
        )
      case 'target':
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm0 4a6 6 0 1 1-6 6 6 6 0 0 1 6-6Zm0 3a3 3 0 1 0 3 3 3 3 0 0 0-3-3Z"
              fill="currentColor"
            />
          </svg>
        )
      case 'chart':
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 20a1 1 0 0 1-1-1V5a1 1 0 1 1 2 0v13h14a1 1 0 1 1 0 2Zm4-4a1 1 0 0 1-1-1V9a1 1 0 1 1 2 0v6a1 1 0 0 1-1 1Zm5 0a1 1 0 0 1-1-1V7a1 1 0 1 1 2 0v8a1 1 0 0 1-1 1Zm5 0a1 1 0 0 1-1-1v-4a1 1 0 1 1 2 0v4a1 1 0 0 1-1 1Z"
              fill="currentColor"
            />
          </svg>
        )
      case 'clipboard':
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M9 2h6a2 2 0 0 1 2 2h1.5A1.5 1.5 0 0 1 20 5.5v14A2.5 2.5 0 0 1 17.5 22h-11A2.5 2.5 0 0 1 4 19.5v-14A1.5 1.5 0 0 1 5.5 4H7a2 2 0 0 1 2-2Zm0 2v1h6V4Zm-2 4a1 1 0 0 0-1 1v9.5c0 .55.45 1 1 1h10a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1Z"
              fill="currentColor"
            />
          </svg>
        )
      case 'clock':
      default:
        return (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm1 5a1 1 0 0 0-2 0v5a1 1 0 0 0 .4.8l3 2.25a1 1 0 1 0 1.2-1.6L13 11.5Z"
              fill="currentColor"
            />
          </svg>
        )
    }
  }
  const renderUserIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-8 2-8 4.5V22h16v-3.5C20 16 16 14 12 14Z"
        fill="currentColor"
      />
    </svg>
  )

  const { data: stats } = useQuery<DashboardStats>(
    'dashboard-stats',
    async () => {
      const response = await api.get('/dashboard/stats')
      return response.data
    },
    {
      enabled: isHR,
      retry: false,
    }
  )

  const { data: areaStats } = useQuery<AreaStats[]>(
    'dashboard-area-stats',
    async () => {
      const response = await api.get('/dashboard/area-stats')
      return response.data
    },
    {
      enabled: isHR,
      retry: false,
    }
  )

  const { data: teamStats } = useQuery<TeamStats>(
    ['dashboard-team-stats', user?.collaboratorId],
    async () => {
      const response = await api.get(`/dashboard/team-stats/${user?.collaboratorId}`)
      return response.data
    },
    {
      enabled: isLeadership && !!user?.collaboratorId,
      retry: false,
    }
  )

  const { data: teamKPIs } = useQuery<KPICompliance[]>(
    ['dashboard-team-kpis', user?.collaboratorId],
    async () => {
      const response = await api.get(`/dashboard/team-kpis/${user?.collaboratorId}`)
      return response.data
    },
    {
      enabled: isCollaborator && !!user?.collaboratorId,
      retry: false,
    }
  )

  const { data: collaboratorKPIs } = useQuery<CollaboratorKPI[]>(
    ['collaborator-kpis-dashboard', user?.collaboratorId],
    async () => {
      const response = await api.get(`/collaborator-kpis/collaborator/${user?.collaboratorId}`)
      return response.data
    },
    {
      enabled: isCollaborator && !!user?.collaboratorId,
      retry: false,
    }
  )

  const { data: complianceByPeriod } = useQuery(
    'dashboard-compliance-period',
    async () => {
      const response = await api.get('/dashboard/compliance-by-period')
      return response.data
    },
    {
      enabled: isHR || isLeadership,
      retry: false,
    }
  )

  const { data: notificationSummary } = useQuery<NotificationSummary>(
    'notification-summary',
    async () => {
      const response = await api.get('/notifications/summary')
      return response.data
    },
    {
      enabled: canConfig,
      retry: false,
    }
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
    const overall = weightedAchieved
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
      .reduce<Record<string, { name: string; weight: number; target: number; actual: number }>>(
        (acc, k) => {
          const key = k.subPeriodName || String(k.subPeriodId || 'Subperiodo')
          const weight = Number(k.subPeriodWeight ?? k.weight) || 0
          const target = Number(k.target) || 0
          const actual = Number(k.actual) || 0
          if (!acc[key]) {
            acc[key] = { name: key, weight: 0, target: 0, actual: 0 }
          }
          acc[key].weight += weight
          acc[key].target += target
          acc[key].actual += actual
          return acc
        },
        {}
      )

    return {
      totalWeight,
      overall,
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
      const isOnTrack = variation !== null && variation >= 100
      const isRisk = variation !== null && variation < 80
      return {
        ...kpi,
        targetValue,
        actualValue,
        variation,
        isOnTrack,
        isRisk,
      }
    })

    const total = computed.length
    const withoutActual = computed.filter((k) => k.actualValue === null).length
    const onTrack = computed.filter((k) => k.isOnTrack).length
    const atRisk = computed.filter((k) => k.isRisk).length

    const topRisk = computed
      .filter((k) => k.isRisk && k.variation !== null)
      .sort((a, b) => (a.variation ?? 0) - (b.variation ?? 0))
      .slice(0, 3)

    return {
      total,
      withoutActual,
      onTrack,
      atRisk,
      topRisk,
    }
  }, [summaryKPIs])

  if (authLoading) {
    return (
      <div className="dashboard">
        <div className="loading">Cargando dashboard...</div>
      </div>
    )
  }

  if (isHR) {
    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <div>
            <h1>Dashboard - Recursos Humanos</h1>
            <p className="subtitle">Vista global del sistema de gestion de KPIs</p>
          </div>
          <div className="user-info">
            <span className="user-name">
              <span className="user-icon">{renderUserIcon()}</span>
              {user?.name}
            </span>
            <span className="user-role">Recursos Humanos</span>
          </div>
        </div>

        {canConfig && notificationSummary && (
          <div className="notify-banner">
            <div className="notify-main">
              <h3>Alertas clave del sistema</h3>
              <p>
                KPIs sin carga: {notificationSummary.totals.missingActual} | KPIs en riesgo:{' '}
                {notificationSummary.totals.atRisk} | Periodos por vencer:{' '}
                {notificationSummary.totals.periodsExpiring}
              </p>
            </div>
            <button className="btn-primary ghost" onClick={() => navigate('/asignaciones')}>
              Ver asignaciones
            </button>
          </div>
        )}

        <div className="dashboard-grid">
          <div className="stat-card">
            <div className="stat-icon">{renderStatIcon('users')}</div>
            <div className="stat-content">
              <h3>Colaboradores</h3>
              <p className="stat-value">{stats?.totalCollaborators || 0}</p>
              <p className="stat-label">Total registrados</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">{renderStatIcon('calendar')}</div>
            <div className="stat-content">
              <h3>Periodos Activos</h3>
              <p className="stat-value">{stats?.activePeriods || 0}</p>
              <p className="stat-label">En evaluacion</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">{renderStatIcon('target')}</div>
            <div className="stat-content">
              <h3>KPIs</h3>
              <p className="stat-value">{stats?.totalKPIs || 0}</p>
              <p className="stat-label">Definidos</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">{renderStatIcon('chart')}</div>
            <div className="stat-content">
              <h3>Cumplimiento</h3>
              <p className="stat-value">{stats?.averageCompliance?.toFixed(1) || 0}%</p>
              <p className="stat-label">Promedio general</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">{renderStatIcon('clipboard')}</div>
            <div className="stat-content">
              <h3>Asignaciones</h3>
              <p className="stat-value">{stats?.totalAssignments || 0}</p>
              <p className="stat-label">Total</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">{renderStatIcon('clock')}</div>
            <div className="stat-content">
              <h3>Pendientes</h3>
              <p className="stat-value">{stats?.pendingAssignments || 0}</p>
              <p className="stat-label">Por completar</p>
            </div>
          </div>
        </div>

        <div className="charts-grid">
          {areaStats && areaStats.length > 0 && (
            <div className="chart-card">
              <h3>Cumplimiento por Area</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={areaStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="area" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="averageCompliance" fill="#f97316" name="Cumplimiento %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {complianceByPeriod && complianceByPeriod.length > 0 && (
            <div className="chart-card">
              <h3>Evolucion de Cumplimiento</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={complianceByPeriod}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="compliance"
                    stroke="#f97316"
                    name="Cumplimiento %"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {areaStats && areaStats.length > 0 && (
            <div className="chart-card">
              <h3>Distribucion de Colaboradores por Area</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={areaStats}
                    dataKey="collaborators"
                    nameKey="area"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    fill="#f97316"
                    label
                  >
                    {areaStats.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={['#f97316', '#ea580c', '#fb923c', '#111827', '#6b7280'][index % 5]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="dashboard-section">
          <h2>Accesos Rapidos</h2>
          <div className="quick-actions">
            <button className="action-btn" onClick={() => navigate('/periodos')}>
              Crear Periodo
            </button>
            <button className="action-btn" onClick={() => navigate('/colaboradores')}>
              Agregar Colaborador
            </button>
            <button className="action-btn" onClick={() => navigate('/kpis')}>
              Definir KPI
            </button>
            <button className="action-btn" onClick={() => navigate('/asignaciones')}>
              Nueva Asignacion
            </button>
            <button className="action-btn" onClick={() => navigate('/vistas-agregadas')}>
              Vistas Agregadas
            </button>
            <button className="action-btn" onClick={() => navigate('/auditoria')}>
              Auditoria
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (isLeadership) {
    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <div>
            <h1>Dashboard - Liderazgo</h1>
            <p className="subtitle">Gestion de tu equipo y estadisticas</p>
          </div>
          <div className="user-info">
            <span className="user-name">
              <span className="user-icon">{renderUserIcon()}</span>
              {user?.name}
            </span>
            <span className="user-role">Lider</span>
          </div>
        </div>

        {canConfig && notificationSummary && (
          <div className="notify-banner">
            <div className="notify-main">
              <h3>Alertas clave del sistema</h3>
              <p>
                KPIs sin carga: {notificationSummary.totals.missingActual} | KPIs en riesgo:{' '}
                {notificationSummary.totals.atRisk} | Periodos por vencer:{' '}
                {notificationSummary.totals.periodsExpiring}
              </p>
            </div>
            <button className="btn-primary ghost" onClick={() => navigate('/asignaciones')}>
              Ver asignaciones
            </button>
          </div>
        )}

        <div className="dashboard-grid">
          <div className="stat-card">
            <div className="stat-icon">{renderStatIcon('users')}</div>
            <div className="stat-content">
              <h3>Miembros del Equipo</h3>
              <p className="stat-value">{teamStats?.teamMembers || 0}</p>
              <p className="stat-label">Colaboradores</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">{renderStatIcon('chart')}</div>
            <div className="stat-content">
              <h3>Cumplimiento del Equipo</h3>
              <p className="stat-value">{teamStats?.teamAverageCompliance?.toFixed(1) || 0}%</p>
              <p className="stat-label">Promedio</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">{renderStatIcon('clipboard')}</div>
            <div className="stat-content">
              <h3>KPIs Completados</h3>
              <p className="stat-value">{teamStats?.teamCompletedKPIs || 0}</p>
              <p className="stat-label">Del equipo</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">{renderStatIcon('clock')}</div>
            <div className="stat-content">
              <h3>KPIs Pendientes</h3>
              <p className="stat-value">{teamStats?.teamPendingKPIs || 0}</p>
              <p className="stat-label">Por completar</p>
            </div>
          </div>
        </div>

        {complianceByPeriod && complianceByPeriod.length > 0 && (
          <div className="charts-grid">
            <div className="chart-card">
              <h3>Evolucion de Cumplimiento del Equipo</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={complianceByPeriod}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="compliance"
                    stroke="#f97316"
                    name="Cumplimiento %"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="dashboard-section">
          <h2>Acciones Rapidas</h2>
          <div className="quick-actions">
            <button className="action-btn" onClick={() => navigate('/asignaciones')}>
              Gestionar Asignaciones
            </button>
            <button className="action-btn" onClick={() => navigate('/mi-parrilla')}>
              Mi Parrilla
            </button>
            <button className="action-btn" onClick={() => navigate('/vistas-agregadas')}>
              Estadisticas
            </button>
            <button className="action-btn" onClick={() => navigate('/colaboradores')}>
              Ver Colaboradores
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Mi Dashboard</h1>
          <p className="subtitle">Mis avances y los de mi equipo</p>
        </div>
        <div className="user-info">
          <span className="user-name">
            <span className="user-icon">{renderUserIcon()}</span>
            {user?.name}
          </span>
          <span className="user-role">Colaborador</span>
        </div>
      </div>

      {canConfig && notificationSummary && (
        <div className="notify-banner">
          <div className="notify-main">
            <h3>Alertas clave del sistema</h3>
            <p>
              KPIs sin carga: {notificationSummary.totals.missingActual} | KPIs en riesgo:{' '}
              {notificationSummary.totals.atRisk} | Periodos por vencer:{' '}
              {notificationSummary.totals.periodsExpiring}
            </p>
          </div>
          <button className="btn-primary ghost" onClick={() => navigate('/asignaciones')}>
            Ver asignaciones
          </button>
        </div>
      )}

      <div className="dashboard-section">
        <h2>Mi resumen</h2>
        <div className="collab-summary-grid">
          <div className="collab-card">
            <p className="stat-label">KPIs asignados</p>
            <p className="stat-value">{summaryKPIs.length}</p>
          </div>
          <div className="collab-card">
            <p className="stat-label">Progreso ponderado</p>
            <p className="stat-value">
              {collaboratorSummary ? formatPercent(collaboratorSummary.overall, 1) : '0.0%'}
            </p>
          </div>
          <div className="collab-card">
            <p className="stat-label">Gap anual (objetivo - actual)</p>
            <p className="stat-value">
              {collaboratorSummary ? formatNumber(collaboratorSummary.totalGap, 2) : '0'}
            </p>
          </div>
          <div className="collab-card">
            <p className="stat-label">Peso total</p>
            <p className="stat-value">
              {collaboratorSummary ? formatPercent(collaboratorSummary.totalWeight, 1) : '0.0%'}
            </p>
          </div>
        </div>
      </div>

      <div className="dashboard-section">
        <h2>Mis KPIs y avances</h2>
        {summaryKPIs.length > 0 ? (
          <div className="table-wrapper">
            <table className="collab-kpi-table">
              <thead>
                <tr>
                  <th>KPI</th>
                  <th>Objetivo</th>
                  <th>Actual</th>
                  <th>Avance</th>
                  <th>Gap</th>
                  <th>Peso</th>
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
                      <td>{actualValue === null ? 'No registrado' : formatNumber(actualValue, 2)}</td>
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
            <p>No tienes KPIs asignados aun</p>
          </div>
        )}
      </div>

      {progressInsights && (
        <div className="dashboard-section">
          <h2>Mi progreso</h2>
          <div className="progress-grid">
            <div className="progress-card">
              <p className="progress-label">KPIs al dia</p>
              <p className="progress-value">
                {progressInsights.onTrack}/{progressInsights.total}
              </p>
              <p className="progress-caption">Cumpliendo o superando objetivo</p>
            </div>
            <div className="progress-card">
              <p className="progress-label">KPIs sin carga</p>
              <p className="progress-value">{progressInsights.withoutActual}</p>
              <p className="progress-caption">Pendientes de actualizacion</p>
            </div>
            <div className="progress-card">
              <p className="progress-label">KPIs en riesgo</p>
              <p className="progress-value">{progressInsights.atRisk}</p>
              <p className="progress-caption">Por debajo del 80%</p>
            </div>
          </div>

          <div className="progress-detail">
            <div className="detail-card">
              <h3>Metas criticas</h3>
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
                <p className="empty-note">No hay KPIs en riesgo por ahora.</p>
              )}
            </div>
            <div className="detail-card highlight">
              <h3>Proximo paso</h3>
              <p>
                {progressInsights.withoutActual > 0
                  ? 'Carga los avances pendientes para reflejar el progreso real.'
                  : progressInsights.atRisk > 0
                  ? 'Prioriza los KPIs en riesgo y ajusta tu plan.'
                  : 'Buen ritmo. Mantene el seguimiento para cerrar el periodo fuerte.'}
              </p>
              <button className="btn-primary ghost" onClick={() => navigate('/mi-parrilla')}>
                Ver mi parrilla
              </button>
            </div>
          </div>
        </div>
      )}

      {collaboratorSummary && collaboratorSummary.monthly.length > 0 && (
        <div className="dashboard-section">
          <h2>Ponderacion y avances mensuales</h2>
          <div className="mini-grid">
            {collaboratorSummary.monthly.map((m) => {
              const monthlyProgress = m.target ? (m.actual / m.target) * 100 : null
              return (
                <div key={m.name} className="mini-card">
                  <div className="mini-card-header">
                    <span className="mini-title">{m.name}</span>
                    <span className="mini-weight">{formatPercent(m.weight, 2)} peso</span>
                  </div>
                  <div className="mini-body">
                    <div>
                      <span className="detail-label">Objetivo:</span> {formatNumber(m.target, 2)}
                    </div>
                    <div>
                      <span className="detail-label">Actual:</span> {formatNumber(m.actual, 2)}
                    </div>
                    <div>
                      <span className="detail-label">Avance:</span>{' '}
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
          <h2>Avances del Equipo</h2>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={teamKPIs}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="kpiName" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="target" fill="#e5e7eb" name="Objetivo" />
                <Bar dataKey="actual" fill="#f97316" name="Actual" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="dashboard-section">
        <h2>Acciones Rapidas</h2>
        <div className="quick-actions">
          <button className="action-btn" onClick={() => navigate('/mi-parrilla')}>
            Ver Mi Parrilla
          </button>
          <button className="action-btn" onClick={() => navigate('/historial')}>
            Mi Historial
          </button>
        </div>
      </div>
    </div>
  )
}
