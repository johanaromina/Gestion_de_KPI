/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import './Login.css'

export default function Login() {
  const [collaboratorId, setCollaboratorId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const response = await api.post('/auth/login', {
        collaboratorId: Number(collaboratorId),
        email: '',
        password,
      })
      const { token } = response.data
      localStorage.setItem('token', token)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Iniciar sesión</h1>
        <p className="subtitle">Usa tu ID de colaborador para acceder</p>
        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="collaboratorId">ID de colaborador</label>
          <input
            id="collaboratorId"
            type="number"
            value={collaboratorId}
            onChange={(e) => setCollaboratorId(e.target.value)}
            placeholder="Ej: 11"
            required
          />

          <label htmlFor="password">Contraseña (opcional en este MVP)</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading || !collaboratorId}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
