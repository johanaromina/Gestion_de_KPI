export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';
export type EntityType = 'collaborators' | 'kpis' | 'collaborator_kpis' | 'periods' | 'sub_periods' | 'objective_trees';
export interface AuditLog {
    id: number;
    entityType: EntityType;
    entityId: number;
    action: AuditAction;
    userId?: number;
    userName?: string;
    oldValues?: any;
    newValues?: any;
    changes?: any;
    ipAddress?: string;
    userAgent?: string;
    createdAt: Date;
}
export interface AuditOptions {
    userId?: number;
    userName?: string;
    ipAddress?: string;
    userAgent?: string;
}
/**
 * Registra un cambio en la tabla de auditoría
 */
export declare function logAudit(entityType: EntityType, entityId: number, action: AuditAction, oldValues?: any, newValues?: any, options?: AuditOptions): Promise<void>;
/**
 * Obtiene el historial de auditoría para una entidad específica
 */
export declare function getAuditHistory(entityType: EntityType, entityId: number): Promise<AuditLog[]>;
/**
 * Obtiene el historial de auditoría con filtros
 */
export declare function getAuditLogs(filters: {
    entityType?: EntityType;
    entityId?: number;
    action?: AuditAction;
    userId?: number;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
}): Promise<{
    logs: AuditLog[];
    total: number;
}>;
//# sourceMappingURL=audit.d.ts.map