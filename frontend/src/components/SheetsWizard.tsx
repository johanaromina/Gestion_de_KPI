import { useState } from 'react'
import { useMutation, useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import './SheetsWizard.css'

interface SheetsWizardProps {
  onClose: () => void
  onSuccess: () => void
}

type Step = 'url' | 'tab' | 'column' | 'kpi' | 'schedule' | 'done'

interface PreviewResult {
  sheetId: string
  tabs: string[]
  headers: string[]
  preview: any[][]
}

interface AssignmentOption {
  id: number
  label: string
  type: 'assignment' | 'scope_kpi'
}

const SCHEDULE_OPTIONS = [
  { labelKey: 'config:sheets_wizard.schedule_options.daily', value: '0 6 * * *' },
  { labelKey: 'config:sheets_wizard.schedule_options.hourly', value: '0 * * * *' },
  { labelKey: 'config:sheets_wizard.schedule_options.weekly', value: '0 6 * * 1' },
  { labelKey: 'config:sheets_wizard.schedule_options.manual', value: '' },
]

export default function SheetsWizard({ onClose, onSuccess }: SheetsWizardProps) {
  const { t } = useTranslation(['config', 'common'])
  const [step, setStep] = useState<Step>('url')
  const [sheetUrl, setSheetUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [selectedTab, setSelectedTab] = useState('')
  const [selectedColumn, setSelectedColumn] = useState('')
  const [aggregation, setAggregation] = useState('FIRST')
  const [agentColumn, setAgentColumn] = useState('')
  const [selectedKpi, setSelectedKpi] = useState<AssignmentOption | null>(null)
  const [selectedKpis, setSelectedKpis] = useState<{ id: number; label: string; agentValue: string }[]>([])
  const [kpiSearch, setKpiSearch] = useState('')
  const [kpiTab, setKpiTab] = useState<'assignment' | 'scope_kpi'>('assignment')
  const [schedule, setSchedule] = useState('0 6 * * *')
  const [wizardName, setWizardName] = useState('')
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [error, setError] = useState('')
  const [createdResult, setCreatedResult] = useState<any>(null)

  const defaultWizardName = (tab: string) =>
    t('config:sheets_wizard.defaults.integration_name', { tab })

  // Cargar asignaciones disponibles
  const { data: assignments } = useQuery<any[]>(
    ['collaborator-kpis-for-wizard'],
    async () => {
      const res = await api.get('/collaborator-kpis')
      return res.data
    },
    { retry: false }
  )

  const { data: scopeKpis } = useQuery<any[]>(
    ['scope-kpis-for-wizard'],
    async () => {
      const res = await api.get('/scope-kpis')
      return res.data
    },
    { retry: false }
  )

  const allKpiOptions: AssignmentOption[] = [
    ...(assignments || []).map((a: any) => ({
      id: a.id,
      label: `${a.collaboratorName || t('config:sheets_wizard.kpi_option_fallbacks.collaborator')} - ${a.kpiName || t('config:sheets_wizard.kpi_option_fallbacks.kpi', { id: a.kpiId })} (${a.periodName || t('config:sheets_wizard.kpi_option_fallbacks.period')})`,
      type: 'assignment' as const,
    })),
    ...(scopeKpis || []).map((s: any) => ({
      id: s.id,
      label: `${t('config:sheets_wizard.kpi_option_fallbacks.scope_prefix')} ${s.name} (${s.periodName || t('config:sheets_wizard.kpi_option_fallbacks.period')})`,
      type: 'scope_kpi' as const,
    })),
  ]

  const filteredKpis = (kpiSearch.trim()
    ? allKpiOptions.filter((o) => o.label.toLowerCase().includes(kpiSearch.toLowerCase()))
    : allKpiOptions
  ).filter((o) => o.type === kpiTab).slice(0, 30)

  const previewMutation = useMutation(
    async ({ url, tab, key }: { url: string; tab?: string; key: string }) => {
      const res = await api.post('/integrations/sheets-preview', { sheetUrl: url, tab, apiKey: key })
      return res.data as PreviewResult
    },
    {
      onSuccess: (data) => {
        setPreview(data)
        setError('')
      },
      onError: (err: any) => {
        setError(
          resolveApiErrorMessage(err, t, {
            fallbackKey: 'config:sheets_wizard.errors.preview',
          })
        )
      },
    }
  )

  const isBulkMode = kpiTab === 'assignment' && !!agentColumn

  const wizardMutation = useMutation(
    async () => {
      const base: any = {
        name: wizardName || defaultWizardName(selectedTab),
        sheetUrl,
        tab: selectedTab,
        valueColumn: selectedColumn,
        aggregation,
        schedule: schedule || null,
        apiKey: apiKey || undefined,
      }
      if (isBulkMode) {
        const res = await api.post('/integrations/sheets-wizard', {
          ...base,
          collaboratorColumn: agentColumn,
          assignments: selectedKpis.map((k) => ({ assignmentId: k.id, collaboratorValue: k.agentValue })),
        })
        return res.data
      }
      if (selectedKpi?.type === 'assignment') base.assignmentId = selectedKpi.id
      else if (selectedKpi?.type === 'scope_kpi') base.scopeKpiId = selectedKpi.id
      const res = await api.post('/integrations/sheets-wizard', base)
      return res.data
    },
    {
      onSuccess: (data) => {
        setCreatedResult(data)
        setStep('done')
      },
      onError: (err: any) => {
        setError(
          resolveApiErrorMessage(err, t, {
            fallbackKey: 'config:sheets_wizard.errors.create',
          })
        )
      },
    }
  )

  const handleUrlNext = async () => {
    if (!sheetUrl.trim()) {
      setError(t('config:sheets_wizard.errors.url_required'))
      return
    }
    setError('')
    previewMutation.mutate({ url: sheetUrl, key: apiKey })
    setStep('tab')
  }

  const handleTabNext = async () => {
    if (!selectedTab) {
      setError(t('config:sheets_wizard.errors.tab_required'))
      return
    }
    setError('')
    previewMutation.mutate({ url: sheetUrl, tab: selectedTab, key: apiKey })
    setStep('column')
  }

  const handleColumnNext = () => {
    if (!selectedColumn) {
      setError(t('config:sheets_wizard.errors.column_required'))
      return
    }
    setError('')
    setStep('kpi')
  }

  const handleKpiNext = () => {
    if (isBulkMode) {
      if (selectedKpis.length === 0) { setError(t('config:sheets_wizard.errors.bulk_required')); return }
      if (selectedKpis.some((k) => !k.agentValue.trim())) { setError(t('config:sheets_wizard.errors.bulk_name_required')); return }
    } else {
      if (!selectedKpi) { setError(t('config:sheets_wizard.errors.kpi_required')); return }
    }
    if (!wizardName) setWizardName(defaultWizardName(selectedTab))
    setError('')
    setStep('schedule')
  }

  const handleCreate = () => {
    if (!wizardName.trim()) {
      setWizardName(defaultWizardName(selectedTab))
    }
    wizardMutation.mutate()
  }

  const stepIndex: Record<Step, number> = { url: 1, tab: 2, column: 3, kpi: 4, schedule: 5, done: 6 }
  const totalSteps = 5

  return (
    <div className="sheets-wizard-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheets-wizard-modal">
        <div className="sheets-wizard-header">
          <div className="sheets-wizard-title">
            <span className="sheets-wizard-icon">📊</span>
            <div>
              <h2>{t('config:sheets_wizard.title')}</h2>
              <p>{t('config:sheets_wizard.subtitle')}</p>
            </div>
          </div>
          <button className="sheets-wizard-close" onClick={onClose}>✕</button>
        </div>

        {step !== 'done' && (
          <div className="sheets-wizard-progress">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((n) => (
              <div
                key={n}
                className={`progress-dot ${n < stepIndex[step] ? 'done' : n === stepIndex[step] ? 'active' : ''}`}
              />
            ))}
            <span className="progress-label">{t('config:sheets_wizard.progress', { current: stepIndex[step], total: totalSteps })}</span>
          </div>
        )}

        {error && <div className="sheets-wizard-error">{error}</div>}

        <div className="sheets-wizard-body">

          {/* PASO 1: URL */}
          {step === 'url' && (
            <div className="wizard-step">
              <h3>{t('config:sheets_wizard.steps.url_title')}</h3>
              <p className="step-hint">
                {t('config:sheets_wizard.steps.url_hint')}
              </p>
              <label className="field-label">{t('config:sheets_wizard.fields.sheet_url')}</label>
              <input
                className="wizard-input"
                type="text"
                placeholder={t('config:sheets_wizard.placeholders.sheet_url')}
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                autoFocus
              />
              <label className="field-label" style={{ marginTop: 16 }}>
                {t('config:sheets_wizard.fields.api_key')}{' '}
                <span className="field-optional">{t('config:sheets_wizard.fields.api_key_optional')}</span>
              </label>
              <input
                className="wizard-input"
                type="password"
                placeholder={t('config:sheets_wizard.placeholders.api_key')}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="step-hint step-hint-sm">
                {t('config:sheets_wizard.hints.public_or_api_key')}{' '}
                <a
                  href="https://developers.google.com/sheets/api/guides/authorizing"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('config:sheets_wizard.hints.api_key_help')}
                </a>
              </p>
              <div className="wizard-actions">
                <button className="btn-wizard-secondary" onClick={onClose}>{t('common:cancel')}</button>
                <button
                  className="btn-wizard-primary"
                  onClick={handleUrlNext}
                  disabled={previewMutation.isLoading}
                >
                  {previewMutation.isLoading ? t('config:sheets_wizard.actions.connecting') : t('config:sheets_wizard.actions.connect')}
                </button>
              </div>
            </div>
          )}

          {/* PASO 2: PESTAÑA */}
          {step === 'tab' && (
            <div className="wizard-step">
              <h3>{t('config:sheets_wizard.steps.tab_title')}</h3>
              <p className="step-hint">
                {t('config:sheets_wizard.steps.tab_hint')}
              </p>
              {previewMutation.isLoading ? (
                <div className="wizard-loading">{t('config:sheets_wizard.loading.sheet')}</div>
              ) : (
                <div className="tab-grid">
                  {(preview?.tabs || []).map((tab) => (
                    <button
                      key={tab}
                      className={`tab-option ${selectedTab === tab ? 'selected' : ''}`}
                      onClick={() => setSelectedTab(tab)}
                    >
                      📋 {tab}
                    </button>
                  ))}
                  {(!preview?.tabs || preview.tabs.length === 0) && (
                    <p className="step-hint">{t('config:sheets_wizard.hints.no_tabs')}</p>
                  )}
                </div>
              )}
              <div className="wizard-actions">
                <button className="btn-wizard-secondary" onClick={() => setStep('url')}>{t('common:back')}</button>
                <button
                  className="btn-wizard-primary"
                  onClick={handleTabNext}
                  disabled={!selectedTab || previewMutation.isLoading}
                >
                  {previewMutation.isLoading ? t('common:loading') : t('common:next')}
                </button>
              </div>
            </div>
          )}

          {/* PASO 3: COLUMNA */}
          {step === 'column' && (
            <div className="wizard-step">
              <h3>{t('config:sheets_wizard.steps.column_title')}</h3>
              <p className="step-hint">
                {t('config:sheets_wizard.steps.column_hint')}
              </p>
              {previewMutation.isLoading ? (
                <div className="wizard-loading">{t('config:sheets_wizard.loading.columns')}</div>
              ) : (
                <>
                  <div className="column-grid">
                    {(preview?.headers || []).map((col, i) => (
                      <button
                        key={i}
                        className={`column-option ${selectedColumn === String(col) ? 'selected' : ''}`}
                        onClick={() => setSelectedColumn(String(col))}
                      >
                        <span className="col-letter">{String.fromCharCode(65 + i)}</span>
                        <span className="col-name">{String(col)}</span>
                        {preview?.preview?.[0]?.[i] !== undefined && (
                          <span className="col-sample">{String(preview.preview[0][i]).slice(0, 12)}</span>
                        )}
                      </button>
                    ))}
                  </div>
                  {preview?.preview && preview.preview.length > 0 && (
                    <div className="preview-table-wrap">
                      <p className="preview-label">{t('config:sheets_wizard.hints.preview_label')}</p>
                      <div className="preview-scroll">
                        <table className="preview-table">
                          <thead>
                            <tr>
                              {(preview.headers || []).map((h, i) => (
                                <th
                                  key={i}
                                  className={selectedColumn === String(h) ? 'col-selected' : ''}
                                >
                                  {String(h)}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(preview.preview || []).map((row, ri) => (
                              <tr key={ri}>
                                {row.map((cell, ci) => (
                                  <td
                                    key={ci}
                                    className={selectedColumn === String(preview.headers?.[ci]) ? 'col-selected' : ''}
                                  >
                                    {String(cell ?? '')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  <div className="agg-row">
                    <label className="field-label">{t('config:sheets_wizard.fields.aggregation')}</label>
                    <select
                      className="wizard-select"
                      value={aggregation}
                      onChange={(e) => setAggregation(e.target.value)}
                    >
                      <option value="FIRST">{t('config:sheets_wizard.aggregation_options.FIRST')}</option>
                      <option value="SUM">{t('config:sheets_wizard.aggregation_options.SUM')}</option>
                      <option value="AVG">{t('config:sheets_wizard.aggregation_options.AVG')}</option>
                      <option value="MAX">{t('config:sheets_wizard.aggregation_options.MAX')}</option>
                      <option value="MIN">{t('config:sheets_wizard.aggregation_options.MIN')}</option>
                    </select>
                  </div>

                  <div className="agent-col-row">
                    <label className="field-label">
                      {t('config:sheets_wizard.fields.agent_column')}{' '}
                      <span className="field-optional">{t('config:sheets_wizard.fields.agent_column_optional')}</span>
                    </label>
                    <select
                      className="wizard-select"
                      value={agentColumn}
                      onChange={(e) => { setAgentColumn(e.target.value); setSelectedKpis([]) }}
                    >
                      <option value="">{t('config:sheets_wizard.placeholders.single_value_option')}</option>
                      {(preview?.headers || []).map((h) => (
                        <option key={String(h)} value={String(h)}>{String(h)}</option>
                      ))}
                    </select>
                    {agentColumn && (
                      <p className="agent-col-hint">
                        {t('config:sheets_wizard.hints.agent_column_hint')}
                      </p>
                    )}
                  </div>
                </>
              )}
              <div className="wizard-actions">
                <button className="btn-wizard-secondary" onClick={() => setStep('tab')}>{t('common:back')}</button>
                <button
                  className="btn-wizard-primary"
                  onClick={handleColumnNext}
                  disabled={!selectedColumn}
                >
                  {t('common:next')}
                </button>
              </div>
            </div>
          )}

          {/* PASO 4: KPI DESTINO */}
          {step === 'kpi' && (
            <div className="wizard-step">
              <h3>{t('config:sheets_wizard.steps.kpi_title')}</h3>

              {/* Tabs de tipo */}
              <div className="kpi-type-tabs">
                <button
                  className={`kpi-type-tab ${kpiTab === 'assignment' ? 'active' : ''}`}
                  onClick={() => { setKpiTab('assignment'); setSelectedKpi(null); setSelectedKpis([]); setKpiSearch('') }}
                >
                  <span className="kpi-type-tab-icon">👤</span>
                  <span className="kpi-type-tab-label">{t('config:sheets_wizard.kpi_tabs.assignment')}</span>
                </button>
                <button
                  className={`kpi-type-tab ${kpiTab === 'scope_kpi' ? 'active' : ''}`}
                  onClick={() => { setKpiTab('scope_kpi'); setSelectedKpi(null); setSelectedKpis([]); setKpiSearch('') }}
                >
                  <span className="kpi-type-tab-icon">🏢</span>
                  <span className="kpi-type-tab-label">{t('config:sheets_wizard.kpi_tabs.scope_kpi')}</span>
                </button>
              </div>

              {/* Descripción contextual */}
              <div className="kpi-type-hint">
                {kpiTab === 'scope_kpi' ? (
                  <p>{t('config:sheets_wizard.hints.scope_destination')}</p>
                ) : isBulkMode ? (
                  <p>{t('config:sheets_wizard.hints.bulk_destination', { column: agentColumn })}</p>
                ) : (
                  <p>{t('config:sheets_wizard.hints.single_destination')}</p>
                )}
              </div>

              {/* Modo BULK — multi-select con nombre editable */}
              {kpiTab === 'assignment' && isBulkMode ? (
                <>
                  <input
                    className="wizard-input"
                    type="search"
                    placeholder={t('config:sheets_wizard.placeholders.search_assignment')}
                    value={kpiSearch}
                    onChange={(e) => setKpiSearch(e.target.value)}
                    autoFocus
                  />
                  <div className="kpi-list">
                    {filteredKpis.length === 0 && (
                      <p className="step-hint">{t('config:sheets_wizard.hints.empty_search')}</p>
                    )}
                    {filteredKpis.map((opt) => {
                      const isChecked = selectedKpis.some((k) => k.id === opt.id)
                      const entry = selectedKpis.find((k) => k.id === opt.id)
                      return (
                        <div
                          key={`${opt.type}-${opt.id}`}
                          className={`kpi-option kpi-option-bulk ${isChecked ? 'selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const rawName = opt.label.split(' - ')[0]
                                setSelectedKpis((prev) => [...prev, { id: opt.id, label: opt.label, agentValue: rawName }])
                              } else {
                                setSelectedKpis((prev) => prev.filter((k) => k.id !== opt.id))
                              }
                            }}
                          />
                          <div className="kpi-option-bulk-info">
                            <span className="kpi-option-label">{opt.label}</span>
                            {isChecked && (
                              <input
                                className="wizard-input agent-value-input"
                                type="text"
                                placeholder={t('config:sheets_wizard.placeholders.agent_name')}
                                value={entry?.agentValue || ''}
                                onChange={(e) => setSelectedKpis((prev) =>
                                  prev.map((k) => k.id === opt.id ? { ...k, agentValue: e.target.value } : k)
                                )}
                                onClick={(e) => e.stopPropagation()}
                              />
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {selectedKpis.length > 0 && (
                    <p className="agent-col-hint">
                      {t('config:sheets_wizard.bulk_selection', { count: selectedKpis.length })}
                    </p>
                  )}
                </>
              ) : (
                /* Modo individual / scope */
                <>
                  <input
                    className="wizard-input"
                    type="search"
                    placeholder={kpiTab === 'assignment'
                      ? t('config:sheets_wizard.placeholders.search_assignment')
                      : t('config:sheets_wizard.placeholders.search_scope')}
                    value={kpiSearch}
                    onChange={(e) => setKpiSearch(e.target.value)}
                    autoFocus
                  />
                  <div className="kpi-list">
                    {filteredKpis.length === 0 && (
                      <p className="step-hint">{t('config:sheets_wizard.hints.empty_search')}</p>
                    )}
                    {filteredKpis.map((opt) => (
                      <button
                        key={`${opt.type}-${opt.id}`}
                        className={`kpi-option ${selectedKpi?.id === opt.id && selectedKpi?.type === opt.type ? 'selected' : ''}`}
                        onClick={() => setSelectedKpi(opt)}
                      >
                        <span className="kpi-option-label">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="wizard-actions">
                <button className="btn-wizard-secondary" onClick={() => setStep('column')}>{t('common:back')}</button>
                <button
                  className="btn-wizard-primary"
                  onClick={handleKpiNext}
                  disabled={isBulkMode ? selectedKpis.length === 0 : !selectedKpi}
                >
                  {t('common:next')}
                </button>
              </div>
            </div>
          )}

          {/* PASO 5: FRECUENCIA + NOMBRE */}
          {step === 'schedule' && (
            <div className="wizard-step">
              <h3>{t('config:sheets_wizard.steps.schedule_title')}</h3>
              <p className="step-hint">
                {t('config:sheets_wizard.steps.schedule_hint')}
              </p>
              <div className="schedule-grid">
                {SCHEDULE_OPTIONS.map((opt) => (
                  <button
                    key={opt.labelKey}
                    className={`schedule-option ${schedule === opt.value ? 'selected' : ''}`}
                    onClick={() => setSchedule(opt.value)}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
              <label className="field-label" style={{ marginTop: 20 }}>{t('config:sheets_wizard.fields.integration_name')}</label>
              <input
                className="wizard-input"
                type="text"
                placeholder={defaultWizardName(selectedTab)}
                value={wizardName}
                onChange={(e) => setWizardName(e.target.value)}
              />
              <div className="wizard-summary">
                <p><strong>{t('config:sheets_wizard.summary.sheet')}</strong> {sheetUrl.slice(0, 60)}{sheetUrl.length > 60 ? '…' : ''}</p>
                <p><strong>{t('config:sheets_wizard.summary.tab')}</strong> {selectedTab}</p>
                <p><strong>{t('config:sheets_wizard.summary.column')}</strong> {selectedColumn}</p>
                {isBulkMode ? (
                  <p><strong>{t('config:sheets_wizard.summary.collaborators')}</strong> {selectedKpis.map((k) => k.agentValue).join(', ')}</p>
                ) : (
                  <p><strong>{t('config:sheets_wizard.summary.destination_kpi')}</strong> {selectedKpi?.label}</p>
                )}
              </div>
              {error && <div className="sheets-wizard-error">{error}</div>}
              <div className="wizard-actions">
                <button className="btn-wizard-secondary" onClick={() => setStep('kpi')}>{t('common:back')}</button>
                <button
                  className="btn-wizard-primary"
                  onClick={handleCreate}
                  disabled={wizardMutation.isLoading}
                >
                  {wizardMutation.isLoading ? t('config:sheets_wizard.actions.creating') : t('config:sheets_wizard.actions.create')}
                </button>
              </div>
            </div>
          )}

          {/* DONE */}
          {step === 'done' && (
            <div className="wizard-step wizard-done">
              <div className="done-icon">✅</div>
              <h3>{t('config:sheets_wizard.steps.done_title', { count: isBulkMode ? selectedKpis.length : 1 })}</h3>
              <p>
                {isBulkMode
                  ? t('config:sheets_wizard.done.bulk_message', { tab: selectedTab, count: selectedKpis.length, column: agentColumn })
                  : t('config:sheets_wizard.done.single_message', { tab: selectedTab, kpi: selectedKpi?.label || '-' })
                }
              </p>
              <p className="step-hint">
                {t('config:sheets_wizard.hints.next_sync')} {t('config:sheets_wizard.hints.manual_run')}
              </p>
              {createdResult && (
                <div className="done-ids">
                  <span>{t('config:sheets_wizard.done.template_id', { id: createdResult.templateId })}</span>
                  {createdResult.targetIds
                    ? <span>{t('config:sheets_wizard.done.targets_created', { count: createdResult.targetIds.length })}</span>
                    : <span>{t('config:sheets_wizard.done.target_id', { id: createdResult.targetId })}</span>
                  }
                </div>
              )}
              <div className="wizard-actions">
                <button className="btn-wizard-primary" onClick={onSuccess}>{t('config:sheets_wizard.actions.done')}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
