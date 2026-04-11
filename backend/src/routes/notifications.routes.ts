import { Router } from 'express'
import { authenticate, requirePermission } from '../middleware/auth.middleware'
import {
  getNotificationSummary,
  triggerNotifications,
  getSlackConfig,
  saveSlackConfig,
  deleteSlackConfig,
  testSlackConfig,
} from '../controllers/notifications.controller'

const router = Router()

router.use(authenticate)
router.get('/summary', requirePermission('config.manage', 'config.view'), getNotificationSummary)
router.post('/run', requirePermission('config.manage'), triggerNotifications)

// Slack
router.get('/slack-config', requirePermission('config.manage', 'config.view'), getSlackConfig)
router.post('/slack-config', requirePermission('config.manage'), saveSlackConfig)
router.delete('/slack-config', requirePermission('config.manage'), deleteSlackConfig)
router.post('/slack-config/test', requirePermission('config.manage'), testSlackConfig)

export default router
