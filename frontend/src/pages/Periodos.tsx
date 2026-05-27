/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { Period, SubPeriod } from '../types'
import PeriodForm from '../components/PeriodForm'
import SubPeriodForm from '../components/SubPeriodForm'
import { useAuth } from '../hooks/useAuth'
import { useDialog } from '../components/Dialog'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import './Periodos.css'

const toCalendarDate = (value?: string | Date | null): Date | null => {
  if (!value) return null
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    }
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    return new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate())
  }
  if (Number.isNaN(value.getTime())) return null
  return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
}

const formatCalendarDate = (value?: string | Date | null) => {
  const parsed = toCalendarDate(value)
  return parsed ? format(parsed, 'dd MMM yyyy') : '—'
}

const SUBPERIOD_API_ERROR_KEYS: Record<string, string> = {
  SUBPERIOD_NOT_FOUND: 'periods:dialogs.api_errors.subperiod_not_found',
  SUBPERIOD_ALREADY_CLOSED: 'periods:dialogs.api_errors.subperiod_already_closed',
}

const PERIOD_REOPEN_API_ERROR_KEYS: Record<string, string> = {
  PERIOD_REOPEN_FORBIDDEN: 'periods:dialogs.api_errors.reopen_forbidden',
  PERIOD_NOT_FOUND: 'periods:dialogs.api_errors.period_not_found',
  PERIOD_NOT_CLOSED: 'periods:dialogs.api_errors.period_not_closed',
}

const PERIOD_COPY_API_ERROR_KEYS: Record<string, string> = {
  PERIOD_COPY_FIELDS_REQUIRED: 'periods:dialogs.api_errors.copy_fields_required',
}

