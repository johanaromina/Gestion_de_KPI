import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import api from '../services/api'
import './Layout.css'

const PUBLIC_PATHS = ['/login', '/register', '/reset-password', '/sso/callback', '/landing']

const LANGUAGES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
]

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, canConfig, isCollaborator, isLoading } = useAuth()
  const { t, i18n } = useTranslation('layout')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  const handleNavClick = () => setSidebarOpen(false)

  const handleLogout = async () => {
    try { await api.post('/auth/logout') } catch { /* ignore */ }
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang)
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

  const isPublicPage =
    PUBLIC_PATHS.some((p) => location.pathname.startsWith(p)) ||
    (location.pathname === '/' && !user && !isLoading)

  if (isPublicPage) {
    return <>{children}</>
  }

  return (
    <div className="layout">
      <button
        className="sidebar-hamburger"
        onClick={() => setSidebarOpen(true)}
        aria-label={t('aria.open_menu')}
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
            aria-label={t('aria.close_menu')}
          >
            ✕
          </button>
        </div>
        <nav className="sidebar-nav">

          {/* ── Inicio ── */}
          <Link to="/" className={`nav-item ${isActive('/') ? 'active' : ''}`} onClick={handleNavClick}>
            <span className="nav-icon" aria-hidden="true">&gt;</span>
            {t('nav.dashboard')}
          </Link>
          <Link to="/mi-semana" className={`nav-item nav-item--highlight ${isActive('/mi-semana') ? 'active' : ''}`} onClick={handleNavClick}>
            <span className="nav-icon" aria-hidden="true">⚡</span>
            {t('nav.my_week')}
          </Link>
          <Link to="/mi-parrilla" className={`nav-item ${isActive('/mi-parrilla') ? 'active' : ''}`} onClick={handleNavClick}>
            <span className="nav-icon" aria-hidden="true">&gt;</span>
            {t('nav.my_grid')}
          </Link>
          <Link to="/check-ins" className={`nav-item ${isActive('/check-ins') ? 'active' : ''}`} onClick={handleNavClick}>
            <span className="nav-icon" aria-hidden="true">&gt;</span>
            {t('nav.check_ins')}
          </Link>

          {/* ── Estrategia ── */}
          <div className="nav-group-label">{t('nav.strategy')}</div>
          <Link to="/okr" className={`nav-item ${isActive('/okr') && !isActive('/okr/alineacion') ? 'active' : ''}`} onClick={handleNavClick}>
            <span className="nav-icon" aria-hidden="true">&gt;</span>
            {t('nav.okrs')}
          </Link>
          {!isCollaborator && (
            <Link to="/okr/alineacion" className={`nav-item ${isActive('/okr/alineacion') ? 'active' : ''}`} onClick={handleNavClick}>
              <span className="nav-icon" aria-hidden="true">&gt;</span>
              {t('nav.okr_alignment')}
            </Link>
          )}
          {!isCollaborator && (
            <Link to="/arbol-objetivos" className={`nav-item ${isActive('/arbol-objetivos') ? 'active' : ''}`} onClick={handleNavClick}>
              <span className="nav-icon" aria-hidden="true">&gt;</span>
              {t('nav.objective_tree')}
            </Link>
          )}
          {!isCollaborator && (
            <Link to="/organigrama" className={`nav-item ${isActive('/organigrama') ? 'active' : ''}`} onClick={handleNavClick}>
              <span className="nav-icon" aria-hidden="true">&gt;</span>
              {t('nav.org_chart')}
            </Link>
          )}

          {/* ── Operacion ── */}
          {!isCollaborator && (
            <>
              <div className="nav-group-label">{t('nav.operations')}</div>
              <Link to="/colaboradores" className={`nav-item ${isActive('/colaboradores') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                {t('nav.collaborators')}
              </Link>
              <Link to="/importar-datos" className={`nav-item ${isActive('/importar-datos') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                {t('nav.import_data')}
              </Link>
              <Link to="/periodos" className={`nav-item ${isActive('/periodos') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                {t('nav.periods')}
              </Link>
              <Link to="/kpis" className={`nav-item ${isActive('/kpis') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                {t('nav.kpis')}
              </Link>
              <Link to="/asignaciones" className={`nav-item ${isActive('/asignaciones') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                {t('nav.assignments')}
              </Link>
              <Link to="/asignaciones-scope" className={`nav-item ${isActive('/asignaciones-scope') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                {t('nav.group_kpis')}
              </Link>
              <Link to="/input-datos" className={`nav-item ${isActive('/input-datos') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                {t('nav.data_input')}
              </Link>
              <Link to="/curaduria" className={`nav-item ${isActive('/curaduria') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                {t('nav.curation')}
              </Link>
            </>
          )}

          {/* ── Analitica ── */}
          {!isCollaborator && (
            <>
              <div className="nav-group-label">{t('nav.analytics')}</div>
              <Link to="/tablero-ejecutivo" className={`nav-item ${isActive('/tablero-ejecutivo') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                {t('nav.executive_board')}
              </Link>
              <Link to="/mapa-riesgo" className={`nav-item ${isActive('/mapa-riesgo') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                {t('nav.risk_map')}
              </Link>
              <Link to="/simulador" className={`nav-item ${isActive('/simulador') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                {t('nav.simulator')}
              </Link>
              <Link to="/vistas" className={`nav-item ${isActive('/vistas') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                {t('nav.views')}
              </Link>
              <Link to="/historial" className={`nav-item ${isActive('/historial') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                {t('nav.history')}
              </Link>
              <Link to="/analytics" className={`nav-item ${isActive('/analytics') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                {t('nav.analytics_page')}
              </Link>
              <Link to="/auditoria" className={`nav-item ${isActive('/auditoria') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                {t('nav.audit')}
              </Link>
            </>
          )}

          {/* ── Configuracion ── */}
          {canConfig && !isCollaborator && (
            <>
              <div className="nav-group-label">{t('nav.configuration')}</div>
              <Link to="/configuracion" className={`nav-item ${isActive('/configuracion') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                {t('nav.config')}
              </Link>
              <Link to="/seguridad" className={`nav-item ${isActive('/seguridad') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                {t('nav.security')}
              </Link>
              <Link to="/mappings-externos" className={`nav-item ${isActive('/mappings-externos') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                {t('nav.external_mappings')}
              </Link>
              <Link to="/marketplace-kpi" className={`nav-item ${isActive('/marketplace-kpi') ? 'active' : ''}`} onClick={handleNavClick}>
                <span className="nav-icon" aria-hidden="true">&gt;</span>
                {t('nav.kpi_templates')}
              </Link>
            </>
          )}

        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-name">{user?.name || 'Usuario'}</div>
            <div className="user-role">{user?.role || ''}</div>
          </div>
          <div className="language-selector">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                className={`lang-btn${i18n.resolvedLanguage === lang.code ? ' lang-btn--active' : ''}`}
                onClick={() => handleLanguageChange(lang.code)}
              >
                {lang.label}
              </button>
            ))}
          </div>
          <Link to="/mi-cuenta" className="footer-link" onClick={handleNavClick}>
            {t('footer.my_account')}
          </Link>
          <button className="logout-button" onClick={handleLogout}>
            {t('footer.logout')}
          </button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}
