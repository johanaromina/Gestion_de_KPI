import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api'
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

export default function InputDatos() {
  const [showOnlyPending, setShowOnlyPending] = useState(false)
  const [searchParams] = useSearchParams()
  const assignmentFromQuery = searchParams.get('assignmentId')
  const [selectedAssignment, setSelectedAssignment] = useState<number | ''>(
    assignmentFromQuery ? Number(assignmentFromQuery) : ''
  )
  const [selectedArea, setSelectedArea] = useState('')
  const [selectedKpiId, setSelectedKpiId] = useState<number | ''>('')
  const [showMeasurementModal, setShowMeasurementModal] = useState(false)
  const [newValue, setNewValue] = useState('')
  const [newMode, setNewMode] = useState<'manual' | 'import' | 'auto'>('manual')
  const [newStatus, setNewStatus] = useState<'draft' | 'proposed' | 'approved'>('approved')
  const [newReason, setNewReason] = useState('')
  const [newEvidence, setNewEvidence] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const navigate = useNavigate()

  const queryClient = useQueryClient()

  const { data: assignments } = useQuery('collaborator-kpis', async () => {
    const response = await api.get('/collaborator-kpis')
    return response.data
  })

  const { data: collaborators } = useQuery('input-collaborators', async () => {
    const response = await api.get('/collaborators')
    return response.data
  })

  const { data: kpis } = useQuery('input-kpis', async () => {
    const response = await api.get('/kpis')
    return response.data
  })

  const areaOptions = useMemo(() => {
    if (!collaborators) return []
    const areas = Array.from(new Set(collaborators.map((c: any) => c.area).filter(Boolean)))
    return areas.sort((a, b) => String(a).localeCompare(String(b)))
  }, [collaborators])

  const assignmentsWithArea = useMemo(() => {
    if (!assignments) return []
    return assignments.map((assignment: any) => {
      const collaboratorArea =
        assignment.collaboratorArea ||
        collaborators?.find((c: any) => c.id === assignment.collaboratorId)?.area ||
        ''
      return { ...assignment, collaboratorArea }
    })
  }, [assignments, collaborators])

  const filteredAssignments = useMemo(() => {
    return assignmentsWithArea.filter((assignment: any) => {
      if (selectedArea && assignment.collaboratorArea !== selectedArea) return false
      if (selectedKpiId && assignment.kpiId !== selectedKpiId) return false
      return true
    })
  }, [assignmentsWithArea, selectedArea, selectedKpiId])

  const collapsedAssignments = useMemo(() => {
    const groups = new Map<string, any[]>()
    for (const assignment of filteredAssignments) {
      const key = `${assignment.collaboratorId}-${assignment.kpiId}-${assignment.periodId}`
      const current = groups.get(key) || []
      current.push(assignment)
      groups.set(key, current)
    }

    const result: Array<{ id: number; label: string }> = []
    for (const group of groups.values()) {
      const sorted = [...group].sort((a, b) => Number(a.id) - Number(b.id))
      const base = sorted.find((item: any) => item.subPeriodId == null) || sorted[0]
      const label = `${base.collaboratorName || `Colaborador #${base.collaboratorId}`} · ${
        base.kpiName || `KPI #${base.kpiId}`
      } · ${base.periodName || `Período #${base.periodId}`}`
      result.push({ id: base.id, label })
    }

    return result.sort((a, b) => a.label.localeCompare(b.label))
  }, [filteredAssignments])

  const kpisByArea = useMemo(() => {
    if (!kpis) return []
    const kpiIdsInArea = new Set(
      assignmentsWithArea
        .filter((assignment: any) => (selectedArea ? assignment.collaboratorArea === selectedArea : true))
        .map((assignment: any) => assignment.kpiId)
    )
    return kpis.filter((kpi: any) => kpiIdsInArea.has(kpi.id))
  }, [kpis, assignmentsWithArea, selectedArea])

  useEffect(() => {
    if (!selectedAssignment) return
    const exists = collapsedAssignments.some((assignment) => assignment.id === selectedAssignment)
    if (!exists) {
      setSelectedAssignment('')
    }
  }, [collapsedAssignments, selectedAssignment])

  useEffect(() => {
    if (!selectedKpiId) return
    const exists = kpisByArea.some((kpi: any) => kpi.id === selectedKpiId)
    if (!exists) {
      setSelectedKpiId('')
    }
  }, [kpisByArea, selectedKpiId])

  const selectedAssignmentData = useMemo(() => {
    if (!assignmentsWithArea || !selectedAssignment) return null
    return assignmentsWithArea.find((assignment: any) => assignment.id === selectedAssignment) || null
  }, [assignmentsWithArea, selectedAssignment])

  const isCurationApproved = selectedAssignmentData?.curationStatus === 'approved'

  const { data: measurements, isLoading } = useQuery<Measurement[]>(
    ['measurements', selectedAssignment],
    async () => {
      const response = await api.get('/measurements', {
        params: { assignmentId: selectedAssignment || undefined },
      })
      return response.data
    },
    { enabled: !!selectedAssignment }
  )

  const createMeasurement = useMutation(
    async () => {
      if (!selectedAssignment) return
      await api.post('/measurements', {
        assignmentId: selectedAssignment,
        value: Number(newValue),
        mode: newMode,
        status: newStatus,
        reason: newReason.trim() || undefined,
        evidenceUrl: newEvidence.trim() || undefined,
      })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['measurements', selectedAssignment])
        setNewValue('')
        setNewReason('')
        setNewEvidence('')
      },
    }
  )

  const approveMeasurement = useMutation(
    async (id: number) => {
      await api.post(`/measurements/${id}/approve`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['measurements', selectedAssignment])
      },
    }
  )

  const rejectMeasurement = useMutation(
    async (id: number) => {
      await api.post(`/measurements/${id}/reject`)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['measurements', selectedAssignment])
      },
    }
  )

  const filteredMeasurements = useMemo(() => {
    if (!measurements) return []
    if (!showOnlyPending) return measurements
    return measurements.filter((m) => m.status === 'proposed' || m.status === 'draft')
  }, [measurements, showOnlyPending])

  const formatMode = (mode: Measurement['mode']) => {
    if (mode === 'auto') return 'Auto'
    if (mode === 'import') return 'Import'
    return 'Manual'
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
        setUploadMessage('El archivo está vacío.')
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
        const assignmentId = idxAssignment >= 0 ? Number(row[idxAssignment]) : Number(selectedAssignment)
        const value = idxValue >= 0 ? Number(row[idxValue]) : Number(row[0])
        const mode = (idxMode >= 0 ? row[idxMode] : 'import') as Measurement['mode']
        const status = (idxStatus >= 0 ? row[idxStatus] : 'proposed') as Measurement['status']
        const reason = idxReason >= 0 ? row[idxReason] : ''
        const evidenceUrl = idxEvidence >= 0 ? row[idxEvidence] : ''
        const sourceRunId = idxSourceRun >= 0 ? row[idxSourceRun] : ''

        if (!assignmentId || Number.isNaN(assignmentId)) {
          errors.push(`Fila ${i + 1}: assignmentId inválido.`)
          continue
        }
        if (value === undefined || Number.isNaN(value)) {
          errors.push(`Fila ${i + 1}: value inválido.`)
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
          errors.push(`Fila ${i + 1}: ${error?.response?.data?.error || 'Error al crear medición'}`)
        }
      }

      if (selectedAssignment) {
        queryClient.invalidateQueries(['measurements', selectedAssignment])
      }

      if (errors.length > 0) {
        setUploadMessage(
          `Se cargaron ${created} mediciones. Errores: ${errors.slice(0, 3).join(' ')}${errors.length > 3 ? ' ...' : ''}`
        )
      } else {
        setUploadMessage(`Se cargaron ${created} mediciones correctamente.`)
      }
    } finally {
      setUploading(false)
    }
  }

  const handleAutoFetch = async () => {
    if (!selectedAssignment) {
      alert('Selecciona una asignación primero')
      return
    }
    const value = window.prompt('Valor obtenido automáticamente:')
    if (!value) return
    await api.post('/measurements', {
      assignmentId: selectedAssignment,
      value: Number(value),
      mode: 'auto',
      status: 'proposed',
    })
    queryClient.invalidateQueries(['measurements', selectedAssignment])
  }

  return (
    <div className="input-page">
      <div className="page-header">
        <div>
          <h1>Input de datos</h1>
          <p className="subtitle">Carga automatizada o manual con validaciones tecnicas.</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => navigate('/configuracion')}>
            Configurar integraciones
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              if (!selectedAssignment) {
                alert('Selecciona una asignación primero')
                return
              }
              setShowMeasurementModal(true)
            }}
          >
            Nueva carga manual
          </button>
        </div>
      </div>

      <div className="input-grid">
        <div className="card">
          <h3>Ingesta automatica</h3>
          <p className="muted">Jobs activos y salud de integraciones.</p>
          <div className="auto-list muted">
            Integraciones disponibles. La ultima corrida se mostrara aqui cuando esten activas.
          </div>
          <div className="card-actions">
            <button
              className="btn-secondary"
              onClick={() => alert('No hay integraciones activas configuradas.')}
            >
              Ejecutar jobs ahora
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Historial de mediciones</h3>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showOnlyPending}
                onChange={(e) => setShowOnlyPending(e.target.checked)}
              />
              <span>Solo pendientes</span>
            </label>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="area-select">Área</label>
              <select
                id="area-select"
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
              >
                <option value="">Todas las áreas</option>
                {areaOptions.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="kpi-select">KPI</label>
              <select
                id="kpi-select"
                value={selectedKpiId}
                onChange={(e) => setSelectedKpiId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Todos los KPIs</option>
                {kpisByArea.map((kpi: any) => (
                  <option key={kpi.id} value={kpi.id}>
                    {kpi.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="assignment-select">Asignación</label>
              <select
                id="assignment-select"
                value={selectedAssignment}
                onChange={(e) => setSelectedAssignment(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Selecciona una asignación</option>
                {collapsedAssignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {collapsedAssignments.length === 0 ? (
            <div className="form-hint">No hay asignaciones para esos filtros.</div>
          ) : null}
          {selectedAssignmentData && (
            <div className="assignment-meta">
              <div>
                <span className="meta-label">Fuente:</span>{' '}
                <span className="meta-value">
                  {selectedAssignmentData.dataSourceName ||
                    selectedAssignmentData.dataSource ||
                    'Sin fuente'}
                </span>
                {selectedAssignmentData.sourceConfig && (
                  <span className="meta-sub">· {selectedAssignmentData.sourceConfig}</span>
                )}
              </div>
              <div>
                <span className="meta-label">Curaduría:</span>{' '}
                <span className={`status-pill ${isCurationApproved ? 'ok' : 'review'}`}>
                  {selectedAssignmentData.curationStatus || 'pending'}
                </span>
              </div>
              <div className="meta-criteria">
                <span className="meta-label">Criterio activo:</span>{' '}
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
                    'Sin criterio'}
                </span>
              </div>
            </div>
          )}
          <table className="input-table">
            <thead>
              <tr>
                <th>Valor</th>
                <th>Modo</th>
                <th>Fecha</th>
                <th>Usuario/Fuente</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && selectedAssignment ? (
                <tr>
                  <td colSpan={6} className="empty-row">Cargando mediciones...</td>
                </tr>
              ) : (
                filteredMeasurements.map((measurement) => (
                  <tr key={measurement.id}>
                    <td>{measurement.value}</td>
                    <td>{formatMode(measurement.mode)}</td>
                    <td>{measurement.capturedAt || '-'}</td>
                    <td>{measurement.capturedByName || measurement.sourceRunId || '-'}</td>
                    <td>
                      <span className={`status-pill ${measurement.status === 'approved' ? 'ok' : 'review'}`}>
                        {measurement.status === 'approved'
                          ? 'Aprobado'
                          : measurement.status === 'rejected'
                          ? 'Rechazado'
                          : measurement.status === 'proposed'
                          ? 'Propuesto'
                          : 'Borrador'}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-secondary"
                          disabled={measurement.status === 'approved' || approveMeasurement.isLoading}
                          onClick={() => approveMeasurement.mutate(measurement.id)}
                        >
                          Aprobar
                        </button>
                        <button
                          className="btn-secondary"
                          disabled={measurement.status === 'rejected' || rejectMeasurement.isLoading}
                          onClick={() => rejectMeasurement.mutate(measurement.id)}
                        >
                          Rechazar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
              {!selectedAssignment && (
                <tr>
                  <td colSpan={6} className="empty-row">Selecciona una asignación para ver mediciones.</td>
                </tr>
              )}
              {selectedAssignment && filteredMeasurements.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="empty-row">No hay mediciones registradas.</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="card-actions">
            <button className="btn-secondary" onClick={handleTemplateDownload}>
              Descargar plantilla
            </button>
            <button
              className="btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Subiendo...' : 'Subir archivo'}
            </button>
            <button className="btn-secondary" onClick={handleAutoFetch}>
              Ejecutar fetch (auto)
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                if (!selectedAssignment) {
                  alert('Selecciona una asignación primero')
                  return
                }
                setShowMeasurementModal(true)
              }}
            >
              Cargar manual
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
        <h3>Validaciones tecnicas</h3>
        <div className="validations-grid">
          <div className="validation-item">
            <div className="validation-title">Tipos de dato</div>
            <div className="validation-desc">Se validan enteros, decimales y fechas esperadas.</div>
          </div>
          <div className="validation-item">
            <div className="validation-title">Nulos</div>
            <div className="validation-desc">Campos obligatorios sin valor son bloqueados.</div>
          </div>
          <div className="validation-item">
            <div className="validation-title">Rangos</div>
            <div className="validation-desc">Limites minimos y maximos por KPI.</div>
          </div>
          <div className="validation-item">
            <div className="validation-title">Duplicados</div>
            <div className="validation-desc">Se evita duplicar claves de fuente + periodo.</div>
          </div>
        </div>
      </div>

      {showMeasurementModal && (
        <div className="modal-overlay" onClick={() => setShowMeasurementModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Cargar medición</h2>
              <button className="close-button" onClick={() => setShowMeasurementModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-meta">
                {selectedAssignmentData
                  ? `${selectedAssignmentData.collaboratorName || `Colaborador #${selectedAssignmentData.collaboratorId}`} · ${selectedAssignmentData.kpiName || `KPI #${selectedAssignmentData.kpiId}`}`
                  : 'Asignación seleccionada'}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="measurement-value">Valor</label>
                  <input
                    id="measurement-value"
                    type="number"
                    step="any"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="Ej: 82.5"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="measurement-mode">Modo</label>
                  <select
                    id="measurement-mode"
                    value={newMode}
                    onChange={(e) => setNewMode(e.target.value as any)}
                  >
                    <option value="manual">Manual</option>
                    <option value="import">Import</option>
                    <option value="auto">Auto</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="measurement-status">Estado</label>
                  <select
                    id="measurement-status"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as any)}
                  >
                    <option value="approved" disabled={!isCurationApproved}>
                      Aprobado
                    </option>
                    <option value="proposed">Propuesto</option>
                    <option value="draft">Borrador</option>
                  </select>
                  {!isCurationApproved && selectedAssignment && (
                    <small className="form-hint">
                      La curaduria no está aprobada. Solo se permite proponer o dejar en borrador.
                    </small>
                  )}
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="measurement-reason">Motivo (override)</label>
                  <input
                    id="measurement-reason"
                    type="text"
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                    placeholder="Razón del override (si aplica)"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="measurement-evidence">Evidencia</label>
                  <input
                    id="measurement-evidence"
                    type="text"
                    value={newEvidence}
                    onChange={(e) => setNewEvidence(e.target.value)}
                    placeholder="Link o adjunto"
                  />
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowMeasurementModal(false)}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={() => createMeasurement.mutate()}
                disabled={!selectedAssignment || !newValue || createMeasurement.isLoading}
              >
                {createMeasurement.isLoading ? 'Guardando...' : 'Guardar medición'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
