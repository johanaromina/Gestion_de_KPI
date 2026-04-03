/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { Period, ScopeKPI, SubPeriod } from '../types'
import ScopeKPIDetailModal from '../components/ScopeKPIDetailModal'
import { exportExecutivePDF, ExportArea } from '../utils/exportExecutivePDF'
import './TableroEjecutivo.css'

type ExecutiveSummary = {
  totalScopeKpis: number
  approvedScopeKpis: number
  completionRate: number
  averageVariation?: number | null
  weightedResultTotal: number
  sourceModeBreakdown: {
    direct: number
    aggregated: number
    mixed: number
  }
  objectiveCount: number
  childCount: number
}

type ExecutiveTreeNode = {
  scope: {
    id: number
    name: string
    type: 'company' | 'business_unit' | 'area' | 'team'
    parentId?: number | null
  }
  summary: ExecutiveSummary
  objectives: string[]
  scopeKpis: ScopeKPI[]
  children: ExecutiveTreeNode[]
}

type ExecutiveTreeResponse = {
  periodId: number | null
  periodName?: string | null
  subPeriodId: number | null
  subPeriodName?: string | null
  requestedCompanyScopeId?: number | null
  companies: ExecutiveTreeNode[]
}

type ExecutiveNodeRollup = {
  ownScopeKpis: ScopeKPI[]
  descendantScopeKpis: ScopeKPI[]
  allScopeKpis: ScopeKPI[]
  descendantNodes: ExecutiveTreeNode[]
  objectiveNames: string[]
  weightedResultTotal: number
  ownWeightedResult: number
  averageVariation: number | null
  completionRate: number
  teamCount: number
  areaCount: number
  businessUnitCount: number
}

type ExecutiveTrendPoint = {
  periodId?: number | null
  periodName?: string | null
  subPeriodId?: number | null
  subPeriodName?: string | null
  totalScopeKpis: number
  weightedResultTotal: number
  averageVariation: number | null
  completionRate: number
}

type ExecutiveTrendsResponse = {
  scope?: {
    id: number
    name: string
    type: ExecutiveTreeNode['scope']['type']
  } | null
  periodId: number | null
  periodName?: string | null
  objectiveName?: string | null
  periodSeries: ExecutiveTrendPoint[]
  subPeriodSeries: ExecutiveTrendPoint[]
}

const formatNumber = (value?: number | null, digits = 2) =>
  value == null ? '-' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(value)

const uniqueStrings = (values: string[]) => Array.from(new Set(values.filter(Boolean)))

const toFinite = (value?: number | null) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const average = (values: number[]) => {
  if (!values.length) return null
  return Number((values.reduce((acc, value) => acc + value, 0) / values.length).toFixed(2))
}

const sum = (values: number[]) => Number(values.reduce((acc, value) => acc + value, 0).toFixed(2))

const semaphoreClass = (variation: number | null | undefined): string => {
  if (variation == null) return ''
  if (variation >= 100) return 'semaphore-green'
  if (variation >= 80) return 'semaphore-yellow'
  return 'semaphore-red'
}

const calcDelta = (current?: number | null, previous?: number | null): number | null => {
  if (current == null || previous == null || previous === 0) return null
  return Number(((current - previous) / Math.abs(previous) * 100).toFixed(1))
}

const deltaArrow = (delta: number | null): string => {
  if (delta == null) return ''
  return delta > 0 ? '↑' : delta < 0 ? '↓' : '→'
}

const deltaClass = (delta: number | null): string => {
  if (delta == null) return ''
  return delta > 0 ? 'delta-positive' : delta < 0 ? 'delta-negative' : 'delta-neutral'
}

// Simple linear projection: extrapolate from the values array to targetIndex
const linearProject = (values: number[], targetIndex: number): number | null => {
  if (values.length === 0) return null
  if (values.length === 1) return values[0]
  const slope = (values[values.length - 1] - values[0]) / (values.length - 1)
  const projected = values[values.length - 1] + slope * (targetIndex - values.length + 1)
  return Math.round(projected * 10) / 10
}

const projectionRiskClass = (value: number | null): string => {
  if (value == null) return ''
  if (value >= 100) return 'projection-ok'
  if (value >= 80) return 'projection-warning'
  return 'projection-danger'
}

const projectionRiskLabel = (value: number | null): string => {
  if (value == null) return 'Sin datos'
  if (value >= 100) return 'En track'
  if (value >= 80) return 'Atención'
  return 'En riesgo'
}

const sortScopeKpis = (scopeKpis: ScopeKPI[]) =>
  scopeKpis
    .slice()
    .sort(
      (a, b) =>
        Number(b.weightedResult || 0) - Number(a.weightedResult || 0) ||
        Number(b.variation || 0) - Number(a.variation || 0) ||
        a.name.localeCompare(b.name)
    )

const scopeKpiMatchesObjective = (scopeKpi: ScopeKPI, objectiveName: string | null) =>
  !objectiveName || (scopeKpi.objectiveNames || []).includes(objectiveName)

const nodeOwnScopeKpis = (node: ExecutiveTreeNode, objectiveName: string | null) =>
  sortScopeKpis(node.scopeKpis.filter((scopeKpi) => scopeKpiMatchesObjective(scopeKpi, objectiveName)))

const nodeMatchesObjective = (node: ExecutiveTreeNode, objectiveName: string | null): boolean => {
  if (!objectiveName) return true
  if (node.objectives.includes(objectiveName)) return true
  if (node.scopeKpis.some((scopeKpi) => scopeKpiMatchesObjective(scopeKpi, objectiveName))) return true
  return node.children.some((child) => nodeMatchesObjective(child, objectiveName))
}

