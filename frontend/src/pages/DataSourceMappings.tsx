import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { Collaborator, DataSourceMapping, OrgScope } from '../types'
import { useDialog } from '../components/Dialog'
import {
  DEFAULT_MAPPING_SOURCE_TYPE,
  getMappingSourceTypeLabel,
  MAPPING_SOURCE_TYPE_OPTIONS,
  normalizeMappingSourceType,
  parseExternalKeysText,
} from '../utils/dataSourceMappings'
import './Configuracion.css'
import './DataSourceMappings.css'

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

const normalizeSearch = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Sin cambios'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Sin cambios'
  return parsed.toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

const buildEntityDescriptor = (
  entityType: DataSourceMapping['entityType'],
  entityId: number,
  collaborators: Collaborator[],
  orgScopes: OrgScope[]
) => {
  if (entityType === 'collaborator') {
    const collaborator = collaborators.find((item) => Number(item.id) === Number(entityId))
    return {
      name: collaborator?.name || `Colaborador #${entityId}`,
      subtitle: collaborator ? `${collaborator.position || 'Sin posición'} · ${collaborator.area || 'Sin área'}` : 'No encontrado',
      active: collaborator?.status !== 'inactive',
    }
  }

  const scope = orgScopes.find((item) => Number(item.id) === Number(entityId))
  return {
    name: scope?.name || `Scope #${entityId}`,
    subtitle: scope ? `${scope.type}${scope.parentId ? ` · parent ${scope.parentId}` : ''}` : 'No encontrado',
    active: scope?.active !== false,
  }
}

