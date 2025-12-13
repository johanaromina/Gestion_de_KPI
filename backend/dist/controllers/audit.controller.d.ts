import { Request, Response } from 'express';
/**
 * Obtiene el historial de auditoría con filtros
 */
export declare const getAuditLogsController: (req: Request, res: Response) => Promise<void>;
/**
 * Obtiene el historial de auditoría para una entidad específica
 */
export declare const getEntityAuditHistory: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=audit.controller.d.ts.map