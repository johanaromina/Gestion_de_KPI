import { Router } from 'express';
import { getDashboardStats, getAreaStats, getTeamStats, getMyKPIs, getTeamKPIs, getComplianceByPeriod, } from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/auth.middleware';
const router = Router();
// Todas las rutas requieren autenticación
router.use(authenticate);
router.get('/stats', getDashboardStats);
router.get('/area-stats', getAreaStats);
router.get('/team-stats/:leaderId', getTeamStats);
router.get('/my-kpis/:collaboratorId', getMyKPIs);
router.get('/team-kpis/:collaboratorId', getTeamKPIs);
router.get('/compliance-by-period', getComplianceByPeriod);
export default router;
//# sourceMappingURL=dashboard.routes.js.map