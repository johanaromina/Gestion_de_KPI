import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.middleware'
import {
  getCheckIns,
  getCurrentWeekCheckIn,
  upsertCheckIn,
  getTeamCheckInSummary,
} from '../controllers/check-ins.controller'

const router = Router()

router.use(authenticate)

router.get('/', getCheckIns)
router.get('/current-week', getCurrentWeekCheckIn)
router.post('/', upsertCheckIn)
router.get('/team-summary', authorize('admin', 'director', 'manager', 'leader'), getTeamCheckInSummary)

export default router
