import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useSearchParams } from 'react-router-dom'
import api from '../services/api'
import './Curaduria.css'

type CurationItem = {
  id: number
  assignmentId: number
  kpiName: string
  collaboratorName: string
  collaboratorArea?: string
  periodName: string
  dataSource?: string
  sourceConfig?: string
  criteriaText?: string
  status: 'pending' | 'in_review' | 'approved' | 'rejected'
  comment?: string
  createdAt?: string
  createdByName?: string
}

export default function Curaduria() {
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [periodFilter, setPeriodFilter] = useState<number | ''>('')
  const [kpiFilter, setKpiFilter] = useState<number | ''>('')
  const [collaboratorFilter, setCollaboratorFilter] = useState<number | ''>('')
  const [areaFilter, setAreaFilter] = useState<number | ''>('')
  const [showCriteriaModal, setShowCriteriaModal] = useState(false)
  const [criteriaAssignmentId, setCriteriaAssignmentId] = useState<number | ''>('')
  const [criteriaDataSource, setCriteriaDataSource] = useState('')
  const [criteriaSourceConfig, setCriteriaSourceConfig] = useState('')
  const [criteriaText, setCriteriaText] = useState('')
  const [criteriaEvidenceUrl, setCriteriaEvidenceUrl] = useState('')
  const [criteriaError, setCriteriaError] = useState('')
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const assignmentId = searchParams.get('assignmentId')

  const { data: periods } = useQuery('periods', async () => {
    const response = await api.get('/periods')
    return response.data
  })

  const { data: kpis } = useQuery('kpis', async () => {
    const response = await api.get('/kpis')
    return response.data
  })

  const { data: collaborators } = useQuery('collaborators', async () => {
    const response = await api.get('/collaborators')
    return response.data
  })

  const { data: assignments } = useQuery('curation-assignments', async () => {
    const response = await api.get('/collaborator-kpis')
    return response.data
  })

  const { data: areas } = useQuery('areas', async () => {
    const response = await api.get('/areas')
    return response.data
  })

  const { data: items, isLoading } = useQuery<CurationItem[]>(
    ['curation-items', statusFilter, periodFilter, kpiFilter, collaboratorFilter, areaFilter, assignmentId],
    async () => {
      const response = await api.get('/curation/items', {
        params: {
          status: statusFilter === 'all' ? undefined : statusFilter,
          periodId: periodFilter || undefined,
          kpiId: kpiFilter || undefined,
          collaboratorId: collaboratorFilter || undefined,
          areaId: areaFilter || undefined,
          assignmentId: assignmentId || undefined,
        },
      })
      return response.data
    }
  )

  const reviewMutation = useMutation(
    async ({ id, action, comment }: { id: number; action: 'approve' | 'reject' | 'request'; comment?: string }) => {
      const endpoint =
        action === 'approve'
          ? `/curation/criteria/${id}/approve`
          : action === 'reject'
          ? `/curation/criteria/${id}/reject`
          : `/curation/criteria/${id}/request-changes`
      await api.post(endpoint, { comment })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('curation-items')
      },
    }
  )

  const createCriteria = useMutation(
    async () => {
      if (!criteriaAssignmentId || !criteriaDataSource.trim() || !criteriaText.trim()) {
        setCriteriaError('Completá asignación, fuente y criterio antes de enviar.')
        return
      }
      await api.post(`/curation/assignments/${criteriaAssignmentId}/criteria`, {
        dataSource: criteriaDataSource || undefined,
        sourceConfig: criteriaSourceConfig || undefined,
        criteriaText: criteriaText || undefined,
        evidenceUrl: criteriaEvidenceUrl || undefined,
      })
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('curation-items')
        setShowCriteriaModal(false)
        setCriteriaAssignmentId('')
        setCriteriaDataSource('')
        setCriteriaSourceConfig('')
        setCriteriaText('')
        setCriteriaEvidenceUrl('')
        setCriteriaError('')
      },
    }
  )

  const handleReject = (item: CurationItem) => {
    const comment = window.prompt('Comentario obligatorio para rechazo:')
    if (!comment) return
    reviewMutation.mutate({ id: item.id, action: 'reject', comment })
  }

  const filteredItems = useMemo(() => items || [], [items])

  const selectedAreaName = useMemo(() => {
    if (!areaFilter || !areas) return ''
    const areaMatch = areas.find((area: any) => area.id === areaFilter)
    return areaMatch?.name || ''
  }, [areaFilter, areas])

  // Preseleccionar asignación si llega por query
  useEffect(() => {
    if (assignmentId && !criteriaAssignmentId) {
      setCriteriaAssignmentId(Number(assignmentId))
    }
  }, [assignmentId, criteriaAssignmentId])

  const filteredCollaborators = useMemo(() => {
    if (!collaborators) return []
    if (!selectedAreaName) return collaborators
    return collaborators.filter((collab: any) => collab.area === selectedAreaName)
  }, [collaborators, selectedAreaName])

  const filteredKpis = useMemo(() => {
    if (!kpis) return []
    if (!selectedAreaName) return kpis
    return kpis.filter((kpi: any) => {
      const areas = Array.isArray(kpi.areas) ? kpi.areas : []
      return areas.includes(selectedAreaName)
    })
  }, [kpis, selectedAreaName])

  const filteredAssignments = useMemo(() => {
    if (!assignments) return []
    return assignments.filter((assignment: any) => {
      if (selectedAreaName && assignment.collaboratorArea !== selectedAreaName) return false
      if (periodFilter && assignment.periodId !== periodFilter) return false
      if (kpiFilter && assignment.kpiId !== kpiFilter) return false
      if (collaboratorFilter && assignment.collaboratorId !== collaboratorFilter) return false
      return true
    })
  }, [assignments, selectedAreaName, periodFilter, kpiFilter, collaboratorFilter])

  const tabOptions = [
    { key: 'pending', label: 'Pendientes' },
    { key: 'in_review', label: 'En revision' },
    { key: 'approved', label: 'Aprobadas' },
    { key: 'rejected', label: 'Rechazadas' },
    { key: 'all', label: 'Cambios recientes' },
  ]

  const formatSource = (item: CurationItem) => {
    if (!item.dataSource) return 'Sin fuente'
    return item.sourceConfig ? `${item.dataSource} · ${item.sourceConfig}` : item.dataSource
  }

  const formatMeta = (item: CurationItem) => {
    const by = item.createdByName ? ` · ${item.createdByName}` : ''
    return item.createdAt ? `${item.createdAt}${by}` : '-'
  }

  const exportCsv = () => {
    const headers = [
      'ID',
      'Asignacion',
      'Colaborador',
      'Area',
      'KPI',
      'Periodo',
      'Fuente',
      'Criterio',
      'Estado',
      'Comentario',
      'Creado',
    ]
    const rows = filteredItems.map((item) => [
      item.id,
      item.assignmentId,
      item.collaboratorName,
      item.collaboratorArea || '',
      item.kpiName,
      item.periodName,
      formatSource(item),
      item.criteriaText || '',
      item.status,
      item.comment || '',
      formatMeta(item),
    ])

    const escape = (value: any) => {
      const str = String(value ?? '')
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    const parts = [
      'curaduria',
      selectedAreaName ? `area-${selectedAreaName}` : null,
      periodFilter ? `periodo-${periodFilter}` : null,
      kpiFilter ? `kpi-${kpiFilter}` : null,
      collaboratorFilter ? `colab-${collaboratorFilter}` : null,
      statusFilter ? `status-${statusFilter}` : null,
    ].filter(Boolean)
    link.download = `${parts.join('_')}_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const exportExcel = () => {
    const rows = [
      ['ID', 'Asignacion', 'Colaborador', 'Area', 'KPI', 'Periodo', 'Fuente', 'Criterio', 'Estado', 'Comentario', 'Creado'],
      ...filteredItems.map((item) => [
        item.id,
        item.assignmentId,
        item.collaboratorName,
        item.collaboratorArea || '',
        item.kpiName,
        item.periodName,
        formatSource(item),
        item.criteriaText || '',
        item.status,
        item.comment || '',
        formatMeta(item),
      ]),
    ]

    const xmlEscape = (value: any) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')

    const worksheet = rows
      .map(
        (row) =>
          `<Row>${row
            .map((cell) => `<Cell><Data ss:Type="String">${xmlEscape(cell)}</Data></Cell>`)
            .join('')}</Row>`
      )
      .join('')

    const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Curaduria">
    <Table>${worksheet}</Table>
  </Worksheet>
</Workbook>`

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    const parts = [
      'curaduria',
      selectedAreaName ? `area-${selectedAreaName}` : null,
      periodFilter ? `periodo-${periodFilter}` : null,
      kpiFilter ? `kpi-${kpiFilter}` : null,
      collaboratorFilter ? `colab-${collaboratorFilter}` : null,
      statusFilter ? `status-${statusFilter}` : null,
    ].filter(Boolean)
    link.download = `${parts.join('_')}_${new Date().toISOString().slice(0, 10)}.xls`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="curaduria-page">
      <div className="page-header">
        <div>
          <h1>Curaduria</h1>
          <p className="subtitle">Inbox para aprobar fuentes, criterios y datos.</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={exportCsv}>Exportar CSV</button>
          <button className="btn-secondary" onClick={exportExcel}>Exportar Excel</button>
          <button
            className="btn-primary"
            onClick={() => {
              if (assignmentId) {
                setCriteriaAssignmentId(Number(assignmentId))
              }
              setShowCriteriaModal(true)
            }}
          >
            Nuevo criterio
          </button>
        </div>
      </div>

      <div className="curaduria-tabs">
        {tabOptions.map((tab) => (
          <button
            key={tab.key}
            className={`tab-button ${statusFilter === tab.key ? 'active' : ''}`}
            onClick={() => setStatusFilter(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="curaduria-toolbar">
        <div className="filter-group">
          <label htmlFor="period-filter">Período:</label>
          <select
            id="period-filter"
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value ? Number(e.target.value) : '')}
            className="filter-select"
          >
            <option value="">Todos</option>
            {periods?.map((period: any) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="kpi-filter">KPI:</label>
          <select
            id="kpi-filter"
            value={kpiFilter}
            onChange={(e) => setKpiFilter(e.target.value ? Number(e.target.value) : '')}
            className="filter-select"
          >
            <option value="">Todos</option>
            {filteredKpis?.map((kpi: any, index: number) => (
              <option key={kpi.id || kpi?.name || index} value={kpi.id || ''}>
                {typeof kpi === 'string' ? kpi : kpi.name || kpi.title || `KPI #${kpi.id}`}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="collaborator-filter">Colaborador:</label>
          <select
            id="collaborator-filter"
            value={collaboratorFilter}
            onChange={(e) => setCollaboratorFilter(e.target.value ? Number(e.target.value) : '')}
            className="filter-select"
          >
            <option value="">Todos</option>
            {filteredCollaborators?.map((collaborator: any) => (
              <option key={collaborator.id} value={collaborator.id}>
                {collaborator.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="area-filter">Área:</label>
          <select
            id="area-filter"
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value ? Number(e.target.value) : '')}
            className="filter-select"
          >
            <option value="">Todas</option>
            {areas?.map((area: any) => (
              <option key={area.id || area.name} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </div>
        <div className="curaduria-hint">
          El KPI visible solo usa datos aprobados.
        </div>
      </div>

      <div className="card">
        <table className="curaduria-table">
          <thead>
            <tr>
              <th>Colaborador</th>
              <th>KPI</th>
              <th>Período</th>
              <th>Fuente</th>
              <th>Criterio</th>
              <th>Estado</th>
              <th>Actualización</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="empty-row">Cargando bandeja...</td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.collaboratorName}</td>
                  <td>{item.kpiName}</td>
                  <td>{item.periodName}</td>
                  <td title={item.sourceConfig || ''}>{formatSource(item)}</td>
                  <td className="criteria-cell" title={item.criteriaText || ''}>
                    {item.criteriaText || '-'}
                  </td>
                  <td>
                    <span className={`status-pill ${item.status === 'approved' ? 'ok' : 'review'}`}>
                      {item.status === 'pending'
                        ? 'Pendiente'
                        : item.status === 'in_review'
                        ? 'En revision'
                        : item.status === 'approved'
                        ? 'Aprobado'
                        : 'Rechazado'}
                    </span>
                    {item.comment ? <div className="comment">{item.comment}</div> : null}
                  </td>
                  <td>{formatMeta(item)}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn-approve-small"
                        onClick={() => reviewMutation.mutate({ id: item.id, action: 'approve' })}
                        disabled={item.status === 'approved'}
                      >
                        Aprobar
                      </button>
                      <button
                        className="btn-reject-small"
                        onClick={() => handleReject(item)}
                        disabled={item.status === 'rejected'}
                      >
                        Rechazar
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() =>
                          reviewMutation.mutate({
                            id: item.id,
                            action: 'request',
                            comment: window.prompt('Comentario para ajustes:') || undefined,
                          })
                        }
                        disabled={item.status === 'in_review'}
                      >
                        Pedir cambios
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-row">
                  No hay items para curar con este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showCriteriaModal && (
        <div className="modal-overlay" onClick={() => setShowCriteriaModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Nuevo criterio</h2>
              <button className="close-button" onClick={() => setShowCriteriaModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="criteria-assignment">Asignación</label>
                <select
                  id="criteria-assignment"
                  value={criteriaAssignmentId}
                  onChange={(e) => setCriteriaAssignmentId(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">Selecciona una asignación</option>
                  {filteredAssignments?.map((assignment: any) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.collaboratorName || `Colaborador #${assignment.collaboratorId}`} ·{' '}
                      {assignment.kpiName || `KPI #${assignment.kpiId}`} ·{' '}
                      {assignment.periodName || `Período #${assignment.periodId}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="criteria-source">Fuente</label>
                  <input
                    id="criteria-source"
                    type="text"
                    value={criteriaDataSource}
                    onChange={(e) => {
                      setCriteriaDataSource(e.target.value)
                      setCriteriaError('')
                    }}
                    placeholder="Jira, DB, Manual, etc."
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="criteria-config">Query / Endpoint</label>
                  <input
                    id="criteria-config"
                    type="text"
                    value={criteriaSourceConfig}
                    onChange={(e) => setCriteriaSourceConfig(e.target.value)}
                    placeholder="JQL / SQL / URL"
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="criteria-text">Criterio</label>
                <textarea
                  id="criteria-text"
                  value={criteriaText}
                  onChange={(e) => {
                    setCriteriaText(e.target.value)
                    setCriteriaError('')
                  }}
                  rows={4}
                  placeholder="Describe el criterio de cálculo"
                />
              </div>
              <div className="form-group">
                <label htmlFor="criteria-evidence">Evidencia (opcional)</label>
                <input
                  id="criteria-evidence"
                  type="text"
                  value={criteriaEvidenceUrl}
                  onChange={(e) => setCriteriaEvidenceUrl(e.target.value)}
                  placeholder="Link o adjunto"
                />
              </div>
              {criteriaError ? <div className="form-error">{criteriaError}</div> : null}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowCriteriaModal(false)}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={() => createCriteria.mutate()}
                disabled={
                  !criteriaAssignmentId ||
                  !criteriaDataSource.trim() ||
                  !criteriaText.trim() ||
                  createCriteria.isLoading
                }
              >
                {createCriteria.isLoading ? 'Enviando...' : 'Enviar a curaduría'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
