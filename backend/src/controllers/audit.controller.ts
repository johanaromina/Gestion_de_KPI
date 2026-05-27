import { Request, Response } from 'express'
import { getAuditLogs, getAuditHistory } from '../utils/audit'
import { EntityType, AuditAction } from '../utils/audit'
import { logger } from '../utils/logger'
import { sendApiError } from '../utils/api-errors'

/**
 * Obtiene el historial de auditoría con filtros
 */
export const getAuditLogsController = async (req: Request, res: Response) => {
  try {
    const {
      entityType,
      entityId,
      action,
      userId,
      startDate,
      endDate,
      limit,
      offset,
    } = req.query

    const filters: any = {}

    if (entityType) {
      filters.entityType = entityType as EntityType
    }

    if (entityId) {
      filters.entityId = parseInt(entityId as string)
    }

    if (action) {
      filters.action = action as AuditAction
    }

    if (userId) {
      filters.userId = parseInt(userId as string)
    }

    if (startDate) {
      filters.startDate = new Date(startDate as string)
    }

    if (endDate) {
      filters.endDate = new Date(endDate as string)
    }

    if (limit) {
      filters.limit = parseInt(limit as string)
    }

    if (offset) {
      filters.offset = parseInt(offset as string)
    }

    const result = await getAuditLogs(filters)

    res.json({
      logs: result.logs,
      total: result.total,
      limit: filters.limit || null,
      offset: filters.offset || null,
    })
  } catch (error: any) {
    logger.error('Error fetching audit logs:', error)
    return sendApiError(res, 500, 'AUDIT_LOGS_FETCH_FAILED', 'Error al obtener logs de auditoría')
  }
}

/**
 * Obtiene el historial de auditoría para una entidad específica
 */
export const getEntityAuditHistory = async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.params

    if (!entityType || !entityId) {
      return sendApiError(res, 400, 'AUDIT_FIELDS_REQUIRED', 'entityType y entityId son requeridos')
    }

    const history = await getAuditHistory(
      entityType as EntityType,
      parseInt(entityId)
    )

    res.json(history)
  } catch (error: any) {
    logger.error('Error fetching entity audit history:', error)
    return sendApiError(res, 500, 'AUDIT_HISTORY_FETCH_FAILED', 'Error al obtener historial de auditoría')
  }
}

