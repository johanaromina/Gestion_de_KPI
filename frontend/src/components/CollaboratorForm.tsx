/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { OrgScope, Collaborator, DataSourceMapping } from '../types'
import { closeOnOverlayClick, markOverlayPointerDown } from '../utils/modal'
import { useDialog } from './Dialog'
import './CollaboratorForm.css'
import { getApiErrorPayload, resolveApiErrorMessage } from '../utils/apiErrors'
import {
  buildExternalKeysTextBySourceType,
  DEFAULT_MAPPING_SOURCE_TYPE,
  getMappingSourceTypeLabel,
  getSourceTypesToSync,
  MAPPING_SOURCE_TYPE_OPTIONS,
  normalizeMappingSourceType,
  parseExternalKeysText,
} from '../utils/dataSourceMappings'

const CREATE_AREA_API_ERROR_KEYS: Record<string, string> = {
  ORG_SCOPE_NAME_REQUIRED: 'collaborators:form.errors.area_required',
  ORG_SCOPE_CREATE_FAILED: 'collaborators:form.area_error_create',
}

const COLLABORATOR_FORM_API_ERROR_KEYS: Record<string, string> = {
  COLLABORATOR_SCOPE_NOT_FOUND: 'collaborators:form.api_errors.scope_not_found',
  COLLABORATOR_CREATE_FORBIDDEN: 'collaborators:form.api_errors.create_forbidden',
  COLLABORATOR_UPDATE_FORBIDDEN: 'collaborators:form.api_errors.update_forbidden',
  COLLABORATOR_EMAIL_EXISTS: 'collaborators:form.errors.email_duplicate',
  COLLABORATOR_MANAGER_CYCLE: 'collaborators:form.errors.circular_manager',
  COLLABORATOR_NOT_FOUND: 'collaborators:form.api_errors.not_found',
}

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
  const { t } = useTranslation(['collaborators', 'common'])

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

  // Todos los scopes asignables (excluye 'person' que es un nodo especial)
  const assignableScopes = (orgScopes || []).filter((s) => s.type !== 'person')
  const areaScopes = assignableScopes // alias para compatibilidad con el resto del formulario

  // Construir label con jerarquía: "Dirección Comercial › Ventas Norte"
  const scopeLabel = (scope: OrgScope): string => {
    const parent = orgScopes?.find((s) => s.id === scope.parentId)
    return parent ? `${parent.name} › ${scope.name}` : scope.name
  }

  // Ordenar jerárquicamente: padres primero, luego hijos indentados
  const sortedAssignableScopes = [...assignableScopes].sort((a, b) =>
    scopeLabel(a).localeCompare(scopeLabel(b))
  )

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
    const keysByType = buildExternalKeysTextBySourceType(collaboratorMappings, 'collaborator', collaborator.id)
    setExternalKeysBySourceType(keysByType)
    // Auto-seleccionar el primer tipo no-global que tenga valor
    const nonGlobal = Object.entries(keysByType).find(
      ([type, val]) => type !== DEFAULT_MAPPING_SOURCE_TYPE && val.trim() !== ''
    )
    if (nonGlobal) setMappingSourceType(nonGlobal[0])
    else setMappingSourceType(DEFAULT_MAPPING_SOURCE_TYPE)
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
        void dialog.alert(
          resolveApiErrorMessage(error, t, {
            codeMap: CREATE_AREA_API_ERROR_KEYS,
            fallbackKey: 'form.area_error_create',
          }),
          { title: t('common:error_title'), variant: 'danger' }
        )
      },
    }
  )

  const handleCollaboratorMutationError = (error: any) => {
    const payload = getApiErrorPayload(error)
    const code = payload?.code
    const message = resolveApiErrorMessage(error, t, {
      codeMap: COLLABORATOR_FORM_API_ERROR_KEYS,
      fallbackKey: 'form.errors.save_failed',
    })

    if (code === 'COLLABORATOR_EMAIL_EXISTS') {
      setErrors((prev) => ({
        ...prev,
        email: t('form.errors.email_duplicate'),
      }))
      setSubmitError('')
      return
    }

    if (code === 'COLLABORATOR_MANAGER_CYCLE') {
      setErrors((prev) => ({
        ...prev,
        managerId: t('form.errors.circular_manager'),
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
      newErrors.name = t('form.errors.name_required')
    }

    if (!formData.position?.trim()) {
      newErrors.position = t('form.errors.position_required')
    }

    if (!formData.area?.trim() && !formData.orgScopeId) {
      newErrors.area = t('form.errors.area_required')
    }

    if (!formData.role) {
      newErrors.role = t('form.errors.role_required')
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t('form.errors.email_invalid')
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
            {collaborator?.id ? t('form.title_edit') : t('form.title_create')}
          </h2>
          <button className="close-button" onClick={onClose}>
            x
          </button>
        </div>

        <form onSubmit={handleSubmit} className="collaborator-form">
          {submitError && <div className="form-submit-error">{submitError}</div>}

          <div className="form-group">
            <label htmlFor="name">{t('form.name_label')}</label>
            <input
              type="text"
              id="name"
              value={formData.name || ''}
              onChange={(e) => {
                setSubmitError('')
                setFormData({ ...formData, name: e.target.value })
              }}
              placeholder={t('form.name_placeholder')}
              className={errors.name ? 'error' : ''}
            />
            {errors.name && (
              <span className="error-message">{errors.name}</span>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="position">{t('form.position_label')}</label>
              <input
                type="text"
                id="position"
                value={formData.position || ''}
                onChange={(e) =>
                  setFormData({ ...formData, position: e.target.value })
                }
                placeholder={t('form.position_placeholder')}
                className={errors.position ? 'error' : ''}
              />
              {errors.position && (
                <span className="error-message">{errors.position}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="area">{t('form.area_label')}</label>
              <div className="area-input">
                <select
                  id="area"
                  value={formData.area || ''}
                  onChange={(e) => {
                    setSubmitError('')
                    const nextArea = e.target.value
                    const scopeMatch = sortedAssignableScopes.find((scope) => scope.name === nextArea)
                    setFormData({
                      ...formData,
                      area: nextArea,
                      orgScopeId: scopeMatch ? scopeMatch.id : undefined,
                    })
                  }}
                  className={errors.area ? 'error' : ''}
                >
                  <option value="">{t('form.area_placeholder')}</option>
                  {sortedAssignableScopes.map((a) => (
                    <option key={a.id} value={a.name}>
                      {scopeLabel(a)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-secondary small"
                  onClick={async () => {
                    const name = await dialog.prompt(t('form.area_new_prompt'), {
                      title: t('form.area_new_title'), placeholder: t('form.area_new_placeholder'), confirmLabel: t('form.area_new_confirm')
                    })
                    if (name && name.trim()) {
                      createAreaMutation.mutate(name.trim())
                    }
                  }}
                >
                  {t('form.area_new_btn')}
                </button>
              </div>
              {errors.area && (
                <span className="error-message">{errors.area}</span>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="email">{t('form.email_label')}</label>
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
                placeholder={t('form.email_placeholder')}
                className={errors.email ? 'error' : ''}
              />
              {errors.email && (
                <span className="error-message">{errors.email}</span>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="mfaEnabled">{t('form.mfa_label')}</label>
              <div className="checkbox-row">
                <input
                  type="checkbox"
                  id="mfaEnabled"
                  checked={!!formData.mfaEnabled}
                  onChange={(e) =>
                    setFormData({ ...formData, mfaEnabled: e.target.checked })
                  }
                />
                <span>{t('form.mfa_hint')}</span>
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="mappingSourceType">{t('form.mapping_source_type_label')}</label>
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
              <label htmlFor="externalKeys">{t('form.external_keys_label')}</label>
              <input
                type="text"
                id="externalKeys"
                value={externalKeysBySourceType[mappingSourceType] || ''}
                onChange={(e) => updateExternalKeysForSourceType(e.target.value)}
                placeholder={t('form.external_keys_placeholder')}
              />
              <span className="helper-text">
                {mappingSourceType === 'global'
                  ? t('form.external_keys_hint_global')
                  : t('form.external_keys_hint_specific', { source: getMappingSourceTypeLabel(mappingSourceType) })}
              </span>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="role">{t('form.role_label')}</label>
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
                <option value="collaborator">{t('common:roles.collaborator')}</option>
                <option value="leader">{t('common:roles.leader')}</option>
                <option value="manager">{t('common:roles.manager')}</option>
                <option value="director">{t('common:roles.director')}</option>
                <option value="admin">{t('common:roles.admin')}</option>
              </select>
              {errors.role && (
                <span className="error-message">{errors.role}</span>
              )}
            </div>

            <div className="form-group manager-search-group">
              <label htmlFor="managerSearch">{t('form.manager_label')}</label>
              <div className="manager-search-wrap">
                <input
                  id="managerSearch"
                  type="text"
                  autoComplete="off"
                  placeholder={t('form.manager_placeholder')}
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
                    aria-label={t('form.manager_remove_aria')}
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
                      <span className="manager-option-name">{t('form.manager_none')}</span>
                    </li>
                    {filteredManagers.length === 0 ? (
                      <li className="manager-no-results">{t('form.manager_no_results')}</li>
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
                if (managerScope && myScope && managerScope.parentId === myScope.id) {
                  return (
                    <span className="helper-text warning-text">
                      {t('form.manager_warning')}
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
                {t('form.person_scope_label')} <span className="field-optional">{t('form.person_scope_optional')}</span>
              </label>
              <select
                id="personScope"
                value={orgScopeIsPersonNode ? (formData.orgScopeId || '') : ''}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined
                  setFormData((prev) => ({ ...prev, orgScopeId: val }))
                }}
              >
                <option value="">{t('form.person_scope_no_node')}</option>
                {personScopes.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <span className="helper-text">
                {t('form.person_scope_hint')}
              </span>
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('form.cancel')}
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={createMutation.isLoading || updateMutation.isLoading}
            >
              {createMutation.isLoading || updateMutation.isLoading
                ? t('form.saving')
                : collaborator?.id
                ? t('form.update')
                : t('form.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
