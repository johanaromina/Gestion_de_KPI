import { Request, Response } from 'express';
export declare const getPeriods: (req: Request, res: Response) => Promise<void>;
export declare const getPeriodById: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getSubPeriodsByPeriod: (req: Request, res: Response) => Promise<void>;
export declare const createPeriod: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updatePeriod: (req: Request, res: Response) => Promise<void>;
export declare const closePeriod: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const reopenPeriod: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deletePeriod: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=periods.controller.d.ts.map