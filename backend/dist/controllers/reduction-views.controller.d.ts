import { Request, Response } from 'express';
/**
 * Obtiene todos los KPIs de tipo reducción con sus asignaciones y evolución temporal
 */
export declare const getReductionKPIs: (req: Request, res: Response) => Promise<void>;
/**
 * Obtiene estadísticas agregadas de reducción
 */
export declare const getReductionStatistics: (req: Request, res: Response) => Promise<void>;
/**
 * Obtiene evolución temporal de un KPI de reducción específico
 */
export declare const getReductionEvolution: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=reduction-views.controller.d.ts.map