import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useQueryClient } from 'react-query'
import { useAuth } from '../hooks/useAuth'
import './Layout.css'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, canConfig, isCollaborator } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  const handleNavClick = () => setSidebarOpen(false)

  const handleLogout = () => {
    localStorage.removeItem('token')
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    if (isCollaborator) {
      const blocked = [
        '/colaboradores',
        '/tablero-ejecutivo',
        '/periodos',
        '/kpis',
        '/asignaciones',
        '/asignaciones-scope',
        '/asignaciones-macro',
        '/input-datos',
        '/curaduria',
        '/arbol-objetivos',
        '/parrilla-general',
        '/configuracion',
        '/mappings-externos',
        '/seguridad',
        '/consolidado',
        '/auditoria',
        '/mapa-riesgo',
        '/simulador',
      ]
      const shouldBlock = blocked.some((p) => location.pathname.startsWith(p))
      if (shouldBlock) {
        navigate('/', { replace: true })
      }
    }
  }, [isCollaborator, location.pathname, navigate])

  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
  const isPublicPage = location.pathname === '/login' || (location.pathname === '/' && !token)

  if (isPublicPage) {
    return <>{children}</>
  }

  return (
    <div className="layout">
      <button
        className="sidebar-hamburger"
        onClick={() => setSidebarOpen(true)}
        aria-label="Abrir menú"
      >
        ☰
      </button>

      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <h1>KPI Manager</h1>
          <button
            className="sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        </div>
        <nav className="sidebar-nav">

          {/* ── Inicio ── */}
          <Link to="/" className={`nav-item ${isActive('/') ? 'active' : ''}`} onClick={handleNavClick}>
            <span className="nav-icon" aria-hidden="true">&gt;</span>
            Dashboard
          </Link>
          <Link to="/mi-semana" className={`nav-item nav-item--highlight ${isActive('/mi-semana') ? 'active' : ''}`} onClick={handleNavClick}>
            <span className="nav-icon" aria-hidden="true">⚡</span>
            Mi semana
          </Link>
          <Link to="/mi-parrilla" className={`nav-item ${isActive('/mi-parrilla') ? 'active' : ''}`} onClick={handleNavClick}>
            <span className="nav-icon" aria-hidden="true">&gt;</span>
            Mi Parrilla
          </Link>
          <Link to="/check-ins" className={`nav-item ${isActive('/check-ins') ? 'active' : ''}`} onClick={handleNavClick}>
            <span className="nav-icon" aria-hidden="true">&gt;</span>
            Check-ins
          </Link>

          {/* ── Estrategia ── */}
          <div className="nav-group-label">Estrategia</div>
          <Link to="/okr" className={`nav-item ${isActive('/okr') && !isActive('/okr/alineacion') ? 'active' : ''}`} onClick={handleNavClick}>
            <span className="nav-icon" aria-hidden="true">&gt;</span>
            OKRs
          </Link>
          {!isCollaborator && (
            <Link to="/okr/alineacion" className={`nav-item ${isActive('/okr/alineacion') ? 'active' : ''}`} onClick={handleNavClick}>
              <span className="nav-icon" aria-hidden="true">&gt;</span>
              Alineacion OKR
            </Link>
          )}
          {!isCollaborator && (
            <Link to="/arbol-objetivos" className={`nav-item ${isActive('/arbol-objetivos') ? 'active' : ''}`} onClick={handleNavClick}>
              <span className="nav-icon" aria-hidden="true">&gt;</span>
              Arbol de Objetivos
            </Link>
          )}

          {/* ── Operacion ── */}
          {!isCollaborator && (
            <>
              <div className="nav-group-label">Operacion</div>
              <Link to="/colaboradores" className={`nav-item ${isActive('/colaboradores') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                Colaboradores
              </Link>
              <Link to="/periodos" className={`nav-item ${isActive('/periodos') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                Periodos
              </Link>
              <Link to="/kpis" className={`nav-item ${isActive('/kpis') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                KPIs
              </Link>
              <Link to="/asignaciones" className={`nav-item ${isActive('/asignaciones') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                Asignaciones
              </Link>
              <Link to="/asignaciones-scope" className={`nav-item ${isActive('/asignaciones-scope') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                KPIs Grupales
              </Link>
              <Link to="/input-datos" className={`nav-item ${isActive('/input-datos') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                Input de datos
              </Link>
              <Link to="/curaduria" className={`nav-item ${isActive('/curaduria') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                Curaduria
              </Link>
            </>
          )}

          {/* ── Analitica ── */}
          {!isCollaborator && (
            <>
              <div className="nav-group-label">Analitica</div>
              <Link to="/tablero-ejecutivo" className={`nav-item ${isActive('/tablero-ejecutivo') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                Tablero Ejecutivo
              </Link>
              <Link to="/mapa-riesgo" className={`nav-item ${isActive('/mapa-riesgo') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                Mapa de Riesgo
              </Link>
              <Link to="/simulador" className={`nav-item ${isActive('/simulador') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                Simulador
              </Link>
              <Link to="/vistas" className={`nav-item ${isActive('/vistas') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                Vistas
              </Link>
              <Link to="/historial" className={`nav-item ${isActive('/historial') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                Historico
              </Link>
              <Link to="/auditoria" className={`nav-item ${isActive('/auditoria') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                Auditoria
              </Link>
            </>
          )}

          {/* ── Configuracion ── */}
          {canConfig && !isCollaborator && (
            <>
              <div className="nav-group-label">Configuracion</div>
              <Link to="/configuracion" className={`nav-item ${isActive('/configuracion') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                Configuracion
              </Link>
              <Link to="/seguridad" className={`nav-item ${isActive('/seguridad') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                Seguridad
              </Link>
              <Link to="/mappings-externos" className={`nav-item ${isActive('/mappings-externos') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                Mappings externos
              </Link>
              <Link to="/marketplace-kpi" className={`nav-item ${isActive('/marketplace-kpi') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                Templates KPI
              </Link>
            </>
          )}

        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-name">{user?.name || 'Usuario'}</div>
            <div className="user-role">{user?.role || ''}</div>
          </div>
          <Link to="/mi-cuenta" className="footer-link" onClick={handleNavClick}>
            Mi cuenta
          </Link>
          <button className="logout-button" onClick={handleLogout}>
            Cerrar sesion
          </button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}
