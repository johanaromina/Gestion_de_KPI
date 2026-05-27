import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { useDialog } from '../components/Dialog'
import { closeOnOverlayClick, markOverlayPointerDown } from '../utils/modal'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import './InputDatos.css'

type Measurement = {
  id: number
  assignmentId: number
  value: number
  mode: 'manual' | 'import' | 'auto'
  status: 'draft' | 'proposed' | 'approved' | 'rejected'
  capturedAt?: string
  capturedByName?: string
  sourceRunId?: string
  evidenceUrl?: string
}

type IntegrationTarget = {
  id: number
  templateId: number
  assignmentId?: number | null
  enabled?: number | null
  templateName?: string | null
  templateSchedule?: string | null
}

type IntegrationRun = {
  id: number
  status: string
  startedAt?: string
  finishedAt?: string
  outputs?: any
}

const MEASUREMENT_API_ERROR_KEYS: Record<string, string> = {
  MEASUREMENT_OWNER_INVALID: 'input:measurements.api_errors.owner_invalid',
  MEASUREMENT_VALUE_REQUIRED: 'input:measurements.api_errors.value_required',
  MEASUREMENT_CURATION_REQUIRED: 'input:measurements.api_errors.curation_required',
  MEASUREMENT_SUBPERIOD_CLOSED: 'input:measurements.api_errors.subperiod_closed',
}

const INPUT_TARGET_RUN_API_ERROR_KEYS: Record<string, string> = {
  INTEGRATION_TARGET_NOT_FOUND: 'input:auto_ingest.api_errors.target_not_found',
}

const formatDateTime = (value: string | null | undefined, locale: string) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale)
}

