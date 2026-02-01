import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import SubPeriodForm from '../components/SubPeriodForm'
import './Configuracion.css'

type Permission = { id: number; code: string; description?: string }

type Collaborator = {
  id: number
  name: string
  area: string
  role: string
  hasSuperpowers?: boolean
  orgScopeId?: number | null
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
  metricTypeUi?: 'count' | 'ratio' | 'sla' | 'value' | 'value_agg' | 'manual'
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
  archived?: number
}

type CalendarProfile = {
  id: number
  name: string
  description?: string | null
  frequency: 'monthly' | 'quarterly' | 'custom'
  active?: boolean
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
  const [showCalendarModal, setShowCalendarModal] = useState(false)
  const [editingCalendar, setEditingCalendar] = useState<CalendarProfile | null>(null)
  const [showCalendarSubperiods, setShowCalendarSubperiods] = useState(false)
  const [calendarForSubperiods, setCalendarForSubperiods] = useState<CalendarProfile | null>(null)
  const [selectedPeriodForCalendar, setSelectedPeriodForCalendar] = useState<number | ''>('')
  const [editingCalendarSubperiod, setEditingCalendarSubperiod] = useState<any | null | undefined>(undefined)
  const [showScopeModal, setShowScopeModal] = useState(false)
  const [editingScope, setEditingScope] = useState<any | null>(null)
  const [showTargetWizard, setShowTargetWizard] = useState(false)
  const [wizardTarget, setWizardTarget] = useState<IntegrationTarget | null>(null)
  const [wizardRows, setWizardRows] = useState<Array<{ userKey: string; collaboratorId: string; assignmentId: string }>>(
    []
  )
  const [rawJqlInput, setRawJqlInput] = useState('')
  const [showTargetPreview, setShowTargetPreview] = useState(false)
  const [targetPreviewTarget, setTargetPreviewTarget] = useState<IntegrationTarget | null>(null)
  const [targetPreviewResult, setTargetPreviewResult] = useState<any>(null)
  const [targetPreviewMessage, setTargetPreviewMessage] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [templateFormError, setTemplateFormError] = useState('')
  const [cronPreview, setCronPreview] = useState('')
  const [templateForm, setTemplateForm] = useState({
    name: '',
    connector: 'jira',
    metricType: 'ratio' as 'count' | 'ratio' | 'sla' | 'value' | 'value_agg' | 'manual',
    queryTestsTemplate: '',
    queryStoriesTemplate: '',
    formulaTemplate: 'A / B',
    schedule: '',
    authProfileId: '',
    enabled: true,
  })
  const metricTypeToBackend = (metricType: string) => {
    if (metricType === 'ratio' || metricType === 'sla') return 'ratio'
    return 'count'
  }

  const metricTypeLabel = (metricType?: string) => {
    switch (metricType) {
      case 'count':
        return 'COUNT'
      case 'ratio':
        return 'RATIO'
      case 'sla':
        return 'SLA'
      case 'value':
        return 'VALUE'
      case 'value_agg':
        return 'VALUE_AGG'
      case 'manual':
        return 'MANUAL'
      default:
        return metricType === 'count' ? 'COUNT' : 'RATIO'
    }
  }

  const applyTemplatePreset = (preset: 'count' | 'ratio' | 'sla' | 'sheets_value' | 'sheets_agg' | 'manual') => {
    if (preset === 'count') {
      setTemplateForm({
        name: 'Jira – COUNT (Generic)',
        connector: 'jira',
        metricType: 'count',
        queryTestsTemplate:
          'project IN ({projects})\nAND issuetype IN ({issueTypesA})\nAND {dateFieldA} >= {from}\nAND {dateFieldA} < {to}\n{extraJqlA}',
        queryStoriesTemplate: '',
        formulaTemplate: 'A',
        schedule: '',
        authProfileId: templateForm.authProfileId,
        enabled: true,
      })
      return
    }
    if (preset === 'ratio') {
      setTemplateForm({
        name: 'Jira – RATIO A/B (Generic)',
        connector: 'jira',
        metricType: 'ratio',
        queryTestsTemplate:
          'project IN ({projects})\nAND issuetype IN ({issueTypesA})\nAND {dateFieldA} >= {from}\nAND {dateFieldA} < {to}\n{extraJqlA}',
        queryStoriesTemplate:
          'project IN ({projects})\nAND issuetype IN ({issueTypesB})\nAND {dateFieldB} >= {from}\nAND {dateFieldB} < {to}\n{extraJqlB}',
        formulaTemplate: 'A / B',
        schedule: '',
        authProfileId: templateForm.authProfileId,
        enabled: true,
      })
      return
    }
    if (preset === 'sla') {
      setTemplateForm({
        name: 'Jira – SLA (On-time / Total)',
        connector: 'jira',
        metricType: 'sla',
        queryTestsTemplate:
          'project IN ({projects})\nAND issuetype IN ({issueTypesA})\nAND statusCategory = Done\nAND {dateFieldEnd} >= {from}\nAND {dateFieldEnd} < {to}\nAND {dateFieldEnd} <= {dateFieldLimit}\n{extraJqlA}',
        queryStoriesTemplate:
          'project IN ({projects})\nAND issuetype IN ({issueTypesB})\nAND statusCategory = Done\nAND {dateFieldEnd} >= {from}\nAND {dateFieldEnd} < {to}\n{extraJqlB}',
        formulaTemplate: 'A / B',
        schedule: '',
        authProfileId: templateForm.authProfileId,
        enabled: true,
      })
      return
    }
    if (preset === 'sheets_value') {
      setTemplateForm({
        name: 'Sheets – VALUE (Direct)',
        connector: 'sheets',
        metricType: 'value',
        queryTestsTemplate:
          'sheetKey={sheetKey}\n tab={tab}\n periodColumn={periodColumn}\n areaColumn={areaColumn}\n kpiColumn={kpiColumn}\n valueColumn={valueColumn}',
        queryStoriesTemplate: '',
        formulaTemplate: 'VALUE',
        schedule: '',
        authProfileId: templateForm.authProfileId,
        enabled: true,
      })
      return
    }
    if (preset === 'sheets_agg') {
      setTemplateForm({
        name: 'Sheets – AGG (SUM/AVG)',
        connector: 'sheets',
        metricType: 'value_agg',
        queryTestsTemplate:
          'sheetKey={sheetKey}\n tab={tab}\n aggregation={SUM|AVG}\n periodColumn={periodColumn}\n areaColumn={areaColumn}\n kpiColumn={kpiColumn}\n valueColumn={valueColumn}',
        queryStoriesTemplate: '',
        formulaTemplate: 'AGG',
        schedule: '',
        authProfileId: templateForm.authProfileId,
        enabled: true,
      })
      return
    }
    setTemplateForm({
      name: 'Manual / CSV – Measurement',
      connector: 'manual',
      metricType: 'manual',
      queryTestsTemplate: 'manual',
      queryStoriesTemplate: '',
      formulaTemplate: 'VALUE',
      schedule: '',
      authProfileId: '',
      enabled: true,
    })
  }
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
  const [calendarForm, setCalendarForm] = useState({
    name: '',
    description: '',
    frequency: 'monthly',
    active: true,
  })
  const [scopeForm, setScopeForm] = useState({
    name: '',
    type: 'area',
    parentId: '',
    calendarProfileId: '',
    metadataText: '',
    active: true,
  })
  const [targetFormError, setTargetFormError] = useState('')

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

  const { data: periods } = useQuery<any[]>('config-periods', async () => {
    const res = await api.get('/periods')
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

  const { data: calendarProfiles } = useQuery<CalendarProfile[]>('calendar-profiles', async () => {
    const res = await api.get('/calendar-profiles')
    return res.data
  })

  const { data: calendarSubperiods } = useQuery<any[]>(
    ['calendar-subperiods', selectedPeriodForCalendar, calendarForSubperiods?.id],
    async () => {
      if (!selectedPeriodForCalendar || !calendarForSubperiods?.id) return []
      const res = await api.get(`/periods/${selectedPeriodForCalendar}/sub-periods`, {
        params: { calendarProfileId: calendarForSubperiods.id },
      })
      return res.data
    },
    { enabled: !!selectedPeriodForCalendar && !!calendarForSubperiods?.id }
  )

  const deleteCalendarSubperiod = useMutation(
    async (subPeriod: any) => {
      await api.delete(`/sub-periods/${subPeriod.id}`)
      return subPeriod
    },
    {
      onSuccess: (_data, subPeriod) => {
        queryClient.invalidateQueries(['calendar-subperiods', subPeriod.periodId, calendarForSubperiods?.id])
      },
    }
  )

  const closeCalendarSubperiod = useMutation(
    async (subPeriod: any) => {
      const res = await api.post(`/sub-periods/${subPeriod.id}/close`)
      return { subPeriod, data: res.data }
    },
    {
      onSuccess: (result) => {
        const { subPeriod } = result || {}
        if (subPeriod) {
          queryClient.invalidateQueries(['calendar-subperiods', subPeriod.periodId, calendarForSubperiods?.id])
        }
      },
    }
  )

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

  const authProfilesByConnector = useMemo(() => {
    if (!authProfiles) return []
    if (!templateForm.connector) return authProfiles
    return authProfiles.filter((profile) => profile.connector === templateForm.connector)
  }, [authProfiles, templateForm.connector])

  const areaScopes = useMemo(() => {
    if (!orgScopes) return []
    return orgScopes.filter((scope) => scope.type === 'area')
  }, [orgScopes])

  const activeAreaScopes = useMemo(() => {
    return areaScopes.filter((scope) => scope.active !== 0 && scope.active !== false)
  }, [areaScopes])

  const scopeById = useMemo(() => {
    const map = new Map<number, any>()
    orgScopes?.forEach((scope) => map.set(scope.id, scope))
    return map
  }, [orgScopes])

  const assignmentsByCollaborator = useMemo(() => {
    const map = new Map<number, any[]>()
    assignments?.forEach((assignment) => {
      const key = Number(assignment.collaboratorId)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(assignment)
    })
    return map
  }, [assignments])

  const targetScopeKey = (target: IntegrationTarget) => {
    if (target.orgScopeId) return `org:${target.orgScopeId}`
    return `legacy:${target.scopeType}:${target.scopeId}`.toLowerCase()
  }

  const existingTargetScopeKeys = useMemo(() => {
    const keys = new Set<string>()
    targets?.forEach((target) => keys.add(targetScopeKey(target)))
    return keys
  }, [targets])

  const existingTargetUsers = useMemo(() => {
    const map = new Map<string, Set<string>>()
    targets?.forEach((target) => {
      if (!target.templateId || !target.params?.users) return
      const users = Array.isArray(target.params.users) ? target.params.users : [target.params.users]
      if (!users.length) return
      const key = String(target.templateId)
      if (!map.has(key)) {
        map.set(key, new Set())
      }
      const set = map.get(key)!
      users.forEach((user) => {
        if (user) {
          set.add(String(user))
        }
      })
    })
    return map
  }, [targets])

  const targetByScopeKey = useMemo(() => {
    const map = new Map<string, IntegrationTarget>()
    targets?.forEach((target) => map.set(targetScopeKey(target), target))
    return map
  }, [targets])

  const missingAreaScopes = useMemo(() => {
    return activeAreaScopes.filter((scope) => {
      const keyById = `org:${scope.id}`
      const keyByName = `legacy:area:${scope.name}`.toLowerCase()
      return !existingTargetScopeKeys.has(keyById) && !existingTargetScopeKeys.has(keyByName)
    })
  }, [activeAreaScopes, existingTargetScopeKeys])

  const authProfileHint = useMemo(() => {
    if (templateForm.connector === 'jira' || templateForm.connector === 'xray') {
      return 'Jira/Xray: usa email + API token (Basic) o Bearer token.'
    }
    if (templateForm.connector === 'sheets') {
      return 'Google Sheets: usa OAuth/Service Account (Bearer). Si la planilla es publica, podes dejar sin auth.'
    }
    if (templateForm.connector === 'manual') {
      return 'Manual/CSV no requiere auth profile.'
    }
    return ''
  }, [templateForm.connector])

  const convertJqlToParams = () => {
    const jql = rawJqlInput.trim()
    if (!jql) {
      setTargetFormError('Pega un JQL para convertir.')
      return
    }
    const normalized = jql.replace(/\s+/g, ' ').trim()
    const users: string[] = []
    const issueTypes: string[] = []
    let baseFilter = ''
    let dateField = ''
    let testerField = ''
    let extraJql = ''
    let period = 'previous_month'

    const projectMatch = normalized.match(/project\s+in\s*\(([^)]+)\)/i)
    if (projectMatch?.[1]) {
      baseFilter += `project IN (${projectMatch[1].trim()})`
    }

    const issueTypeMatch = normalized.match(/issuetype\s+in\s*\(([^)]+)\)/i)
    if (issueTypeMatch?.[1]) {
      issueTypes.push(...issueTypeMatch[1].split(',').map((v) => v.trim()).filter(Boolean))
    }
    const issueTypeEqMatch = normalized.match(/issuetype\s*=\s*([^\s)]+)/i)
    if (!issueTypes.length && issueTypeEqMatch?.[1]) {
      issueTypes.push(issueTypeEqMatch[1].trim())
    }

    const testerMatch = normalized.match(/"([^"]+)"\s+in\s*\(([^)]+)\)/i)
    if (testerMatch?.[1] && testerMatch?.[2]) {
      testerField = `"${testerMatch[1]}"`
      users.push(...testerMatch[2].split(',').map((v) => v.trim()).filter(Boolean))
    }

    const assigneeMatch = normalized.match(/assignee\s+in\s*\(([^)]+)\)/i)
    if (assigneeMatch?.[1] && !users.length) {
      testerField = 'assignee'
      users.push(...assigneeMatch[1].split(',').map((v) => v.trim()).filter(Boolean))
    }

    const reporterMatch = normalized.match(/reporter\s+in\s*\(([^)]+)\)/i)
    if (reporterMatch?.[1] && !users.length) {
      testerField = 'reporter'
      users.push(...reporterMatch[1].split(',').map((v) => v.trim()).filter(Boolean))
    }

    const dateFieldMatch = normalized.match(
      /(statusCategoryChangedDate|updated|created|resolutionDate)\s*>=/i
    )
    if (dateFieldMatch?.[1]) {
      dateField = dateFieldMatch[1]
    }

    const extraParts: string[] = []
    const statusCategoryMatch = normalized.match(/statusCategory\s*=\s*([A-Za-z]+)/i)
    if (statusCategoryMatch?.[1]) {
      extraParts.push(`AND statusCategory = ${statusCategoryMatch[1]}`)
    }
    if (!baseFilter) {
      const projectEqMatch = normalized.match(/project\s*=\s*([^\s)]+)/i)
      if (projectEqMatch?.[1]) {
        baseFilter = `project = ${projectEqMatch[1].trim()}`
      }
    }

    extraJql = extraParts.join(' ')

    const dateRangeMatch = normalized.match(
      /(statusCategoryChangedDate|updated|created|resolutionDate)\s*>=\s*\"?([0-9]{4}-[0-9]{2}-[0-9]{2})\"?\s*AND\s*\1\s*<\s*\"?([0-9]{4}-[0-9]{2}-[0-9]{2})\"?/i
    )
    if (dateRangeMatch?.[2] && dateRangeMatch?.[3]) {
      const fromDate = new Date(dateRangeMatch[2])
      const toDate = new Date(dateRangeMatch[3])
      const now = new Date()
      const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      if (
        fromDate.getTime() === startOfPrevMonth.getTime() &&
        toDate.getTime() === startOfThisMonth.getTime()
      ) {
        period = 'previous_month'
      } else if (
        fromDate.getTime() === startOfThisMonth.getTime() &&
        toDate.getTime() === startOfNextMonth.getTime()
      ) {
        period = 'current_month'
      } else {
        period = 'custom'
      }
    }

    const params = {
      baseFilter: baseFilter || 'project IN (...)',
      issueTypes: issueTypes.length ? issueTypes : ['Historia'],
      dateField: dateField || 'statusCategoryChangedDate',
      testerField: testerField || '"Tester[User Picker (single user)]"',
      users: users.length ? users : ['userId'],
      extraJqlA: extraJql || undefined,
      period,
    }

    setTargetForm((prev) => ({
      ...prev,
      paramsText: JSON.stringify(params, null, 2),
    }))
    setTargetFormError('')
  }

  useEffect(() => {
    if (!templateForm.schedule.trim()) {
      setCronPreview('')
      return
    }
    const value = templateForm.schedule.trim()
    const res = api
      .get('/integrations/cron/next', { params: { expression: value } })
      .then((resp) => setCronPreview(resp.data?.nextRun || ''))
      .catch(() => setCronPreview(''))
    return () => {
      void res
    }
  }, [templateForm.schedule])

  const parsedTargetParams = useMemo(() => {
    if (!targetForm.paramsText.trim()) return null
    try {
      return JSON.parse(targetForm.paramsText)
    } catch {
      return null
    }
  }, [targetForm.paramsText])

  const targetUsersCount = useMemo(() => {
    if (!parsedTargetParams) return 0
    const users = (parsedTargetParams as any).users
    if (Array.isArray(users)) return users.length
    if (users) return 1
    return 0
  }, [parsedTargetParams])

  const targetAssignmentBlocked = Boolean(targetForm.assignmentId) && targetUsersCount > 1

  const targetPeriodPreview = useMemo(() => {
    const period = (parsedTargetParams as any)?.period || 'previous_month'
    const now = new Date()
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    let from = startOfThisMonth
    let to = startOfThisMonth
    if (period === 'previous_month') {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      to = startOfThisMonth
    } else if (period === 'current_month') {
      from = startOfThisMonth
      to = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    }
    return {
      period,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    }
  }, [parsedTargetParams])

  useEffect(() => {
    if (!templateForm.authProfileId) return
    const exists = authProfilesByConnector.some(
      (profile) => String(profile.id) === String(templateForm.authProfileId)
    )
    if (!exists) {
      setTemplateForm((prev) => ({ ...prev, authProfileId: '' }))
    }
  }, [authProfilesByConnector, templateForm.authProfileId])

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
      const resolvedMetricType = metricTypeToBackend(templateForm.metricType)
      const payload = {
        name: templateForm.name.trim(),
        connector: templateForm.connector,
        metricType: resolvedMetricType,
        metricTypeUi: templateForm.metricType,
        queryTestsTemplate: templateForm.queryTestsTemplate.trim(),
        queryStoriesTemplate:
          templateForm.metricType === 'ratio' || templateForm.metricType === 'sla'
            ? templateForm.queryStoriesTemplate.trim()
            : undefined,
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
        setTemplateFormError('')
                      setTemplateForm({
                        name: '',
                        connector: 'jira',
                        metricType: 'ratio',
                        queryTestsTemplate: '',
                        queryStoriesTemplate: '',
                        formulaTemplate: 'A / B',
                        schedule: '',
                        authProfileId: '',
                        enabled: true,
                      })
      },
      onError: (error: any) => {
        setTemplateFormError(error?.response?.data?.error || error?.message || 'Error al guardar plantilla')
      },
    }
  )

  const saveTarget = useMutation(
    async () => {
      let parsedParams: any = {}
      if (targetForm.paramsText.trim()) {
        parsedParams = JSON.parse(targetForm.paramsText)
      }
      const usersCount = Array.isArray(parsedParams?.users)
        ? parsedParams.users.length
        : parsedParams?.users
        ? 1
        : 0
      if (targetForm.assignmentId && usersCount > 1) {
        throw new Error(
          'Target con multiples users no puede asignarse a un KPI individual. Usa un target por persona o quita la asignacion.'
        )
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
        setTargetFormError('')
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
      onError: (error: any) => {
        setTargetFormError(error?.message || 'Error al guardar target')
      },
    }
  )

  const createTargetsForScopes = useMutation(
    async (scopes: any[]) => {
      const templateId = Number(selectedTemplateId)
      if (!templateId) return { created: 0, skipped: 0 }
      const results = await Promise.all(
        scopes.map(async (scope) => {
          const payload = {
            templateId,
            scopeType: scope.type || 'area',
            scopeId: scope.name || '',
            orgScopeId: scope.id,
            params: {},
            enabled: true,
          }
          await api.post('/integrations/targets', payload)
          return scope
        })
      )
      return { created: results.length, skipped: 0 }
    },
    {
      onSuccess: (summary: any) => {
        queryClient.invalidateQueries(['integration-targets', selectedTemplateId])
        const created = summary?.created || 0
        const skipped = summary?.skipped || 0
        setToastMessage(`Targets creados: ${created}${skipped ? ` · ya existian: ${skipped}` : ''}`)
        setTimeout(() => setToastMessage(''), 2500)
      },
    }
  )

  const createTargetsAllAreas = async () => {
    if (!selectedTemplateId) return
    const toCreate: any[] = []
    const toEnable: IntegrationTarget[] = []
    activeAreaScopes.forEach((scope) => {
      const keyById = `org:${scope.id}`
      const keyByName = `legacy:area:${scope.name}`.toLowerCase()
      const existing = targetByScopeKey.get(keyById) || targetByScopeKey.get(keyByName)
      if (!existing) {
        toCreate.push(scope)
      } else if (!existing.enabled) {
        toEnable.push(existing)
      }
    })
    if (toCreate.length === 0 && toEnable.length === 0) {
      setToastMessage('No hay cambios para aplicar.')
      setTimeout(() => setToastMessage(''), 2500)
      return
    }
    if (toCreate.length > 0) {
      createTargetsForScopes.mutate(toCreate)
    }
    if (toEnable.length > 0) {
      await Promise.all(
        toEnable.map(async (target) => {
          await api.put(`/integrations/targets/${target.id}`, {
            templateId: target.templateId,
            scopeType: target.scopeType,
            scopeId: target.scopeId,
            orgScopeId: target.orgScopeId,
            params: target.params || {},
            assignmentId: target.assignmentId || undefined,
            enabled: true,
          })
        })
      )
      queryClient.invalidateQueries(['integration-targets', selectedTemplateId])
      setToastMessage(`Targets habilitados: ${toEnable.length}`)
      setTimeout(() => setToastMessage(''), 2500)
    }
  }

  const openTargetWizard = (target: IntegrationTarget) => {
    if (!target.params?.users || !Array.isArray(target.params.users)) {
      setToastMessage('El target no tiene lista de users para duplicar.')
      setTimeout(() => setToastMessage(''), 2500)
      return
    }
    const users = target.params.users.filter((user: any) => user)
    if (users.length === 0) {
      setToastMessage('No hay users en params para duplicar.')
      setTimeout(() => setToastMessage(''), 2500)
      return
    }
    setWizardTarget(target)
    setWizardRows(
      users.map((userKey: string) => ({
        userKey,
        collaboratorId: '',
        assignmentId: '',
      }))
    )
    setShowTargetWizard(true)
  }

  const createTargetsFromWizard = useMutation(
    async () => {
      if (!wizardTarget) return { created: 0, skipped: 0 }
      const existing = existingTargetUsers.get(String(wizardTarget.templateId)) || new Set<string>()
      let created = 0
      let skipped = 0
      for (const row of wizardRows) {
        if (!row.collaboratorId) {
          skipped += 1
          continue
        }
        const userKey = String(row.userKey)
        if (existing.has(userKey)) {
          skipped += 1
          continue
        }
        const collaborator = collaborators?.find((c) => String(c.id) === String(row.collaboratorId))
        const payload = {
          templateId: wizardTarget.templateId,
          scopeType: 'person',
          scopeId: collaborator?.name || userKey,
          orgScopeId: collaborator?.orgScopeId || undefined,
          params: { ...wizardTarget.params, users: [userKey] },
          assignmentId: row.assignmentId ? Number(row.assignmentId) : undefined,
          enabled: true,
        }
        await api.post('/integrations/targets', payload)
        created += 1
      }
      return { created, skipped }
    },
    {
      onSuccess: (summary: any) => {
        queryClient.invalidateQueries(['integration-targets', selectedTemplateId])
        const created = summary?.created || 0
        const skipped = summary?.skipped || 0
        setToastMessage(`Targets creados: ${created}${skipped ? ` · omitidos: ${skipped}` : ''}`)
        setTimeout(() => setToastMessage(''), 2500)
        setShowTargetWizard(false)
        setWizardTarget(null)
        setWizardRows([])
      },
      onError: (error: any) => {
        setToastMessage(error?.message || 'Error al crear targets')
        setTimeout(() => setToastMessage(''), 2500)
      },
    }
  )

  const duplicateTargetByUsers = useMutation(
    async (target: IntegrationTarget) => {
      if (!target.params?.users || !Array.isArray(target.params.users)) {
        throw new Error('El target no tiene lista de users para duplicar.')
      }
      const users = target.params.users.filter((user: any) => user)
      if (users.length <= 1) {
        throw new Error('Necesitas al menos 2 users para duplicar.')
      }
      const existing = existingTargetUsers.get(String(target.templateId)) || new Set<string>()
      let created = 0
      let skipped = 0
      await Promise.all(
        users.map(async (user: any) => {
          const userKey = String(user)
          if (existing.has(userKey)) {
            skipped += 1
            return
          }
          const payload = {
            templateId: target.templateId,
            scopeType: 'person',
            scopeId: userKey,
            orgScopeId: undefined,
            params: { ...target.params, users: [userKey] },
            assignmentId: undefined,
            enabled: true,
          }
          await api.post('/integrations/targets', payload)
          created += 1
        })
      )
      return { created, skipped }
    },
    {
      onSuccess: (summary: any) => {
        queryClient.invalidateQueries(['integration-targets', selectedTemplateId])
        const created = summary?.created || 0
        const skipped = summary?.skipped || 0
        setToastMessage(`Targets por usuario: ${created}${skipped ? ` · ya existian: ${skipped}` : ''}`)
        setTimeout(() => setToastMessage(''), 2500)
      },
      onError: (error: any) => {
        setToastMessage(error?.message || 'Error al duplicar targets')
        setTimeout(() => setToastMessage(''), 2500)
      },
    }
  )

  const createTargetsNewAreas = async () => {
    if (!selectedTemplateId) return
    if (missingAreaScopes.length === 0) {
      setToastMessage('No hay areas nuevas para crear targets.')
      setTimeout(() => setToastMessage(''), 2500)
      return
    }
    createTargetsForScopes.mutate(missingAreaScopes)
  }

  const deactivateInactiveAreaTargets = useMutation(
    async () => {
      const inactiveTargets =
        targets?.filter((target) => {
          if (!target.orgScopeId) return false
          const scope = scopeById.get(target.orgScopeId)
          return scope && (scope.active === 0 || scope.active === false) && target.enabled
        }) || []
      if (inactiveTargets.length === 0) return { updated: 0 }
      await Promise.all(
        inactiveTargets.map(async (target) => {
          await api.put(`/integrations/targets/${target.id}`, {
            templateId: target.templateId,
            scopeType: target.scopeType,
            scopeId: target.scopeId,
            orgScopeId: target.orgScopeId,
            params: target.params || {},
            assignmentId: target.assignmentId || undefined,
            enabled: false,
          })
        })
      )
      return { updated: inactiveTargets.length }
    },
    {
      onSuccess: (summary: any) => {
        queryClient.invalidateQueries(['integration-targets', selectedTemplateId])
        const updated = summary?.updated || 0
        setToastMessage(updated ? `Targets desactivados: ${updated}` : 'No hay targets para desactivar.')
        setTimeout(() => setToastMessage(''), 2500)
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

  const saveCalendarProfile = useMutation(
    async () => {
      const payload = {
        name: calendarForm.name.trim(),
        description: calendarForm.description.trim() || undefined,
        frequency: calendarForm.frequency,
        active: calendarForm.active,
      }
      if (editingCalendar) {
        await api.put(`/calendar-profiles/${editingCalendar.id}`, payload)
      } else {
        await api.post('/calendar-profiles', payload)
      }
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('calendar-profiles')
        setShowCalendarModal(false)
        setEditingCalendar(null)
        setCalendarForm({
          name: '',
          description: '',
          frequency: 'monthly',
          active: true,
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
        calendarProfileId: scopeForm.calendarProfileId ? Number(scopeForm.calendarProfileId) : undefined,
        metadata,
        active: scopeForm.active,
      }
      if (editingScope) {
        const res = await api.put(`/org-scopes/${editingScope.id}`, payload)
        return res.data
      } else {
        const res = await api.post('/org-scopes', payload)
        return res.data
      }
    },
    {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries('org-scopes')
        setShowScopeModal(false)
        setEditingScope(null)
        setScopeForm({
          name: '',
          type: 'area',
          parentId: '',
          calendarProfileId: '',
          metadataText: '',
          active: true,
        })
        if (data?.warning) {
          alert(data.warning)
        }
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
    templateForm.metricType === 'ratio' || templateForm.metricType === 'sla'
      ? templateForm.queryStoriesTemplate.match(placeholderRegex) || []
      : []
  const hasAnyPlaceholders = testsPlaceholders.length > 0 || storiesPlaceholders.length > 0
  const testsHasTime = testsPlaceholders.includes('{from}') || testsPlaceholders.includes('{to}')
  const storiesHasTime =
    templateForm.metricType === 'ratio' || templateForm.metricType === 'sla'
      ? storiesPlaceholders.includes('{from}') || storiesPlaceholders.includes('{to}')
      : true
  const missingTimePlaceholders = !testsHasTime || !storiesHasTime

  const containsLiteralIssueTypes = (text: string) => {
    const literalRegex = /\b(Story|Bug|Test|Epic|Historia|HU|Feature|Task|Incident|Problem)\b/i
    const statusRegex = /\bstatusCategory\s*=\s*Done\b/i
    const issuetypeRegex = /\bissuetype\s*(=|IN)\s*(?!\{)/i
    return literalRegex.test(text) || statusRegex.test(text) || issuetypeRegex.test(text)
  }

  const literalWarning =
    (templateForm.queryTestsTemplate && containsLiteralIssueTypes(templateForm.queryTestsTemplate)) ||
    (templateForm.queryStoriesTemplate && containsLiteralIssueTypes(templateForm.queryStoriesTemplate))

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

  const archiveRunMutation = useMutation(
    async (runId: number) => {
      await api.patch(`/integrations/runs/${runId}/archive`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['integration-template-runs', selectedTemplateId])
      },
    }
  )

  const deleteRunMutation = useMutation(
    async (runId: number) => {
      await api.delete(`/integrations/runs/${runId}`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['integration-template-runs', selectedTemplateId])
      },
    }
  )

  const archiveErrorRuns = useMutation(
    async () => {
      if (!selectedTemplateId) return
      await api.post('/integrations/runs/archive', {
        templateId: Number(selectedTemplateId),
        status: 'error',
      })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['integration-template-runs', selectedTemplateId])
      },
    }
  )

  const deleteErrorRuns = useMutation(
    async () => {
      if (!selectedTemplateId) return
      await api.post('/integrations/runs/delete', {
        templateId: Number(selectedTemplateId),
        status: 'error',
      })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['integration-template-runs', selectedTemplateId])
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
          formulaTemplate: 'A / B',
          schedule: '',
          authProfileId: '',
          enabled: true,
        })
                    setTemplateFormError('')
                    setShowTemplateModal(true)
                  }}
                >
                  Nueva plantilla
                </button>
              )}
              {activeIntegrationTab === 'targets' && (
                <>
                  <button
                    className="btn-secondary"
                    onClick={createTargetsAllAreas}
                    disabled={!selectedTemplateId || createTargetsForScopes.isLoading}
                  >
                    Crear targets (todas las areas)
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={createTargetsNewAreas}
                    disabled={!selectedTemplateId || createTargetsForScopes.isLoading}
                  >
                    Crear para areas nuevas
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => deactivateInactiveAreaTargets.mutate()}
                    disabled={!selectedTemplateId || deactivateInactiveAreaTargets.isLoading}
                  >
                    Desactivar areas inactivas
                  </button>
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
                      setTargetFormError('')
                      setShowTargetModal(true)
                    }}
                    disabled={!selectedTemplateId}
                  >
                    Nuevo target
                  </button>
                </>
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
              {activeIntegrationTab === 'runs' && (
                <>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      if (!selectedTemplateId) return
                      if (window.confirm('¿Archivar todos los runs con error de esta plantilla?')) {
                        archiveErrorRuns.mutate()
                      }
                    }}
                    disabled={!selectedTemplateId || archiveErrorRuns.isLoading}
                  >
                    Archivar errores
                  </button>
                  <button
                    className="btn-danger"
                    onClick={() => {
                      if (!selectedTemplateId) return
                      if (window.confirm('¿Eliminar todos los runs con error de esta plantilla?')) {
                        deleteErrorRuns.mutate()
                      }
                    }}
                    disabled={!selectedTemplateId || deleteErrorRuns.isLoading}
                  >
                    Eliminar errores
                  </button>
                </>
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
                    <td>{metricTypeLabel(template.metricType)}</td>
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
                              metricType:
                                ((template as any).metricTypeUi as any) ||
                                (template.metricType === 'count' ? 'count' : 'ratio'),
                              queryTestsTemplate: template.queryTestsTemplate || '',
                              queryStoriesTemplate: template.queryStoriesTemplate || '',
                              formulaTemplate:
                                template.formulaTemplate || (template.metricType === 'count' ? 'COUNT' : 'A / B'),
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
                      {target.orgScopeId && scopeById.get(target.orgScopeId)?.active === 0 ? (
                        <span className="status-pill review" style={{ marginLeft: 8 }}>
                          Area inactiva
                        </span>
                      ) : null}
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
                            setTargetFormError('')
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
                            if (window.confirm('¿Duplicar este target por cada user del params?')) {
                              openTargetWizard(target)
                            }
                          }}
                          disabled={duplicateTargetByUsers.isLoading}
                        >
                          Duplicar por users
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
                  <th>Subperiodo</th>
                  <th>Acciones</th>
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
                    <td>
                      {run.outputs?.skipped ? (
                        <span className="status-pill review">Omitido</span>
                      ) : (
                        run.outputs?.computed ?? '-'
                      )}
                      {run.outputs?.skipReason ? (
                        <div className="helper-text">{run.outputs.skipReason}</div>
                      ) : null}
                    </td>
                    <td>{run.outputs?.subPeriodName || '-'}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            if (window.confirm('¿Archivar este run?')) {
                              archiveRunMutation.mutate(run.id)
                            }
                          }}
                          disabled={archiveRunMutation.isLoading}
                        >
                          Archivar
                        </button>
                        <button
                          className="btn-danger"
                          onClick={() => {
                            if (window.confirm('¿Eliminar este run?')) {
                              deleteRunMutation.mutate(run.id)
                            }
                          }}
                          disabled={deleteRunMutation.isLoading}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!templateRuns || templateRuns.length === 0) && (
                  <tr>
                    <td colSpan={6} className="empty-row">
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
              <h3>Calendarios de medición</h3>
              <p className="muted">Define ciclos por scope (mensual, trimestral o custom).</p>
            </div>
            <button
              className="btn-primary"
              onClick={() => {
                setEditingCalendar(null)
                setCalendarForm({
                  name: '',
                  description: '',
                  frequency: 'monthly',
                  active: true,
                })
                setShowCalendarModal(true)
              }}
            >
              Nuevo calendario
            </button>
          </div>
          <table className="config-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Frecuencia</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {calendarProfiles?.map((profile) => (
                <tr key={profile.id}>
                  <td>{profile.name}</td>
                  <td>{profile.frequency}</td>
                  <td>
                    <span className={`status-pill ${profile.active ? 'ok' : 'review'}`}>
                      {profile.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          setEditingCalendar(profile)
                          setCalendarForm({
                            name: profile.name || '',
                            description: profile.description || '',
                            frequency: profile.frequency || 'monthly',
                            active: profile.active !== false,
                          })
                          setShowCalendarModal(true)
                        }}
                      >
                        Editar
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          setCalendarForSubperiods(profile)
                          setSelectedPeriodForCalendar('')
                          setEditingCalendarSubperiod(undefined)
                          setShowCalendarSubperiods(true)
                        }}
                      >
                        Subperíodos
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(!calendarProfiles || calendarProfiles.length === 0) && (
                <tr>
                  <td colSpan={4} className="empty-row">
                    No hay calendarios configurados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
                  calendarProfileId: '',
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
                          calendarProfileId: scope.calendarProfileId ? String(scope.calendarProfileId) : '',
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
                    <option value="sheets">Google Sheets</option>
                    <option value="manual">Manual / CSV</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Tipo de métrica</label>
                  <select
                    value={templateForm.metricType}
                    onChange={(e) =>
                      setTemplateForm((prev) => {
                        const nextMetricType = e.target.value as
                          | 'count'
                          | 'ratio'
                          | 'sla'
                          | 'value'
                          | 'value_agg'
                          | 'manual'
                        return {
                          ...prev,
                          metricType: nextMetricType,
                          formulaTemplate:
                            nextMetricType === 'count'
                              ? 'COUNT'
                              : nextMetricType === 'ratio' || nextMetricType === 'sla'
                              ? prev.formulaTemplate || 'A / B'
                              : 'VALUE',
                        }
                      })
                    }
                  >
                    <option value="count">COUNT — Conteo por filtro</option>
                    <option value="ratio">RATIO A/B — Cumplimiento / Conversión</option>
                    <option value="sla">SLA — Cumplimiento temporal</option>
                    <option value="value">VALUE — Valor directo</option>
                    <option value="value_agg">VALUE_AGG — Suma / Promedio</option>
                    <option value="manual">MANUAL — Declarativo</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Plantillas rápidas</label>
                <div className="action-buttons">
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('count')}>
                    COUNT
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('ratio')}>
                    RATIO
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('sla')}>
                    SLA
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('sheets_value')}>
                    Sheets VALUE
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('sheets_agg')}>
                    Sheets AGG
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('manual')}>
                    Manual / CSV
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Auth Profile</label>
                <select
                  value={templateForm.authProfileId}
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, authProfileId: e.target.value }))}
                  disabled={templateForm.connector === 'manual'}
                >
                  <option value="">Selecciona un auth profile</option>
                  {authProfilesByConnector?.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} · {profile.connector}
                    </option>
                  ))}
                </select>
                {authProfileHint ? <div className="helper-text">{authProfileHint}</div> : null}
                {templateForm.connector !== 'manual' &&
                  authProfilesByConnector &&
                  authProfilesByConnector.length === 0 && (
                    <div className="helper-text">No hay auth profiles para este conector.</div>
                  )}
              </div>
              {templateForm.metricType !== 'value' &&
                templateForm.metricType !== 'value_agg' &&
                templateForm.metricType !== 'manual' && (
                  <>
                    <div className="form-group">
                      <label>
                        {templateForm.connector === 'jira' || templateForm.connector === 'xray'
                          ? 'Filtro A (template)'
                          : 'Config A (template)'}
                      </label>
                      <textarea
                        rows={3}
                        value={templateForm.queryTestsTemplate}
                        onChange={(e) => setTemplateForm((prev) => ({ ...prev, queryTestsTemplate: e.target.value }))}
                      />
                      <div className="helper-text">
                        {templateForm.connector === 'jira' || templateForm.connector === 'xray'
                          ? templateForm.metricType === 'sla'
                            ? `Ejemplo: {baseFilter} AND {endDate} >= {from} AND {endDate} < {to} AND {endDate} <= {limitDate}`
                            : templateForm.metricType === 'ratio'
                            ? `Ejemplo: {filterA} AND {dateFieldA} >= {from} AND {dateFieldA} < {to}`
                            : `Ejemplo: {baseFilter} AND {dateField} >= {from} AND {dateField} < {to}`
                          : 'Ejemplo: baseFilter={baseFilter} dateField={dateField} from={from} to={to}'}
                      </div>
                    </div>
                    {(templateForm.metricType === 'ratio' || templateForm.metricType === 'sla') && (
                      <div className="form-group">
                        <label>
                          {templateForm.connector === 'jira' || templateForm.connector === 'xray'
                            ? 'Filtro B (template)'
                            : 'Config B (template)'}
                        </label>
                        <textarea
                          rows={3}
                          value={templateForm.queryStoriesTemplate}
                          onChange={(e) =>
                            setTemplateForm((prev) => ({ ...prev, queryStoriesTemplate: e.target.value }))
                          }
                        />
                        <div className="helper-text">
                          {templateForm.connector === 'jira' || templateForm.connector === 'xray'
                            ? templateForm.metricType === 'sla'
                              ? `Ejemplo: {baseFilter} AND {endDate} >= {from} AND {endDate} < {to}`
                              : `Ejemplo: {filterB} AND {dateFieldB} >= {from} AND {dateFieldB} < {to}`
                            : 'Ejemplo: usa el mismo config A o separa A/B si necesitas dos agregados.'}
                        </div>
                      </div>
                    )}
                  </>
                )}
              {(templateForm.metricType === 'value' ||
                templateForm.metricType === 'value_agg' ||
                templateForm.metricType === 'manual') && (
                <div className="form-group">
                  <label>Config (template)</label>
                  <textarea
                    rows={3}
                    value={templateForm.queryTestsTemplate}
                    onChange={(e) => setTemplateForm((prev) => ({ ...prev, queryTestsTemplate: e.target.value }))}
                  />
                  <div className="helper-text">
                    {templateForm.metricType === 'manual'
                      ? 'Ejemplo: manual'
                      : 'Ejemplo: sheetKey={sheetKey} tab={tab} periodColumn={periodColumn} areaColumn={areaColumn} kpiColumn={kpiColumn} valueColumn={valueColumn} aggregation={SUM|AVG}'}
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
                <div className="form-row">
                  <input
                    value={templateForm.schedule}
                    onChange={(e) => setTemplateForm((prev) => ({ ...prev, schedule: e.target.value }))}
                  />
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => setTemplateForm((prev) => ({ ...prev, schedule: '0 2 1 * *' }))}
                  >
                    Mensual (1° 02:00)
                  </button>
                </div>
                <div className="action-buttons" style={{ marginTop: 6 }}>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => setTemplateForm((prev) => ({ ...prev, schedule: '0 2 * * *' }))}
                  >
                    Diario (02:00)
                  </button>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => setTemplateForm((prev) => ({ ...prev, schedule: '0 2 * * 1' }))}
                  >
                    Semanal (Lun 02:00)
                  </button>
                </div>
                <div className="helper-text">
                  Cron sugerido para cierre mensual. Ej: 0 2 1 * *. {cronPreview ? `Próxima ejecución: ${cronPreview}` : ''}
                </div>
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
              {['count', 'ratio', 'sla'].includes(templateForm.metricType) &&
              (templateForm.queryTestsTemplate.trim() || templateForm.queryStoriesTemplate.trim()) &&
              !hasAnyPlaceholders ? (
                <div className="form-warning">
                  Sugerencia: usa placeholders (ej: {'{baseFilter}'}, {'{from}'}, {'{to}'}) para que la plantilla sea reutilizable.
                </div>
              ) : null}
              {['count', 'ratio', 'sla'].includes(templateForm.metricType) &&
              (templateForm.queryTestsTemplate.trim() || templateForm.queryStoriesTemplate.trim()) &&
              missingTimePlaceholders ? (
                <div className="form-warning">
                  Sugerencia: incluir {'{from}'} y {'{to}'} para filtrar por periodo.
                </div>
              ) : null}
              {['count', 'ratio', 'sla'].includes(templateForm.metricType) &&
              (templateForm.queryTestsTemplate.trim() || templateForm.queryStoriesTemplate.trim()) &&
              literalWarning ? (
                <div className="form-warning">
                  Sugerencia: evitá valores fijos (Story/Bug/Done). Ponelos en el Target con placeholders.
                </div>
              ) : null}
              {templateFormError ? <div className="form-error">{templateFormError}</div> : null}
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
                <div className="helper-text">Pega un JQL y convertilo a JSON para usarlo en params.</div>
                <textarea
                  rows={4}
                  placeholder="Pegar JQL aqui..."
                  value={rawJqlInput}
                  onChange={(e) => setRawJqlInput(e.target.value)}
                />
                <div className="action-buttons" style={{ marginTop: 6 }}>
                  <button className="btn-secondary" type="button" onClick={convertJqlToParams}>
                    Convertir JQL → JSON
                  </button>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => {
                      setRawJqlInput('')
                    }}
                  >
                    Limpiar
                  </button>
                </div>
                <textarea
                  rows={5}
                  value={targetForm.paramsText}
                  onChange={(e) => setTargetForm((prev) => ({ ...prev, paramsText: e.target.value }))}
                />
              </div>
              <div className="helper-text">
                Periodo calculado: <strong>{targetPeriodPreview.period}</strong> · Rango: {targetPeriodPreview.from} →{' '}
                {targetPeriodPreview.to}. El subperiodo destino se resuelve automaticamente al ejecutar.
              </div>
              {targetAssignmentBlocked ? (
                <div className="form-error">
                  Hay multiples users en params. Para asignacion individual, crea un target por persona o quita la asignacion.
                </div>
              ) : null}
              {targetFormError ? <div className="form-error">{targetFormError}</div> : null}
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
                disabled={!targetForm.scopeId.trim() || saveTarget.isLoading || targetAssignmentBlocked}
              >
                {saveTarget.isLoading ? 'Guardando...' : 'Guardar target'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTargetWizard && wizardTarget && (
        <div className="modal-overlay" onClick={() => setShowTargetWizard(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Duplicar target por users</h2>
              <button className="close-button" onClick={() => setShowTargetWizard(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="muted">
                Template: {templates?.find((t) => t.id === wizardTarget.templateId)?.name || wizardTarget.templateId}
              </div>
              <div className="helper-text">
                Selecciona el colaborador y, si corresponde, la asignacion destino. Se creara un target por cada user.
              </div>
              <table className="config-table">
                <thead>
                  <tr>
                    <th>User Jira</th>
                    <th>Colaborador</th>
                    <th>Asignacion</th>
                  </tr>
                </thead>
                <tbody>
                  {wizardRows.map((row, index) => {
                    const assignmentsForColab = row.collaboratorId
                      ? assignmentsByCollaborator.get(Number(row.collaboratorId)) || []
                      : []
                    return (
                      <tr key={row.userKey}>
                        <td>{row.userKey}</td>
                        <td>
                          <select
                            value={row.collaboratorId}
                            onChange={(e) => {
                              const value = e.target.value
                              setWizardRows((prev) =>
                                prev.map((item, idx) =>
                                  idx === index
                                    ? {
                                        ...item,
                                        collaboratorId: value,
                                        assignmentId: '',
                                      }
                                    : item
                                )
                              )
                            }}
                          >
                            <option value="">Selecciona colaborador</option>
                            {collaborators?.map((col) => (
                              <option key={col.id} value={col.id}>
                                {col.name} · {col.area}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            value={row.assignmentId}
                            onChange={(e) => {
                              const value = e.target.value
                              setWizardRows((prev) =>
                                prev.map((item, idx) =>
                                  idx === index
                                    ? {
                                        ...item,
                                        assignmentId: value,
                                      }
                                    : item
                                )
                              )
                            }}
                            disabled={!row.collaboratorId}
                          >
                            <option value="">Sin asignacion</option>
                            {assignmentsForColab.map((assignment: any) => (
                              <option key={assignment.id} value={assignment.id}>
                                {assignment.kpiName || `KPI #${assignment.kpiId}`} ·{' '}
                                {assignment.periodName || `Período #${assignment.periodId}`}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowTargetWizard(false)}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={() => createTargetsFromWizard.mutate()}
                disabled={createTargetsFromWizard.isLoading}
              >
                {createTargetsFromWizard.isLoading ? 'Creando...' : 'Crear targets'}
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
                    <option value="sheets">Google Sheets</option>
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
                {authForm.connector === 'sheets' ? (
                  <div className="helper-text">Opcional. Ejemplo: https://sheets.googleapis.com</div>
                ) : (
                  <div className="helper-text">Ejemplo: https://tu-dominio.atlassian.net</div>
                )}
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

      {showCalendarModal && (
        <div className="modal-overlay" onClick={() => setShowCalendarModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingCalendar ? 'Editar calendario' : 'Nuevo calendario'}</h2>
              <button className="close-button" onClick={() => setShowCalendarModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Nombre</label>
                  <input
                    value={calendarForm.name}
                    onChange={(e) => setCalendarForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Frecuencia</label>
                  <select
                    value={calendarForm.frequency}
                    onChange={(e) =>
                      setCalendarForm((prev) => ({ ...prev, frequency: e.target.value }))
                    }
                  >
                    <option value="monthly">Mensual</option>
                    <option value="quarterly">Trimestral</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Descripción</label>
                <textarea
                  rows={3}
                  value={calendarForm.description}
                  onChange={(e) => setCalendarForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Estado</label>
                <select
                  value={calendarForm.active ? '1' : '0'}
                  onChange={(e) =>
                    setCalendarForm((prev) => ({ ...prev, active: e.target.value === '1' }))
                  }
                >
                  <option value="1">Activo</option>
                  <option value="0">Inactivo</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowCalendarModal(false)}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={() => saveCalendarProfile.mutate()}
                disabled={!calendarForm.name.trim() || saveCalendarProfile.isLoading}
              >
                {saveCalendarProfile.isLoading ? 'Guardando...' : 'Guardar calendario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCalendarSubperiods && calendarForSubperiods && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowCalendarSubperiods(false)
            setEditingCalendarSubperiod(undefined)
          }}
        >
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Subperíodos · {calendarForSubperiods.name}</h2>
              <button
                className="close-button"
                onClick={() => {
                  setShowCalendarSubperiods(false)
                  setEditingCalendarSubperiod(undefined)
                }}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Período</label>
                  <select
                    value={selectedPeriodForCalendar}
                    onChange={(e) =>
                      setSelectedPeriodForCalendar(e.target.value ? Number(e.target.value) : '')
                    }
                  >
                    <option value="">Selecciona un período</option>
                    {periods?.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Frecuencia</label>
                  <div className="readonly-field">{calendarForSubperiods.frequency}</div>
                </div>
                <div className="form-group">
                  <label>Estado</label>
                  <div className="readonly-field">
                    {calendarForSubperiods.active !== false ? 'Activo' : 'Inactivo'}
                  </div>
                </div>
              </div>

              {!selectedPeriodForCalendar && (
                <div className="form-hint">Selecciona un período para ver los subperíodos.</div>
              )}

              {selectedPeriodForCalendar && (
                <>
                  <div className="modal-actions">
                    <button
                      className="btn-primary"
                      onClick={() => setEditingCalendarSubperiod(null)}
                    >
                      Nuevo subperíodo
                    </button>
                  </div>
                  <table className="config-table">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Inicio</th>
                        <th>Fin</th>
                        <th>Peso</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calendarSubperiods?.map((sp: any) => (
                        <tr key={sp.id}>
                          <td>{sp.name}</td>
                          <td>{sp.startDate}</td>
                          <td>{sp.endDate}</td>
                          <td>{sp.weight ? `${sp.weight}%` : '-'}</td>
                          <td>
                            <span className={`status-pill ${sp.status === 'closed' ? 'review' : 'ok'}`}>
                              {sp.status === 'closed' ? 'Cerrado' : 'Abierto'}
                            </span>
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button
                                className="btn-secondary"
                                disabled={sp.status === 'closed'}
                                onClick={() => setEditingCalendarSubperiod(sp)}
                              >
                                Editar
                              </button>
                              <button
                                className="btn-secondary"
                                disabled={sp.status === 'closed'}
                                onClick={() => closeCalendarSubperiod.mutate(sp)}
                              >
                                Cerrar
                              </button>
                              <button
                                className="btn-danger"
                                disabled={sp.status === 'closed'}
                                onClick={() => deleteCalendarSubperiod.mutate(sp)}
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {(!calendarSubperiods || calendarSubperiods.length === 0) && (
                        <tr>
                          <td colSpan={6} className="empty-row">
                            No hay subperíodos para este calendario y período.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showCalendarSubperiods &&
        calendarForSubperiods &&
        selectedPeriodForCalendar &&
        editingCalendarSubperiod !== undefined && (
          <div className="modal-overlay" onClick={() => setEditingCalendarSubperiod(undefined)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <SubPeriodForm
                periodId={Number(selectedPeriodForCalendar)}
                calendarProfileId={calendarForSubperiods.id}
                subPeriod={editingCalendarSubperiod || undefined}
                onClose={() => setEditingCalendarSubperiod(undefined)}
                onSuccess={() => {
                  queryClient.invalidateQueries([
                    'calendar-subperiods',
                    selectedPeriodForCalendar,
                    calendarForSubperiods.id,
                  ])
                  setEditingCalendarSubperiod(undefined)
                }}
              />
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
                    A: {targetPreviewResult.testsTotal} · B: {targetPreviewResult.storiesTotal} · Valor:{' '}
                    {targetPreviewResult.computed}
                  </div>
                  <div className="muted">
                    Rango: {targetPreviewResult.from} → {targetPreviewResult.to}
                  </div>
                  {targetPreviewResult.warnings?.length ? (
                    <div className="form-error">{targetPreviewResult.warnings.join(' · ')}</div>
                  ) : null}
                  <div className="preview-jql">
                    <strong>Filtro A</strong>
                    <pre>{targetPreviewResult.testsJql}</pre>
                  </div>
                  <div className="preview-jql">
                    <strong>Filtro B</strong>
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
                <label>Calendario</label>
                <select
                  value={scopeForm.calendarProfileId}
                  onChange={(e) =>
                    setScopeForm((prev) => ({ ...prev, calendarProfileId: e.target.value }))
                  }
                >
                  <option value="">Default</option>
                  {calendarProfiles?.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
                <small className="form-hint">
                  Define el ciclo de medición que hereda este scope.
                </small>
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

