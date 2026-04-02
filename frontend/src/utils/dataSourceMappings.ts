import { DataSourceMapping } from '../types'

export const DEFAULT_MAPPING_SOURCE_TYPE = 'global'

export const MAPPING_SOURCE_TYPE_OPTIONS = [
  { value: 'global', label: 'Global' },
  { value: 'looker', label: 'Looker' },
  { value: 'generic_api', label: 'Generic API' },
  { value: 'jira', label: 'Jira' },
  { value: 'xray', label: 'Xray' },
  { value: 'sheets', label: 'Google Sheets' },
] as const

export const normalizeMappingSourceType = (value?: string | null) =>
  String(value || DEFAULT_MAPPING_SOURCE_TYPE)
    .trim()
    .toLowerCase() || DEFAULT_MAPPING_SOURCE_TYPE

export const parseExternalKeysText = (value: string) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

export const buildExternalKeysTextBySourceType = (
  mappings: DataSourceMapping[] | undefined,
  entityType: DataSourceMapping['entityType'],
  entityId?: number | null
) => {
  const grouped = new Map<string, string[]>()

  ;(mappings || []).forEach((mapping) => {
    if (mapping.entityType !== entityType) return
    if (entityId && Number(mapping.entityId) !== Number(entityId)) return
    const sourceType = normalizeMappingSourceType(mapping.sourceType)
    const current = grouped.get(sourceType) || []
    current.push(mapping.externalKey)
    grouped.set(sourceType, current)
  })

  const result: Record<string, string> = {
    [DEFAULT_MAPPING_SOURCE_TYPE]: '',
  }

  grouped.forEach((keys, sourceType) => {
    result[sourceType] = keys.join(', ')
  })

  return result
}

export const getSourceTypesToSync = (
  valuesBySourceType: Record<string, string>,
  existingMappings?: DataSourceMapping[],
  entityType?: DataSourceMapping['entityType'],
  entityId?: number | null
) => {
  const sourceTypes = new Set<string>([DEFAULT_MAPPING_SOURCE_TYPE])

  Object.keys(valuesBySourceType || {}).forEach((sourceType) => {
    sourceTypes.add(normalizeMappingSourceType(sourceType))
  })

  ;(existingMappings || []).forEach((mapping) => {
    if (entityType && mapping.entityType !== entityType) return
    if (entityId && Number(mapping.entityId) !== Number(entityId)) return
    sourceTypes.add(normalizeMappingSourceType(mapping.sourceType))
  })

  return Array.from(sourceTypes)
}

export const getMappingSourceTypeLabel = (value: string) =>
  MAPPING_SOURCE_TYPE_OPTIONS.find((option) => option.value === normalizeMappingSourceType(value))?.label ||
  value
