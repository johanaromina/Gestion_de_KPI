import { Router } from 'express'
import {
  getDashboardStats,
  getAreaStats,
  getTeamStats,
  getMyKPIs,
  getTeamKPIs,
  getComplianceByPeriod,
  getExecutiveTree,
  getExecutiveTrends,
} from '../controllers/dashboard.controller'
import { authenticate, authorize } from '../middleware/auth.middleware'

const router = Router()

// Todas las rutas requieren autenticación
router.use(authenticate)

router.get('/stats', getDashboardStats)
router.get('/area-stats', getAreaStats)
router.get('/team-stats/:leaderId', getTeamStats)
router.get('/my-kpis/:collaboratorId', getMyKPIs)
router.get('/team-kpis/:collaboratorId', getTeamKPIs)
router.get('/compliance-by-period', getComplianceByPeriod)
router.get('/executive-tree', authorize('admin', 'director', 'manager', 'leader'), getExecutiveTree)
router.get('/executive-trends', authorize('admin', 'director', 'manager', 'leader'), getExecutiveTrends)

export default router

