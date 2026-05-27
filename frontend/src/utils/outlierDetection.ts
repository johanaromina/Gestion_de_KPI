/**
 * Statistical outlier detection for KPI values.
 * Uses z-score when N >= 4, percentage deviation for smaller samples.
 * No external API required — pure in-browser math.
 */
import i18n from '../i18n'

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

const resolveLocale = (locale?: string) =>
  locale || ((i18n.resolvedLanguage || i18n.language || 'es').startsWith('en') ? 'en-US' : 'es-AR')

const tOutlier = (key: string, options?: Record<string, unknown>) =>
  i18n.t(`assignments:outlier_messages.${key}`, options)

/**
 * Detect whether `value` is an outlier relative to `historicalValues`.
 * Returns a full analysis including severity and human-readable message.
 */
export function detectOutlier(
  value: number,
  historicalValues: number[],
  locale?: string,
  sampleLabel?: (count: number) => string
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
        message: buildMessage('high', direction, abs, mean, n, locale, sampleLabel),
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
        message: buildMessage('medium', direction, abs, mean, n, locale, sampleLabel),
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
        message: buildMessage('low', direction, abs, mean, n, locale, sampleLabel),
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
        message: buildMessage(severity, direction, abs, mean, n, locale, sampleLabel),
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
      message: buildMessage('high', direction, abs, mean, n, locale, sampleLabel),
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
      message: buildMessage('medium', direction, abs, mean, n, locale, sampleLabel),
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
      message: buildMessage('low', direction, abs, mean, n, locale, sampleLabel),
    }
  }

  return EMPTY
}

function buildMessage(
  severity: OutlierSeverity,
  direction: 'above' | 'below' | null,
  absDeviation: number,
  mean: number,
  sampleSize: number,
  locale?: string,
  sampleLabel?: (count: number) => string
): string {
  const resolvedLocale = resolveLocale(locale)
  const dir = direction === 'below'
    ? tOutlier('direction_below')
    : tOutlier('direction_above')
  const dev = absDeviation.toFixed(0)
  const meanFmt = new Intl.NumberFormat(resolvedLocale, { maximumFractionDigits: 1 }).format(mean)
  const sample = sampleLabel?.(sampleSize) ?? tOutlier('sample', { count: sampleSize })

  if (severity === 'high') {
    return tOutlier('high', {
      direction: dir,
      deviation: dev,
      mean: meanFmt,
      sample,
    })
  }
  if (severity === 'medium') {
    return tOutlier('medium', {
      direction: dir,
      deviation: dev,
      mean: meanFmt,
      sample,
    })
  }
  return tOutlier('low', {
    direction: dir,
    deviation: dev,
    mean: meanFmt,
    sample,
  })
}
