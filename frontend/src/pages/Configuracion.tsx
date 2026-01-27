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

type AuthProfile = {
  id: number
  name: string
  connector: string
  endpoint?: string
  authType?: string
  authConfig?: any
}

type IntegrationTemplate = {
  id: number
  name: string
  connector: string
  metricType?: 'count' | 'ratio'
  queryTestsTemplate?: string
  queryStoriesTemplate?: string
  formulaTemplate?: string
  schedule?: string
  authProfileId?: number | null
  authProfileName?: string
  isSpecific?: number
  enabled?: number
}

type IntegrationTarget = {
  id: number
  templateId: number
  scopeType: string
  scopeId: string
  params?: any
  assignmentId?: number | null
  enabled?: number
  orgScopeId?: number | null
  orgScopeName?: string
  orgScopeType?: string
}

type TemplateRun = {
  id: number
  templateId: number
  targetId: number
  status: string
  startedAt?: string
  finishedAt?: string
  triggeredByName?: string
  message?: string
  outputs?: any
  error?: string
}

export default function Configuracion() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [selectedCollaborator, setSelectedCollaborator] = useState<number | null>(null)
  const [selectedPerms, setSelectedPerms] = useState<string[]>([])
  const [superpowers, setSuperpowers] = useState(false)
  const [activeIntegrationTab, setActiveIntegrationTab] = useState<'templates' | 'targets' | 'runs' | 'auth'>(
    'templates'
  )
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | ''>('')
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<IntegrationTemplate | null>(null)
  const [showTargetModal, setShowTargetModal] = useState(false)
  const [editingTarget, setEditingTarget] = useState<IntegrationTarget | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [editingAuth, setEditingAuth] = useState<AuthProfile | null>(null)
  const [showScopeModal, setShowScopeModal] = useState(false)
  const [editingScope, setEditingScope] = useState<any | null>(null)
  const [showTargetPreview, setShowTargetPreview] = useState(false)
  const [targetPreviewTarget, setTargetPreviewTarget] = useState<IntegrationTarget | null>(null)
  const [targetPreviewResult, setTargetPreviewResult] = useState<any>(null)
  const [targetPreviewMessage, setTargetPreviewMessage] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [templateForm, setTemplateForm] = useState({
    name: '',
    connector: 'jira',
    metricType: 'ratio' as 'count' | 'ratio',
    queryTestsTemplate: '',
    queryStoriesTemplate: '',
    formulaTemplate: 'tests / stories',
    schedule: '',
    authProfileId: '',
    enabled: true,
  })
  const [targetForm, setTargetForm] = useState({
    templateId: '',
    scopeType: 'area',
    scopeId: '',
    orgScopeId: '',
    paramsText: '',
    assignmentId: '',
    enabled: true,
  })
  const [authForm, setAuthForm] = useState({
    name: '',
    connector: 'jira',
    endpoint: '',
    authType: 'none',
    authConfig: {
      username: '',
      password: '',
      token: '',
      apiKey: '',
      header: '',
    },
  })
  const [scopeForm, setScopeForm] = useState({
    name: '',
    type: 'area',
    parentId: '',
    metadataText: '',
    active: true,
  })

  const { data: permissions } = useQuery<Permission[]>('config-permissions', async () => {
    const res = await api.get('/config/permissions')
    return res.data
  })

  const { data: roles } = useQuery<any[]>('config-roles', async () => {
    const res = await api.get('/config/roles')
    return res.data
  })

  const { data: collaborators } = useQuery<Collaborator[]>('config-collaborators', async () => {
    const res = await api.get('/collaborators')
    return res.data
  })

  const { data: assignments } = useQuery<any[]>('config-assignments', async () => {
    const res = await api.get('/collaborator-kpis')
    return res.data
  })

  const { data: orgScopes } = useQuery<any[]>('org-scopes', async () => {
    const res = await api.get('/org-scopes')
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

  const { data: authProfiles } = useQuery<AuthProfile[]>('auth-profiles', async () => {
    const res = await api.get('/integrations/auth-profiles')
    return res.data
  })

  const { data: templates } = useQuery<IntegrationTemplate[]>('integration-templates', async () => {
    const res = await api.get('/integrations/templates')
    return res.data
  })

  const { data: targets } = useQuery<IntegrationTarget[]>(
    ['integration-targets', selectedTemplateId],
    async () => {
      const res = await api.get('/integrations/targets', {
        params: { templateId: selectedTemplateId || undefined },
      })
      return res.data
    },
    { enabled: !!selectedTemplateId }
  )

  const { data: templateRuns } = useQuery<TemplateRun[]>(
    ['integration-template-runs', selectedTemplateId],
    async () => {
      const res = await api.get('/integrations/runs', {
        params: { templateId: selectedTemplateId || undefined },
      })
      return res.data
    },
    { enabled: !!selectedTemplateId }
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

  const assignRole = useMutation(
    async ({ collaboratorId, roleCode }: { collaboratorId: number; roleCode: string }) => {
      await api.post(`/config/collaborators/${collaboratorId}/role`, { roleCode })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('config-roles')
        queryClient.invalidateQueries('config-collaborator-perms')
      },
    }
  )

  const saveTemplate = useMutation(
    async () => {
      const payload = {
        name: templateForm.name.trim(),
        connector: templateForm.connector,
        metricType: templateForm.metricType,
        queryTestsTemplate: templateForm.queryTestsTemplate.trim(),
        queryStoriesTemplate:
          templateForm.metricType === 'ratio' ? templateForm.queryStoriesTemplate.trim() : undefined,
        formulaTemplate: templateForm.formulaTemplate.trim(),
        schedule: templateForm.schedule.trim() || undefined,
        authProfileId: templateForm.authProfileId ? Number(templateForm.authProfileId) : undefined,
        enabled: templateForm.enabled,
      }
      if (editingTemplate) {
        await api.put(`/integrations/templates/${editingTemplate.id}`, payload)
      } else {
        await api.post('/integrations/templates', payload)
      }
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('integration-templates')
        setShowTemplateModal(false)
        setEditingTemplate(null)
        setTemplateForm({
          name: '',
          connector: 'jira',
          metricType: 'ratio',
          queryTestsTemplate: '',
          queryStoriesTemplate: '',
          formulaTemplate: 'tests / stories',
          schedule: '',
          authProfileId: '',
          enabled: true,
        })
      },
    }
  )

  const saveTarget = useMutation(
    async () => {
      let parsedParams: any = {}
      if (targetForm.paramsText.trim()) {
        parsedParams = JSON.parse(targetForm.paramsText)
      }
      const selectedScope = orgScopes?.find((scope) => scope.id === Number(targetForm.orgScopeId))
      const payload = {
        templateId: Number(targetForm.templateId || selectedTemplateId),
        scopeType: selectedScope?.type || targetForm.scopeType,
        scopeId: targetForm.scopeId || selectedScope?.name || '',
        orgScopeId: targetForm.orgScopeId ? Number(targetForm.orgScopeId) : undefined,
        params: parsedParams,
        assignmentId: targetForm.assignmentId ? Number(targetForm.assignmentId) : undefined,
        enabled: targetForm.enabled,
      }
      if (editingTarget) {
        await api.put(`/integrations/targets/${editingTarget.id}`, payload)
      } else {
        await api.post('/integrations/targets', payload)
      }
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['integration-targets', selectedTemplateId])
        setShowTargetModal(false)
        setEditingTarget(null)
        setTargetForm({
          templateId: '',
          scopeType: 'area',
          scopeId: '',
          orgScopeId: '',
          paramsText: '',
          assignmentId: '',
          enabled: true,
        })
      },
    }
  )

  const saveAuthProfile = useMutation(
    async () => {
      const payload = {
        name: authForm.name.trim(),
        connector: authForm.connector,
        endpoint: authForm.endpoint.trim() || undefined,
        authType: authForm.authType,
        authConfig: authForm.authType === 'none' ? null : authForm.authConfig,
      }
      if (editingAuth) {
        await api.put(`/integrations/auth-profiles/${editingAuth.id}`, payload)
      } else {
        await api.post('/integrations/auth-profiles', payload)
      }
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('auth-profiles')
        setShowAuthModal(false)
        setEditingAuth(null)
        setAuthForm({
          name: '',
          connector: 'jira',
          endpoint: '',
          authType: 'none',
          authConfig: {
            username: '',
            password: '',
            token: '',
            apiKey: '',
            header: '',
          },
        })
      },
    }
  )

  const saveScope = useMutation(
    async () => {
      let metadata: any = null
      if (scopeForm.metadataText.trim()) {
        metadata = JSON.parse(scopeForm.metadataText)
      }
      const payload = {
        name: scopeForm.name.trim(),
        type: scopeForm.type,
        parentId: scopeForm.parentId ? Number(scopeForm.parentId) : undefined,
        metadata,
        active: scopeForm.active,
      }
      if (editingScope) {
        await api.put(`/org-scopes/${editingScope.id}`, payload)
      } else {
        await api.post('/org-scopes', payload)
      }
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('org-scopes')
        setShowScopeModal(false)
        setEditingScope(null)
        setScopeForm({
          name: '',
          type: 'area',
          parentId: '',
          metadataText: '',
          active: true,
        })
      },
    }
  )

  const runTemplate = useMutation(
    async (templateId: number) => {
      await api.post(`/integrations/templates/${templateId}/run`, {})
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['integration-template-runs', selectedTemplateId])
      },
    }
  )

  const runTarget = useMutation(
    async (target: IntegrationTarget) => {
      await api.post(`/integrations/targets/${target.id}/run`, {})
      return target.templateId
    },
    {
      onSuccess: (templateId) => {
        setSelectedTemplateId(templateId)
        setActiveIntegrationTab('runs')
        setToastMessage('Target ejecutado. Revisar Runs.')
        setTimeout(() => setToastMessage(''), 2500)
        queryClient.invalidateQueries(['integration-template-runs', templateId])
      },
    }
  )

  const placeholderRegex = /\{[a-zA-Z0-9_]+\}/g
  const testsPlaceholders = templateForm.queryTestsTemplate.match(placeholderRegex) || []
  const storiesPlaceholders =
    templateForm.metricType === 'ratio' ? templateForm.queryStoriesTemplate.match(placeholderRegex) || [] : []
  const hasAnyPlaceholders = testsPlaceholders.length > 0 || storiesPlaceholders.length > 0
  const testsHasTime = testsPlaceholders.includes('{from}') || testsPlaceholders.includes('{to}')
  const storiesHasTime =
    templateForm.metricType === 'ratio'
      ? storiesPlaceholders.includes('{from}') || storiesPlaceholders.includes('{to}')
      : true
  const missingTimePlaceholders = !testsHasTime || !storiesHasTime

  const testTarget = useMutation(
    async (target: IntegrationTarget) => {
      const payload = {
        templateId: target.templateId,
        targetId: target.id,
        includeRaw: false,
      }
      const res = await api.post('/integrations/templates/test', payload)
      return res.data
    },
    {
      onSuccess: (data) => {
        setTargetPreviewResult(data)
        setTargetPreviewMessage('')
      },
      onError: (error: any) => {
        setTargetPreviewMessage(error?.response?.data?.error || error?.message || 'Error al probar target')
      },
    }
  )

  const canManage = useMemo(() => {
    return user?.hasSuperpowers || user?.permissions?.includes('config.manage')
  }, [user])

  const canRunIntegrations = useMemo(() => {
    return user?.hasSuperpowers || user?.permissions?.includes('measurement_run_ingest')
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
      {toastMessage ? <div className="toast">{toastMessage}</div> : null}

      <div className="config-section" id="integraciones">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Integraciones (plantillas)</h3>
              <p className="muted">Configura plantillas reutilizables, targets y auth profiles.</p>
            </div>
            <div className="action-buttons">
              {activeIntegrationTab === 'templates' && (
                <button
                  className="btn-primary"
                  onClick={() => {
                    setEditingTemplate(null)
                    setTemplateForm({
                      name: '',
                      connector: 'jira',
                      metricType: 'ratio',
                      queryTestsTemplate: '',
                      queryStoriesTemplate: '',
                      formulaTemplate: 'tests / stories',
                      schedule: '',
                      authProfileId: '',
                      enabled: true,
                    })
                    setShowTemplateModal(true)
                  }}
                >
                  Nueva plantilla
                </button>
              )}
              {activeIntegrationTab === 'targets' && (
                <button
                  className="btn-primary"
                  onClick={() => {
                    if (!selectedTemplateId) return
                    setEditingTarget(null)
                    setTargetForm({
                      templateId: String(selectedTemplateId),
                      scopeType: 'area',
                      scopeId: '',
                      orgScopeId: '',
                      paramsText: '',
                      assignmentId: '',
                      enabled: true,
                    })
                    setShowTargetModal(true)
                  }}
                  disabled={!selectedTemplateId}
                >
                  Nuevo target
                </button>
              )}
              {activeIntegrationTab === 'auth' && (
                <button
                  className="btn-primary"
                  onClick={() => {
                    setEditingAuth(null)
                    setAuthForm({
                      name: '',
                      connector: 'jira',
                      endpoint: '',
                      authType: 'none',
                      authConfig: {
                        username: '',
                        password: '',
                        token: '',
                        apiKey: '',
                        header: '',
                      },
                    })
                    setShowAuthModal(true)
                  }}
                >
                  Nuevo auth profile
                </button>
              )}
            </div>
          </div>

          <div className="tabs">
            {['templates', 'targets', 'runs', 'auth'].map((tab) => (
              <button
                key={tab}
                className={`tab-button ${activeIntegrationTab === tab ? 'active' : ''}`}
                onClick={() => setActiveIntegrationTab(tab as any)}
              >
                {tab === 'templates' ? 'Plantillas' : tab === 'targets' ? 'Targets' : tab === 'runs' ? 'Runs' : 'Auth'}
              </button>
            ))}
          </div>

          {activeIntegrationTab !== 'templates' && (
            <div className="form-group">
              <label>Plantilla</label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Selecciona una plantilla</option>
                {templates?.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeIntegrationTab === 'templates' && (
            <table className="config-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Connector</th>
                  <th>Metrica</th>
                  <th>Auth</th>
                  <th>Frecuencia</th>
                  <th>Plantilla</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {templates?.map((template) => (
                  <tr key={template.id}>
                    <td>{template.name}</td>
                    <td>{template.connector}</td>
                    <td>{template.metricType === 'count' ? 'Count' : 'Ratio'}</td>
                    <td>{template.authProfileName || '-'}</td>
                    <td>{template.schedule || '-'}</td>
                    <td>
                      {template.isSpecific ? (
                        <span className="status-pill review">Especifica</span>
                      ) : (
                        <span className="status-pill ok">Generica</span>
                      )}
                    </td>
                    <td>
                      <span className={`status-pill ${template.enabled ? 'ok' : 'review'}`}>
                        {template.enabled ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            setEditingTemplate(template)
                            setTemplateForm({
                              name: template.name || '',
                              connector: template.connector || 'jira',
                              metricType: template.metricType === 'count' ? 'count' : 'ratio',
                              queryTestsTemplate: template.queryTestsTemplate || '',
                              queryStoriesTemplate: template.queryStoriesTemplate || '',
                              formulaTemplate:
                                template.formulaTemplate || (template.metricType === 'count' ? 'tests' : 'tests / stories'),
                              schedule: template.schedule || '',
                              authProfileId: template.authProfileId ? String(template.authProfileId) : '',
                              enabled: Boolean(template.enabled),
                            })
                            setShowTemplateModal(true)
                          }}
                        >
                          Editar
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            setSelectedTemplateId(template.id)
                            runTemplate.mutate(template.id)
                          }}
                          disabled={!canRunIntegrations || runTemplate.isLoading}
                        >
                          Ejecutar
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            setSelectedTemplateId(template.id)
                            setActiveIntegrationTab('targets')
                          }}
                        >
                          Targets
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            setSelectedTemplateId(template.id)
                            setActiveIntegrationTab('runs')
                          }}
                        >
                          Runs
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!templates || templates.length === 0) && (
                  <tr>
                    <td colSpan={8} className="empty-row">
                      No hay plantillas configuradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activeIntegrationTab === 'targets' && (
            <table className="config-table">
              <thead>
                <tr>
                  <th>Scope</th>
                  <th>Asignación</th>
                  <th>Enabled</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {targets?.map((target) => (
                  <tr key={target.id}>
                    <td>
                      {target.orgScopeName
                        ? `${target.orgScopeType || target.scopeType} · ${target.orgScopeName}`
                        : `${target.scopeType} · ${target.scopeId}`}
                    </td>
                    <td>{target.assignmentId || '-'}</td>
                    <td>
                      <span className={`status-pill ${target.enabled ? 'ok' : 'review'}`}>
                        {target.enabled ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            setEditingTarget(target)
                            setTargetForm({
                              templateId: String(target.templateId),
                              scopeType: target.scopeType,
                              scopeId: target.scopeId,
                              orgScopeId: target.orgScopeId ? String(target.orgScopeId) : '',
                              paramsText: target.params ? JSON.stringify(target.params, null, 2) : '',
                              assignmentId: target.assignmentId ? String(target.assignmentId) : '',
                              enabled: Boolean(target.enabled),
                            })
                            setShowTargetModal(true)
                          }}
                        >
                          Editar
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => runTarget.mutate(target)}
                          disabled={!canRunIntegrations || runTarget.isLoading}
                        >
                          Ejecutar
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            setTargetPreviewTarget(target)
                            setTargetPreviewResult(null)
                            setTargetPreviewMessage('')
                            setShowTargetPreview(true)
                            testTarget.mutate(target)
                          }}
                          disabled={testTarget.isLoading}
                        >
                          Probar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!targets || targets.length === 0) && (
                  <tr>
                    <td colSpan={4} className="empty-row">
                      No hay targets configurados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activeIntegrationTab === 'runs' && (
            <table className="config-table">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Inicio</th>
                  <th>Usuario</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {templateRuns?.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <span className={`status-pill ${run.status === 'success' ? 'ok' : 'review'}`}>
                        {run.status}
                      </span>
                    </td>
                    <td>{run.startedAt || '-'}</td>
                    <td>{run.triggeredByName || '-'}</td>
                    <td>{run.outputs?.computed ?? '-'}</td>
                  </tr>
                ))}
                {(!templateRuns || templateRuns.length === 0) && (
                  <tr>
                    <td colSpan={4} className="empty-row">
                      No hay ejecuciones registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activeIntegrationTab === 'auth' && (
            <table className="config-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Connector</th>
                  <th>Endpoint</th>
                  <th>Auth</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {authProfiles?.map((profile) => (
                  <tr key={profile.id}>
                    <td>{profile.name}</td>
                    <td>{profile.connector}</td>
                    <td>{profile.endpoint || '-'}</td>
                    <td>{profile.authType || 'none'}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            setEditingAuth(profile)
                            setAuthForm({
                              name: profile.name,
                              connector: profile.connector || 'jira',
                              endpoint: profile.endpoint || '',
                              authType: profile.authType || 'none',
                              authConfig: profile.authConfig || {
                                username: '',
                                password: '',
                                token: '',
                                apiKey: '',
                                header: '',
                              },
                            })
                            setShowAuthModal(true)
                          }}
                        >
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!authProfiles || authProfiles.length === 0) && (
                  <tr>
                    <td colSpan={5} className="empty-row">
                      No hay auth profiles configurados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="config-section">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Org Scopes</h3>
              <p className="muted">Jerarquía de áreas, equipos y personas con herencia.</p>
            </div>
            <button
              className="btn-primary"
              onClick={() => {
                setEditingScope(null)
                setScopeForm({
                  name: '',
                  type: 'area',
                  parentId: '',
                  metadataText: '',
                  active: true,
                })
                setShowScopeModal(true)
              }}
            >
              Nuevo scope
            </button>
          </div>
          <table className="config-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Parent</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {orgScopes?.map((scope) => (
                <tr key={scope.id}>
                  <td>{scope.name}</td>
                  <td>{scope.type}</td>
                  <td>{scope.parentId || '-'}</td>
                  <td>
                    <span className={`status-pill ${scope.active ? 'ok' : 'review'}`}>
                      {scope.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          setEditingScope(scope)
                          setScopeForm({
                            name: scope.name || '',
                            type: scope.type || 'area',
                            parentId: scope.parentId ? String(scope.parentId) : '',
                            metadataText: scope.metadata ? JSON.stringify(scope.metadata, null, 2) : '',
                            active: Boolean(scope.active),
                          })
                          setShowScopeModal(true)
                        }}
                      >
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(!orgScopes || orgScopes.length === 0) && (
                <tr>
                  <td colSpan={5} className="empty-row">
                    No hay scopes configurados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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

      <div className="config-section">
        <div className="card">
          <h3>Roles &amp; Acceso</h3>
          <div className="roles-grid">
            {roles?.map((role) => (
              <div key={role.code} className="role-card">
                <div className="role-card-header">
                  <span className="role-name">{role.name}</span>
                  <span className="role-count">{role.usersCount || 0} usuarios</span>
                </div>
                <div className="role-perms">
                  {role.permissions?.map((perm: string) => (
                    <span key={perm} className="perm-chip">
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Usuarios y roles</h3>
          <div className="roles-users-list">
            {collaborators?.map((collab) => (
              <div key={collab.id} className="role-user-row">
                <div>
                  <div className="item-title">{collab.name}</div>
                  <div className="item-sub">{collab.area} · {collab.role}</div>
                </div>
                <select
                  value=""
                  onChange={(e) => {
                    const roleCode = e.target.value
                    if (roleCode) {
                      assignRole.mutate({ collaboratorId: collab.id, roleCode })
                      e.currentTarget.value = ''
                    }
                  }}
                >
                  <option value="">Asignar rol…</option>
                  {roles?.map((role) => (
                    <option key={role.code} value={role.code}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showTemplateModal && (
        <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingTemplate ? 'Editar plantilla' : 'Nueva plantilla'}</h2>
              <button className="close-button" onClick={() => setShowTemplateModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Nombre</label>
                  <input
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Connector</label>
                  <select
                    value={templateForm.connector}
                    onChange={(e) => setTemplateForm((prev) => ({ ...prev, connector: e.target.value }))}
                  >
                    <option value="jira">Jira</option>
                    <option value="xray">Xray</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Tipo de metrica</label>
                  <select
                    value={templateForm.metricType}
                    onChange={(e) =>
                      setTemplateForm((prev) => {
                        const nextMetricType = e.target.value === 'count' ? 'count' : 'ratio'
                        return {
                          ...prev,
                          metricType: nextMetricType,
                          formulaTemplate: nextMetricType === 'count' ? 'tests' : prev.formulaTemplate || 'tests / stories',
                        }
                      })
                    }
                  >
                    <option value="ratio">Ratio (A / B)</option>
                    <option value="count">Count (solo A)</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Auth Profile</label>
                <select
                  value={templateForm.authProfileId}
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, authProfileId: e.target.value }))}
                >
                  <option value="">Selecciona un auth profile</option>
                  {authProfiles?.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>JQL Tests (template)</label>
                <textarea
                  rows={3}
                  value={templateForm.queryTestsTemplate}
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, queryTestsTemplate: e.target.value }))}
                />
                <div className="helper-text">
                  Ejemplo: project IN ({'{projects}'}) AND issuetype = {'{issueTypeTest}'} AND {'{testerField}'} IN ({'{users}'}) AND updated
                  {' >= '} {'{from}'} AND updated {' < '} {'{to}'}
                </div>
              </div>
              {templateForm.metricType === 'ratio' && (
                <div className="form-group">
                  <label>JQL Historias (template)</label>
                  <textarea
                    rows={3}
                    value={templateForm.queryStoriesTemplate}
                    onChange={(e) => setTemplateForm((prev) => ({ ...prev, queryStoriesTemplate: e.target.value }))}
                  />
                  <div className="helper-text">
                    Ejemplo: project IN ({'{projects}'}) AND issuetype IN ({'{issueTypeStory}'}) AND statusCategory = Done AND
                    statusCategoryChangedDate {' >= '} {'{from}'} AND statusCategoryChangedDate {' < '} {'{to}'} AND {'{testerField}'} IN ({'{users}'})
                  </div>
                </div>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label>Fórmula</label>
                  <input
                    value={templateForm.formulaTemplate}
                    onChange={(e) => setTemplateForm((prev) => ({ ...prev, formulaTemplate: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Frecuencia / Cron</label>
                  <input
                    value={templateForm.schedule}
                    onChange={(e) => setTemplateForm((prev) => ({ ...prev, schedule: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Estado</label>
                <select
                  value={templateForm.enabled ? '1' : '0'}
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, enabled: e.target.value === '1' }))}
                >
                  <option value="1">Activa</option>
                  <option value="0">Inactiva</option>
                </select>
              </div>
              {!hasAnyPlaceholders ? (
                <div className="form-error">
                  Esta plantilla parece especifica. Se recomienda usar placeholders (ej: {'{projects}'}, {'{users}'}, {'{from}'}, {'{to}'}).
                </div>
              ) : null}
              {missingTimePlaceholders ? (
                <div className="form-error">Recomendacion: incluir {'{from}'} y {'{to}'} para filtrar por periodo.</div>
              ) : null}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowTemplateModal(false)}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={() => saveTemplate.mutate()}
                disabled={!templateForm.name.trim() || saveTemplate.isLoading}
              >
                {saveTemplate.isLoading ? 'Guardando...' : 'Guardar plantilla'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTargetModal && (
        <div className="modal-overlay" onClick={() => setShowTargetModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingTarget ? 'Editar target' : 'Nuevo target'}</h2>
              <button className="close-button" onClick={() => setShowTargetModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Template</label>
                  <select
                    value={targetForm.templateId || String(selectedTemplateId)}
                    onChange={(e) => setTargetForm((prev) => ({ ...prev, templateId: e.target.value }))}
                  >
                    <option value="">Selecciona una plantilla</option>
                    {templates?.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Scope</label>
                  <select
                    value={targetForm.scopeType}
                    onChange={(e) => setTargetForm((prev) => ({ ...prev, scopeType: e.target.value }))}
                  >
                    <option value="area">Área</option>
                    <option value="team">Equipo</option>
                    <option value="person">Persona</option>
                    <option value="product">Producto</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Org Scope</label>
                  <select
                    value={targetForm.orgScopeId}
                    onChange={(e) => {
                      const value = e.target.value
                      const scope = orgScopes?.find((item) => item.id === Number(value))
                      setTargetForm((prev) => ({
                        ...prev,
                        orgScopeId: value,
                        scopeType: scope?.type || prev.scopeType,
                        scopeId: scope?.name || prev.scopeId,
                      }))
                    }}
                  >
                    <option value="">Selecciona un scope</option>
                    {orgScopes?.map((scope) => (
                      <option key={scope.id} value={scope.id}>
                        {scope.type} · {scope.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Scope ID</label>
                  <input
                    value={targetForm.scopeId}
                    onChange={(e) => setTargetForm((prev) => ({ ...prev, scopeId: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Asignación destino</label>
                  <select
                    value={targetForm.assignmentId}
                    onChange={(e) => setTargetForm((prev) => ({ ...prev, assignmentId: e.target.value }))}
                  >
                    <option value="">Selecciona una asignación</option>
                    {assignments?.map((assignment: any) => (
                      <option key={assignment.id} value={assignment.id}>
                        {assignment.collaboratorName || `Colaborador #${assignment.collaboratorId}`} ·{' '}
                        {assignment.kpiName || `KPI #${assignment.kpiId}`} ·{' '}
                        {assignment.periodName || `Período #${assignment.periodId}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Params (JSON)</label>
                <textarea
                  rows={5}
                  value={targetForm.paramsText}
                  onChange={(e) => setTargetForm((prev) => ({ ...prev, paramsText: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Estado</label>
                <select
                  value={targetForm.enabled ? '1' : '0'}
                  onChange={(e) => setTargetForm((prev) => ({ ...prev, enabled: e.target.value === '1' }))}
                >
                  <option value="1">Activo</option>
                  <option value="0">Inactivo</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowTargetModal(false)}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={() => saveTarget.mutate()}
                disabled={!targetForm.scopeId.trim() || saveTarget.isLoading}
              >
                {saveTarget.isLoading ? 'Guardando...' : 'Guardar target'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAuthModal && (
        <div className="modal-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingAuth ? 'Editar auth profile' : 'Nuevo auth profile'}</h2>
              <button className="close-button" onClick={() => setShowAuthModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Nombre</label>
                  <input
                    value={authForm.name}
                    onChange={(e) => setAuthForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Connector</label>
                  <select
                    value={authForm.connector}
                    onChange={(e) => setAuthForm((prev) => ({ ...prev, connector: e.target.value }))}
                  >
                    <option value="jira">Jira</option>
                    <option value="xray">Xray</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Endpoint</label>
                <input
                  value={authForm.endpoint}
                  onChange={(e) => setAuthForm((prev) => ({ ...prev, endpoint: e.target.value }))}
                  placeholder="https://umsa.atlassian.net"
                />
              </div>
              <div className="form-group">
                <label>Auth Type</label>
                <select
                  value={authForm.authType}
                  onChange={(e) => setAuthForm((prev) => ({ ...prev, authType: e.target.value }))}
                >
                  <option value="none">Sin auth</option>
                  <option value="basic">Basic</option>
                  <option value="bearer">Bearer</option>
                  <option value="apiKey">API Key</option>
                </select>
              </div>
              {authForm.authType === 'basic' && (
                <div className="form-row">
                  <div className="form-group">
                    <label>Usuario</label>
                    <input
                      value={authForm.authConfig.username}
                      onChange={(e) =>
                        setAuthForm((prev) => ({
                          ...prev,
                          authConfig: { ...prev.authConfig, username: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Password</label>
                    <input
                      type="password"
                      value={authForm.authConfig.password}
                      onChange={(e) =>
                        setAuthForm((prev) => ({
                          ...prev,
                          authConfig: { ...prev.authConfig, password: e.target.value },
                        }))
                      }
                    />
                  </div>
                </div>
              )}
              {authForm.authType === 'bearer' && (
                <div className="form-group">
                  <label>Token</label>
                  <input
                    value={authForm.authConfig.token}
                    onChange={(e) =>
                      setAuthForm((prev) => ({
                        ...prev,
                        authConfig: { ...prev.authConfig, token: e.target.value },
                      }))
                    }
                  />
                </div>
              )}
              {authForm.authType === 'apiKey' && (
                <div className="form-row">
                  <div className="form-group">
                    <label>API Key</label>
                    <input
                      value={authForm.authConfig.apiKey}
                      onChange={(e) =>
                        setAuthForm((prev) => ({
                          ...prev,
                          authConfig: { ...prev.authConfig, apiKey: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Header</label>
                    <input
                      value={authForm.authConfig.header}
                      onChange={(e) =>
                        setAuthForm((prev) => ({
                          ...prev,
                          authConfig: { ...prev.authConfig, header: e.target.value },
                        }))
                      }
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowAuthModal(false)}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={() => saveAuthProfile.mutate()}
                disabled={!authForm.name.trim() || saveAuthProfile.isLoading}
              >
                {saveAuthProfile.isLoading ? 'Guardando...' : 'Guardar auth profile'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTargetPreview && (
        <div className="modal-overlay" onClick={() => setShowTargetPreview(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Preview de target</h2>
              <button className="close-button" onClick={() => setShowTargetPreview(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <div className="muted">
                  {targetPreviewTarget?.orgScopeName
                    ? `${targetPreviewTarget.orgScopeType || targetPreviewTarget.scopeType} · ${targetPreviewTarget.orgScopeName}`
                    : `${targetPreviewTarget?.scopeType || ''} · ${targetPreviewTarget?.scopeId || ''}`}
                </div>
              </div>
              {targetPreviewMessage ? <div className="form-error">{targetPreviewMessage}</div> : null}
              {targetPreviewResult ? (
                <div className="preview-box">
                  <div className="muted">
                    Tests: {targetPreviewResult.testsTotal} · Stories: {targetPreviewResult.storiesTotal} · Valor:{' '}
                    {targetPreviewResult.computed}
                  </div>
                  <div className="muted">
                    Rango: {targetPreviewResult.from} → {targetPreviewResult.to}
                  </div>
                  {targetPreviewResult.warnings?.length ? (
                    <div className="form-error">{targetPreviewResult.warnings.join(' · ')}</div>
                  ) : null}
                  <div className="preview-jql">
                    <strong>JQL Tests</strong>
                    <pre>{targetPreviewResult.testsJql}</pre>
                  </div>
                  <div className="preview-jql">
                    <strong>JQL Historias</strong>
                    <pre>{targetPreviewResult.storiesJql}</pre>
                  </div>
                </div>
              ) : (
                <div className="muted">Probando target…</div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowTargetPreview(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {showScopeModal && (
        <div className="modal-overlay" onClick={() => setShowScopeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingScope ? 'Editar scope' : 'Nuevo scope'}</h2>
              <button className="close-button" onClick={() => setShowScopeModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Nombre</label>
                  <input
                    value={scopeForm.name}
                    onChange={(e) => setScopeForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Tipo</label>
                  <select
                    value={scopeForm.type}
                    onChange={(e) => setScopeForm((prev) => ({ ...prev, type: e.target.value }))}
                  >
                    <option value="company">Company</option>
                    <option value="area">Área</option>
                    <option value="team">Equipo</option>
                    <option value="person">Persona</option>
                    <option value="product">Producto</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Parent</label>
                <select
                  value={scopeForm.parentId}
                  onChange={(e) => setScopeForm((prev) => ({ ...prev, parentId: e.target.value }))}
                >
                  <option value="">Sin parent</option>
                  {orgScopes?.map((scope) => (
                    <option key={scope.id} value={scope.id}>
                      {scope.type} · {scope.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Metadata (JSON)</label>
                <textarea
                  rows={5}
                  value={scopeForm.metadataText}
                  onChange={(e) => setScopeForm((prev) => ({ ...prev, metadataText: e.target.value }))}
                  placeholder='{"projects":["GT_MISIM"],"authProfileId":1}'
                />
              </div>
              <div className="form-group">
                <label>Activo</label>
                <select
                  value={scopeForm.active ? '1' : '0'}
                  onChange={(e) => setScopeForm((prev) => ({ ...prev, active: e.target.value === '1' }))}
                >
                  <option value="1">Activo</option>
                  <option value="0">Inactivo</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowScopeModal(false)}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={() => saveScope.mutate()}
                disabled={!scopeForm.name.trim() || saveScope.isLoading}
              >
                {saveScope.isLoading ? 'Guardando...' : 'Guardar scope'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

