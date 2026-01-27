import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import './Login.css'
import './ResetPassword.css'

export default function ResetPassword() {
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
      setError('Token invalido o ausente')
      return
    }

    if (!password || password.length < 8) {
      setError('La contrasena debe tener al menos 8 caracteres')
      return
    }

    if (password !== confirm) {
      setError('Las contrasenas no coinciden')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, password })
      setSuccess(true)
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo restablecer la contrasena')
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
            <h2>Restablecer contrasena</h2>
            <p className="subtitle">Define una nueva clave para tu cuenta.</p>
          </div>
          {!success ? (
            <form onSubmit={handleSubmit} className="login-form">
              <div className="field">
                <label htmlFor="password">Nueva contrasena</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimo 8 caracteres"
                  autoComplete="new-password"
                />
              </div>
              <div className="field">
                <label htmlFor="confirm">Confirmar contrasena</label>
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repite tu clave"
                  autoComplete="new-password"
                />
              </div>
              {error && <div className="login-error">{error}</div>}
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Guardando...' : 'Actualizar contrasena'}
              </button>
            </form>
          ) : (
            <div className="reset-success">
              <div className="login-success">Contrasena actualizada correctamente.</div>
              <button
                type="button"
                className="btn-primary"
                onClick={() => navigate('/login')}
              >
                Volver al login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
