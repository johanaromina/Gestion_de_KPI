/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { CollaboratorKPI } from '../types'
import { resolveDirection } from '../utils/kpi'
import CollaboratorKPIForm from '../components/CollaboratorKPIForm'
import CloseParrillaModal from '../components/CloseParrillaModal'
import GenerateBaseGridModal from '../components/GenerateBaseGridModal'
import ReviewModal from '../components/ReviewModal'
import ConsistencyAlerts from '../components/ConsistencyAlerts'
import BulkKPIAssignmentModal from '../components/BulkKPIAssignmentModal'
import { useDialog } from '../components/Dialog'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import './Asignaciones.css'

const toNumber = (value: any): number | null => {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const ASSIGNMENT_ACTION_API_ERROR_KEYS: Record<string, string> = {
  ASSIGNMENT_NOT_FOUND: 'assignments:error.api_errors.not_found',
  ASSIGNMENT_CLOSE_FORBIDDEN: 'assignments:error.api_errors.close_forbidden',
  ASSIGNMENT_ALREADY_CLOSED: 'assignments:error.api_errors.already_closed',
  ASSIGNMENT_REOPEN_FORBIDDEN: 'assignments:error.api_errors.reopen_forbidden',
  ASSIGNMENT_NOT_CLOSED: 'assignments:error.api_errors.not_closed',
}

export default function Asignaciones() {
  const { t } = useTranslation(['assignments', 'common'])

  const getRoleLabel = (role: string) => t(`common:roles.${role}`, { defaultValue: role })

  const [showForm, setShowForm] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<CollaboratorKPI | undefined>(undefined)
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState<number | null>(null)
  const [selectedKPIId, setSelectedKPIId] = useState<number | null>(null)
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null)
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null)
  const [selectedRole, setSelectedRole] = useState('')
  const [selectedSubPeriodId, setSelectedSubPeriodId] = useState<number | null>(null)
  const [showMonthly, setShowMonthly] = useState(true)
  const [compactView, setCompactView] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [closingCollaboratorId, setClosingCollaboratorId] = useState<number | null>(null)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkPrefill, setBulkPrefill] = useState<{
    kpiId: number; kpiName: string; periodId: number; periodName: string; target: number; weight: number
  } | undefined>(undefined)
  const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number } | null>(null)
  const [reviewingAssignment, setReviewingAssignment] = useState<{
    assignment: CollaboratorKPI
    action: 'approve' | 'reject'
  } | null>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const PAGE_SIZE = 50

  // Scope derivado: área tiene prioridad sobre empresa
  const selectedScopeId = selectedAreaId ?? selectedCompanyId

  const navigate = useNavigate()
  const dialog = useDialog()
  const queryClient = useQueryClient()

  // Periodos
  const { data: periods } = useQuery('periods', async () => {
    const response = await api.get('/periods')
    return response.data
  })

  // Subperiodos del periodo seleccionado
  const { data: subPeriods } = useQuery<any[]>(
    ['sub-periods', selectedPeriodId, selectedScopeId],
    async () => {
      if (!selectedPeriodId) return []
      const scope = selectedScopeId ? orgScopes?.find((s: any) => s.id === selectedScopeId) : null
      const res = await api.get(`/periods/${selectedPeriodId}/sub-periods`, {
        params: {
          calendarProfileId: scope?.calendarProfileId || undefined,
        },
      })
      return res.data
    },
    { enabled: !!selectedPeriodId }
  )

  // Colaboradores
  const { data: collaborators } = useQuery('collaborators', async () => {
    const response = await api.get('/collaborators')
    return response.data
  })

  const { data: orgScopes } = useQuery('org-scopes', async () => {
    const response = await api.get('/org-scopes')
    return response.data
  })

  const { data: calendarProfiles } = useQuery(
    'calendar-profiles',
    async () => {
      const response = await api.get('/calendar-profiles')
      return response.data
    },
    { staleTime: 5 * 60 * 1000 }
  )

  // KPIs
  const { data: kpis } = useQuery(
    ['kpis'],
    async () => {
      const response = await api.get('/kpis')
      return response.data
    }
  )

  const calendarById = useMemo(() => {
    const map = new Map<number, any>()
    calendarProfiles?.forEach((profile: any) => map.set(profile.id, profile))
    return map
  }, [calendarProfiles])

  const orgScopesById = useMemo(() => {
    const map = new Map<number, any>()
    orgScopes?.forEach((scope: any) => map.set(scope.id, scope))
    return map
  }, [orgScopes])

  const collaboratorsById = useMemo(() => {
    const map = new Map<number, any>()
    collaborators?.forEach((c: any) => map.set(c.id, c))
    return map
  }, [collaborators])

  const activeSubPeriodsLabel = useMemo(() => {
    if (!subPeriods || subPeriods.length === 0) return t('filters.subperiod') + ': —'
    const active = subPeriods.filter((sp: any) => sp.status !== 'closed')
    if (active.length === 0) return t('filters.subperiod') + ': —'
    return active
      .map((sp: any) => `${sp.name}${sp.weight ? ` (${sp.weight}%)` : ''}`)
      .join('\n')
  }, [subPeriods])

  const shouldLoadAssignments =
    !!selectedPeriodId ||
    !!selectedCollaboratorId ||
    !!selectedKPIId ||
    !!selectedScopeId ||
    !!selectedRole ||
    !!searchTerm.trim() ||
    selectedSubPeriodId !== null

  // Asignaciones
  const { data: assignments, isLoading } = useQuery<CollaboratorKPI[]>(
    ['collaborator-kpis', selectedPeriodId, selectedCollaboratorId],
    async () => {
      let url = '/collaborator-kpis'
      if (selectedPeriodId) {
        url = `/collaborator-kpis/period/${selectedPeriodId}`
      } else if (selectedCollaboratorId) {
        url = `/collaborator-kpis/collaborator/${selectedCollaboratorId}`
      }
      const response = await api.get(url)
      return response.data
    },
    { enabled: shouldLoadAssignments }
  )

  const deleteMutation = useMutation(
    async (id: number) => {
      await api.delete(`/collaborator-kpis/${id}`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('collaborator-kpis')
      },
    }
  )

  const closeAssignmentMutation = useMutation(
    async (id: number) => {
      await api.post(`/collaborator-kpis/${id}/close`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('collaborator-kpis')
      },
      onError: (error: any) => {
        void dialog.alert(
          resolveApiErrorMessage(error, t, {
            codeMap: ASSIGNMENT_ACTION_API_ERROR_KEYS,
            fallbackKey: 'error.close_assignment',
          }),
          { title: t('common:error_title'), variant: 'danger' }
        )
      },
    }
  )

  const reopenAssignmentMutation = useMutation(
    async (id: number) => {
      await api.post(`/collaborator-kpis/${id}/reopen`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('collaborator-kpis')
      },
      onError: (error: any) => {
        void dialog.alert(
          resolveApiErrorMessage(error, t, {
            codeMap: ASSIGNMENT_ACTION_API_ERROR_KEYS,
            fallbackKey: 'error.reopen_assignment',
          }),
          { title: t('common:error_title'), variant: 'danger' }
        )
      },
    }
  )

  const handleCreate = async () => {
    if (!selectedPeriodId) {
      await dialog.alert(t('dialogs.period_required_msg'), { title: t('dialogs.period_required_title'), variant: 'warning' })
      return
    }
    const selectedPeriod = periods?.find((p: any) => p.id === selectedPeriodId)
    if (selectedPeriod?.status === 'closed') {
      await dialog.alert(t('dialogs.period_closed_create_msg'), { title: t('dialogs.period_closed_title'), variant: 'warning' })
      return
    }
    setEditingAssignment(undefined)
    setShowForm(true)
  }

  const handleEdit = async (assignment: CollaboratorKPI) => {
    const period = periods?.find((p: any) => p.id === assignment.periodId)
    if (period?.status === 'closed') {
      await dialog.alert(t('dialogs.period_closed_edit_msg'), { title: t('dialogs.period_closed_title'), variant: 'warning' })
    }
    setEditingAssignment(assignment)
    setShowForm(true)
  }

  const handleDelete = async (id: number) => {
    const ok = await dialog.confirm(t('dialogs.confirm_delete_msg'), {
      title: t('dialogs.confirm_delete_title'), confirmLabel: t('dialogs.confirm_delete_label'), variant: 'danger'
    })
    if (ok) deleteMutation.mutate(id)
  }

  const handleCloseAssignment = async (assignment: CollaboratorKPI) => {
    if (isAssignmentClosed(assignment)) return
    const ok = await dialog.confirm(t('dialogs.confirm_close_msg'), {
      title: t('dialogs.confirm_close_title'), confirmLabel: t('dialogs.confirm_close_label'), variant: 'warning'
    })
    if (ok) closeAssignmentMutation.mutate(assignment.id)
  }

  const handleReopenAssignment = async (assignment: CollaboratorKPI) => {
    if (!isAssignmentClosed(assignment)) return
    const ok = await dialog.confirm(t('dialogs.confirm_reopen_msg'), {
      title: t('dialogs.confirm_reopen_title'), confirmLabel: t('dialogs.confirm_reopen_label'), variant: 'info'
    })
    if (ok) reopenAssignmentMutation.mutate(assignment.id)
  }

  const handleCloseParrilla = async () => {
    if (!selectedPeriodId) {
      await dialog.alert(t('dialogs.period_required_msg'), { title: t('dialogs.period_required_title'), variant: 'warning' })
      return
    }
    setClosingCollaboratorId(selectedCollaboratorId)
    setShowCloseModal(true)
  }

  const isAssignmentClosed = (assignment: CollaboratorKPI) =>
    assignment.status === 'closed' || (assignment as any).periodStatus === 'closed'

  const canEditAssignment = (assignment: CollaboratorKPI) => !isAssignmentClosed(assignment)

  const canCloseAssignment = (assignment: CollaboratorKPI) =>
    !isAssignmentClosed(assignment) &&
    assignment.status !== 'proposed'

  const canReopenAssignment = (assignment: CollaboratorKPI) =>
    isAssignmentClosed(assignment) &&
    assignment.status === 'closed'

  const getStatusBadge = (status: CollaboratorKPI['status']) => {
    const statusConfig = {
      draft: { label: t('status.draft'), class: 'status-draft' },
      proposed: { label: t('status.proposed'), class: 'status-proposed' },
      approved: { label: t('status.approved'), class: 'status-approved' },
      closed: { label: t('status.closed'), class: 'status-closed' },
    } as const
    const config = status ? statusConfig[status] : undefined
    if (!config) return <span className="status-badge status-unknown">{status || t('status.unknown')}</span>
    return <span className={`status-badge ${config.class}`}>{config.label}</span>
  }

  const getCurationBadge = (assignment: CollaboratorKPI) => {
    if (isAssignmentClosed(assignment)) {
      return <span className="curation-badge locked">{t('curation.locked')}</span>
    }
    const status = assignment.curationStatus || 'pending'
    const config = {
      pending: { label: t('curation.pending'), class: 'curation-pending' },
      in_review: { label: t('curation.in_review'), class: 'curation-review' },
      approved: { label: t('curation.approved'), class: 'curation-approved' },
      rejected: { label: t('curation.rejected'), class: 'curation-rejected' },
      changes_requested: { label: t('curation.changes_requested'), class: 'curation-changes-requested' },
    } as const
    const entry = config[status as keyof typeof config]
    return <span className={`curation-badge ${entry?.class ?? ''}`}>{entry?.label ?? status}</span>
  }

  const getInputBadge = (mode?: CollaboratorKPI['inputMode']) => {
    const normalized = mode || 'manual'
    const config = {
      manual: { label: t('input.manual'), class: 'input-manual' },
      import: { label: t('input.import'), class: 'input-import' },
      auto: { label: t('input.auto'), class: 'input-auto' },
    } as const
    const entry = config[normalized]
    return <span className={`input-badge ${entry.class}`}>{entry.label}</span>
  }

  const formatMeasurement = (assignment: CollaboratorKPI) => {
    if (!assignment.lastMeasurementAt) return '-'
    const label = assignment.lastMeasurementBy
      ? `${assignment.lastMeasurementAt} · ${assignment.lastMeasurementBy}`
      : assignment.lastMeasurementAt
    return label
  }

  const buildScopeLabel = (scope: any): string => {
    const parts: string[] = []
    let current = scope
    let safety = 0
    while (current && safety < 6) {
      parts.unshift(current.name)
      current = current.parentId ? orgScopesById.get(current.parentId) : null
      safety += 1
    }
    return parts.join(' > ')
  }

  const companyScopes = useMemo(() =>
    (orgScopes || [])
      .filter((s: any) => s.type === 'company' && s.active !== 0 && s.active !== false)
      .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)))
  , [orgScopes])

  const areaScopes = useMemo(() =>
    (orgScopes || [])
      .filter((s: any) => {
        if (s.type !== 'area' || s.active === 0 || s.active === false) return false
        if (selectedCompanyId) return Number(s.parentId) === selectedCompanyId
        return true
      })
      .map((s: any) => ({ ...s, label: buildScopeLabel(s) }))
      .sort((a: any, b: any) => String(a.label).localeCompare(String(b.label)))
  , [orgScopes, selectedCompanyId])

  const selectedScopeDescendantIds = useMemo(() => {
    if (!selectedScopeId) return new Set<number>()
    const result = new Set<number>([selectedScopeId])
    const queue = [selectedScopeId]
    while (queue.length > 0) {
      const parentId = queue.shift()!
      ;(orgScopes || [])
        .filter((scope: any) => Number(scope.parentId) === Number(parentId))
        .forEach((scope: any) => {
          if (!result.has(scope.id)) {
            result.add(scope.id)
            queue.push(scope.id)
          }
        })
    }
    return result
  }, [selectedScopeId, orgScopes])

  const selectedScopeDescendantNames = useMemo(() => {
    if (!selectedScopeId) return new Set<string>()
    return new Set(
      Array.from(selectedScopeDescendantIds)
        .map((id) => orgScopesById.get(id)?.name)
        .filter(Boolean)
        .map((name) => String(name).trim().toLowerCase())
    )
  }, [selectedScopeId, selectedScopeDescendantIds, orgScopesById])

  const availableRoles = useMemo<string[]>(() =>
    Array.from(
      new Set<string>(
        (collaborators || [])
          .map((c: any) => String(c.role || ''))
          .filter(Boolean)
      )
    ).sort((a, b) => getRoleLabel(a).localeCompare(getRoleLabel(b)))
  , [collaborators, t])

  const collaboratorMatchesScope = (collaborator: any) => {
    if (!selectedScopeId) return true
    const collaboratorScopeId = toNumber(collaborator.orgScopeId)
    if (collaboratorScopeId !== null) return selectedScopeDescendantIds.has(collaboratorScopeId)
    return selectedScopeDescendantNames.has(String(collaborator.area || '').trim().toLowerCase())
  }

  const collaboratorsInFilters = useMemo(
    () =>
      (collaborators || []).filter((collaborator: any) => {
        if (!collaboratorMatchesScope(collaborator)) return false
        if (selectedRole && collaborator.role !== selectedRole) return false
        return true
      }),
    [collaborators, selectedRole, selectedScopeId, selectedScopeDescendantIds, selectedScopeDescendantNames]
  )

  useEffect(() => {
    if (!selectedCollaboratorId) return
    const collaboratorStillVisible = collaboratorsInFilters.some((c: any) => c.id === selectedCollaboratorId)
    if (!collaboratorStillVisible) {
      setSelectedCollaboratorId(null)
    }
  }, [selectedCollaboratorId, collaboratorsInFilters])

  // Filtro local
  const filteredAssignments = assignments?.filter((assignment) => {
    const collaboratorId = toNumber(assignment.collaboratorId)
    const periodId = toNumber(assignment.periodId)
    const kpiId = toNumber(assignment.kpiId)
    const subPeriodId = toNumber((assignment as any).subPeriodId)
    const collaborator = collaboratorId !== null ? collaboratorsById.get(collaboratorId) : null
    const matchesCollaborator =
      !selectedCollaboratorId || collaboratorId === selectedCollaboratorId
    const matchesPeriod = !selectedPeriodId || periodId === selectedPeriodId
    const matchesKPI = !selectedKPIId || kpiId === selectedKPIId
    const matchesSubPeriod =
      selectedSubPeriodId === null
        ? true
        : subPeriodId === selectedSubPeriodId
    const matchesShowMonthly = showMonthly || (assignment as any).subPeriodId === null
    const matchesScope = !selectedScopeId || (!!collaborator && collaboratorMatchesScope(collaborator))
    const matchesRole = (() => {
      if (!selectedRole) return true
      return collaborator?.role === selectedRole
    })()
    const matchesSearch =
      !searchTerm ||
      (collaborator?.name || '')
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      (kpis?.find((k: any) => Number(k.id) === kpiId)?.name || '')
        .toLowerCase()
        .includes(searchTerm.toLowerCase())

    return (
      matchesCollaborator &&
      matchesPeriod &&
      matchesKPI &&
      matchesScope &&
      matchesRole &&
      matchesSearch &&
      matchesSubPeriod &&
      matchesShowMonthly
    )
  })

  useEffect(() => {
    setCurrentPage(0)
  }, [selectedPeriodId, selectedCollaboratorId, selectedKPIId, selectedCompanyId, selectedAreaId, selectedRole, selectedSubPeriodId, searchTerm, showMonthly])

  const hasActiveFilters =
    !!selectedPeriodId ||
    !!selectedCollaboratorId ||
    !!selectedKPIId ||
    !!selectedCompanyId ||
    !!selectedAreaId ||
    !!selectedRole ||
    !!searchTerm.trim() ||
    selectedSubPeriodId !== null ||
    !showMonthly

  const totalFiltered = filteredAssignments?.length ?? 0
  const totalPages = Math.ceil(totalFiltered / PAGE_SIZE)
  const paginatedAssignments = filteredAssignments?.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  const getTotalWeightByCollaborator = (collaboratorId: number, periodId: number): number => {
    if (!assignments) return 0
    // Usa solo filas resumen (subPeriodId null) para no duplicar pesos por subperiodo
    return assignments
      .filter(
        (a) => a.collaboratorId === collaboratorId && a.periodId === periodId && (a as any).subPeriodId == null
      )
      .reduce((sum, a) => sum + (toNumber(a.weight) || 0), 0)
  }

  const today = new Date()

  const monthlyAssignments = assignments?.filter(
    (a) => (a as any).subPeriodId && a.periodId === selectedPeriodId && a.collaboratorId === selectedCollaboratorId
  )

  const dueMonthlyAssignments =
    monthlyAssignments?.filter((a) => {
      const sp = subPeriods?.find((s) => s.id === (a as any).subPeriodId)
      if (!sp?.endDate) return false
      return new Date(sp.endDate) <= today
    }) || []

  const pendingMonthly = dueMonthlyAssignments.filter((a) => a.actual === null || a.actual === undefined)

  const growthReductionTotals = dueMonthlyAssignments.reduce<Record<
    number,
    { name: string; direction: string; total: number }
  >>((acc, a) => {
    const direction = resolveDirection(
      (a as any).assignmentDirection,
      (a as any).kpiDirection,
      (a as any).kpiType
    )
    if (direction !== 'growth' && direction !== 'reduction') return acc
    const key = a.kpiId
    const current = acc[key] || {
      name: (a as any).kpiName || `KPI #${a.kpiId}`,
      direction,
      total: 0,
    }
    const actualVal = toNumber(a.actual) || 0
    current.total += actualVal
    acc[key] = current
    return acc
  }, {})

  return (
    <div className="asignaciones-page">
      <div className="page-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="subtitle">{t('subtitle')}</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => setShowGenerateModal(true)}>
            {t('header.generate_grids')}
          </button>
          <button className="btn-secondary" onClick={handleCloseParrilla}>
            {t('header.close_grid')}
          </button>
          <button
            className="btn-secondary"
            onClick={() => { setBulkPrefill(undefined); setShowBulkModal(true) }}
          >
            {t('header.bulk')}
          </button>
          <button className="btn-primary" onClick={handleCreate}>
            {t('header.new')}
          </button>
        </div>
      </div>

      <div className="filters-section">
        <div className="search-group">
          <label htmlFor="search">{t('filters.search_label')}</label>
          <input
            type="text"
            id="search"
            placeholder={t('filters.search_placeholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="period-filter">{t('filters.period')}</label>
          <select
            id="period-filter"
            value={selectedPeriodId || ''}
            onChange={(e) => setSelectedPeriodId(e.target.value ? parseInt(e.target.value) : null)}
            className="filter-select"
          >
            <option value="">{t('filters.all_option')}</option>
            {periods?.map((period: any) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="collaborator-filter">{t('filters.collaborator')}</label>
          <select
            id="collaborator-filter"
            value={selectedCollaboratorId || ''}
            onChange={(e) => setSelectedCollaboratorId(e.target.value ? parseInt(e.target.value) : null)}
            className="filter-select"
          >
            <option value="">{t('filters.all_option')}</option>
            {collaboratorsInFilters.map((collaborator: any) => (
              <option key={collaborator.id} value={collaborator.id}>
                {collaborator.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="kpi-filter">{t('filters.kpi')}</label>
          <select
            id="kpi-filter"
            value={selectedKPIId || ''}
            onChange={(e) => setSelectedKPIId(e.target.value ? parseInt(e.target.value) : null)}
            className="filter-select"
          >
            <option value="">{t('filters.all_option')}</option>
            {kpis?.map((kpi: any) => (
              <option key={kpi.id} value={kpi.id}>
                {kpi.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="company-filter">Empresa</label>
          <select
            id="company-filter"
            value={selectedCompanyId || ''}
            onChange={(e) => {
              setSelectedCompanyId(e.target.value ? parseInt(e.target.value, 10) : null)
              setSelectedAreaId(null)
              setSelectedCollaboratorId(null)
            }}
            className="filter-select"
          >
            <option value="">{t('filters.all_option')}</option>
            {companyScopes.map((scope: any) => (
              <option key={scope.id} value={scope.id}>
                {scope.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="area-filter">Área</label>
          <select
            id="area-filter"
            value={selectedAreaId || ''}
            onChange={(e) => {
              setSelectedAreaId(e.target.value ? parseInt(e.target.value, 10) : null)
              setSelectedCollaboratorId(null)
            }}
            className="filter-select"
            disabled={areaScopes.length === 0}
          >
            <option value="">{t('filters.all_option')}</option>
            {areaScopes.map((scope: any) => (
              <option key={scope.id} value={scope.id}>
                {scope.label}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="role-filter">{t('filters.role')}</label>
          <select
            id="role-filter"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="filter-select"
          >
            <option value="">{t('filters.all_option')}</option>
            {availableRoles.map((role) => (
              <option key={role} value={role}>
                {getRoleLabel(role)}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="subperiod-filter">
            {t('filters.subperiod')}
            <span className="info-icon" title={activeSubPeriodsLabel}>ℹ</span>
          </label>
          <select
            id="subperiod-filter"
            value={selectedSubPeriodId ?? ''}
            onChange={(e) => setSelectedSubPeriodId(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="filter-select"
            disabled={!selectedPeriodId}
          >
            <option value="">{t('filters.all_option')}</option>
            {subPeriods?.map((sp: any) => (
              <option key={sp.id as number} value={sp.id as number}>
                {sp.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group toggle-group">
          <label>{t('filters.show_monthly')}</label>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={showMonthly}
              onChange={(e) => setShowMonthly(e.target.checked)}
            />
            <span className="toggle-track" />
            {showMonthly ? t('common:yes', { defaultValue: 'Sí' }) : t('common:no', { defaultValue: 'No' })}
          </label>
        </div>
        <div className="filter-group toggle-group">
          <label>{t('filters.compact_view')}</label>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={compactView}
              onChange={(e) => setCompactView(e.target.checked)}
            />
            <span className="toggle-track" />
            {compactView ? t('common:yes', { defaultValue: 'Sí' }) : t('common:no', { defaultValue: 'No' })}
          </label>
        </div>

        {hasActiveFilters && (
          <button
            className="btn-clear-filters"
            onClick={() => {
              setSelectedPeriodId(null)
              setSelectedCollaboratorId(null)
              setSelectedKPIId(null)
              setSelectedCompanyId(null)
              setSelectedAreaId(null)
              setSelectedRole('')
              setSearchTerm('')
              setSelectedSubPeriodId(null)
              setShowMonthly(true)
            }}
          >
            {t('filters.clear')}
          </button>
        )}
      </div>

      {selectedPeriodId && selectedCollaboratorId && (
        <ConsistencyAlerts collaboratorId={selectedCollaboratorId} periodId={selectedPeriodId} />
      )}

      {selectedPeriodId && selectedCollaboratorId && dueMonthlyAssignments.length > 0 && (
        <div className="info-banner">
          {pendingMonthly.length === 0 ? (
            <div className="banner-ok">
              {t('banner.all_subperiods_ok')}
            </div>
          ) : (
            <div className="banner-warn">
              {t('banner.missing_subperiods', { count: pendingMonthly.length })}
              <div className="pending-list">
                {pendingMonthly.slice(0, 4).map((p) => (
                  <div key={p.id}>
                    {(p as any).subPeriodName || t('table.subperiod')} · {(p as any).kpiName || `KPI #${p.kpiId}`}
                  </div>
                ))}
                {pendingMonthly.length > 4 && <div>+ {pendingMonthly.length - 4} más</div>}
              </div>
            </div>
          )}
          {Object.values(growthReductionTotals).length > 0 && (
            <div className="banner-totals">
              {t('banner.totals_header')}
              {Object.entries(growthReductionTotals).map(([kpiId, info]) => (
                <div key={kpiId}>
                  {info.name}: <strong>{info.total.toFixed(2)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={`table-container ${compactView ? 'compact' : ''}`}>
        {isLoading ? (
          <div className="loading">{t('loading')}</div>
        ) : filteredAssignments && filteredAssignments.length > 0 ? (
          <>
            <div className="results-info">
              {totalPages > 1
                ? t('results.showing_range', { from: currentPage * PAGE_SIZE + 1, to: Math.min((currentPage + 1) * PAGE_SIZE, totalFiltered), total: totalFiltered })
                : t('results.showing_total', { shown: totalFiltered, total: assignments?.length || 0 })}
            </div>
            <table className={`data-table ${compactView ? 'compact' : ''}`}>
              <thead>
                <tr>
                  <th className="col-id">{t('table.id')}</th>
                  <th>{t('table.collaborator')}</th>
                  <th>{t('table.kpi')}</th>
                  <th>{t('table.period')}</th>
                  <th className="col-subperiod">{t('table.subperiod')}</th>
                  <th>{t('table.target')}</th>
                  <th>{t('table.actual')}</th>
                  <th className="col-peso">{t('table.weight')}</th>
                  <th>{t('table.variation')}</th>
                  <th>{t('table.status')}</th>
                  <th>{t('table.curation')}</th>
                  <th>{t('table.input')}</th>
                  <th className="col-last">{t('table.last_measurement')}</th>
                  <th className="col-comments">{t('table.comments')}</th>
                  <th className="actions-column">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {(paginatedAssignments ?? []).map((assignment) => {
                  const totalWeight = getTotalWeightByCollaborator(assignment.collaboratorId, assignment.periodId)
                  const collaborator = collaboratorsById.get(assignment.collaboratorId)
                  const scopeFromCollaborator = collaborator?.orgScopeId
                    ? orgScopesById.get(collaborator.orgScopeId)
                    : null
                  const fallbackCalendarId = scopeFromCollaborator?.calendarProfileId || null
                  const calendarProfileId = assignment.calendarProfileId || fallbackCalendarId
                  const calendarProfile = calendarProfileId ? calendarById.get(calendarProfileId) : null
                  return (
                    <tr key={assignment.id}>
                      <td className="col-id">{assignment.id}</td>
                      <td className="name-cell">
                        {collaborators?.find((c: any) => c.id === assignment.collaboratorId)?.name ||
                          `Colaborador #${assignment.collaboratorId}`}
                      </td>
                      <td>{(assignment as any).kpiName || `KPI #${assignment.kpiId}`}</td>
                      <td>
                        {(assignment as any).periodName || `Período #${assignment.periodId}`}
                        {calendarProfile && (
                          <div className="calendar-pill" title={`Calendario: ${calendarProfile.name}`}>
                            {calendarProfile.name}
                          </div>
                        )}
                      </td>
                      <td className="col-subperiod">
                        {(assignment as any).subPeriodName
                          ? (assignment as any).subPeriodName
                          : (assignment as any).subPeriodId
                          ? `${t('table.subperiod')} #${(assignment as any).subPeriodId}`
                          : t('table.summary')}
                      </td>
                      <td className="number-cell">
                        {toNumber(assignment.target) !== null ? toNumber(assignment.target) : assignment.target}
                      </td>
                      <td className="number-cell">
                        {toNumber(assignment.actual) !== null && assignment.actual !== undefined
                          ? toNumber(assignment.actual)
                          : '-'}
                      </td>
                      <td className="number-cell col-peso">
                        {toNumber(assignment.weight) ?? assignment.weight}%
                        {totalWeight !== 100 && (
                          <span
                            className={`weight-warning ${totalWeight > 100 ? 'error' : 'warning'}`}
                            title={`Suma total: ${totalWeight}%`}
                          >
                            {totalWeight > 100 ? '!' : '!'}
                          </span>
                        )}
                      </td>
                      <td className="number-cell">
                        {(() => {
                          const variationValue = toNumber(assignment.variation)
                          return variationValue !== null ? `${variationValue.toFixed(1)}%` : '-'
                        })()}
                      </td>
                      <td>{getStatusBadge(assignment.status)}</td>
                      <td
                        title={
                          assignment.dataSourceName || assignment.dataSource
                            ? `${assignment.dataSourceName || assignment.dataSource} · ${assignment.sourceConfig || ''}`.trim()
                            : 'Sin fuente configurada'
                        }
                      >
                        {getCurationBadge(assignment)}
                      </td>
                      <td>{getInputBadge(assignment.inputMode)}</td>
                      <td className="measurement-cell col-last">{formatMeasurement(assignment)}</td>
                      <td className="comments-cell col-comments">
                        {assignment.comments ? (
                          <span className="comments-text" title={assignment.comments}>
                            {assignment.comments.length > 50
                              ? `${assignment.comments.substring(0, 50)}...`
                              : assignment.comments}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="actions-column">
                        <div className="action-buttons">
                          {assignment.status === 'proposed' && (
                            <>
                              <button
                                className="btn-approve-small"
                                onClick={() =>
                                  setReviewingAssignment({
                                    assignment,
                                    action: 'approve',
                                  })
                                }
                                title={t('row_actions.approve')}
                              >
                                {t('row_actions.approve')}
                              </button>
                              <button
                                className="btn-reject-small"
                                onClick={() =>
                                  setReviewingAssignment({
                                    assignment,
                                    action: 'reject',
                                  })
                                }
                                title={t('row_actions.reject')}
                              >
                                {t('row_actions.reject')}
                              </button>
                            </>
                          )}
                          <button
                            className="btn-icon"
                            title={t('row_actions.replicate')}
                            onClick={() => {
                              const kpi = kpis?.find((k: any) => k.id === assignment.kpiId)
                              const period = periods?.find((p: any) => p.id === assignment.periodId)
                              setBulkPrefill({
                                kpiId: assignment.kpiId,
                                kpiName: kpi?.name ?? `KPI #${assignment.kpiId}`,
                                periodId: assignment.periodId,
                                periodName: period?.name ?? `Período #${assignment.periodId}`,
                                target: Number(assignment.target) || 0,
                                weight: Number(assignment.weight) || 0,
                              })
                              setShowBulkModal(true)
                            }}
                          >
                            {t('row_actions.replicate')}
                          </button>
                          {canEditAssignment(assignment) && assignment.status !== 'proposed' && (
                            <>
                              <button className="btn-icon" onClick={() => handleEdit(assignment)} title={t('row_actions.edit')}>
                                {t('row_actions.edit')}
                              </button>
                              <button className="btn-icon" onClick={() => handleDelete(assignment.id)} title={t('row_actions.delete')}>
                                {t('row_actions.delete')}
                              </button>
                              {canCloseAssignment(assignment) && (
                                <button
                                  className="btn-icon"
                                  onClick={() => handleCloseAssignment(assignment)}
                                  title={t('row_actions.close_kpi')}
                                >
                                  {t('row_actions.close_kpi')}
                                </button>
                              )}
                            </>
                          )}
                          {!canEditAssignment(assignment) && assignment.status !== 'proposed' && (
                            <span className="locked-badge" title={t('row_actions.locked')}>
                              {t('row_actions.locked')}
                            </span>
                          )}
                          {canReopenAssignment(assignment) && (
                            <button
                              className="btn-icon"
                              onClick={() => handleReopenAssignment(assignment)}
                              title={t('row_actions.reopen_kpi')}
                            >
                              {t('row_actions.reopen_kpi')}
                            </button>
                          )}
                          <button
                            className="btn-icon"
                            onClick={() => navigate(`/curaduria?assignmentId=${assignment.id}`)}
                            title={t('row_actions.curation')}
                          >
                            {t('row_actions.curation')}
                          </button>
                          <button
                            className="btn-icon"
                            onClick={() => navigate(`/input-datos?assignmentId=${assignment.id}`)}
                            title={t('row_actions.measurements')}
                          >
                            {t('row_actions.measurements')}
                          </button>
                          <button
                            className="btn-icon"
                            onClick={() => void dialog.alert(t('dialogs.recalculate_msg'), { title: t('dialogs.recalculate_title'), variant: 'info' })}
                            title={t('row_actions.recalculate')}
                          >
                            {t('row_actions.recalculate')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="pagination-controls">
                <button
                  className="btn-secondary"
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                >
                  {t('pagination.prev')}
                </button>
                <span className="pagination-info">
                  {t('pagination.page_of', { page: currentPage + 1, total: totalPages })}
                </span>
                <button
                  className="btn-secondary"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage >= totalPages - 1}
                >
                  {t('pagination.next')}
                </button>
              </div>
            )}

            {selectedPeriodId && (
              <div className="weight-summary">
                <h3>{t('weight_summary.title')}</h3>
                <div className="summary-table">
                  {collaborators
                    ?.filter((c: any) =>
                      assignments?.some((a) => a.collaboratorId === c.id && a.periodId === selectedPeriodId)
                    )
                    .map((collaborator: any) => {
                      const totalWeight = getTotalWeightByCollaborator(collaborator.id, selectedPeriodId)
                      return (
                        <div
                          key={collaborator.id}
                          className={`summary-row ${
                            totalWeight === 100 ? 'valid' : totalWeight > 100 ? 'error' : 'warning'
                          }`}
                        >
                          <span className="summary-name">{collaborator.name}</span>
                          <span className="summary-weight">{totalWeight.toFixed(1)}%</span>
                          {totalWeight === 100 && <span className="summary-status">{t('weight_summary.valid')}</span>}
                          {totalWeight > 100 && (
                            <span className="summary-status">{t('weight_summary.exceeds', { amount: (totalWeight - 100).toFixed(1) })}</span>
                          )}
                          {totalWeight < 100 && (
                            <span className="summary-status">{t('weight_summary.missing', { amount: (100 - totalWeight).toFixed(1) })}</span>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </>
        ) : !shouldLoadAssignments ? (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <h3>{t('empty.no_filters_title')}</h3>
            <p>{t('empty.no_filters_subtitle')}</p>
          </div>
        ) : (assignments?.length ?? 0) > 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🧭</div>
            <h3>{t('empty.no_results_title')}</h3>
            <p>{t('empty.no_results_subtitle')}</p>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>{t('empty.no_assignments_title')}</h3>
            <p>{t('empty.no_assignments_subtitle')}</p>
            <p className="empty-state-hint">
              {t('empty.no_assignments_hint')}
            </p>
            <button className="btn-primary" onClick={handleCreate}>
              {t('empty.create_btn')}
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <CollaboratorKPIForm
          assignment={editingAssignment}
          periodId={selectedPeriodId || 0}
          collaboratorId={selectedCollaboratorId || undefined}
          onClose={() => {
            setShowForm(false)
            setEditingAssignment(undefined)
          }}
        />
      )}

      {showCloseModal && selectedPeriodId && (
        <CloseParrillaModal
          periodId={selectedPeriodId}
          collaboratorId={closingCollaboratorId || undefined}
          collaboratorName={
            closingCollaboratorId ? collaborators?.find((c: any) => c.id === closingCollaboratorId)?.name : undefined
          }
          periodName={periods?.find((p: any) => p.id === selectedPeriodId)?.name}
          onClose={() => {
            setShowCloseModal(false)
            setClosingCollaboratorId(null)
          }}
        />
      )}

      {showGenerateModal && (
        <GenerateBaseGridModal
          onClose={() => setShowGenerateModal(false)}
          onSuccess={() => {
            setShowGenerateModal(false)
          }}
        />
      )}

      {reviewingAssignment && (
        <ReviewModal
          assignment={reviewingAssignment.assignment as any}
          action={reviewingAssignment.action}
          onClose={() => setReviewingAssignment(null)}
          onSuccess={() => {
            setReviewingAssignment(null)
          }}
        />
      )}

      {bulkResult && (
        <div
          className="bulk-result-toast"
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
            background: '#d1fae5', border: '1px solid #6ee7b7', color: '#065f46',
            padding: '12px 20px', borderRadius: 8, fontWeight: 500, fontSize: 14,
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          }}
        >
          {bulkResult.created !== 1
            ? t('bulk_result.created_many', { count: bulkResult.created })
            : t('bulk_result.created_one', { count: bulkResult.created })}
          {bulkResult.skipped > 0 && ` ${t('bulk_result.skipped', { count: bulkResult.skipped })}`}
          <button
            onClick={() => setBulkResult(null)}
            style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#065f46' }}
          >×</button>
        </div>
      )}

      {showBulkModal && (
        <BulkKPIAssignmentModal
          prefill={bulkPrefill}
          onClose={() => { setShowBulkModal(false); setBulkPrefill(undefined) }}
          onSuccess={(created, skipped) => {
            setShowBulkModal(false)
            setBulkPrefill(undefined)
            setBulkResult({ created, skipped })
            setTimeout(() => setBulkResult(null), 6000)
          }}
        />
      )}
    </div>
  )
}
