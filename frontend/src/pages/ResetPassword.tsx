import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import './Login.css'
import './ResetPassword.css'

const RESET_PASSWORD_API_ERROR_KEYS: Record<string, string> = {
  AUTH_RESET_TOKEN_AND_PASSWORD_REQUIRED: 'reset_page.api_errors.token_and_password_required',
  AUTH_RESET_PASSWORD_TOO_SHORT: 'reset_page.error_password_length',
  AUTH_RESET_TOKEN_INVALID: 'reset_page.api_errors.token_invalid',
  AUTH_RESET_PASSWORD_FAILED: 'reset_page.error_default',
}

export default function ResetPassword() {
  const { t } = useTranslation('auth')
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!token) {
      setError(t('reset_page.token_invalid'))
      return
    }

    if (!password || password.length < 8) {
      setError(t('reset_page.error_password_length'))
      return
    }

    if (password !== confirm) {
      setError(t('reset_page.error_passwords_mismatch'))
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, password })
      setSuccess(true)
    } catch (err: any) {
      setError(resolveApiErrorMessage(err, t, {
        codeMap: RESET_PASSWORD_API_ERROR_KEYS,
        fallbackKey: 'reset_page.error_default',
      }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="corner-brand" aria-hidden="true">
        KPI Manager
      </div>
      <div className="reset-shell">
        <div className="login-card reset-card-inline">
          <div className="login-header">
            <h2>{t('reset_page.title')}</h2>
            <p className="subtitle">{t('reset_page.subtitle')}</p>
          </div>
          {!success ? (
            <form onSubmit={handleSubmit} className="login-form">
              <div className="field">
                <label htmlFor="password">{t('reset_page.password_label')}</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('reset_page.password_placeholder')}
                  autoComplete="new-password"
                />
              </div>
              <div className="field">
                <label htmlFor="confirm">{t('reset_page.confirm_label')}</label>
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder={t('reset_page.confirm_placeholder')}
                  autoComplete="new-password"
                />
              </div>
              {error && <div className="login-error">{error}</div>}
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? t('reset_page.submitting') : t('reset_page.submit')}
              </button>
            </form>
          ) : (
            <div className="reset-success">
              <div className="login-success">{t('reset_page.success')}</div>
              <button
                type="button"
                className="btn-primary"
                onClick={() => navigate('/login')}
              >
                {t('reset_page.go_login')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
