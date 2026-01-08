/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useParams } from 'react-router-dom'
import api from '../services/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import ProposeValueModal from '../components/ProposeValueModal'
import ConsistencyAlerts from '../components/ConsistencyAlerts'
import { useAuth } from '../hooks/useAuth'
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
  variation?: number
  weightedResult?: number
  status: 'draft' | 'proposed' | 'approved' | 'closed'
  comments?: string
  kpiName?: string
  kpiDescription?: string
  kpiCriteria?: string
  kpiType?: 'growth' | 'reduction' | 'exact'
  periodName?: string
  periodStatus?: string
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
  const [proposingKPI, setProposingKPI] = useState<CollaboratorKPI | null>(null)

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
      },
      onError: (error: any) => {
        alert(
          error.response?.data?.error ||
            'Error al actualizar el valor. Verifica que el período no esté cerrado.'
        )
      },
    }
  )

  // Obtener período actual (el más reciente abierto)
  const currentPeriod = kpis?.[0]?.periodName || 'No hay período activo'
  const periodStatus = kpis?.[0]?.periodStatus || 'closed'
  const currentPeriodId = kpis?.[0]?.periodId

  // Calcular resultado global
  const totalWeightedResult = kpis?.reduce((sum, kpi) => {
    return sum + (kpi.weightedResult || 0)
  }, 0) || 0

  const totalWeight = kpis?.reduce((sum, kpi) => {
    return sum + kpi.weight
  }, 0) || 0

  const globalResult = totalWeight > 0 ? (totalWeightedResult / totalWeight) * 100 : 0

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

  const handleEditActual = (kpi: CollaboratorKPI) => {
    // Verificar si está cerrado
    if (kpi.status === 'closed' || periodStatus === 'closed') {
      alert('No se puede editar el valor de una parrilla cerrada')
      return
    }
    setEditingKPIId(kpi.id)
    setActualValue(kpi.actual?.toString() || '')
  }

  const handleSaveActual = (kpiId: number) => {
    const value = parseFloat(actualValue)
    if (isNaN(value)) {
      alert('Por favor ingresa un valor numérico válido')
      return
    }
    updateActualMutation.mutate({ id: kpiId, actual: value })
  }

  const handleCancelEdit = () => {
    setEditingKPIId(null)
    setActualValue('')
  }

  const canEdit = (kpi: CollaboratorKPI) => {
    if (isCollaborator) return false
    return kpi.status !== 'closed' && periodStatus !== 'closed'
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
                {kpis.map((kpi) => (
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
                            onChange={(e) => setActualValue(e.target.value)}
                            className="actual-input"
                            autoFocus
                          />
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
                          {canEdit(kpi) && (
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
                      {kpi.variation !== null && kpi.variation !== undefined && !isNaN(Number(kpi.variation))
                        ? `${Number(kpi.variation).toFixed(1)}%`
                        : '-'}
                    </td>
                    <td className="kpi-weight">{kpi.weight}%</td>
                    <td className="kpi-weighted">
                      {kpi.weightedResult !== null &&
                      kpi.weightedResult !== undefined &&
                      !isNaN(Number(kpi.weightedResult))
                        ? `${Number(kpi.weightedResult).toFixed(1)}%`
                        : '-'}
                    </td>
                    <td className="kpi-criteria">
                      {kpi.kpiCriteria || '-'}
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
                        {canEdit(kpi) && (
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
                      </div>
                    </td>
                  </tr>
                ))}
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
          onClose={() => setProposingKPI(null)}
          onSuccess={() => {
            setProposingKPI(null)
          }}
        />
      )}
    </div>
  )
}
