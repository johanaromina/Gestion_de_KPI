import { KPIDirection, KPIType } from '../types'

export const VALID_KPI_TYPES: KPIType[] = ['manual', 'count', 'ratio', 'sla', 'value']
const VALID_KPI_DIRECTIONS: KPIDirection[] = ['growth', 'reduction', 'exact']

export const parseKpiName = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized : null
}

export const parseKpiType = (value: unknown): KPIType | null => {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return VALID_KPI_TYPES.includes(normalized as KPIType) ? (normalized as KPIType) : null
}

export const resolveKpiDirectionInput = (type: KPIType, direction: unknown): KPIDirection => {
  if (typeof direction === 'string') {
    const normalized = direction.trim().toLowerCase()
    if (VALID_KPI_DIRECTIONS.includes(normalized as KPIDirection)) {
      return normalized as KPIDirection
    }
  }

  return type === 'sla' ? 'reduction' : 'growth'
}
