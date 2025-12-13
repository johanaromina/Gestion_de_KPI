import { Request, Response } from 'express';
/**
 * Exporta la parrilla de un colaborador en PDF
 */
export declare const exportParrillaPDF: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * Exporta la parrilla de un colaborador en Excel
 */
export declare const exportParrillaExcel: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=export.controller.d.ts.map