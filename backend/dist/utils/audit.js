import { pool } from '../config/database';
/**
 * Registra un cambio en la tabla de auditoría
 */
export async function logAudit(entityType, entityId, action, oldValues, newValues, options) {
    try {
        // Calcular cambios específicos
        const changes = calculateChanges(oldValues, newValues);
        await pool.query(`INSERT INTO audit_logs 
       (entityType, entityId, action, userId, userName, oldValues, newValues, changes, ipAddress, userAgent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            entityType,
            entityId,
            action,
            options?.userId || null,
            options?.userName || null,
            oldValues ? JSON.stringify(oldValues) : null,
            newValues ? JSON.stringify(newValues) : null,
            changes ? JSON.stringify(changes) : null,
            options?.ipAddress || null,
            options?.userAgent || null,
        ]);
    }
    catch (error) {
        // No fallar la operación principal si falla la auditoría
        console.error('Error logging audit:', error);
    }
}
/**
 * Calcula los cambios específicos entre valores antiguos y nuevos
 */
function calculateChanges(oldValues, newValues) {
    if (!oldValues || !newValues) {
        return null;
    }
    const changes = {};
    // Comparar cada campo
    for (const key in newValues) {
        if (oldValues[key] !== newValues[key]) {
            changes[key] = {
                old: oldValues[key],
                new: newValues[key],
            };
        }
    }
    return Object.keys(changes).length > 0 ? changes : null;
}
/**
 * Obtiene el historial de auditoría para una entidad específica
 */
export async function getAuditHistory(entityType, entityId) {
    try {
        const [rows] = await pool.query(`SELECT * FROM audit_logs 
       WHERE entityType = ? AND entityId = ?
       ORDER BY createdAt DESC`, [entityType, entityId]);
        return (Array.isArray(rows) ? rows : []).map((row) => ({
            ...row,
            oldValues: row.oldValues ? JSON.parse(row.oldValues) : null,
            newValues: row.newValues ? JSON.parse(row.newValues) : null,
            changes: row.changes ? JSON.parse(row.changes) : null,
            createdAt: new Date(row.createdAt),
        }));
    }
    catch (error) {
        console.error('Error fetching audit history:', error);
        return [];
    }
}
/**
 * Obtiene el historial de auditoría con filtros
 */
export async function getAuditLogs(filters) {
    try {
        let query = 'SELECT * FROM audit_logs WHERE 1=1';
        const params = [];
        if (filters.entityType) {
            query += ' AND entityType = ?';
            params.push(filters.entityType);
        }
        if (filters.entityId) {
            query += ' AND entityId = ?';
            params.push(filters.entityId);
        }
        if (filters.action) {
            query += ' AND action = ?';
            params.push(filters.action);
        }
        if (filters.userId) {
            query += ' AND userId = ?';
            params.push(filters.userId);
        }
        if (filters.startDate) {
            query += ' AND createdAt >= ?';
            params.push(filters.startDate);
        }
        if (filters.endDate) {
            query += ' AND createdAt <= ?';
            params.push(filters.endDate);
        }
        // Contar total
        const [countRows] = await pool.query(query.replace('SELECT *', 'SELECT COUNT(*) as total'));
        const total = Array.isArray(countRows) && countRows.length > 0
            ? countRows[0].total
            : 0;
        // Obtener logs con paginación
        query += ' ORDER BY createdAt DESC';
        if (filters.limit) {
            query += ' LIMIT ?';
            params.push(filters.limit);
            if (filters.offset) {
                query += ' OFFSET ?';
                params.push(filters.offset);
            }
        }
        const [rows] = await pool.query(query, params);
        const logs = (Array.isArray(rows) ? rows : []).map((row) => ({
            ...row,
            oldValues: row.oldValues ? JSON.parse(row.oldValues) : null,
            newValues: row.newValues ? JSON.parse(row.newValues) : null,
            changes: row.changes ? JSON.parse(row.changes) : null,
            createdAt: new Date(row.createdAt),
        }));
        return { logs, total };
    }
    catch (error) {
        console.error('Error fetching audit logs:', error);
        return { logs: [], total: 0 };
    }
}
//# sourceMappingURL=audit.js.map