import { Request, Response } from 'express';
export declare const getCollaboratorKPIs: (req: Request, res: Response) => Promise<void>;
export declare const getCollaboratorKPIById: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getCollaboratorKPIsByCollaborator: (req: Request, res: Response) => Promise<void>;
export declare const getCollaboratorKPIsByPeriod: (req: Request, res: Response) => Promise<void>;
export declare const createCollaboratorKPI: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateCollaboratorKPI: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateActualValue: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const closeCollaboratorKPI: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const reopenCollaboratorKPI: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const proposeCollaboratorKPI: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const approveCollaboratorKPI: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const rejectCollaboratorKPI: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const closePeriodAssignments: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteCollaboratorKPI: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const generateBaseGrids: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getConsolidatedByCollaborator: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=collaborator-kpis.controller.d.ts.map