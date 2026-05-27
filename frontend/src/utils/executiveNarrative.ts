/**
 * Generates an interpretive narrative from executive KPI tree data.
 * All logic is pure TypeScript — no AI API required.
 */
import i18n from '../i18n'

const resolveLocale = (locale?: string) =>
  locale || ((i18n.resolvedLanguage || i18n.language || 'es').startsWith('en') ? 'en-US' : 'es-AR')

const fmt = (v: number | null | undefined, locale: string, digits = 1) =>
  v == null
    ? i18n.t('executive:narrative.not_available')
    : new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v)

const riskLabel = (v: number | null | undefined) => {
  if (v == null) return i18n.t('executive:narrative.status.no_data')
  if (v >= 100) return i18n.t('executive:narrative.status.on_track')
  if (v >= 80) return i18n.t('executive:narrative.status.warning')
  return i18n.t('executive:narrative.status.at_risk')
}

export interface NarrativeInput {
  periodName: string | null | undefined
  subPeriodName?: string | null
  companyName: string
  averageVariation: number | null | undefined
  totalScopeKpis: number
  approvedScopeKpis: number
  completionRate: number | null | undefined
  weightedResultTotal: number | null | undefined
  objectiveNames: string[]
  areas: Array<{
    name: string
    type: string
    averageVariation: number | null
    kpiCount: number
  }>
  topRisk: Array<{ name: string; variation: number | null; scopeName: string }>
  topPerformers: Array<{ name: string; variation: number | null; scopeName: string }>
}

export function buildNarrative(input: NarrativeInput, localeArg?: string): string {
  const {
    periodName,
    subPeriodName,
    companyName,
    averageVariation,
    totalScopeKpis,
    approvedScopeKpis,
    completionRate,
    weightedResultTotal,
    objectiveNames,
    areas,
    topRisk,
    topPerformers,
  } = input
  const locale = resolveLocale(localeArg)
  const t = (key: string, options?: Record<string, unknown>) =>
    i18n.t(`executive:narrative.${key}`, options)

  const date = new Date().toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const period = [periodName, subPeriodName].filter(Boolean).join(' · ')
  const status = riskLabel(averageVariation)
  const pct = fmt(averageVariation, locale)
  const periodLabel = period || t('current_period')
  const paragraphs: string[] = []

  paragraphs.push(
    t('opening', {
      date,
      company: companyName,
      variation: pct,
      period: periodLabel,
      status,
    })
  )

  // Coverage
  const coveragePct = fmt(completionRate, locale, 0)
  let coverageText = t('coverage.summary', {
    total: totalScopeKpis,
    approved: approvedScopeKpis,
    coverage: coveragePct,
    weighted: fmt(weightedResultTotal, locale, 1),
  })
  if (completionRate != null && completionRate < 60) {
    coverageText += ` ${t('coverage.low')}`
  }
  paragraphs.push(coverageText)

  // Objectives
  if (objectiveNames.length > 0) {
    const objectiveList = objectiveNames.slice(0, 4).join(', ')
    if (objectiveNames.length > 4) {
      paragraphs.push(
        t('objectives_more', {
          objectives: objectiveList,
          count: objectiveNames.length - 4,
        })
      )
    } else {
      paragraphs.push(t('objectives', { objectives: objectiveList }))
    }
  }

  // Area breakdown
  const areasWithData = areas.filter((a) => a.averageVariation != null)
  if (areasWithData.length > 0) {
    const greenAreas = areasWithData.filter((a) => (a.averageVariation ?? 0) >= 100)
    const yellowAreas = areasWithData.filter((a) => {
      const v = a.averageVariation ?? 0
      return v >= 80 && v < 100
    })
    const redAreas = areasWithData.filter((a) => (a.averageVariation ?? 0) < 80)

    const parts: string[] = []
    if (greenAreas.length) {
      parts.push(
        t('area_breakdown.on_track', {
          count: greenAreas.length,
          areas: greenAreas.map((a) => a.name).slice(0, 3).join(', '),
        })
      )
    }
    if (yellowAreas.length) {
      parts.push(
        t('area_breakdown.warning', {
          count: yellowAreas.length,
          areas: yellowAreas.map((a) => a.name).slice(0, 3).join(', '),
        })
      )
    }
    if (redAreas.length) {
      parts.push(
        t('area_breakdown.at_risk', {
          count: redAreas.length,
          areas: redAreas.map((a) => a.name).slice(0, 3).join(', '),
        })
      )
    }
    if (parts.length) {
      paragraphs.push(`${t('area_breakdown.title')} ${parts.join(' ')}`.trim())
    }
  }

  // Top risk
  if (topRisk.length > 0) {
    paragraphs.push(
      t('top_risk', {
        items: topRisk
      .slice(0, 3)
      .map((k) => `${k.name} ${t('in_scope', { scope: k.scopeName })} (${fmt(k.variation, locale)}%)`)
      .join('; '),
      })
    )
  }

  // Top performers
  if (topPerformers.length > 0) {
    paragraphs.push(
      t('top_performers', {
        items: topPerformers
      .slice(0, 3)
      .map((k) => `${k.name} ${t('in_scope', { scope: k.scopeName })} (${fmt(k.variation, locale)}%)`)
      .join('; '),
      })
    )
  }

  // Closing recommendation
  if (averageVariation != null && averageVariation < 80) {
    paragraphs.push(t('recommendation.at_risk'))
  } else if (averageVariation != null && averageVariation < 100) {
    paragraphs.push(t('recommendation.warning'))
  } else if (averageVariation != null) {
    paragraphs.push(t('recommendation.on_track'))
  }

  return paragraphs.join('\n\n').trim()
}
