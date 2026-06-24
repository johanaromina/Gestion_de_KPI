/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import { selfRegisterEnabled } from '../config/runtime'
import './Login.css'

const REGISTER_API_ERROR_KEYS: Record<string, string> = {
  AUTH_SELF_REGISTER_DISABLED: 'register.api_errors.self_register_disabled',
  AUTH_REGISTER_ALL_FIELDS_REQUIRED: 'register.error_all_required',
  AUTH_REGISTER_INVALID_EMAIL: 'register.api_errors.invalid_email',
  AUTH_REGISTER_PASSWORD_TOO_SHORT: 'register.error_password_length',
  AUTH_REGISTER_EMAIL_ALREADY_EXISTS: 'register.api_errors.email_exists',
  AUTH_REGISTER_FAILED: 'register.error_default',
}

export default function Register() {
  const { t } = useTranslation('auth')
  const [companyName, setCompanyName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!companyName || !adminName || !email || !password || !confirmPassword) {
      setError(t('register.error_all_required'))
      return
    }
    if (password.length < 8) {
      setError(t('register.error_password_length'))
      return
    }
    if (password !== confirmPassword) {
      setError(t('register.error_passwords_mismatch'))
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/register', { companyName, adminName, email, password })
      navigate('/')
    } catch (err: any) {
      setError(resolveApiErrorMessage(err, t, {
        codeMap: REGISTER_API_ERROR_KEYS,
        fallbackKey: 'register.error_default',
      }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="corner-brand" aria-hidden="true">KPI Manager</div>
      <div className="login-shell" style={{ gridTemplateColumns: '1fr', width: 'min(520px, 100%)' }}>
        <section className="login-panel" style={{ width: '100%' }}>
          <div className="login-card" style={{ transform: 'none', minHeight: 'auto' }}>
            <div className="login-header">
              <h2>{selfRegisterEnabled ? t('register.title_create') : t('register.title_disabled')}</h2>
              <p className="subtitle">
                {selfRegisterEnabled ? (
                  <>
                    {t('register.subtitle_has_account')}{' '}
                    <a href="/login" style={{ color: '#0891b2', fontWeight: 600, textDecoration: 'none' }}>
                      {t('register.subtitle_link_login')}
                    </a>
                  </>
                ) : (
                  <>
                    {t('register.subtitle_single_tenant')}
                    {' '}
                    <a href="/login" style={{ color: '#0891b2', fontWeight: 600, textDecoration: 'none' }}>
                      {t('register.subtitle_back_login')}
                    </a>
                  </>
                )}
              </p>
            </div>
            {selfRegisterEnabled ? (
              <form onSubmit={handleSubmit} className="login-form">
                <div className="field">
                  <label htmlFor="companyName">{t('register.company_label')}</label>
                  <input
                    id="companyName"
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder={t('register.company_placeholder')}
                    autoComplete="organization"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="adminName">{t('register.admin_name_label')}</label>
                  <input
                    id="adminName"
                    type="text"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder={t('register.admin_name_placeholder')}
                    autoComplete="name"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="email">{t('register.email_label')}</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('register.email_placeholder')}
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="password">{t('register.password_label')}</label>
                  <div className="input-wrap">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('register.password_placeholder')}
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      className="toggle-visibility"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? t('login.hide_password') : t('login.show_password')}
                    >
                      {showPassword ? t('login.hide_password') : t('login.show_password')}
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="confirmPassword">{t('register.confirm_label')}</label>
                  <input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('register.confirm_placeholder')}
                    autoComplete="new-password"
                    required
                  />
                </div>
                {error && <div className="login-error">{error}</div>}
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? t('register.submit_creating') : t('register.submit')}
                </button>
              </form>
            ) : (
              <div className="login-form">
                <div className="login-help" style={{ marginTop: 0 }}>
                  <span>{t('register.disabled_text')}</span>
                </div>
                <button type="button" className="btn-primary" onClick={() => navigate('/login')}>
                  {t('register.go_login')}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
