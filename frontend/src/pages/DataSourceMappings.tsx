import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { Collaborator, DataSourceMapping, OrgScope } from '../types'
import { useDialog } from '../components/Dialog'
import { resolveApiErrorMessage } from '../utils/apiErrors'
import {
  DEFAULT_MAPPING_SOURCE_TYPE,
  MAPPING_SOURCE_TYPE_OPTIONS,
  normalizeMappingSourceType,
  parseExternalKeysText,
} from '../utils/dataSourceMappings'
import './Configuracion.css'
import './DataSourceMappings.css'

const DATASOURCE_API_ERROR_KEYS: Record<string, string> = {
  DATASOURCE_MAPPING_ENTITY_TYPE_INVALID: 'datasource:errors.api_errors.entity_type_invalid',
  DATASOURCE_MAPPING_ENTITY_ID_REQUIRED: 'datasource:errors.api_errors.entity_id_required',
  DATASOURCE_MAPPING_ENTITY_NOT_FOUND: 'datasource:errors.api_errors.entity_not_found',
  DATASOURCE_MAPPING_ITEMS_REQUIRED: 'datasource:errors.api_errors.items_required',
}

type EntityTypeFilter = 'all' | DataSourceMapping['entityType']

type MappingGroup = {
  groupKey: string
  sourceType: string
  entityType: DataSourceMapping['entityType']
  entityId: number
  entityName: string
  entitySubtitle: string
  externalKeysText: string
  mappingsCount: number
  updatedAt: string | null
  active: boolean
}

type PendingGroup = {
  sourceType: string
  entityType: DataSourceMapping['entityType']
  entityId: number
}

type EntityDescriptorStrings = {
  noPosition: string
  noArea: string
  notFound: string
  collaboratorFallback: string
  scopeFallback: string
  parentLabel: string
  scopeTypeLabel: (value?: string | null) => string
}

const normalizeSearch = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()

const buildGroupKey = (sourceType: string, entityType: DataSourceMapping['entityType'], entityId: number) =>
  `${normalizeMappingSourceType(sourceType)}::${entityType}::${entityId}`

const buildExternalKeysText = (mappings: DataSourceMapping[]) => mappings.map((mapping) => mapping.externalKey).join(', ')

const normalizeExternalKeysText = (value: string) =>
  parseExternalKeysText(value)
    .map((item) => item.toLowerCase())
    .sort()
    .join('|')

const parseCsvLine = (line: string) => {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  result.push(current)
  return result.map((value) => value.trim())
}

