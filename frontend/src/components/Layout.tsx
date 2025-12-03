import { Link, useLocation } from 'react-router-dom'
import './Layout.css'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()

  const isActive = (path: string) => location.pathname === path

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>KPI Manager</h1>
        </div>
        <nav className="sidebar-nav">
          <Link
            to="/"
            className={`nav-item ${isActive('/') ? 'active' : ''}`}
          >
            <span className="nav-icon">📊</span>
            Dashboard
          </Link>
          <Link
            to="/colaboradores"
            className={`nav-item ${isActive('/colaboradores') ? 'active' : ''}`}
          >
            <span className="nav-icon">👥</span>
            Colaboradores
          </Link>
          <Link
            to="/periodos"
            className={`nav-item ${isActive('/periodos') ? 'active' : ''}`}
          >
            <span className="nav-icon">📅</span>
            Períodos
          </Link>
          <Link
            to="/kpis"
            className={`nav-item ${isActive('/kpis') ? 'active' : ''}`}
          >
            <span className="nav-icon">🎯</span>
            KPIs
          </Link>
          <Link
            to="/asignaciones"
            className={`nav-item ${isActive('/asignaciones') ? 'active' : ''}`}
          >
            <span className="nav-icon">📋</span>
            Asignaciones
          </Link>
          <Link
            to="/arbol-objetivos"
            className={`nav-item ${isActive('/arbol-objetivos') ? 'active' : ''}`}
          >
            <span className="nav-icon">🌳</span>
            Árbol de Objetivos
          </Link>
        </nav>
      </aside>
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}

