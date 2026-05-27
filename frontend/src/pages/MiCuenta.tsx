import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import './MiCuenta.css'

const CHANGE_PASSWORD_API_ERROR_KEYS: Record<string, string> = {
  AUTH_SESSION_INVALID: 'account:errors.session_invalid',
  AUTH_CHANGE_PASSWORD_REQUIRED: 'account:errors.required_fields',
  AUTH_CHANGE_PASSWORD_TOO_SHORT: 'account:errors.min_length',
  AUTH_USER_NOT_FOUND: 'account:errors.user_not_found',
  AUTH_LOCAL_PASSWORD_NOT_SET: 'account:errors.local_password_not_set',
  AUTH_CURRENT_PASSWORD_INCORRECT: 'account:errors.current_password_incorrect',
  AUTH_NEW_PASSWORD_SAME_AS_CURRENT: 'account:errors.same_password',
  AUTH_CHANGE_PASSWORD_FAILED: 'account:errors.change_failed',
}

export default function MiCuenta() {
  const { t } = useTranslation(['account', 'common'])
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError(t('account:errors.required_fields'))
      return
    }

    if (newPassword.length < 8) {
      setError(t('account:errors.min_length'))
      return
    }

    if (newPassword !== confirmPassword) {
      setError(t('account:errors.password_mismatch'))
      return
    }

    setLoading(true)
    try {
      const response = await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      })
      setSuccess(response.data?.message || t('account:success.updated'))
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setError(resolveApiErrorMessage(err, t, {
        codeMap: CHANGE_PASSWORD_API_ERROR_KEYS,
        fallbackKey: 'account:errors.change_failed',
      }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="account-page">
      <div className="account-card">
        <div className="account-header">
          <h2>{t('account:title')}</h2>
          <p>{t('account:subtitle')}</p>
        </div>

        <div className="account-summary">
          <div className="account-summary-item">
            <div className="account-summary-label">{t('common:name')}</div>
            <div className="account-summary-value">{user?.name || t('account:fallbacks.user')}</div>
          </div>
          <div className="account-summary-item">
            <div className="account-summary-label">{t('common:email')}</div>
            <div className="account-summary-value">{user?.email || t('account:fallbacks.no_email')}</div>
          </div>
          <div className="account-summary-item">
            <div className="account-summary-label">{t('common:role')}</div>
            <div className="account-summary-value">
              {user?.role ? t(`common:roles.${user.role}`, { defaultValue: user.role }) : t('account:fallbacks.no_role')}
            </div>
          </div>
        </div>

        <form className="account-form" onSubmit={handleSubmit}>
          <div className="account-field">
            <label htmlFor="currentPassword">{t('account:form.current_password')}</label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <div className="account-field">
            <label htmlFor="newPassword">{t('account:form.new_password')}</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="account-field">
            <label htmlFor="confirmPassword">{t('account:form.confirm_password')}</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <p className="account-hint">
            {t('account:hint')}
          </p>

          {error ? <div className="account-error">{error}</div> : null}
          {success ? <div className="account-success">{success}</div> : null}

          <div className="account-actions">
            <button className="account-submit" type="submit" disabled={loading}>
              {loading ? t('account:actions.saving') : t('account:actions.update_password')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
