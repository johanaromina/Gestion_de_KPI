import { useState } from 'react'
import { useMutation, useQuery } from 'react-query'
import api from '../services/api'
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
  { label: 'Cada día a las 6am', value: '0 6 * * *' },
  { label: 'Cada hora', value: '0 * * * *' },
  { label: 'Cada semana (lunes 6am)', value: '0 6 * * 1' },
  { label: 'Solo manual', value: '' },
]

export default function SheetsWizard({ onClose, onSuccess }: SheetsWizardProps) {
  const [step, setStep] = useState<Step>('url')
  const [sheetUrl, setSheetUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [selectedTab, setSelectedTab] = useState('')
  const [selectedColumn, setSelectedColumn] = useState('')
  const [aggregation, setAggregation] = useState('FIRST')
  const [selectedKpi, setSelectedKpi] = useState<AssignmentOption | null>(null)
  const [kpiSearch, setKpiSearch] = useState('')
  const [schedule, setSchedule] = useState('0 6 * * *')
  const [wizardName, setWizardName] = useState('')
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [error, setError] = useState('')
  const [createdResult, setCreatedResult] = useState<any>(null)

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
      label: `${a.collaboratorName || 'Colaborador'} — ${a.kpiName || `KPI #${a.kpiId}`} (${a.periodName || 'período'})`,
      type: 'assignment' as const,
    })),
    ...(scopeKpis || []).map((s: any) => ({
      id: s.id,
      label: `[Área] ${s.name} (${s.periodName || 'período'})`,
      type: 'scope_kpi' as const,
    })),
  ]

  const filteredKpis = kpiSearch.trim()
    ? allKpiOptions.filter((o) => o.label.toLowerCase().includes(kpiSearch.toLowerCase()))
    : allKpiOptions.slice(0, 30)

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
        setError(err?.response?.data?.error || 'No se pudo leer la planilla')
      },
    }
  )

  const wizardMutation = useMutation(
    async () => {
      const payload: any = {
        name: wizardName,
        sheetUrl,
        tab: selectedTab,
        valueColumn: selectedColumn,
        aggregation,
        schedule: schedule || null,
        apiKey: apiKey || undefined,
      }
      if (selectedKpi?.type === 'assignment') payload.assignmentId = selectedKpi.id
      else if (selectedKpi?.type === 'scope_kpi') payload.scopeKpiId = selectedKpi.id
      const res = await api.post('/integrations/sheets-wizard', payload)
      return res.data
    },
    {
      onSuccess: (data) => {
        setCreatedResult(data)
        setStep('done')
      },
      onError: (err: any) => {
        setError(err?.response?.data?.error || 'Error al crear la integración')
      },
    }
  )

  const handleUrlNext = async () => {
    if (!sheetUrl.trim()) {
      setError('Pegá la URL de la planilla de Google Sheets')
      return
    }
    setError('')
    previewMutation.mutate({ url: sheetUrl, key: apiKey })
    setStep('tab')
  }

  const handleTabNext = async () => {
    if (!selectedTab) {
      setError('Seleccioná una pestaña')
      return
    }
    setError('')
    previewMutation.mutate({ url: sheetUrl, tab: selectedTab, key: apiKey })
    setStep('column')
  }

  const handleColumnNext = () => {
    if (!selectedColumn) {
      setError('Seleccioná la columna con el valor del KPI')
      return
    }
    setError('')
    setStep('kpi')
  }

  const handleKpiNext = () => {
    if (!selectedKpi) {
      setError('Seleccioná el KPI destino')
      return
    }
    if (!wizardName) {
      setWizardName(`Google Sheets — ${selectedTab}`)
    }
    setError('')
    setStep('schedule')
  }

  const handleCreate = () => {
    if (!wizardName.trim()) {
      setWizardName(`Google Sheets — ${selectedTab}`)
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
              <h2>Conectar Google Sheets</h2>
              <p>Importá valores de KPI directamente desde tu planilla</p>
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
            <span className="progress-label">Paso {stepIndex[step]} de {totalSteps}</span>
          </div>
        )}

        {error && <div className="sheets-wizard-error">{error}</div>}

        <div className="sheets-wizard-body">

          {/* PASO 1: URL */}
          {step === 'url' && (
            <div className="wizard-step">
              <h3>¿Cuál es la planilla?</h3>
              <p className="step-hint">
                Abrí tu Google Sheets y copiá la URL completa desde la barra del navegador.
              </p>
              <label className="field-label">URL de Google Sheets</label>
              <input
                className="wizard-input"
                type="text"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                autoFocus
              />
              <label className="field-label" style={{ marginTop: 16 }}>
                API Key de Google{' '}
                <span className="field-optional">(opcional si está configurada en el servidor)</span>
              </label>
              <input
                className="wizard-input"
                type="password"
                placeholder="AIza..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="step-hint step-hint-sm">
                La planilla debe ser pública o tu API key debe tener acceso a ella.{' '}
                <a
                  href="https://developers.google.com/sheets/api/guides/authorizing"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Cómo obtener una API Key ↗
                </a>
              </p>
              <div className="wizard-actions">
                <button className="btn-wizard-secondary" onClick={onClose}>Cancelar</button>
                <button
                  className="btn-wizard-primary"
                  onClick={handleUrlNext}
                  disabled={previewMutation.isLoading}
                >
                  {previewMutation.isLoading ? 'Conectando…' : 'Conectar →'}
                </button>
              </div>
            </div>
          )}

          {/* PASO 2: PESTAÑA */}
          {step === 'tab' && (
            <div className="wizard-step">
              <h3>¿En qué pestaña están los datos?</h3>
              <p className="step-hint">
                Seleccioná la hoja (pestaña) de tu planilla que tiene los valores del KPI.
              </p>
              {previewMutation.isLoading ? (
                <div className="wizard-loading">Leyendo planilla…</div>
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
                    <p className="step-hint">No se encontraron pestañas. Verificá la URL y la API key.</p>
                  )}
                </div>
              )}
              <div className="wizard-actions">
                <button className="btn-wizard-secondary" onClick={() => setStep('url')}>← Atrás</button>
                <button
                  className="btn-wizard-primary"
                  onClick={handleTabNext}
                  disabled={!selectedTab || previewMutation.isLoading}
                >
                  {previewMutation.isLoading ? 'Cargando…' : 'Siguiente →'}
                </button>
              </div>
            </div>
          )}

          {/* PASO 3: COLUMNA */}
          {step === 'column' && (
            <div className="wizard-step">
              <h3>¿Qué columna tiene el valor del KPI?</h3>
              <p className="step-hint">
                Elegí la columna que contiene el número que querés usar como medición.
              </p>
              {previewMutation.isLoading ? (
                <div className="wizard-loading">Cargando columnas…</div>
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
                      <p className="preview-label">Vista previa (primeras filas):</p>
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
                    <label className="field-label">Si hay múltiples filas, usar:</label>
                    <select
                      className="wizard-select"
                      value={aggregation}
                      onChange={(e) => setAggregation(e.target.value)}
                    >
                      <option value="FIRST">El primer valor encontrado</option>
                      <option value="SUM">Suma de todos</option>
                      <option value="AVG">Promedio</option>
                      <option value="MAX">Valor máximo</option>
                      <option value="MIN">Valor mínimo</option>
                    </select>
                  </div>
                </>
              )}
              <div className="wizard-actions">
                <button className="btn-wizard-secondary" onClick={() => setStep('tab')}>← Atrás</button>
                <button
                  className="btn-wizard-primary"
                  onClick={handleColumnNext}
                  disabled={!selectedColumn}
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}

          {/* PASO 4: KPI DESTINO */}
          {step === 'kpi' && (
            <div className="wizard-step">
              <h3>¿A qué KPI van los datos?</h3>
              <p className="step-hint">
                Buscá el KPI del colaborador o del área donde se van a cargar las mediciones.
              </p>
              <input
                className="wizard-input"
                type="search"
                placeholder="Buscar por nombre del colaborador o KPI…"
                value={kpiSearch}
                onChange={(e) => setKpiSearch(e.target.value)}
                autoFocus
              />
              <div className="kpi-list">
                {filteredKpis.length === 0 && (
                  <p className="step-hint">No se encontraron KPIs con ese nombre.</p>
                )}
                {filteredKpis.map((opt) => (
                  <button
                    key={`${opt.type}-${opt.id}`}
                    className={`kpi-option ${selectedKpi?.id === opt.id && selectedKpi?.type === opt.type ? 'selected' : ''}`}
                    onClick={() => setSelectedKpi(opt)}
                  >
                    <span className="kpi-option-type">{opt.type === 'scope_kpi' ? 'Área' : 'Colaborador'}</span>
                    <span className="kpi-option-label">{opt.label}</span>
                  </button>
                ))}
              </div>
              <div className="wizard-actions">
                <button className="btn-wizard-secondary" onClick={() => setStep('column')}>← Atrás</button>
                <button
                  className="btn-wizard-primary"
                  onClick={handleKpiNext}
                  disabled={!selectedKpi}
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}

          {/* PASO 5: FRECUENCIA + NOMBRE */}
          {step === 'schedule' && (
            <div className="wizard-step">
              <h3>¿Cada cuánto se sincroniza?</h3>
              <p className="step-hint">
                La app va a leer automáticamente la planilla con esa frecuencia y actualizar el KPI.
              </p>
              <div className="schedule-grid">
                {SCHEDULE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`schedule-option ${schedule === opt.value ? 'selected' : ''}`}
                    onClick={() => setSchedule(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <label className="field-label" style={{ marginTop: 20 }}>Nombre de esta integración</label>
              <input
                className="wizard-input"
                type="text"
                placeholder={`Google Sheets — ${selectedTab}`}
                value={wizardName}
                onChange={(e) => setWizardName(e.target.value)}
              />
              <div className="wizard-summary">
                <p><strong>Planilla:</strong> {sheetUrl.slice(0, 60)}{sheetUrl.length > 60 ? '…' : ''}</p>
                <p><strong>Pestaña:</strong> {selectedTab}</p>
                <p><strong>Columna:</strong> {selectedColumn}</p>
                <p><strong>KPI destino:</strong> {selectedKpi?.label}</p>
              </div>
              {error && <div className="sheets-wizard-error">{error}</div>}
              <div className="wizard-actions">
                <button className="btn-wizard-secondary" onClick={() => setStep('kpi')}>← Atrás</button>
                <button
                  className="btn-wizard-primary"
                  onClick={handleCreate}
                  disabled={wizardMutation.isLoading}
                >
                  {wizardMutation.isLoading ? 'Creando integración…' : '✓ Crear integración'}
                </button>
              </div>
            </div>
          )}

          {/* DONE */}
          {step === 'done' && (
            <div className="wizard-step wizard-done">
              <div className="done-icon">✅</div>
              <h3>¡Integración creada!</h3>
              <p>
                Tu planilla <strong>{selectedTab}</strong> ya está conectada al KPI{' '}
                <strong>{selectedKpi?.label}</strong>.
              </p>
              <p className="step-hint">
                La próxima sincronización automática ocurrirá según el horario configurado.
                También podés ejecutarla manualmente desde la sección de Integraciones.
              </p>
              {createdResult && (
                <div className="done-ids">
                  <span>Template #{createdResult.templateId}</span>
                  <span>Target #{createdResult.targetId}</span>
                </div>
              )}
              <div className="wizard-actions">
                <button className="btn-wizard-primary" onClick={onSuccess}>Listo</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