const collectDescendantNodes = (node: ExecutiveTreeNode, objectiveName: string | null): ExecutiveTreeNode[] =>
  node.children.flatMap((child) =>
    nodeMatchesObjective(child, objectiveName) ? [child, ...collectDescendantNodes(child, objectiveName)] : []
  )

const buildNodeRollup = (node: ExecutiveTreeNode, objectiveName: string | null): ExecutiveNodeRollup => {
  const ownScopeKpis = nodeOwnScopeKpis(node, objectiveName)
  const descendantNodes = collectDescendantNodes(node, objectiveName)
  const descendantScopeKpis = sortScopeKpis(
    descendantNodes.flatMap((child) => nodeOwnScopeKpis(child, objectiveName))
  )
  const allScopeKpis = [...ownScopeKpis, ...descendantScopeKpis]
  const variations = allScopeKpis
    .map((scopeKpi) => toFinite(scopeKpi.variation))
    .filter((value): value is number => value !== null)
  const weightedResults = allScopeKpis
    .map((scopeKpi) => toFinite(scopeKpi.weightedResult))
    .filter((value): value is number => value !== null)
  const ownWeightedResults = ownScopeKpis
    .map((scopeKpi) => toFinite(scopeKpi.weightedResult))
    .filter((value): value is number => value !== null)
  const completionCount = allScopeKpis.filter((scopeKpi) => toFinite(scopeKpi.actual) !== null).length

  return {
    ownScopeKpis,
    descendantScopeKpis,
    allScopeKpis,
    descendantNodes,
    objectiveNames: uniqueStrings([
      ...node.objectives,
      ...descendantNodes.flatMap((child) => child.objectives),
      ...allScopeKpis.flatMap((scopeKpi) => scopeKpi.objectiveNames || []),
    ]),
    weightedResultTotal: sum(weightedResults),
    ownWeightedResult: sum(ownWeightedResults),
    averageVariation: average(variations),
    completionRate: allScopeKpis.length ? Number(((completionCount / allScopeKpis.length) * 100).toFixed(2)) : 0,
    teamCount: descendantNodes.filter((child) => child.scope.type === 'team').length,
    areaCount: descendantNodes.filter((child) => child.scope.type === 'area').length,
    businessUnitCount: descendantNodes.filter((child) => child.scope.type === 'business_unit').length,
  }
}

const ExecutiveKpiCard = ({
  scopeKpi,
  onOpenDetail,
}: {
  scopeKpi: ScopeKPI
  onOpenDetail: (scopeKpi: ScopeKPI) => void
}) => (
  <article className="executive-kpi-card">
    <div className="executive-kpi-header">
      <div>
        <h4>{scopeKpi.name}</h4>
        <p>
          {scopeKpi.kpiName || 'KPI'} · {scopeKpi.sourceMode}
        </p>
      </div>
      <div className="executive-kpi-header-right">
        <span className={`executive-semaphore-badge ${semaphoreClass(scopeKpi.variation)}`}>{formatNumber(scopeKpi.variation, 1)}%</span>
        <button type="button" className="link-button" onClick={() => onOpenDetail(scopeKpi)}>
          Ver detalle
        </button>
      </div>
    </div>
    <div className="executive-kpi-metrics">
      <div>
        <span>Actual</span>
        <strong>{formatNumber(scopeKpi.actual)}</strong>
      </div>
      <div>
        <span>Target</span>
        <strong>{formatNumber(scopeKpi.target)}</strong>
      </div>
      <div>
        <span>Resultado</span>
        <strong>{formatNumber(scopeKpi.weightedResult)}</strong>
      </div>
    </div>
    {scopeKpi.objectiveNames?.length ? (
      <div className="executive-tag-row">
        {scopeKpi.objectiveNames.slice(0, 3).map((objective) => (
          <span key={`scope-kpi-objective-${scopeKpi.id}-${objective}`} className="executive-tag">
            {objective}
          </span>
        ))}
      </div>
    ) : null}
    {scopeKpi.sourceMode === 'mixed' ? (
      <div className="executive-kpi-mix">
        <span>
          {scopeKpi.mixedConfig?.directLabel || 'Directo'}: {formatNumber(scopeKpi.directActual)}
        </span>
        <span>
          {scopeKpi.mixedConfig?.aggregatedLabel || 'Agregado'}: {formatNumber(scopeKpi.aggregatedActual)}
        </span>
      </div>
    ) : null}
  </article>
)

