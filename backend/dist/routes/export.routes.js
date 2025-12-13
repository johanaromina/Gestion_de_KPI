import { Router } from 'express';
import { exportParrillaPDF, exportParrillaExcel } from '../controllers/export.controller';
const router = Router();
router.get('/parrilla/:collaboratorId/:periodId/pdf', exportParrillaPDF);
router.get('/parrilla/:collaboratorId/:periodId/excel', exportParrillaExcel);
export default router;
//# sourceMappingURL=export.routes.js.map