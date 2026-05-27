import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { consumeSsoRememberMe } from '../utils/authStorage'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import './Login.css'

const SSO_CALLBACK_ERROR_KEYS: Record<string, string> = {
  SSO_CALLBACK_MISSING_CODE: 'auth:sso.api_errors.callback_missing_code',
  SSO_CALLBACK_FAILED: 'auth:sso.api_errors.callback_failed',
  SSO_CODE_REQUIRED: 'auth:sso.api_errors.code_required',
  SSO_EXCHANGE_FAILED: 'auth:sso.api_errors.exchange_failed',
}

export default function SsoCallback() {
  const { t } = useTranslation('auth')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setMessage(t('sso.message_loading'))
    const code = searchParams.get('code')
    const error = searchParams.get('error')

    if (error) {
      setStatus('error')
      setMessage(
        t(SSO_CALLBACK_ERROR_KEYS[decodeURIComponent(error)] || '', {
          defaultValue: t('sso.message_error_default'),
        })
      )
      return
    }

    if (!code) {
      setStatus('error')
      setMessage(t('sso.message_no_code'))
      return
    }

    const exchange = async () => {
      try {
        const rememberMe = consumeSsoRememberMe()
        await api.post('/auth/sso/exchange', { code, rememberMe })
        navigate('/', { replace: true })
      } catch (err: any) {
        setStatus('error')
        setMessage(
          resolveApiErrorMessage(err, t, {
            codeMap: SSO_CALLBACK_ERROR_KEYS,
            fallbackKey: 'sso.message_error_default',
          })
        )
      }
    }

    void exchange()
  }, [navigate, searchParams, t])

  return (
    <div className="login-page">
      <div className="login-shell compact">
        <section className="login-panel only-panel">
          <div className="login-card">
            <div className="login-header">
              <h2>{status === 'loading' ? t('sso.title_loading') : t('sso.title_error')}</h2>
              <p className="subtitle">{message}</p>
            </div>
            {status === 'loading' ? (
              <div className="login-help"><span>{t('sso.validating')}</span></div>
            ) : null}
            {status === 'error' ? (
              <button type="button" className="btn-primary" onClick={() => navigate('/login', { replace: true })}>
                {t('sso.back_to_login')}
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}