const buildGroupedMappings = (
  mappings: DataSourceMapping[],
  collaborators: Collaborator[],
  orgScopes: OrgScope[]
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
      const descriptor = buildEntityDescriptor(first.entityType, first.entityId, collaborators, orgScopes)
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
  orgScopes: OrgScope[]
) => {
  const merged = new Map(baseGroups.map((group) => [group.groupKey, group]))

  Object.entries(pendingGroupsByKey).forEach(([groupKey, pendingGroup]) => {
    if (merged.has(groupKey)) return
    const descriptor = buildEntityDescriptor(pendingGroup.entityType, pendingGroup.entityId, collaborators, orgScopes)
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
        setToastMessage('Mapping actualizado correctamente.')
      },
      onError: (error: any) => {
        void dialog.alert(error?.response?.data?.error || 'No se pudo guardar el mapping', { title: 'Error', variant: 'danger' })
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
        setToastMessage('Mappings guardados por lote.')
      },
      onError: (error: any) => {
        void dialog.alert(error?.response?.data?.error || 'No se pudieron guardar los mappings', { title: 'Error', variant: 'danger' })
      },
    }
  )

  const createGroupMutation = useMutation(
    async () => {
      const entityId = Number(createForm.entityId)
      if (!entityId) {
        throw new Error('Seleccioná una entidad para crear el mapping')
      }
      const externalKeys = parseExternalKeysText(createForm.externalKeysText)
      if (externalKeys.length === 0) {
        throw new Error('Ingresá al menos una clave externa')
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
        setToastMessage('Grupo de mappings creado correctamente.')
      },
      onError: (error: any) => {
        void dialog.alert(error instanceof Error ? error.message : error?.response?.data?.error || 'No se pudo crear el mapping', { title: 'Error', variant: 'danger' })
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
  const baseGroups = buildGroupedMappings(mappings, collaborators, orgScopes)
  const existingGroupKeys = new Set(baseGroups.map((group) => group.groupKey))
  const groups = mergePendingGroups(baseGroups, pendingGroupsByKey, collaborators, orgScopes)
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
            label: `${collaborator.name} · ${collaborator.position || 'Sin posición'} · ${collaborator.area || 'Sin área'}`,
          }))
      : orgScopes
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((scope) => ({
            id: scope.id,
            label: `${scope.name} · ${scope.type}`,
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
      throw new Error('El archivo CSV está vacío')
    }

    const headers = parseCsvLine(lines[0]).map(normalizeHeader)
    const headerIndex = (name: string) => headers.indexOf(normalizeHeader(name))
    const idxSourceType = headerIndex('sourcetype')
    const idxEntityType = headerIndex('entitytype')
    const idxEntityId = headerIndex('entityid')
    const idxExternalKeys = headerIndex('externalkeys')

    if (idxSourceType < 0 || idxEntityType < 0 || idxEntityId < 0 || idxExternalKeys < 0) {
      throw new Error('El CSV debe incluir columnas sourceType, entityType, entityId y externalKeys')
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
        errors.push(`Fila ${lineIndex + 1}: entityType inválido`)
        continue
      }
      if (!entityId || Number.isNaN(entityId)) {
        errors.push(`Fila ${lineIndex + 1}: entityId inválido`)
        continue
      }

      const entityExists =
        entityType === 'collaborator'
          ? collaborators.some((item) => Number(item.id) === entityId)
          : orgScopes.some((item) => Number(item.id) === entityId)

      if (!entityExists) {
        errors.push(`Fila ${lineIndex + 1}: la entidad ${entityType}#${entityId} no existe`)
        continue
      }

      const groupKey = buildGroupKey(sourceType, entityType, entityId)
      if (!existingGroupKeys.has(groupKey) && !externalKeysText) {
        errors.push(`Fila ${lineIndex + 1}: no hay claves externas para crear un grupo nuevo`)
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
      throw new Error(errors[0] || 'No se pudo importar ninguna fila')
    }

    setToastMessage(
      errors.length > 0
        ? `CSV importado: ${imported} filas cargadas, ${errors.length} omitidas.`
        : `CSV importado: ${imported} filas cargadas.`
    )
  }

  const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      await handleImportCsv(file)
    } catch (error: any) {
      void dialog.alert(error?.message || 'No se pudo importar el CSV', { title: 'Error al importar', variant: 'danger' })
    }
  }

  return (
    <div className="config-page mappings-page">
      <div className="page-header">
        <h1>Mappings Externos</h1>
        <p className="subtitle">
          Administrá aliases y claves externas por conector para colaboradores y scopes, con edición por lote.
        </p>
        {toastMessage ? <div className="toast">{toastMessage}</div> : null}
      </div>

      <div className="mapping-summary-grid">
        <div className="card mapping-stat-card">
          <div className="mapping-stat-value">{groups.length}</div>
          <div className="mapping-stat-label">Grupos configurados</div>
        </div>
        <div className="card mapping-stat-card">
          <div className="mapping-stat-value">{mappings.length}</div>
          <div className="mapping-stat-label">Claves externas</div>
        </div>
        <div className="card mapping-stat-card">
          <div className="mapping-stat-value">{dirtyGroups.length}</div>
          <div className="mapping-stat-label">Cambios pendientes</div>
        </div>
      </div>

      <div className="mapping-toolbar">
        <div className="card">
          <div className="card-header">
            <h2>Filtros</h2>
          </div>
          <div className="mapping-filters-grid">
            <div className="mapping-field">
              <label htmlFor="mapping-search">Buscar</label>
              <input
                id="mapping-search"
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Entidad, clave, source type..."
              />
            </div>
            <div className="mapping-field">
              <label htmlFor="mapping-source-filter">Source type</label>
              <select
                id="mapping-source-filter"
                value={sourceTypeFilter}
                onChange={(event) => setSourceTypeFilter(event.target.value)}
              >
                <option value="all">Todos</option>
                {MAPPING_SOURCE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mapping-field">
              <label htmlFor="mapping-entity-filter">Tipo de entidad</label>
              <select
                id="mapping-entity-filter"
                value={entityTypeFilter}
                onChange={(event) => setEntityTypeFilter(event.target.value as EntityTypeFilter)}
              >
                <option value="all">Todas</option>
                <option value="collaborator">Colaborador</option>
                <option value="org_scope">Scope</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Acciones</h2>
          </div>
          <div className="mapping-actions-panel">
            <p className="empty-hint">
              Editá varias filas, exportalas a CSV o importá un archivo para precargar cambios antes de guardar.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="mapping-file-input"
              onChange={handleFileSelected}
            />
            <div className="mapping-action-buttons">
              <button className="btn-ghost" type="button" onClick={handleTemplateDownload}>
                Descargar plantilla
              </button>
              <button className="btn-ghost" type="button" onClick={handleExportCsv}>
                Exportar visibles
              </button>
              <button className="btn-ghost" type="button" onClick={() => fileInputRef.current?.click()}>
                Importar CSV
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
                Descartar cambios
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={dirtyGroups.length === 0 || bulkSaveMutation.isLoading}
                onClick={handleSaveAll}
              >
                {bulkSaveMutation.isLoading ? 'Guardando...' : `Guardar ${dirtyGroups.length} cambios`}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Nuevo grupo de mappings</h2>
        </div>
        <div className="mapping-create-grid">
          <div className="mapping-field">
            <label htmlFor="mapping-create-source">Source type</label>
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
              {MAPPING_SOURCE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mapping-field">
            <label htmlFor="mapping-create-entity-type">Tipo de entidad</label>
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
              <option value="collaborator">Colaborador</option>
              <option value="org_scope">Scope</option>
            </select>
          </div>
          <div className="mapping-field">
            <label htmlFor="mapping-create-entity">Entidad</label>
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
              <option value="">Seleccioná una entidad</option>
              {availableEntities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mapping-field mapping-field-wide">
            <label htmlFor="mapping-create-keys">Claves externas</label>
            <textarea
              id="mapping-create-keys"
              value={createForm.externalKeysText}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  externalKeysText: event.target.value,
                }))
              }
              placeholder="Separá aliases por coma. Ej: johana, j.garcia, jgarcia@empresa.com"
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
            {createGroupMutation.isLoading ? 'Guardando...' : 'Crear grupo'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Grupos existentes</h2>
          <span className="muted">{loading ? 'Cargando...' : `${filteredGroups.length} visibles`}</span>
        </div>

        {filteredGroups.length === 0 ? (
          <div className="empty-hint">No hay mappings para los filtros actuales.</div>
        ) : (
          <div className="mapping-table-wrap">
            <table className="config-table mapping-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Tipo</th>
                  <th>Entidad</th>
                  <th>Claves externas</th>
                  <th>Estado</th>
                  <th>Actualizado</th>
                  <th>Acciones</th>
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
                        <span className="mapping-chip">{getMappingSourceTypeLabel(group.sourceType)}</span>
                      </td>
                      <td>{group.entityType === 'collaborator' ? 'Colaborador' : 'Scope'}</td>
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
                        <div className="mapping-row-meta">{group.mappingsCount} claves guardadas</div>
                        {isPendingOnly ? (
                          <div className="mapping-row-meta">Nuevo grupo cargado desde CSV o pendiente de alta.</div>
                        ) : null}
                      </td>
                      <td>
                        <span className={`status-pill ${group.active ? 'ok' : 'review'}`}>
                          {group.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>{formatDateTime(group.updatedAt)}</td>
                      <td>
                        <div className="action-buttons">
                          <button className="btn-ghost" type="button" onClick={() => handleResetDraft(group)}>
                            Reset
                          </button>
                          <button
                            className="btn-secondary"
                            type="button"
                            onClick={() => handleDraftChange(group.groupKey, '')}
                          >
                            Vaciar
                          </button>
                          <button
                            className="btn-primary"
                            type="button"
                            disabled={saveGroupMutation.isLoading || !isDirty}
                            onClick={() => handleSaveGroup(group)}
                          >
                            Guardar
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
