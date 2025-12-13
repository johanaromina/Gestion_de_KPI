import { Request, Response } from 'express';
export declare const getObjectiveTrees: (req: Request, res: Response) => Promise<void>;
export declare const getObjectiveTreeById: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const createObjectiveTree: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateObjectiveTree: (req: Request, res: Response) => Promise<void>;
export declare const deleteObjectiveTree: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=objective-trees.controller.d.ts.map