const ExecutiveNodeCard = ({
  node,
  objectiveFilter,
  selected,
  onSelect,
  onOpenDetail,
}: {
  node: ExecutiveTreeNode
  objectiveFilter: string | null
  selected: boolean
  onSelect: () => void
  onOpenDetail: (scopeKpi: ScopeKPI) => void
}) => {
  const rollup = useMemo(() => buildNodeRollup(node, objectiveFilter), [node, objectiveFilter])
  const topKpis = rollup.ownScopeKpis.slice(0, 3)

  return (
    <article className={`executive-node-card ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="executive-node-header">
        <div>
          <h3>{node.scope.name}</h3>
          <p>
            {node.scope.type} · {rollup.allScopeKpis.length} KPIs visibles
          </p>
        </div>
        <span className={`executive-node-badge ${semaphoreClass(rollup.averageVariation)}`}>{formatNumber(rollup.averageVariation, 1)}%</span>
      </div>

      <div className="executive-node-stats">
        <div>
          <span>Resultado</span>
          <strong>{formatNumber(rollup.weightedResultTotal)}</strong>
        </div>
        <div>
          <span>Propios</span>
          <strong>{rollup.ownScopeKpis.length}</strong>
        </div>
        <div>
          <span>Desc.</span>
          <strong>{rollup.descendantScopeKpis.length}</strong>
        </div>
      </div>

      {rollup.objectiveNames.length ? (
        <div className="executive-tag-row">
          {rollup.objectiveNames.slice(0, 3).map((objective) => (
            <span key={`${node.scope.id}-${objective}`} className="executive-tag">
              {objective}
            </span>
          ))}
        </div>
      ) : null}

      {topKpis.length ? (
        <div className="executive-node-kpis">
          {topKpis.map((scopeKpi) => (
            <button
              type="button"
              key={`node-kpi-${scopeKpi.id}`}
              className="executive-mini-kpi"
              onClick={(event) => {
                event.stopPropagation()
                onOpenDetail(scopeKpi)
              }}
            >
              <span>{scopeKpi.name}</span>
              <strong>{formatNumber(scopeKpi.weightedResult)}</strong>
            </button>
          ))}
        </div>
      ) : (
        <div className="executive-empty compact">Sin KPIs Grupales propios bajo este lente.</div>
      )}
    </article>
  )
}

const ExecutiveTrendCard = ({
  title,
  subtitle,
  points,
  getLabel,
  isCurrent,
}: {
  title: string
  subtitle: string
  points: ExecutiveTrendPoint[]
  getLabel: (point: ExecutiveTrendPoint) => string
  isCurrent?: (point: ExecutiveTrendPoint) => boolean
}) => {
  const maxWeightedResult = Math.max(...points.map((point) => Math.max(point.weightedResultTotal, 0)), 0)

  return (
    <article className="executive-trend-card">
      <div className="executive-section-header">
        <h3>{title}</h3>
        <span>{subtitle}</span>
      </div>
      {points.length ? (
        <div className="executive-trend-list">
          {points.map((point, index) => {
            const width = maxWeightedResult > 0 ? `${Math.max((point.weightedResultTotal / maxWeightedResult) * 100, 6)}%` : '6%'
            return (
              <div
                key={`${title}-${getLabel(point)}-${index}`}
                className={`executive-trend-row ${isCurrent?.(point) ? 'current' : ''}`}
              >
                <div className="executive-trend-heading">
                  <strong>{getLabel(point)}</strong>
                  <span>{point.totalScopeKpis} KPIs</span>
                </div>
                <div className="executive-trend-bar">
                  <div className="executive-trend-fill" style={{ width }} />
                </div>
                <div className="executive-trend-metrics">
                  <span>Resultado {formatNumber(point.weightedResultTotal)}</span>
                  <span>Cobertura {formatNumber(point.completionRate, 0)}%</span>
                  <span className={semaphoreClass(point.averageVariation)}>Variación {formatNumber(point.averageVariation, 1)}%</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="executive-empty compact">No hay puntos para construir esta tendencia.</div>
      )}
    </article>
  )
}

const PeriodComparePanel = ({
  periodSeries,
}: {
  periodSeries: ExecutiveTrendPoint[]
  currentPeriodId?: number | null
}) => {
  const slice = periodSeries.slice(-3)
  if (slice.length < 2) return null

  const current = slice[slice.length - 1]
  const previous = slice.length >= 2 ? slice[slice.length - 2] : null
  const twoBack = slice.length >= 3 ? slice[slice.length - 3] : null

  const compareCols = [
    twoBack ? { point: twoBack, label: twoBack.periodName || 'Período -2', isCurrent: false } : null,
    previous ? { point: previous, label: previous.periodName || 'Período anterior', isCurrent: false } : null,
    { point: current, label: current.periodName || 'Período actual', isCurrent: true },
  ].filter(Boolean) as Array<{ point: ExecutiveTrendPoint; label: string; isCurrent: boolean }>

  return (
    <article className="executive-compare-panel">
      <div className="executive-section-header">
        <h3>Comparativa entre períodos</h3>
        <span>Evolución de variación y resultado — últimos {slice.length} períodos</span>
      </div>
      <div className="executive-compare-grid">
        {compareCols.map(({ point, label, isCurrent }, i) => {
          const prevPoint = i > 0 ? compareCols[i - 1].point : null
          const delta = calcDelta(point.averageVariation, prevPoint?.averageVariation)
          const deltaResult = calcDelta(point.weightedResultTotal, prevPoint?.weightedResultTotal)
          return (
            <div key={`compare-${point.periodId || i}`} className={`executive-compare-col${isCurrent ? ' current' : ''}${i === 0 && !isCurrent ? ' older' : ''}`}>
              <div className="executive-compare-label">
                {label}
                {isCurrent && <span className="executive-compare-badge">Actual</span>}
              </div>
              <div className={`executive-compare-value ${semaphoreClass(point.averageVariation)}`}>
                {formatNumber(point.averageVariation, 1)}%
              </div>
              <div className="executive-compare-sub">
                <span>Resultado: <strong>{formatNumber(point.weightedResultTotal)}</strong></span>
                <span>KPIs: <strong>{point.totalScopeKpis}</strong></span>
                <span>Cobertura: <strong>{formatNumber(point.completionRate, 0)}%</strong></span>
              </div>
              {delta != null && (
                <div className={`executive-compare-delta ${deltaClass(delta)}`}>
                  {deltaArrow(delta)} {formatNumber(Math.abs(delta), 1)}% variación vs anterior
                </div>
              )}
              {deltaResult != null && (
                <div className={`executive-compare-delta small ${deltaClass(deltaResult)}`}>
                  {deltaArrow(deltaResult)} {formatNumber(Math.abs(deltaResult), 1)}% resultado vs anterior
                </div>
              )}
            </div>
          )
        })}
      </div>
    </article>
  )
}

const ProjectionPanel = ({
  subPeriodSeries,
  currentSubPeriodId,
}: {
  subPeriodSeries: ExecutiveTrendPoint[]
  currentSubPeriodId: number | null
}) => {
  const dataPoints = subPeriodSeries.filter((p) => p.totalScopeKpis > 0)
  const completedValues = dataPoints
    .map((p) => toFinite(p.averageVariation))
    .filter((v): v is number => v !== null)

  const totalSubPeriods = subPeriodSeries.length
  const completedCount = dataPoints.length
  const remainingCount = totalSubPeriods - completedCount

  if (completedValues.length < 2 || remainingCount <= 0) return null

  const projected = linearProject(completedValues, totalSubPeriods - 1)
  const riskCls = projectionRiskClass(projected)
  const riskLbl = projectionRiskLabel(projected)
  const trend = (completedValues[completedValues.length - 1] - completedValues[0]) / (completedValues.length - 1)

  return (
    <article className={`executive-projection-panel ${riskCls}`}>
      <div className="executive-projection-header">
        <div>
          <h3>Proyección al cierre</h3>
          <p>
            {completedCount} de {totalSubPeriods} subperíodos completados ·
            Tendencia {trend >= 0 ? '+' : ''}{formatNumber(trend, 1)}% por subperíodo
          </p>
        </div>
        <span className={`executive-projection-badge ${riskCls}`}>
          {riskLbl} — cierre estimado: {formatNumber(projected, 0)}%
        </span>
      </div>
      <div className="executive-projection-rows">
        {subPeriodSeries.map((point, index) => {
          const hasData = point.totalScopeKpis > 0 && toFinite(point.averageVariation) !== null
          const projectedValue = hasData
            ? toFinite(point.averageVariation)
            : linearProject(completedValues, completedCount + (index - completedCount))
          const isCurrent = point.subPeriodId === currentSubPeriodId
          const width = `${Math.min(Math.max(((projectedValue ?? 0) / 120) * 100, 4), 100)}%`

          return (
            <div
              key={`proj-row-${point.subPeriodId || index}`}
              className={`executive-projection-row${!hasData ? ' projected' : ''}${isCurrent ? ' current' : ''}`}
            >
              <span className="executive-projection-name">
                {point.subPeriodName || `S${index + 1}`}
              </span>
              <div className="executive-projection-bar">
                <div
                  className={`executive-projection-fill ${semaphoreClass(projectedValue)}${!hasData ? ' projected' : ''}`}
                  style={{ width }}
                />
              </div>
              <span className="executive-projection-val">
                {projectedValue != null ? `${formatNumber(projectedValue, 0)}%` : '-'}
              </span>
              {!hasData && <span className="executive-projection-tag">proy.</span>}
            </div>
          )
        })}
      </div>
    </article>
  )
}

export default function TableroEjecutivo() {
  const { isCollaborator, user } = useAuth()
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [selectedSubPeriodId, setSelectedSubPeriodId] = useState<number | null>(null)
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null)
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null)
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)
  const [selectedObjective, setSelectedObjective] = useState<string | null>(null)
  const [detailScopeKpi, setDetailScopeKpi] = useState<ScopeKPI | null>(null)

  const { data: periods } = useQuery<Period[]>('periods', async () => (await api.get('/periods')).data)

  const { data: executiveTree, isLoading } = useQuery<ExecutiveTreeResponse>(
    ['executive-tree', selectedPeriodId, selectedSubPeriodId],
    async () =>
      (
        await api.get('/dashboard/executive-tree', {
          params: {
            periodId: selectedPeriodId || undefined,
            subPeriodId: selectedSubPeriodId || undefined,
          },
        })
      ).data,
    { retry: false }
  )

  const { data: subPeriods } = useQuery<SubPeriod[]>(
    ['executive-dashboard-sub-periods', selectedPeriodId],
    async () => {
      if (!selectedPeriodId) return []
      return (await api.get(`/periods/${selectedPeriodId}/sub-periods`)).data
    },
    { enabled: !!selectedPeriodId }
  )

  useEffect(() => {
    if (!selectedPeriodId && executiveTree?.periodId) {
      setSelectedPeriodId(executiveTree.periodId)
    }
  }, [executiveTree?.periodId, selectedPeriodId])

  useEffect(() => {
    if (selectedSubPeriodId === null && executiveTree?.subPeriodId != null) {
      setSelectedSubPeriodId(executiveTree.subPeriodId)
    }
  }, [executiveTree?.subPeriodId, selectedSubPeriodId])

  useEffect(() => {
    const companies = executiveTree?.companies || []
    if (!companies.length) return
    if (!selectedCompanyId || !companies.some((company) => company.scope.id === selectedCompanyId)) {
      setSelectedCompanyId(companies[0].scope.id)
    }
  }, [executiveTree?.companies, selectedCompanyId])

  const selectedCompany = useMemo(
    () =>
      executiveTree?.companies.find((company) => company.scope.id === selectedCompanyId) ||
      executiveTree?.companies?.[0] ||
      null,
    [executiveTree?.companies, selectedCompanyId]
  )

  const selectedCompanyRollup = useMemo(
    () => (selectedCompany ? buildNodeRollup(selectedCompany, selectedObjective) : null),
    [selectedCompany, selectedObjective]
  )

  const companyObjectiveOptions = useMemo(
    () => (selectedCompany ? buildNodeRollup(selectedCompany, null).objectiveNames : []),
    [selectedCompany]
  )

  useEffect(() => {
    if (selectedObjective && !companyObjectiveOptions.includes(selectedObjective)) {
      setSelectedObjective(null)
    }
  }, [companyObjectiveOptions, selectedObjective])

  const filteredCompanyKpis = useMemo(
    () => (selectedCompany ? nodeOwnScopeKpis(selectedCompany, selectedObjective) : []),
    [selectedCompany, selectedObjective]
  )

  const areaNodes = useMemo(
    () =>
      (selectedCompany?.children || []).filter((child) =>
        ['area', 'business_unit'].includes(child.scope.type)
      ),
    [selectedCompany]
  )

  const filteredAreaNodes = useMemo(
    () => areaNodes.filter((area) => nodeMatchesObjective(area, selectedObjective)),
    [areaNodes, selectedObjective]
  )

  useEffect(() => {
    if (!filteredAreaNodes.length) {
      setSelectedAreaId(null)
      setSelectedTeamId(null)
      return
    }
    if (!selectedAreaId || !filteredAreaNodes.some((area) => area.scope.id === selectedAreaId)) {
      setSelectedAreaId(filteredAreaNodes[0].scope.id)
      setSelectedTeamId(null)
    }
  }, [filteredAreaNodes, selectedAreaId])

  const selectedArea = useMemo(
    () => filteredAreaNodes.find((area) => area.scope.id === selectedAreaId) || filteredAreaNodes[0] || null,
    [filteredAreaNodes, selectedAreaId]
  )

  const filteredTeamNodes = useMemo(
    () => (selectedArea?.children || []).filter((team) => nodeMatchesObjective(team, selectedObjective)),
    [selectedArea, selectedObjective]
  )

  useEffect(() => {
    if (!filteredTeamNodes.length) {
      setSelectedTeamId(null)
      return
    }
    if (selectedTeamId && !filteredTeamNodes.some((team) => team.scope.id === selectedTeamId)) {
      setSelectedTeamId(null)
    }
  }, [filteredTeamNodes, selectedTeamId])

  const selectedTeam = useMemo(
    () => filteredTeamNodes.find((team) => team.scope.id === selectedTeamId) || null,
    [filteredTeamNodes, selectedTeamId]
  )

  const focusNode = selectedTeam || selectedArea || selectedCompany

  const focusRollup = useMemo(
    () => (focusNode ? buildNodeRollup(focusNode, selectedObjective) : null),
    [focusNode, selectedObjective]
  )

  const focusOwnKpis = useMemo(
    () => (focusNode ? nodeOwnScopeKpis(focusNode, selectedObjective) : []),
    [focusNode, selectedObjective]
  )

  const focusDescendantKpis = useMemo(
    () => (focusRollup ? focusRollup.descendantScopeKpis.slice(0, 8) : []),
    [focusRollup]
  )

  const focusChildNodes = useMemo(
    () => (focusNode ? focusNode.children.filter((child) => nodeMatchesObjective(child, selectedObjective)) : []),
    [focusNode, selectedObjective]
  )

  const objectiveHighlights = useMemo(() => {
    if (!selectedCompany) return []
    return companyObjectiveOptions
      .map((objective) => {
        const rollup = buildNodeRollup(selectedCompany, objective)
        return {
          objective,
          weightedResultTotal: rollup.weightedResultTotal,
          scopeKpiCount: rollup.allScopeKpis.length,
          teamCount: rollup.teamCount,
        }
      })
      .sort(
        (a, b) =>
          b.weightedResultTotal - a.weightedResultTotal ||
          b.scopeKpiCount - a.scopeKpiCount ||
          a.objective.localeCompare(b.objective)
      )
      .slice(0, 8)
  }, [companyObjectiveOptions, selectedCompany])

  const focusScopeId = focusNode?.scope.id || null

  const { data: focusTrends } = useQuery<ExecutiveTrendsResponse>(
    ['executive-trends', focusScopeId, executiveTree?.periodId, selectedObjective],
    async () =>
      (
        await api.get('/dashboard/executive-trends', {
          params: {
            scopeId: focusScopeId || undefined,
            periodId: executiveTree?.periodId || selectedPeriodId || undefined,
            objectiveName: selectedObjective || undefined,
          },
        })
      ).data,
    { enabled: !!focusScopeId }
  )

  if (isCollaborator) {
    return (
      <div className="executive-dashboard">
        <div className="executive-empty">Este tablero está disponible para liderazgo y administración.</div>
      </div>
    )
  }

  return (
    <div className="executive-dashboard">
      <div className="executive-header">
        <div>
          <h1>Tablero Ejecutivo</h1>
          <p className="subtitle">
            Vista real company → area → team con KPIs organizacionales, lentes por objetivo y navegación ejecutiva
            sobre la misma capa de KPIs Grupales.
          </p>
        </div>
        <div className="executive-header-right">
          <div className="executive-user-pill">{user?.name || 'Usuario'} · {user?.role || 'rol'}</div>
          {selectedCompany && !isLoading && (
            <button
              className="btn-secondary executive-export-btn"
              onClick={() => {
                const areaNodes = (selectedCompany.children || []).filter((c) =>
                  ['area', 'business_unit', 'team'].includes(c.scope.type)
                )
                const exportAreas: ExportArea[] = areaNodes.map((area) => {
                  const rollupKpis = area.scopeKpis.concat(
                    area.children.flatMap((t) => t.scopeKpis)
                  )
                  const variations = rollupKpis
                    .map((k) => (k.variation != null ? Number(k.variation) : null))
                    .filter((v): v is number => v !== null)
                  const avg =
                    variations.length > 0
                      ? Number((variations.reduce((a, b) => a + b, 0) / variations.length).toFixed(1))
                      : null
                  return {
                    name: area.scope.name,
                    type: area.scope.type,
                    averageVariation: avg,
                    kpiCount: rollupKpis.length,
                    kpis: rollupKpis.map((k) => ({
                      name: k.name,
                      variation: k.variation != null ? Number(k.variation) : null,
                      target: k.target,
                      actual: k.actual != null ? Number(k.actual) : null,
                    })),
                  }
                })
                exportExecutivePDF({
                  periodName: executiveTree?.periodName || null,
                  subPeriodName: executiveTree?.subPeriodName || null,
                  companyName: selectedCompany.scope.name,
                  summary: {
                    averageVariation: selectedCompany.summary?.averageVariation ?? null,
                    totalScopeKpis: selectedCompany.summary?.totalScopeKpis ?? 0,
                    approvedScopeKpis: selectedCompany.summary?.approvedScopeKpis ?? 0,
                    completionRate: selectedCompany.summary?.completionRate ?? null,
                    weightedResultTotal: selectedCompany.summary?.weightedResultTotal ?? null,
                  },
                  objectiveNames: selectedCompany.objectives || [],
                  areas: exportAreas,
                })
              }}
            >
              Exportar PDF
            </button>
          )}
        </div>
      </div>

      <div className="executive-filters">
        <label>
          Periodo
          <select
            value={selectedPeriodId || ''}
            onChange={(e) => {
              setSelectedPeriodId(e.target.value ? Number(e.target.value) : null)
              setSelectedSubPeriodId(null)
            }}
          >
            <option value="">Auto</option>
            {(periods || []).map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Subperiodo
          <select
            value={selectedSubPeriodId || ''}
            onChange={(e) => setSelectedSubPeriodId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Auto</option>
            {(subPeriods || []).map((subPeriod) => (
              <option key={subPeriod.id} value={subPeriod.id}>
                {subPeriod.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Company
          <select
            value={selectedCompanyId || ''}
            onChange={(e) => {
              setSelectedCompanyId(e.target.value ? Number(e.target.value) : null)
              setSelectedAreaId(null)
              setSelectedTeamId(null)
              setSelectedObjective(null)
            }}
          >
            {(executiveTree?.companies || []).map((company) => (
              <option key={company.scope.id} value={company.scope.id}>
                {company.scope.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading ? (
        <div className="executive-empty">Cargando tablero ejecutivo...</div>
      ) : !selectedCompany || !selectedCompanyRollup ? (
        <div className="executive-empty">No hay datos ejecutivos para el período seleccionado.</div>
      ) : (
        <>
          <section className="executive-hero">
            <div className="executive-hero-copy">
              <div className="executive-breadcrumbs">
                <button
                  type="button"
                  className={`executive-breadcrumb ${!selectedArea && !selectedTeam ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedAreaId(null)
                    setSelectedTeamId(null)
                  }}
                >
                  {selectedCompany.scope.name}
                </button>
                {selectedArea ? (
                  <button
                    type="button"
                    className={`executive-breadcrumb ${selectedTeam ? '' : 'active'}`}
                    onClick={() => setSelectedTeamId(null)}
                  >
                    / {selectedArea.scope.name}
                  </button>
                ) : null}
                {selectedTeam ? (
                  <button type="button" className="executive-breadcrumb active">
                    / {selectedTeam.scope.name}
                  </button>
                ) : null}
              </div>
              <h2>{focusNode?.scope.name || selectedCompany.scope.name}</h2>
              <p>
                Periodo: {executiveTree?.periodName || '-'}
                {executiveTree?.subPeriodName ? ` · ${executiveTree.subPeriodName}` : ''}
                {selectedObjective ? ` · Objetivo: ${selectedObjective}` : ''}
              </p>

              <div className="executive-lens-panel">
                <div className="executive-lens-header">
                  <h3>Lente estratégico</h3>
                  <span>{selectedObjective ? 'Filtrado por un objetivo' : 'Vista transversal completa'}</span>
                </div>
                {companyObjectiveOptions.length ? (
                  <div className="executive-lens-chips">
                    <button
                      type="button"
                      className={`executive-lens-chip ${selectedObjective === null ? 'active' : ''}`}
                      onClick={() => setSelectedObjective(null)}
                    >
                      Todos
                    </button>
                    {companyObjectiveOptions.map((objective) => (
                      <button
                        type="button"
                        key={`objective-filter-${objective}`}
                        className={`executive-lens-chip ${selectedObjective === objective ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedObjective((current) => (current === objective ? null : objective))
                          setSelectedTeamId(null)
                        }}
                      >
                        {objective}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="executive-empty compact">La compañía seleccionada todavía no tiene objetivos vinculados.</div>
                )}
              </div>
            </div>

            <div className="executive-hero-stats">
              <div className="executive-hero-stat">
                <span>Resultado total</span>
                <strong>{formatNumber(selectedCompanyRollup.weightedResultTotal)}</strong>
              </div>
              <div className="executive-hero-stat">
                <span>Variación media</span>
                <strong>{formatNumber(selectedCompanyRollup.averageVariation, 1)}%</strong>
              </div>
              <div className="executive-hero-stat">
                <span>KPIs visibles</span>
                <strong>{selectedCompanyRollup.allScopeKpis.length}</strong>
              </div>
              <div className="executive-hero-stat">
                <span>Cobertura</span>
                <strong>{formatNumber(selectedCompanyRollup.completionRate, 0)}%</strong>
              </div>
              <div className="executive-hero-stat">
                <span>Áreas / BU</span>
                <strong>{selectedCompanyRollup.areaCount + selectedCompanyRollup.businessUnitCount}</strong>
              </div>
              <div className="executive-hero-stat">
                <span>Teams</span>
                <strong>{selectedCompanyRollup.teamCount}</strong>
              </div>
            </div>
          </section>

          {objectiveHighlights.length ? (
            <section className="executive-section">
              <div className="executive-section-header">
                <h3>Objetivos con más impacto</h3>
                <span>Lectura rápida para orientar el foco ejecutivo</span>
              </div>
              <div className="executive-objective-grid">
                {objectiveHighlights.map((objective) => (
                  <button
                    type="button"
                    key={`objective-highlight-${objective.objective}`}
                    className={`executive-objective-card ${selectedObjective === objective.objective ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedObjective((current) => (current === objective.objective ? null : objective.objective))
                      setSelectedTeamId(null)
                    }}
                  >
                    <span className="executive-objective-label">{objective.objective}</span>
                    <strong>{formatNumber(objective.weightedResultTotal)}</strong>
                    <small>
                      {objective.scopeKpiCount} KPIs · {objective.teamCount} teams
                    </small>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="executive-section">
            <div className="executive-section-header">
              <h3>KPIs Company</h3>
              <span>{filteredCompanyKpis.length} Scope KPIs propios bajo este lente</span>
            </div>
            {filteredCompanyKpis.length ? (
              <div className="executive-kpi-grid">
                {filteredCompanyKpis.map((scopeKpi) => (
                  <ExecutiveKpiCard key={`company-kpi-${scopeKpi.id}`} scopeKpi={scopeKpi} onOpenDetail={setDetailScopeKpi} />
                ))}
              </div>
            ) : (
              <div className="executive-empty">No hay KPIs company para este filtro.</div>
            )}
          </section>

          <section className="executive-section">
            <div className="executive-section-header">
              <h3>Navegación por niveles</h3>
              <span>Seleccioná contexto y bajá de company a teams sin salir del tablero.</span>
            </div>
            <div className="executive-level-grid">
              <div className="executive-level-column">
                <div className="executive-side-card executive-level-card current">
                  <h4>Company actual</h4>
                  <button
                    type="button"
                    className="executive-level-item selected"
                    onClick={() => {
                      setSelectedAreaId(null)
                      setSelectedTeamId(null)
                    }}
                  >
                    <span>{selectedCompany.scope.name}</span>
                    <strong>{formatNumber(selectedCompanyRollup.weightedResultTotal)}</strong>
                  </button>
                  <div className="executive-level-meta">
                    <span>{selectedCompanyRollup.ownScopeKpis.length} KPIs propios</span>
                    <span>{selectedCompanyRollup.descendantScopeKpis.length} descendientes</span>
                  </div>
                </div>
              </div>

              <div className="executive-level-column">
                <div className="executive-level-header">
                  <h4>Áreas / Business Units</h4>
                  <span>{filteredAreaNodes.length} visibles</span>
                </div>
                {filteredAreaNodes.length ? (
                  <div className="executive-level-list">
                    {filteredAreaNodes.map((area) => {
                      const rollup = buildNodeRollup(area, selectedObjective)
                      return (
                        <button
                          type="button"
                          key={`area-level-${area.scope.id}`}
                          className={`executive-level-item ${area.scope.id === selectedArea?.scope.id ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedAreaId(area.scope.id)
                            setSelectedTeamId(null)
                          }}
                        >
                          <span>{area.scope.name}</span>
                          <strong>{formatNumber(rollup.weightedResultTotal)}</strong>
                          <small>
                            {rollup.ownScopeKpis.length} propios · {rollup.teamCount} teams
                          </small>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="executive-empty compact">No hay áreas bajo este filtro estratégico.</div>
                )}
              </div>

              <div className="executive-level-column">
                <div className="executive-level-header">
                  <h4>Teams</h4>
                  <span>{filteredTeamNodes.length} visibles</span>
                </div>
                {selectedArea ? (
                  filteredTeamNodes.length ? (
                    <div className="executive-level-list">
                      {filteredTeamNodes.map((team) => {
                        const rollup = buildNodeRollup(team, selectedObjective)
                        return (
                          <button
                            type="button"
                            key={`team-level-${team.scope.id}`}
                            className={`executive-level-item ${team.scope.id === selectedTeam?.scope.id ? 'selected' : ''}`}
                            onClick={() => setSelectedTeamId(team.scope.id)}
                          >
                            <span>{team.scope.name}</span>
                            <strong>{formatNumber(rollup.weightedResultTotal)}</strong>
                            <small>{rollup.ownScopeKpis.length} KPIs propios</small>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="executive-empty compact">El área seleccionada no tiene teams visibles para este lente.</div>
                  )
                ) : (
                  <div className="executive-empty compact">Seleccioná un área para explorar sus teams.</div>
                )}
              </div>
            </div>
          </section>

          {filteredAreaNodes.length ? (
            <section className="executive-section">
              <div className="executive-section-header">
                <h3>Áreas destacadas</h3>
                <span>Lectura resumida por nivel intermedio</span>
              </div>
              <div className="executive-node-grid">
                {filteredAreaNodes.map((area) => (
                  <ExecutiveNodeCard
                    key={`area-card-${area.scope.id}`}
                    node={area}
                    objectiveFilter={selectedObjective}
                    selected={area.scope.id === selectedArea?.scope.id}
                    onSelect={() => {
                      setSelectedAreaId(area.scope.id)
                      setSelectedTeamId(null)
                    }}
                    onOpenDetail={setDetailScopeKpi}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {focusNode && focusTrends ? (
            <section className="executive-section">
              <div className="executive-section-header">
                <h3>Evolución del foco</h3>
                <span>
                  {focusTrends.scope?.name || focusNode.scope.name}
                  {selectedObjective ? ` · ${selectedObjective}` : ''}
                </span>
              </div>
              <div className="executive-trend-grid">
                <ExecutiveTrendCard
                  title="Últimos períodos"
                  subtitle="Resultado total del foco por período"
                  points={focusTrends.periodSeries}
                  getLabel={(point) => point.periodName || 'Periodo'}
                  isCurrent={(point) => point.periodId === executiveTree?.periodId}
                />
                <ExecutiveTrendCard
                  title="Subperíodos del período actual"
                  subtitle={focusTrends.periodName || 'Período actual'}
                  points={focusTrends.subPeriodSeries}
                  getLabel={(point) => point.subPeriodName || 'Subperíodo'}
                  isCurrent={(point) => point.subPeriodId === executiveTree?.subPeriodId}
                />
              </div>

              {focusTrends.periodSeries.length >= 2 && (
                <PeriodComparePanel
                  periodSeries={focusTrends.periodSeries}
                  currentPeriodId={executiveTree?.periodId ?? null}
                />
              )}

              {focusTrends.subPeriodSeries.length >= 2 && (
                <ProjectionPanel
                  subPeriodSeries={focusTrends.subPeriodSeries}
                  currentSubPeriodId={executiveTree?.subPeriodId ?? null}
                />
              )}
            </section>
          ) : null}

          {focusNode && focusRollup ? (
            <section className="executive-section executive-focus">
              <div className="executive-section-header">
                <h3>
                  Foco actual: {focusNode.scope.name} <small>({focusNode.scope.type})</small>
                </h3>
                <span>
                  {focusRollup.ownScopeKpis.length} KPIs propios · {focusRollup.descendantScopeKpis.length} descendientes
                </span>
              </div>

              <div className="executive-focus-layout">
                <div className="executive-focus-panel">
                  <div className="executive-focus-stats wide">
                    <div className="executive-focus-stat">
                      <span>Resultado propio</span>
                      <strong>{formatNumber(focusRollup.ownWeightedResult)}</strong>
                    </div>
                    <div className="executive-focus-stat">
                      <span>Resultado total</span>
                      <strong>{formatNumber(focusRollup.weightedResultTotal)}</strong>
                    </div>
                    <div className="executive-focus-stat">
                      <span>KPIs propios</span>
                      <strong>{focusRollup.ownScopeKpis.length}</strong>
                    </div>
                    <div className="executive-focus-stat">
                      <span>KPIs descendientes</span>
                      <strong>{focusRollup.descendantScopeKpis.length}</strong>
                    </div>
                    <div className="executive-focus-stat">
                      <span>Variación media</span>
                      <strong>{formatNumber(focusRollup.averageVariation, 1)}%</strong>
                    </div>
                  </div>

                  <div className="executive-panel-group">
                    <div className="executive-section-header">
                      <h3>KPIs propios del foco</h3>
                      <span>{focusOwnKpis.length} elementos</span>
                    </div>
                    {focusOwnKpis.length ? (
                      <div className="executive-kpi-grid compact">
                        {focusOwnKpis.map((scopeKpi) => (
                          <ExecutiveKpiCard key={`focus-kpi-${scopeKpi.id}`} scopeKpi={scopeKpi} onOpenDetail={setDetailScopeKpi} />
                        ))}
                      </div>
                    ) : (
                      <div className="executive-empty">Este nivel todavía no tiene Scope KPIs propios bajo el filtro actual.</div>
                    )}
                  </div>

                  <div className="executive-panel-group">
                    <div className="executive-section-header">
                      <h3>KPIs descendientes más relevantes</h3>
                      <span>{focusDescendantKpis.length} visibles</span>
                    </div>
                    {focusDescendantKpis.length ? (
                      <div className="executive-kpi-grid compact">
                        {focusDescendantKpis.map((scopeKpi) => (
                          <ExecutiveKpiCard
                            key={`focus-desc-kpi-${scopeKpi.id}`}
                            scopeKpi={scopeKpi}
                            onOpenDetail={setDetailScopeKpi}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="executive-empty">No hay KPIs descendientes que cumplan este filtro.</div>
                    )}
                  </div>
                </div>

                <div className="executive-side-panel">
                  <div className="executive-side-card">
                    <h4>Resumen descendiente</h4>
                    <div className="executive-side-metrics">
                      <div>
                        <span>Nodos</span>
                        <strong>{focusRollup.descendantNodes.length}</strong>
                      </div>
                      <div>
                        <span>Áreas</span>
                        <strong>{focusRollup.areaCount + focusRollup.businessUnitCount}</strong>
                      </div>
                      <div>
                        <span>Teams</span>
                        <strong>{focusRollup.teamCount}</strong>
                      </div>
                      <div>
                        <span>Cobertura</span>
                        <strong>{formatNumber(focusRollup.completionRate, 0)}%</strong>
                      </div>
                    </div>
                  </div>

                  <div className="executive-side-card">
                    <h4>Objetivos activos</h4>
                    {focusRollup.objectiveNames.length ? (
                      <div className="executive-tag-row">
                        {focusRollup.objectiveNames.map((objective) => (
                          <button
                            type="button"
                            key={`focus-objective-${objective}`}
                            className={`executive-tag button-tag ${selectedObjective === objective ? 'selected' : ''}`}
                            onClick={() => {
                              setSelectedObjective((current) => (current === objective ? null : objective))
                              setSelectedTeamId(null)
                            }}
                          >
                            {objective}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="executive-empty compact">Sin objetivos vinculados.</div>
                    )}
                  </div>

                  <div className="executive-side-card">
                    <h4>Siguientes niveles</h4>
                    {focusChildNodes.length ? (
                      <div className="executive-team-list">
                        {focusChildNodes.map((child) => {
                          const rollup = buildNodeRollup(child, selectedObjective)
                          return (
                            <button
                              type="button"
                              key={`focus-child-${child.scope.id}`}
                              className={`executive-team-item ${
                                child.scope.id === selectedTeam?.scope.id || child.scope.id === selectedArea?.scope.id ? 'selected' : ''
                              }`}
                              onClick={() => {
                                if (child.scope.type === 'team') {
                                  setSelectedTeamId(child.scope.id)
                                } else {
                                  setSelectedAreaId(child.scope.id)
                                  setSelectedTeamId(null)
                                }
                              }}
                            >
                              <span>
                                {child.scope.name}
                                <small>{child.scope.type}</small>
                              </span>
                              <strong>{formatNumber(rollup.weightedResultTotal)}</strong>
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="executive-empty compact">No hay un nivel inferior navegable para este foco.</div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}

      {detailScopeKpi ? (
        <ScopeKPIDetailModal
          scopeKpiId={detailScopeKpi.id}
          initialScopeKpi={detailScopeKpi}
          onClose={() => setDetailScopeKpi(null)}
        />
      ) : null}
    </div>
  )
}
