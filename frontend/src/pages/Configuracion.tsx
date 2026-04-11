import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import SubPeriodForm from '../components/SubPeriodForm'
import { useDialog } from '../components/Dialog'
import SheetsWizard from '../components/SheetsWizard'
import './Configuracion.css'
import { PreviewSourceMeta } from './configuracion/PreviewSourceMeta'
import {
  buildTemplatePreset,
  getAuthProfileHint,
  metricTypeLabel,
  metricTypeToBackend,
  type TemplateFormState,
  type TemplatePreset,
} from './configuracion/templateHelpers'
import {
  buildExternalKeysTextBySourceType,
  DEFAULT_MAPPING_SOURCE_TYPE,
  getMappingSourceTypeLabel,
  getSourceTypesToSync,
  MAPPING_SOURCE_TYPE_OPTIONS,
  normalizeMappingSourceType,
  parseExternalKeysText,
} from '../utils/dataSourceMappings'

type Collaborator = {
  id: number
  name: string
  area: string
  role: string
  email?: string | null
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
  scopeKpiId?: number | null
  scopeKpiName?: string | null
  scopeOrgScopeId?: number | null
  scopePeriodId?: number | null
  enabled?: number
  orgScopeId?: number | null
  orgScopeName?: string
  orgScopeType?: string
}

type TargetMappingRow = {
  externalKey: string
  ownerType: 'assignment' | 'scopeKpi'
  assignmentId: string
  scopeKpiId: string
}

type PendingExplicitMappingRow = {
  externalKey: string
  ownerType: 'assignment' | 'scopeKpi'
  entityId: string
}

type DataSourceMapping = {
  id: number
  sourceType: string
  entityType: 'collaborator' | 'org_scope'
  entityId: number
  externalKey: string
  normalizedKey?: string
  externalLabel?: string | null
  metadata?: any
}

const normalizeExternalMatchKey = (value: any) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const pushMatchToken = (set: Set<string>, value: any) => {
  const normalized = normalizeExternalMatchKey(value)
  if (normalized) {
    set.add(normalized)
  }
}

