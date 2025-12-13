import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import './Configuracion.css'

type Permission = { id: number; code: string; description?: string }

type Collaborator = {
  id: number
  name: string
  area: string
  role: string
  hasSuperpowers?: boolean
}

export default function Configuracion() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [selectedCollaborator, setSelectedCollaborator] = useState<number | null>(null)
  const [selectedPerms, setSelectedPerms] = useState<string[]>([])
  const [superpowers, setSuperpowers] = useState(false)

  const { data: permissions } = useQuery<Permission[]>('config-permissions', async () => {
    const res = await api.get('/config/permissions')
    return res.data
  })

  const { data: collaborators } = useQuery<Collaborator[]>('config-collaborators', async () => {
    const res = await api.get('/collaborators')
    return res.data
  })

  const { data: collaboratorPerms, refetch: refetchPerms } = useQuery(
    ['config-collaborator-perms', selectedCollaborator],
    async () => {
      if (!selectedCollaborator) return null
      const res = await api.get(`/config/collaborators/${selectedCollaborator}/permissions`)
      return res.data
    },
    { enabled: !!selectedCollaborator }
  )

  useEffect(() => {
    if (collaboratorPerms?.permissions) {
      setSelectedPerms(collaboratorPerms.permissions)
    } else {
      setSelectedPerms([])
    }
    if (selectedCollaborator && collaborators) {
      const col = collaborators.find((c) => c.id === selectedCollaborator)
      setSuperpowers(col?.hasSuperpowers || false)
    } else {
      setSuperpowers(false)
    }
  }, [collaboratorPerms, selectedCollaborator, collaborators])

  const savePermissions = useMutation(
    async () => {
      if (!selectedCollaborator) return
      await api.put(`/config/collaborators/${selectedCollaborator}/permissions`, {
        permissions: selectedPerms,
      })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['config-collaborator-perms', selectedCollaborator])
      },
    }
  )

  const saveSuperpowers = useMutation(
    async (value: boolean) => {
      if (!selectedCollaborator) return
      await api.patch(`/config/collaborators/${selectedCollaborator}/superpowers`, {
        hasSuperpowers: value,
      })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('config-collaborators')
        refetchPerms()
      },
    }
  )

  const canManage = useMemo(() => {
    return user?.hasSuperpowers || user?.permissions?.includes('config.manage')
  }, [user])

  if (!canManage) {
    return (
      <div className="config-page">
        <h1>Configuración</h1>
        <p className="subtitle">No tienes permisos para administrar configuración.</p>
      </div>
    )
  }

  return (
    <div className="config-page">
      <div className="page-header">
        <div>
          <h1>Configuración</h1>
          <p className="subtitle">Gestiona superpoderes y permisos especiales</p>
        </div>
      </div>

      <div className="config-grid">
        <div className="card">
          <h3>Colaboradores</h3>
          <div className="list">
            {collaborators?.map((col) => (
              <button
                key={col.id}
                className={`list-item ${selectedCollaborator === col.id ? 'active' : ''}`}
                onClick={() => setSelectedCollaborator(col.id)}
              >
                <div>
                  <div className="item-title">{col.name}</div>
                  <div className="item-sub">{col.area} · {col.role}</div>
                </div>
                {col.hasSuperpowers ? <span className="badge badge-super">Superpoderes</span> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Permisos</h3>
            {selectedCollaborator && (
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={superpowers}
                  onChange={(e) => {
                    setSuperpowers(e.target.checked)
                    saveSuperpowers.mutate(e.target.checked)
                  }}
                />
                <span>Superpoderes</span>
              </label>
            )}
          </div>

          {selectedCollaborator ? (
            <div className="perms-list">
              {permissions?.map((perm) => (
                <label key={perm.id} className="perm-item">
                  <input
                    type="checkbox"
                    checked={selectedPerms.includes(perm.code)}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setSelectedPerms((prev) =>
                        checked ? [...prev, perm.code] : prev.filter((p) => p !== perm.code)
                      )
                    }}
                    disabled={superpowers}
                  />
                  <div>
                    <div className="perm-code">{perm.code}</div>
                    <div className="perm-desc">{perm.description || ''}</div>
                  </div>
                </label>
              ))}

              <div className="actions">
                <button
                  className="btn-primary"
                  onClick={() => savePermissions.mutate()}
                  disabled={savePermissions.isLoading || superpowers}
                >
                  Guardar permisos
                </button>
              </div>
            </div>
          ) : (
            <p className="muted">Selecciona un colaborador para gestionar sus permisos.</p>
          )}
        </div>
      </div>
    </div>
  )
}
