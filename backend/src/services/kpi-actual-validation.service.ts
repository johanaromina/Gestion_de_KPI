import { KPIDirection, KPIType } from '../types'

const resolveKpiDirection = (direction?: string | null, type?: string | null): KPIDirection => {
  if (direction === 'growth' || direction === 'reduction' || direction === 'exact') return direction
  if (type === 'growth' || type === 'reduction' || type === 'exact') return type as KPIDirection
  if (type === 'sla') return 'reduction'
  return 'growth'
}

type KpiActualValidationInput = {
  actual: number
  direction?: string | null
  type?: KPIType | string | null
  formula?: string | null
}

export const supportsNegativeActual = (input: Omit<KpiActualValidationInput, 'actual'>) => {
  if (input.formula && input.formula.trim()) return true
  return resolveKpiDirection(input.direction, input.type) !== 'reduction'
}

export const getActualValueValidationError = (input: KpiActualValidationInput): string | null => {
  const actualValue = Number(input.actual)

  if (!Number.isFinite(actualValue)) {
    return 'El valor actual debe ser numérico'
  }

  if (actualValue < 0 && !supportsNegativeActual(input)) {
    return 'Este KPI no admite valores negativos en el alcance'
  }

  return null
}
