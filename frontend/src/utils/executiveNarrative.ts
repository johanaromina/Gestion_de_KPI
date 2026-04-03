/**
 * Generates an interpretive narrative from executive KPI tree data.
 * All logic is pure TypeScript — no AI API required.
 */

const fmt = (v: number | null | undefined, digits = 1) =>
  v == null ? 'N/D' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(v)

const riskLabel = (v: number | null | undefined) => {
  if (v == null) return 'sin datos'
  if (v >= 100) return 'en track'
  if (v >= 80) return 'bajo seguimiento'
  return 'en riesgo'
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

export function buildNarrative(input: NarrativeInput): string {
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

  const date = new Date().toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const period = [periodName, subPeriodName].filter(Boolean).join(' · ')
  const status = riskLabel(averageVariation)
  const pct = fmt(averageVariation)

  let narrative = `Al ${date}, la organización ${companyName} presenta una variación promedio de ${pct}% en el período ${period || 'actual'}, situándose ${status}.\n\n`

  // Coverage
  const coveragePct = fmt(completionRate, 0)
  narrative += `De un total de ${totalScopeKpis} KPIs organizacionales, ${approvedScopeKpis} cuentan con datos aprobados (cobertura del ${coveragePct}%).`
  if (completionRate != null && completionRate < 60) {
    narrative += ` La baja cobertura limita la representatividad del análisis.`
  }
  narrative += ` El resultado ponderado consolidado es de ${fmt(weightedResultTotal, 1)} puntos.\n\n`

  // Objectives
  if (objectiveNames.length > 0) {
    narrative += `Los objetivos estratégicos activos son: ${objectiveNames.slice(0, 4).join(', ')}${objectiveNames.length > 4 ? ` y ${objectiveNames.length - 4} más` : ''}.\n\n`
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

    narrative += `Análisis por área:`
    if (greenAreas.length) {
      narrative += ` ${greenAreas.length} unidad${greenAreas.length > 1 ? 'es' : ''} en track (${greenAreas.map((a) => a.name).slice(0, 3).join(', ')}).`
    }
    if (yellowAreas.length) {
      narrative += ` ${yellowAreas.length} bajo seguimiento (${yellowAreas.map((a) => a.name).slice(0, 3).join(', ')}).`
    }
    if (redAreas.length) {
      narrative += ` ${redAreas.length} en riesgo (${redAreas.map((a) => a.name).slice(0, 3).join(', ')}).`
    }
    narrative += `\n\n`
  }

  // Top risk
  if (topRisk.length > 0) {
    narrative += `KPIs con mayor rezago: `
    narrative += topRisk
      .slice(0, 3)
      .map((k) => `${k.name} en ${k.scopeName} (${fmt(k.variation)}%)`)
      .join('; ')
    narrative += `. Se recomienda revisar causas raíz y plan de acción.\n\n`
  }

  // Top performers
  if (topPerformers.length > 0) {
    narrative += `KPIs destacados: `
    narrative += topPerformers
      .slice(0, 3)
      .map((k) => `${k.name} en ${k.scopeName} (${fmt(k.variation)}%)`)
      .join('; ')
    narrative += `.\n\n`
  }

  // Closing recommendation
  if (averageVariation != null && averageVariation < 80) {
    narrative += `Recomendación: el rendimiento organizacional está por debajo del umbral crítico (80%). Se sugiere convocar una revisión ejecutiva con los responsables de las áreas en riesgo antes del cierre del período.`
  } else if (averageVariation != null && averageVariation < 100) {
    narrative += `Recomendación: el rendimiento está en zona de seguimiento. Se sugiere mantener el monitoreo semanal y asegurar cobertura completa de datos antes del cierre del subperíodo.`
  } else if (averageVariation != null) {
    narrative += `La organización está cumpliendo sus objetivos KPI. Se sugiere documentar las prácticas exitosas para replicarlas en el próximo período.`
  }

  return narrative.trim()
}
