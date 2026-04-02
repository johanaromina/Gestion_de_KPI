/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { storeAuthToken } from '../utils/authStorage'
import './Login.css'

export default function Register() {
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
      setError('Todos los campos son requeridos.')
      return
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    try {
      const response = await api.post('/auth/register', { companyName, adminName, email, password })
      storeAuthToken(response.data.token, true)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al crear la cuenta. Intentá más tarde.')
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
              <h2>Crear cuenta</h2>
              <p className="subtitle">
                ¿Ya tenés cuenta?{' '}
                <a href="/login" style={{ color: '#f97316', fontWeight: 600, textDecoration: 'none' }}>
                  Ingresar →
                </a>
              </p>
            </div>
            <form onSubmit={handleSubmit} className="login-form">
              <div className="field">
                <label htmlFor="companyName">Nombre de la empresa</label>
                <input
                  id="companyName"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ej: Acme S.A."
                  autoComplete="organization"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="adminName">Tu nombre completo</label>
                <input
                  id="adminName"
                  type="text"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Ej: Juan Pérez"
                  autoComplete="name"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@empresa.com"
                  autoComplete="email"
                  required
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
                    placeholder="Mínimo 8 caracteres"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="toggle-visibility"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </div>
              <div className="field">
                <label htmlFor="confirmPassword">Confirmar contraseña</label>
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repetí tu contraseña"
                  autoComplete="new-password"
                  required
                />
              </div>
              {error && <div className="login-error">{error}</div>}
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Creando cuenta...' : 'Crear empresa'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}