const extractMetadataMatchTokens = (metadata: any, parentKey = ''): string[] => {
  if (metadata === null || metadata === undefined) return []
  if (typeof metadata === 'string' || typeof metadata === 'number') {
    if (/(alias|code|key|slug|email|name)/i.test(parentKey)) {
      return [String(metadata)]
    }
    return []
  }
  if (Array.isArray(metadata)) {
    return metadata.flatMap((item) => extractMetadataMatchTokens(item, parentKey))
  }
  if (typeof metadata === 'object') {
    return Object.entries(metadata).flatMap(([key, value]) => extractMetadataMatchTokens(value, key))
  }
  return []
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

const SETUP_GUIDE_STORAGE_KEY = 'configuracion.setupGuide.hidden'

export default function Configuracion() {
  const { user } = useAuth()
  const dialog = useDialog()
  const queryClient = useQueryClient()
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
  const [targetDraftPreviewResult, setTargetDraftPreviewResult] = useState<any>(null)
  const [targetDraftPreviewMessage, setTargetDraftPreviewMessage] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [integrationOpen, setIntegrationOpen] = useState(false)
  const [sheetsWizardOpen, setSheetsWizardOpen] = useState(false)
  const [setupGuideOpen, setSetupGuideOpen] = useState(false)
  const [setupGuideHydrated, setSetupGuideHydrated] = useState(false)
  const [templateFormError, setTemplateFormError] = useState('')
  const [cronPreview, setCronPreview] = useState('')
  const [templateForm, setTemplateForm] = useState<TemplateFormState>({
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
  const applyTemplatePreset = (preset: TemplatePreset) => {
    setTemplateForm(buildTemplatePreset(preset, templateForm.authProfileId))
  }
  const [targetForm, setTargetForm] = useState({
    templateId: '',
    scopeType: 'area',
    scopeId: '',
    orgScopeId: '',
    paramsText: '',
    assignmentId: '',
    scopeKpiId: '',
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
      clientId: '',
      clientSecret: '',
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
  const [scopeAdvancedOpen, setScopeAdvancedOpen] = useState(false)
  const [scopeMappingSourceType, setScopeMappingSourceType] = useState(DEFAULT_MAPPING_SOURCE_TYPE)
  const [scopeExternalKeysBySourceType, setScopeExternalKeysBySourceType] = useState<Record<string, string>>({
    [DEFAULT_MAPPING_SOURCE_TYPE]: '',
  })
  const [targetFormError, setTargetFormError] = useState('')

  const { data: collaborators } = useQuery<Collaborator[]>('config-collaborators', async () => {
    const res = await api.get('/collaborators')
    return res.data
  })

  const { data: dataSourceMappings } = useQuery<DataSourceMapping[]>('data-source-mappings', async () => {
    const res = await api.get('/data-source-mappings')
    return res.data
  })

  const {
    data: periods,
    isLoading: periodsLoading,
    error: periodsError,
  } = useQuery<any[]>('config-periods', async () => {
    const res = await api.get('/periods')
    return res.data
  })

  const { data: assignments } = useQuery<any[]>('config-assignments', async () => {
    const res = await api.get('/collaborator-kpis')
    return res.data
  })

  const { data: scopeKpis } = useQuery<any[]>('config-scope-kpis', async () => {
    const res = await api.get('/scope-kpis')
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

  const getEntityExternalKeysBySourceType = (
    entityType: 'collaborator' | 'org_scope',
    entityId?: number | null
  ) => buildExternalKeysTextBySourceType(dataSourceMappings, entityType, entityId)

  const updateScopeExternalKeysForSourceType = (value: string) => {
    const sourceType = normalizeMappingSourceType(scopeMappingSourceType)
    setScopeExternalKeysBySourceType((prev) => ({
      ...prev,
      [sourceType]: value,
    }))
  }

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

  const setupChecklist = useMemo(
    () => [
      {
        id: 'areas',
        label: 'Áreas y equipos',
        description: 'Creá la estructura organizacional base.',
        ready: activeAreaScopes.length > 0,
      },
      {
        id: 'collaborators',
        label: 'Colaboradores',
        description: 'Cargá personas y asignales área y jefe directo.',
        ready: Boolean(collaborators?.length),
      },
      {
        id: 'periods',
        label: 'Períodos',
        description: 'Definí al menos un período activo para operar.',
        ready: Boolean(periods?.length),
      },
      {
        id: 'assignments',
        label: 'Asignaciones',
        description: 'Asigná KPIs con metas a cada colaborador.',
        ready: Boolean(assignments?.length),
      },
    ],
    [activeAreaScopes.length, assignments?.length, collaborators?.length, periods?.length]
  )

  const setupBaseReady =
    collaborators !== undefined && orgScopes !== undefined && periods !== undefined && assignments !== undefined
  const setupCompletedCount = useMemo(
    () => setupChecklist.filter((item) => item.ready).length,
    [setupChecklist]
  )
  const setupConfigured = useMemo(
    () => setupChecklist.every((item) => item.ready),
    [setupChecklist]
  )

  const defaultPeriodForCalendar = useMemo<number | ''>(() => {
    if (!periods || periods.length === 0) return ''
    const openPeriod = periods.find((period) => period.status === 'open')
    return Number(openPeriod?.id || periods[0]?.id || '')
  }, [periods])

  const scopeById = useMemo(() => {
    const map = new Map<number, any>()
    orgScopes?.forEach((scope) => map.set(scope.id, scope))
    return map
  }, [orgScopes])

  const collaboratorById = useMemo(() => {
    const map = new Map<number, Collaborator>()
    collaborators?.forEach((collaborator) => map.set(Number(collaborator.id), collaborator))
    return map
  }, [collaborators])

  const assignmentsByCollaborator = useMemo(() => {
    const map = new Map<number, any[]>()
    assignments?.forEach((assignment) => {
      const key = Number(assignment.collaboratorId)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(assignment)
    })
    return map
  }, [assignments])

  useEffect(() => {
    if (!showCalendarSubperiods || !calendarForSubperiods) return
    if (!defaultPeriodForCalendar) return

    const hasSelectedPeriod =
      selectedPeriodForCalendar &&
      periods?.some((period) => Number(period.id) === Number(selectedPeriodForCalendar))

    if (!hasSelectedPeriod) {
      setSelectedPeriodForCalendar(defaultPeriodForCalendar)
    }
  }, [
    showCalendarSubperiods,
    calendarForSubperiods,
    defaultPeriodForCalendar,
    periods,
    selectedPeriodForCalendar,
  ])

  useEffect(() => {
    if (!setupBaseReady || setupGuideHydrated) return
    if (typeof window === 'undefined') return

    const savedHidden = window.localStorage.getItem(SETUP_GUIDE_STORAGE_KEY) === '1'
    setSetupGuideOpen(!savedHidden && !setupConfigured)
    setSetupGuideHydrated(true)
  }, [setupBaseReady, setupConfigured, setupGuideHydrated])

  const hideSetupGuide = () => {
    setSetupGuideOpen(false)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SETUP_GUIDE_STORAGE_KEY, '1')
    }
  }

  const showSetupGuide = () => {
    setSetupGuideOpen(true)
  }

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
      users.forEach((user: any) => {
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
    return getAuthProfileHint(templateForm.connector)
  }, [templateForm.connector])

  const selectedTargetTemplate = useMemo(() => {
    const templateId = Number(targetForm.templateId || selectedTemplateId || 0)
    if (!templateId) return null
    return templates?.find((template) => Number(template.id) === templateId) || null
  }, [templates, targetForm.templateId, selectedTemplateId])

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
    let customFrom: string | null = null
    let customTo: string | null = null

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
      customFrom = dateRangeMatch[2]
      customTo = dateRangeMatch[3]
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

    const params: Record<string, any> = {
      baseFilter: baseFilter || 'project IN (...)',
      issueTypes: issueTypes.length ? issueTypes : ['Historia'],
      dateField: dateField || 'statusCategoryChangedDate',
      testerField: testerField || '"Tester[User Picker (single user)]"',
      users: users.length ? users : ['userId'],
      extraJqlA: extraJql || undefined,
      period,
    }
    if (period === 'custom' && customFrom && customTo) {
      params.from = customFrom
      params.to = customTo
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
  const targetParamsInvalidJson = Boolean(targetForm.paramsText.trim()) && !parsedTargetParams

  const supportsTargetMappingEditor =
    selectedTargetTemplate?.connector === 'looker' || selectedTargetTemplate?.connector === 'generic_api'

  const extractTargetMappingRows = (params: any): TargetMappingRow[] => {
    const targetMap =
      params?.targetMap && typeof params.targetMap === 'object' && !Array.isArray(params.targetMap)
        ? params.targetMap
        : {}
    const defaultOwnerType = String(params?.mappingOwnerType || 'assignment') === 'scopeKpi' ? 'scopeKpi' : 'assignment'
    return Object.entries(targetMap).map(([externalKey, targetConfig]) => {
      const assignmentId =
        targetConfig && typeof targetConfig === 'object'
          ? (targetConfig as any).assignmentId ?? (targetConfig as any).collaboratorAssignmentId ?? ''
          : defaultOwnerType === 'assignment'
          ? targetConfig
          : ''
      const scopeKpiId =
        targetConfig && typeof targetConfig === 'object'
          ? (targetConfig as any).scopeKpiId ?? (targetConfig as any).macroKpiId ?? ''
          : defaultOwnerType === 'scopeKpi'
          ? targetConfig
          : ''

      return {
        externalKey,
        ownerType: scopeKpiId ? 'scopeKpi' : 'assignment',
        assignmentId: assignmentId ? String(assignmentId) : '',
        scopeKpiId: scopeKpiId ? String(scopeKpiId) : '',
      }
    })
  }

  const initialTargetMappingDraft = useMemo(() => {
    const params = parsedTargetParams && typeof parsedTargetParams === 'object' ? parsedTargetParams : {}
    return {
      mappingResultPath: String(params.mappingResultPath || params.resultPath || params.dataPath || ''),
      mappingKeyPath: String(params.mappingKeyPath || params.keyPath || params.mappingKey || ''),
      mappingValuePath: String(params.mappingValuePath || params.valuePath || params.metricPath || ''),
      rows: extractTargetMappingRows(params),
    }
  }, [parsedTargetParams])

  const [targetMappingDraft, setTargetMappingDraft] = useState<{
    mappingResultPath: string
    mappingKeyPath: string
    mappingValuePath: string
    rows: TargetMappingRow[]
  }>({
    mappingResultPath: '',
    mappingKeyPath: '',
    mappingValuePath: '',
    rows: [],
  })
  const [pendingExplicitMappings, setPendingExplicitMappings] = useState<Record<string, PendingExplicitMappingRow>>({})

  useEffect(() => {
    if (!showTargetModal || !supportsTargetMappingEditor || targetParamsInvalidJson) return
    setTargetMappingDraft(initialTargetMappingDraft)
  }, [showTargetModal, editingTarget?.id, supportsTargetMappingEditor])

  useEffect(() => {
    setTargetDraftPreviewResult(null)
    setTargetDraftPreviewMessage('')
  }, [showTargetModal, editingTarget?.id])

  useEffect(() => {
    if (!editingScope?.id || !showScopeModal) return
    setScopeExternalKeysBySourceType(getEntityExternalKeysBySourceType('org_scope', editingScope.id))
    setScopeMappingSourceType(DEFAULT_MAPPING_SOURCE_TYPE)
  }, [editingScope?.id, showScopeModal, dataSourceMappings])

  const targetHasRowMapping = targetMappingDraft.rows.some((row) =>
    row.ownerType === 'scopeKpi' ? Boolean(row.scopeKpiId) : Boolean(row.assignmentId)
  )

  const setTargetParamsObject = (updater: (current: Record<string, any>) => Record<string, any>) => {
    let current: Record<string, any> = {}
    if (targetForm.paramsText.trim()) {
      try {
        const parsed = JSON.parse(targetForm.paramsText)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          current = parsed
        }
      } catch {
        setTargetFormError('El JSON de params no es válido. Corregilo antes de usar el editor de mapping.')
        return false
      }
    }

    const next = updater({ ...current })
    setTargetForm((prev) => ({
      ...prev,
      paramsText: JSON.stringify(next, null, 2),
    }))
    setTargetFormError('')
    return true
  }

  const persistTargetMappingDraft = (draft: {
    mappingResultPath: string
    mappingKeyPath: string
    mappingValuePath: string
    rows: TargetMappingRow[]
  }) => {
    setTargetMappingDraft(draft)
    setTargetParamsObject((current) => {
      const nextRows = draft.rows.filter((row) => row.externalKey.trim())
      const targetMap = nextRows.reduce<Record<string, any>>((acc, row) => {
        const externalKey = row.externalKey.trim()
        if (row.ownerType === 'scopeKpi') {
          if (row.scopeKpiId) {
            acc[externalKey] = { scopeKpiId: Number(row.scopeKpiId) }
          }
          return acc
        }
        if (row.assignmentId) {
          acc[externalKey] = { assignmentId: Number(row.assignmentId) }
        }
        return acc
      }, {})

      if (Object.keys(targetMap).length > 0) {
        current.targetMap = targetMap
        const ownerTypes = new Set(
          nextRows
            .filter((row) => (row.ownerType === 'scopeKpi' ? row.scopeKpiId : row.assignmentId))
            .map((row) => row.ownerType)
        )
        if (ownerTypes.size === 1) {
          current.mappingOwnerType = Array.from(ownerTypes)[0]
        } else {
          delete current.mappingOwnerType
        }
      } else {
        delete current.targetMap
        delete current.mappingOwnerType
      }

      if (draft.mappingResultPath.trim()) {
        current.mappingResultPath = draft.mappingResultPath.trim()
      } else {
        delete current.mappingResultPath
      }
      if (draft.mappingKeyPath.trim()) {
        current.mappingKeyPath = draft.mappingKeyPath.trim()
      } else {
        delete current.mappingKeyPath
      }
      if (draft.mappingValuePath.trim()) {
        current.mappingValuePath = draft.mappingValuePath.trim()
      } else {
        delete current.mappingValuePath
      }

      return current
    })
  }

  const updateTargetMappingField = (
    field: 'mappingResultPath' | 'mappingKeyPath' | 'mappingValuePath',
    value: string
  ) => {
    persistTargetMappingDraft({
      ...targetMappingDraft,
      [field]: value,
    })
  }

  const addTargetMappingRow = () => {
    persistTargetMappingDraft({
      ...targetMappingDraft,
      rows: [
        ...targetMappingDraft.rows,
        {
          externalKey: `key_${targetMappingDraft.rows.length + 1}`,
          ownerType: 'assignment',
          assignmentId: '',
          scopeKpiId: '',
        },
      ],
    })
  }

  const updateTargetMappingRow = (index: number, patch: Partial<TargetMappingRow>) => {
    const rows = targetMappingDraft.rows.map((row, rowIndex) => {
      if (rowIndex !== index) return row
      const nextRow: TargetMappingRow = {
        ...row,
        ...patch,
      }
      if (patch.ownerType === 'assignment') {
        nextRow.scopeKpiId = ''
      }
      if (patch.ownerType === 'scopeKpi') {
        nextRow.assignmentId = ''
      }
      return nextRow
    })
    persistTargetMappingDraft({
      ...targetMappingDraft,
      rows,
    })
  }

  const removeTargetMappingRow = (index: number) => {
    persistTargetMappingDraft({
      ...targetMappingDraft,
      rows: targetMappingDraft.rows.filter((_, rowIndex) => rowIndex !== index),
    })
  }

  const importPreviewRowsToMapping = (previewResult: any, mode: 'all' | 'unmapped' = 'all') => {
    const previewRows = Array.isArray(previewResult?.sourceMeta?.previewRows) ? previewResult.sourceMeta.previewRows : []
    if (!previewRows.length) {
      setTargetDraftPreviewMessage('El preview no devolvió filas útiles para armar el mapping.')
      return
    }

    const unmappedKeySet = new Set(
      (Array.isArray(previewResult?.sourceMeta?.unmappedKeys) ? previewResult.sourceMeta.unmappedKeys : []).map((value: any) =>
        String(value || '').trim().toLowerCase()
      )
    )
    const rowsToImport =
      mode === 'unmapped' && unmappedKeySet.size > 0
        ? previewRows.filter((row: any) => unmappedKeySet.has(String(row?.externalKey || '').trim().toLowerCase()))
        : previewRows

    if (!rowsToImport.length) {
      setTargetDraftPreviewMessage('El preview no tiene claves faltantes para agregar al editor.')
      return
    }

    const existingByKey = new Map(
      targetMappingDraft.rows.map((row) => [row.externalKey.trim().toLowerCase(), row] as const)
    )
    const currentOwnerType =
      targetMappingDraft.rows.find((row) => row.ownerType === 'scopeKpi' && row.scopeKpiId)?.ownerType ||
      targetMappingDraft.rows.find((row) => row.ownerType === 'assignment' && row.assignmentId)?.ownerType ||
      (String((parsedTargetParams as any)?.mappingOwnerType || '') === 'scopeKpi' ? 'scopeKpi' : 'assignment')

    const importedRows: TargetMappingRow[] = rowsToImport.map((row: any) => {
      const externalKey = String(row?.externalKey || '').trim()
      const existing = existingByKey.get(externalKey.toLowerCase())
      if (existing) {
        return {
          ...existing,
          externalKey,
        }
      }

      const autoAssignment =
        currentOwnerType === 'assignment'
          ? assignmentAutoMatchMap.get(normalizeExternalMatchKey(externalKey)) || null
          : null
      const autoScopeKpi =
        currentOwnerType === 'scopeKpi'
          ? scopeKpiAutoMatchMap.get(normalizeExternalMatchKey(externalKey)) || null
          : null

      return {
        externalKey,
        ownerType: currentOwnerType,
        assignmentId: autoAssignment ? String(autoAssignment.id) : '',
        scopeKpiId: autoScopeKpi ? String(autoScopeKpi.id) : '',
      }
    })
    const nextRows = [...targetMappingDraft.rows]

    importedRows.forEach((row) => {
      const normalizedKey = row.externalKey.trim().toLowerCase()
      const index = nextRows.findIndex((current) => current.externalKey.trim().toLowerCase() === normalizedKey)
      if (index >= 0) {
        nextRows[index] = row
      } else {
        nextRows.push(row)
      }
    })

    setTargetForm((prev) => ({
      ...prev,
      assignmentId: '',
      scopeKpiId: '',
    }))
    persistTargetMappingDraft({
      mappingResultPath:
        targetMappingDraft.mappingResultPath || String(previewResult?.sourceMeta?.mappingResultPath || ''),
      mappingKeyPath: targetMappingDraft.mappingKeyPath || String(previewResult?.sourceMeta?.mappingKeyPath || ''),
      mappingValuePath:
        targetMappingDraft.mappingValuePath || String(previewResult?.sourceMeta?.mappingValuePath || ''),
      rows: nextRows,
    })
    setTargetDraftPreviewMessage('')
    setToastMessage(
      mode === 'unmapped' ? `Claves faltantes agregadas al editor: ${nextRows.length}` : `Filas cargadas desde preview: ${nextRows.length}`
    )
    setTimeout(() => setToastMessage(''), 2500)
  }

  const extractTemplateParamKeys = (template?: IntegrationTemplate | null) => {
    if (!template) return []
    const regex = /\{([a-zA-Z0-9_]+)\}/g
    const combined = `${template.queryTestsTemplate || ''}\n${template.queryStoriesTemplate || ''}`
    const matches = Array.from(combined.matchAll(regex)).map((match) => match[1])
    return Array.from(new Set(matches)).filter((key) => !['from', 'to'].includes(key))
  }

  const targetRequiredParamKeys = useMemo(
    () => extractTemplateParamKeys(selectedTargetTemplate),
    [selectedTargetTemplate]
  )

  const targetMissingParamKeys = useMemo(() => {
    if (!targetRequiredParamKeys.length) return []
    const params = parsedTargetParams && typeof parsedTargetParams === 'object' ? parsedTargetParams : {}
    return targetRequiredParamKeys.filter((key) => {
      const value = (params as any)[key]
      if (Array.isArray(value)) return value.length === 0
      if (typeof value === 'string') return value.trim().length === 0
      return value === undefined || value === null
    })
  }, [parsedTargetParams, targetRequiredParamKeys])

  const targetRequiresStructuredParams =
    Boolean(selectedTargetTemplate) &&
    ['jira', 'xray', 'sheets', 'generic_api', 'looker'].includes(String(selectedTargetTemplate?.connector || '')) &&
    targetRequiredParamKeys.length > 0

  const targetUsersCount = useMemo(() => {
    if (!parsedTargetParams) return 0
    const users = (parsedTargetParams as any).users
    if (Array.isArray(users)) return users.length
    if (users) return 1
    return 0
  }, [parsedTargetParams])

  const targetAssignmentBlocked = Boolean(targetForm.assignmentId) && targetUsersCount > 1
  const targetDirectDestinationBlockedByMapping =
    targetHasRowMapping && Boolean(targetForm.assignmentId || targetForm.scopeKpiId)
  const targetUnresolvedMappingRows = useMemo(
    () =>
      targetMappingDraft.rows.filter((row) =>
        row.ownerType === 'scopeKpi' ? !row.scopeKpiId : !row.assignmentId
      ),
    [targetMappingDraft.rows]
  )
  const targetExplicitMappingSourceType = useMemo(
    () => normalizeMappingSourceType(selectedTargetTemplate?.connector || DEFAULT_MAPPING_SOURCE_TYPE),
    [selectedTargetTemplate?.connector]
  )
  const explicitRowKey = (row: Pick<TargetMappingRow, 'externalKey' | 'ownerType'>) =>
    `${row.ownerType}:${normalizeExternalMatchKey(row.externalKey)}`

  const targetPeriodPreview = useMemo(() => {
    const period = (parsedTargetParams as any)?.period || 'previous_month'
    const now = new Date()
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    let from = startOfThisMonth
    let to = startOfThisMonth
    if (period === 'custom') {
      const customFrom = (parsedTargetParams as any)?.from
      const customTo = (parsedTargetParams as any)?.to
      if (customFrom && customTo) {
        const fromDate = new Date(customFrom)
        const toDate = new Date(customTo)
        if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime())) {
          from = fromDate
          to = toDate
        }
      } else {
        from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        to = startOfThisMonth
      }
    } else if (period === 'previous_month') {
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

  const assignmentGroupsForTarget = useMemo(() => {
    if (!assignments) return []
    const groups = new Map<string, any>()
    assignments.forEach((assignment: any) => {
      const key = `${assignment.collaboratorId}-${assignment.kpiId}-${assignment.periodId}`
      const current = groups.get(key)
      if (!current) {
        groups.set(key, assignment)
        return
      }
      const currentIsBase = current.subPeriodId == null
      const nextIsBase = assignment.subPeriodId == null
      if (nextIsBase && !currentIsBase) {
        groups.set(key, assignment)
      }
    })
    return Array.from(groups.values())
  }, [assignments])
  const assignmentGroupById = useMemo(() => {
    const map = new Map<number, any>()
    assignmentGroupsForTarget.forEach((assignment: any) => {
      map.set(Number(assignment.id), assignment)
    })
    return map
  }, [assignmentGroupsForTarget])
  const scopeKpiById = useMemo(() => {
    const map = new Map<number, any>()
    ;(scopeKpis || []).forEach((scopeKpi: any) => {
      map.set(Number(scopeKpi.id), scopeKpi)
    })
    return map
  }, [scopeKpis])

  const assignmentAutoMatchMap = useMemo(() => {
    const map = new Map<string, any>()
    const normalizedConnector = String(selectedTargetTemplate?.connector || '').trim().toLowerCase()
    const collaboratorAssignmentById = new Map<number, any>()
    assignmentGroupsForTarget.forEach((assignment: any) => {
      if (!collaboratorAssignmentById.has(Number(assignment.collaboratorId))) {
        collaboratorAssignmentById.set(Number(assignment.collaboratorId), assignment)
      }
    })

    ;(dataSourceMappings || [])
      .filter((mapping) => {
        if (mapping.entityType !== 'collaborator') return false
        const sourceType = String(mapping.sourceType || 'global').trim().toLowerCase()
        return sourceType === 'global' || (normalizedConnector && sourceType === normalizedConnector)
      })
      .forEach((mapping) => {
        const assignment = collaboratorAssignmentById.get(Number(mapping.entityId))
        if (!assignment) return
        const token = normalizeExternalMatchKey(mapping.externalKey)
        if (token && !map.has(token)) {
          map.set(token, assignment)
        }
      })

    assignmentGroupsForTarget.forEach((assignment: any) => {
      const collaborator = collaboratorById.get(Number(assignment.collaboratorId))
      const tokens = new Set<string>()
      pushMatchToken(tokens, assignment.collaboratorName)
      pushMatchToken(tokens, collaborator?.name)
      pushMatchToken(tokens, collaborator?.email)
      if (collaborator?.email?.includes('@')) {
        pushMatchToken(tokens, collaborator.email.split('@')[0])
      }
      tokens.forEach((token) => {
        if (!map.has(token)) {
          map.set(token, assignment)
        }
      })
    })
    return map
  }, [assignmentGroupsForTarget, collaboratorById, dataSourceMappings, selectedTargetTemplate?.connector])

  const scopeKpiAutoMatchMap = useMemo(() => {
    const map = new Map<string, any>()
    const normalizedConnector = String(selectedTargetTemplate?.connector || '').trim().toLowerCase()
    const scopeKpiByOrgScopeId = new Map<number, any>()
    ;(scopeKpis || []).forEach((scopeKpi: any) => {
      const orgScopeId = Number(scopeKpi.orgScopeId || 0)
      if (!orgScopeId || scopeKpiByOrgScopeId.has(orgScopeId)) return
      scopeKpiByOrgScopeId.set(orgScopeId, scopeKpi)
    })

    ;(dataSourceMappings || [])
      .filter((mapping) => {
        if (mapping.entityType !== 'org_scope') return false
        const sourceType = String(mapping.sourceType || 'global').trim().toLowerCase()
        return sourceType === 'global' || (normalizedConnector && sourceType === normalizedConnector)
      })
      .forEach((mapping) => {
        const scopeKpi = scopeKpiByOrgScopeId.get(Number(mapping.entityId))
        if (!scopeKpi) return
        const token = normalizeExternalMatchKey(mapping.externalKey)
        if (token && !map.has(token)) {
          map.set(token, scopeKpi)
        }
      })

    ;(scopeKpis || []).forEach((scopeKpi: any) => {
      const tokens = new Set<string>()
      const scope = scopeKpi?.orgScopeId ? scopeById.get(Number(scopeKpi.orgScopeId)) : null
      pushMatchToken(tokens, scopeKpi.name)
      pushMatchToken(tokens, scopeKpi.orgScopeName)
      pushMatchToken(tokens, `${scopeKpi.name || ''} ${scopeKpi.orgScopeName || ''}`)
      extractMetadataMatchTokens(scope?.metadata).forEach((token) => pushMatchToken(tokens, token))
      tokens.forEach((token) => {
        if (!map.has(token)) {
          map.set(token, scopeKpi)
        }
      })
    })
    return map
  }, [scopeKpis, scopeById, dataSourceMappings, selectedTargetTemplate?.connector])
  const pendingExplicitMappingSelectionsCount = useMemo(
    () =>
      targetUnresolvedMappingRows.filter((row) => Boolean(pendingExplicitMappings[explicitRowKey(row)]?.entityId)).length,
    [pendingExplicitMappings, targetUnresolvedMappingRows]
  )

  useEffect(() => {
    if (!showTargetModal) {
      setPendingExplicitMappings({})
      return
    }

    const validKeys = new Set(targetUnresolvedMappingRows.map((row) => explicitRowKey(row)))
    setPendingExplicitMappings((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([key]) => validKeys.has(key)))
    )
  }, [showTargetModal, targetUnresolvedMappingRows])

  const assignmentForTarget = useMemo(() => {
    if (!targetForm.assignmentId) return null
    return assignments?.find((assignment) => String(assignment.id) === String(targetForm.assignmentId)) || null
  }, [assignments, targetForm.assignmentId])

  const scopeKpiForTarget = useMemo(() => {
    if (!targetForm.scopeKpiId) return null
    return scopeKpis?.find((scopeKpi) => String(scopeKpi.id) === String(targetForm.scopeKpiId)) || null
  }, [scopeKpis, targetForm.scopeKpiId])

  const scopeForTarget = useMemo(() => {
    if (!targetForm.orgScopeId) return null
    return orgScopes?.find((scope) => String(scope.id) === String(targetForm.orgScopeId)) || null
  }, [orgScopes, targetForm.orgScopeId])

  const targetResolvedScopeName =
    targetForm.scopeId?.trim() || scopeForTarget?.name || scopeKpiForTarget?.orgScopeName || ''

  const targetCalendarProfileId =
    assignmentForTarget?.calendarProfileId ||
    scopeForTarget?.calendarProfileId ||
    (scopeKpiForTarget?.orgScopeId
      ? orgScopes?.find((scope) => Number(scope.id) === Number(scopeKpiForTarget.orgScopeId))?.calendarProfileId
      : null) ||
    null
  const activePeriodId = useMemo(() => {
    if (!periods || periods.length === 0) return null
    const active = periods.find((period: any) =>
      String(period.status || '').toLowerCase() === 'open' ||
      String(period.status || '').toLowerCase() === 'active'
    )
    return active?.id || periods[0]?.id || null
  }, [periods])

  const targetPeriodId = assignmentForTarget?.periodId || scopeKpiForTarget?.periodId || activePeriodId

  const { data: targetCalendarSubperiods } = useQuery<any[]>(
    ['target-calendar-subperiods', targetPeriodId, targetCalendarProfileId],
    async () => {
      if (!targetPeriodId || !targetCalendarProfileId) return []
      const res = await api.get(`/periods/${targetPeriodId}/sub-periods`, {
        params: { calendarProfileId: targetCalendarProfileId },
      })
      return res.data
    },
    { enabled: !!targetPeriodId && !!targetCalendarProfileId }
  )

  const targetResolvedSubperiod = useMemo(() => {
    if (!targetCalendarSubperiods || !targetCalendarSubperiods.length) return null
    const fromDate = new Date(targetPeriodPreview.from)
    return (
      targetCalendarSubperiods.find((sp: any) => {
        const start = new Date(sp.startDate)
        const end = new Date(sp.endDate)
        return fromDate >= start && fromDate < end
      }) || null
    )
  }, [targetCalendarSubperiods, targetPeriodPreview.from])

  useEffect(() => {
    if (!templateForm.authProfileId) return
    const exists = authProfilesByConnector.some(
      (profile) => String(profile.id) === String(templateForm.authProfileId)
    )
    if (!exists) {
      setTemplateForm((prev) => ({ ...prev, authProfileId: '' }))
    }
  }, [authProfilesByConnector, templateForm.authProfileId])

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
      if (targetRequiresStructuredParams && targetMissingParamKeys.length > 0) {
        throw new Error(`Faltan params requeridos: ${targetMissingParamKeys.join(', ')}`)
      }
      if (targetParamsInvalidJson) {
        throw new Error('El JSON de params no es válido')
      }
      if (targetForm.assignmentId && usersCount > 1) {
        throw new Error(
          'Target con multiples users no puede asignarse a un KPI individual. Usa un target por persona o quita la asignacion.'
        )
      }
      if (parsedParams?.targetMap && (targetForm.assignmentId || targetForm.scopeKpiId)) {
        throw new Error('Un target con mapping por filas no puede apuntar también a una asignación o Scope KPI directo')
      }
      if (targetForm.assignmentId && targetForm.scopeKpiId) {
        throw new Error('Un target solo puede apuntar a asignación o Scope KPI')
      }
      const selectedScope = orgScopes?.find((scope) => scope.id === Number(targetForm.orgScopeId))
      const selectedScopeKpi = scopeKpis?.find((scopeKpi) => scopeKpi.id === Number(targetForm.scopeKpiId))
      const resolvedScope = selectedScope || (selectedScopeKpi?.orgScopeId
        ? orgScopes?.find((scope) => scope.id === Number(selectedScopeKpi.orgScopeId))
        : null)
      const payload = {
        templateId: Number(targetForm.templateId || selectedTemplateId),
        scopeType: resolvedScope?.type || targetForm.scopeType,
        scopeId: targetForm.scopeId || resolvedScope?.name || '',
        orgScopeId: resolvedScope?.id || (targetForm.orgScopeId ? Number(targetForm.orgScopeId) : undefined),
        params: parsedParams,
        assignmentId: targetForm.assignmentId ? Number(targetForm.assignmentId) : undefined,
        scopeKpiId: targetForm.scopeKpiId ? Number(targetForm.scopeKpiId) : undefined,
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
          scopeKpiId: '',
          enabled: true,
        })
      },
      onError: (error: any) => {
        setTargetFormError(error?.message || 'Error al guardar target')
      },
    }
  )
  const saveExplicitTargetMappings = useMutation(
    async () => {
      const rowsToPersist = targetUnresolvedMappingRows
        .map((row) => ({
          row,
          selection: pendingExplicitMappings[explicitRowKey(row)],
        }))
        .filter((item) => item.selection?.entityId)

      if (rowsToPersist.length === 0) {
        throw new Error('Seleccioná al menos un destino para crear mappings explícitos')
      }

      const grouped = new Map<
        string,
        {
          sourceType: string
          entityType: 'collaborator' | 'org_scope'
          entityId: number
          mappings: Map<string, { externalKey: string }>
        }
      >()
      const resolvedRows = new Map<
        string,
        {
          assignmentId?: string
          scopeKpiId?: string
        }
      >()

      rowsToPersist.forEach(({ row, selection }) => {
        const selectedId = Number(selection.entityId)
        if (row.ownerType === 'assignment') {
          const assignment = assignmentGroupById.get(selectedId)
          if (!assignment) {
            throw new Error(`La asignación seleccionada ya no está disponible para ${row.externalKey}`)
          }
          const collaboratorId = Number(assignment.collaboratorId || 0)
          if (!collaboratorId) {
            throw new Error(`No se pudo resolver el colaborador base para ${row.externalKey}`)
          }
          const groupKey = `${targetExplicitMappingSourceType}:collaborator:${collaboratorId}`
          if (!grouped.has(groupKey)) {
            const existingMappings = (dataSourceMappings || []).filter(
              (mapping) =>
                normalizeMappingSourceType(mapping.sourceType) === targetExplicitMappingSourceType &&
                mapping.entityType === 'collaborator' &&
                Number(mapping.entityId) === collaboratorId
            )
            grouped.set(groupKey, {
              sourceType: targetExplicitMappingSourceType,
              entityType: 'collaborator',
              entityId: collaboratorId,
              mappings: new Map(
                existingMappings.map((mapping) => [normalizeExternalMatchKey(mapping.externalKey), { externalKey: mapping.externalKey }])
              ),
            })
          }
          grouped.get(groupKey)!.mappings.set(normalizeExternalMatchKey(row.externalKey), {
            externalKey: row.externalKey.trim(),
          })
          resolvedRows.set(explicitRowKey(row), { assignmentId: String(assignment.id) })
          return
        }

        const scopeKpi = scopeKpiById.get(selectedId)
        if (!scopeKpi) {
          throw new Error(`El Scope KPI seleccionado ya no está disponible para ${row.externalKey}`)
        }
        const orgScopeId = Number(scopeKpi.orgScopeId || 0)
        if (!orgScopeId) {
          throw new Error(`No se pudo resolver el scope base para ${row.externalKey}`)
        }
        const groupKey = `${targetExplicitMappingSourceType}:org_scope:${orgScopeId}`
        if (!grouped.has(groupKey)) {
          const existingMappings = (dataSourceMappings || []).filter(
            (mapping) =>
              normalizeMappingSourceType(mapping.sourceType) === targetExplicitMappingSourceType &&
              mapping.entityType === 'org_scope' &&
              Number(mapping.entityId) === orgScopeId
          )
          grouped.set(groupKey, {
            sourceType: targetExplicitMappingSourceType,
            entityType: 'org_scope',
            entityId: orgScopeId,
            mappings: new Map(
              existingMappings.map((mapping) => [normalizeExternalMatchKey(mapping.externalKey), { externalKey: mapping.externalKey }])
            ),
          })
        }
        grouped.get(groupKey)!.mappings.set(normalizeExternalMatchKey(row.externalKey), {
          externalKey: row.externalKey.trim(),
        })
        resolvedRows.set(explicitRowKey(row), { scopeKpiId: String(scopeKpi.id) })
      })

      const items = Array.from(grouped.values()).map((group) => ({
        sourceType: group.sourceType,
        entityType: group.entityType,
        entityId: group.entityId,
        mappings: Array.from(group.mappings.values()),
      }))

      await api.post('/data-source-mappings/bulk-sync', { items })

      return {
        resolvedRows,
        rowCount: rowsToPersist.length,
      }
    },
    {
      onSuccess: (result) => {
        queryClient.invalidateQueries('data-source-mappings')
        persistTargetMappingDraft({
          ...targetMappingDraft,
          rows: targetMappingDraft.rows.map((row) => {
            const resolved = result.resolvedRows.get(explicitRowKey(row))
            if (!resolved) return row
            return {
              ...row,
              assignmentId: resolved.assignmentId || '',
              scopeKpiId: resolved.scopeKpiId || '',
            }
          }),
        })
        setPendingExplicitMappings((prev) =>
          Object.fromEntries(
            Object.entries(prev).filter(([key]) => !result.resolvedRows.has(key))
          )
        )
        setTargetFormError('')
        setToastMessage(`Mappings explícitos guardados y filas resueltas: ${result.rowCount}`)
        setTimeout(() => setToastMessage(''), 2500)
      },
      onError: (error: any) => {
        setTargetFormError(error?.response?.data?.error || error?.message || 'Error al guardar mappings explícitos')
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
            scopeKpiId: target.scopeKpiId || undefined,
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
            scopeKpiId: target.scopeKpiId || undefined,
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
            clientId: '',
            clientSecret: '',
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
      let scopeId = editingScope?.id ? Number(editingScope.id) : null
      if (editingScope) {
        const res = await api.put(`/org-scopes/${editingScope.id}`, payload)
        scopeId = Number(editingScope.id)
        if (scopeId) {
          const sourceTypes = getSourceTypesToSync(
            scopeExternalKeysBySourceType,
            dataSourceMappings,
            'org_scope',
            scopeId
          )
          await Promise.all(
            sourceTypes.map((sourceType) =>
              api.post('/data-source-mappings/sync', {
                sourceType,
                entityType: 'org_scope',
                entityId: scopeId,
                externalKeys: parseExternalKeysText(scopeExternalKeysBySourceType[sourceType] || ''),
              })
            )
          )
        }
        return res.data
      } else {
        const res = await api.post('/org-scopes', payload)
        scopeId = Number(res.data?.id || 0)
        if (scopeId) {
          const sourceTypes = getSourceTypesToSync(
            scopeExternalKeysBySourceType,
            undefined,
            'org_scope',
            scopeId
          )
          await Promise.all(
            sourceTypes.map((sourceType) =>
              api.post('/data-source-mappings/sync', {
                sourceType,
                entityType: 'org_scope',
                entityId: scopeId,
                externalKeys: parseExternalKeysText(scopeExternalKeysBySourceType[sourceType] || ''),
              })
            )
          )
        }
        return res.data
      }
    },
    {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries('org-scopes')
        queryClient.invalidateQueries('data-source-mappings')
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
        setScopeExternalKeysBySourceType({ [DEFAULT_MAPPING_SOURCE_TYPE]: '' })
        setScopeMappingSourceType(DEFAULT_MAPPING_SOURCE_TYPE)
        setScopeAdvancedOpen(false)
        if (data?.warning) {
          void dialog.alert(data.warning, { title: 'Advertencia', variant: 'warning' })
        }
      },
    }
  )

  const deleteScope = useMutation(
    async (scope: any) => {
      await api.delete(`/org-scopes/${scope.id}`)
      return scope
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('org-scopes')
      },
      onError: (error: any) => {
        void dialog.alert(error.response?.data?.error || 'Error al eliminar la unidad organizacional', { title: 'Error', variant: 'danger' })
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
  const testsPlaceholders: string[] = templateForm.queryTestsTemplate.match(placeholderRegex) || []
  const storiesPlaceholders =
    templateForm.metricType === 'ratio' || templateForm.metricType === 'sla'
      ? ((templateForm.queryStoriesTemplate.match(placeholderRegex) || []) as string[])
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

  const previewTargetDraft = useMutation(
    async () => {
      if (targetParamsInvalidJson) {
        throw new Error('El JSON de params no es válido')
      }
      let parsedParams: any = {}
      if (targetForm.paramsText.trim()) {
        parsedParams = JSON.parse(targetForm.paramsText)
      }
      const templateId = Number(targetForm.templateId || selectedTemplateId)
      if (!templateId) {
        throw new Error('Selecciona una plantilla para probar el target')
      }
      const payload = {
        templateId,
        targetId: editingTarget?.id || undefined,
        params: parsedParams,
        includeRaw: false,
      }
      const res = await api.post('/integrations/templates/test', payload)
      return res.data
    },
    {
      onSuccess: (data) => {
        setTargetDraftPreviewResult(data)
        setTargetDraftPreviewMessage('')
      },
      onError: (error: any) => {
        setTargetDraftPreviewMessage(error?.response?.data?.error || error?.message || 'Error al probar params')
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
          <p className="subtitle">Estructura organizacional, calendarios e integraciones</p>
        </div>
        <div className="config-header-actions">
          <button
            className={`setup-guide-toggle ${setupGuideOpen ? 'setup-guide-toggle--active' : ''}`}
            onClick={() => (setupGuideOpen ? hideSetupGuide() : showSetupGuide())}
            type="button"
          >
            {setupGuideOpen ? 'Ocultar guía inicial' : 'Ver guía inicial'}
          </button>
        </div>
      </div>
      {toastMessage ? <div className="toast">{toastMessage}</div> : null}

      {setupGuideOpen && (
        <div className="modal-overlay" onClick={hideSetupGuide}>
          <div className="modal-content setup-guide-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Guía inicial de configuración</h2>
                <p className="setup-guide-modal-subtitle">
                  {setupConfigured
                    ? 'La configuración base ya está completa. Podés reabrir esta guía cuando quieras.'
                    : `Completaste ${setupCompletedCount} de ${setupChecklist.length} pasos base.`}
                </p>
              </div>
              <button className="close-button" onClick={hideSetupGuide}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="setup-guide">
                <div className="setup-guide-title">¿Cómo configurar el sistema por primera vez?</div>
                <ol className="setup-guide-steps">
                  <li><strong>Creá las áreas y equipos</strong> de tu empresa en <em>Estructura Organizacional</em> (más abajo ↓)</li>
                  <li>Agregá los <strong>colaboradores</strong> y asignales un área y jefe directo → <a href="/colaboradores">Colaboradores</a></li>
                  <li>Definí los <strong>KPIs</strong> que vas a medir → <a href="/kpis">KPIs</a></li>
                  <li>Creá un <strong>período activo</strong> (anual, semestral, trimestral) → <a href="/periodos">Períodos</a></li>
                  <li>Asigná KPIs a cada colaborador con su meta → <a href="/asignaciones">Asignaciones</a></li>
                </ol>
                <p className="setup-guide-note">Los calendarios e integraciones son opcionales y se pueden configurar después.</p>
              </div>

              <div className="setup-guide-progress">
                {setupChecklist.map((item) => (
                  <div
                    key={item.id}
                    className={`setup-guide-progress-item ${item.ready ? 'is-ready' : 'is-pending'}`}
                  >
                    <span className="setup-guide-progress-icon" aria-hidden="true">
                      {item.ready ? '✓' : '•'}
                    </span>
                    <div>
                      <div className="setup-guide-progress-title">{item.label}</div>
                      <div className="setup-guide-progress-desc">{item.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={hideSetupGuide}>
                Guardar y ocultar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sheets-wizard-banner">
        <div className="sheets-wizard-banner-text">
          <span className="sheets-wizard-banner-icon">📊</span>
          <div>
            <strong>Conectar Google Sheets</strong>
            <p>Importá valores de KPI directamente desde tus planillas, sin configuración técnica.</p>
          </div>
        </div>
        <button className="btn-primary" onClick={() => setSheetsWizardOpen(true)}>
          Conectar planilla →
        </button>
      </div>

      <button
        className="advanced-toggle"
        onClick={() => setIntegrationOpen((v) => !v)}
        aria-expanded={integrationOpen}
      >
        <span>{integrationOpen ? '▲' : '▼'}</span>
        Configuración avanzada — Integraciones
        <span className="advanced-toggle-hint">Jira, Zendesk, conectores externos. Solo para administradores técnicos.</span>
      </button>

      {integrationOpen && (
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
                        scopeKpiId: '',
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
                        clientId: '',
                        clientSecret: '',
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
                    onClick={async () => {
                      if (!selectedTemplateId) return
                      const ok = await dialog.confirm('¿Archivar todos los runs con error de esta plantilla?', { title: 'Archivar errores', confirmLabel: 'Archivar', variant: 'warning' })
                      if (ok) archiveErrorRuns.mutate()
                    }}
                    disabled={!selectedTemplateId || archiveErrorRuns.isLoading}
                  >
                    Archivar errores
                  </button>
                  <button
                    className="btn-danger"
                    onClick={async () => {
                      if (!selectedTemplateId) return
                      const ok = await dialog.confirm('¿Eliminar todos los runs con error de esta plantilla?', { title: 'Eliminar errores', confirmLabel: 'Eliminar', variant: 'danger' })
                      if (ok) deleteErrorRuns.mutate()
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
                  <th>Área / Equipo</th>
                  <th>Destino</th>
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
                    <td>
                      {target.assignmentId
                        ? `Asignación #${target.assignmentId}`
                        : target.scopeKpiId
                        ? `${target.scopeKpiName || `Scope KPI #${target.scopeKpiId}`}`
                        : target.params?.targetMap
                        ? `Mapping por filas (${Object.keys(target.params.targetMap || {}).length})`
                        : '-'}
                    </td>
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
                              scopeKpiId: target.scopeKpiId ? String(target.scopeKpiId) : '',
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
                          onClick={async () => {
                            const ok = await dialog.confirm('¿Duplicar este target por cada user del params?', { title: 'Duplicar target', confirmLabel: 'Duplicar', variant: 'warning' })
                            if (ok) openTargetWizard(target)
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
                          onClick={async () => {
                            const ok = await dialog.confirm('¿Archivar este run?', { title: 'Archivar run', confirmLabel: 'Archivar', variant: 'warning' })
                            if (ok) archiveRunMutation.mutate(run.id)
                          }}
                          disabled={archiveRunMutation.isLoading}
                        >
                          Archivar
                        </button>
                        <button
                          className="btn-danger"
                          onClick={async () => {
                            const ok = await dialog.confirm('¿Eliminar este run?', { title: 'Eliminar run', confirmLabel: 'Eliminar', variant: 'danger' })
                            if (ok) deleteRunMutation.mutate(run.id)
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
                              authConfig: {
                                username: '',
                                password: '',
                                token: '',
                                apiKey: '',
                                header: '',
                                clientId: '',
                                clientSecret: '',
                                ...(profile.authConfig || {}),
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
      )}

      <div className="config-section">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Calendarios de medición</h3>
              <p className="muted">Define ciclos de medición por área o equipo (mensual, trimestral o custom).</p>
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
              <h3>Estructura Organizacional</h3>
              <p className="muted">Jerarquía de áreas, equipos y personas con herencia de calendarios.</p>
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
                  setScopeExternalKeysBySourceType({ [DEFAULT_MAPPING_SOURCE_TYPE]: '' })
                  setScopeMappingSourceType(DEFAULT_MAPPING_SOURCE_TYPE)
                  setScopeAdvancedOpen(false)
                  setShowScopeModal(true)
                }}
            >
              Nueva unidad
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
                        setScopeExternalKeysBySourceType(getEntityExternalKeysBySourceType('org_scope', scope.id))
                        setScopeMappingSourceType(DEFAULT_MAPPING_SOURCE_TYPE)
                        // Si ya tiene metadata o alias externos, mostramos la sección avanzada abierta
                        const hasAdvancedData = !!(scope.metadata || getEntityExternalKeysBySourceType('org_scope', scope.id)[DEFAULT_MAPPING_SOURCE_TYPE])
                        setScopeAdvancedOpen(hasAdvancedData)
                        setShowScopeModal(true)
                      }}
                      >
                        Editar
                      </button>
                      <button
                        className="btn-secondary danger"
                        onClick={async () => {
                          const ok = await dialog.confirm(
                            `¿Eliminar la unidad "${scope.name}"? Esta acción no se puede deshacer.`,
                            { title: 'Eliminar unidad', confirmLabel: 'Eliminar', variant: 'danger' }
                          )
                          if (ok) deleteScope.mutate(scope)
                        }}
                        disabled={deleteScope.isLoading}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(!orgScopes || orgScopes.length === 0) && (
                <tr>
                  <td colSpan={5} className="empty-row">
                    <div className="empty-state-inline">
                      <strong>Todavía no hay áreas ni equipos.</strong>
                      <span>Hacé clic en <em>Nueva unidad</em> para crear la primera área de tu empresa (por ejemplo: Ventas, Tecnología, Operaciones).</span>
                    </div>
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
                    <option value="looker">Looker</option>
                    <option value="generic_api">Generic API</option>
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
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('sheets_grid')}>
                    Sheets GRID
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('sheets_grid_agg')}>
                    Sheets GRID AGG
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('api_value')}>
                    API VALUE
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('api_agg')}>
                    API AGG
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('looker_value')}>
                    Looker VALUE
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('looker_agg')}>
                    Looker AGG
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
                          : templateForm.connector === 'generic_api'
                          ? 'Config request (template)'
                          : templateForm.connector === 'looker'
                          ? 'Config Looker (template)'
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
                            : templateForm.connector === 'generic_api'
                            ? 'Ejemplo: path={path} method={method} resultPath={resultPath} valuePath={valuePath} aggregation={aggregation}'
                            : templateForm.connector === 'looker'
                            ? 'Ejemplo: resourceType={query|look|dashboard|dashboard_element|inline_query} resourceId={resourceId} dashboardElementId={dashboardElementId} resultFormat={resultFormat} resultPath={resultPath} valuePath={valuePath}'
                            : 'Ejemplo: baseFilter={baseFilter} dateField={dateField} from={from} to={to}'}
                        </div>
                      </div>
                    {(templateForm.metricType === 'ratio' || templateForm.metricType === 'sla') && (
                      <div className="form-group">
                          <label>
                            {templateForm.connector === 'jira' || templateForm.connector === 'xray'
                              ? 'Filtro B (template)'
                              : templateForm.connector === 'generic_api'
                              ? 'Config B (template)'
                              : templateForm.connector === 'looker'
                              ? 'Config B (template)'
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
                            : templateForm.connector === 'generic_api'
                            ? 'Opcional. Solo si queres documentar otro bloque de placeholders.'
                            : templateForm.connector === 'looker'
                            ? 'Opcional. Para inline_query usá queryBody. Para dashboard podés usar dashboardElementId, dashboardElementTitle o dashboardElementIndex.'
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
                      : templateForm.connector === 'generic_api'
                      ? 'Ejemplo: path={path} method={method} query={query} resultPath={resultPath} valuePath={valuePath} aggregation={aggregation}'
                      : templateForm.connector === 'looker'
                      ? 'Ejemplo: resourceType={query|look|dashboard|dashboard_element|inline_query} resourceId={resourceId} dashboardElementId={dashboardElementId} dashboardElementTitle={dashboardElementTitle} resultFormat={resultFormat} resultPath={resultPath} valuePath={valuePath}'
                      : 'Ejemplo: sheetKey={sheetKey} range={range} areaColumn={areaColumn} collaboratorColumn={collaboratorColumn} kpiColumn={kpiColumn}. En params: collaboratorValue + valueColumn o valueColumnFromPeriod=true + valueColumnPeriodFormat=YYYYMM'}
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
                  <label>Tipo de unidad</label>
                  <select
                    value={targetForm.scopeType}
                    onChange={(e) => setTargetForm((prev) => ({ ...prev, scopeType: e.target.value }))}
                  >
                    <option value="company">Empresa</option>
                    <option value="area">Área</option>
                    <option value="team">Equipo</option>
                    <option value="person">Persona</option>
                    <option value="product">Producto</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Unidad organizacional</label>
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
                        scopeKpiId:
                          prev.scopeKpiId &&
                          scopeKpis?.find((scopeKpi) => Number(scopeKpi.id) === Number(prev.scopeKpiId))
                            ?.orgScopeId !== Number(value)
                            ? ''
                            : prev.scopeKpiId,
                      }))
                    }}
                  >
                    <option value="">Seleccioná un área o equipo</option>
                    {orgScopes?.map((scope) => (
                      <option key={scope.id} value={scope.id}>
                        {scope.type} · {scope.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>ID externo</label>
                  <input
                    value={targetForm.scopeId}
                    onChange={(e) => setTargetForm((prev) => ({ ...prev, scopeId: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Asignación destino (solo si es individual)</label>
                  <select
                    value={targetForm.assignmentId}
                    onChange={(e) =>
                      setTargetForm((prev) => ({
                        ...prev,
                        assignmentId: e.target.value,
                        scopeKpiId: e.target.value ? '' : prev.scopeKpiId,
                      }))
                    }
                  >
                    <option value="">Selecciona una asignación</option>
                    {assignmentGroupsForTarget.map((assignment: any) => (
                      <option key={assignment.id} value={assignment.id}>
                        {assignment.collaboratorName || `Colaborador #${assignment.collaboratorId}`} ·{' '}
                        {assignment.kpiName || `KPI #${assignment.kpiId}`} ·{' '}
                        {assignment.periodName || `Período #${assignment.periodId}`}
                      </option>
                    ))}
                  </select>
                  <div className="helper-text">
                    Seleccioná una asignación base solo si el target debe escribir sobre un KPI colaborador.
                  </div>
                </div>
                <div className="form-group">
                  <label>KPI Grupal destino</label>
                  <select
                    value={targetForm.scopeKpiId}
                    onChange={(e) =>
                      setTargetForm((prev) => {
                        const selectedScopeKpi = scopeKpis?.find(
                          (scopeKpi) => Number(scopeKpi.id) === Number(e.target.value)
                        )
                        const selectedScope = selectedScopeKpi?.orgScopeId
                          ? orgScopes?.find((scope) => Number(scope.id) === Number(selectedScopeKpi.orgScopeId))
                          : null
                        return {
                          ...prev,
                          scopeKpiId: e.target.value,
                          assignmentId: e.target.value ? '' : prev.assignmentId,
                          orgScopeId: e.target.value
                            ? String(selectedScopeKpi?.orgScopeId || prev.orgScopeId)
                            : prev.orgScopeId,
                          scopeType: selectedScope?.type || prev.scopeType,
                          scopeId: selectedScope?.name || prev.scopeId,
                        }
                      })
                    }
                  >
                    <option value="">Seleccioná un KPI Grupal</option>
                    {(scopeKpis || [])
                      .filter((scopeKpi: any) =>
                        targetForm.orgScopeId ? Number(scopeKpi.orgScopeId) === Number(targetForm.orgScopeId) : true
                      )
                      .map((scopeKpi: any) => (
                        <option key={scopeKpi.id} value={scopeKpi.id}>
                          {scopeKpi.name} · {scopeKpi.orgScopeName || `Scope #${scopeKpi.orgScopeId}`} ·{' '}
                          {scopeKpi.periodName || `Período #${scopeKpi.periodId}`}
                        </option>
                      ))}
                  </select>
                  <div className="helper-text">
                    Seleccioná esto si el target debe escribir sobre un KPI organizacional. Solo uno de los dos destinos puede estar informado.
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label>JQL raw (opcional)</label>
                <div className="helper-text">Usalo solo como ayuda para convertir un JQL en params JSON.</div>
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
                <label style={{ marginTop: 12, display: 'block' }}>Params JSON (guardado real del target)</label>
                <div className="helper-text">
                  Este contenido es el que se persiste y usa el runner al ejecutar el target.
                </div>
                <textarea
                  rows={5}
                  value={targetForm.paramsText}
                  onChange={(e) => setTargetForm((prev) => ({ ...prev, paramsText: e.target.value }))}
                />
                {selectedTargetTemplate?.connector === 'sheets' ? (
                  <div className="helper-text">
                    Para hojas por lider: usa <code>range</code> con A1 notation (ej: <code>'Alexis Cantenys'!A3:Z</code>),
                    {' '}<code>collaboratorValue</code> para elegir la fila correcta y, si los meses son columnas,
                    {' '}<code>valueColumnFromPeriod=true</code> + <code>valueColumnPeriodFormat=YYYYMM</code>.
                  </div>
                ) : null}
              </div>
              {targetRequiresStructuredParams && targetRequiredParamKeys.length > 0 ? (
                <div className="helper-text">
                  Params requeridos por la plantilla: <strong>{targetRequiredParamKeys.join(', ')}</strong>
                </div>
              ) : null}
              {selectedTargetTemplate?.connector === 'looker' || selectedTargetTemplate?.connector === 'generic_api' ? (
                <div className="helper-text">
                  Para actualizar multiples destinos desde una sola corrida, podés usar
                  {' '}<code>targetMap</code>, <code>mappingKeyPath</code>, <code>mappingValuePath</code> y
                  {' '}<code>mappingOwnerType</code> (<code>assignment</code> o <code>scopeKpi</code>).
                  {selectedTargetTemplate?.connector === 'looker'
                    ? ' Looker también soporta resourceType dashboard y dashboard_element.'
                    : ''}
                </div>
              ) : null}
              {supportsTargetMappingEditor ? (
                <div className="form-group" style={{ marginTop: 14 }}>
                  <label>Editor de mapping por filas</label>
                  <div className="helper-text">
                    Armá el <code>targetMap</code> desde UI. Si usás este editor, quitá el destino directo del target.
                    Cuando importás desde preview, el sistema intenta autocompletar coincidencias por nombre.
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Mapping result path</label>
                      <input
                        placeholder="data.rows"
                        value={targetMappingDraft.mappingResultPath}
                        onChange={(e) => updateTargetMappingField('mappingResultPath', e.target.value)}
                        disabled={targetParamsInvalidJson}
                      />
                    </div>
                    <div className="form-group">
                      <label>Mapping key path</label>
                      <input
                        placeholder="qa o area"
                        value={targetMappingDraft.mappingKeyPath}
                        onChange={(e) => updateTargetMappingField('mappingKeyPath', e.target.value)}
                        disabled={targetParamsInvalidJson}
                      />
                    </div>
                    <div className="form-group">
                      <label>Mapping value path</label>
                      <input
                        placeholder="stories_delivered o revenue"
                        value={targetMappingDraft.mappingValuePath}
                        onChange={(e) => updateTargetMappingField('mappingValuePath', e.target.value)}
                        disabled={targetParamsInvalidJson}
                      />
                    </div>
                  </div>
                  <div className="action-buttons" style={{ marginTop: 6 }}>
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={addTargetMappingRow}
                      disabled={targetParamsInvalidJson}
                    >
                      Agregar fila de mapping
                    </button>
                  </div>
                  {targetMappingDraft.rows.length > 0 ? (
                    <table className="config-table" style={{ marginTop: 10 }}>
                      <thead>
                        <tr>
                          <th>Clave externa</th>
                          <th>Destino</th>
                          <th>Asignación</th>
                          <th>KPI Grupal</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {targetMappingDraft.rows.map((row, index) => (
                          <tr key={`${row.externalKey || 'row'}-${index}`}>
                            <td>
                              <input
                                value={row.externalKey}
                                placeholder="Johana / Revenue / CS"
                                onChange={(e) =>
                                  updateTargetMappingRow(index, {
                                    externalKey: e.target.value,
                                  })
                                }
                                disabled={targetParamsInvalidJson}
                              />
                            </td>
                            <td>
                              <select
                                value={row.ownerType}
                                onChange={(e) =>
                                  updateTargetMappingRow(index, {
                                    ownerType: e.target.value === 'scopeKpi' ? 'scopeKpi' : 'assignment',
                                  })
                                }
                                disabled={targetParamsInvalidJson}
                              >
                                <option value="assignment">Asignación</option>
                                <option value="scopeKpi">KPI Grupal</option>
                              </select>
                            </td>
                            <td>
                              <select
                                value={row.assignmentId}
                                onChange={(e) =>
                                  updateTargetMappingRow(index, {
                                    assignmentId: e.target.value,
                                  })
                                }
                                disabled={row.ownerType !== 'assignment' || targetParamsInvalidJson}
                              >
                                <option value="">Selecciona una asignación</option>
                                {assignmentGroupsForTarget.map((assignment: any) => (
                                  <option key={assignment.id} value={assignment.id}>
                                    {assignment.collaboratorName || `Colaborador #${assignment.collaboratorId}`} ·{' '}
                                    {assignment.kpiName || `KPI #${assignment.kpiId}`} ·{' '}
                                    {assignment.periodName || `Período #${assignment.periodId}`}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <select
                                value={row.scopeKpiId}
                                onChange={(e) =>
                                  updateTargetMappingRow(index, {
                                    scopeKpiId: e.target.value,
                                  })
                                }
                                disabled={row.ownerType !== 'scopeKpi' || targetParamsInvalidJson}
                              >
                                <option value="">Seleccioná un KPI Grupal</option>
                                {(scopeKpis || []).map((scopeKpi: any) => (
                                  <option key={scopeKpi.id} value={scopeKpi.id}>
                                    {scopeKpi.name} · {scopeKpi.orgScopeName || `Scope #${scopeKpi.orgScopeId}`} ·{' '}
                                    {scopeKpi.periodName || `Período #${scopeKpi.periodId}`}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <button
                                className="btn-secondary"
                                type="button"
                                onClick={() => removeTargetMappingRow(index)}
                                disabled={targetParamsInvalidJson}
                              >
                                Eliminar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="helper-text" style={{ marginTop: 10 }}>
                      Sin filas configuradas. Agregá una fila para mapear claves externas a asignaciones o Scope KPIs.
                    </div>
                  )}
                  {targetUnresolvedMappingRows.length > 0 ? (
                    <>
                      <div className="form-warning" style={{ marginTop: 10 }}>
                        Hay <strong>{targetUnresolvedMappingRows.length}</strong> filas del <code>targetMap</code> sin destino
                        asignado. Completalas o eliminá las que no quieras usar.
                      </div>
                      <div className="preview-box" style={{ marginTop: 10 }}>
                        <div className="muted">
                          Podés crear mappings explícitos de <code>data_source_mappings</code> para{' '}
                          <strong>{getMappingSourceTypeLabel(targetExplicitMappingSourceType)}</strong> sin salir del modal.
                          Eso guarda la clave externa para futuros previews y además resuelve estas filas ahora.
                        </div>
                        <table className="config-table" style={{ marginTop: 10 }}>
                          <thead>
                            <tr>
                              <th>Clave externa</th>
                              <th>Destino a persistir</th>
                              <th>Se guarda sobre</th>
                            </tr>
                          </thead>
                          <tbody>
                            {targetUnresolvedMappingRows.map((row) => {
                              const rowKey = explicitRowKey(row)
                              const pending = pendingExplicitMappings[rowKey]
                              return (
                                <tr key={`pending-mapping-${rowKey}`}>
                                  <td>
                                    <strong>{row.externalKey || 'Sin clave'}</strong>
                                    <div className="helper-text">
                                      {row.ownerType === 'assignment'
                                        ? 'La clave se guardará contra el colaborador base de la asignación elegida.'
                                        : 'La clave se guardará contra el org scope base del Scope KPI elegido.'}
                                    </div>
                                  </td>
                                  <td>
                                    {row.ownerType === 'assignment' ? (
                                      <select
                                        value={pending?.entityId || ''}
                                        onChange={(e) =>
                                          setPendingExplicitMappings((prev) => ({
                                            ...prev,
                                            [rowKey]: {
                                              externalKey: row.externalKey,
                                              ownerType: row.ownerType,
                                              entityId: e.target.value,
                                            },
                                          }))
                                        }
                                        disabled={targetParamsInvalidJson || saveExplicitTargetMappings.isLoading}
                                      >
                                        <option value="">Selecciona una asignación</option>
                                        {assignmentGroupsForTarget.map((assignment: any) => (
                                          <option key={`pending-assignment-${assignment.id}`} value={assignment.id}>
                                            {assignment.collaboratorName || `Colaborador #${assignment.collaboratorId}`} ·{' '}
                                            {assignment.kpiName || `KPI #${assignment.kpiId}`} ·{' '}
                                            {assignment.periodName || `Período #${assignment.periodId}`}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <select
                                        value={pending?.entityId || ''}
                                        onChange={(e) =>
                                          setPendingExplicitMappings((prev) => ({
                                            ...prev,
                                            [rowKey]: {
                                              externalKey: row.externalKey,
                                              ownerType: row.ownerType,
                                              entityId: e.target.value,
                                            },
                                          }))
                                        }
                                        disabled={targetParamsInvalidJson || saveExplicitTargetMappings.isLoading}
                                      >
                                        <option value="">Seleccioná un KPI Grupal</option>
                                        {(scopeKpis || []).map((scopeKpi: any) => (
                                          <option key={`pending-scope-${scopeKpi.id}`} value={scopeKpi.id}>
                                            {scopeKpi.name} · {scopeKpi.orgScopeName || `Scope #${scopeKpi.orgScopeId}`} ·{' '}
                                            {scopeKpi.periodName || `Período #${scopeKpi.periodId}`}
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </td>
                                  <td>
                                    {pending?.entityId ? (
                                      <span className="status-pill ok">
                                        {row.ownerType === 'assignment'
                                          ? collaboratorById.get(
                                              Number(assignmentGroupById.get(Number(pending.entityId))?.collaboratorId || 0)
                                            )?.name || 'Colaborador'
                                          : scopeById.get(
                                              Number(scopeKpiById.get(Number(pending.entityId))?.orgScopeId || 0)
                                            )?.name || 'Org scope'}
                                      </span>
                                    ) : (
                                      <span className="muted">Pendiente</span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                        <div className="action-buttons" style={{ marginTop: 10 }}>
                          <button
                            className="btn-secondary"
                            type="button"
                            onClick={() => saveExplicitTargetMappings.mutate()}
                            disabled={
                              targetParamsInvalidJson ||
                              saveExplicitTargetMappings.isLoading ||
                              pendingExplicitMappingSelectionsCount === 0
                            }
                          >
                            {saveExplicitTargetMappings.isLoading
                              ? 'Guardando mappings...'
                              : `Guardar mappings explícitos y resolver (${pendingExplicitMappingSelectionsCount})`}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
              {supportsTargetMappingEditor ? (
                <div className="form-group" style={{ marginTop: 12 }}>
                  <div className="action-buttons">
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => previewTargetDraft.mutate()}
                      disabled={previewTargetDraft.isLoading || targetParamsInvalidJson}
                    >
                      {previewTargetDraft.isLoading ? 'Probando...' : 'Probar params'}
                    </button>
                    {Array.isArray(targetDraftPreviewResult?.sourceMeta?.previewRows) &&
                    targetDraftPreviewResult.sourceMeta.previewRows.length > 0 ? (
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() => importPreviewRowsToMapping(targetDraftPreviewResult)}
                      >
                        Cargar claves desde preview
                      </button>
                    ) : null}
                    {Array.isArray(targetDraftPreviewResult?.sourceMeta?.unmappedKeys) &&
                    targetDraftPreviewResult.sourceMeta.unmappedKeys.length > 0 ? (
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() => importPreviewRowsToMapping(targetDraftPreviewResult, 'unmapped')}
                      >
                        Agregar solo faltantes
                      </button>
                    ) : null}
                  </div>
                  <div className="helper-text">
                    El preview usa la plantilla seleccionada y los params actuales del modal, sin necesidad de guardar el
                    target antes.
                  </div>
                  {targetDraftPreviewMessage ? <div className="form-error">{targetDraftPreviewMessage}</div> : null}
                  {targetDraftPreviewResult ? (
                    <div className="preview-box" style={{ marginTop: 10 }}>
                      <div className="muted">
                        {targetDraftPreviewResult.sourceMeta
                          ? `Valor preview: ${targetDraftPreviewResult.computed}`
                          : `A: ${targetDraftPreviewResult.testsTotal} · B: ${targetDraftPreviewResult.storiesTotal} · Valor: ${targetDraftPreviewResult.computed}`}
                      </div>
                      <div className="muted">
                        Rango: {targetDraftPreviewResult.from} → {targetDraftPreviewResult.to}
                      </div>
                      <PreviewSourceMeta sourceMeta={targetDraftPreviewResult.sourceMeta} />
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="helper-text">
                Periodo calculado: <strong>{targetPeriodPreview.period}</strong> · Rango: {targetPeriodPreview.from} →{' '}
                {targetPeriodPreview.to}.
              </div>
              <div className="form-hint">
                {targetResolvedSubperiod ? (
                  <>
                    Subperíodo destino: <strong>{targetResolvedSubperiod.name}</strong> ·{' '}
                    {targetResolvedSubperiod.startDate} → {targetResolvedSubperiod.endDate}
                  </>
                ) : (
                  <>Subperíodo destino: se resolverá al ejecutar (no hay calendario asociado o subperíodos).</>
                )}
              </div>
              {assignmentForTarget?.subPeriodId && (
                <div className="form-warning">
                  Esta asignación pertenece a un subperíodo específico. Para que el mes se resuelva automáticamente,
                  seleccioná la asignación base (sin subperíodo).
                </div>
              )}
              {scopeKpiForTarget?.subPeriodId && (
                <div className="form-warning">
                  Este Scope KPI pertenece a un subperíodo específico. Si querés resolución mensual automática,
                  usá un Scope KPI base sin subperíodo.
                </div>
              )}
              {targetAssignmentBlocked ? (
                <div className="form-error">
                  Hay multiples users en params. Para asignacion individual, crea un target por persona o quita la asignacion.
                </div>
              ) : null}
              {targetParamsInvalidJson ? (
                <div className="form-error">El JSON de params no es válido.</div>
              ) : null}
              {targetRequiresStructuredParams && targetMissingParamKeys.length > 0 ? (
                <div className="form-error">
                  Faltan params requeridos para la plantilla: {targetMissingParamKeys.join(', ')}
                </div>
              ) : null}
              {targetForm.assignmentId && targetForm.scopeKpiId ? (
                <div className="form-error">El target no puede apuntar a asignación y KPI Grupal al mismo tiempo.</div>
              ) : null}
              {targetDirectDestinationBlockedByMapping ? (
                <div className="form-error">
                  Si configurás mapping por filas, quitá el destino directo del target. Cada fila debe resolver su propia
                  asignación o Scope KPI.
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
                disabled={
                  !targetResolvedScopeName ||
                  saveTarget.isLoading ||
                  targetAssignmentBlocked ||
                  targetDirectDestinationBlockedByMapping ||
                  Boolean(targetForm.assignmentId && targetForm.scopeKpiId) ||
                  targetParamsInvalidJson ||
                  (targetRequiresStructuredParams && targetMissingParamKeys.length > 0)
                }
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
                    <option value="looker">Looker</option>
                    <option value="generic_api">Generic API</option>
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
                ) : authForm.connector === 'looker' ? (
                  <div className="helper-text">Ejemplo: https://mi-looker.empresa.com o https://mi-looker.empresa.com/api/4.0</div>
                ) : authForm.connector === 'generic_api' ? (
                  <div className="helper-text">Ejemplo: https://api.empresa.com o https://tu-looker/api/4.0</div>
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
              {authForm.connector === 'looker' && (
                <div className="form-row">
                  <div className="form-group">
                    <label>Client ID</label>
                    <input
                      value={authForm.authConfig.clientId}
                      onChange={(e) =>
                        setAuthForm((prev) => ({
                          ...prev,
                          authConfig: { ...prev.authConfig, clientId: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Client Secret</label>
                    <input
                      type="password"
                      value={authForm.authConfig.clientSecret}
                      onChange={(e) =>
                        setAuthForm((prev) => ({
                          ...prev,
                          authConfig: { ...prev.authConfig, clientSecret: e.target.value },
                        }))
                      }
                    />
                  </div>
                </div>
              )}
              {authForm.connector === 'looker' && (
                <div className="helper-text">
                  Si cargás `clientId/clientSecret`, KPI Manager hace `POST /api/4.0/login`. También podés usar token directo.
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
                    disabled={periodsLoading || !periods?.length}
                    onChange={(e) =>
                      setSelectedPeriodForCalendar(e.target.value ? Number(e.target.value) : '')
                    }
                  >
                    <option value="">
                      {periodsLoading
                        ? 'Cargando períodos...'
                        : periods?.length
                          ? 'Selecciona un período'
                          : 'No hay períodos disponibles'}
                    </option>
                    {periods?.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {periodsError ? (
                    <div className="form-error">No se pudieron cargar los períodos.</div>
                  ) : null}
                  {!periodsLoading && !periodsError && (!periods || periods.length === 0) ? (
                    <div className="form-hint">
                      No hay períodos creados. Primero tenés que crear uno en la pantalla Períodos.
                    </div>
                  ) : null}
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

              {!selectedPeriodForCalendar && periods && periods.length > 0 && (
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
                    {targetPreviewResult.sourceMeta
                      ? `Valor: ${targetPreviewResult.computed}`
                      : `A: ${targetPreviewResult.testsTotal} · B: ${targetPreviewResult.storiesTotal} · Valor: ${targetPreviewResult.computed}`}
                  </div>
                  <div className="muted">
                    Rango: {targetPreviewResult.from} → {targetPreviewResult.to}
                  </div>
                  {targetPreviewResult.warnings?.length ? (
                    <div className="form-error">{targetPreviewResult.warnings.join(' · ')}</div>
                  ) : null}
                  {targetPreviewResult.sourceMeta ? (
                    <PreviewSourceMeta sourceMeta={targetPreviewResult.sourceMeta} />
                  ) : (
                    <>
                      <div className="preview-jql">
                        <strong>Filtro A</strong>
                        <pre>{targetPreviewResult.testsJql}</pre>
                      </div>
                      <div className="preview-jql">
                        <strong>Filtro B</strong>
                        <pre>{targetPreviewResult.storiesJql}</pre>
                      </div>
                    </>
                  )}
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
              <h2>{editingScope ? 'Editar unidad' : 'Nueva unidad organizacional'}</h2>
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
                    <option value="company">Empresa</option>
                    <option value="area">Área</option>
                    <option value="team">Equipo</option>
                    <option value="person">Persona</option>
                    <option value="product">Producto</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Depende de (unidad superior)</label>
                <select
                  value={scopeForm.parentId}
                  onChange={(e) => setScopeForm((prev) => ({ ...prev, parentId: e.target.value }))}
                >
                  <option value="">Es una unidad raíz (sin superior)</option>
                  {orgScopes?.map((scope) => (
                    <option key={scope.id} value={scope.id}>
                      {scope.type} · {scope.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Calendario de medición</label>
                <select
                  value={scopeForm.calendarProfileId}
                  onChange={(e) =>
                    setScopeForm((prev) => ({ ...prev, calendarProfileId: e.target.value }))
                  }
                >
                  <option value="">Sin calendario específico (hereda del superior)</option>
                  {calendarProfiles?.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
                <small className="form-hint">
                  Define con qué frecuencia se miden los KPIs de esta unidad (mensual, trimestral, etc.).
                </small>
              </div>
              <button
                type="button"
                className="scope-advanced-toggle"
                onClick={() => setScopeAdvancedOpen((v) => !v)}
              >
                <span>{scopeAdvancedOpen ? '▲' : '▼'}</span>
                {scopeAdvancedOpen ? 'Ocultar' : 'Mostrar'} opciones avanzadas
                <span className="scope-advanced-hint">Solo para integraciones externas (Jira, Sheets, etc.)</span>
              </button>
              {scopeAdvancedOpen && (
                <>
                  <div className="form-group">
                    <label>Parámetros de integración (JSON)</label>
                    <textarea
                      rows={4}
                      value={scopeForm.metadataText}
                      onChange={(e) => setScopeForm((prev) => ({ ...prev, metadataText: e.target.value }))}
                      placeholder='{"projects":["GT_MISIM"],"authProfileId":1}'
                    />
                    <small className="form-hint">
                      Parámetros extra que hereda esta unidad al ejecutar integraciones. Dejalo vacío si no usás conectores.
                    </small>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Conector externo</label>
                      <select
                        value={scopeMappingSourceType}
                        onChange={(e) => setScopeMappingSourceType(normalizeMappingSourceType(e.target.value))}
                      >
                        {MAPPING_SOURCE_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Alias en el conector</label>
                      <input
                        value={scopeExternalKeysBySourceType[scopeMappingSourceType] || ''}
                        onChange={(e) => updateScopeExternalKeysForSourceType(e.target.value)}
                        placeholder="revenue, cs, customer success"
                      />
                      <small className="form-hint">
                        Nombre o código con el que esta unidad aparece en {getMappingSourceTypeLabel(scopeMappingSourceType)}.
                      </small>
                    </div>
                  </div>
                </>
              )}
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
                {saveScope.isLoading ? 'Guardando...' : 'Guardar unidad'}
              </button>
            </div>
          </div>
        </div>
      )}

      {sheetsWizardOpen && (
        <SheetsWizard
          onClose={() => setSheetsWizardOpen(false)}
          onSuccess={() => setSheetsWizardOpen(false)}
        />
      )}
    </div>
  )
}
