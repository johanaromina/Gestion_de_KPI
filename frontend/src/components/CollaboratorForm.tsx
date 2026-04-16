/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import api from '../services/api'
import { OrgScope, Collaborator, DataSourceMapping } from '../types'
import { closeOnOverlayClick, markOverlayPointerDown } from '../utils/modal'
import { useDialog } from './Dialog'
import './CollaboratorForm.css'
import {
  buildExternalKeysTextBySourceType,
  DEFAULT_MAPPING_SOURCE_TYPE,
  getMappingSourceTypeLabel,
  getSourceTypesToSync,
  MAPPING_SOURCE_TYPE_OPTIONS,
  normalizeMappingSourceType,
  parseExternalKeysText,
} from '../utils/dataSourceMappings'

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
    orgScopeId: collaborator?.orgScopeId || undefined,
    email: collaborator?.email || '',
    mfaEnabled: collaborator?.mfaEnabled || false,
    managerId: collaborator?.managerId || undefined,
      role: collaborator?.role || 'collaborator',
    })
  const [mappingSourceType, setMappingSourceType] = useState(DEFAULT_MAPPING_SOURCE_TYPE)
  const [externalKeysBySourceType, setExternalKeysBySourceType] = useState<Record<string, string>>({
    [DEFAULT_MAPPING_SOURCE_TYPE]: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState('')
  const [managerSearch, setManagerSearch] = useState('')
  const [managerOpen, setManagerOpen] = useState(false)

  const queryClient = useQueryClient()
  const dialog = useDialog()

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

  const { data: orgScopes } = useQuery<OrgScope[]>(
    'org-scopes',
    async () => {
      const response = await api.get('/org-scopes')
      return response.data
    },
    { retry: false }
  )

  const { data: collaboratorMappings } = useQuery<DataSourceMapping[]>(
    ['data-source-mappings-collaborator', collaborator?.id],
    async () => {
      if (!collaborator?.id) return []
      const response = await api.get('/data-source-mappings', {
        params: { entityType: 'collaborator', entityId: collaborator.id },
      })
      return response.data
    },
    {
      enabled: !!collaborator?.id,
      retry: false,
    }
  )

  const areaScopes = (orgScopes || []).filter((s) => s.type === 'area')
  const personScopes = (orgScopes || []).filter((s) => s.type === 'person').sort((a, b) => a.name.localeCompare(b.name))
  const selectedOrgScope = orgScopes?.find((s) => s.id === formData.orgScopeId)
  const orgScopeIsPersonNode = selectedOrgScope?.type === 'person'

  useEffect(() => {
    if (formData.orgScopeId || !formData.area || areaScopes.length === 0) return
    const match = areaScopes.find((scope) => scope.name === formData.area)
    if (match) {
      setFormData((prev) => ({ ...prev, orgScopeId: match.id }))
    }
  }, [areaScopes, formData.area, formData.orgScopeId])

  useEffect(() => {
    if (!collaborator?.id) {
      setExternalKeysBySourceType({ [DEFAULT_MAPPING_SOURCE_TYPE]: '' })
      setMappingSourceType(DEFAULT_MAPPING_SOURCE_TYPE)
      return
    }
    setExternalKeysBySourceType(
      buildExternalKeysTextBySourceType(collaboratorMappings, 'collaborator', collaborator.id)
    )
  }, [collaborator?.id, collaboratorMappings])

  const updateExternalKeysForSourceType = (value: string) => {
    const normalizedSourceType = normalizeMappingSourceType(mappingSourceType)
    setExternalKeysBySourceType((prev) => ({
      ...prev,
      [normalizedSourceType]: value,
    }))
  }

  const syncCollaboratorMappings = async (collaboratorId: number) => {
    const sourceTypes = getSourceTypesToSync(
      externalKeysBySourceType,
      collaboratorMappings,
      'collaborator',
      collaboratorId
    )

    await Promise.all(
      sourceTypes.map((sourceType) =>
        api.post('/data-source-mappings/sync', {
          sourceType,
          entityType: 'collaborator',
          entityId: collaboratorId,
          externalKeys: parseExternalKeysText(externalKeysBySourceType[sourceType] || ''),
        })
      )
    )
  }

  const createAreaMutation = useMutation(
    async (name: string) => {
      const response = await api.post('/org-scopes', { name, type: 'area' })
      return response.data as { id: number }
    },
    {
      onSuccess: (newScope, variables) => {
        queryClient.invalidateQueries('org-scopes')
        setFormData((prev) => ({
          ...prev,
          area: variables,
          orgScopeId: newScope?.id || prev.orgScopeId,
        }))
      },
      onError: (error: any) => {
        void dialog.alert(error.response?.data?.error || 'Error al crear área', { title: 'Error', variant: 'danger' })
      },
    }
  )

  const handleCollaboratorMutationError = (error: any) => {
    const message = error?.response?.data?.error || 'No se pudo guardar el colaborador'
    const normalized = String(message).toLowerCase()

    if (normalized.includes('email')) {
      setErrors((prev) => ({
        ...prev,
        email: 'Ya existe un colaborador con ese email',
      }))
      setSubmitError('')
      return
    }

    if (normalized.includes('circular')) {
      setErrors((prev) => ({
        ...prev,
        managerId: 'Este jefe genera una relación circular en la jerarquía',
      }))
      setSubmitError('')
      return
    }

    setSubmitError(message)
  }

  const createMutation = useMutation(
    async (data: Partial<Collaborator>) => {
      const response = await api.post('/collaborators', data)
      const collaboratorId = Number(response.data?.id || 0)
      if (collaboratorId) {
        await syncCollaboratorMappings(collaboratorId)
      }
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('collaborators')
        queryClient.invalidateQueries('data-source-mappings')
        onSuccess?.()
        onClose()
      },
      onError: handleCollaboratorMutationError,
    }
  )

  const updateMutation = useMutation(
    async (data: Partial<Collaborator>) => {
      const response = await api.put(`/collaborators/${collaborator?.id}`, data)
      if (collaborator?.id) {
        await syncCollaboratorMappings(collaborator.id)
      }
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('collaborators')
        queryClient.invalidateQueries('data-source-mappings')
        queryClient.invalidateQueries(['data-source-mappings-collaborator', collaborator?.id])
        onSuccess?.()
        onClose()
      },
      onError: handleCollaboratorMutationError,
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

    if (!formData.area?.trim() && !formData.orgScopeId) {
      newErrors.area = 'El area es requerida'
    }

    if (!formData.role) {
      newErrors.role = 'El rol es requerido'
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email invalido'
    }

    setSubmitError('')
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
      managerId: formData.managerId || undefined,
      orgScopeId: formData.orgScopeId || undefined,
    }

    if (collaborator?.id) {
      updateMutation.mutate(submitData)
    } else {
      createMutation.mutate(submitData)
    }
  }

  const availableManagers = collaborators?.filter(
    (c) => c.id !== collaborator?.id
  ) || []

  const selectedManager = availableManagers.find((m) => m.id === formData.managerId)

  const filteredManagers = availableManagers.filter((m) => {
    const q = managerSearch.toLowerCase()
    return (
      !q ||
      m.name.toLowerCase().includes(q) ||
      (m.position || '').toLowerCase().includes(q)
    )
  })

  return (
    <div
      className="modal-overlay"
      onPointerDown={markOverlayPointerDown}
      onClick={(e) => closeOnOverlayClick(e, onClose)}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {collaborator?.id ? 'Editar Colaborador' : 'Crear Colaborador'}
          </h2>
          <button className="close-button" onClick={onClose}>
            x
          </button>
        </div>

        <form onSubmit={handleSubmit} className="collaborator-form">
          {submitError && <div className="form-submit-error">{submitError}</div>}

          <div className="form-group">
            <label htmlFor="name">Nombre Completo *</label>
            <input
              type="text"
              id="name"
              value={formData.name || ''}
              onChange={(e) => {
                setSubmitError('')
                setFormData({ ...formData, name: e.target.value })
              }}
              placeholder="Ej: Juan Perez"
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
              <label htmlFor="area">Area *</label>
              <div className="area-input">
                <select
                  id="area"
                  value={formData.area || ''}
                  onChange={(e) => {
                    setSubmitError('')
                    const nextArea = e.target.value
                    const scopeMatch = areaScopes.find((scope) => scope.name === nextArea)
                    setFormData({
                      ...formData,
                      area: nextArea,
                      orgScopeId: scopeMatch ? scopeMatch.id : undefined,
                    })
                  }}
                  className={errors.area ? 'error' : ''}
                >
                  <option value="">Seleccione un area</option>
                  {areaScopes.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-secondary small"
                  onClick={async () => {
                    const name = await dialog.prompt('Nombre del área nueva:', {
                      title: 'Crear área', placeholder: 'Ej: Tecnología', confirmLabel: 'Crear'
                    })
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
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={formData.email || ''}
                onChange={(e) => {
                  setSubmitError('')
                  setErrors((prev) => {
                    if (!prev.email) return prev
                    const next = { ...prev }
                    delete next.email
                    return next
                  })
                  setFormData({ ...formData, email: e.target.value })
                }}
                placeholder="usuario@empresa.com"
                className={errors.email ? 'error' : ''}
              />
              {errors.email && (
                <span className="error-message">{errors.email}</span>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="mfaEnabled">Requiere MFA</label>
              <div className="checkbox-row">
                <input
                  type="checkbox"
                  id="mfaEnabled"
                  checked={!!formData.mfaEnabled}
                  onChange={(e) =>
                    setFormData({ ...formData, mfaEnabled: e.target.checked })
                  }
                />
                <span>Activar verificacion por email</span>
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="mappingSourceType">Tipo de origen</label>
              <select
                id="mappingSourceType"
                value={mappingSourceType}
                onChange={(e) => setMappingSourceType(normalizeMappingSourceType(e.target.value))}
              >
                {MAPPING_SOURCE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="externalKeys">Claves externas</label>
              <input
                type="text"
                id="externalKeys"
                value={externalKeysBySourceType[mappingSourceType] || ''}
                onChange={(e) => updateExternalKeysForSourceType(e.target.value)}
                placeholder="johana, j.garcia, jgarcia@empresa.com"
              />
              <span className="helper-text">
                {mappingSourceType === 'global'
                  ? 'Nombres o apodos con los que esta persona aparece en tus sistemas externos (Jira, Google Sheets, etc.). Se usa como comodín si no hay un alias específico para el conector.'
                  : `Nombres o identificadores de esta persona en ${getMappingSourceTypeLabel(mappingSourceType)}. Separados por coma. Ej: johana, j.garcia`}
              </span>
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

            <div className="form-group manager-search-group">
              <label htmlFor="managerSearch">Jefe directo</label>
              <div className="manager-search-wrap">
                <input
                  id="managerSearch"
                  type="text"
                  autoComplete="off"
                  placeholder="Buscar por nombre o cargo..."
                  value={managerOpen ? managerSearch : (selectedManager ? `${selectedManager.name} — ${selectedManager.position}` : '')}
                  className={errors.managerId ? 'error' : ''}
                  onFocus={() => {
                    setManagerSearch('')
                    setManagerOpen(true)
                  }}
                  onChange={(e) => {
                    setManagerSearch(e.target.value)
                    setManagerOpen(true)
                  }}
                  onBlur={() => setTimeout(() => setManagerOpen(false), 150)}
                />
                {formData.managerId && (
                  <button
                    type="button"
                    className="manager-clear"
                    onClick={() => {
                      setFormData({ ...formData, managerId: undefined })
                      setManagerSearch('')
                      setErrors((prev) => { const n = { ...prev }; delete n.managerId; return n })
                    }}
                    aria-label="Quitar manager"
                  >
                    ×
                  </button>
                )}
                {managerOpen && (
                  <ul className="manager-dropdown">
                    <li
                      className="manager-option"
                      onMouseDown={() => {
                        setFormData({ ...formData, managerId: undefined })
                        setManagerSearch('')
                        setManagerOpen(false)
                        setErrors((prev) => { const n = { ...prev }; delete n.managerId; return n })
                      }}
                    >
                      <span className="manager-option-name">Sin manager</span>
                    </li>
                    {filteredManagers.length === 0 ? (
                      <li className="manager-no-results">Sin resultados</li>
                    ) : (
                      filteredManagers.map((m) => (
                        <li
                          key={m.id}
                          className={`manager-option${formData.managerId === m.id ? ' selected' : ''}`}
                          onMouseDown={() => {
                            setFormData({ ...formData, managerId: m.id })
                            setManagerSearch('')
                            setManagerOpen(false)
                            setErrors((prev) => { const n = { ...prev }; delete n.managerId; return n })
                          }}
                        >
                          <span className="manager-option-name">{m.name}</span>
                          <span className="manager-option-pos">{m.position}</span>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
              {errors.managerId && (
                <span className="error-message">{errors.managerId}</span>
              )}
              {/* Aviso #4: jefe de nivel inferior */}
              {(() => {
                if (!selectedManager || !formData.orgScopeId || !selectedManager.orgScopeId) return null
                const managerScope = orgScopes?.find((s) => s.id === selectedManager.orgScopeId)
                const myScope = orgScopes?.find((s) => s.id === formData.orgScopeId)
                // Aviso si el jefe está bajo el mismo scope o un scope hijo
                if (managerScope && myScope && managerScope.parentId === myScope.id) {
                  return (
                    <span className="helper-text warning-text">
                      Este jefe pertenece a una unidad que depende del área de este colaborador. Verificá si es correcto.
                    </span>
                  )
                }
                return null
              })()}
            </div>
          </div>

          {personScopes.length > 0 && (
            <div className="form-group">
              <label htmlFor="personScope">
                Nodo en el organigrama <span className="field-optional">(opcional)</span>
              </label>
              <select
                id="personScope"
                value={orgScopeIsPersonNode ? (formData.orgScopeId || '') : ''}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined
                  setFormData((prev) => ({ ...prev, orgScopeId: val }))
                }}
              >
                <option value="">Sin nodo personal asignado</option>
                {personScopes.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <span className="helper-text">
                Si esta persona tiene un nodo de tipo "Persona" en la estructura organizacional, vinculala aquí para que aparezca en el organigrama.
              </span>
            </div>
          )}

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
