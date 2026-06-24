import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Trans, useTranslation } from 'react-i18next'
import i18n from '../i18n'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import SubPeriodForm from '../components/SubPeriodForm'
import { useDialog } from '../components/Dialog'
import SheetsWizard from '../components/SheetsWizard'
import SlackWizard from '../components/SlackWizard'
import { closeOnOverlayClick, markOverlayPointerDown } from '../utils/modal'
import './Configuracion.css'
import { PreviewSourceMeta } from './configuracion/PreviewSourceMeta'
import {
  buildTemplatePreset,
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
import { resolveApiErrorMessage } from '../utils/apiErrors'

const TEMPLATE_API_ERROR_KEYS: Record<string, string> = {
  INTEGRATION_TEMPLATE_NAME_REQUIRED: 'config:api_errors.template_name_required',
  INTEGRATION_TEMPLATE_CRON_INVALID: 'config:api_errors.template_cron_invalid',
  INTEGRATION_TEMPLATE_CREATE_FAILED: 'config:errors.save_template',
  INTEGRATION_TEMPLATE_UPDATE_FAILED: 'config:errors.save_template',
}

const DATASOURCE_MAPPING_API_ERROR_KEYS: Record<string, string> = {
  DATASOURCE_MAPPING_ENTITY_TYPE_INVALID: 'config:api_errors.mapping_entity_type_invalid',
  DATASOURCE_MAPPING_ENTITY_ID_REQUIRED: 'config:api_errors.mapping_entity_id_required',
  DATASOURCE_MAPPING_ENTITY_NOT_FOUND: 'config:api_errors.mapping_entity_not_found',
  DATASOURCE_MAPPING_ITEMS_REQUIRED: 'config:api_errors.mapping_items_required',
}

const ORG_SCOPE_API_ERROR_KEYS: Record<string, string> = {
  ORG_SCOPE_NAME_EXISTS: 'config:api_errors.org_name_exists',
  ORG_SCOPE_COMPANY_ALREADY_EXISTS: 'config:api_errors.org_company_exists',
  ORG_SCOPE_COMPANY_PARENT_INVALID: 'config:api_errors.org_company_parent_invalid',
  ORG_SCOPE_DELETE_HAS_CHILDREN: 'config:api_errors.org_delete_has_children',
  ORG_SCOPE_DELETE_HAS_COLLABORATORS: 'config:api_errors.org_delete_has_collaborators',
  ORG_SCOPE_DELETE_HAS_ASSIGNMENTS: 'config:api_errors.org_delete_has_assignments',
  ORG_SCOPE_DELETE_HAS_TARGETS: 'config:api_errors.org_delete_has_targets',
}

const INTEGRATION_TEMPLATE_TEST_API_ERROR_KEYS: Record<string, string> = {
  INTEGRATION_TEMPLATE_NOT_FOUND: 'config:api_errors.template_not_found',
  INTEGRATION_TEMPLATE_TEST_REQUIRED_FIELDS: 'config:api_errors.template_test_required_fields',
  INTEGRATION_TEMPLATE_TEST_RATIO_REQUIRED: 'config:api_errors.template_test_ratio_required',
}

const EMAIL_TEST_API_ERROR_KEYS: Record<string, string> = {
  NOTIFICATION_EMAIL_SMTP_NOT_CONFIGURED: 'config:api_errors.email_smtp_not_configured',
  NOTIFICATION_EMAIL_SMTP_CONNECTION_FAILED: 'config:api_errors.email_smtp_connection_failed',
  NOTIFICATION_EMAIL_TO_REQUIRED: 'config:api_errors.email_to_required',
}

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
const ORG_SCOPE_TYPE_LABELS: Record<string, string> = {
  company: 'Empresa',
  area: 'Área',
  team: 'Equipo',
  business_unit: 'Unidad de negocio',
  person: 'Persona',
  product: 'Producto',
}

const getOrgScopeTypeLabel = (type?: string | null) =>
  i18n.t(`security:scope_types.${String(type || '').trim().toLowerCase()}`, {
    defaultValue:
      ORG_SCOPE_TYPE_LABELS[String(type || '').trim().toLowerCase()] ||
      i18n.t('config:scope_modal.unknown_type') ||
      type ||
      'Sin tipo',
  })

const THEMES = [
  { id: 'navy-teal',    label: 'Navy + Teal',      primary: '#0891b2', nav: '#0f2d4a', dark: false },
  { id: 'orange',       label: 'Naranja',           primary: '#f97316', nav: '#1a0e05', dark: false },
  { id: 'indigo',       label: 'Índigo + Violeta',  primary: '#6366f1', nav: '#1e1b4b', dark: false },
  { id: 'emerald',      label: 'Esmeralda',         primary: '#059669', nav: '#0a2e1e', dark: false },
  { id: 'fuchsia-dark', label: 'Fucsia Oscuro',     primary: '#ec4899', nav: '#160d1e', dark: true  },
  { id: 'lime-dark',    label: 'Verde Oscuro',      primary: '#22c55e', nav: '#0a1a0c', dark: true  },
  { id: 'orange-dark',  label: 'Naranja Oscuro',    primary: '#f97316', nav: '#1a0c00', dark: true  },
  { id: 'gold-dark',    label: 'Gold Oscuro',       primary: '#eab308', nav: '#1a1800', dark: true  },
] as const

export default function Configuracion() {
  const { t } = useTranslation(['config', 'common', 'security', 'datasource'])
  const { user } = useAuth()
  const dialog = useDialog()
  const queryClient = useQueryClient()
  const [selectedTheme, setSelectedTheme] = useState<string>(user?.companyTheme ?? 'navy-teal')
  const [themeSaving, setThemeSaving] = useState(false)
  const [themeSaved, setThemeSaved] = useState(false)
  const getConnectorLabel = (connector?: string | null) =>
    connector ? t(`config:options.connectors.${connector}`, { defaultValue: connector }) : '-'
  const getMetricTypeLabel = (metricType?: string | null) =>
    metricType ? t(`config:options.metric_types.${metricType}`, { defaultValue: metricType }) : '-'
  const getAuthTypeLabel = (authType?: string | null) =>
    authType ? t(`config:options.auth_types.${authType}`, { defaultValue: authType }) : '-'
  const getFrequencyLabel = (frequency?: string | null) =>
    frequency ? t(`config:options.frequencies.${frequency}`, { defaultValue: frequency }) : '-'
  const getRunStatusLabel = (status?: string | null) =>
    status ? t(`config:options.run_status.${status}`, { defaultValue: status }) : '-'
  const getConfigSourceTypeLabel = (sourceType?: string | null) =>
    sourceType
      ? t(`datasource:source_types.${normalizeMappingSourceType(sourceType)}`, {
          defaultValue: getMappingSourceTypeLabel(sourceType),
        })
      : '-'
  const getPresetLabel = (preset: TemplatePreset) =>
    t(`config:template_modal.quick_template_labels.${preset}`, {
      defaultValue: preset,
    })
  const getTemplatePrimaryLabel = (connector?: string | null) => {
    if (connector === 'jira' || connector === 'xray') return t('config:template_modal.labels.filter_a')
    if (connector === 'generic_api') return t('config:template_modal.labels.request_config')
    if (connector === 'looker') return t('config:template_modal.labels.looker_config')
    return t('config:template_modal.labels.config_a')
  }
  const getTemplateSecondaryLabel = (connector?: string | null) => {
    if (connector === 'jira' || connector === 'xray') return t('config:template_modal.labels.filter_b')
    return t('config:template_modal.labels.config_b')
  }
  const getTemplatePrimaryHint = (connector?: string | null, metricType?: string | null) => {
    if (connector === 'jira' || connector === 'xray') {
      if (metricType === 'sla') return t('config:template_modal.examples.primary_sla_jira')
      if (metricType === 'ratio') return t('config:template_modal.examples.primary_ratio_jira')
      return t('config:template_modal.examples.primary_default_jira')
    }
    if (connector === 'generic_api') return t('config:template_modal.examples.primary_generic_api')
    if (connector === 'looker') return t('config:template_modal.examples.primary_looker')
    return t('config:template_modal.examples.primary_default')
  }
  const getTemplateSecondaryHint = (connector?: string | null, metricType?: string | null) => {
    if (connector === 'jira' || connector === 'xray') {
      if (metricType === 'sla') return t('config:template_modal.examples.secondary_sla_jira')
      return t('config:template_modal.examples.secondary_default_jira')
    }
    if (connector === 'generic_api') return t('config:template_modal.examples.secondary_generic_api')
    if (connector === 'looker') return t('config:template_modal.examples.secondary_looker')
    return t('config:template_modal.examples.secondary_default')
  }
  const getTemplateSingleConfigHint = (connector?: string | null, metricType?: string | null) => {
    if (metricType === 'manual') return t('config:template_modal.examples.single_manual')
    if (connector === 'generic_api') return t('config:template_modal.examples.single_generic_api')
    if (connector === 'looker') return t('config:template_modal.examples.single_looker')
    return t('config:template_modal.examples.single_default')
  }
  const getAuthEndpointHint = (connector?: string | null) => {
    if (connector === 'sheets') return t('config:auth_modal.endpoint_hints.sheets')
    if (connector === 'looker') return t('config:auth_modal.endpoint_hints.looker')
    if (connector === 'generic_api') return t('config:auth_modal.endpoint_hints.generic_api')
    return t('config:auth_modal.endpoint_hints.default')
  }
  const getAuthProfileHint = (connector?: string | null) => {
    if (connector === 'jira' || connector === 'xray') return t('config:auth_modal.auth_profile_hints.jira_xray')
    if (connector === 'sheets') return t('config:auth_modal.auth_profile_hints.sheets')
    if (connector === 'generic_api') return t('config:auth_modal.auth_profile_hints.generic_api')
    if (connector === 'looker') return t('config:auth_modal.auth_profile_hints.looker')
    if (connector === 'manual') return t('config:auth_modal.auth_profile_hints.manual')
    return ''
  }
  const formatAssignmentOptionLabel = (assignment: any) =>
    `${assignment.collaboratorName || t('config:target_modal.fallbacks.collaborator', { id: assignment.collaboratorId })} · ${
      assignment.kpiName || t('config:target_modal.fallbacks.kpi', { id: assignment.kpiId })
    } · ${assignment.periodName || t('config:target_modal.fallbacks.period', { id: assignment.periodId })}`
  const formatScopeKpiOptionLabel = (scopeKpi: any) =>
    `${scopeKpi.name} · ${
      scopeKpi.orgScopeName || t('config:target_modal.fallbacks.scope', { id: scopeKpi.orgScopeId })
    } · ${scopeKpi.periodName || t('config:target_modal.fallbacks.period', { id: scopeKpi.periodId })}`
  const formatTargetScopeLabel = (scopeType?: string | null, scopeName?: string | null) =>
    `${getOrgScopeTypeLabel(scopeType)} · ${scopeName || '-'}`
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
  const [slackWizardOpen, setSlackWizardOpen] = useState(false)
  const [emailTestLoading, setEmailTestLoading] = useState(false)
  const [emailTestResult, setEmailTestResult] = useState<{ ok?: boolean; to?: string; error?: string } | null>(null)
  const [emailTestTo, setEmailTestTo] = useState('')
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
  const [scopeSearch, setScopeSearch] = useState('')
  const [scopeTypeFilter, setScopeTypeFilter] = useState('all')
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
  }, { enabled: activeIntegrationTab === 'targets' })

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

  const { data: emailStatus } = useQuery<{ configured: boolean; from: string | null; host: string | null }>(
    'email-status',
    async () => (await api.get('/notifications/email-status')).data
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
        label: t('config:guide.checklist.areas_label'),
        description: t('config:guide.checklist.areas_desc'),
        ready: activeAreaScopes.length > 0,
      },
      {
        id: 'collaborators',
        label: t('config:guide.checklist.collaborators_label'),
        description: t('config:guide.checklist.collaborators_desc'),
        ready: Boolean(collaborators?.length),
      },
      {
        id: 'periods',
        label: t('config:guide.checklist.periods_label'),
        description: t('config:guide.checklist.periods_desc'),
        ready: Boolean(periods?.length),
      },
      {
        id: 'assignments',
        label: t('config:guide.checklist.assignments_label'),
        description: t('config:guide.checklist.assignments_desc'),
        ready: Boolean(assignments?.length),
      },
    ],
    [activeAreaScopes.length, assignments?.length, collaborators?.length, periods?.length, t]
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

  const existingCompanyScope = useMemo(() => {
    const editingScopeId = editingScope?.id ? Number(editingScope.id) : null
    return (orgScopes || []).find(
      (scope) => scope.type === 'company' && Number(scope.id) !== Number(editingScopeId || 0)
    ) || null
  }, [editingScope?.id, orgScopes])

  const scopeChildCount = useMemo(() => {
    const counts = new Map<number, number>()
    orgScopes?.forEach((scope) => {
      if (scope.parentId) counts.set(scope.parentId, (counts.get(scope.parentId) || 0) + 1)
    })
    return counts
  }, [orgScopes])

  const scopeTypeOptions = useMemo(() => {
    const uniqueTypes = Array.from(new Set((orgScopes || []).map((scope) => String(scope.type || '').trim()).filter(Boolean)))
    return uniqueTypes.sort((a, b) => getOrgScopeTypeLabel(a).localeCompare(getOrgScopeTypeLabel(b), 'es'))
  }, [orgScopes])

  const filteredOrgScopes = useMemo(() => {
    if (!orgScopes) return []
    const normalizedSearch = normalizeExternalMatchKey(scopeSearch)

    return orgScopes.filter((scope) => {
      const matchesType = scopeTypeFilter === 'all' || String(scope.type) === scopeTypeFilter
      if (!matchesType) return false
      if (!normalizedSearch) return true

      const parentName = scope.parentId ? scopeById.get(Number(scope.parentId))?.name || '' : ''
      const searchTokens = [
        scope.name,
        scope.type,
        getOrgScopeTypeLabel(scope.type),
        parentName,
      ]
        .map((value) => normalizeExternalMatchKey(value))
        .join(' ')

      return searchTokens.includes(normalizedSearch)
    })
  }, [orgScopes, scopeById, scopeSearch, scopeTypeFilter])

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
  }, [templateForm.connector, t])

  const selectedTargetTemplate = useMemo(() => {
    const templateId = Number(targetForm.templateId || selectedTemplateId || 0)
    if (!templateId) return null
    return templates?.find((template) => Number(template.id) === templateId) || null
  }, [templates, targetForm.templateId, selectedTemplateId])

  const convertJqlToParams = () => {
    const jql = rawJqlInput.trim()
    if (!jql) {
      setTargetFormError(t('config:errors.paste_jql'))
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
        setTargetFormError(t('config:errors.invalid_params_json_editor'))
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
      mode === 'unmapped'
        ? t('config:messages.preview_rows_unmapped_loaded', { count: nextRows.length })
        : t('config:messages.preview_rows_loaded', { count: nextRows.length })
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
        setTemplateFormError(resolveApiErrorMessage(error, t, {
          codeMap: TEMPLATE_API_ERROR_KEYS,
          fallbackKey: 'config:errors.save_template',
        }))
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
        throw new Error(t('config:errors.required_params', { keys: targetMissingParamKeys.join(', ') }))
      }
      if (targetParamsInvalidJson) {
        throw new Error(t('config:errors.invalid_params_json'))
      }
      if (targetForm.assignmentId && usersCount > 1) {
        throw new Error(t('config:errors.multiple_users_assignment'))
      }
      if (parsedParams?.targetMap && (targetForm.assignmentId || targetForm.scopeKpiId)) {
        throw new Error(t('config:errors.mapping_and_direct_destination'))
      }
      if (targetForm.assignmentId && targetForm.scopeKpiId) {
        throw new Error(t('config:errors.single_destination_only'))
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
        setTargetFormError(error?.message || t('config:errors.save_target'))
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
        throw new Error(t('config:errors.select_mapping_destination'))
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
            throw new Error(t('config:errors.assignment_unavailable', { key: row.externalKey }))
          }
          const collaboratorId = Number(assignment.collaboratorId || 0)
          if (!collaboratorId) {
            throw new Error(t('config:errors.base_collaborator_unresolved', { key: row.externalKey }))
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
          throw new Error(t('config:errors.scope_kpi_unavailable', { key: row.externalKey }))
        }
        const orgScopeId = Number(scopeKpi.orgScopeId || 0)
        if (!orgScopeId) {
          throw new Error(t('config:errors.base_scope_unresolved', { key: row.externalKey }))
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
        setToastMessage(t('config:messages.explicit_mappings_saved', { count: result.rowCount }))
        setTimeout(() => setToastMessage(''), 2500)
      },
      onError: (error: any) => {
        setTargetFormError(
          resolveApiErrorMessage(error, t, {
            codeMap: DATASOURCE_MAPPING_API_ERROR_KEYS,
            fallbackKey: 'config:errors.save_explicit_mappings',
            fallbackValue: error?.message || t('config:errors.save_explicit_mappings'),
          })
        )
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
        setToastMessage(
          skipped
            ? t('config:messages.targets_created_with_existing', { created, skipped })
            : t('config:messages.targets_created', { count: created })
        )
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
      setToastMessage(t('config:messages.no_changes_to_apply'))
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
      setToastMessage(t('config:messages.targets_enabled', { count: toEnable.length }))
      setTimeout(() => setToastMessage(''), 2500)
    }
  }

  const openTargetWizard = (target: IntegrationTarget) => {
    if (!target.params?.users || !Array.isArray(target.params.users)) {
      setToastMessage(t('config:errors.target_missing_users'))
      setTimeout(() => setToastMessage(''), 2500)
      return
    }
    const users = target.params.users.filter((user: any) => user)
    if (users.length === 0) {
      setToastMessage(t('config:messages.no_users_to_duplicate'))
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
        setToastMessage(
          skipped
            ? t('config:messages.targets_created_with_skipped', { created, skipped })
            : t('config:messages.targets_created', { count: created })
        )
        setTimeout(() => setToastMessage(''), 2500)
        setShowTargetWizard(false)
        setWizardTarget(null)
        setWizardRows([])
      },
      onError: (error: any) => {
        setToastMessage(error?.message || t('config:messages.create_targets_error'))
        setTimeout(() => setToastMessage(''), 2500)
      },
    }
  )

  const duplicateTargetByUsers = useMutation(
    async (target: IntegrationTarget) => {
      if (!target.params?.users || !Array.isArray(target.params.users)) {
        throw new Error(t('config:errors.target_missing_users'))
      }
      const users = target.params.users.filter((user: any) => user)
      if (users.length <= 1) {
        throw new Error(t('config:errors.target_min_users'))
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
        setToastMessage(
          skipped
            ? t('config:messages.targets_by_user_with_skipped', { created, skipped })
            : t('config:messages.targets_by_user', { created })
        )
        setTimeout(() => setToastMessage(''), 2500)
      },
      onError: (error: any) => {
        setToastMessage(error?.message || t('config:messages.duplicate_targets_error'))
        setTimeout(() => setToastMessage(''), 2500)
      },
    }
  )

  const createTargetsNewAreas = async () => {
    if (!selectedTemplateId) return
    if (missingAreaScopes.length === 0) {
      setToastMessage(t('config:messages.no_new_areas'))
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
        setToastMessage(
          updated ? t('config:messages.targets_deactivated', { count: updated }) : t('config:messages.no_targets_to_deactivate')
        )
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
          void dialog.alert(data.warning, { title: t('config:dialog_titles.warning'), variant: 'warning' })
        }
      },
      onError: (error: any) => {
        void dialog.alert(
          resolveApiErrorMessage(error, t, {
            codeMap: ORG_SCOPE_API_ERROR_KEYS,
            fallbackKey: 'config:org.save_error',
          }),
          { title: t('common:error_title'), variant: 'danger' }
        )
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
        void dialog.alert(
          resolveApiErrorMessage(error, t, {
            codeMap: ORG_SCOPE_API_ERROR_KEYS,
            fallbackKey: 'config:org.delete_error',
          }),
          { title: t('common:error_title'), variant: 'danger' }
        )
      },
    }
  )

  const deleteScopeCascade = useMutation(
    async (scope: any) => {
      await api.delete(`/org-scopes/${scope.id}/cascade`)
      return scope
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('org-scopes')
        queryClient.invalidateQueries('organigrama-collaborators')
      },
      onError: (error: any) => {
        void dialog.alert(
          resolveApiErrorMessage(error, t, {
            codeMap: ORG_SCOPE_API_ERROR_KEYS,
            fallbackKey: 'config:org.delete_error',
          }),
          { title: t('common:error_title'), variant: 'danger' }
        )
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
        setToastMessage(t('config:messages.target_run_success'))
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
        setTargetPreviewMessage(
          resolveApiErrorMessage(error, t, {
            codeMap: INTEGRATION_TEMPLATE_TEST_API_ERROR_KEYS,
            fallbackKey: 'config:messages.test_target_error',
            fallbackValue: error?.message || t('config:messages.test_target_error'),
          })
        )
      },
    }
  )

  const previewTargetDraft = useMutation(
    async () => {
      if (targetParamsInvalidJson) {
        throw new Error(t('config:errors.invalid_params_json'))
      }
      let parsedParams: any = {}
      if (targetForm.paramsText.trim()) {
        parsedParams = JSON.parse(targetForm.paramsText)
      }
      const templateId = Number(targetForm.templateId || selectedTemplateId)
      if (!templateId) {
        throw new Error(t('config:errors.select_template_to_test'))
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
        setTargetDraftPreviewMessage(
          resolveApiErrorMessage(error, t, {
            codeMap: INTEGRATION_TEMPLATE_TEST_API_ERROR_KEYS,
            fallbackKey: 'config:messages.test_params_error',
            fallbackValue: error?.message || t('config:messages.test_params_error'),
          })
        )
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
        <h1>{t('config:title')}</h1>
        <p className="subtitle">{t('config:restricted')}</p>
      </div>
    )
  }

  return (
    <div className="config-page">
      <div className="page-header">
        <div>
          <h1>{t('config:title')}</h1>
          <p className="subtitle">{t('config:subtitle')}</p>
        </div>
        <div className="config-header-actions">
          <button
            className={`setup-guide-toggle ${setupGuideOpen ? 'setup-guide-toggle--active' : ''}`}
            onClick={() => (setupGuideOpen ? hideSetupGuide() : showSetupGuide())}
            type="button"
          >
            {setupGuideOpen ? t('config:guide.hide') : t('config:guide.show')}
          </button>
        </div>
      </div>
      {toastMessage ? <div className="toast">{toastMessage}</div> : null}

      {setupGuideOpen && (
        <div
          className="modal-overlay"
          onPointerDown={markOverlayPointerDown}
          onClick={(e) => closeOnOverlayClick(e, hideSetupGuide)}
        >
          <div className="modal-content setup-guide-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{t('config:guide.title')}</h2>
                <p className="setup-guide-modal-subtitle">
                  {setupConfigured
                    ? t('config:guide.completed')
                    : t('config:guide.progress', { done: setupCompletedCount, total: setupChecklist.length })}
                </p>
              </div>
              <button className="close-button" onClick={hideSetupGuide}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="setup-guide">
                <div className="setup-guide-title">{t('config:guide.how_to')}</div>
                <ol className="setup-guide-steps">
                  <li>
                    <Trans
                      ns="config"
                      i18nKey="guide.steps.areas"
                      components={{ strong: <strong />, em: <em /> }}
                    />
                  </li>
                  <li>
                    <Trans
                      ns="config"
                      i18nKey="guide.steps.collaborators"
                      components={{ strong: <strong />, link: <a href="/colaboradores" /> }}
                    />
                  </li>
                  <li>
                    <Trans
                      ns="config"
                      i18nKey="guide.steps.kpis"
                      components={{ strong: <strong />, link: <a href="/kpis" /> }}
                    />
                  </li>
                  <li>
                    <Trans
                      ns="config"
                      i18nKey="guide.steps.periods"
                      components={{ strong: <strong />, link: <a href="/periodos" /> }}
                    />
                  </li>
                  <li>
                    <Trans
                      ns="config"
                      i18nKey="guide.steps.assignments"
                      components={{ strong: <strong />, link: <a href="/asignaciones" /> }}
                    />
                  </li>
                </ol>
                <p className="setup-guide-note">{t('config:guide.note')}</p>
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
                {t('config:guide.save_hide')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sheets-wizard-banner">
        <div className="sheets-wizard-banner-text">
          <span className="sheets-wizard-banner-icon">📊</span>
          <div>
            <strong>{t('config:banners.sheets_title')}</strong>
            <p>{t('config:banners.sheets_text')}</p>
          </div>
        </div>
        <button className="btn-primary" onClick={() => setSheetsWizardOpen(true)}>
          {t('config:banners.sheets_action')}
        </button>
      </div>

      <div className="sheets-wizard-banner">
        <div className="sheets-wizard-banner-text">
          <span className="sheets-wizard-banner-icon">💬</span>
          <div>
            <strong>{t('config:banners.slack_title')}</strong>
            <p>{t('config:banners.slack_text')}</p>
          </div>
        </div>
        <button className="btn-primary" onClick={() => setSlackWizardOpen(true)}>
          {t('config:banners.slack_action')}
        </button>
      </div>

      <div className="sheets-wizard-banner">
        <div className="sheets-wizard-banner-text">
          <span className="sheets-wizard-banner-icon">📧</span>
          <div>
            <strong>{t('config:banners.email_title')}</strong>
            {emailStatus?.configured ? (
              <p>{t('config:banners.email_active', { from: emailStatus.from, host: emailStatus.host })}</p>
            ) : (
              <p>{t('config:banners.email_inactive')}</p>
            )}
            {emailTestResult?.ok && (
              <p style={{ color: '#16a34a', marginTop: 6 }}>{t('config:banners.email_sent', { to: emailTestResult.to })}</p>
            )}
            {emailTestResult?.error && (
              <p style={{ color: '#dc2626', marginTop: 6 }}>{emailTestResult.error}</p>
            )}
          </div>
        </div>
        {emailStatus?.configured && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <input
              type="email"
              placeholder={t('config:banners.email_test_placeholder')}
              value={emailTestTo}
              onChange={(e) => setEmailTestTo(e.target.value)}
              style={{ padding: '6px 10px', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: 13, minWidth: 200 }}
            />
            <button
              className="btn-primary"
              disabled={emailTestLoading || !emailTestTo}
              onClick={async () => {
                setEmailTestLoading(true)
                setEmailTestResult(null)
                try {
                  const res = await api.post('/notifications/test-email', { to: emailTestTo })
                  setEmailTestResult({ ok: true, to: res.data.to })
                } catch (err: any) {
                  setEmailTestResult({
                    error: resolveApiErrorMessage(err, t, {
                      codeMap: EMAIL_TEST_API_ERROR_KEYS,
                      fallbackKey: 'config:banners.email_test_error',
                    }),
                  })
                } finally {
                  setEmailTestLoading(false)
                }
              }}
            >
              {emailTestLoading ? t('config:banners.email_test_sending') : t('config:banners.email_test_action')}
            </button>
          </div>
        )}
      </div>

      <div className="config-section">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Paleta de colores</h3>
              <p className="muted">Elige el tema visual para toda tu empresa. Se aplica a todos los usuarios.</p>
            </div>
            {themeSaved && <span style={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: 13 }}>Guardado</span>}
          </div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Claros</p>
          <div className="theme-palette-grid">
            {THEMES.filter(t => !t.dark).map((theme) => (
              <button
                key={theme.id}
                type="button"
                className={`theme-palette-card ${selectedTheme === theme.id ? 'theme-palette-card--active' : ''}`}
                onClick={() => {
                  setSelectedTheme(theme.id)
                  document.documentElement.setAttribute('data-theme', theme.id)
                }}
              >
                <div className="theme-palette-preview">
                  <div className="theme-palette-nav" style={{ background: theme.nav }} />
                  <div className="theme-palette-content" style={{ background: '#f9fafb' }}>
                    <div className="theme-palette-bar" style={{ background: theme.primary }} />
                    <div className="theme-palette-bar theme-palette-bar--short" style={{ background: theme.primary, opacity: 0.4 }} />
                    <div className="theme-palette-dot" style={{ background: theme.primary }} />
                  </div>
                </div>
                <span className="theme-palette-label">{theme.label}</span>
                {selectedTheme === theme.id && <span className="theme-palette-check">✓</span>}
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 14, marginBottom: 6 }}>Oscuros</p>
          <div className="theme-palette-grid">
            {THEMES.filter(t => t.dark).map((theme) => (
              <button
                key={theme.id}
                type="button"
                className={`theme-palette-card ${selectedTheme === theme.id ? 'theme-palette-card--active' : ''}`}
                onClick={() => {
                  setSelectedTheme(theme.id)
                  document.documentElement.setAttribute('data-theme', theme.id)
                }}
              >
                <div className="theme-palette-preview">
                  <div className="theme-palette-nav" style={{ background: theme.nav }} />
                  <div className="theme-palette-content" style={{ background: '#1e1e2e' }}>
                    <div className="theme-palette-bar" style={{ background: theme.primary }} />
                    <div className="theme-palette-bar theme-palette-bar--short" style={{ background: theme.primary, opacity: 0.5 }} />
                    <div className="theme-palette-dot" style={{ background: theme.primary }} />
                  </div>
                </div>
                <span className="theme-palette-label">{theme.label}</span>
                {selectedTheme === theme.id && <span className="theme-palette-check">✓</span>}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              className="btn-primary"
              disabled={themeSaving || selectedTheme === (user?.companyTheme ?? 'navy-teal')}
              onClick={async () => {
                setThemeSaving(true)
                setThemeSaved(false)
                try {
                  await api.patch('/config/company-theme', { theme: selectedTheme })
                  document.documentElement.setAttribute('data-theme', selectedTheme)
                  queryClient.invalidateQueries('currentUser')
                  setThemeSaved(true)
                  setTimeout(() => setThemeSaved(false), 2500)
                } finally {
                  setThemeSaving(false)
                }
              }}
            >
              {themeSaving ? 'Guardando...' : 'Aplicar tema'}
            </button>
            {selectedTheme !== (user?.companyTheme ?? 'navy-teal') && (
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                Vista previa — guarda para confirmar
              </span>
            )}
          </div>
        </div>
      </div>

      <button
        className="advanced-toggle"
        onClick={() => setIntegrationOpen((v) => !v)}
        aria-expanded={integrationOpen}
      >
        <span>{integrationOpen ? '▲' : '▼'}</span>
        {t('config:advanced.title')}
        <span className="advanced-toggle-hint">{t('config:advanced.hint')}</span>
      </button>

      {integrationOpen && (
      <div className="config-section" id="integraciones">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>{t('config:integrations.title')}</h3>
              <p className="muted">{t('config:integrations.subtitle')}</p>
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
                  {t('config:integrations.new_template')}
                </button>
              )}
              {activeIntegrationTab === 'targets' && (
                <>
                  <button
                    className="btn-secondary"
                    onClick={createTargetsAllAreas}
                    disabled={!selectedTemplateId || createTargetsForScopes.isLoading}
                  >
                    {t('config:integrations.create_targets_all')}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={createTargetsNewAreas}
                    disabled={!selectedTemplateId || createTargetsForScopes.isLoading}
                  >
                    {t('config:integrations.create_targets_new')}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => deactivateInactiveAreaTargets.mutate()}
                    disabled={!selectedTemplateId || deactivateInactiveAreaTargets.isLoading}
                  >
                    {t('config:integrations.deactivate_inactive')}
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
                    {t('config:integrations.new_target')}
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
                  {t('config:integrations.new_auth')}
                </button>
              )}
              {activeIntegrationTab === 'runs' && (
                <>
                  <button
                    className="btn-secondary"
                    onClick={async () => {
                      if (!selectedTemplateId) return
                      const ok = await dialog.confirm(t('config:integrations.dialogs.archive_errors'), { title: t('config:integrations.dialogs.archive_errors_title'), confirmLabel: t('config:integrations.archive_errors'), variant: 'warning' })
                      if (ok) archiveErrorRuns.mutate()
                    }}
                    disabled={!selectedTemplateId || archiveErrorRuns.isLoading}
                  >
                    {t('config:integrations.archive_errors')}
                  </button>
                  <button
                    className="btn-danger"
                    onClick={async () => {
                      if (!selectedTemplateId) return
                      const ok = await dialog.confirm(t('config:integrations.dialogs.delete_errors'), { title: t('config:integrations.dialogs.delete_errors_title'), confirmLabel: t('common:delete'), variant: 'danger' })
                      if (ok) deleteErrorRuns.mutate()
                    }}
                    disabled={!selectedTemplateId || deleteErrorRuns.isLoading}
                  >
                    {t('config:integrations.delete_errors')}
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
                {tab === 'templates' ? t('config:integrations.tabs.templates') : tab === 'targets' ? t('config:integrations.tabs.targets') : tab === 'runs' ? t('config:integrations.tabs.runs') : t('config:integrations.tabs.auth')}
              </button>
            ))}
          </div>

          {activeIntegrationTab !== 'templates' && (
            <div className="form-group">
              <label>{t('config:integrations.template_label')}</label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">{t('config:integrations.select_template')}</option>
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
                  <th>{t('common:name')}</th>
                  <th>{t('config:integrations.table.connector')}</th>
                  <th>{t('config:integrations.table.metric')}</th>
                  <th>{t('config:integrations.table.auth')}</th>
                  <th>{t('config:integrations.table.frequency')}</th>
                  <th>{t('config:integrations.table.template_kind')}</th>
                  <th>{t('common:status')}</th>
                  <th>{t('common:actions')}</th>
                </tr>
              </thead>
              <tbody>
                {templates?.map((template) => (
                  <tr key={template.id}>
                    <td>{template.name}</td>
                    <td>{getConnectorLabel(template.connector)}</td>
                    <td>{getMetricTypeLabel(template.metricType)}</td>
                    <td>{template.authProfileName || '-'}</td>
                    <td>{template.schedule || '-'}</td>
                    <td>
                      {template.isSpecific ? (
                        <span className="status-pill review">{t('config:integrations.table.specific')}</span>
                      ) : (
                        <span className="status-pill ok">{t('config:integrations.table.generic')}</span>
                      )}
                    </td>
                    <td>
                      <span className={`status-pill ${template.enabled ? 'ok' : 'review'}`}>
                        {template.enabled ? t('config:template_modal.active') : t('config:template_modal.inactive')}
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
                          {t('common:edit')}
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            setSelectedTemplateId(template.id)
                            runTemplate.mutate(template.id)
                          }}
                          disabled={!canRunIntegrations || runTemplate.isLoading}
                        >
                          {t('config:integrations.actions.run')}
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            setSelectedTemplateId(template.id)
                            setActiveIntegrationTab('targets')
                          }}
                        >
                          {t('config:integrations.actions.targets')}
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            setSelectedTemplateId(template.id)
                            setActiveIntegrationTab('runs')
                          }}
                        >
                          {t('config:integrations.actions.runs')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!templates || templates.length === 0) && (
                  <tr>
                    <td colSpan={8} className="empty-row">
                      {t('config:integrations.table.empty_templates')}
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
                  <th>{t('config:integrations.targets.scope')}</th>
                  <th>{t('config:integrations.targets.destination')}</th>
                  <th>{t('config:integrations.targets.enabled')}</th>
                  <th>{t('common:actions')}</th>
                </tr>
              </thead>
              <tbody>
                {targets?.map((target) => (
                  <tr key={target.id}>
                    <td>
                      {target.orgScopeName
                        ? formatTargetScopeLabel(target.orgScopeType || target.scopeType, target.orgScopeName)
                        : formatTargetScopeLabel(target.scopeType, target.scopeId)}
                      {target.orgScopeId && scopeById.get(target.orgScopeId)?.active === 0 ? (
                        <span className="status-pill review" style={{ marginLeft: 8 }}>
                          {t('config:integrations.targets.inactive_area')}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {target.assignmentId
                        ? t('config:integrations.targets.assignment_destination', { id: target.assignmentId })
                        : target.scopeKpiId
                        ? `${target.scopeKpiName || t('config:target_modal.fallbacks.scope_kpi', { id: target.scopeKpiId })}`
                        : target.params?.targetMap
                        ? t('config:integrations.targets.mapping_destination', { count: Object.keys(target.params.targetMap || {}).length })
                        : '-'}
                    </td>
                    <td>
                      <span className={`status-pill ${target.enabled ? 'ok' : 'review'}`}>
                        {target.enabled ? t('common:active') : t('common:inactive')}
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
                          {t('common:edit')}
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => runTarget.mutate(target)}
                          disabled={!canRunIntegrations || runTarget.isLoading}
                        >
                          {t('config:integrations.actions.run')}
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={async () => {
                            const ok = await dialog.confirm(t('config:integrations.dialogs.duplicate_target_users'), { title: t('config:integrations.dialogs.duplicate_target_users_title'), confirmLabel: t('config:integrations.actions.duplicate_users'), variant: 'warning' })
                            if (ok) openTargetWizard(target)
                          }}
                          disabled={duplicateTargetByUsers.isLoading}
                        >
                          {t('config:integrations.actions.duplicate_users')}
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
                          {t('config:integrations.actions.test')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!targets || targets.length === 0) && (
                  <tr>
                    <td colSpan={4} className="empty-row">
                      {t('config:integrations.targets.empty')}
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
                  <th>{t('common:status')}</th>
                  <th>{t('config:integrations.runs.start')}</th>
                  <th>{t('config:integrations.runs.user')}</th>
                  <th>{t('config:integrations.runs.result')}</th>
                  <th>{t('config:integrations.runs.subperiod')}</th>
                  <th>{t('common:actions')}</th>
                </tr>
              </thead>
              <tbody>
                {templateRuns?.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <span className={`status-pill ${run.status === 'success' ? 'ok' : 'review'}`}>
                        {getRunStatusLabel(run.status)}
                      </span>
                    </td>
                    <td>{run.startedAt || '-'}</td>
                    <td>{run.triggeredByName || '-'}</td>
                    <td>
                      {run.outputs?.skipped ? (
                        <span className="status-pill review">{t('config:integrations.runs.skipped')}</span>
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
                            const ok = await dialog.confirm(t('config:integrations.dialogs.archive_run'), { title: t('config:integrations.dialogs.archive_run_title'), confirmLabel: t('config:integrations.runs.archive'), variant: 'warning' })
                            if (ok) archiveRunMutation.mutate(run.id)
                          }}
                          disabled={archiveRunMutation.isLoading}
                        >
                          {t('config:integrations.runs.archive')}
                        </button>
                        <button
                          className="btn-danger"
                          onClick={async () => {
                            const ok = await dialog.confirm(t('config:integrations.dialogs.delete_run'), { title: t('config:integrations.dialogs.delete_run_title'), confirmLabel: t('common:delete'), variant: 'danger' })
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
                      {t('config:integrations.runs.empty')}
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
                  <th>{t('common:name')}</th>
                  <th>{t('config:integrations.table.connector')}</th>
                  <th>{t('config:auth_modal.endpoint')}</th>
                  <th>{t('config:integrations.table.auth')}</th>
                  <th>{t('common:actions')}</th>
                </tr>
              </thead>
              <tbody>
                {authProfiles?.map((profile) => (
                  <tr key={profile.id}>
                    <td>{profile.name}</td>
                    <td>{getConnectorLabel(profile.connector)}</td>
                    <td>{profile.endpoint || '-'}</td>
                    <td>{getAuthTypeLabel(profile.authType || 'none')}</td>
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
                          {t('common:edit')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!authProfiles || authProfiles.length === 0) && (
                  <tr>
                    <td colSpan={5} className="empty-row">
                      {t('config:integrations.auth.empty')}
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
              <h3>{t('config:calendar.title')}</h3>
              <p className="muted">{t('config:calendar.subtitle')}</p>
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
              {t('config:calendar.new')}
            </button>
          </div>
          <table className="config-table">
            <thead>
              <tr>
                <th>{t('config:calendar.name')}</th>
                <th>{t('config:calendar.frequency')}</th>
                <th>{t('config:calendar.status')}</th>
                <th>{t('common:actions')}</th>
              </tr>
            </thead>
            <tbody>
              {calendarProfiles?.map((profile) => (
                <tr key={profile.id}>
                  <td>{profile.name}</td>
                  <td>{profile.frequency}</td>
                    <td>
                      <span className={`status-pill ${profile.active ? 'ok' : 'review'}`}>
                        {profile.active ? t('common:active') : t('common:inactive')}
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
                        {t('common:edit')}
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
                        {t('config:calendar.subperiods')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(!calendarProfiles || calendarProfiles.length === 0) && (
                <tr>
                  <td colSpan={4} className="empty-row">
                    {t('config:calendar.empty')}
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
              <h3>{t('config:org.title')}</h3>
              <p className="muted">{t('config:org.subtitle')}</p>
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
              {t('config:org.new')}
            </button>
          </div>
          <div className="config-table-toolbar">
            <div className="config-table-filters">
              <div className="form-group">
                <label htmlFor="scope-search">{t('config:org.search')}</label>
                <input
                  id="scope-search"
                  type="text"
                  value={scopeSearch}
                  onChange={(e) => setScopeSearch(e.target.value)}
                  placeholder={t('config:org.search_placeholder')}
                />
              </div>
              <div className="form-group">
                <label htmlFor="scope-type-filter">{t('config:org.type')}</label>
                <select
                  id="scope-type-filter"
                  value={scopeTypeFilter}
                  onChange={(e) => setScopeTypeFilter(e.target.value)}
                >
                  <option value="all">{t('config:org.all')}</option>
                  {scopeTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {getOrgScopeTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="config-table-toolbar-meta">
              {t('config:org.showing', { shown: filteredOrgScopes.length, total: orgScopes?.length || 0 })}
            </div>
          </div>
          <table className="config-table">
            <thead>
              <tr>
                <th>{t('config:calendar.name')}</th>
                <th>{t('config:org.type')}</th>
                <th>{t('config:org.parent')}</th>
                <th>{t('config:calendar.status')}</th>
                <th>{t('common:actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrgScopes.map((scope) => (
                <tr key={scope.id}>
                  <td>{scope.name}</td>
                  <td>{getOrgScopeTypeLabel(scope.type)}</td>
                  <td>{scope.parentId ? scopeById.get(Number(scope.parentId))?.name || `#${scope.parentId}` : '—'}</td>
                  <td>
                    <span className={`status-pill ${scope.active ? 'ok' : 'review'}`}>
                      {scope.active ? t('common:active') : t('common:inactive')}
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
                          const hasAdvancedData = !!(
                            scope.metadata || getEntityExternalKeysBySourceType('org_scope', scope.id)[DEFAULT_MAPPING_SOURCE_TYPE]
                          )
                          setScopeAdvancedOpen(hasAdvancedData)
                          setShowScopeModal(true)
                        }}
                      >
                        {t('common:edit')}
                      </button>
                      <button
                        className="btn-secondary danger"
                        onClick={async () => {
                          const ok = await dialog.confirm(
                            t('config:org.delete_confirm', { name: scope.name, type: getOrgScopeTypeLabel(scope.type) }),
                            { title: t('config:org.delete_confirm_title'), confirmLabel: t('common:delete'), variant: 'danger' }
                          )
                          if (ok) deleteScope.mutate(scope)
                        }}
                        disabled={deleteScope.isLoading || deleteScopeCascade.isLoading}
                      >
                        {t('common:delete')}
                      </button>
                      {(scopeChildCount.get(scope.id) || 0) > 0 && (
                        <button
                          className="btn-secondary danger"
                          onClick={async () => {
                            const childCount = scopeChildCount.get(scope.id) || 0
                            const ok = await dialog.confirm(
                              t('config:org.cascade_delete_confirm', { name: scope.name, count: childCount }),
                              { title: t('config:org.cascade_delete_confirm_title'), confirmLabel: t('config:org.cascade_delete_btn'), variant: 'danger' }
                            )
                            if (ok) deleteScopeCascade.mutate(scope)
                          }}
                          disabled={deleteScope.isLoading || deleteScopeCascade.isLoading}
                        >
                          {t('config:org.cascade_delete_btn')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {orgScopes && orgScopes.length > 0 && filteredOrgScopes.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-row">
                    {t('config:org.empty_filtered')}
                  </td>
                </tr>
              )}
              {(!orgScopes || orgScopes.length === 0) && (
                <tr>
                  <td colSpan={5} className="empty-row">
                    <div className="empty-state-inline">
                      <strong>{t('config:org.empty_title')}</strong>
                      <span>{t('config:org.empty_hint')}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>


      {showTemplateModal && (
        <div
          className="modal-overlay"
          onPointerDown={markOverlayPointerDown}
          onClick={(e) => closeOnOverlayClick(e, () => setShowTemplateModal(false))}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingTemplate ? t('config:modals.template_edit') : t('config:modals.template_new')}</h2>
              <button className="close-button" onClick={() => setShowTemplateModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>{t('common:name')}</label>
                  <input
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>{t('config:template_modal.connector')}</label>
                  <select
                    value={templateForm.connector}
                    onChange={(e) => setTemplateForm((prev) => ({ ...prev, connector: e.target.value }))}
                  >
                    <option value="jira">{getConnectorLabel('jira')}</option>
                    <option value="xray">{getConnectorLabel('xray')}</option>
                    <option value="sheets">{getConnectorLabel('sheets')}</option>
                    <option value="looker">{getConnectorLabel('looker')}</option>
                    <option value="generic_api">{getConnectorLabel('generic_api')}</option>
                    <option value="manual">{getConnectorLabel('manual')}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('config:template_modal.metric_type')}</label>
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
                    <option value="count">{getMetricTypeLabel('count')}</option>
                    <option value="ratio">{getMetricTypeLabel('ratio')}</option>
                    <option value="sla">{getMetricTypeLabel('sla')}</option>
                    <option value="value">{getMetricTypeLabel('value')}</option>
                    <option value="value_agg">{getMetricTypeLabel('value_agg')}</option>
                    <option value="manual">{getMetricTypeLabel('manual')}</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>{t('config:template_modal.quick_templates')}</label>
                <div className="action-buttons">
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('count')}>
                    {getPresetLabel('count')}
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('ratio')}>
                    {getPresetLabel('ratio')}
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('sla')}>
                    {getPresetLabel('sla')}
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('sheets_value')}>
                    {getPresetLabel('sheets_value')}
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('sheets_agg')}>
                    {getPresetLabel('sheets_agg')}
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('sheets_grid')}>
                    {getPresetLabel('sheets_grid')}
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('sheets_grid_agg')}>
                    {getPresetLabel('sheets_grid_agg')}
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('api_value')}>
                    {getPresetLabel('api_value')}
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('api_agg')}>
                    {getPresetLabel('api_agg')}
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('looker_value')}>
                    {getPresetLabel('looker_value')}
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('looker_agg')}>
                    {getPresetLabel('looker_agg')}
                  </button>
                  <button className="btn-secondary" onClick={() => applyTemplatePreset('manual')}>
                    {getPresetLabel('manual')}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>{t('config:template_modal.auth_profile')}</label>
                <select
                  value={templateForm.authProfileId}
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, authProfileId: e.target.value }))}
                  disabled={templateForm.connector === 'manual'}
                >
                  <option value="">{t('config:template_modal.select_auth_profile')}</option>
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
                    <div className="helper-text">{t('config:template_modal.no_auth_profiles')}</div>
                  )}
              </div>
              {templateForm.metricType !== 'value' &&
                templateForm.metricType !== 'value_agg' &&
                templateForm.metricType !== 'manual' && (
                  <>
                    <div className="form-group">
                      <label>
                        {getTemplatePrimaryLabel(templateForm.connector)}
                      </label>
                      <textarea
                        rows={3}
                        value={templateForm.queryTestsTemplate}
                        onChange={(e) => setTemplateForm((prev) => ({ ...prev, queryTestsTemplate: e.target.value }))}
                      />
                        <div className="helper-text">
                          {getTemplatePrimaryHint(templateForm.connector, templateForm.metricType)}
                        </div>
                      </div>
                    {(templateForm.metricType === 'ratio' || templateForm.metricType === 'sla') && (
                      <div className="form-group">
                          <label>
                            {getTemplateSecondaryLabel(templateForm.connector)}
                          </label>
                        <textarea
                          rows={3}
                          value={templateForm.queryStoriesTemplate}
                          onChange={(e) =>
                            setTemplateForm((prev) => ({ ...prev, queryStoriesTemplate: e.target.value }))
                          }
                        />
                        <div className="helper-text">
                          {getTemplateSecondaryHint(templateForm.connector, templateForm.metricType)}
                        </div>
                      </div>
                    )}
                  </>
                )}
              {(templateForm.metricType === 'value' ||
                templateForm.metricType === 'value_agg' ||
                templateForm.metricType === 'manual') && (
                <div className="form-group">
                  <label>{t('config:template_modal.labels.config')}</label>
                  <textarea
                    rows={3}
                    value={templateForm.queryTestsTemplate}
                    onChange={(e) => setTemplateForm((prev) => ({ ...prev, queryTestsTemplate: e.target.value }))}
                  />
                  <div className="helper-text">
                    {getTemplateSingleConfigHint(templateForm.connector, templateForm.metricType)}
                  </div>
                </div>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label>{t('config:template_modal.formula')}</label>
                  <input
                    value={templateForm.formulaTemplate}
                    onChange={(e) => setTemplateForm((prev) => ({ ...prev, formulaTemplate: e.target.value }))}
                  />
                </div>
              <div className="form-group">
                <label>{t('config:template_modal.schedule')}</label>
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
                    {t('config:template_modal.schedule_monthly')}
                  </button>
                </div>
                <div className="action-buttons" style={{ marginTop: 6 }}>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => setTemplateForm((prev) => ({ ...prev, schedule: '0 2 * * *' }))}
                  >
                    {t('config:template_modal.schedule_daily')}
                  </button>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => setTemplateForm((prev) => ({ ...prev, schedule: '0 2 * * 1' }))}
                  >
                    {t('config:template_modal.schedule_weekly')}
                  </button>
                </div>
                <div className="helper-text">
                  {t('config:template_modal.schedule_hint')} {cronPreview ? t('config:template_modal.next_run', { value: cronPreview }) : ''}
                </div>
              </div>
              </div>
              <div className="form-group">
                <label>{t('common:status')}</label>
                <select
                  value={templateForm.enabled ? '1' : '0'}
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, enabled: e.target.value === '1' }))}
                >
                  <option value="1">{t('config:template_modal.active')}</option>
                  <option value="0">{t('config:template_modal.inactive')}</option>
                </select>
              </div>
              {['count', 'ratio', 'sla'].includes(templateForm.metricType) &&
              (templateForm.queryTestsTemplate.trim() || templateForm.queryStoriesTemplate.trim()) &&
              !hasAnyPlaceholders ? (
                <div className="form-warning">
                  {t('config:template_modal.placeholders_hint')}
                </div>
              ) : null}
              {['count', 'ratio', 'sla'].includes(templateForm.metricType) &&
              (templateForm.queryTestsTemplate.trim() || templateForm.queryStoriesTemplate.trim()) &&
              missingTimePlaceholders ? (
                <div className="form-warning">
                  {t('config:template_modal.time_placeholders_hint')}
                </div>
              ) : null}
              {['count', 'ratio', 'sla'].includes(templateForm.metricType) &&
              (templateForm.queryTestsTemplate.trim() || templateForm.queryStoriesTemplate.trim()) &&
              literalWarning ? (
                <div className="form-warning">
                  {t('config:template_modal.literal_values_hint')}
                </div>
              ) : null}
              {templateFormError ? <div className="form-error">{templateFormError}</div> : null}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowTemplateModal(false)}>
                {t('common:cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={() => saveTemplate.mutate()}
                disabled={!templateForm.name.trim() || saveTemplate.isLoading}
              >
                {saveTemplate.isLoading ? t('config:actions.saving') : t('config:actions.save_template')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTargetModal && (
        <div
          className="modal-overlay"
          onPointerDown={markOverlayPointerDown}
          onClick={(e) => closeOnOverlayClick(e, () => setShowTargetModal(false))}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingTarget ? t('config:modals.target_edit') : t('config:modals.target_new')}</h2>
              <button className="close-button" onClick={() => setShowTargetModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>{t('config:target_modal.template')}</label>
                  <select
                    value={targetForm.templateId || String(selectedTemplateId)}
                    onChange={(e) => setTargetForm((prev) => ({ ...prev, templateId: e.target.value }))}
                  >
                    <option value="">{t('config:integrations.select_template')}</option>
                    {templates?.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
              <div className="form-group">
                  <label>{t('config:target_modal.scope_type')}</label>
                  <select
                    value={targetForm.scopeType}
                    onChange={(e) => setTargetForm((prev) => ({ ...prev, scopeType: e.target.value }))}
                  >
                    <option value="company">{getOrgScopeTypeLabel('company')}</option>
                    <option value="area">{getOrgScopeTypeLabel('area')}</option>
                    <option value="team">{getOrgScopeTypeLabel('team')}</option>
                    <option value="person">{getOrgScopeTypeLabel('person')}</option>
                    <option value="product">{getOrgScopeTypeLabel('product')}</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>{t('config:target_modal.org_scope')}</label>
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
                    <option value="">{t('config:target_modal.select_org_scope')}</option>
                    {orgScopes?.map((scope) => (
                      <option key={scope.id} value={scope.id}>
                        {formatTargetScopeLabel(scope.type, scope.name)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('config:target_modal.external_id')}</label>
                  <input
                    value={targetForm.scopeId}
                    onChange={(e) => setTargetForm((prev) => ({ ...prev, scopeId: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>{t('config:target_modal.assignment_destination')}</label>
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
                    <option value="">{t('config:target_modal.select_assignment')}</option>
                    {assignmentGroupsForTarget.map((assignment: any) => (
                      <option key={assignment.id} value={assignment.id}>
                        {formatAssignmentOptionLabel(assignment)}
                      </option>
                    ))}
                  </select>
                  <div className="helper-text">
                    {t('config:target_modal.assignment_destination_hint')}
                  </div>
                </div>
                <div className="form-group">
                  <label>{t('config:target_modal.scope_kpi_destination')}</label>
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
                    <option value="">{t('config:target_modal.select_scope_kpi')}</option>
                    {(scopeKpis || [])
                      .filter((scopeKpi: any) =>
                        targetForm.orgScopeId ? Number(scopeKpi.orgScopeId) === Number(targetForm.orgScopeId) : true
                      )
                      .map((scopeKpi: any) => (
                        <option key={scopeKpi.id} value={scopeKpi.id}>
                          {formatScopeKpiOptionLabel(scopeKpi)}
                        </option>
                      ))}
                  </select>
                  <div className="helper-text">
                    {t('config:target_modal.scope_kpi_destination_hint')}
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label>{t('config:target_modal.raw_jql')}</label>
                <div className="helper-text">{t('config:target_modal.raw_jql_hint')}</div>
                <textarea
                  rows={4}
                  placeholder={t('config:target_modal.raw_jql_placeholder')}
                  value={rawJqlInput}
                  onChange={(e) => setRawJqlInput(e.target.value)}
                />
                <div className="action-buttons" style={{ marginTop: 6 }}>
                  <button className="btn-secondary" type="button" onClick={convertJqlToParams}>
                    {t('config:target_modal.convert_jql')}
                  </button>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => {
                      setRawJqlInput('')
                    }}
                  >
                    {t('config:target_modal.clear')}
                  </button>
                </div>
                <label style={{ marginTop: 12, display: 'block' }}>{t('config:target_modal.params_json')}</label>
                <div className="helper-text">
                  {t('config:target_modal.params_json_hint')}
                </div>
                <textarea
                  rows={5}
                  value={targetForm.paramsText}
                  onChange={(e) => setTargetForm((prev) => ({ ...prev, paramsText: e.target.value }))}
                />
                {selectedTargetTemplate?.connector === 'sheets' ? (
                  <div className="helper-text">
                    <Trans
                      ns="config"
                      i18nKey="target_modal.sheets_params_hint"
                      components={{ code: <code /> }}
                    />
                  </div>
                ) : null}
              </div>
              {targetRequiresStructuredParams && targetRequiredParamKeys.length > 0 ? (
                <div className="helper-text">
                  {t('config:target_modal.required_params')} <strong>{targetRequiredParamKeys.join(', ')}</strong>
                </div>
              ) : null}
              {selectedTargetTemplate?.connector === 'looker' || selectedTargetTemplate?.connector === 'generic_api' ? (
                <div className="helper-text">
                  <Trans
                    ns="config"
                    i18nKey={
                      selectedTargetTemplate?.connector === 'looker'
                        ? 'target_modal.explicit_mapping_hint_looker'
                        : 'target_modal.explicit_mapping_hint'
                    }
                    components={{ code: <code /> }}
                  />
                </div>
              ) : null}
              {supportsTargetMappingEditor ? (
                <div className="form-group" style={{ marginTop: 14 }}>
                  <label>{t('config:target_modal.mapping_editor')}</label>
                  <div className="helper-text">
                    {t('config:target_modal.mapping_editor_hint')}
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>{t('config:target_modal.mapping_result_path')}</label>
                      <input
                        placeholder={t('config:target_modal.placeholders.mapping_result_path')}
                        value={targetMappingDraft.mappingResultPath}
                        onChange={(e) => updateTargetMappingField('mappingResultPath', e.target.value)}
                        disabled={targetParamsInvalidJson}
                      />
                    </div>
                    <div className="form-group">
                      <label>{t('config:target_modal.mapping_key_path')}</label>
                      <input
                        placeholder={t('config:target_modal.placeholders.mapping_key_path')}
                        value={targetMappingDraft.mappingKeyPath}
                        onChange={(e) => updateTargetMappingField('mappingKeyPath', e.target.value)}
                        disabled={targetParamsInvalidJson}
                      />
                    </div>
                    <div className="form-group">
                      <label>{t('config:target_modal.mapping_value_path')}</label>
                      <input
                        placeholder={t('config:target_modal.placeholders.mapping_value_path')}
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
                      {t('config:target_modal.add_mapping_row')}
                    </button>
                  </div>
                  {targetMappingDraft.rows.length > 0 ? (
                    <table className="config-table" style={{ marginTop: 10 }}>
                      <thead>
                        <tr>
                          <th>{t('config:target_modal.table.external_key')}</th>
                          <th>{t('config:target_modal.table.destination')}</th>
                          <th>{t('config:target_modal.table.assignment')}</th>
                          <th>{t('config:target_modal.table.scope_kpi')}</th>
                          <th>{t('common:actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {targetMappingDraft.rows.map((row, index) => (
                          <tr key={`${row.externalKey || 'row'}-${index}`}>
                            <td>
                              <input
                                value={row.externalKey}
                                placeholder={t('config:target_modal.placeholders.external_key')}
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
                                <option value="assignment">{t('config:target_modal.owner_types.assignment')}</option>
                                <option value="scopeKpi">{t('config:target_modal.owner_types.scope_kpi')}</option>
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
                                <option value="">{t('config:target_modal.select_assignment')}</option>
                                {assignmentGroupsForTarget.map((assignment: any) => (
                                  <option key={assignment.id} value={assignment.id}>
                                    {formatAssignmentOptionLabel(assignment)}
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
                                <option value="">{t('config:target_modal.select_scope_kpi')}</option>
                                {(scopeKpis || []).map((scopeKpi: any) => (
                                  <option key={scopeKpi.id} value={scopeKpi.id}>
                                    {formatScopeKpiOptionLabel(scopeKpi)}
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
                                {t('common:delete')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="helper-text" style={{ marginTop: 10 }}>
                      {t('config:target_modal.no_mapping_rows')}
                    </div>
                  )}
                  {targetUnresolvedMappingRows.length > 0 ? (
                    <>
                      <div className="form-warning" style={{ marginTop: 10 }}>
                        <Trans
                          ns="config"
                          i18nKey="target_modal.unresolved_warning"
                          values={{ count: targetUnresolvedMappingRows.length }}
                          components={{ strong: <strong />, code: <code /> }}
                        />
                      </div>
                      <div className="preview-box" style={{ marginTop: 10 }}>
                        <div className="muted">
                        <Trans
                          ns="config"
                          i18nKey="target_modal.explicit_mapping_intro"
                          values={{ source: getConfigSourceTypeLabel(targetExplicitMappingSourceType) }}
                          components={{ code: <code />, strong: <strong /> }}
                        />
                        </div>
                        <table className="config-table" style={{ marginTop: 10 }}>
                          <thead>
                            <tr>
                              <th>{t('config:target_modal.explicit_table.external_key')}</th>
                              <th>{t('config:target_modal.explicit_table.destination')}</th>
                              <th>{t('config:target_modal.explicit_table.persisted_on')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {targetUnresolvedMappingRows.map((row) => {
                              const rowKey = explicitRowKey(row)
                              const pending = pendingExplicitMappings[rowKey]
                              return (
                                <tr key={`pending-mapping-${rowKey}`}>
                                  <td>
                                    <strong>{row.externalKey || t('config:target_modal.explicit_row.no_key')}</strong>
                                    <div className="helper-text">
                                      {row.ownerType === 'assignment'
                                        ? t('config:target_modal.explicit_row.assignment_hint')
                                        : t('config:target_modal.explicit_row.scope_kpi_hint')}
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
                                        <option value="">{t('config:target_modal.explicit_row.select_assignment')}</option>
                                        {assignmentGroupsForTarget.map((assignment: any) => (
                                          <option key={`pending-assignment-${assignment.id}`} value={assignment.id}>
                                            {formatAssignmentOptionLabel(assignment)}
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
                                        <option value="">{t('config:target_modal.explicit_row.select_scope_kpi')}</option>
                                        {(scopeKpis || []).map((scopeKpi: any) => (
                                          <option key={`pending-scope-${scopeKpi.id}`} value={scopeKpi.id}>
                                            {formatScopeKpiOptionLabel(scopeKpi)}
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
                                            )?.name || t('config:target_modal.explicit_row.collaborator_fallback')
                                          : scopeById.get(
                                              Number(scopeKpiById.get(Number(pending.entityId))?.orgScopeId || 0)
                                            )?.name || t('config:target_modal.explicit_row.scope_fallback')}
                                      </span>
                                    ) : (
                                      <span className="muted">{t('config:target_modal.explicit_row.pending')}</span>
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
                              ? t('config:target_modal.explicit_actions.saving')
                              : t('config:target_modal.explicit_actions.save_and_resolve', {
                                  count: pendingExplicitMappingSelectionsCount,
                                })}
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
                      {previewTargetDraft.isLoading
                        ? t('config:target_modal.preview_actions.testing')
                        : t('config:target_modal.preview_actions.test')}
                    </button>
                    {Array.isArray(targetDraftPreviewResult?.sourceMeta?.previewRows) &&
                    targetDraftPreviewResult.sourceMeta.previewRows.length > 0 ? (
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() => importPreviewRowsToMapping(targetDraftPreviewResult)}
                      >
                        {t('config:target_modal.preview_actions.load_keys')}
                      </button>
                    ) : null}
                    {Array.isArray(targetDraftPreviewResult?.sourceMeta?.unmappedKeys) &&
                    targetDraftPreviewResult.sourceMeta.unmappedKeys.length > 0 ? (
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() => importPreviewRowsToMapping(targetDraftPreviewResult, 'unmapped')}
                      >
                        {t('config:target_modal.preview_actions.add_missing')}
                      </button>
                    ) : null}
                  </div>
                  <div className="helper-text">
                    {t('config:target_modal.preview_hint')}
                  </div>
                  {targetDraftPreviewMessage ? <div className="form-error">{targetDraftPreviewMessage}</div> : null}
                  {targetDraftPreviewResult ? (
                    <div className="preview-box" style={{ marginTop: 10 }}>
                      <div className="muted">
                        {targetDraftPreviewResult.sourceMeta
                          ? t('config:target_preview.value_only', { value: targetDraftPreviewResult.computed })
                          : t('config:target_preview.value_ab', {
                              a: targetDraftPreviewResult.testsTotal,
                              b: targetDraftPreviewResult.storiesTotal,
                              value: targetDraftPreviewResult.computed,
                            })}
                      </div>
                      <div className="muted">
                        {t('config:target_preview.range', {
                          from: targetDraftPreviewResult.from,
                          to: targetDraftPreviewResult.to,
                        })}
                      </div>
                      <PreviewSourceMeta sourceMeta={targetDraftPreviewResult.sourceMeta} />
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="helper-text">
                {t('config:target_modal.calculated_period', {
                  period: targetPeriodPreview.period,
                  from: targetPeriodPreview.from,
                  to: targetPeriodPreview.to,
                })}
              </div>
              <div className="form-hint">
                {targetResolvedSubperiod ? (
                  <>
                    {t('config:target_modal.target_subperiod', {
                      name: targetResolvedSubperiod.name,
                      start: targetResolvedSubperiod.startDate,
                      end: targetResolvedSubperiod.endDate,
                    })}
                  </>
                ) : (
                  <>{t('config:target_modal.target_subperiod_later')}</>
                )}
              </div>
              {assignmentForTarget?.subPeriodId && (
                <div className="form-warning">
                  {t('config:target_modal.assignment_subperiod_warning')}
                </div>
              )}
              {scopeKpiForTarget?.subPeriodId && (
                <div className="form-warning">
                  {t('config:target_modal.scope_kpi_subperiod_warning')}
                </div>
              )}
              {targetAssignmentBlocked ? (
                <div className="form-error">
                  {t('config:target_modal.errors.assignment_blocked')}
                </div>
              ) : null}
              {targetParamsInvalidJson ? (
                <div className="form-error">{t('config:target_modal.errors.invalid_json')}</div>
              ) : null}
              {targetRequiresStructuredParams && targetMissingParamKeys.length > 0 ? (
                <div className="form-error">
                  {t('config:target_modal.errors.missing_required_params')} {targetMissingParamKeys.join(', ')}
                </div>
              ) : null}
              {targetForm.assignmentId && targetForm.scopeKpiId ? (
                <div className="form-error">{t('config:target_modal.errors.both_destinations')}</div>
              ) : null}
              {targetDirectDestinationBlockedByMapping ? (
                <div className="form-error">
                  {t('config:target_modal.errors.direct_destination_with_mapping')}
                </div>
              ) : null}
              {targetFormError ? <div className="form-error">{targetFormError}</div> : null}
              <div className="form-group">
                <label>{t('common:status')}</label>
                <select
                  value={targetForm.enabled ? '1' : '0'}
                  onChange={(e) => setTargetForm((prev) => ({ ...prev, enabled: e.target.value === '1' }))}
                >
                  <option value="1">{t('common:active')}</option>
                  <option value="0">{t('common:inactive')}</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowTargetModal(false)}>
                {t('common:cancel')}
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
                {saveTarget.isLoading ? t('config:actions.saving') : t('config:actions.save_target')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTargetWizard && wizardTarget && (
        <div
          className="modal-overlay"
          onPointerDown={markOverlayPointerDown}
          onClick={(e) => closeOnOverlayClick(e, () => setShowTargetWizard(false))}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('config:modals.target_wizard')}</h2>
              <button className="close-button" onClick={() => setShowTargetWizard(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="muted">
                {t('config:target_wizard.template')} {templates?.find((t) => t.id === wizardTarget.templateId)?.name || wizardTarget.templateId}
              </div>
              <div className="helper-text">
                {t('config:target_wizard.hint')}
              </div>
              <table className="config-table">
                <thead>
                  <tr>
                    <th>{t('config:target_wizard.user_jira')}</th>
                    <th>{t('config:target_wizard.collaborator')}</th>
                    <th>{t('config:target_wizard.assignment')}</th>
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
                            <option value="">{t('config:target_wizard.select_collaborator')}</option>
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
                            <option value="">{t('config:target_wizard.no_assignment')}</option>
                            {assignmentsForColab.map((assignment: any) => (
                              <option key={assignment.id} value={assignment.id}>
                                {assignment.kpiName || t('config:target_modal.fallbacks.kpi', { id: assignment.kpiId })} ·{' '}
                                {assignment.periodName || t('config:target_modal.fallbacks.period', { id: assignment.periodId })}
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
                {t('common:cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={() => createTargetsFromWizard.mutate()}
                disabled={createTargetsFromWizard.isLoading}
              >
                {createTargetsFromWizard.isLoading ? t('config:actions.creating') : t('config:actions.create_targets')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAuthModal && (
        <div
          className="modal-overlay"
          onPointerDown={markOverlayPointerDown}
          onClick={(e) => closeOnOverlayClick(e, () => setShowAuthModal(false))}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingAuth ? t('config:modals.auth_edit') : t('config:modals.auth_new')}</h2>
              <button className="close-button" onClick={() => setShowAuthModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>{t('common:name')}</label>
                  <input
                    value={authForm.name}
                    onChange={(e) => setAuthForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>{t('config:auth_modal.connector')}</label>
                  <select
                    value={authForm.connector}
                    onChange={(e) => setAuthForm((prev) => ({ ...prev, connector: e.target.value }))}
                  >
                    <option value="jira">{getConnectorLabel('jira')}</option>
                    <option value="xray">{getConnectorLabel('xray')}</option>
                    <option value="sheets">{getConnectorLabel('sheets')}</option>
                    <option value="looker">{getConnectorLabel('looker')}</option>
                    <option value="generic_api">{getConnectorLabel('generic_api')}</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>{t('config:auth_modal.endpoint')}</label>
                <input
                  value={authForm.endpoint}
                  onChange={(e) => setAuthForm((prev) => ({ ...prev, endpoint: e.target.value }))}
                  placeholder={t('config:auth_modal.endpoint_placeholder')}
                />
                <div className="helper-text">{getAuthEndpointHint(authForm.connector)}</div>
              </div>
              <div className="form-group">
                <label>{t('config:auth_modal.auth_type')}</label>
                <select
                  value={authForm.authType}
                  onChange={(e) => setAuthForm((prev) => ({ ...prev, authType: e.target.value }))}
                >
                  <option value="none">{getAuthTypeLabel('none')}</option>
                  <option value="basic">{getAuthTypeLabel('basic')}</option>
                  <option value="bearer">{getAuthTypeLabel('bearer')}</option>
                  <option value="apiKey">{getAuthTypeLabel('apiKey')}</option>
                </select>
              </div>
              {authForm.authType === 'basic' && (
                <div className="form-row">
                  <div className="form-group">
                    <label>{t('config:auth_modal.username')}</label>
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
                    <label>{t('config:auth_modal.password')}</label>
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
                  <label>{t('config:auth_modal.token')}</label>
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
                    <label>{t('config:auth_modal.client_id')}</label>
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
                    <label>{t('config:auth_modal.client_secret')}</label>
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
                  {t('config:auth_modal.looker_hint')}
                </div>
              )}
              {authForm.authType === 'apiKey' && (
                <div className="form-row">
                  <div className="form-group">
                    <label>{t('config:auth_modal.api_key')}</label>
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
                    <label>{t('config:auth_modal.header')}</label>
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
                {t('common:cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={() => saveAuthProfile.mutate()}
                disabled={!authForm.name.trim() || saveAuthProfile.isLoading}
              >
                {saveAuthProfile.isLoading ? t('config:actions.saving') : t('config:actions.save_auth')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCalendarModal && (
        <div
          className="modal-overlay"
          onPointerDown={markOverlayPointerDown}
          onClick={(e) => closeOnOverlayClick(e, () => setShowCalendarModal(false))}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingCalendar ? t('config:modals.calendar_edit') : t('config:modals.calendar_new')}</h2>
              <button className="close-button" onClick={() => setShowCalendarModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>{t('config:calendar.name')}</label>
                  <input
                    value={calendarForm.name}
                    onChange={(e) => setCalendarForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>{t('config:calendar.frequency')}</label>
                  <select
                    value={calendarForm.frequency}
                    onChange={(e) =>
                      setCalendarForm((prev) => ({ ...prev, frequency: e.target.value }))
                    }
                  >
                    <option value="monthly">{getFrequencyLabel('monthly')}</option>
                    <option value="quarterly">{getFrequencyLabel('quarterly')}</option>
                    <option value="custom">{getFrequencyLabel('custom')}</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>{t('common:description')}</label>
                <textarea
                  rows={3}
                  value={calendarForm.description}
                  onChange={(e) => setCalendarForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>{t('common:status')}</label>
                <select
                  value={calendarForm.active ? '1' : '0'}
                  onChange={(e) =>
                    setCalendarForm((prev) => ({ ...prev, active: e.target.value === '1' }))
                  }
                >
                  <option value="1">{t('common:active')}</option>
                  <option value="0">{t('common:inactive')}</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowCalendarModal(false)}>
                {t('common:cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={() => saveCalendarProfile.mutate()}
                disabled={!calendarForm.name.trim() || saveCalendarProfile.isLoading}
              >
                {saveCalendarProfile.isLoading ? t('config:actions.saving') : t('config:actions.save_calendar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCalendarSubperiods && calendarForSubperiods && (
        <div
          className="modal-overlay"
          onPointerDown={markOverlayPointerDown}
          onClick={(e) =>
            closeOnOverlayClick(e, () => {
              setShowCalendarSubperiods(false)
              setEditingCalendarSubperiod(undefined)
            })
          }
        >
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('config:modals.subperiods', { name: calendarForSubperiods.name })}</h2>
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
                  <label>{t('common:period')}</label>
                  <select
                    value={selectedPeriodForCalendar}
                    disabled={periodsLoading || !periods?.length}
                    onChange={(e) =>
                      setSelectedPeriodForCalendar(e.target.value ? Number(e.target.value) : '')
                    }
                  >
                    <option value="">
                      {periodsLoading
                        ? t('config:subperiod_modal.loading_periods')
                        : periods?.length
                          ? t('config:subperiod_modal.select_period')
                          : t('config:subperiod_modal.no_periods')}
                    </option>
                    {periods?.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {periodsError ? (
                    <div className="form-error">{t('config:subperiod_modal.load_error')}</div>
                  ) : null}
                  {!periodsLoading && !periodsError && (!periods || periods.length === 0) ? (
                    <div className="form-hint">
                      {t('config:subperiod_modal.no_periods_hint')}
                    </div>
                  ) : null}
                </div>
                <div className="form-group">
                  <label>{t('config:calendar.frequency')}</label>
                  <div className="readonly-field">{getFrequencyLabel(calendarForSubperiods.frequency)}</div>
                </div>
                <div className="form-group">
                  <label>{t('common:status')}</label>
                  <div className="readonly-field">
                    {calendarForSubperiods.active !== false ? t('common:active') : t('common:inactive')}
                  </div>
                </div>
              </div>

              {!selectedPeriodForCalendar && periods && periods.length > 0 && (
                <div className="form-hint">{t('config:subperiod_modal.select_period_hint')}</div>
              )}

              {selectedPeriodForCalendar && (
                <>
                  <div className="modal-actions">
                    <button
                      className="btn-primary"
                      onClick={() => setEditingCalendarSubperiod(null)}
                    >
                      {t('config:subperiod_modal.new')}
                    </button>
                  </div>
                  <table className="config-table">
                    <thead>
                      <tr>
                        <th>{t('common:name')}</th>
                        <th>{t('config:subperiod_modal.start')}</th>
                        <th>{t('config:subperiod_modal.end')}</th>
                        <th>{t('common:weight')}</th>
                        <th>{t('common:status')}</th>
                        <th>{t('common:actions')}</th>
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
                              {sp.status === 'closed' ? t('common:closed') : t('common:open')}
                            </span>
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button
                                className="btn-secondary"
                                disabled={sp.status === 'closed'}
                                onClick={() => setEditingCalendarSubperiod(sp)}
                              >
                                {t('common:edit')}
                              </button>
                              <button
                                className="btn-secondary"
                                disabled={sp.status === 'closed'}
                                onClick={() => closeCalendarSubperiod.mutate(sp)}
                              >
                                {t('common:close')}
                              </button>
                              <button
                                className="btn-danger"
                                disabled={sp.status === 'closed'}
                                onClick={() => deleteCalendarSubperiod.mutate(sp)}
                              >
                                {t('common:delete')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {(!calendarSubperiods || calendarSubperiods.length === 0) && (
                        <tr>
                          <td colSpan={6} className="empty-row">
                            {t('config:subperiod_modal.empty')}
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
          <div
            className="modal-overlay"
            onPointerDown={markOverlayPointerDown}
            onClick={(e) => closeOnOverlayClick(e, () => setEditingCalendarSubperiod(undefined))}
          >
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
        <div
          className="modal-overlay"
          onPointerDown={markOverlayPointerDown}
          onClick={(e) => closeOnOverlayClick(e, () => setShowTargetPreview(false))}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('config:modals.target_preview')}</h2>
              <button className="close-button" onClick={() => setShowTargetPreview(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <div className="muted">
                  {targetPreviewTarget?.orgScopeName
                    ? `${getOrgScopeTypeLabel(targetPreviewTarget.orgScopeType || targetPreviewTarget.scopeType)} · ${targetPreviewTarget.orgScopeName}`
                    : `${targetPreviewTarget?.scopeType ? getOrgScopeTypeLabel(targetPreviewTarget.scopeType) : ''} · ${targetPreviewTarget?.scopeId || ''}`}
                </div>
              </div>
              {targetPreviewMessage ? <div className="form-error">{targetPreviewMessage}</div> : null}
              {targetPreviewResult ? (
                <div className="preview-box">
                  <div className="muted">
                    {targetPreviewResult.sourceMeta
                      ? t('config:target_preview.value_only', { value: targetPreviewResult.computed })
                      : t('config:target_preview.value_ab', {
                          a: targetPreviewResult.testsTotal,
                          b: targetPreviewResult.storiesTotal,
                          value: targetPreviewResult.computed,
                        })}
                  </div>
                  <div className="muted">
                    {t('config:target_preview.range', { from: targetPreviewResult.from, to: targetPreviewResult.to })}
                  </div>
                  {targetPreviewResult.warnings?.length ? (
                    <div className="form-error">{targetPreviewResult.warnings.join(' · ')}</div>
                  ) : null}
                  {targetPreviewResult.sourceMeta ? (
                    <PreviewSourceMeta sourceMeta={targetPreviewResult.sourceMeta} />
                  ) : (
                    <>
                      <div className="preview-jql">
                        <strong>{t('config:target_preview.filter_a')}</strong>
                        <pre>{targetPreviewResult.testsJql}</pre>
                      </div>
                      <div className="preview-jql">
                        <strong>{t('config:target_preview.filter_b')}</strong>
                        <pre>{targetPreviewResult.storiesJql}</pre>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="muted">{t('config:target_preview.loading')}</div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowTargetPreview(false)}>
                {t('common:close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showScopeModal && (
        <div
          className="modal-overlay"
          onPointerDown={markOverlayPointerDown}
          onClick={(e) => closeOnOverlayClick(e, () => setShowScopeModal(false))}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingScope ? t('config:modals.scope_edit') : t('config:modals.scope_new')}</h2>
              <button className="close-button" onClick={() => setShowScopeModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body scope-form-body">
              <div className="scope-form-section">
                <div className="form-group">
                  <label>{t('common:name')} <span className="field-required">*</span></label>
                  <input
                    autoFocus
                    placeholder={t('config:scope_modal.name_placeholder')}
                    value={scopeForm.name}
                    onChange={(e) => setScopeForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>{t('config:org.type')}</label>
                    <select
                      value={scopeForm.type}
                      onChange={(e) => setScopeForm((prev) => ({ ...prev, type: e.target.value }))}
                    >
                      <option value="company" disabled={Boolean(existingCompanyScope)}>
                        🏢 {getOrgScopeTypeLabel('company')}
                      </option>
                      <option value="area">🗂 {getOrgScopeTypeLabel('area')}</option>
                      <option value="team">👥 {getOrgScopeTypeLabel('team')}</option>
                      <option value="person">👤 {getOrgScopeTypeLabel('person')}</option>
                      <option value="product">📦 {getOrgScopeTypeLabel('product')}</option>
                    </select>
                    <small className="form-hint">
                      {scopeForm.type === 'area' && t('config:scope_modal.type_hints.area')}
                      {scopeForm.type === 'team' && t('config:scope_modal.type_hints.team')}
                      {scopeForm.type === 'company' && t('config:scope_modal.type_hints.company')}
                      {scopeForm.type === 'person' && t('config:scope_modal.type_hints.person')}
                      {scopeForm.type === 'product' && t('config:scope_modal.type_hints.product')}
                    </small>
                    {existingCompanyScope && (
                      <small className="form-hint">
                        {t('config:scope_modal.single_company_hint', { name: existingCompanyScope.name })}
                      </small>
                    )}
                  </div>
                  <div className="form-group">
                    <label>{t('common:status')}</label>
                    <select
                      value={scopeForm.active ? '1' : '0'}
                      onChange={(e) => setScopeForm((prev) => ({ ...prev, active: e.target.value === '1' }))}
                    >
                      <option value="1">✅ {t('common:active')}</option>
                      <option value="0">⏸ {t('common:inactive')}</option>
                    </select>
                    <small className="form-hint">{t('config:scope_modal.inactive_hint')}</small>
                  </div>
                </div>
              </div>

              <div className="scope-form-section">
                <div className="scope-form-section-title">{t('config:scope_modal.hierarchy_title')}</div>
                <div className="form-group">
                  <label>{t('config:scope_modal.parent')}</label>
                  <select
                    value={scopeForm.parentId}
                    onChange={(e) => setScopeForm((prev) => ({ ...prev, parentId: e.target.value }))}
                  >
                    <option value="">{t('config:scope_modal.no_parent')}</option>
                    {orgScopes?.filter((s: any) => s.id !== editingScope?.id).map((scope: any) => (
                      <option key={scope.id} value={scope.id}>
                        {scope.type === 'company' ? '🏢' : scope.type === 'area' ? '🗂' : scope.type === 'team' ? '👥' : '📦'} {scope.name}
                      </option>
                    ))}
                  </select>
                  <small className="form-hint">
                    {t('config:scope_modal.parent_hint')}
                  </small>
                </div>
                <div className="form-group">
                  <label>{t('config:scope_modal.calendar')}</label>
                  <select
                    value={scopeForm.calendarProfileId}
                    onChange={(e) =>
                      setScopeForm((prev) => ({ ...prev, calendarProfileId: e.target.value }))
                    }
                  >
                    <option value="">{t('config:scope_modal.calendar_inherit')}</option>
                    {calendarProfiles?.map((profile: any) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                  <small className="form-hint">
                    {t('config:scope_modal.calendar_hint')}
                  </small>
                </div>
              </div>

              <button
                type="button"
                className="scope-advanced-toggle"
                onClick={() => setScopeAdvancedOpen((v) => !v)}
              >
                <span>{scopeAdvancedOpen ? '▲' : '▼'}</span>
                {scopeAdvancedOpen ? t('config:scope_modal.hide_advanced') : t('config:scope_modal.show_advanced')}
                <span className="scope-advanced-hint">{t('config:scope_modal.advanced_hint')}</span>
              </button>
              {scopeAdvancedOpen && (
                <div className="scope-form-section scope-advanced-section">
                  <div className="form-group">
                    <label>{t('config:scope_modal.integration_params')}</label>
                    <textarea
                      rows={3}
                      value={scopeForm.metadataText}
                      onChange={(e) => setScopeForm((prev) => ({ ...prev, metadataText: e.target.value }))}
                      placeholder={t('config:scope_modal.integration_params_placeholder')}
                    />
                    <small className="form-hint">
                      {t('config:scope_modal.integration_params_hint')}
                    </small>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>{t('config:scope_modal.external_connector')}</label>
                      <select
                        value={scopeMappingSourceType}
                        onChange={(e) => setScopeMappingSourceType(normalizeMappingSourceType(e.target.value))}
                      >
                        {MAPPING_SOURCE_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {getConfigSourceTypeLabel(option.value)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>{t('config:scope_modal.connector_alias')}</label>
                      <input
                        value={scopeExternalKeysBySourceType[scopeMappingSourceType] || ''}
                        onChange={(e) => updateScopeExternalKeysForSourceType(e.target.value)}
                        placeholder={t('config:scope_modal.connector_alias_placeholder')}
                      />
                      <small className="form-hint">
                        {t('config:scope_modal.connector_alias_hint', { source: getConfigSourceTypeLabel(scopeMappingSourceType) })}
                      </small>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowScopeModal(false)}>
                {t('common:cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={() => saveScope.mutate()}
                disabled={!scopeForm.name.trim() || saveScope.isLoading}
              >
                {saveScope.isLoading ? t('config:actions.saving') : t('config:actions.save_unit')}
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

      {slackWizardOpen && (
        <SlackWizard onClose={() => setSlackWizardOpen(false)} />
      )}
    </div>
  )
}
