import { Link, useLocation } from 'react-router-dom'
import { useQueryClient } from 'react-query'
import { useAuth } from '../hooks/useAuth'
import './Layout.css'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const queryClient = useQueryClient()
  const { user, canConfig } = useAuth()

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  const handleLogout = () => {
    localStorage.removeItem('token')
    queryClient.removeQueries('currentUser')
    window.location.href = '/login'
  }

  // No mostrar layout en pantalla de login
  if (location.pathname === '/login') {
    return <>{children}</>
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>KPI Manager</h1>
        </div>
        <nav className="sidebar-nav">
          <Link to="/" className={`nav-item ${isActive('/') ? 'active' : ''}`}>
            <span className="nav-icon" aria-hidden="true">•</span>
            Dashboard
          </Link>
          <Link
            to="/colaboradores"
            className={`nav-item ${isActive('/colaboradores') ? 'active' : ''}`}
          >
            <span className="nav-icon" aria-hidden="true">•</span>
            Colaboradores
          </Link>
          <Link
            to="/periodos"
            className={`nav-item ${isActive('/periodos') ? 'active' : ''}`}
          >
            <span className="nav-icon" aria-hidden="true">•</span>
            Períodos
          </Link>
          <Link to="/kpis" className={`nav-item ${isActive('/kpis') ? 'active' : ''}`}>
            <span className="nav-icon" aria-hidden="true">•</span>
            KPIs
          </Link>
          <Link
            to="/asignaciones"
            className={`nav-item ${isActive('/asignaciones') ? 'active' : ''}`}
          >
            <span className="nav-icon" aria-hidden="true">•</span>
            Asignaciones
          </Link>
          <Link
            to="/arbol-objetivos"
            className={`nav-item ${isActive('/arbol-objetivos') ? 'active' : ''}`}
          >
            <span className="nav-icon" aria-hidden="true">•</span>
            Árbol de Objetivos
          </Link>
          <Link
            to="/mi-parrilla"
            className={`nav-item ${isActive('/mi-parrilla') ? 'active' : ''}`}
          >
            <span className="nav-icon" aria-hidden="true">•</span>
            Mi Parrilla
          </Link>
          <Link
            to="/historial"
            className={`nav-item ${isActive('/historial') ? 'active' : ''}`}
          >
            <span className="nav-icon" aria-hidden="true">•</span>
            Histórico
          </Link>
          <Link
            to="/vistas-agregadas"
            className={`nav-item ${isActive('/vistas-agregadas') ? 'active' : ''}`}
          >
            <span className="nav-icon" aria-hidden="true">•</span>
            Vistas Agregadas
          </Link>
          <Link
            to="/vistas-reduccion"
            className={`nav-item ${isActive('/vistas-reduccion') ? 'active' : ''}`}
          >
            <span className="nav-icon" aria-hidden="true">•</span>
            Vistas de Reducción
          </Link>
          <Link
            to="/auditoria"
            className={`nav-item ${isActive('/auditoria') ? 'active' : ''}`}
          >
            <span className="nav-icon" aria-hidden="true">•</span>
            Auditoría
          </Link>
          {user?.hasSuperpowers && (
            <Link
              to="/parrilla-general"
              className={`nav-item ${isActive('/parrilla-general') ? 'active' : ''}`}
            >
              <span className="nav-icon" aria-hidden="true">•</span>
              Parrilla General
            </Link>
          )}
          {canConfig && (
            <Link
              to="/configuracion"
              className={`nav-item ${isActive('/configuracion') ? 'active' : ''}`}
            >
              <span className="nav-icon" aria-hidden="true">•</span>
              Configuración
            </Link>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-name">{user?.name || 'Usuario'}</div>
            <div className="user-role">{user?.role || ''}</div>
          </div>
          <button className="logout-button" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}
