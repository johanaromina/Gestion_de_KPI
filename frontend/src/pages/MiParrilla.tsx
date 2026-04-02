/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useParams } from 'react-router-dom'
import api from '../services/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import ProposeValueModal from '../components/ProposeValueModal'
import ConsistencyAlerts from '../components/ConsistencyAlerts'
import { useAuth } from '../hooks/useAuth'
import { calculateVariationPercent, calculateWeightedImpact, resolveDirection } from '../utils/kpi'
import './MiParrilla.css'

interface CollaboratorKPI {
  id: number
  collaboratorId: number
  kpiId: number
  periodId: number
  subPeriodId?: number
  target: number
  actual?: number
  weight: number
  subPeriodWeight?: number | null
  variation?: number
  weightedResult?: number
  status: 'draft' | 'proposed' | 'approved' | 'closed'
  comments?: string
  kpiName?: string
  kpiDescription?: string
  kpiCriteria?: string
  criteriaText?: string
  kpiType?: string
  kpiDirection?: 'growth' | 'reduction' | 'exact'
  periodName?: string
  periodStatus?: string
  curationStatus?: 'pending' | 'in_review' | 'approved' | 'rejected'
  dataSourceName?: string
  dataSource?: string
  sourceConfig?: string
  inputMode?: 'manual' | 'import' | 'auto'
  lastMeasurementAt?: string
  lastMeasurementBy?: string
}

