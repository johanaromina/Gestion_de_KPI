/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import api from '../services/api'
import { Area, Collaborator } from '../types'
import './CollaboratorForm.css'

interface CollaboratorFormProps {
  collaborator?: Collaborator
  onClose: () => void
  onSuccess?: () => void
}

export default function CollaboratorForm({
  collaborator,
  onClose,
  onSuccess,
}: CollaboratorFormProps) {
  const [formData, setFormData] = useState<Partial<Collaborator>>({
    name: collaborator?.name || '',
    position: collaborator?.position || '',
    area: collaborator?.area || '',
    managerId: collaborator?.managerId || undefined,
    role: collaborator?.role || 'collaborator',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const queryClient = useQueryClient()

  // Obtener lista de colaboradores para el selector de manager
  const { data: collaborators } = useQuery<Collaborator[]>(
    'collaborators',
    async () => {
      const response = await api.get('/collaborators')
      return response.data
    },
    {
      retry: false,
    }
  )

  const { data: areas } = useQuery<Area[]>(
    'areas',
    async () => {
      const response = await api.get('/areas')
      return response.data
    },
    { retry: false }
  )

  const createAreaMutation = useMutation(
    async (name: string) => {
      const response = await api.post('/areas', { name })
      return response.data as Area
    },
    {
      onSuccess: (newArea) => {
        queryClient.invalidateQueries('areas')
        setFormData((prev) => ({ ...prev, area: newArea.name }))
      },
      onError: (error: any) => {
        alert(error.response?.data?.error || 'Error al crear área')
      },
    }
  )

  const createMutation = useMutation(
    async (data: Partial<Collaborator>) => {
      const response = await api.post('/collaborators', data)
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('collaborators')
        onSuccess?.()
        onClose()
      },
    }
  )

  const updateMutation = useMutation(
    async (data: Partial<Collaborator>) => {
      const response = await api.put(`/collaborators/${collaborator?.id}`, data)
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('collaborators')
        onSuccess?.()
        onClose()
      },
    }
  )

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name?.trim()) {
      newErrors.name = 'El nombre es requerido'
    }

    if (!formData.position?.trim()) {
      newErrors.position = 'El cargo es requerido'
    }

    if (!formData.area?.trim()) {
      newErrors.area = 'El área es requerida'
    }

    if (!formData.role) {
      newErrors.role = 'El rol es requerido'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      return
    }

    const submitData = {
      ...formData,
      managerId: formData.managerId || null,
    }

    if (collaborator?.id) {
      updateMutation.mutate(submitData)
    } else {
      createMutation.mutate(submitData)
    }
  }

  // Filtrar colaboradores para el selector de manager (excluir el actual si está editando)
  const availableManagers = collaborators?.filter(
    (c) => c.id !== collaborator?.id
  ) || []

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {collaborator?.id ? 'Editar Colaborador' : 'Crear Colaborador'}
          </h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="collaborator-form">
          <div className="form-group">
            <label htmlFor="name">Nombre Completo *</label>
            <input
              type="text"
              id="name"
              value={formData.name || ''}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="Ej: Juan Pérez"
              className={errors.name ? 'error' : ''}
            />
            {errors.name && (
              <span className="error-message">{errors.name}</span>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="position">Cargo *</label>
              <input
                type="text"
                id="position"
                value={formData.position || ''}
                onChange={(e) =>
                  setFormData({ ...formData, position: e.target.value })
                }
                placeholder="Ej: Desarrollador Senior"
                className={errors.position ? 'error' : ''}
              />
              {errors.position && (
                <span className="error-message">{errors.position}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="area">Área *</label>
              <div className="area-input">
                <select
                  id="area"
                  value={formData.area || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, area: e.target.value })
                  }
                  className={errors.area ? 'error' : ''}
                >
                  <option value="">Seleccione un área</option>
                  {areas?.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-secondary small"
                  onClick={() => {
                    const name = window.prompt('Nombre del área')
                    if (name && name.trim()) {
                      createAreaMutation.mutate(name.trim())
                    }
                  }}
                >
                  + Nueva
                </button>
              </div>
              {errors.area && (
                <span className="error-message">{errors.area}</span>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="role">Rol *</label>
              <select
                id="role"
                value={formData.role || 'collaborator'}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    role: e.target.value as Collaborator['role'],
                  })
                }
                className={errors.role ? 'error' : ''}
              >
                <option value="collaborator">Colaborador</option>
                <option value="leader">Líder</option>
                <option value="manager">Gerente</option>
                <option value="director">Director</option>
                <option value="admin">Administrador</option>
              </select>
              {errors.role && (
                <span className="error-message">{errors.role}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="managerId">Manager (Jefe Directo)</label>
              <select
                id="managerId"
                value={formData.managerId || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    managerId: e.target.value
                      ? parseInt(e.target.value)
                      : undefined,
                  })
                }
              >
                <option value="">Sin manager</option>
                {availableManagers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name} - {manager.position}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={createMutation.isLoading || updateMutation.isLoading}
            >
              {createMutation.isLoading || updateMutation.isLoading
                ? 'Guardando...'
                : collaborator?.id
                ? 'Actualizar'
                : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
