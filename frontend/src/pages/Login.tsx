/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { persistSsoRememberMe } from '../utils/authStorage'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import { selfRegisterEnabled } from '../config/runtime'
import './Login.css'

type SsoProvider = {
  id: number
  name: string
  slug: string
  providerType: string
}

const LANGUAGES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
]

const LOGIN_API_ERROR_KEYS: Record<string, string> = {
  AUTH_CREDENTIALS_REQUIRED: 'login.api_errors.credentials_required',
  AUTH_INVALID_CREDENTIALS: 'login.api_errors.invalid_credentials',
  AUTH_USER_INACTIVE: 'login.api_errors.user_inactive',
  AUTH_PASSWORD_NOT_SET: 'login.api_errors.password_not_set',
  AUTH_LOGIN_FAILED: 'login.error_default',
}

const MFA_API_ERROR_KEYS: Record<string, string> = {
  AUTH_MFA_CODE_REQUIRED: 'login.api_errors.mfa_code_required',
  AUTH_MFA_TOKEN_INVALID: 'login.api_errors.mfa_token_invalid',
  AUTH_USER_NOT_FOUND: 'login.api_errors.user_not_found',
  AUTH_MFA_CODE_EXPIRED: 'login.api_errors.mfa_code_expired',
  AUTH_MFA_CODE_INVALID: 'login.api_errors.mfa_code_invalid',
  AUTH_MFA_VERIFY_FAILED: 'login.mfa_error_default',
}