function SubPeriodsSection({
  period,
  expanded,
  onCreate,
  onEdit,
  onDelete,
  onClose,
  canConfig,
  closeNotice,
  calendarProfiles,
  selectedCalendarProfileId,
  onCalendarChange,
}: {
  period: Period
  expanded: boolean
  onCreate: () => void
  onEdit: (sub: SubPeriod) => void
  onDelete: (sub: SubPeriod) => void
  onClose: (sub: SubPeriod) => void
  canConfig: boolean
  closeNotice: { periodId: number; text: string; tone: 'success' | 'warning' } | null
  calendarProfiles: Array<{ id: number; name: string; frequency: string; active?: boolean }>
  selectedCalendarProfileId: number | null
  onCalendarChange: (calendarProfileId: number | null) => void
}) {
  const { t } = useTranslation('periods')
  const { data, isLoading } = useQuery<SubPeriod[]>(
    ['sub-periods', period.id, selectedCalendarProfileId],
    async () => {
      const response = await api.get(`/periods/${period.id}/sub-periods`, {
        params: {
          calendarProfileId: selectedCalendarProfileId || undefined,
        },
      })
      return response.data
    },
    {
      enabled: expanded,
    }
  )

  if (!expanded) return null

  const allClosed = !!data?.length && data.every((sub) => sub.status === 'closed')

  const getStatusBadge = (status?: SubPeriod['status']) => {
    if (status === 'closed') {
      return <span className="status-badge status-closed">{t('subperiods.status_closed')}</span>
    }
    return <span className="status-badge status-open">{t('subperiods.status_open')}</span>
  }

  return (
    <div className="subperiods-section">
      <div className="subperiods-header">
        <h4>{t('subperiods.title')}</h4>
        <div className="subperiods-actions">
          <select
            value={selectedCalendarProfileId || ''}
            onChange={(e) =>
              onCalendarChange(e.target.value ? Number(e.target.value) : null)
            }
            className="filter-select"
          >
            <option value="">{t('subperiods.calendar_default')}</option>
            {calendarProfiles?.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
          {canConfig && (
            <button className="btn-small" onClick={onCreate}>
              {t('subperiods.add')}
            </button>
          )}
        </div>
      </div>
      {allClosed && period.status !== 'closed' && (
        <div className="subperiods-notice success">
          {t('subperiods.all_closed_notice')}
        </div>
      )}
      {closeNotice && closeNotice.periodId === period.id && (
        <div className={`subperiods-notice ${closeNotice.tone}`}>
          {closeNotice.text}
        </div>
      )}

      {isLoading ? (
        <div className="loading-row">{t('subperiods.loading')}</div>
      ) : data && data.length > 0 ? (
        <table className="subperiods-table">
          <thead>
            <tr>
              <th>{t('subperiods.table_name')}</th>
              <th>{t('subperiods.table_start')}</th>
              <th>{t('subperiods.table_end')}</th>
              <th>{t('subperiods.table_weight')}</th>
              <th>{t('subperiods.table_status')}</th>
              <th>{t('subperiods.table_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((subPeriod) => (
              <tr key={subPeriod.id}>
                <td>{subPeriod.name}</td>
                <td>{formatCalendarDate(subPeriod.startDate)}</td>
                <td>{formatCalendarDate(subPeriod.endDate)}</td>
                <td>{subPeriod.weight ? `${subPeriod.weight}%` : '-'}</td>
                <td>{getStatusBadge(subPeriod.status)}</td>
                <td className="row-actions">
                  {canConfig && (
                    <>
                      <button
                        className="btn-text"
                        onClick={() => onEdit(subPeriod)}
                        disabled={subPeriod.status === 'closed'}
                      >
                        {t('subperiods.edit')}
                      </button>
                      <button
                        className="btn-text danger"
                        onClick={() => onDelete(subPeriod)}
                        disabled={subPeriod.status === 'closed'}
                      >
                        {t('subperiods.delete')}
                      </button>
                      {subPeriod.status !== 'closed' && (
                        <button
                          className="btn-text"
                          onClick={() => onClose(subPeriod)}
                        >
                          {t('subperiods.close')}
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-subperiods">
          <p>{t('subperiods.empty')}</p>
          {canConfig && (
            <button className="btn-small" onClick={onCreate}>
              {t('subperiods.create_first')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function Periodos() {
  const { canConfig } = useAuth()
  const navigate = useNavigate()
  const [showPeriodForm, setShowPeriodForm] = useState(false)
  const [showSubPeriodForm, setShowSubPeriodForm] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null)
  const [editingPeriod, setEditingPeriod] = useState<Period | undefined>(undefined)
  const [editingSubPeriod, setEditingSubPeriod] = useState<SubPeriod | undefined>(undefined)
  const [expandedPeriods, setExpandedPeriods] = useState<Set<number>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [closeNotice, setCloseNotice] = useState<{
    periodId: number
    text: string
    tone: 'success' | 'warning'
  } | null>(null)
  const [calendarByPeriod, setCalendarByPeriod] = useState<Record<number, number | null>>({})
  const [copyingPeriod, setCopyingPeriod] = useState<Period | null>(null)
  const [copyForm, setCopyForm] = useState({ name: '', startDate: '', endDate: '', copyCollaboratorKpis: true, copyScopeKpis: true, copyOkrs: true })
  const [copyResult, setCopyResult] = useState<{ copied: { collaboratorKpis: number; scopeKpis: number; objectives: number; keyResults: number } } | null>(null)

  const queryClient = useQueryClient()
  const dialog = useDialog()
  const { t } = useTranslation(['periods', 'common'])

  const { data: periods, isLoading } = useQuery<Period[]>(
    'periods',
    async () => {
      const response = await api.get('/periods')
      return response.data
    },
    {
      staleTime: 60 * 1000,
    }
  )

  const { data: calendarProfiles } = useQuery<any[]>(
    'calendar-profiles',
    async () => {
      const response = await api.get('/calendar-profiles')
      return response.data
    },
    {
      staleTime: 60 * 1000,
    }
  )

  const deletePeriodMutation = useMutation(
    async (id: number) => {
      await api.delete(`/periods/${id}`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('periods')
      },
    }
  )

  const deleteSubPeriodMutation = useMutation(
    async (subPeriod: SubPeriod) => {
      await api.delete(`/sub-periods/${subPeriod.id}`)
      return subPeriod
    },
    {
      onSuccess: (_data, subPeriod) => {
        queryClient.invalidateQueries('periods')
        queryClient.invalidateQueries(['sub-periods', subPeriod.periodId])
      },
    }
  )

  const closeSubPeriodMutation = useMutation(
    async (subPeriod: SubPeriod) => {
      const response = await api.post(`/sub-periods/${subPeriod.id}/close`)
      return { subPeriod, data: response.data }
    },
    {
      onSuccess: (result) => {
        const { subPeriod, data } = result || {}
        if (subPeriod) {
          if (data?.failed?.length) {
            setCloseNotice({
              periodId: subPeriod.periodId,
              tone: 'warning',
              text: t('subperiods.close_notice_warning', { sent: data.sent ?? 0, failed: data.failed.length }),
            })
          } else {
            setCloseNotice({
              periodId: subPeriod.periodId,
              tone: 'success',
              text: t('subperiods.close_notice_success', { sent: data?.sent ?? 0 }),
            })
          }
        }
        queryClient.invalidateQueries('periods')
        if (subPeriod) {
          queryClient.invalidateQueries(['sub-periods', subPeriod.periodId])
        }
      },
      onError: (error: any) => {
        void dialog.alert(
          resolveApiErrorMessage(error, t, {
            codeMap: SUBPERIOD_API_ERROR_KEYS,
            fallbackKey: 'dialogs.close_subperiod_error',
          }),
          { title: t('common:error_title'), variant: 'danger' }
        )
      },
    }
  )

  const closePeriodMutation = useMutation(
    async ({ id, sendEmail }: { id: number; sendEmail: boolean }) => {
      await api.post(`/periods/${id}/close`, { sendEmail })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('periods')
        queryClient.invalidateQueries('collaborator-kpis')
        queryClient.invalidateQueries('period-summary-status')
        queryClient.invalidateQueries('period-summary')
      },
    }
  )

  const recalcSummaryMutation = useMutation(
    async (id: number) => {
      await api.post(`/periods/${id}/close`, { sendEmail: false })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('periods')
        queryClient.invalidateQueries('collaborator-kpis')
        queryClient.invalidateQueries('period-summary-status')
        queryClient.invalidateQueries('period-summary')
        void dialog.alert(t('dialogs.recalc_success'), { title: t('dialogs.recalc_success_title'), variant: 'info' })
      },
      onError: (error: any) => {
        void dialog.alert(
          resolveApiErrorMessage(error, t, {
            fallbackKey: 'dialogs.recalc_error',
          }),
          { title: t('common:error_title'), variant: 'danger' }
        )
      },
    }
  )

  const copyPeriodMutation = useMutation(
    async () => {
      const res = await api.post(`/periods/${copyingPeriod!.id}/copy`, copyForm)
      return res.data
    },
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('periods')
        setCopyResult(data)
      },
      onError: (error: any) => {
        void dialog.alert(
          resolveApiErrorMessage(error, t, {
            codeMap: PERIOD_COPY_API_ERROR_KEYS,
            fallbackKey: 'dialogs.copy_error',
          }),
          { title: t('common:error_title'), variant: 'danger' }
        )
      },
    }
  )

  const reopenPeriodMutation = useMutation(
    async (id: number) => {
      await api.post(`/periods/${id}/reopen`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('periods')
        queryClient.invalidateQueries('collaborator-kpis')
      },
      onError: (error: any) => {
        void dialog.alert(
          resolveApiErrorMessage(error, t, {
            codeMap: PERIOD_REOPEN_API_ERROR_KEYS,
            fallbackKey: 'dialogs.reopen_error',
          }),
          { title: t('dialogs.reopen_error_title'), variant: 'danger' }
        )
      },
    }
  )

  const togglePeriodExpansion = (periodId: number) => {
    const newExpanded = new Set(expandedPeriods)
    if (newExpanded.has(periodId)) {
      newExpanded.delete(periodId)
    } else {
      newExpanded.add(periodId)
    }
    setExpandedPeriods(newExpanded)
  }

  const handleCreatePeriod = () => {
    setEditingPeriod(undefined)
    setShowPeriodForm(true)
  }

  const handleEditPeriod = (period: Period) => {
    setEditingPeriod(period)
    setShowPeriodForm(true)
  }

  const handleCreateSubPeriod = (period: Period) => {
    setSelectedPeriod(period)
    setEditingSubPeriod(undefined)
    setShowSubPeriodForm(true)
  }

  const handleEditSubPeriod = (period: Period, subPeriod: SubPeriod) => {
    setSelectedPeriod(period)
    setEditingSubPeriod(subPeriod)
    setShowSubPeriodForm(true)
  }

  const handleDeleteSubPeriod = async (subPeriod: SubPeriod) => {
    const ok = await dialog.confirm(
      t('dialogs.delete_subperiod_msg', { name: subPeriod.name }),
      { title: t('dialogs.delete_subperiod_title'), confirmLabel: t('dialogs.delete_subperiod_confirm'), variant: 'danger' }
    )
    if (ok) deleteSubPeriodMutation.mutate(subPeriod)
  }

  const handleCloseSubPeriod = async (subPeriod: SubPeriod) => {
    const ok = await dialog.confirm(
      t('dialogs.close_subperiod_msg', { name: subPeriod.name }),
      { title: t('dialogs.close_subperiod_title'), confirmLabel: t('dialogs.close_subperiod_confirm'), variant: 'warning' }
    )
    if (ok) closeSubPeriodMutation.mutate(subPeriod)
  }

  const handleDeletePeriod = async (id: number, name: string) => {
    const ok = await dialog.confirm(
      t('dialogs.delete_period_msg', { name }),
      { title: t('dialogs.delete_period_title'), confirmLabel: t('dialogs.delete_period_confirm'), variant: 'danger' }
    )
    if (ok) deletePeriodMutation.mutate(id)
  }

  const handleClosePeriod = async (period: Period) => {
    const ok = await dialog.confirm(
      t('dialogs.close_period_msg', { name: period.name }),
      { title: t('dialogs.close_period_title'), confirmLabel: t('dialogs.close_period_confirm'), variant: 'warning' }
    )
    if (!ok) return
    const sendEmail = await dialog.confirm(
      t('dialogs.send_email_msg'),
      { title: t('dialogs.send_email_title'), confirmLabel: t('dialogs.send_email_confirm'), cancelLabel: t('dialogs.send_email_cancel'), variant: 'info' }
    )
    closePeriodMutation.mutate({ id: period.id, sendEmail })
  }

  const handleRecalculateSummary = async (period: Period) => {
    const ok = await dialog.confirm(
      t('dialogs.recalc_msg', { name: period.name }),
      { title: t('dialogs.recalc_title'), confirmLabel: t('dialogs.recalc_confirm'), variant: 'info' }
    )
    if (ok) recalcSummaryMutation.mutate(period.id)
  }

  const handleReopenPeriod = async (period: Period) => {
    const ok = await dialog.confirm(
      t('dialogs.reopen_msg', { name: period.name }),
      { title: t('dialogs.reopen_title'), confirmLabel: t('dialogs.reopen_confirm'), variant: 'warning' }
    )
    if (ok) reopenPeriodMutation.mutate(period.id)
  }

  const filteredPeriods = useMemo(() => {
    return periods?.filter((period) => {
      const matchesSearch =
        !searchTerm || period.name.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus = !filterStatus || period.status === filterStatus

      const start = toCalendarDate(period.startDate)?.getTime() ?? null
      const end = toCalendarDate(period.endDate)?.getTime() ?? null
      const filterStart = filterStartDate ? toCalendarDate(filterStartDate)?.getTime() ?? null : null
      const filterEnd = filterEndDate ? toCalendarDate(filterEndDate)?.getTime() ?? null : null

      const matchesStart = filterStart !== null && start !== null ? start >= filterStart : true
      const matchesEnd = filterEnd !== null && end !== null ? end <= filterEnd : true

      return matchesSearch && matchesStatus && matchesStart && matchesEnd
    })
  }, [periods, searchTerm, filterStatus, filterStartDate, filterEndDate])

  const closedPeriods = useMemo(
    () => (filteredPeriods || []).filter((period) => period.status === 'closed'),
    [filteredPeriods]
  )

  const summaryQueries = useQueries(
    (closedPeriods || []).map((period) => ({
      queryKey: ['period-summary-status', period.id],
      queryFn: async () => {
        const response = await api.get(`/periods/${period.id}/summary`)
        return response.data
      },
      staleTime: 60 * 1000,
    }))
  )

  const summaryByPeriodId = useMemo(() => {
    const map = new Map<number, { summaries: any[]; items: any[] }>()
    summaryQueries.forEach((query, index) => {
      const period = closedPeriods?.[index]
      if (!period) return
      if (query.data) {
        map.set(period.id, query.data as { summaries: any[]; items: any[] })
      }
    })
    return map
  }, [summaryQueries, closedPeriods])

  const getStatusBadge = (status: Period['status']) => {
    const statusConfig: Record<Period['status'], { key: string; class: string }> = {
      open: { key: 'status.open', class: 'status-open' },
      in_review: { key: 'status.in_review', class: 'status-review' },
      closed: { key: 'status.closed', class: 'status-closed' },
    }
    const config = statusConfig[status]
    return <span className={`status-badge ${config.class}`}>{t(config.key)}</span>
  }

  return (
    <div className="periodos-page">
      <div className="page-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="subtitle">{t('subtitle')}</p>
        </div>
        <button className="btn-primary" onClick={handleCreatePeriod}>
          {t('header.create')}
        </button>
      </div>

      <div className="info-banner">
        <strong>{t('info_banner_title')}</strong> {t('info_banner_body')}
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
          <label htmlFor="filter-status">{t('filters.status')}</label>
          <select
            id="filter-status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">{t('filters.all_statuses')}</option>
            <option value="open">{t('status.open')}</option>
            <option value="in_review">{t('status.in_review')}</option>
            <option value="closed">{t('status.closed')}</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="filter-start">{t('filters.from')}</label>
          <input
            id="filter-start"
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="filter-end">{t('filters.to')}</label>
          <input
            id="filter-end"
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
          />
        </div>
        {(searchTerm || filterStatus) && (
          <button
            className="btn-clear-filters"
            onClick={() => {
              setSearchTerm('')
              setFilterStatus('')
              setFilterStartDate('')
              setFilterEndDate('')
            }}
          >
            {t('filters.clear')}
          </button>
        )}
      </div>

      <div className="table-container">
        {isLoading ? (
          <div className="loading">{t('loading')}</div>
        ) : filteredPeriods && filteredPeriods.length > 0 ? (
          <>
            <div className="results-info">
              {t('results.showing', { shown: filteredPeriods.length, total: periods?.length || 0 })}
            </div>
            <div className="periods-list">
              {filteredPeriods.map((period) => {
                const isExpanded = expandedPeriods.has(period.id)
                return (
                  <div key={period.id} className="period-card">
                    <div className="period-card-header">
                      <div className="period-card-main">
                        <div className="period-info">
                          <h3 className="period-name">{period.name}</h3>
                          <div className="period-dates">
                            {formatCalendarDate(period.startDate)} —{' '}
                            {formatCalendarDate(period.endDate)}
                          </div>
                          <div className="period-meta">
                            <span className="meta-pill">{t('card.status_label')} {getStatusBadge(period.status)}</span>
                            {period.status === 'closed' &&
                              !summaryByPeriodId.get(period.id)?.summaries?.length && (
                                <span className="status-badge status-review" style={{ marginLeft: 8 }}>
                                  {t('card.no_summary')}
                                </span>
                              )}
                          </div>
                        </div>
                        <div className="period-actions">
                          <button
                            className="btn-icon"
                            onClick={() => togglePeriodExpansion(period.id)}
                            title={isExpanded ? t('actions.hide_subperiods') : t('actions.show_subperiods')}
                          >
                            {isExpanded ? '[-]' : '[+]'}
                          </button>
                          {period.status === 'closed' ? (
                            <button
                              className="btn-text success"
                              onClick={() => handleReopenPeriod(period)}
                              title={t('actions.reopen_title')}
                            >
                              {t('actions.reopen')}
                            </button>
                          ) : (
                            <button
                              className="btn-text"
                              onClick={() => handleClosePeriod(period)}
                              title={t('actions.close_title')}
                            >
                              {t('actions.close')}
                            </button>
                          )}
                          {period.status === 'closed' && (
                            <button
                              className="btn-text"
                              onClick={() =>
                                navigate(
                                  canConfig
                                    ? `/historial/all?periodId=${period.id}`
                                    : `/historial?periodId=${period.id}`
                                )
                              }
                              title={t('actions.view_summary')}
                            >
                              {t('actions.view_summary')}
                            </button>
                          )}
                          {period.status === 'closed' && (
                            <button
                              className="btn-text"
                              onClick={() => handleRecalculateSummary(period)}
                              title={t('actions.recalc_title')}
                            >
                              {t('actions.recalc')}
                            </button>
                          )}
                          <button
                            className="btn-text"
                            onClick={() => handleEditPeriod(period)}
                            title={t('actions.edit_title')}
                            disabled={period.status === 'closed'}
                          >
                            {t('actions.edit')}
                          </button>
                          <button
                            className="btn-text danger"
                            onClick={() => handleDeletePeriod(period.id, period.name)}
                            title={t('actions.delete_title')}
                          >
                            {t('actions.delete')}
                          </button>
                          {canConfig && (
                            <button
                              className="btn-text"
                              onClick={() => {
                                setCopyResult(null)
                                setCopyForm({
                                  name: t('copy_modal.name_default_prefix') + period.name,
                                  startDate: '',
                                  endDate: '',
                                  copyCollaboratorKpis: true,
                                  copyScopeKpis: true,
                                  copyOkrs: true,
                                })
                                setCopyingPeriod(period)
                              }}
                              title={t('actions.copy_title')}
                            >
                              {t('actions.copy')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <SubPeriodsSection
                      period={period}
                      expanded={isExpanded}
                      onCreate={() => handleCreateSubPeriod(period)}
                      onEdit={(sub) => handleEditSubPeriod(period, sub)}
                      onDelete={(sub) => handleDeleteSubPeriod(sub)}
                      onClose={(sub) => handleCloseSubPeriod(sub)}
                      canConfig={canConfig}
                      closeNotice={closeNotice}
                      calendarProfiles={calendarProfiles || []}
                      selectedCalendarProfileId={calendarByPeriod[period.id] ?? null}
                      onCalendarChange={(calendarProfileId) =>
                        setCalendarByPeriod((prev) => ({
                          ...prev,
                          [period.id]: calendarProfileId,
                        }))
                      }
                    />
                  </div>
                )
              })}
            </div>
          </>
        ) : periods && periods.length > 0 ? (
          <div className="empty-state">
            <div className="empty-icon">:/</div>
            <h3>{t('empty.no_results_title')}</h3>
            <p>{t('empty.no_results_subtitle')}</p>
            <button
              className="btn-primary"
              onClick={() => {
                setSearchTerm('')
                setFilterStatus('')
              }}
            >
              {t('empty.no_results_clear')}
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">:)</div>
            <h3>{t('empty.no_data_title')}</h3>
            <p>{t('empty.no_data_subtitle')}</p>
            <button className="btn-primary" onClick={handleCreatePeriod}>
              {t('empty.no_data_btn')}
            </button>
          </div>
        )}
      </div>

      {showPeriodForm && (
        <PeriodForm
          period={editingPeriod}
          onClose={() => {
            setShowPeriodForm(false)
            setEditingPeriod(undefined)
          }}
        />
      )}

      {showSubPeriodForm && selectedPeriod && (
        <SubPeriodForm
          periodId={selectedPeriod.id}
          calendarProfileId={calendarByPeriod[selectedPeriod.id] ?? null}
          subPeriod={editingSubPeriod}
          onClose={() => {
            setShowSubPeriodForm(false)
            setSelectedPeriod(null)
            setEditingSubPeriod(undefined)
          }}
        />
      )}

      {copyingPeriod && (
        <div className="modal-overlay" onClick={() => !copyPeriodMutation.isLoading && setCopyingPeriod(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('copy_modal.title')}</h2>
              <button className="modal-close" onClick={() => setCopyingPeriod(null)} disabled={copyPeriodMutation.isLoading}>×</button>
            </div>

            {copyResult ? (
              <div className="copy-result">
                <div className="copy-result-icon">✓</div>
                <h3>{t('copy_modal.success_title')}</h3>
                <ul className="copy-result-list">
                  <li>{t('copy_modal.kpis_individual')} <strong>{copyResult.copied.collaboratorKpis}</strong></li>
                  <li>{t('copy_modal.kpis_group')} <strong>{copyResult.copied.scopeKpis}</strong></li>
                  <li>{t('copy_modal.objectives')} <strong>{copyResult.copied.objectives}</strong></li>
                  <li>{t('copy_modal.key_results')} <strong>{copyResult.copied.keyResults}</strong></li>
                </ul>
                <button className="btn-primary" onClick={() => setCopyingPeriod(null)}>{t('copy_modal.close')}</button>
              </div>
            ) : (
              <div className="modal-body">
                <p className="copy-source-label">{t('copy_modal.source_label')} <strong>{copyingPeriod.name}</strong></p>

                <div className="form-group">
                  <label>{t('copy_modal.new_name_label')}</label>
                  <input
                    type="text"
                    value={copyForm.name}
                    onChange={(e) => setCopyForm((f) => ({ ...f, name: e.target.value }))}
                    className="form-input"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>{t('copy_modal.start_date_label')}</label>
                    <input
                      type="date"
                      value={copyForm.startDate}
                      onChange={(e) => setCopyForm((f) => ({ ...f, startDate: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('copy_modal.end_date_label')}</label>
                    <input
                      type="date"
                      value={copyForm.endDate}
                      onChange={(e) => setCopyForm((f) => ({ ...f, endDate: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                </div>

                <div className="copy-options">
                  <p className="copy-options-label">{t('copy_modal.what_to_copy')}</p>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={copyForm.copyCollaboratorKpis}
                      onChange={(e) => setCopyForm((f) => ({ ...f, copyCollaboratorKpis: e.target.checked }))}
                    />
                    {t('copy_modal.copy_individual_kpis')}
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={copyForm.copyScopeKpis}
                      onChange={(e) => setCopyForm((f) => ({ ...f, copyScopeKpis: e.target.checked }))}
                    />
                    {t('copy_modal.copy_group_kpis')}
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={copyForm.copyOkrs}
                      onChange={(e) => setCopyForm((f) => ({ ...f, copyOkrs: e.target.checked }))}
                    />
                    {t('copy_modal.copy_okrs')}
                  </label>
                </div>

                <div className="modal-footer">
                  <button
                    className="btn-secondary"
                    onClick={() => setCopyingPeriod(null)}
                    disabled={copyPeriodMutation.isLoading}
                  >
                    {t('copy_modal.cancel')}
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => copyPeriodMutation.mutate()}
                    disabled={
                      copyPeriodMutation.isLoading ||
                      !copyForm.name.trim() ||
                      !copyForm.startDate ||
                      !copyForm.endDate
                    }
                  >
                    {copyPeriodMutation.isLoading ? t('copy_modal.copying') : t('copy_modal.confirm')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