export default function InputDatos() {
  const { t, i18n } = useTranslation(['input', 'common'])
  const locale = i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'es-AR'

  const getCollaboratorLabel = (name?: string | null, id?: number | string | null) =>
    name || t('filters.collaborator_fallback', { id })

  const getKpiLabel = (name?: string | null, id?: number | string | null) =>
    name || t('filters.kpi_fallback', { id })

  const getPeriodLabel = (name?: string | null, id?: number | string | null) =>
    name || t('filters.period_fallback', { id })

  const getSubPeriodLabel = (name?: string | null, id?: number | string | null) =>
    name || t('filters.subperiod_fallback', { id })

  const [showOnlyPending, setShowOnlyPending] = useState(false)
  const [searchParams] = useSearchParams()
  const assignmentFromQuery = searchParams.get('assignmentId')
  const [selectedAssignmentGroupId, setSelectedAssignmentGroupId] = useState<number | ''>('')
  const [selectedSubPeriodId, setSelectedSubPeriodId] = useState<number | ''>('')
  const [selectedScopeId, setSelectedScopeId] = useState<number | ''>('')
  const [selectedKpiId, setSelectedKpiId] = useState<number | ''>('')
  const [showMeasurementModal, setShowMeasurementModal] = useState(false)
  const [newValue, setNewValue] = useState('')
  const [newMode, setNewMode] = useState<'manual' | 'import' | 'auto'>('manual')
  const [newStatus, setNewStatus] = useState<'draft' | 'proposed' | 'approved'>('approved')
  const [newReason, setNewReason] = useState('')
  const [newEvidence, setNewEvidence] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState('')
  const [inlineAlert, setInlineAlert] = useState<{ type: 'info' | 'warning' | 'error'; message: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const navigate = useNavigate()
  const dialog = useDialog()
  const queryClient = useQueryClient()

  const { data: assignments } = useQuery('collaborator-kpis', async () => {
    const response = await api.get('/collaborator-kpis')
    return response.data
  })

  const { data: collaborators } = useQuery('input-collaborators', async () => {
    const response = await api.get('/collaborators')
    return response.data
  })

  const { data: orgScopes } = useQuery('input-org-scopes', async () => {
    const response = await api.get('/org-scopes')
    return response.data
  })

  const { data: calendarProfiles } = useQuery(
    'input-calendar-profiles',
    async () => {
      const response = await api.get('/calendar-profiles')
      return response.data
    },
    { staleTime: 5 * 60 * 1000 }
  )

  const { data: kpis } = useQuery('input-kpis', async () => {
    const response = await api.get('/kpis')
    return response.data
  })

  const scopeOptions = useMemo(() => {
    if (!orgScopes) return []
    return orgScopes
      .filter((scope: any) => scope.type === 'area' && scope.active !== 0 && scope.active !== false)
      .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)))
  }, [orgScopes])

  const assignmentsWithScope = useMemo(() => {
    if (!assignments) return []
    return assignments.map((assignment: any) => {
      const collaborator = collaborators?.find((c: any) => c.id === assignment.collaboratorId)
      const collaboratorScopeId = collaborator?.orgScopeId || null
      const collaboratorArea =
        assignment.collaboratorArea || collaborator?.area || ''
      return { ...assignment, collaboratorArea, collaboratorScopeId }
    })
  }, [assignments, collaborators])

  const filteredAssignments = useMemo(() => {
    return assignmentsWithScope.filter((assignment: any) => {
      if (selectedScopeId && assignment.collaboratorScopeId !== selectedScopeId) return false
      if (selectedKpiId && assignment.kpiId !== selectedKpiId) return false
      return true
    })
  }, [assignmentsWithScope, selectedScopeId, selectedKpiId])

  const collapsedAssignments = useMemo(() => {
    const groups = new Map<string, any[]>()
    for (const assignment of filteredAssignments) {
      const key = `${assignment.collaboratorId}-${assignment.kpiId}-${assignment.periodId}`
      const current = groups.get(key) || []
      current.push(assignment)
      groups.set(key, current)
    }

    const result: Array<{ id: number; key: string; label: string }> = []
    for (const [key, group] of groups.entries()) {
      const sorted = [...group].sort((a, b) => Number(a.id) - Number(b.id))
      const base = sorted.find((item: any) => item.subPeriodId == null) || sorted[0]
      const label = `${getCollaboratorLabel(base.collaboratorName, base.collaboratorId)} · ${
        getKpiLabel(base.kpiName, base.kpiId)
      } · ${getPeriodLabel(base.periodName, base.periodId)}`
      result.push({ id: base.id, key, label })
    }

    return result.sort((a, b) => a.label.localeCompare(b.label))
  }, [filteredAssignments])

  const selectedGroup = useMemo(
    () => collapsedAssignments.find((assignment) => assignment.id === selectedAssignmentGroupId),
    [collapsedAssignments, selectedAssignmentGroupId]
  )

  const selectedGroupAssignments = useMemo(() => {
    if (!selectedGroup) return []
    return assignmentsWithScope.filter(
      (assignment: any) =>
        `${assignment.collaboratorId}-${assignment.kpiId}-${assignment.periodId}` === selectedGroup.key
    )
  }, [assignmentsWithScope, selectedGroup])

  const availableSubPeriods = useMemo(() => {
    if (!selectedGroupAssignments.length) return []
    return selectedGroupAssignments
      .filter((assignment: any) => assignment.subPeriodId != null)
      .map((assignment: any) => ({
        id: assignment.subPeriodId,
        name: getSubPeriodLabel(assignment.subPeriodName, assignment.subPeriodId),
      }))
  }, [selectedGroupAssignments])

  useEffect(() => {
    if (!selectedAssignmentGroupId) return
    if (selectedSubPeriodId) return
    if (availableSubPeriods.length > 0) {
      setSelectedSubPeriodId(availableSubPeriods[0].id)
    }
  }, [selectedAssignmentGroupId, selectedSubPeriodId, availableSubPeriods])

  const selectedAssignmentId = useMemo(() => {
    if (!selectedGroupAssignments.length) return ''
    if (selectedSubPeriodId) {
      const match = selectedGroupAssignments.find(
        (assignment: any) => assignment.subPeriodId === selectedSubPeriodId
      )
      if (match) return match.id
    }
    const base =
      selectedGroupAssignments.find((assignment: any) => assignment.subPeriodId == null) ||
      selectedGroupAssignments[0]
    return base?.id || ''
  }, [selectedGroupAssignments, selectedSubPeriodId])

  const kpisByScope = useMemo(() => {
    if (!kpis) return []
    const kpiIdsInScope = new Set(
      assignmentsWithScope
        .filter((assignment: any) => (selectedScopeId ? assignment.collaboratorScopeId === selectedScopeId : true))
        .map((assignment: any) => assignment.kpiId)
    )
    return kpis.filter((kpi: any) => kpiIdsInScope.has(kpi.id))
  }, [kpis, assignmentsWithScope, selectedScopeId])

  useEffect(() => {
    if (!selectedAssignmentGroupId) return
    const exists = collapsedAssignments.some((assignment) => assignment.id === selectedAssignmentGroupId)
    if (!exists) {
      setSelectedAssignmentGroupId('')
      setSelectedSubPeriodId('')
    }
  }, [collapsedAssignments, selectedAssignmentGroupId])

  useEffect(() => {
    if (!selectedKpiId) return
    const exists = kpisByScope.some((kpi: any) => kpi.id === selectedKpiId)
    if (!exists) {
      setSelectedKpiId('')
    }
  }, [kpisByScope, selectedKpiId])

  useEffect(() => {
    if (!assignmentFromQuery || !assignmentsWithScope.length) return
    const assignmentId = Number(assignmentFromQuery)
    const assignment = assignmentsWithScope.find((a: any) => a.id === assignmentId)
    if (!assignment) return
    const key = `${assignment.collaboratorId}-${assignment.kpiId}-${assignment.periodId}`
    const group = collapsedAssignments.find((item) => item.key === key)
    if (group) {
      setSelectedAssignmentGroupId(group.id)
      setSelectedSubPeriodId(assignment.subPeriodId ?? '')
    }
  }, [assignmentFromQuery, assignmentsWithScope, collapsedAssignments])

  const selectedAssignmentData = useMemo(() => {
    if (!assignmentsWithScope || !selectedAssignmentId) return null
    return assignmentsWithScope.find((assignment: any) => assignment.id === selectedAssignmentId) || null
  }, [assignmentsWithScope, selectedAssignmentId])

  const { data: integrationTargets } = useQuery<IntegrationTarget[]>(
    ['integration-targets', selectedAssignmentId],
    async () => {
      const response = await api.get('/integrations/targets', {
        params: { assignmentId: selectedAssignmentId },
      })
      return response.data
    },
    { enabled: !!selectedAssignmentId }
  )

  const selectedIntegrationTarget = useMemo(() => {
    if (!integrationTargets || integrationTargets.length === 0) return null
    return integrationTargets.find((target) => target.enabled) || integrationTargets[0]
  }, [integrationTargets])

  const { data: integrationRuns } = useQuery<IntegrationRun[]>(
    ['integration-runs', selectedIntegrationTarget?.id],
    async () => {
      const response = await api.get('/integrations/runs', {
        params: {
          templateId: selectedIntegrationTarget?.templateId,
          targetId: selectedIntegrationTarget?.id,
        },
      })
      return response.data
    },
    { enabled: !!selectedIntegrationTarget?.id }
  )

  const latestIntegrationRun = integrationRuns?.[0] || null

  const { data: nextCronRun } = useQuery<{ nextRun?: string | null }>(
    ['integration-next-run', selectedIntegrationTarget?.templateSchedule],
    async () => {
      const response = await api.get('/integrations/cron/next', {
        params: { expression: selectedIntegrationTarget?.templateSchedule },
      })
      return response.data
    },
    { enabled: !!selectedIntegrationTarget?.templateSchedule }
  )

  const selectedCalendarProfile = useMemo(() => {
    if (!calendarProfiles || !selectedAssignmentData?.calendarProfileId) return null
    return (
      calendarProfiles.find(
        (profile: any) => Number(profile.id) === Number(selectedAssignmentData.calendarProfileId)
      ) || null
    )
  }, [calendarProfiles, selectedAssignmentData?.calendarProfileId])

  const curationStatus = selectedAssignmentData?.curationStatus || 'pending'
  const isCurationApproved = curationStatus === 'approved'
  const canApproveWithWarning = curationStatus === 'in_review'
  const canApproveMeasurement = isCurationApproved || canApproveWithWarning
  const approvalWarning = canApproveWithWarning ? t('curation.warning') : null

  const getCurationStatusLabel = (status?: string | null) => {
    if (!status) return t('common:pending')
    const normalized = status.toLowerCase()
    const known = ['pending', 'in_review', 'approved', 'rejected', 'changes_requested']
    if (known.includes(normalized)) {
      return t(`common:${normalized}`)
    }
    return status
  }

  const getRunStatusLabel = (status?: string | null) => {
    if (!status) return '-'
    const normalized = status.toLowerCase()
    const known = ['success', 'error', 'running', 'queued']
    if (known.includes(normalized)) {
      return t(`job.status_${normalized}`)
    }
    return status
  }

  const getMeasurementModeLabel = (mode?: Measurement['mode'] | string | null) => {
    if (!mode) return '-'
    const normalized = String(mode).toLowerCase()
    const known = ['manual', 'import', 'auto']
    if (known.includes(normalized)) {
      return t(`measurements.mode_${normalized}`)
    }
    return String(mode)
  }

  const getCalendarFrequencyLabel = (frequency?: string | null) => {
    if (!frequency) return '-'
    const normalized = frequency.toLowerCase()
    const known = ['monthly', 'quarterly', 'custom']
    if (known.includes(normalized)) {
      return t(`meta.calendar_frequency_${normalized}`)
    }
    return frequency
  }

  const { data: measurements, isLoading } = useQuery<Measurement[]>(
    ['measurements', selectedAssignmentId],
    async () => {
      const response = await api.get('/measurements', {
        params: { assignmentId: selectedAssignmentId || undefined },
      })
      return response.data
    },
    { enabled: !!selectedAssignmentId }
  )

  const createMeasurement = useMutation<any, any, boolean>(
    async (force: boolean) => {
      if (!selectedAssignmentId) return null
      const response = await api.post('/measurements', {
        assignmentId: selectedAssignmentId,
        value: Number(newValue),
        mode: newMode,
        status: newStatus,
        reason: newReason.trim() || undefined,
        evidenceUrl: newEvidence.trim() || undefined,
        force: force || undefined,
      })
      return response.data
    },
    {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries(['measurements', selectedAssignmentId])
        setNewValue('')
        setNewReason('')
        setNewEvidence('')
        setShowMeasurementModal(false)
        if (data?.warning) {
          setInlineAlert({ type: 'warning', message: data.warning })
        } else {
          setInlineAlert({ type: 'info', message: t('measurements.loaded_ok') })
        }
      },
      onError: async (error: any) => {
        if (error?.response?.status === 409) {
          const { existingValue, existingDate } = error.response.data
          const fecha = existingDate ? new Date(existingDate).toLocaleDateString(locale) : ''
          const datePart = fecha ? t('duplicate_dialog.date_part', { date: fecha }) : ''
          const ok = await dialog.confirm(
            t('duplicate_dialog.message', { value: existingValue, date: datePart }),
            { title: t('duplicate_dialog.title'), confirmLabel: t('duplicate_dialog.confirm'), variant: 'danger' }
          )
          if (ok) createMeasurement.mutate(true)
        } else {
          setInlineAlert({
            type: 'error',
            message: resolveApiErrorMessage(error, t, {
              codeMap: MEASUREMENT_API_ERROR_KEYS,
              fallbackKey: 'measurements.save_error',
            }),
          })
        }
      },
    }
  )

  const runJobNow = useMutation(
    async () => {
      if (!selectedIntegrationTarget?.id) {
        throw new Error(t('auto_ingest.no_target'))
      }
      const response = await api.post(`/integrations/targets/${selectedIntegrationTarget.id}/run`)
      return response.data
    },
    {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries(['integration-runs', selectedIntegrationTarget?.id])
        queryClient.invalidateQueries(['measurements', selectedAssignmentId])
        if (data?.result?.skipped) {
          setInlineAlert({ type: 'warning', message: data?.result?.reason || t('auto_ingest.no_target') })
          return
        }
        if (data?.result?.runId) {
          setInlineAlert({ type: 'info', message: t('measurements.job_ok') })
        }
      },
      onError: (error: any) => {
        setInlineAlert({
          type: 'error',
          message: resolveApiErrorMessage(error, t, {
            codeMap: INPUT_TARGET_RUN_API_ERROR_KEYS,
            fallbackKey: 'measurements.save_error',
          }),
        })
      },
    }
  )

  const approveMeasurement = useMutation(
    async (id: number) => {
      const response = await api.post(`/measurements/${id}/approve`)
      return response.data
    },
    {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries(['measurements', selectedAssignmentId])
        if (data?.warning) {
          setInlineAlert({ type: 'warning', message: data.warning })
        }
      },
    }
  )

  const approvalBlockedReason = useMemo(() => {
    if (isCurationApproved || canApproveWithWarning) return null
    return t('curation.blocked')
  }, [isCurationApproved, canApproveWithWarning, t])

  const handleApprove = async (id: number) => {
    if (!canApproveMeasurement) return
    if (canApproveWithWarning) {
      const confirmed = await dialog.confirm(
        t('curation.warning'),
        { title: t('curation.blocked'), confirmLabel: t('measurements.approve'), variant: 'warning' }
      )
      if (!confirmed) return
    }
    approveMeasurement.mutate(id)
  }

  const rejectMeasurement = useMutation(
    async (id: number) => {
      await api.post(`/measurements/${id}/reject`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['measurements', selectedAssignmentId])
      },
    }
  )

  const filteredMeasurements = useMemo(() => {
    if (!measurements) return []
    if (!showOnlyPending) return measurements
    return measurements.filter((m) => m.status === 'proposed' || m.status === 'draft')
  }, [measurements, showOnlyPending])

  const getMeasurementStatusLabel = (status: Measurement['status']) => {
    switch (status) {
      case 'approved': return t('measurements.status_approved')
      case 'rejected': return t('measurements.status_rejected')
      case 'proposed': return t('measurements.status_proposed')
      default: return t('measurements.status_draft')
    }
  }

  const parseCsvLine = (line: string) => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += char
      }
    }
    result.push(current)
    return result.map((value) => value.trim())
  }

  const normalizeHeader = (header: string) =>
    header.trim().toLowerCase().replace(/\s+/g, '')

  const handleTemplateDownload = () => {
    const headers = [
      'assignmentId',
      'value',
      'mode',
      'status',
      'reason',
      'evidenceUrl',
      'sourceRunId',
    ]
    const csv = `${headers.join(',')}\n`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `plantilla_mediciones_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const handleFileUpload = async (file: File) => {
    setUploadMessage('')
    setUploading(true)
    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter((line) => line.trim())
      if (lines.length === 0) {
        setUploadMessage(t('upload.empty'))
        return
      }

      const headers = parseCsvLine(lines[0]).map(normalizeHeader)
      const headerIndex = (name: string) => headers.indexOf(normalizeHeader(name))
      const idxAssignment = headerIndex('assignmentid')
      const idxValue = headerIndex('value')
      const idxMode = headerIndex('mode')
      const idxStatus = headerIndex('status')
      const idxReason = headerIndex('reason')
      const idxEvidence = headerIndex('evidenceurl')
      const idxSourceRun = headerIndex('sourcerunid')

      const errors: string[] = []
      let created = 0

      for (let i = 1; i < lines.length; i += 1) {
        const row = parseCsvLine(lines[i])
        const assignmentId = idxAssignment >= 0 ? Number(row[idxAssignment]) : Number(selectedAssignmentId)
        const value = idxValue >= 0 ? Number(row[idxValue]) : Number(row[0])
        const mode = (idxMode >= 0 ? row[idxMode] : 'import') as Measurement['mode']
        const status = (idxStatus >= 0 ? row[idxStatus] : 'proposed') as Measurement['status']
        const reason = idxReason >= 0 ? row[idxReason] : ''
        const evidenceUrl = idxEvidence >= 0 ? row[idxEvidence] : ''
        const sourceRunId = idxSourceRun >= 0 ? row[idxSourceRun] : ''

        if (!assignmentId || Number.isNaN(assignmentId)) {
          errors.push(t('upload.row_invalid_assignment', { row: i + 1 }))
          continue
        }
        if (value === undefined || Number.isNaN(value)) {
          errors.push(t('upload.row_invalid_value', { row: i + 1 }))
          continue
        }

        try {
          await api.post('/measurements', {
            assignmentId,
            value,
            mode: mode || 'import',
            status: status || 'proposed',
            reason: reason || undefined,
            evidenceUrl: evidenceUrl || undefined,
            sourceRunId: sourceRunId || undefined,
          })
          created += 1
        } catch (error: any) {
          errors.push(
            t('upload.row_error', {
              row: i + 1,
              error: resolveApiErrorMessage(error, t, {
                codeMap: MEASUREMENT_API_ERROR_KEYS,
                fallbackKey: 'upload.row_error_fallback',
              }),
            })
          )
        }
      }

      if (selectedAssignmentId) {
        queryClient.invalidateQueries(['measurements', selectedAssignmentId])
      }

      if (errors.length > 0) {
        setUploadMessage(
          t('upload.partial', { created, errors: errors.slice(0, 3).join(' ') + (errors.length > 3 ? ' ...' : '') })
        )
      } else {
        setUploadMessage(t('upload.success', { created }))
      }
    } finally {
      setUploading(false)
    }
  }

  const handleAutoFetch = async () => {
    if (!selectedAssignmentId) {
      setInlineAlert({ type: 'warning', message: t('auto_fetch.no_assignment') })
      return
    }
    const value = await dialog.prompt(t('auto_fetch.prompt'), {
      title: t('auto_fetch.prompt_title'), placeholder: t('auto_fetch.prompt_placeholder'), confirmLabel: t('auto_fetch.prompt_confirm')
    })
    if (!value) return
    await api.post('/measurements', {
      assignmentId: selectedAssignmentId,
      value: Number(value),
      mode: 'auto',
      status: 'proposed',
    })
    queryClient.invalidateQueries(['measurements', selectedAssignmentId])
    setInlineAlert({ type: 'info', message: t('auto_fetch.success') })
  }

  return (
    <div className="input-page">
      {inlineAlert && (
        <div className={`info-banner ${inlineAlert.type === 'error' ? 'error' : inlineAlert.type === 'warning' ? 'warning' : 'info'}`} style={{ marginBottom: 16 }}>
          {inlineAlert.message}
          <button
            onClick={() => setInlineAlert(null)}
            style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
          >
            ×
          </button>
        </div>
      )}
      <div className="page-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="subtitle">{t('subtitle')}</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => navigate('/configuracion')}>
            {t('actions.configure_integrations')}
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              if (!selectedAssignmentId) {
                setInlineAlert({ type: 'warning', message: t('upload.no_assignment_warning') })
                return
              }
              setShowMeasurementModal(true)
            }}
          >
            {t('actions.new_manual')}
          </button>
        </div>
      </div>

      <div className="input-grid">
        <div className="card">
          <h3>{t('auto_ingest.title')}</h3>
          <p className="muted">{t('auto_ingest.description')}</p>
          <div className="auto-list muted">
            {selectedIntegrationTarget
              ? t('auto_ingest.active', { name: selectedIntegrationTarget.templateName || t('job.target_fallback', { id: selectedIntegrationTarget.id }) })
              : t('auto_ingest.none')}
          </div>
          <div className="card-actions">
            <button
              className="btn-secondary"
              onClick={() => {
                if (!selectedIntegrationTarget?.id) {
                  setInlineAlert({ type: 'warning', message: t('auto_ingest.no_target') })
                  return
                }
                runJobNow.mutate()
              }}
              disabled={!selectedIntegrationTarget?.id || runJobNow.isLoading}
            >
              {runJobNow.isLoading ? t('actions.running') : t('actions.run_jobs_now')}
            </button>
          </div>
          {!selectedIntegrationTarget && selectedAssignmentId && (
            <div className="form-hint">{t('auto_ingest.no_target')}</div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3>{t('measurements.title')}</h3>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showOnlyPending}
                onChange={(e) => setShowOnlyPending(e.target.checked)}
              />
              <span>{t('measurements.only_pending')}</span>
            </label>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="scope-select">{t('filters.area_label')}</label>
              <select
                id="scope-select"
                value={selectedScopeId}
                onChange={(e) => setSelectedScopeId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">{t('filters.all_areas')}</option>
                {scopeOptions.map((scope: any) => (
                  <option key={scope.id} value={scope.id}>
                    {scope.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="kpi-select">{t('filters.kpi_label')}</label>
              <select
                id="kpi-select"
                value={selectedKpiId}
                onChange={(e) => setSelectedKpiId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">{t('filters.all_kpis')}</option>
                {kpisByScope.map((kpi: any) => (
                  <option key={kpi.id} value={kpi.id}>
                    {kpi.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="assignment-select">{t('filters.assignment_label')}</label>
              <select
                id="assignment-select"
                value={selectedAssignmentGroupId}
                onChange={(e) => {
                  setSelectedAssignmentGroupId(e.target.value ? Number(e.target.value) : '')
                  setSelectedSubPeriodId('')
                }}
              >
                <option value="">{t('filters.select_assignment')}</option>
                {collapsedAssignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="subperiod-select">{t('filters.subperiod_label')}</label>
              <select
                id="subperiod-select"
                value={selectedSubPeriodId}
                onChange={(e) =>
                  setSelectedSubPeriodId(e.target.value ? Number(e.target.value) : '')
                }
                disabled={!selectedAssignmentGroupId}
              >
                <option value="">{t('filters.subperiod_summary')}</option>
                {availableSubPeriods.map((sp: any) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {collapsedAssignments.length === 0 ? (
            <div className="form-hint">{t('filters.no_assignments')}</div>
          ) : null}
          {selectedAssignmentData && (
            <div className="cycle-indicator">
              <div className={`cycle-step done`}>
                <span className="cycle-dot">✓</span>
                <span>{t('cycle.assignment')}</span>
              </div>
              <div className="cycle-arrow">→</div>
              <div className={`cycle-step ${isCurationApproved ? 'done' : canApproveWithWarning ? 'partial' : 'pending'}`}>
                <span className="cycle-dot">{isCurationApproved ? '✓' : canApproveWithWarning ? '~' : '○'}</span>
                <span>{t('cycle.criteria')}</span>
              </div>
              <div className="cycle-arrow">→</div>
              <div className={`cycle-step ${(measurements?.length ?? 0) > 0 ? 'done' : 'pending'}`}>
                <span className="cycle-dot">{(measurements?.length ?? 0) > 0 ? '✓' : '○'}</span>
                <span>{t('cycle.measurement')}</span>
              </div>
              <div className="cycle-arrow">→</div>
              <div className={`cycle-step ${measurements?.some(m => m.status === 'approved') ? 'done' : 'pending'}`}>
                <span className="cycle-dot">{measurements?.some(m => m.status === 'approved') ? '✓' : '○'}</span>
                <span>{t('cycle.approval')}</span>
              </div>
            </div>
          )}
          {selectedAssignmentData && (
            <div className="assignment-meta">
              <div>
                <span className="meta-label">{t('meta.source_label')}</span>{' '}
                <span className="meta-value">
                  {selectedAssignmentData.dataSourceName ||
                    selectedAssignmentData.dataSource ||
                    t('meta.no_source')}
                </span>
                {selectedAssignmentData.sourceConfig && (
                  <span className="meta-sub">· {selectedAssignmentData.sourceConfig}</span>
                )}
              </div>
              <div>
                <span className="meta-label">{t('meta.curation_label')}</span>{' '}
                <span className={`status-pill ${isCurationApproved ? 'ok' : 'review'}`}>
                  {getCurationStatusLabel(selectedAssignmentData.curationStatus)}
                </span>
              </div>
              <div className="meta-criteria">
                <span className="meta-label">{t('meta.criteria_label')}</span>{' '}
                <span
                  className="meta-value"
                  title={
                    selectedAssignmentData.criteriaText ||
                    selectedAssignmentData.kpiCriteria ||
                    ''
                  }
                >
                  {selectedAssignmentData.criteriaText ||
                    selectedAssignmentData.kpiCriteria ||
                    t('meta.no_criteria')}
                </span>
              </div>
              {selectedCalendarProfile && (
                <div>
                  <span className="meta-label">{t('meta.calendar_label')}</span>{' '}
                  <span className="calendar-pill">
                    {selectedCalendarProfile.name} ({getCalendarFrequencyLabel(selectedCalendarProfile.frequency)})
                  </span>
                </div>
              )}
            </div>
          )}
          {selectedIntegrationTarget && (
            <div className="job-status">
              <div className="job-header">
                <strong>{t('job.title')}</strong>
                <span className="job-meta">
                  {selectedIntegrationTarget.templateName || t('meta.integration_fallback')} ·{' '}
                  {selectedIntegrationTarget.templateSchedule || t('job.no_cron')}
                </span>
              </div>
              <div className="job-row">
                <span className="meta-label">{t('job.last_run')}</span>{' '}
                <span className="meta-value">{formatDateTime(latestIntegrationRun?.startedAt, locale)}</span>
                <span className={`status-pill ${latestIntegrationRun?.status === 'success' ? 'ok' : 'review'}`}>
                  {getRunStatusLabel(latestIntegrationRun?.status)}
                </span>
              </div>
              <div className="job-row">
                <span className="meta-label">{t('job.next_run')}</span>{' '}
                <span className="meta-value">{formatDateTime(nextCronRun?.nextRun, locale)}</span>
              </div>
              <div className="job-row">
                <span className="meta-label">{t('job.subperiod_label')}</span>{' '}
                <span className="meta-value">
                  {getSubPeriodLabel(
                    latestIntegrationRun?.outputs?.subPeriodName ||
                      availableSubPeriods.find((sp: any) => sp.id === selectedSubPeriodId)?.name,
                    selectedSubPeriodId
                  )}
                </span>
              </div>
              {latestIntegrationRun?.outputs?.skipped && (
                <div className="job-row warning">
                  <span className="meta-label">{t('job.skipped_label')}</span>{' '}
                  <span className="meta-value">
                    {latestIntegrationRun?.outputs?.skipReason || t('job.skipped_default')}
                  </span>
                </div>
              )}
            </div>
          )}
          {approvalWarning && (
            <div className="info-banner warning">
              {approvalWarning}
            </div>
          )}
          {!canApproveMeasurement && approvalBlockedReason && (
            <div className="info-banner error" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>⚠️ {approvalBlockedReason}. {t('curation.blocked_detail')}</span>
              <button
                className="btn-secondary"
                style={{ marginLeft: 12, padding: '4px 12px', fontSize: 12, whiteSpace: 'nowrap' }}
                onClick={() => navigate('/curaduria')}
              >
                {t('actions.go_curation')}
              </button>
            </div>
          )}
          <table className="input-table">
            <thead>
              <tr>
                <th>{t('measurements.table.value')}</th>
                <th>{t('measurements.table.mode')}</th>
                <th>{t('measurements.table.date')}</th>
                <th>{t('measurements.table.source')}</th>
                <th>{t('measurements.table.status')}</th>
                <th>{t('measurements.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && selectedAssignmentId ? (
                <tr>
                  <td colSpan={6} className="empty-row">{t('measurements.loading')}</td>
                </tr>
              ) : (
                filteredMeasurements.map((measurement) => (
                  <tr key={measurement.id}>
                    <td>{measurement.value}</td>
                    <td>{getMeasurementModeLabel(measurement.mode)}</td>
                    <td>{formatDateTime(measurement.capturedAt, locale)}</td>
                    <td>{measurement.capturedByName || measurement.sourceRunId || '-'}</td>
                    <td>
                      <span className={`status-pill ${measurement.status === 'approved' ? 'ok' : 'review'}`}>
                        {getMeasurementStatusLabel(measurement.status)}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-secondary"
                          disabled={
                            measurement.status === 'approved' ||
                            approveMeasurement.isLoading ||
                            !canApproveMeasurement
                          }
                          onClick={() => handleApprove(measurement.id)}
                          title={!canApproveMeasurement ? approvalBlockedReason || '' : ''}
                        >
                          {t('measurements.approve')}
                        </button>
                        {!canApproveMeasurement && approvalBlockedReason && (
                          <span className="action-hint">{approvalBlockedReason}</span>
                        )}
                        <button
                          className="btn-secondary"
                          disabled={measurement.status === 'rejected' || rejectMeasurement.isLoading}
                          onClick={() => rejectMeasurement.mutate(measurement.id)}
                        >
                          {t('measurements.reject')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
              {!selectedAssignmentId && (
                <tr>
                  <td colSpan={6} className="empty-row">{t('measurements.empty_no_assignment')}</td>
                </tr>
              )}
              {selectedAssignmentId && filteredMeasurements.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="empty-row">{t('measurements.empty')}</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="card-actions">
            <button className="btn-secondary" onClick={handleTemplateDownload}>
              {t('actions.download_template')}
            </button>
            <button
              className="btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? t('actions.uploading') : t('actions.upload_file')}
            </button>
            <button className="btn-secondary" onClick={handleAutoFetch}>
              {t('actions.run_auto_fetch')}
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                if (!selectedAssignmentId) {
                  setInlineAlert({ type: 'warning', message: t('upload.no_assignment_warning') })
                  return
                }
                setShowMeasurementModal(true)
              }}
            >
              {t('actions.manual_load')}
            </button>
          </div>
          {uploadMessage ? <div className="upload-message">{uploadMessage}</div> : null}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden-file-input"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              void handleFileUpload(file)
              e.currentTarget.value = ''
            }}
          />
        </div>
      </div>

      <div className="card validations-card">
        <h3>{t('validations.title')}</h3>
        <div className="validations-grid">
          <div className="validation-item">
            <div className="validation-title">{t('validations.types_title')}</div>
            <div className="validation-desc">{t('validations.types_desc')}</div>
          </div>
          <div className="validation-item">
            <div className="validation-title">{t('validations.nulls_title')}</div>
            <div className="validation-desc">{t('validations.nulls_desc')}</div>
          </div>
          <div className="validation-item">
            <div className="validation-title">{t('validations.ranges_title')}</div>
            <div className="validation-desc">{t('validations.ranges_desc')}</div>
          </div>
          <div className="validation-item">
            <div className="validation-title">{t('validations.duplicates_title')}</div>
            <div className="validation-desc">{t('validations.duplicates_desc')}</div>
          </div>
        </div>
      </div>

      {showMeasurementModal && (
        <div
          className="modal-overlay"
          onPointerDown={markOverlayPointerDown}
          onClick={(e) => closeOnOverlayClick(e, () => setShowMeasurementModal(false))}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('modal.title')}</h2>
              <button className="close-button" onClick={() => setShowMeasurementModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-meta">
                {selectedAssignmentData
                  ? `${getCollaboratorLabel(selectedAssignmentData.collaboratorName, selectedAssignmentData.collaboratorId)} · ${getKpiLabel(selectedAssignmentData.kpiName, selectedAssignmentData.kpiId)}`
                  : t('modal.assignment_fallback')}
              </div>
              {(() => {
                const currentApproved = (measurements ?? []).find((m) => m.status === 'approved')
                if (!currentApproved) return null
                return (
                  <div className="modal-current-value">
                    {t('modal.current_value')} <strong>{currentApproved.value}</strong>
                    {currentApproved.capturedAt && (
                      <span> · {new Date(currentApproved.capturedAt).toLocaleDateString(locale)}</span>
                    )}
                  </div>
                )
              })()}
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="measurement-value">{t('modal.value_label')}</label>
                  <input
                    id="measurement-value"
                    type="number"
                    step="any"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder={t('modal.value_placeholder')}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="measurement-mode">{t('modal.mode_label')}</label>
                  <select
                    id="measurement-mode"
                    value={newMode}
                    onChange={(e) => setNewMode(e.target.value as any)}
                  >
                    <option value="manual">{t('modal.mode_manual')}</option>
                    <option value="import">{t('modal.mode_import')}</option>
                    <option value="auto">{t('modal.mode_auto')}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="measurement-status">{t('modal.status_label')}</label>
                  <select
                    id="measurement-status"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as any)}
                  >
                    <option value="approved" disabled={!canApproveMeasurement}>
                      {t('measurements.status_approved')}
                    </option>
                    <option value="proposed">{t('measurements.status_proposed')}</option>
                    <option value="draft">{t('measurements.status_draft')}</option>
                  </select>
                  {!canApproveMeasurement && selectedAssignmentId && (
                    <small className="form-hint">{t('curation.hint_blocked')}</small>
                  )}
                  {canApproveWithWarning && selectedAssignmentId && (
                    <small className="form-hint warning">{t('curation.hint_warning')}</small>
                  )}
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="measurement-reason">{t('modal.reason_label')}</label>
                  <input
                    id="measurement-reason"
                    type="text"
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                    placeholder={t('modal.reason_placeholder')}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="measurement-evidence">{t('modal.evidence_label')}</label>
                  <input
                    id="measurement-evidence"
                    type="text"
                    value={newEvidence}
                    onChange={(e) => setNewEvidence(e.target.value)}
                    placeholder={t('modal.evidence_placeholder')}
                  />
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowMeasurementModal(false)}>
                {t('modal.cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={() => createMeasurement.mutate(false)}
                disabled={!selectedAssignmentId || !newValue || createMeasurement.isLoading}
              >
                {createMeasurement.isLoading ? t('modal.saving') : t('modal.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
