import { useQuery } from 'react-query'
import api from '../services/api'
import './Dashboard.css'

export default function Dashboard() {
  const { data: healthData } = useQuery('health', async () => {
    const response = await api.get('/health')
    return response.data
  })

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p className="subtitle">Vista general del sistema de gestión de KPIs</p>
      </div>

      <div className="dashboard-grid">
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <h3>Colaboradores</h3>
            <p className="stat-value">-</p>
            <p className="stat-label">Total registrados</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📅</div>
          <div className="stat-content">
            <h3>Períodos Activos</h3>
            <p className="stat-value">-</p>
            <p className="stat-label">En evaluación</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🎯</div>
          <div className="stat-content">
            <h3>KPIs</h3>
            <p className="stat-value">-</p>
            <p className="stat-label">Definidos</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <h3>Asignaciones</h3>
            <p className="stat-value">-</p>
            <p className="stat-label">Completadas</p>
          </div>
        </div>
      </div>

      <div className="dashboard-section">
        <h2>Estado del Sistema</h2>
        <div className="status-card">
          <div className="status-item">
            <span className="status-label">API:</span>
            <span className={`status-badge ${healthData?.status === 'ok' ? 'success' : 'error'}`}>
              {healthData?.status === 'ok' ? '✅ Conectado' : '❌ Desconectado'}
            </span>
          </div>
          <div className="status-item">
            <span className="status-label">Base de Datos:</span>
            <span className={`status-badge ${healthData?.database === 'connected' ? 'success' : 'error'}`}>
              {healthData?.database === 'connected' ? '✅ Conectado' : '❌ Desconectado'}
            </span>
          </div>
        </div>
      </div>

      <div className="dashboard-section">
        <h2>Accesos Rápidos</h2>
        <div className="quick-actions">
          <button className="action-btn">➕ Crear Período</button>
          <button className="action-btn">👤 Agregar Colaborador</button>
          <button className="action-btn">🎯 Definir KPI</button>
          <button className="action-btn">📋 Nueva Asignación</button>
        </div>
      </div>
    </div>
  )
}

