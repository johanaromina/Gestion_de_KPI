/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
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

const currentLocale = () => ((i18n.resolvedLanguage || i18n.language || 'es').startsWith('en') ? 'en-US' : 'es-AR')

const formatNumber = (value?: number | null, digits = 2) =>
  value == null ? '-' : new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: digits }).format(value)

const getScopeTypeLabel = (scopeType?: string | null) =>
  scopeType
    ? i18n.t(`executive:labels.scope_types.${scopeType}`, { defaultValue: scopeType.replace(/_/g, ' ') })
    : '-'

const getSourceModeLabel = (sourceMode?: string | null) =>
  sourceMode
    ? i18n.t(`executive:labels.source_modes.${sourceMode}`, { defaultValue: sourceMode })
    : '-'

const getRoleLabel = (role?: string | null) =>
  role
    ? i18n.t(`executive:labels.roles.${role}`, { defaultValue: role })
    : i18n.t('executive:tablero.user_fallback_role')

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

const GroupOverviewSection = ({
  companies,
  selectedCompanyId,
  onSelectCompany,
}: {
  companies: ExecutiveTreeNode[]
  selectedCompanyId: number | null
  onSelectCompany: (id: number) => void
}) => {
  const { t } = useTranslation('executive')

  const rollups = useMemo(() => companies.map((c) => buildNodeRollup(c, null)), [companies])

  if (companies.length < 2) return null

  const variations = rollups.map((r) => r.averageVariation).filter((v): v is number => v !== null)
  const groupAvgVariation = average(variations)
  const totalWeightedResult = sum(rollups.map((r) => r.weightedResultTotal))
  const totalKpis = rollups.reduce((acc, r) => acc + r.allScopeKpis.length, 0)
  const totalTeams = rollups.reduce((acc, r) => acc + r.teamCount, 0)

  const onTrack = rollups.filter((r) => (r.averageVariation ?? 0) >= 100).length
  const atRisk = rollups.filter((r) => r.averageVariation !== null && r.averageVariation < 80).length

  return (
    <section className="executive-group-overview">
      <div className="executive-section-header">
        <h3>{t('group.title', { defaultValue: 'Vista del Grupo' })}</h3>
        <span>{t('group.subtitle', { count: companies.length, defaultValue: `${companies.length} empresas` })}</span>
      </div>

      <div className="executive-group-aggregate">
        <div className="executive-group-agg-stat">
          <span>{t('group.agg_variation', { defaultValue: 'Variación promedio' })}</span>
          <strong className={semaphoreClass(groupAvgVariation)}>{formatNumber(groupAvgVariation, 1)}%</strong>
        </div>
        <div className="executive-group-agg-stat">
          <span>{t('group.agg_result', { defaultValue: 'Resultado consolidado' })}</span>
          <strong>{formatNumber(totalWeightedResult)}</strong>
        </div>
        <div className="executive-group-agg-stat">
          <span>{t('group.agg_kpis', { defaultValue: 'KPIs en seguimiento' })}</span>
          <strong>{totalKpis}</strong>
        </div>
        <div className="executive-group-agg-stat">
          <span>{t('group.agg_teams', { defaultValue: 'Equipos' })}</span>
          <strong>{totalTeams}</strong>
        </div>
        <div className="executive-group-agg-stat">
          <span>{t('group.agg_on_track', { defaultValue: 'En objetivo' })}</span>
          <strong className="semaphore-green">{onTrack}</strong>
        </div>
        <div className="executive-group-agg-stat">
          <span>{t('group.agg_at_risk', { defaultValue: 'En riesgo' })}</span>
          <strong className={atRisk > 0 ? 'semaphore-red' : ''}>{atRisk}</strong>
        </div>
      </div>

      <div className="executive-group-company-grid">
        {companies.map((company, index) => {
          const rollup = rollups[index]
          const isSelected = company.scope.id === selectedCompanyId
          return (
            <button
              type="button"
              key={`group-company-${company.scope.id}`}
              className={`executive-group-company-card ${isSelected ? 'selected' : ''} ${semaphoreClass(rollup.averageVariation)}`}
              onClick={() => onSelectCompany(company.scope.id)}
            >
              <div className="executive-group-company-header">
                <span className="executive-group-company-name">{company.scope.name}</span>
                <span className={`executive-semaphore-badge ${semaphoreClass(rollup.averageVariation)}`}>
                  {formatNumber(rollup.averageVariation, 1)}%
                </span>
              </div>
              <div className="executive-group-company-metrics">
                <div>
                  <span>{t('group.company_result', { defaultValue: 'Resultado' })}</span>
                  <strong>{formatNumber(rollup.weightedResultTotal)}</strong>
                </div>
                <div>
                  <span>{t('group.company_kpis', { defaultValue: 'KPIs' })}</span>
                  <strong>{rollup.allScopeKpis.length}</strong>
                </div>
                <div>
                  <span>{t('group.company_coverage', { defaultValue: 'Cobertura' })}</span>
                  <strong>{formatNumber(rollup.completionRate, 0)}%</strong>
                </div>
                <div>
                  <span>{t('group.company_teams', { defaultValue: 'Equipos' })}</span>
                  <strong>{rollup.teamCount}</strong>
                </div>
              </div>
              {isSelected && (
                <div className="executive-group-selected-badge">
                  {t('group.company_selected_badge', { defaultValue: 'Vista activa ↓' })}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

const ExecutiveKpiCard = ({
  scopeKpi,
  onOpenDetail,
}: {
  scopeKpi: ScopeKPI
  onOpenDetail: (scopeKpi: ScopeKPI) => void
}) => {
  const { t } = useTranslation('executive')
  return (
    <article className="executive-kpi-card">
      <div className="executive-kpi-header">
        <div>
          <h4>{scopeKpi.name}</h4>
          <p>
            {scopeKpi.kpiName || t('labels.kpi_fallback')} · {getSourceModeLabel(scopeKpi.sourceMode)}
          </p>
        </div>
        <div className="executive-kpi-header-right">
          <span className={`executive-semaphore-badge ${semaphoreClass(scopeKpi.variation)}`}>{formatNumber(scopeKpi.variation, 1)}%</span>
          <button type="button" className="link-button" onClick={() => onOpenDetail(scopeKpi)}>
            {t('kpi_card.detail_btn')}
          </button>
        </div>
      </div>
      <div className="executive-kpi-metrics">
        <div>
          <span>{t('kpi_card.actual_label')}</span>
          <strong>{formatNumber(scopeKpi.actual)}</strong>
        </div>
        <div>
          <span>{t('kpi_card.target_label')}</span>
          <strong>{formatNumber(scopeKpi.target)}</strong>
        </div>
        <div>
          <span>{t('kpi_card.result_label')}</span>
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
            {scopeKpi.mixedConfig?.directLabel || t('kpi_card.direct_fallback')}: {formatNumber(scopeKpi.directActual)}
          </span>
          <span>
            {scopeKpi.mixedConfig?.aggregatedLabel || t('kpi_card.aggregated_fallback')}: {formatNumber(scopeKpi.aggregatedActual)}
          </span>
        </div>
      ) : null}
    </article>
  )
}

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
  const { t } = useTranslation('executive')
  const rollup = useMemo(() => buildNodeRollup(node, objectiveFilter), [node, objectiveFilter])
  const topKpis = rollup.ownScopeKpis.slice(0, 3)

  return (
    <article className={`executive-node-card ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="executive-node-header">
        <div>
          <h3>{node.scope.name}</h3>
          <p>
            {getScopeTypeLabel(node.scope.type)} · {t('node_card.kpis_visible', { count: rollup.allScopeKpis.length })}
          </p>
        </div>
        <span className={`executive-node-badge ${semaphoreClass(rollup.averageVariation)}`}>{formatNumber(rollup.averageVariation, 1)}%</span>
      </div>

      <div className="executive-node-stats">
        <div>
          <span>{t('node_card.result_label')}</span>
          <strong>{formatNumber(rollup.weightedResultTotal)}</strong>
        </div>
        <div>
          <span>{t('node_card.own_label')}</span>
          <strong>{rollup.ownScopeKpis.length}</strong>
        </div>
        <div>
          <span>{t('node_card.desc_label')}</span>
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
        <div className="executive-empty compact">{t('node_card.no_own_kpis')}</div>
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
  const { t } = useTranslation('executive')
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
                  <span>{t('trend_card.kpis_count', { count: point.totalScopeKpis })}</span>
                </div>
                <div className="executive-trend-bar">
                  <div className="executive-trend-fill" style={{ width }} />
                </div>
                <div className="executive-trend-metrics">
                  <span>{t('trend_card.result_label', { value: formatNumber(point.weightedResultTotal) })}</span>
                  <span>{t('trend_card.coverage_label', { value: formatNumber(point.completionRate, 0) })}</span>
                  <span className={semaphoreClass(point.averageVariation)}>{t('trend_card.variation_label', { value: formatNumber(point.averageVariation, 1) })}</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="executive-empty compact">{t('trend_card.empty')}</div>
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
  const { t } = useTranslation('executive')
  const slice = periodSeries.slice(-3)
  if (slice.length < 2) return null

  const current = slice[slice.length - 1]
  const previous = slice.length >= 2 ? slice[slice.length - 2] : null
  const twoBack = slice.length >= 3 ? slice[slice.length - 3] : null

  const compareCols = [
    twoBack ? { point: twoBack, label: twoBack.periodName || t('compare.period_minus_2'), isCurrent: false } : null,
    previous ? { point: previous, label: previous.periodName || t('compare.period_previous'), isCurrent: false } : null,
    { point: current, label: current.periodName || t('compare.period_current'), isCurrent: true },
  ].filter(Boolean) as Array<{ point: ExecutiveTrendPoint; label: string; isCurrent: boolean }>

  return (
    <article className="executive-compare-panel">
      <div className="executive-section-header">
        <h3>{t('compare.title')}</h3>
        <span>{t('compare.subtitle', { count: slice.length })}</span>
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
                {isCurrent && <span className="executive-compare-badge">{t('compare.current_badge')}</span>}
              </div>
              <div className={`executive-compare-value ${semaphoreClass(point.averageVariation)}`}>
                {formatNumber(point.averageVariation, 1)}%
              </div>
              <div className="executive-compare-sub">
                <span>{t('compare.result_label')} <strong>{formatNumber(point.weightedResultTotal)}</strong></span>
                <span>{t('compare.kpis_label')} <strong>{point.totalScopeKpis}</strong></span>
                <span>{t('compare.coverage_label')} <strong>{formatNumber(point.completionRate, 0)}%</strong></span>
              </div>
              {delta != null && (
                <div className={`executive-compare-delta ${deltaClass(delta)}`}>
                  {t('compare.delta_variation', { arrow: deltaArrow(delta), value: formatNumber(Math.abs(delta), 1) })}
                </div>
              )}
              {deltaResult != null && (
                <div className={`executive-compare-delta small ${deltaClass(deltaResult)}`}>
                  {t('compare.delta_result', { arrow: deltaArrow(deltaResult), value: formatNumber(Math.abs(deltaResult), 1) })}
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
  const { t } = useTranslation('executive')

  const getRiskLabel = (value: number | null): string => {
    if (value == null) return t('risk.no_data')
    if (value >= 100) return t('risk.on_track')
    if (value >= 80) return t('risk.warning')
    return t('risk.at_risk')
  }

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
  const riskLbl = getRiskLabel(projected)
  const trend = (completedValues[completedValues.length - 1] - completedValues[0]) / (completedValues.length - 1)

  return (
    <article className={`executive-projection-panel ${riskCls}`}>
      <div className="executive-projection-header">
        <div>
          <h3>{t('projection.title')}</h3>
          <p>
            {t('projection.subtitle', {
              completed: completedCount,
              total: totalSubPeriods,
              trend: `${trend >= 0 ? '+' : ''}${formatNumber(trend, 1)}`,
            })}
          </p>
        </div>
        <span className={`executive-projection-badge ${riskCls}`}>
          {t('projection.badge', { riskLabel: riskLbl, value: formatNumber(projected, 0) })}
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
              {!hasData && <span className="executive-projection-tag">{t('projection.projected_tag')}</span>}
            </div>
          )
        })}
      </div>
    </article>
  )
}

export default function TableroEjecutivo() {
  const { isCollaborator, user } = useAuth()
  const { t } = useTranslation('executive')
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [selectedSubPeriodId, setSelectedSubPeriodId] = useState<number | null>(null)
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null)
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null)
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)
  const [selectedObjective, setSelectedObjective] = useState<string | null>(null)
  const [detailScopeKpi, setDetailScopeKpi] = useState<ScopeKPI | null>(null)
  const [showAllDescendantKpis, setShowAllDescendantKpis] = useState(false)
  const [showAllLensChips, setShowAllLensChips] = useState(false)
  const [showAllObjectiveHighlights, setShowAllObjectiveHighlights] = useState(false)

  const LENS_CHIPS_LIMIT = 6
  const OBJECTIVE_HIGHLIGHTS_LIMIT = 6

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
    { retry: false, staleTime: 2 * 60 * 1000 }
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
    setShowAllLensChips(false)
    setShowAllObjectiveHighlights(false)
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

  useEffect(() => { setShowAllDescendantKpis(false) }, [focusNode?.scope.id])

  const focusRollup = useMemo(
    () => (focusNode ? buildNodeRollup(focusNode, selectedObjective) : null),
    [focusNode, selectedObjective]
  )

  const focusOwnKpis = useMemo(
    () => (focusNode ? nodeOwnScopeKpis(focusNode, selectedObjective) : []),
    [focusNode, selectedObjective]
  )

  const focusDescendantKpis = useMemo(
    () => (focusRollup ? focusRollup.descendantScopeKpis : []),
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
        <div className="executive-empty">{t('tablero.restricted')}</div>
      </div>
    )
  }

  return (
    <div className="executive-dashboard">
      <div className="executive-header">
        <div>
          <h1>{t('tablero.title')}</h1>
          <p className="subtitle">{t('tablero.subtitle')}</p>
        </div>
        <div className="executive-header-right">
          <div className="executive-user-pill">
            {user?.name || t('tablero.user_fallback_name')} · {getRoleLabel(user?.role)}
          </div>
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
              {t('tablero.export_btn')}
            </button>
          )}
        </div>
      </div>

      <div className="executive-filters">
        <label>
          {t('tablero.filter_period')}
          <select
            value={selectedPeriodId || ''}
            onChange={(e) => {
              setSelectedPeriodId(e.target.value ? Number(e.target.value) : null)
              setSelectedSubPeriodId(null)
            }}
          >
            <option value="">{t('tablero.filter_period_auto')}</option>
            {(periods || []).map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('tablero.filter_subperiod')}
          <select
            value={selectedSubPeriodId || ''}
            onChange={(e) => setSelectedSubPeriodId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t('tablero.filter_period_auto')}</option>
            {(subPeriods || []).map((subPeriod) => (
              <option key={subPeriod.id} value={subPeriod.id}>
                {subPeriod.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('tablero.filter_company')}
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

      {!isLoading && (executiveTree?.companies?.length ?? 0) >= 2 && (
        <GroupOverviewSection
          companies={executiveTree!.companies}
          selectedCompanyId={selectedCompanyId}
          onSelectCompany={(id) => {
            setSelectedCompanyId(id)
            setSelectedAreaId(null)
            setSelectedTeamId(null)
            setSelectedObjective(null)
          }}
        />
      )}

      {isLoading ? (
        <div className="executive-empty">{t('tablero.loading')}</div>
      ) : !selectedCompany || !selectedCompanyRollup ? (
        <div className="executive-empty">{t('tablero.no_data')}</div>
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
                {t('tablero.period_info', { period: executiveTree?.periodName || '-' })}
                {executiveTree?.subPeriodName ? t('tablero.period_subperiod', { subperiod: executiveTree.subPeriodName }) : ''}
                {selectedObjective ? t('tablero.period_objective', { objective: selectedObjective }) : ''}
              </p>

              <div className="executive-lens-panel">
                <div className="executive-lens-header">
                  <h3>{t('tablero.lens_title')}</h3>
                  <span>{selectedObjective ? t('tablero.lens_filtered') : t('tablero.lens_all_view')}</span>
                </div>
                {companyObjectiveOptions.length ? (
                  <div className="executive-lens-chips">
                    <button
                      type="button"
                      className={`executive-lens-chip ${selectedObjective === null ? 'active' : ''}`}
                      onClick={() => setSelectedObjective(null)}
                    >
                      {t('tablero.lens_all_btn')}
                    </button>
                    {(showAllLensChips ? companyObjectiveOptions : companyObjectiveOptions.slice(0, LENS_CHIPS_LIMIT)).map((objective) => (
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
                    {companyObjectiveOptions.length > LENS_CHIPS_LIMIT && (
                      <button
                        type="button"
                        className="executive-lens-chip executive-lens-chip--more"
                        onClick={() => setShowAllLensChips((v) => !v)}
                      >
                        {showAllLensChips
                          ? t('tablero.lens_show_less', { defaultValue: 'Ver menos' })
                          : t('tablero.lens_show_more', { count: companyObjectiveOptions.length - LENS_CHIPS_LIMIT, defaultValue: `+${companyObjectiveOptions.length - LENS_CHIPS_LIMIT} más` })}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="executive-empty compact">{t('tablero.lens_no_objectives')}</div>
                )}
              </div>
            </div>

            <div className="executive-hero-stats">
              <div className="executive-hero-stat">
                <span>{t('tablero.stat_total_result')}</span>
                <strong>{formatNumber(selectedCompanyRollup.weightedResultTotal)}</strong>
              </div>
              <div className="executive-hero-stat">
                <span>{t('tablero.stat_avg_variation')}</span>
                <strong>{formatNumber(selectedCompanyRollup.averageVariation, 1)}%</strong>
              </div>
              <div className="executive-hero-stat">
                <span>{t('tablero.stat_visible_kpis')}</span>
                <strong>{selectedCompanyRollup.allScopeKpis.length}</strong>
              </div>
              <div className="executive-hero-stat">
                <span>{t('tablero.stat_coverage')}</span>
                <strong>{formatNumber(selectedCompanyRollup.completionRate, 0)}%</strong>
              </div>
              <div className="executive-hero-stat">
                <span>{t('tablero.stat_areas_bu')}</span>
                <strong>{selectedCompanyRollup.areaCount + selectedCompanyRollup.businessUnitCount}</strong>
              </div>
              <div className="executive-hero-stat">
                <span>{t('tablero.stat_teams')}</span>
                <strong>{selectedCompanyRollup.teamCount}</strong>
              </div>
            </div>
          </section>

          {objectiveHighlights.length ? (
            <section className="executive-section">
              <div className="executive-section-header">
                <h3>{t('tablero.objectives_title')}</h3>
                <span>{t('tablero.objectives_subtitle')}</span>
              </div>
              <div className="executive-objective-grid">
                {(showAllObjectiveHighlights ? objectiveHighlights : objectiveHighlights.slice(0, OBJECTIVE_HIGHLIGHTS_LIMIT)).map((objective) => (
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
                      {t('tablero.objectives_kpi_count', { count: objective.scopeKpiCount, teams: objective.teamCount })}
                    </small>
                  </button>
                ))}
              </div>
              {objectiveHighlights.length > OBJECTIVE_HIGHLIGHTS_LIMIT && (
                <button
                  type="button"
                  className="executive-show-more-btn"
                  onClick={() => setShowAllObjectiveHighlights((v) => !v)}
                >
                  {showAllObjectiveHighlights
                    ? t('tablero.show_less', { defaultValue: 'Ver menos' })
                    : t('tablero.show_all', { count: objectiveHighlights.length, defaultValue: `Ver todos (${objectiveHighlights.length})` })}
                </button>
              )}
            </section>
          ) : null}

          <section className="executive-section">
            <div className="executive-section-header">
              <h3>{t('tablero.company_kpis_title')}</h3>
              <span>{t('tablero.company_kpis_subtitle', { count: filteredCompanyKpis.length })}</span>
            </div>
            {filteredCompanyKpis.length ? (
              <div className="executive-kpi-grid">
                {filteredCompanyKpis.map((scopeKpi) => (
                  <ExecutiveKpiCard key={`company-kpi-${scopeKpi.id}`} scopeKpi={scopeKpi} onOpenDetail={setDetailScopeKpi} />
                ))}
              </div>
            ) : (
              <div className="executive-empty">{t('tablero.company_kpis_empty')}</div>
            )}
          </section>

          <section className="executive-section">
            <div className="executive-section-header">
              <h3>{t('tablero.nav_title')}</h3>
              <span>{t('tablero.nav_subtitle')}</span>
            </div>
            <div className="executive-level-grid">
              <div className="executive-level-column">
                <div className="executive-side-card executive-level-card current">
                  <h4>{t('tablero.nav_current_company')}</h4>
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
                    <span>{t('tablero.nav_company_own_kpis', { count: selectedCompanyRollup.ownScopeKpis.length })}</span>
                    <span>{t('tablero.nav_company_desc_kpis', { count: selectedCompanyRollup.descendantScopeKpis.length })}</span>
                  </div>
                </div>
              </div>

              <div className="executive-level-column">
                <div className="executive-level-header">
                  <h4>{t('tablero.nav_areas_title')}</h4>
                  <span>{t('tablero.nav_areas_visible', { count: filteredAreaNodes.length })}</span>
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
                            {t('tablero.nav_areas_own', { own: rollup.ownScopeKpis.length, teams: rollup.teamCount })}
                          </small>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="executive-empty compact">{t('tablero.nav_areas_empty')}</div>
                )}
              </div>

              <div className="executive-level-column">
                <div className="executive-level-header">
                  <h4>{t('tablero.nav_teams_title')}</h4>
                  <span>{t('tablero.nav_teams_visible', { count: filteredTeamNodes.length })}</span>
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
                            <small>{t('tablero.nav_teams_own', { count: rollup.ownScopeKpis.length })}</small>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="executive-empty compact">{t('tablero.nav_teams_no_teams')}</div>
                  )
                ) : (
                  <div className="executive-empty compact">{t('tablero.nav_teams_select_area')}</div>
                )}
              </div>
            </div>
          </section>

          {filteredAreaNodes.length ? (
            <section className="executive-section">
              <div className="executive-section-header">
                <h3>{t('tablero.areas_section_title')}</h3>
                <span>{t('tablero.areas_section_subtitle')}</span>
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
                <h3>{t('tablero.focus_evolution_title')}</h3>
                <span>
                  {focusTrends.scope?.name || focusNode.scope.name}
                  {selectedObjective ? ` · ${selectedObjective}` : ''}
                </span>
              </div>
              <div className="executive-trend-grid">
                <ExecutiveTrendCard
                  title={t('tablero.focus_trend_periods_title')}
                  subtitle={t('tablero.focus_trend_periods_subtitle')}
                  points={focusTrends.periodSeries}
                  getLabel={(point) => point.periodName || t('tablero.focus_period_fallback')}
                  isCurrent={(point) => point.periodId === executiveTree?.periodId}
                />
                <ExecutiveTrendCard
                  title={t('tablero.focus_trend_subperiods_title')}
                  subtitle={focusTrends.periodName || t('tablero.focus_trend_current_period')}
                  points={focusTrends.subPeriodSeries}
                  getLabel={(point) => point.subPeriodName || t('tablero.focus_subperiod_fallback')}
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
                  {t('tablero.focus_title', { name: focusNode.scope.name })} <small>({getScopeTypeLabel(focusNode.scope.type)})</small>
                </h3>
                <span>
                  {t('tablero.focus_kpi_count', { own: focusRollup.ownScopeKpis.length, desc: focusRollup.descendantScopeKpis.length })}
                </span>
              </div>

              <div className="executive-focus-layout">
                <div className="executive-focus-panel">
                  <div className="executive-focus-stats wide">
                    <div className="executive-focus-stat">
                      <span>{t('tablero.focus_own_result')}</span>
                      <strong>{formatNumber(focusRollup.ownWeightedResult)}</strong>
                    </div>
                    <div className="executive-focus-stat">
                      <span>{t('tablero.focus_total_result')}</span>
                      <strong>{formatNumber(focusRollup.weightedResultTotal)}</strong>
                    </div>
                    <div className="executive-focus-stat">
                      <span>{t('tablero.focus_own_kpis_stat')}</span>
                      <strong>{focusRollup.ownScopeKpis.length}</strong>
                    </div>
                    <div className="executive-focus-stat">
                      <span>{t('tablero.focus_desc_kpis_stat')}</span>
                      <strong>{focusRollup.descendantScopeKpis.length}</strong>
                    </div>
                    <div className="executive-focus-stat">
                      <span>{t('tablero.focus_avg_variation')}</span>
                      <strong>{formatNumber(focusRollup.averageVariation, 1)}%</strong>
                    </div>
                  </div>

                  <div className="executive-panel-group">
                    <div className="executive-section-header">
                      <h3>{t('tablero.focus_own_kpis_section')}</h3>
                      <span>{t('tablero.focus_own_kpis_count', { count: focusOwnKpis.length })}</span>
                    </div>
                    {focusOwnKpis.length ? (
                      <div className="executive-kpi-grid compact">
                        {focusOwnKpis.map((scopeKpi) => (
                          <ExecutiveKpiCard key={`focus-kpi-${scopeKpi.id}`} scopeKpi={scopeKpi} onOpenDetail={setDetailScopeKpi} />
                        ))}
                      </div>
                    ) : (
                      <div className="executive-empty">{t('tablero.focus_own_kpis_empty')}</div>
                    )}
                  </div>

                  <div className="executive-panel-group">
                    <div className="executive-section-header">
                      <h3>{t('tablero.focus_desc_kpis_section')}</h3>
                      <span>{t('tablero.focus_desc_kpis_count', { count: focusDescendantKpis.length })}</span>
                    </div>
                    {focusDescendantKpis.length ? (
                      <>
                        <div className="executive-kpi-grid compact">
                          {(showAllDescendantKpis ? focusDescendantKpis : focusDescendantKpis.slice(0, 12)).map((scopeKpi) => (
                            <ExecutiveKpiCard
                              key={`focus-desc-kpi-${scopeKpi.id}`}
                              scopeKpi={scopeKpi}
                              onOpenDetail={setDetailScopeKpi}
                            />
                          ))}
                        </div>
                        {focusDescendantKpis.length > 12 && (
                          <button
                            type="button"
                            className="executive-show-more-btn"
                            onClick={() => setShowAllDescendantKpis((v) => !v)}
                          >
                            {showAllDescendantKpis
                              ? t('tablero.show_less', { defaultValue: 'Ver menos' })
                              : t('tablero.show_all', { count: focusDescendantKpis.length, defaultValue: `Ver todos (${focusDescendantKpis.length})` })}
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="executive-empty">{t('tablero.focus_desc_kpis_empty')}</div>
                    )}
                  </div>
                </div>

                <div className="executive-side-panel">
                  <div className="executive-side-card">
                    <h4>{t('tablero.descendant_summary_title')}</h4>
                    <div className="executive-side-metrics">
                      <div>
                        <span>{t('tablero.descendant_nodes')}</span>
                        <strong>{focusRollup.descendantNodes.length}</strong>
                      </div>
                      <div>
                        <span>{t('tablero.descendant_areas')}</span>
                        <strong>{focusRollup.areaCount + focusRollup.businessUnitCount}</strong>
                      </div>
                      <div>
                        <span>{t('tablero.descendant_teams')}</span>
                        <strong>{focusRollup.teamCount}</strong>
                      </div>
                      <div>
                        <span>{t('tablero.descendant_coverage')}</span>
                        <strong>{formatNumber(focusRollup.completionRate, 0)}%</strong>
                      </div>
                    </div>
                  </div>

                  <div className="executive-side-card">
                    <h4>{t('tablero.active_objectives_title')}</h4>
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
                      <div className="executive-empty compact">{t('tablero.active_objectives_empty')}</div>
                    )}
                  </div>

                  <div className="executive-side-card">
                    <h4>{t('tablero.next_levels_title')}</h4>
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
                                <small>{getScopeTypeLabel(child.scope.type)}</small>
                              </span>
                              <strong>{formatNumber(rollup.weightedResultTotal)}</strong>
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="executive-empty compact">{t('tablero.next_levels_empty')}</div>
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