const normalizeHeader = (header: string) =>
  String(header || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')

const escapeCsvValue = (value: any) => {
  const normalized = String(value ?? '')
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`
  }
  return normalized
}

const downloadCsvFile = (filename: string, headers: string[], rows: any[][]) => {
  const csv = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

const buildEntityDescriptor = (
  entityType: DataSourceMapping['entityType'],
  entityId: number,
  collaborators: Collaborator[],
  orgScopes: OrgScope[],
  strings: EntityDescriptorStrings
) => {
  if (entityType === 'collaborator') {
    const collaborator = collaborators.find((item) => Number(item.id) === Number(entityId))
    return {
      name: collaborator?.name || strings.collaboratorFallback.replace('{{id}}', String(entityId)),
      subtitle: collaborator
        ? `${collaborator.position || strings.noPosition} · ${collaborator.area || strings.noArea}`
        : strings.notFound,
      active: collaborator?.status !== 'inactive',
    }
  }

  const scope = orgScopes.find((item) => Number(item.id) === Number(entityId))
  return {
    name: scope?.name || strings.scopeFallback.replace('{{id}}', String(entityId)),
    subtitle: scope
      ? `${strings.scopeTypeLabel(scope.type)}${scope.parentId ? ` · ${strings.parentLabel} ${scope.parentId}` : ''}`
      : strings.notFound,
    active: scope?.active !== false,
  }
}

const buildGroupedMappings = (
  mappings: DataSourceMapping[],
  collaborators: Collaborator[],
  orgScopes: OrgScope[],
  strings: EntityDescriptorStrings
): MappingGroup[] => {
  const groups = new Map<string, DataSourceMapping[]>()

  mappings.forEach((mapping) => {
    const key = buildGroupKey(mapping.sourceType, mapping.entityType, mapping.entityId)
    const current = groups.get(key) || []
    current.push(mapping)
    groups.set(key, current)
  })

  return Array.from(groups.entries())
    .map(([groupKey, groupMappings]) => {
      const first = groupMappings[0]
      const descriptor = buildEntityDescriptor(first.entityType, first.entityId, collaborators, orgScopes, strings)
      const updatedAt =
        groupMappings
          .map((item) => item.updatedAt || item.createdAt || null)
          .filter(Boolean)
          .sort()
          .slice(-1)[0] || null

      return {
        groupKey,
        sourceType: normalizeMappingSourceType(first.sourceType),
        entityType: first.entityType,
        entityId: Number(first.entityId),
        entityName: descriptor.name,
        entitySubtitle: descriptor.subtitle,
        externalKeysText: buildExternalKeysText(groupMappings),
        mappingsCount: groupMappings.length,
        updatedAt,
        active: descriptor.active,
      }
    })
    .sort((a, b) => {
      if (a.sourceType !== b.sourceType) return a.sourceType.localeCompare(b.sourceType)
      if (a.entityType !== b.entityType) return a.entityType.localeCompare(b.entityType)
      return a.entityName.localeCompare(b.entityName)
    })
}

const mergePendingGroups = (
  baseGroups: MappingGroup[],
  pendingGroupsByKey: Record<string, PendingGroup>,
  collaborators: Collaborator[],
  orgScopes: OrgScope[],
  strings: EntityDescriptorStrings
) => {
  const merged = new Map(baseGroups.map((group) => [group.groupKey, group]))

  Object.entries(pendingGroupsByKey).forEach(([groupKey, pendingGroup]) => {
    if (merged.has(groupKey)) return
    const descriptor = buildEntityDescriptor(pendingGroup.entityType, pendingGroup.entityId, collaborators, orgScopes, strings)
    merged.set(groupKey, {
      groupKey,
      sourceType: pendingGroup.sourceType,
      entityType: pendingGroup.entityType,
      entityId: pendingGroup.entityId,
      entityName: descriptor.name,
      entitySubtitle: descriptor.subtitle,
      externalKeysText: '',
      mappingsCount: 0,
      updatedAt: null,
      active: descriptor.active,
    })
  })

  return Array.from(merged.values()).sort((a, b) => {
    if (a.sourceType !== b.sourceType) return a.sourceType.localeCompare(b.sourceType)
    if (a.entityType !== b.entityType) return a.entityType.localeCompare(b.entityType)
    return a.entityName.localeCompare(b.entityName)
  })
}

export default function DataSourceMappings() {
  const { t, i18n } = useTranslation(['datasource', 'organigrama'])
  const locale = i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'es-AR'
  const queryClient = useQueryClient()
  const { canConfig, isLoading: authLoading } = useAuth()
  const dialog = useDialog()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [search, setSearch] = useState('')
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>('all')
  const [entityTypeFilter, setEntityTypeFilter] = useState<EntityTypeFilter>('all')
  const [draftsByGroup, setDraftsByGroup] = useState<Record<string, string>>({})
  const [pendingGroupsByKey, setPendingGroupsByKey] = useState<Record<string, PendingGroup>>({})
  const [toastMessage, setToastMessage] = useState('')
  const [createForm, setCreateForm] = useState({
    sourceType: DEFAULT_MAPPING_SOURCE_TYPE,
    entityType: 'collaborator' as DataSourceMapping['entityType'],
    entityId: '',
    externalKeysText: '',
  })

  const sourceTypeOptions = MAPPING_SOURCE_TYPE_OPTIONS.map((option) => ({
    ...option,
    label: t(`source_types.${option.value}`, { defaultValue: option.label }),
  }))
  const getSourceTypeLabel = (value: string) =>
    sourceTypeOptions.find((option) => option.value === normalizeMappingSourceType(value))?.label || value

  const formatDateTime = (value?: string | null) => {
    if (!value) return t('table.no_changes')
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return t('table.no_changes')
    return parsed.toLocaleString(locale, {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  }

  const entityStrings: EntityDescriptorStrings = {
    noPosition: t('table.no_position'),
    noArea: t('table.no_area'),
    notFound: t('table.not_found'),
    collaboratorFallback: t('table.collaborator_fallback', { id: '{{id}}' }),
    scopeFallback: t('table.scope_fallback', { id: '{{id}}' }),
    parentLabel: t('table.parent_label'),
    scopeTypeLabel: (value?: string | null) =>
      t(`organigrama:types.${String(value || '').toLowerCase()}`, { defaultValue: value || '-' }),
  }

  const { data: collaborators = [], isLoading: collaboratorsLoading } = useQuery<Collaborator[]>(
    'mapping-collaborators',
    async () => {
      const response = await api.get('/collaborators', { params: { includeInactive: true } })
      return response.data
    },
    { enabled: canConfig }
  )

  const { data: orgScopes = [], isLoading: scopesLoading } = useQuery<OrgScope[]>(
    'mapping-org-scopes',
    async () => {
      const response = await api.get('/org-scopes')
      return response.data
    },
    { enabled: canConfig }
  )

  const { data: mappings = [], isLoading: mappingsLoading } = useQuery<DataSourceMapping[]>(
    'data-source-mappings',
    async () => {
      const response = await api.get('/data-source-mappings')
      return response.data
    },
    { enabled: canConfig }
  )

  const saveGroupMutation = useMutation(
    async ({
      sourceType,
      entityType,
      entityId,
      externalKeysText,
    }: {
      sourceType: string
      entityType: DataSourceMapping['entityType']
      entityId: number
      externalKeysText: string
    }) => {
      await api.post('/data-source-mappings/sync', {
        sourceType,
        entityType,
        entityId,
        externalKeys: parseExternalKeysText(externalKeysText),
      })
      return {
        groupKey: buildGroupKey(sourceType, entityType, entityId),
      }
    },
    {
      onSuccess: (result) => {
        queryClient.invalidateQueries('data-source-mappings')
        setDraftsByGroup((current) => {
          const next = { ...current }
          delete next[result.groupKey]
          return next
        })
        setPendingGroupsByKey((current) => {
          const next = { ...current }
          delete next[result.groupKey]
          return next
        })
        setToastMessage(t('toast.saved'))
      },
      onError: (error: any) => {
        void dialog.alert(
          resolveApiErrorMessage(error, t, {
            codeMap: DATASOURCE_API_ERROR_KEYS,
            fallbackKey: 'errors.save_error',
          }),
          { title: t('errors.error_title'), variant: 'danger' }
        )
      },
    }
  )

  const bulkSaveMutation = useMutation(
    async (
      items: Array<{
        sourceType: string
        entityType: DataSourceMapping['entityType']
        entityId: number
        externalKeysText: string
      }>
    ) => {
      await api.post('/data-source-mappings/bulk-sync', {
        items: items.map((item) => ({
          sourceType: item.sourceType,
          entityType: item.entityType,
          entityId: item.entityId,
          externalKeys: parseExternalKeysText(item.externalKeysText),
        })),
      })
      return items.map((item) => buildGroupKey(item.sourceType, item.entityType, item.entityId))
    },
    {
      onSuccess: (groupKeys) => {
        queryClient.invalidateQueries('data-source-mappings')
        setDraftsByGroup((current) => {
          const next = { ...current }
          groupKeys.forEach((groupKey) => delete next[groupKey])
          return next
        })
        setPendingGroupsByKey((current) => {
          const next = { ...current }
          groupKeys.forEach((groupKey) => delete next[groupKey])
          return next
        })
        setToastMessage(t('toast.saved_bulk'))
      },
      onError: (error: any) => {
        void dialog.alert(
          resolveApiErrorMessage(error, t, {
            codeMap: DATASOURCE_API_ERROR_KEYS,
            fallbackKey: 'errors.save_bulk_error',
          }),
          { title: t('errors.error_title'), variant: 'danger' }
        )
      },
    }
  )

  const createGroupMutation = useMutation(
    async () => {
      const entityId = Number(createForm.entityId)
      if (!entityId) {
        throw new Error(t('errors.create_entity_required'))
      }
      const externalKeys = parseExternalKeysText(createForm.externalKeysText)
      if (externalKeys.length === 0) {
        throw new Error(t('errors.create_keys_required'))
      }

      await api.post('/data-source-mappings/sync', {
        sourceType: createForm.sourceType,
        entityType: createForm.entityType,
        entityId,
        externalKeys,
      })

      return buildGroupKey(createForm.sourceType, createForm.entityType, entityId)
    },
    {
      onSuccess: (groupKey) => {
        queryClient.invalidateQueries('data-source-mappings')
        setPendingGroupsByKey((current) => {
          const next = { ...current }
          delete next[groupKey]
          return next
        })
        setDraftsByGroup((current) => {
          const next = { ...current }
          delete next[groupKey]
          return next
        })
        setCreateForm({
          sourceType: DEFAULT_MAPPING_SOURCE_TYPE,
          entityType: 'collaborator',
          entityId: '',
          externalKeysText: '',
        })
        setToastMessage(t('toast.created'))
      },
      onError: (error: any) => {
        void dialog.alert(
          error instanceof Error
            ? error.message
            : resolveApiErrorMessage(error, t, {
                codeMap: DATASOURCE_API_ERROR_KEYS,
                fallbackKey: 'errors.create_error',
              }),
          { title: t('errors.error_title'), variant: 'danger' }
        )
      },
    }
  )

  useEffect(() => {
    if (!toastMessage) return
    const timeoutId = window.setTimeout(() => setToastMessage(''), 2500)
    return () => window.clearTimeout(timeoutId)
  }, [toastMessage])

  if (!authLoading && !canConfig) {
    return <Navigate to="/" replace />
  }

  const loading = authLoading || collaboratorsLoading || scopesLoading || mappingsLoading
  const baseGroups = buildGroupedMappings(mappings, collaborators, orgScopes, entityStrings)
  const existingGroupKeys = new Set(baseGroups.map((group) => group.groupKey))
  const groups = mergePendingGroups(baseGroups, pendingGroupsByKey, collaborators, orgScopes, entityStrings)
  const normalizedSearch = normalizeSearch(search)
  const filteredGroups = groups.filter((group) => {
    if (sourceTypeFilter !== 'all' && group.sourceType !== sourceTypeFilter) return false
    if (entityTypeFilter !== 'all' && group.entityType !== entityTypeFilter) return false
    if (!normalizedSearch) return true
    const haystack = normalizeSearch(
      `${group.entityName} ${group.entitySubtitle} ${group.externalKeysText} ${group.sourceType} ${group.entityType}`
    )
    return haystack.includes(normalizedSearch)
  })

  const dirtyGroups = groups.filter((group) => {
    const draft = draftsByGroup[group.groupKey]
    if (typeof draft !== 'string') return false
    return normalizeExternalKeysText(draft) !== normalizeExternalKeysText(group.externalKeysText)
  })

  const availableEntities =
    createForm.entityType === 'collaborator'
      ? collaborators
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((collaborator) => ({
            id: collaborator.id,
            label: `${collaborator.name} · ${collaborator.position || t('table.no_position')} · ${collaborator.area || t('table.no_area')}`,
          }))
      : orgScopes
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((scope) => ({
            id: scope.id,
            label: `${scope.name} · ${t(`organigrama:types.${String(scope.type || '').toLowerCase()}`, { defaultValue: scope.type })}`,
          }))

  const handleDraftChange = (groupKey: string, value: string) => {
    setDraftsByGroup((current) => ({
      ...current,
      [groupKey]: value,
    }))
  }

  const handleResetDraft = (group: MappingGroup) => {
    setDraftsByGroup((current) => {
      const next = { ...current }
      delete next[group.groupKey]
      return next
    })

    if (pendingGroupsByKey[group.groupKey] && group.mappingsCount === 0) {
      setPendingGroupsByKey((current) => {
        const next = { ...current }
        delete next[group.groupKey]
        return next
      })
    }
  }

  const handleSaveGroup = (group: MappingGroup) => {
    const externalKeysText = draftsByGroup[group.groupKey] ?? group.externalKeysText
    saveGroupMutation.mutate({
      sourceType: group.sourceType,
      entityType: group.entityType,
      entityId: group.entityId,
      externalKeysText,
    })
  }

  const handleSaveAll = () => {
    if (dirtyGroups.length === 0) return
    bulkSaveMutation.mutate(
      dirtyGroups.map((group) => ({
        sourceType: group.sourceType,
        entityType: group.entityType,
        entityId: group.entityId,
        externalKeysText: draftsByGroup[group.groupKey] ?? group.externalKeysText,
      }))
    )
  }

  const handleTemplateDownload = () => {
    downloadCsvFile('plantilla_data_source_mappings.csv', ['sourceType', 'entityType', 'entityId', 'entityName', 'externalKeys'], [])
  }

  const handleExportCsv = () => {
    const rows = filteredGroups.map((group) => [
      group.sourceType,
      group.entityType,
      group.entityId,
      group.entityName,
      draftsByGroup[group.groupKey] ?? group.externalKeysText,
    ])
    downloadCsvFile(
      `data_source_mappings_${new Date().toISOString().slice(0, 10)}.csv`,
      ['sourceType', 'entityType', 'entityId', 'entityName', 'externalKeys'],
      rows
    )
  }

  const handleImportCsv = async (file: File) => {
    const text = await file.text()
    const lines = text.split(/\r?\n/).filter((line) => line.trim())

    if (lines.length === 0) {
      throw new Error(t('errors.csv_empty'))
    }

    const headers = parseCsvLine(lines[0]).map(normalizeHeader)
    const headerIndex = (name: string) => headers.indexOf(normalizeHeader(name))
    const idxSourceType = headerIndex('sourcetype')
    const idxEntityType = headerIndex('entitytype')
    const idxEntityId = headerIndex('entityid')
    const idxExternalKeys = headerIndex('externalkeys')

    if (idxSourceType < 0 || idxEntityType < 0 || idxEntityId < 0 || idxExternalKeys < 0) {
      throw new Error(t('errors.csv_missing_columns'))
    }

    const nextDrafts: Record<string, string> = {}
    const nextPendingGroups: Record<string, PendingGroup> = {}
    const errors: string[] = []
    let imported = 0

    for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
      const row = parseCsvLine(lines[lineIndex])
      const sourceType = normalizeMappingSourceType(row[idxSourceType] || DEFAULT_MAPPING_SOURCE_TYPE)
      const entityType = String(row[idxEntityType] || '').trim() as DataSourceMapping['entityType']
      const entityId = Number(row[idxEntityId] || 0)
      const externalKeysText = String(row[idxExternalKeys] || '').trim()

      if (!['collaborator', 'org_scope'].includes(entityType)) {
        errors.push(t('errors.csv_invalid_entity_type', { row: lineIndex + 1 }))
        continue
      }
      if (!entityId || Number.isNaN(entityId)) {
        errors.push(t('errors.csv_invalid_entity_id', { row: lineIndex + 1 }))
        continue
      }

      const entityExists =
        entityType === 'collaborator'
          ? collaborators.some((item) => Number(item.id) === entityId)
          : orgScopes.some((item) => Number(item.id) === entityId)

      if (!entityExists) {
        errors.push(t('errors.csv_entity_not_found', { row: lineIndex + 1, type: entityType, id: entityId }))
        continue
      }

      const groupKey = buildGroupKey(sourceType, entityType, entityId)
      if (!existingGroupKeys.has(groupKey) && !externalKeysText) {
        errors.push(t('errors.csv_no_keys_new', { row: lineIndex + 1 }))
        continue
      }

      nextDrafts[groupKey] = externalKeysText
      if (!existingGroupKeys.has(groupKey)) {
        nextPendingGroups[groupKey] = {
          sourceType,
          entityType,
          entityId,
        }
      }
      imported += 1
    }

    setDraftsByGroup((current) => ({
      ...current,
      ...nextDrafts,
    }))
    setPendingGroupsByKey((current) => ({
      ...current,
      ...nextPendingGroups,
    }))

    if (imported === 0) {
      throw new Error(errors[0] || t('errors.csv_no_rows'))
    }

    setToastMessage(
      errors.length > 0
        ? t('toast.csv_imported_errors', { count: imported, errors: errors.length })
        : t('toast.csv_imported', { count: imported })
    )
  }

  const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      await handleImportCsv(file)
    } catch (error: any) {
      void dialog.alert(error?.message || t('errors.csv_import_error'), { title: t('errors.csv_import_error_title'), variant: 'danger' })
    }
  }

  return (
    <div className="config-page mappings-page">
      <div className="page-header">
        <h1>{t('title')}</h1>
        <p className="subtitle">{t('subtitle')}</p>
        {toastMessage ? <div className="toast">{toastMessage}</div> : null}
      </div>

      <div className="mapping-summary-grid">
        <div className="card mapping-stat-card">
          <div className="mapping-stat-value">{groups.length}</div>
          <div className="mapping-stat-label">{t('stats.groups')}</div>
        </div>
        <div className="card mapping-stat-card">
          <div className="mapping-stat-value">{mappings.length}</div>
          <div className="mapping-stat-label">{t('stats.keys')}</div>
        </div>
        <div className="card mapping-stat-card">
          <div className="mapping-stat-value">{dirtyGroups.length}</div>
          <div className="mapping-stat-label">{t('stats.pending')}</div>
        </div>
      </div>

      <div className="mapping-toolbar">
        <div className="card">
          <div className="card-header">
            <h2>{t('filters.title')}</h2>
          </div>
          <div className="mapping-filters-grid">
            <div className="mapping-field">
              <label htmlFor="mapping-search">{t('filters.search_label')}</label>
              <div className="mapping-search-wrap">
                <input
                  id="mapping-search"
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('filters.search_placeholder')}
                />
                {search && (
                  <button
                    className="mapping-clear-input"
                    type="button"
                    onClick={() => setSearch('')}
                    title={t('filters.search_clear_title')}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            <div className="mapping-field">
              <label htmlFor="mapping-source-filter">{t('filters.source_label')}</label>
              <select
                id="mapping-source-filter"
                value={sourceTypeFilter}
                onChange={(event) => setSourceTypeFilter(event.target.value)}
              >
                <option value="all">{t('filters.source_all')}</option>
                {sourceTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mapping-field">
              <label htmlFor="mapping-entity-filter">{t('filters.entity_label')}</label>
              <select
                id="mapping-entity-filter"
                value={entityTypeFilter}
                onChange={(event) => setEntityTypeFilter(event.target.value as EntityTypeFilter)}
              >
                <option value="all">{t('filters.entity_all')}</option>
                <option value="collaborator">{t('filters.entity_collaborator')}</option>
                <option value="org_scope">{t('filters.entity_scope')}</option>
              </select>
            </div>
            {(search || sourceTypeFilter !== 'all' || entityTypeFilter !== 'all') && (
              <div className="mapping-field mapping-field-clear">
                <label>&nbsp;</label>
                <button
                  className="btn-ghost mapping-btn-clear-filters"
                  type="button"
                  onClick={() => {
                    setSearch('')
                    setSourceTypeFilter('all')
                    setEntityTypeFilter('all')
                  }}
                >
                  {t('filters.clear_filters')}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>{t('actions.title')}</h2>
          </div>
          <div className="mapping-actions-panel">
            <p className="empty-hint">{t('actions.hint')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="mapping-file-input"
              onChange={handleFileSelected}
            />
            <div className="mapping-action-buttons">
              <button className="btn-ghost" type="button" onClick={handleTemplateDownload}>
                {t('actions.download_template')}
              </button>
              <button className="btn-ghost" type="button" onClick={handleExportCsv}>
                {t('actions.export')}
              </button>
              <button className="btn-ghost" type="button" onClick={() => fileInputRef.current?.click()}>
                {t('actions.import_csv')}
              </button>
              <button
                className="btn-secondary"
                type="button"
                disabled={dirtyGroups.length === 0}
                onClick={() => {
                  setDraftsByGroup({})
                  setPendingGroupsByKey({})
                }}
              >
                {t('actions.discard')}
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={dirtyGroups.length === 0 || bulkSaveMutation.isLoading}
                onClick={handleSaveAll}
              >
                {bulkSaveMutation.isLoading ? t('actions.saving') : t('actions.save_all', { count: dirtyGroups.length })}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>{t('create.title')}</h2>
        </div>
        <div className="mapping-create-grid">
          <div className="mapping-field">
            <label htmlFor="mapping-create-source">{t('create.source_label')}</label>
            <select
              id="mapping-create-source"
              value={createForm.sourceType}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  sourceType: event.target.value,
                }))
              }
            >
              {sourceTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mapping-field">
            <label htmlFor="mapping-create-entity-type">{t('create.entity_type_label')}</label>
            <select
              id="mapping-create-entity-type"
              value={createForm.entityType}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  entityType: event.target.value as DataSourceMapping['entityType'],
                  entityId: '',
                }))
              }
            >
              <option value="collaborator">{t('create.entity_collaborator')}</option>
              <option value="org_scope">{t('create.entity_scope')}</option>
            </select>
          </div>
          <div className="mapping-field">
            <label htmlFor="mapping-create-entity">{t('create.entity_label')}</label>
            <select
              id="mapping-create-entity"
              value={createForm.entityId}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  entityId: event.target.value,
                }))
              }
            >
              <option value="">{t('create.entity_placeholder')}</option>
              {availableEntities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mapping-field mapping-field-wide">
            <label htmlFor="mapping-create-keys">{t('create.keys_label')}</label>
            <textarea
              id="mapping-create-keys"
              value={createForm.externalKeysText}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  externalKeysText: event.target.value,
                }))
              }
              placeholder={t('create.keys_placeholder')}
            />
          </div>
        </div>
        <div className="actions">
          <button
            className="btn-primary"
            type="button"
            disabled={createGroupMutation.isLoading}
            onClick={() => createGroupMutation.mutate()}
          >
            {createGroupMutation.isLoading ? t('create.saving') : t('create.submit')}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>{t('table.title')}</h2>
          <span className="muted">
            {loading ? t('table.loading') : t('table.visible', { count: filteredGroups.length })}
          </span>
        </div>

        {filteredGroups.length === 0 ? (
          <div className="empty-hint">{t('table.empty')}</div>
        ) : (
          <div className="mapping-table-wrap">
            <table className="config-table mapping-table">
              <thead>
                <tr>
                  <th>{t('table.col_source')}</th>
                  <th>{t('table.col_type')}</th>
                  <th>{t('table.col_entity')}</th>
                  <th>{t('table.col_keys')}</th>
                  <th>{t('table.col_status')}</th>
                  <th>{t('table.col_updated')}</th>
                  <th>{t('table.col_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map((group) => {
                  const draftValue = draftsByGroup[group.groupKey] ?? group.externalKeysText
                  const isDirty =
                    normalizeExternalKeysText(draftValue) !== normalizeExternalKeysText(group.externalKeysText)
                  const isPendingOnly = !!pendingGroupsByKey[group.groupKey] && group.mappingsCount === 0

                  return (
                    <tr key={group.groupKey} className={isDirty ? 'mapping-row-dirty' : ''}>
                      <td>
                        <span className="mapping-chip">{getSourceTypeLabel(group.sourceType)}</span>
                      </td>
                      <td>
                        {group.entityType === 'collaborator'
                          ? t('filters.entity_collaborator')
                          : t('filters.entity_scope')}
                      </td>
                      <td>
                        <div className="mapping-entity-name">{group.entityName}</div>
                        <div className="mapping-entity-subtitle">{group.entitySubtitle}</div>
                      </td>
                      <td>
                        <textarea
                          className="mapping-keys-textarea"
                          value={draftValue}
                          onChange={(event) => handleDraftChange(group.groupKey, event.target.value)}
                        />
                        <div className="mapping-row-meta">{t('table.keys_saved', { count: group.mappingsCount })}</div>
                        {isPendingOnly ? (
                          <div className="mapping-row-meta">{t('table.pending_note')}</div>
                        ) : null}
                      </td>
                      <td>
                        <span className={`status-pill ${group.active ? 'ok' : 'review'}`}>
                          {group.active ? t('table.active') : t('table.inactive')}
                        </span>
                      </td>
                      <td>{formatDateTime(group.updatedAt)}</td>
                      <td>
                        <div className="action-buttons">
                          <button className="btn-ghost" type="button" onClick={() => handleResetDraft(group)}>
                            {t('table.btn_reset')}
                          </button>
                          <button
                            className="btn-secondary"
                            type="button"
                            onClick={() => handleDraftChange(group.groupKey, '')}
                          >
                            {t('table.btn_clear')}
                          </button>
                          <button
                            className="btn-primary"
                            type="button"
                            disabled={saveGroupMutation.isLoading || !isDirty}
                            onClick={() => handleSaveGroup(group)}
                          >
                            {t('table.btn_save')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