export default function Login() {
  const { t, i18n } = useTranslation('auth')
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

      navigate('/')
    } catch (err: any) {
      setError(resolveApiErrorMessage(err, t, {
        codeMap: LOGIN_API_ERROR_KEYS,
        fallbackKey: 'login.error_default',
      }))
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await api.post('/auth/mfa/verify', {
        token: mfaToken,
        code: mfaCode,
        rememberMe,
      })
      navigate('/')
    } catch (err: any) {
      setError(resolveApiErrorMessage(err, t, {
        codeMap: MFA_API_ERROR_KEYS,
        fallbackKey: 'login.mfa_error_default',
      }))
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
        throw new Error(t('login.sso_start_error'))
      }
      window.location.assign(redirectUrl)
    } catch (err: any) {
      setError(resolveApiErrorMessage(err, t, { fallbackKey: 'login.error_default' }))
      setSsoLoading(false)
    }
  }

  const loginDisabled = loading || (!email && !collaboratorId) || !password

  return (
    <div className="login-page">
      <div className="corner-brand" aria-hidden="true">
        KPI Manager
      </div>
      <Link className="login-back-home" to="/landing">
        {t('login.back_home')}
      </Link>
      <div className="login-language-selector" aria-label={t('language.label')}>
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            type="button"
            className={`login-lang-btn${i18n.resolvedLanguage === lang.code ? ' login-lang-btn--active' : ''}`}
            onClick={() => i18n.changeLanguage(lang.code)}
            aria-pressed={i18n.resolvedLanguage === lang.code}
          >
            {lang.label}
          </button>
        ))}
      </div>
      <div className="login-shell">
        <section className="login-hero">
          <div className="brand">
            <span className="brand-mark">KPI</span>
            <div className="brand-copy">
              <p className="brand-eyebrow">KPI Manager</p>
              <h1>{t('hero.tagline')}</h1>
              <p className="brand-subtitle">{t('hero.subtitle')}</p>
            </div>
          </div>
          <ul className="hero-points">
            <li>{t('hero.point_1')}</li>
            <li>{t('hero.point_2')}</li>
            <li>{t('hero.point_3')}</li>
          </ul>
          <div className="hero-metrics">
            <div className="metric-card">
              <span className="metric-value">98%</span>
              <span className="metric-label">{t('hero.metric_kpi_traceability')}</span>
            </div>
            <div className="metric-card">
              <span className="metric-value">24h</span>
              <span className="metric-label">{t('hero.metric_load_time')}</span>
            </div>
            <div className="metric-card">
              <span className="metric-value">3x</span>
              <span className="metric-label">{t('hero.metric_team_visibility')}</span>
            </div>
          </div>
          <div className="hero-badge">{t('hero.enterprise_badge')}</div>
        </section>
        <section className="login-panel">
          <div className="login-card">
            <div className="login-header">
              <h2>{mfaRequired ? t('login.mfa_title') : t('login.title')}</h2>
              <p className="subtitle">
                {mfaRequired ? t('login.mfa_subtitle') : t('login.subtitle')}
              </p>
            </div>
            {!mfaRequired ? (
              <>
              <form onSubmit={handleLogin} className="login-form">
                <div className="field">
                  <label htmlFor="email">{t('login.email')}</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('login.email_placeholder')}
                    autoComplete="username"
                  />
                </div>

                <div className="field">
                  <label htmlFor="collaboratorId">{t('login.collaborator_id')}</label>
                  <input
                    id="collaboratorId"
                    type="number"
                    inputMode="numeric"
                    value={collaboratorId}
                    onChange={(e) => setCollaboratorId(e.target.value)}
                    placeholder={t('login.collaborator_id_placeholder')}
                  />
                </div>

                <div className="field">
                  <label htmlFor="password">{t('login.password')}</label>
                  <div className="input-wrap">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('login.password_placeholder')}
                      autoComplete="current-password"
                      className="input-no-reveal"
                    />
                    <button
                      type="button"
                      className="toggle-visibility"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? t('login.hide_password') : t('login.show_password')}
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
                    <span>{t('login.remember_me')}</span>
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
                    {t('login.forgot_password')}
                  </button>
                </div>

                {error && <div className="login-error">{error}</div>}

                <button type="submit" className="btn-primary" disabled={loginDisabled}>
                  {loading ? t('login.submitting') : t('login.submit')}
                </button>

                {ssoProviders.length ? (
                  <div className="sso-section">
                    <div className="sso-divider">
                      <span>{t('login.sso_divider')}</span>
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
                          {ssoLoading ? t('login.sso_connecting') : t('login.sso_btn', { name: provider.name })}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="login-help">
                  <span>{t('login.help')}</span>
                </div>
              </form>
              <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px', color: '#94a3b8' }}>
                {selfRegisterEnabled ? (
                  <>
                    {t('login.no_account')}{' '}
                    <a href="/register" style={{ color: '#0891b2', fontWeight: 600, textDecoration: 'none' }}>
                      {t('login.create_instance')}
                    </a>
                  </>
                ) : (
                  t('login.managed_by_admin')
                )}
              </div>
              </>
            ) : (
              <form onSubmit={handleVerifyMfa} className="login-form">
                <div className="field">
                  <label htmlFor="mfaCode">{t('login.mfa_code_label')}</label>
                  <input
                    id="mfaCode"
                    type="text"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    placeholder={t('login.mfa_code_placeholder')}
                    inputMode="numeric"
                  />
                </div>

                {error && <div className="login-error">{error}</div>}

                <button type="submit" className="btn-primary" disabled={loading || !mfaCode}>
                  {loading ? t('login.mfa_verifying') : t('login.mfa_verify')}
                </button>
              </form>
            )}
          </div>
        </section>
      </div>

      {resetOpen && (
        <div className="reset-modal" role="dialog" aria-modal="true">
          <div className="reset-card">
            <h3>{t('reset.title')}</h3>
            <p>{t('reset.subtitle')}</p>
            <form onSubmit={handleRequestReset} className="login-form">
              <div className="field">
                <label htmlFor="resetEmail">{t('reset.email')}</label>
                <input
                  id="resetEmail"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder={t('reset.email_placeholder')}
                  required
                />
              </div>
              {resetStatus === 'sent' && (
                <div className="login-success">{t('reset.success')}</div>
              )}
              {resetStatus === 'error' && (
                <div className="login-error">{t('reset.error')}</div>
              )}
              <div className="reset-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setResetOpen(false)}
                >
                  {t('reset.cancel')}
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={resetStatus === 'loading'}
                >
                  {resetStatus === 'loading' ? t('reset.submitting') : t('reset.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
