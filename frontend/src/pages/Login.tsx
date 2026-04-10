/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { persistSsoRememberMe, storeAuthToken } from '../utils/authStorage'
import { selfRegisterEnabled } from '../config/runtime'
import './Login.css'

type SsoProvider = {
  id: number
  name: string
  slug: string
  providerType: string
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [collaboratorId, setCollaboratorId] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mfaRequired, setMfaRequired] = useState(false)
  const [mfaToken, setMfaToken] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetStatus, setResetStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [ssoProviders, setSsoProviders] = useState<SsoProvider[]>([])
  const [ssoLoading, setSsoLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const response = await api.get('/auth/sso/providers')
        setSsoProviders(Array.isArray(response.data) ? response.data : [])
      } catch {
        setSsoProviders([])
      }
    }

    void loadProviders()
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const response = await api.post('/auth/login', {
        collaboratorId: collaboratorId ? Number(collaboratorId) : undefined,
        email: email || undefined,
        password,
        rememberMe,
      })

      if (response.data?.mfaRequired) {
        setMfaRequired(true)
        setMfaToken(response.data.mfaToken)
        setLoading(false)
        return
      }

      const { token } = response.data
      storeAuthToken(token, rememberMe)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al iniciar sesion')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const response = await api.post('/auth/mfa/verify', {
        token: mfaToken,
        code: mfaCode,
        rememberMe,
      })
      const { token } = response.data
      storeAuthToken(token, rememberMe)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al verificar codigo')
    } finally {
      setLoading(false)
    }
  }

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetStatus('loading')
    try {
      await api.post('/auth/request-password-reset', {
        email: resetEmail,
      })
      setResetStatus('sent')
    } catch {
      setResetStatus('error')
    }
  }

  const handleSsoStart = async (provider: SsoProvider) => {
    setError(null)
    setSsoLoading(true)
    try {
      persistSsoRememberMe(rememberMe)
      const response = await api.post(`/auth/sso/${provider.slug || provider.id}/start`)
      const redirectUrl = response.data?.redirectUrl
      if (!redirectUrl) {
        throw new Error('No se pudo obtener la URL de autenticacion corporativa')
      }
      window.location.assign(redirectUrl)
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'No se pudo iniciar el acceso corporativo')
      setSsoLoading(false)
    }
  }

  const loginDisabled = loading || (!email && !collaboratorId) || !password

  return (
    <div className="login-page">
      <div className="corner-brand" aria-hidden="true">
        KPI Manager
      </div>
      <div className="login-shell">
        <section className="login-hero">
          <div className="brand">
            <span className="brand-mark">KPI</span>
            <div className="brand-copy">
              <p className="brand-eyebrow">KPI Manager</p>
              <h1>Control real de objetivos, sin ruido</h1>
              <p className="brand-subtitle">
                Un tablero claro para colaboradores, lideres y direccion.
              </p>
            </div>
          </div>
          <ul className="hero-points">
            <li>Visibilidad por rol con foco en resultados</li>
            <li>Seguimiento ponderado y avances por periodo</li>
            <li>Listo para evaluaciones y auditoria interna</li>
          </ul>
          <div className="hero-metrics">
            <div className="metric-card">
              <span className="metric-value">98%</span>
              <span className="metric-label">KPIs con trazabilidad</span>
            </div>
            <div className="metric-card">
              <span className="metric-value">24h</span>
              <span className="metric-label">Tiempo medio de carga</span>
            </div>
            <div className="metric-card">
              <span className="metric-value">3x</span>
              <span className="metric-label">Visibilidad por equipo</span>
            </div>
          </div>
          <div className="hero-badge">Version empresarial</div>
        </section>
        <section className="login-panel">
          <div className="login-card">
            <div className="login-header">
              <h2>{mfaRequired ? 'Verificacion de acceso' : 'Accede a tu tablero'}</h2>
              <p className="subtitle">
                {mfaRequired
                  ? 'Te enviamos un codigo al email registrado.'
                  : 'Usa tu email o ID de colaborador.'}
              </p>
            </div>
            {!mfaRequired ? (
              <>
              <form onSubmit={handleLogin} className="login-form">
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@empresa.com"
                    autoComplete="username"
                  />
                </div>

                <div className="field">
                  <label htmlFor="collaboratorId">ID de colaborador (opcional)</label>
                  <input
                    id="collaboratorId"
                    type="number"
                    inputMode="numeric"
                    value={collaboratorId}
                    onChange={(e) => setCollaboratorId(e.target.value)}
                    placeholder="Ej: 11"
                  />
                </div>

                <div className="field">
                  <label htmlFor="password">Contraseña</label>
                  <div className="input-wrap">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Tu clave"
                      autoComplete="current-password"
                      className="input-no-reveal"
                    />
                    <button
                      type="button"
                      className="toggle-visibility"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showPassword ? (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="login-row">
                  <label className="remember-row">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span>Recordarme</span>
                  </label>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                      setResetEmail(email)
                      setResetStatus('idle')
                      setResetOpen(true)
                    }}
                  >
                    Olvidé mi contraseña
                  </button>
                </div>

                {error && <div className="login-error">{error}</div>}

                <button type="submit" className="btn-primary" disabled={loginDisabled}>
                  {loading ? 'Ingresando...' : 'Ingresar'}
                </button>

                {ssoProviders.length ? (
                  <div className="sso-section">
                    <div className="sso-divider">
                      <span>o continua con tu identidad corporativa</span>
                    </div>
                    <div className="sso-provider-list">
                      {ssoProviders.map((provider) => (
                        <button
                          type="button"
                          key={`sso-provider-${provider.id}`}
                          className="btn-secondary sso-provider-btn"
                          disabled={loading || ssoLoading}
                          onClick={() => handleSsoStart(provider)}
                        >
                          {ssoLoading ? 'Conectando...' : `Ingresar con ${provider.name}`}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="login-help">
                  <span>Necesitas ayuda? Contacta a RRHH para recuperar tu ID.</span>
                </div>
              </form>
              <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px', color: '#94a3b8' }}>
                {selfRegisterEnabled ? (
                  <>
                    ¿No tenés cuenta?{' '}
                    <a href="/register" style={{ color: '#f97316', fontWeight: 600, textDecoration: 'none' }}>
                      Crear instancia →
                    </a>
                  </>
                ) : (
                  'Alta inicial y nuevos accesos gestionados por el administrador de esta instancia.'
                )}
              </div>
              </>
            ) : (
              <form onSubmit={handleVerifyMfa} className="login-form">
                <div className="field">
                  <label htmlFor="mfaCode">Codigo de verificacion</label>
                  <input
                    id="mfaCode"
                    type="text"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    placeholder="Ej: 123456"
                    inputMode="numeric"
                  />
                </div>

                {error && <div className="login-error">{error}</div>}

                <button type="submit" className="btn-primary" disabled={loading || !mfaCode}>
                  {loading ? 'Verificando...' : 'Verificar'}
                </button>
              </form>
            )}
          </div>
        </section>
      </div>

      {resetOpen && (
        <div className="reset-modal" role="dialog" aria-modal="true">
          <div className="reset-card">
            <h3>Recuperar contraseña</h3>
            <p>Enviaremos un enlace a tu email corporativo.</p>
            <form onSubmit={handleRequestReset} className="login-form">
              <div className="field">
                <label htmlFor="resetEmail">Email</label>
                <input
                  id="resetEmail"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  required
                />
              </div>
              {resetStatus === 'sent' && (
                <div className="login-success">Si el email existe, enviaremos instrucciones.</div>
              )}
              {resetStatus === 'error' && (
                <div className="login-error">No se pudo enviar el email. Intenta mas tarde.</div>
              )}
              <div className="reset-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setResetOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={resetStatus === 'loading'}
                >
                  {resetStatus === 'loading' ? 'Enviando...' : 'Enviar enlace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
