import { getAuditLogs, getAuditHistory } from '../utils/audit';
/**
 * Obtiene el historial de auditoría con filtros
 */
export const getAuditLogsController = async (req, res) => {
    try {
        const { entityType, entityId, action, userId, startDate, endDate, limit, offset, } = req.query;
        const filters = {};
        if (entityType) {
            filters.entityType = entityType;
        }
        if (entityId) {
            filters.entityId = parseInt(entityId);
        }
        if (action) {
            filters.action = action;
        }
        if (userId) {
            filters.userId = parseInt(userId);
        }
        if (startDate) {
            filters.startDate = new Date(startDate);
        }
        if (endDate) {
            filters.endDate = new Date(endDate);
        }
        if (limit) {
            filters.limit = parseInt(limit);
        }
        if (offset) {
            filters.offset = parseInt(offset);
        }
        const result = await getAuditLogs(filters);
        res.json({
            logs: result.logs,
            total: result.total,
            limit: filters.limit || null,
            offset: filters.offset || null,
        });
    }
    catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ error: 'Error al obtener logs de auditoría' });
    }
};
/**
 * Obtiene el historial de auditoría para una entidad específica
 */
export const getEntityAuditHistory = async (req, res) => {
    try {
        const { entityType, entityId } = req.params;
        if (!entityType || !entityId) {
            return res.status(400).json({
                error: 'entityType y entityId son requeridos',
            });
        }
        const history = await getAuditHistory(entityType, parseInt(entityId));
        res.json(history);
    }
    catch (error) {
        console.error('Error fetching entity audit history:', error);
        res.status(500).json({ error: 'Error al obtener historial de auditoría' });
    }
};
//# sourceMappingURL=audit.controller.js.map