export default function MiParrilla() {
  const { collaboratorId } = useParams<{ collaboratorId: string }>()
  const { user, isLoading: loadingUser, isCollaborator } = useAuth()
  const resolvedId = useMemo(() => {
    if (collaboratorId) return collaboratorId
    if (user?.collaboratorId) return String(user.collaboratorId)
    return ''
  }, [collaboratorId, user?.collaboratorId])
  const resolvedIdNumber = resolvedId ? parseInt(resolvedId, 10) : null
  const [editingKPIId, setEditingKPIId] = useState<number | null>(null)
  const [actualValue, setActualValue] = useState<string>('')
  const [actualValueError, setActualValueError] = useState<string>('')
  const [proposingKPI, setProposingKPI] = useState<CollaboratorKPI | null>(null)
  const [inlineAlert, setInlineAlert] = useState<{ type: 'info' | 'warning' | 'error'; message: string } | null>(null)

  const queryClient = useQueryClient()

  const { data: collaborator, isLoading: loadingCollaborator } = useQuery(
    ['collaborator', resolvedId],
    async () => {
      const response = await api.get(`/collaborators/${resolvedId}`)
      return response.data
    },
    {
      enabled: !!resolvedId,
    }
  )

  const { data: kpis, isLoading: loadingKPIs } = useQuery<CollaboratorKPI[]>(
    ['collaborator-kpis', resolvedId],
    async () => {
      const response = await api.get(`/collaborator-kpis/collaborator/${resolvedId}`)
      return response.data
    },
    {
      enabled: !!resolvedId,
    }
  )

  const updateActualMutation = useMutation(
    async ({ id, actual }: { id: number; actual: number }) => {
      const response = await api.patch(`/collaborator-kpis/${id}/actual`, {
        actual,
      })
      return response.data
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['collaborator-kpis', resolvedId])
        setEditingKPIId(null)
        setActualValue('')
        setActualValueError('')
        setInlineAlert({ type: 'info', message: 'Valor actualizado correctamente.' })
      },
      onError: (error: any) => {
        setInlineAlert({
          type: 'error',
          message: error.response?.data?.error || 'Error al actualizar el valor. Verificá que el período no esté cerrado.',
        })
      },
    }
  )

  // Obtener período actual (el más reciente abierto)
  const currentPeriod = kpis?.[0]?.periodName || 'No hay período activo'
  const periodStatus = kpis?.[0]?.periodStatus || 'closed'
  const currentPeriodId = kpis?.[0]?.periodId

  // Calcular resultado global
  const summaryForGlobal = useMemo(() => {
    if (!kpis || kpis.length === 0) return []
    const hasSubPeriods = kpis.some((kpi) => kpi.subPeriodId !== null && kpi.subPeriodId !== undefined)
    if (hasSubPeriods) {
      return kpis.filter((kpi) => kpi.subPeriodId !== null && kpi.subPeriodId !== undefined)
    }
    const summary = kpis.filter((kpi) => kpi.subPeriodId === null || kpi.subPeriodId === undefined)
    return summary.length > 0 ? summary : kpis
  }, [kpis])

  const totalWeightedImpact =
    summaryForGlobal?.reduce((sum, kpi) => {
      const direction = resolveDirection((kpi as any).assignmentDirection, kpi.kpiDirection, kpi.kpiType)
      const variation =
        kpi.variation ?? calculateVariationPercent(direction, kpi.target, kpi.actual ?? null)
      const impact = calculateWeightedImpact(variation, kpi.weight, kpi.subPeriodWeight)
      return sum + (impact || 0)
    }, 0) || 0

  const globalResult = totalWeightedImpact

  // Datos para gráfico
  const chartData =
    kpis?.map((kpi) => {
      const variationValue =
        kpi.variation !== null && kpi.variation !== undefined && !isNaN(Number(kpi.variation))
          ? Number(kpi.variation)
          : 0
      return {
        name: kpi.kpiName || `KPI ${kpi.kpiId}`,
        target: kpi.target,
        actual: kpi.actual || 0,
        variation: variationValue,
      }
    }) || []

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      open: { label: 'Abierta', class: 'status-open' },
      in_review: { label: 'En Revisión', class: 'status-review' },
      closed: { label: 'Cerrada', class: 'status-closed' },
    }
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.closed
    return (
      <span className={`status-badge ${config.class}`}>
        {config.label}
      </span>
    )
  }

  const getCurationBadge = (status?: CollaboratorKPI['curationStatus']) => {
    const effective = status || 'pending'
    const config = {
      pending: { label: 'Pendiente', class: 'curation-pending' },
      in_review: { label: 'En revision', class: 'curation-review' },
      approved: { label: 'Aprobada', class: 'curation-approved' },
      rejected: { label: 'Rechazada', class: 'curation-rejected' },
    } as const
    const entry = config[effective]
    return <span className={`curation-badge ${entry.class}`}>{entry.label}</span>
  }

  const getInputLabel = (mode?: CollaboratorKPI['inputMode']) => {
    const normalized = mode || 'manual'
    return normalized === 'auto' ? 'Auto' : normalized === 'import' ? 'Import' : 'Manual'
  }

  const getBlockReason = (kpi: CollaboratorKPI): string | null => {
    if (kpi.status === 'closed') return 'KPI cerrado'
    if (periodStatus === 'closed') return 'Período cerrado'
    if (kpi.inputMode === 'auto') return 'Carga automática — usá Proponer para override'
    if (kpi.curationStatus !== 'approved') return 'Criterio pendiente de aprobación'
    if (isCollaborator) return 'Usá el botón Proponer para sugerir un valor'
    return null
  }

  const handleEditActual = (kpi: CollaboratorKPI) => {
    setEditingKPIId(kpi.id)
    setActualValue(kpi.actual?.toString() || '')
    setActualValueError('')
  }

  const handleSaveActual = (kpiId: number) => {
    const value = parseFloat(actualValue)
    if (isNaN(value)) {
      setActualValueError('Ingresá un valor numérico válido.')
      return
    }
    setActualValueError('')
    updateActualMutation.mutate({ id: kpiId, actual: value })
  }

  const handleCancelEdit = () => {
    setEditingKPIId(null)
    setActualValue('')
  }

  const canEditInline = (kpi: CollaboratorKPI) => {
    if (isCollaborator) return false
    if (kpi.status === 'closed' || periodStatus === 'closed') return false
    if (kpi.curationStatus !== 'approved') return false
    if (kpi.inputMode === 'auto') return false
    return true
  }

  const canProposeValue = (kpi: CollaboratorKPI) => {
    if (kpi.status !== 'draft') return false
    if (periodStatus === 'closed') return false
    return true
  }

  if (loadingUser || loadingCollaborator || loadingKPIs) {
    return (
      <div className="mi-parrilla-page">
        <div className="loading">Cargando parrilla de objetivos...</div>
      </div>
    )
  }

  if (!resolvedId) {
    return (
      <div className="mi-parrilla-page">
        <div className="empty-state">
          <div className="empty-icon">:/</div>
          <h3>No se pudo identificar al colaborador</h3>
          <p>Vuelve a iniciar sesión para cargar tu parrilla.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mi-parrilla-page">
      {inlineAlert && (
        <div className={`parrilla-alert parrilla-alert-${inlineAlert.type}`}>
          {inlineAlert.message}
          <button onClick={() => setInlineAlert(null)} className="parrilla-alert-close">×</button>
        </div>
      )}
      <div className="parrilla-header">
        <div>
          <h1>Mi Parrilla de Objetivos</h1>
          {collaborator && (
            <div className="collaborator-info">
              <p className="collaborator-name">{collaborator.name}</p>
              <p className="collaborator-details">
                {collaborator.position} • {collaborator.area}
              </p>
            </div>
          )}
        </div>
        <div className="period-info">
          <div>
            <span className="period-label">Período:</span>
            <span className="period-name">{currentPeriod}</span>
          </div>
          <div className="period-status">
            {getStatusBadge(periodStatus)}
          </div>
        </div>
        {currentPeriodId && (
          <div className="export-buttons">
            <button
              className="btn-export btn-export-pdf"
              onClick={() => {
                window.open(
                  `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/export/parrilla/${resolvedId}/${currentPeriodId}/pdf`,
                  '_blank'
                )
              }}
              title="Exportar a PDF"
            >
              📄 PDF
            </button>
            <button
              className="btn-export btn-export-excel"
              onClick={() => {
                window.open(
                  `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/export/parrilla/${resolvedId}/${currentPeriodId}/excel`,
                  '_blank'
                )
              }}
              title="Exportar a Excel"
            >
              📊 Excel
            </button>
          </div>
        )}
      </div>

      {resolvedIdNumber && currentPeriodId && (
        <ConsistencyAlerts collaboratorId={resolvedIdNumber} periodId={currentPeriodId} />
      )}

      <div className="global-result-card">
        <div className="result-content">
          <h2>Resultado Global del Período</h2>
          <div className="result-value">
            <span className="result-number">{globalResult.toFixed(1)}%</span>
            <div className="result-bar">
              <div
                className="result-fill"
                style={{ width: `${Math.min(globalResult, 100)}%` }}
              />
            </div>
          </div>
          <p className="result-description">
            Promedio ponderado de todos los KPIs asignados
          </p>
        </div>
      </div>

      <div className="kpis-section">
        <h2>Lista de KPIs</h2>
        {kpis && kpis.length > 0 ? (
          <div className="kpis-table-container">
            <table className="kpis-table">
              <thead>
                <tr>
                  <th>KPI</th>
                  <th>Descripción</th>
                  <th>Target</th>
                  <th>Alcance</th>
                  <th>Variación</th>
                  <th>Ponderación</th>
                  <th>Alcance Ponderado</th>
                  <th>Criterio</th>
                  <th>Estado</th>
                  <th>Comentarios</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {kpis.map((kpi) => {
                  const direction = resolveDirection(
                    (kpi as any).assignmentDirection,
                    kpi.kpiDirection,
                    kpi.kpiType
                  )
                  const variation =
                    kpi.variation ?? calculateVariationPercent(direction, kpi.target, kpi.actual ?? null)
                  const weightedImpact = calculateWeightedImpact(variation, kpi.weight, kpi.subPeriodWeight)
                  return (
                  <tr key={kpi.id}>
                    <td className="kpi-name">{kpi.kpiName || `KPI ${kpi.kpiId}`}</td>
                    <td className="kpi-description">
                      {kpi.kpiDescription || '-'}
                    </td>
                    <td className="kpi-target">{kpi.target}</td>
                    <td className="kpi-actual">
                      {editingKPIId === kpi.id ? (
                        <div className="edit-actual-container">
                          <input
                            type="number"
                            step="any"
                            value={actualValue}
                            onChange={(e) => { setActualValue(e.target.value); setActualValueError('') }}
                            className={`actual-input${actualValueError ? ' actual-input-error' : ''}`}
                            autoFocus
                          />
                          {actualValueError && (
                            <span className="actual-value-error">{actualValueError}</span>
                          )}
                          <div className="edit-actions">
                            <button
                              className="btn-save-small"
                              onClick={() => handleSaveActual(kpi.id)}
                              disabled={updateActualMutation.isLoading}
                            >
                              ✓
                            </button>
                            <button
                              className="btn-cancel-small"
                              onClick={handleCancelEdit}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="actual-value-container">
                          <span>
                            {kpi.actual !== null && kpi.actual !== undefined
                              ? kpi.actual
                              : '-'}
                          </span>
                          {canEditInline(kpi) && (
                            <button
                              className="btn-edit-actual"
                              onClick={() => handleEditActual(kpi)}
                              title="Editar alcance"
                            >
                              ✏️
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="kpi-variation">
                      {variation !== null && variation !== undefined && !isNaN(Number(variation))
                        ? `${Number(variation).toFixed(1)}%`
                        : '-'}
                    </td>
                    <td className="kpi-weight">{kpi.weight}%</td>
                    <td className="kpi-weighted">
                      {weightedImpact !== null &&
                      weightedImpact !== undefined &&
                      !isNaN(Number(weightedImpact))
                        ? `${Number(weightedImpact).toFixed(1)}%`
                        : '-'}
                    </td>
                    <td className="kpi-criteria">
                      <div className="criteria-text">{kpi.criteriaText || kpi.kpiCriteria || '-'}</div>
                      <div className="criteria-meta">
                        {getCurationBadge(kpi.curationStatus)}
                        <span className="criteria-source">
                          {kpi.dataSourceName || kpi.dataSource || 'Sin fuente'}
                        </span>
                        <span className="criteria-input">
                          Input: {getInputLabel(kpi.inputMode)}
                        </span>
                        <span className="criteria-update">
                          Último dato:{' '}
                          {kpi.lastMeasurementAt
                            ? `${kpi.lastMeasurementAt}${kpi.lastMeasurementBy ? ` · ${kpi.lastMeasurementBy}` : ''}`
                            : '-'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`kpi-status kpi-status-${kpi.status}`}
                      >
                        {kpi.status === 'draft' && 'Borrador'}
                        {kpi.status === 'proposed' && 'Propuesto'}
                        {kpi.status === 'approved' && 'Aprobado'}
                        {kpi.status === 'closed' && 'Cerrado'}
                      </span>
                    </td>
                    <td className="kpi-comments">
                      {kpi.comments ? (
                        <span className="comments-text" title={kpi.comments}>
                          {kpi.comments.length > 50
                            ? `${kpi.comments.substring(0, 50)}...`
                            : kpi.comments}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      <div className="kpi-actions">
                        {canProposeValue(kpi) && (
                          <>
                            {kpi.status === 'draft' && (
                              <button
                                className="btn-propose"
                                onClick={() => setProposingKPI(kpi)}
                                title="Proponer valores para revisión"
                              >
                                📤 Proponer
                              </button>
                            )}
                            {kpi.status === 'proposed' && (
                              <span className="pending-badge">
                                ⏳ En revisión
                              </span>
                            )}
                          </>
                        )}
                        {!canEditInline(kpi) && !canProposeValue(kpi) && (() => {
                          const reason = getBlockReason(kpi)
                          return reason ? (
                            <span className="block-reason" title={reason}>
                              {reason}
                            </span>
                          ) : null
                        })()}
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <h3>No hay KPIs asignados</h3>
            <p>No tienes KPIs asignados para este período</p>
          </div>
        )}
      </div>

      {chartData.length > 0 && (
        <div className="chart-section">
          <h2>Gráfico de Resultados</h2>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis />
                <Tooltip />
                <Bar dataKey="target" fill="#e5e7eb" name="Target" />
                <Bar dataKey="actual" fill="#f97316" name="Actual" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {proposingKPI && (
        <ProposeValueModal
          assignment={proposingKPI}
          requiresReason={proposingKPI.inputMode === 'auto' || proposingKPI.curationStatus !== 'approved'}
          evidenceEnabled
          onClose={() => setProposingKPI(null)}
          onSuccess={() => {
            setProposingKPI(null)
          }}
        />
      )}
    </div>
  )
}
