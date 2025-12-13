import { Request, Response } from 'express';
export declare const getDashboardStats: (req: Request, res: Response) => Promise<void>;
export declare const getAreaStats: (req: Request, res: Response) => Promise<void>;
export declare const getTeamStats: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getMyKPIs: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getTeamKPIs: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getComplianceByPeriod: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=dashboard.controller.d.ts.map