import { Request, Response } from 'express';
export declare const getSubPeriods: (req: Request, res: Response) => Promise<void>;
export declare const getSubPeriodById: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const createSubPeriod: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateSubPeriod: (req: Request, res: Response) => Promise<void>;
export declare const deleteSubPeriod: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=sub-periods.controller.d.ts.map