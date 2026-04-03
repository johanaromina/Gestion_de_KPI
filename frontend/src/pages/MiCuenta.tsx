import { useState } from 'react'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import './MiCuenta.css'

export default function MiCuenta() {
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
      setError('Completa todos los campos.')
      return
    }

    if (newPassword.length < 8) {
      setError('La nueva contrasena debe tener al menos 8 caracteres.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Las nuevas contrasenas no coinciden.')
      return
    }

    setLoading(true)
    try {
      const response = await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      })
      setSuccess(response.data?.message || 'Contrasena actualizada correctamente.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo cambiar la contrasena.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="account-page">
      <div className="account-card">
        <div className="account-header">
          <h2>Mi cuenta</h2>
          <p>Administra tu acceso personal a esta instancia.</p>
        </div>

        <div className="account-summary">
          <div className="account-summary-item">
            <div className="account-summary-label">Nombre</div>
            <div className="account-summary-value">{user?.name || 'Usuario'}</div>
          </div>
          <div className="account-summary-item">
            <div className="account-summary-label">Email</div>
            <div className="account-summary-value">{user?.email || 'Sin email configurado'}</div>
          </div>
          <div className="account-summary-item">
            <div className="account-summary-label">Rol</div>
            <div className="account-summary-value">{user?.role || 'Sin rol'}</div>
          </div>
        </div>

        <form className="account-form" onSubmit={handleSubmit}>
          <div className="account-field">
            <label htmlFor="currentPassword">Contrasena actual</label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <div className="account-field">
            <label htmlFor="newPassword">Nueva contrasena</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="account-field">
            <label htmlFor="confirmPassword">Confirmar nueva contrasena</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <p className="account-hint">
            Si no recordas tu contrasena actual, usa “Olvide mi contrasena” desde la pantalla de login.
          </p>

          {error ? <div className="account-error">{error}</div> : null}
          {success ? <div className="account-success">{success}</div> : null}

          <div className="account-actions">
            <button className="account-submit" type="submit" disabled={loading}>
              {loading ? 'Guardando...' : 'Actualizar contrasena'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
