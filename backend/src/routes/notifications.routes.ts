import { Router } from 'express'
import { authenticate, requirePermission } from '../middleware/auth.middleware'
import { getNotificationSummary, triggerNotifications } from '../controllers/notifications.controller'

const router = Router()

router.use(authenticate)
router.get('/summary', requirePermission('config.manage', 'config.view'), getNotificationSummary)
router.post('/run', requirePermission('config.manage'), triggerNotifications)

export default router
