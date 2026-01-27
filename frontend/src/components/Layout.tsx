import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
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

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  const handleLogout = () => {
    localStorage.removeItem('token')
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    if (isCollaborator) {
      const blocked = [
        '/colaboradores',
        '/periodos',
        '/kpis',
        '/asignaciones',
        '/input-datos',
        '/curaduria',
        '/arbol-objetivos',
        '/parrilla-general',
        '/configuracion',
        '/consolidado',
        '/auditoria',
      ]
      const shouldBlock = blocked.some((p) => location.pathname.startsWith(p))
      if (shouldBlock) {
        navigate('/', { replace: true })
      }
    }
  }, [isCollaborator, location.pathname, navigate])

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
            <span className="nav-icon" aria-hidden="true">
              &gt;
            </span>
            Dashboard
          </Link>

          {!isCollaborator && (
            <>
              <Link
                to="/colaboradores"
                className={`nav-item ${isActive('/colaboradores') ? 'active' : ''}`}
              >
                <span className="nav-icon" aria-hidden="true">
                  &gt;
                </span>
                Colaboradores
              </Link>
              <Link
                to="/periodos"
                className={`nav-item ${isActive('/periodos') ? 'active' : ''}`}
              >
                <span className="nav-icon" aria-hidden="true">
                  &gt;
                </span>
                Periodos
              </Link>
              <Link to="/kpis" className={`nav-item ${isActive('/kpis') ? 'active' : ''}`}>
                <span className="nav-icon" aria-hidden="true">
                  &gt;
                </span>
                KPIs
              </Link>
              <Link
                to="/asignaciones"
                className={`nav-item ${isActive('/asignaciones') ? 'active' : ''}`}
              >
                <span className="nav-icon" aria-hidden="true">
                  &gt;
                </span>
                Asignaciones
              </Link>
              <Link
                to="/input-datos"
                className={`nav-item ${isActive('/input-datos') ? 'active' : ''}`}
              >
                <span className="nav-icon" aria-hidden="true">
                  &gt;
                </span>
                Input de datos
              </Link>
              <Link
                to="/curaduria"
                className={`nav-item ${isActive('/curaduria') ? 'active' : ''}`}
              >
                <span className="nav-icon" aria-hidden="true">
                  &gt;
                </span>
                Curaduria
              </Link>
              <Link
                to="/arbol-objetivos"
                className={`nav-item ${isActive('/arbol-objetivos') ? 'active' : ''}`}
              >
                <span className="nav-icon" aria-hidden="true">
                  &gt;
                </span>
                Arbol de Objetivos
              </Link>
            </>
          )}

          <Link to="/mi-parrilla" className={`nav-item ${isActive('/mi-parrilla') ? 'active' : ''}`}>
            <span className="nav-icon" aria-hidden="true">
              &gt;
            </span>
            Mi Parrilla
          </Link>

          {!isCollaborator && (
            <>
              <Link
                to="/historial"
                className={`nav-item ${isActive('/historial') ? 'active' : ''}`}
              >
                <span className="nav-icon" aria-hidden="true">
                  &gt;
                </span>
                Historico
              </Link>
              <Link
                to="/evolutivo"
                className={`nav-item ${isActive('/evolutivo') ? 'active' : ''}`}
              >
                <span className="nav-icon" aria-hidden="true">
                  &gt;
                </span>
                Evolutivo
              </Link>
              <Link
                to="/vistas-agregadas"
                className={`nav-item ${isActive('/vistas-agregadas') ? 'active' : ''}`}
              >
                <span className="nav-icon" aria-hidden="true">
                  &gt;
                </span>
                Vistas Agregadas
              </Link>
              <Link
                to="/vistas-reduccion"
                className={`nav-item ${isActive('/vistas-reduccion') ? 'active' : ''}`}
              >
                <span className="nav-icon" aria-hidden="true">
                  &gt;
                </span>
                Vistas de Reduccion
              </Link>
              <Link
                to="/auditoria"
                className={`nav-item ${isActive('/auditoria') ? 'active' : ''}`}
              >
                <span className="nav-icon" aria-hidden="true">
                  &gt;
                </span>
                Auditoria
              </Link>
            </>
          )}

          {user?.hasSuperpowers && !isCollaborator && (
            <Link
              to="/parrilla-general"
              className={`nav-item ${isActive('/parrilla-general') ? 'active' : ''}`}
            >
              <span className="nav-icon" aria-hidden="true">
                &gt;
              </span>
              Parrilla General
            </Link>
          )}

          {canConfig && !isCollaborator && (
            <Link
              to="/configuracion"
              className={`nav-item ${isActive('/configuracion') ? 'active' : ''}`}
            >
              <span className="nav-icon" aria-hidden="true">
                &gt;
              </span>
              Configuracion
            </Link>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-name">{user?.name || 'Usuario'}</div>
            <div className="user-role">{user?.role || ''}</div>
          </div>
          <button className="logout-button" onClick={handleLogout}>
            Cerrar sesion
          </button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}
