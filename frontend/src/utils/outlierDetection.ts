/**
 * Statistical outlier detection for KPI values.
 * Uses z-score when N >= 4, percentage deviation for smaller samples.
 * No external API required — pure in-browser math.
 */

export type OutlierSeverity = 'none' | 'low' | 'medium' | 'high'

export interface OutlierAnalysis {
  isOutlier: boolean
  severity: OutlierSeverity
  zScore: number | null
  mean: number | null
  std: number | null
  sampleSize: number
  direction: 'above' | 'below' | null
  percentageDeviation: number | null
  message: string | null
}

const EMPTY: OutlierAnalysis = {
  isOutlier: false,
  severity: 'none',
  zScore: null,
  mean: null,
  std: null,
  sampleSize: 0,
  direction: null,
  percentageDeviation: null,
  message: null,
}

/**
 * Detect whether `value` is an outlier relative to `historicalValues`.
 * Returns a full analysis including severity and human-readable message.
 */
export function detectOutlier(
  value: number,
  historicalValues: number[]
): OutlierAnalysis {
  const valid = historicalValues.filter((v) => Number.isFinite(v))
  if (valid.length === 0) return EMPTY

  const n = valid.length
  const mean = valid.reduce((a, b) => a + b, 0) / n

  // Percentage deviation from mean (always useful)
  const percentageDeviation = mean !== 0 ? ((value - mean) / Math.abs(mean)) * 100 : null
  const direction: 'above' | 'below' | null =
    percentageDeviation == null ? null : value > mean ? 'above' : 'below'

  // For very small samples (N < 4) rely only on percentage deviation
  if (n < 4) {
    if (percentageDeviation == null) return EMPTY
    const abs = Math.abs(percentageDeviation)
    if (abs >= 80) {
      return {
        isOutlier: true,
        severity: 'high',
        zScore: null,
        mean,
        std: null,
        sampleSize: n,
        direction,
        percentageDeviation,
        message: buildMessage('high', direction, abs, mean, n),
      }
    }
    if (abs >= 50) {
      return {
        isOutlier: true,
        severity: 'medium',
        zScore: null,
        mean,
        std: null,
        sampleSize: n,
        direction,
        percentageDeviation,
        message: buildMessage('medium', direction, abs, mean, n),
      }
    }
    if (abs >= 30) {
      return {
        isOutlier: false, // warning, not blocking
        severity: 'low',
        zScore: null,
        mean,
        std: null,
        sampleSize: n,
        direction,
        percentageDeviation,
        message: buildMessage('low', direction, abs, mean, n),
      }
    }
    return EMPTY
  }

  // Z-score method for N >= 4
  const variance = valid.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / n
  const std = Math.sqrt(variance)
  if (std === 0) {
    // All historical values are identical — any deviation is anomalous
    if (value !== mean) {
      const abs = percentageDeviation != null ? Math.abs(percentageDeviation) : 0
      const severity: OutlierSeverity = abs >= 50 ? 'high' : abs >= 20 ? 'medium' : 'low'
      return {
        isOutlier: severity !== 'low',
        severity,
        zScore: null,
        mean,
        std: 0,
        sampleSize: n,
        direction,
        percentageDeviation,
        message: buildMessage(severity, direction, abs, mean, n),
      }
    }
    return EMPTY
  }

  const zScore = Math.abs((value - mean) / std)
  const abs = percentageDeviation != null ? Math.abs(percentageDeviation) : 0

  if (zScore >= 3) {
    return {
      isOutlier: true,
      severity: 'high',
      zScore,
      mean,
      std,
      sampleSize: n,
      direction,
      percentageDeviation,
      message: buildMessage('high', direction, abs, mean, n),
    }
  }
  if (zScore >= 2.5) {
    return {
      isOutlier: true,
      severity: 'medium',
      zScore,
      mean,
      std,
      sampleSize: n,
      direction,
      percentageDeviation,
      message: buildMessage('medium', direction, abs, mean, n),
    }
  }
  if (zScore >= 2) {
    return {
      isOutlier: false,
      severity: 'low',
      zScore,
      mean,
      std,
      sampleSize: n,
      direction,
      percentageDeviation,
      message: buildMessage('low', direction, abs, mean, n),
    }
  }

  return EMPTY
}

function buildMessage(
  severity: OutlierSeverity,
  direction: 'above' | 'below' | null,
  absDeviation: number,
  mean: number,
  sampleSize: number
): string {
  const dir = direction === 'above' ? 'por encima' : 'por debajo'
  const dev = absDeviation.toFixed(0)
  const meanFmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(mean)
  const sample = `${sampleSize} período${sampleSize !== 1 ? 's' : ''} previo${sampleSize !== 1 ? 's' : ''}`

  if (severity === 'high') {
    return `Valor inusualmente ${dir} del promedio histórico (${dev}% de desviación vs. media ${meanFmt} en ${sample}). Revisá si el dato es correcto antes de proponer.`
  }
  if (severity === 'medium') {
    return `Valor fuera del rango habitual (${dev}% ${dir} de la media ${meanFmt} en ${sample}). Considerá agregar un comentario explicativo.`
  }
  return `Valor levemente alejado del historial (${dev}% ${dir} de la media ${meanFmt} en ${sample}).`
}
