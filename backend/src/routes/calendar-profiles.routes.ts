import { Router } from 'express'
import { authenticate, requirePermission } from '../middleware/auth.middleware'
import {
  listCalendarProfiles,
  createCalendarProfile,
  updateCalendarProfile,
  deleteCalendarProfile,
} from '../controllers/calendar-profiles.controller'

const router = Router()

router.use(authenticate)

router.get('/', requirePermission('config.view', 'config.manage'), listCalendarProfiles)
router.post('/', requirePermission('config.manage'), createCalendarProfile)
router.put('/:id', requirePermission('config.manage'), updateCalendarProfile)
router.delete('/:id', requirePermission('config.manage'), deleteCalendarProfile)

export default router
