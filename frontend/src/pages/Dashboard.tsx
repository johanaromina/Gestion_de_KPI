import { useQuery } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import api from '../services/api'
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

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, isLoading: authLoading, isHR, isLeadership, isCollaborator } = useAuth()

  // Estadísticas generales (para Admin/HR)
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

  // Estadísticas por área (para Admin/HR)
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

  // Estadísticas del equipo (para Líderes)
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

  // Mis KPIs y avances (para Colaboradores)
  const { data: myKPIs } = useQuery<KPICompliance[]>(
    ['dashboard-my-kpis', user?.collaboratorId],
    async () => {
      const response = await api.get(`/dashboard/my-kpis/${user?.collaboratorId}`)
      return response.data
    },
    {
      enabled: isCollaborator && !!user?.collaboratorId,
      retry: false,
    }
  )

  // Avances del equipo (para Colaboradores que son parte de un equipo)
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

  // Gráfica de cumplimiento por período
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

  if (authLoading) {
    return (
      <div className="dashboard">
        <div className="loading">Cargando dashboard...</div>
      </div>
    )
  }

  // Dashboard para Recursos Humanos / Admin
  if (isHR) {
    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <div>
            <h1>Dashboard - Recursos Humanos</h1>
            <p className="subtitle">Vista global del sistema de gestión de KPIs</p>
          </div>
          <div className="user-info">
            <span className="user-name">👤 {user?.name}</span>
            <span className="user-role">Recursos Humanos</span>
          </div>
        </div>

        {/* Estadísticas principales */}
        <div className="dashboard-grid">
          <div className="stat-card">
            <div className="stat-icon">👥</div>
            <div className="stat-content">
              <h3>Colaboradores</h3>
              <p className="stat-value">{stats?.totalCollaborators || 0}</p>
              <p className="stat-label">Total registrados</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">📅</div>
            <div className="stat-content">
              <h3>Períodos Activos</h3>
              <p className="stat-value">{stats?.activePeriods || 0}</p>
              <p className="stat-label">En evaluación</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">🎯</div>
            <div className="stat-content">
              <h3>KPIs</h3>
              <p className="stat-value">{stats?.totalKPIs || 0}</p>
              <p className="stat-label">Definidos</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-content">
              <h3>Cumplimiento</h3>
              <p className="stat-value">{stats?.averageCompliance?.toFixed(1) || 0}%</p>
              <p className="stat-label">Promedio general</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">📋</div>
            <div className="stat-content">
              <h3>Asignaciones</h3>
              <p className="stat-value">{stats?.totalAssignments || 0}</p>
              <p className="stat-label">Total</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">⏳</div>
            <div className="stat-content">
              <h3>Pendientes</h3>
              <p className="stat-value">{stats?.pendingAssignments || 0}</p>
              <p className="stat-label">Por completar</p>
            </div>
          </div>
        </div>

        {/* Gráficas */}
        <div className="charts-grid">
          {areaStats && areaStats.length > 0 && (
            <div className="chart-card">
              <h3>Cumplimiento por Área</h3>
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
              <h3>Evolución de Cumplimiento</h3>
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
              <h3>Distribución de Colaboradores por Área</h3>
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
                    {areaStats.map((entry, index) => (
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

        {/* Accesos rápidos */}
        <div className="dashboard-section">
          <h2>Accesos Rápidos</h2>
          <div className="quick-actions">
            <button
              className="action-btn"
              onClick={() => navigate('/periodos')}
            >
              ➕ Crear Período
            </button>
            <button
              className="action-btn"
              onClick={() => navigate('/colaboradores')}
            >
              👤 Agregar Colaborador
            </button>
            <button
              className="action-btn"
              onClick={() => navigate('/kpis')}
            >
              🎯 Definir KPI
            </button>
            <button
              className="action-btn"
              onClick={() => navigate('/asignaciones')}
            >
              📋 Nueva Asignación
            </button>
            <button
              className="action-btn"
              onClick={() => navigate('/vistas-agregadas')}
            >
              📈 Vistas Agregadas
            </button>
            <button
              className="action-btn"
              onClick={() => navigate('/auditoria')}
            >
              📋 Auditoría
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Dashboard para Líderes
  if (isLeadership) {
    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <div>
            <h1>Dashboard - Liderazgo</h1>
            <p className="subtitle">Gestión de tu equipo y estadísticas</p>
          </div>
          <div className="user-info">
            <span className="user-name">👤 {user?.name}</span>
            <span className="user-role">Líder</span>
          </div>
        </div>

        {/* Estadísticas del equipo */}
        <div className="dashboard-grid">
          <div className="stat-card">
            <div className="stat-icon">👥</div>
            <div className="stat-content">
              <h3>Miembros del Equipo</h3>
              <p className="stat-value">{teamStats?.teamMembers || 0}</p>
              <p className="stat-label">Colaboradores</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-content">
              <h3>Cumplimiento del Equipo</h3>
              <p className="stat-value">
                {teamStats?.teamAverageCompliance?.toFixed(1) || 0}%
              </p>
              <p className="stat-label">Promedio</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">📊</div>
            <div className="stat-content">
              <h3>KPIs Completados</h3>
              <p className="stat-value">{teamStats?.teamCompletedKPIs || 0}</p>
              <p className="stat-label">Del equipo</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">⏳</div>
            <div className="stat-content">
              <h3>KPIs Pendientes</h3>
              <p className="stat-value">{teamStats?.teamPendingKPIs || 0}</p>
              <p className="stat-label">Por completar</p>
            </div>
          </div>
        </div>

        {/* Gráficas */}
        {complianceByPeriod && complianceByPeriod.length > 0 && (
          <div className="charts-grid">
            <div className="chart-card">
              <h3>Evolución de Cumplimiento del Equipo</h3>
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

        {/* Accesos rápidos */}
        <div className="dashboard-section">
          <h2>Acciones Rápidas</h2>
          <div className="quick-actions">
            <button
              className="action-btn"
              onClick={() => navigate('/asignaciones')}
            >
              📋 Gestionar Asignaciones
            </button>
            <button
              className="action-btn"
              onClick={() => navigate('/mi-parrilla')}
            >
              📊 Mi Parrilla
            </button>
            <button
              className="action-btn"
              onClick={() => navigate('/vistas-agregadas')}
            >
              📈 Estadísticas
            </button>
            <button
              className="action-btn"
              onClick={() => navigate('/colaboradores')}
            >
              👥 Ver Colaboradores
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Dashboard para Colaboradores
  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Mi Dashboard</h1>
          <p className="subtitle">Mis avances y los de mi equipo</p>
        </div>
        <div className="user-info">
          <span className="user-name">👤 {user?.name}</span>
          <span className="user-role">Colaborador</span>
        </div>
      </div>

      {/* Mis KPIs */}
      <div className="dashboard-section">
        <h2>Mis KPIs y Avances</h2>
        {myKPIs && myKPIs.length > 0 ? (
          <div className="kpi-list">
            {myKPIs.map((kpi, index) => (
              <div key={index} className="kpi-card">
                <div className="kpi-header">
                  <h3>{kpi.kpiName}</h3>
                  <span
                    className={`compliance-badge ${
                      kpi.compliance >= 100
                        ? 'excellent'
                        : kpi.compliance >= 80
                        ? 'good'
                        : kpi.compliance >= 60
                        ? 'warning'
                        : 'poor'
                    }`}
                  >
                    {kpi.compliance.toFixed(1)}%
                  </span>
                </div>
                <div className="kpi-details">
                  <div className="kpi-detail">
                    <span className="detail-label">Objetivo:</span>
                    <span className="detail-value">{kpi.target}</span>
                  </div>
                  <div className="kpi-detail">
                    <span className="detail-label">Actual:</span>
                    <span className="detail-value">{kpi.actual || 'No registrado'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No tienes KPIs asignados aún</p>
          </div>
        )}
      </div>

      {/* Avances del equipo */}
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

      {/* Accesos rápidos */}
      <div className="dashboard-section">
        <h2>Acciones Rápidas</h2>
        <div className="quick-actions">
          <button
            className="action-btn"
            onClick={() => navigate('/mi-parrilla')}
          >
            📊 Ver Mi Parrilla
          </button>
          <button
            className="action-btn"
            onClick={() => navigate('/historial')}
          >
            📜 Mi Historial
          </button>
        </div>
      </div>
    </div>
  )
}
