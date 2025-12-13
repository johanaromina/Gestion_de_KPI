import { Request, Response } from 'express';
export declare const getKPIs: (req: Request, res: Response) => Promise<void>;
export declare const getKPIById: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const createKPI: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateKPI: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteKPI: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=kpis.controller.d.ts.map