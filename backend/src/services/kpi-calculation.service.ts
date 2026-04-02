import { calculateVariation, calculateWeightedResult } from '../utils/kpi-formulas'

export const resolveKpiDirection = (direction?: string | null, type?: string | null) => {
  if (direction === 'growth' || direction === 'reduction' || direction === 'exact') return direction
  if (type === 'growth' || type === 'reduction' || type === 'exact') return type
  if (type === 'sla') return 'reduction'
  return 'growth'
}

export const calculateKpiResult = (params: {
  target: number
  actual: number
  weight: number
  direction?: string | null
  type?: string | null
  formula?: string | null
}) => {
  const variation = calculateVariation(
    resolveKpiDirection(params.direction, params.type),
    Number(params.target),
    Number(params.actual),
    params.formula || undefined
  )
  const weightedResult = calculateWeightedResult(variation, Number(params.weight))
  return { variation, weightedResult }
}
