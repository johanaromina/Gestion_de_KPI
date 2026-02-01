export const resolveDirection = (
  assignmentDirection?: string,
  kpiDirection?: string,
  type?: string
) => {
  if (assignmentDirection === 'growth' || assignmentDirection === 'reduction' || assignmentDirection === 'exact') {
    return assignmentDirection
  }
  if (kpiDirection === 'growth' || kpiDirection === 'reduction' || kpiDirection === 'exact') {
    return kpiDirection
  }
  if (type === 'growth' || type === 'reduction' || type === 'exact') return type
  if (type === 'sla') return 'reduction'
  return 'growth'
}

export const calculateVariationPercent = (
  direction: string,
  target?: number | null,
  actual?: number | null
): number | null => {
  const targetValue = Number(target ?? 0)
  const actualValue =
    actual !== null && actual !== undefined ? Number(actual) : null

  if (!Number.isFinite(targetValue) || targetValue <= 0) return null
  if (actualValue === null || !Number.isFinite(actualValue)) return null

  switch (direction) {
    case 'reduction':
      if (actualValue <= 0) return 0
      return (targetValue / actualValue) * 100
    case 'exact': {
      const diff = Math.abs(actualValue - targetValue)
      const percentageDiff = (diff / targetValue) * 100
      return Math.max(0, 100 - percentageDiff)
    }
    case 'growth':
    default:
      if (actualValue <= 0) return 0
      return (actualValue / targetValue) * 100
  }
}

export const calculateWeightedImpact = (
  variation: number | null,
  kpiWeight?: number | null,
  subPeriodWeight?: number | null
): number | null => {
  if (variation === null || variation === undefined || Number.isNaN(variation)) return null
  const weightValue = Number(kpiWeight ?? 0)
  if (!Number.isFinite(weightValue) || weightValue <= 0) return 0
  const subWeightValue = Number(subPeriodWeight ?? 100)
  const normalizedSubWeight = Number.isFinite(subWeightValue) && subWeightValue > 0 ? subWeightValue : 100
  return (variation * (weightValue / 100)) * (normalizedSubWeight / 100)
}
