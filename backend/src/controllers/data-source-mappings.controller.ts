import { Request, Response } from 'express'
import { pool } from '../config/database'

const normalizeExternalKey = (value: any) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const parseMetadata = (value: any) => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const validateEntityExists = async (entityType: string, entityId: number) => {
  if (entityType === 'collaborator') {
    const [rows] = await pool.query<any[]>('SELECT id FROM collaborators WHERE id = ? LIMIT 1', [entityId])
    return Array.isArray(rows) && rows.length > 0
  }
  if (entityType === 'org_scope') {
    const [rows] = await pool.query<any[]>('SELECT id FROM org_scopes WHERE id = ? LIMIT 1', [entityId])
    return Array.isArray(rows) && rows.length > 0
  }
  return false
}

type MappingInput = {
  externalKey: string
  externalLabel?: string | null
  metadata?: any
}

type SyncMappingsPayload = {
  sourceType: string
  entityType: 'collaborator' | 'org_scope'
  entityId: number
  mappings: MappingInput[]
}

const parseMappingsInput = (body: any): MappingInput[] => {
  if (Array.isArray(body?.mappings)) {
    return body.mappings
  }
  if (Array.isArray(body?.externalKeys)) {
    return body.externalKeys.map((externalKey: any) => ({ externalKey }))
  }
  if (typeof body?.externalKeys === 'string') {
    return String(body.externalKeys)
      .split(',')
      .map((externalKey) => ({ externalKey: externalKey.trim() }))
  }
  return []
}

const parseSyncPayload = (body: any): SyncMappingsPayload => ({
  sourceType: String(body?.sourceType || 'global').trim().toLowerCase(),
  entityType: String(body?.entityType || '').trim() as SyncMappingsPayload['entityType'],
  entityId: Number(body?.entityId || 0),
  mappings: parseMappingsInput(body),
})

const syncMappingsForEntity = async (connection: any, payload: SyncMappingsPayload) => {
  const { sourceType, entityType, entityId, mappings } = payload

  if (!['collaborator', 'org_scope'].includes(entityType)) {
    throw new Error('entityType soportado: collaborator, org_scope')
  }
  if (!Number.isFinite(entityId) || entityId <= 0) {
    throw new Error('entityId es requerido')
  }

  const exists = await validateEntityExists(entityType, entityId)
  if (!exists) {
    throw new Error('Entidad no encontrada para el mapping')
  }

  const deduped = new Map<string, { externalKey: string; externalLabel?: string | null; metadata?: any }>()
  mappings.forEach((item: any) => {
    const externalKey = String(item?.externalKey || item || '').trim()
    const normalizedKey = normalizeExternalKey(externalKey)
    if (!externalKey || !normalizedKey) return
    deduped.set(normalizedKey, {
      externalKey,
      externalLabel: item?.externalLabel ? String(item.externalLabel).trim() : null,
      metadata: item?.metadata ?? null,
    })
  })

  await connection.query(
    'DELETE FROM data_source_mappings WHERE sourceType = ? AND entityType = ? AND entityId = ?',
    [sourceType, entityType, entityId]
  )

  for (const [normalizedKey, mapping] of deduped.entries()) {
    await connection.query(
      `INSERT INTO data_source_mappings
       (sourceType, entityType, entityId, externalKey, normalizedKey, externalLabel, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        sourceType,
        entityType,
        entityId,
        mapping.externalKey,
        normalizedKey,
        mapping.externalLabel || null,
        mapping.metadata ? JSON.stringify(mapping.metadata) : null,
      ]
    )
  }

  return deduped.size
}

export const listDataSourceMappings = async (req: Request, res: Response) => {
  try {
    const { sourceType, entityType, entityId } = req.query
    let query = `
      SELECT id, sourceType, entityType, entityId, externalKey, normalizedKey, externalLabel, metadata, createdAt, updatedAt
      FROM data_source_mappings
      WHERE 1=1
    `
    const params: any[] = []
    if (sourceType) {
      query += ' AND sourceType = ?'
      params.push(String(sourceType))
    }
    if (entityType) {
      query += ' AND entityType = ?'
      params.push(String(entityType))
    }
    if (entityId) {
      query += ' AND entityId = ?'
      params.push(Number(entityId))
    }
    query += ' ORDER BY sourceType ASC, entityType ASC, entityId ASC, externalKey ASC'
    const [rows] = await pool.query<any[]>(query, params)
    res.json(
      Array.isArray(rows)
        ? rows.map((row) => ({
            ...row,
            metadata: row.metadata ? parseMetadata(row.metadata) : null,
          }))
        : []
    )
  } catch (error: any) {
    console.error('Error listing data source mappings:', error)
    res.status(500).json({ error: 'Error al obtener data source mappings' })
  }
}

export const syncDataSourceMappings = async (req: Request, res: Response) => {
  const connection = await pool.getConnection()
  try {
    const payload = parseSyncPayload(req.body)
    await connection.beginTransaction()
    const count = await syncMappingsForEntity(connection, payload)
    await connection.commit()
    res.json({ message: 'Mappings sincronizados', count })
  } catch (error: any) {
    await connection.rollback()
    console.error('Error syncing data source mappings:', error)
    const message = error?.message || 'Error al sincronizar data source mappings'
    const status = message === 'Entidad no encontrada para el mapping' ? 404 : 400
    res.status(status).json({ error: message })
  } finally {
    connection.release()
  }
}

export const bulkSyncDataSourceMappings = async (req: Request, res: Response) => {
  const connection = await pool.getConnection()
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items.map(parseSyncPayload) : []

    if (items.length === 0) {
      return res.status(400).json({ error: 'items es requerido y debe tener al menos un elemento' })
    }

    await connection.beginTransaction()
    let groups = 0
    let mappings = 0

    for (const item of items) {
      groups += 1
      mappings += await syncMappingsForEntity(connection, item)
    }

    await connection.commit()
    res.json({
      message: 'Mappings sincronizados por lote',
      groups,
      mappings,
    })
  } catch (error: any) {
    await connection.rollback()
    console.error('Error bulk syncing data source mappings:', error)
    const message = error?.message || 'Error al sincronizar data source mappings'
    const status = message === 'Entidad no encontrada para el mapping' ? 404 : 400
    res.status(status).json({ error: message })
  } finally {
    connection.release()
  }
}
