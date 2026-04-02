import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { consumeSsoRememberMe, storeAuthToken } from '../utils/authStorage'
import './Login.css'

export default function SsoCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')
  const [message, setMessage] = useState('Procesando acceso corporativo...')

  useEffect(() => {
    const code = searchParams.get('code')
    const error = searchParams.get('error')

    if (error) {
      setStatus('error')
      setMessage(decodeURIComponent(error))
      return
    }

    if (!code) {
      setStatus('error')
      setMessage('No se recibio codigo de autenticacion SSO.')
      return
    }

    const exchange = async () => {
      try {
        const rememberMe = consumeSsoRememberMe()
        const response = await api.post('/auth/sso/exchange', {
          code,
          rememberMe,
        })
        const { token } = response.data
        storeAuthToken(token, rememberMe)
        navigate('/', { replace: true })
      } catch (err: any) {
        setStatus('error')
        setMessage(err.response?.data?.error || 'No se pudo completar el acceso SSO')
      }
    }

    void exchange()
  }, [navigate, searchParams])

  return (
    <div className="login-page">
      <div className="login-shell compact">
        <section className="login-panel only-panel">
          <div className="login-card">
            <div className="login-header">
              <h2>{status === 'loading' ? 'Acceso corporativo' : 'No se pudo iniciar sesion'}</h2>
              <p className="subtitle">{message}</p>
            </div>
            {status === 'loading' ? <div className="login-help"><span>Estamos validando tu identidad corporativa.</span></div> : null}
            {status === 'error' ? (
              <button type="button" className="btn-primary" onClick={() => navigate('/login', { replace: true })}>
                Volver al login
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}
