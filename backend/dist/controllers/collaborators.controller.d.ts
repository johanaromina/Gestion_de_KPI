import { Request, Response } from 'express';
export declare const getCollaborators: (req: Request, res: Response) => Promise<void>;
export declare const getCollaboratorById: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const createCollaborator: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateCollaborator: (req: Request, res: Response) => Promise<void>;
export declare const deleteCollaborator: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=collaborators.controller.d.ts.map