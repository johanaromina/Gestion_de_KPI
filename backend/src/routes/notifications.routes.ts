import { Router } from 'express'
import { authenticate, requirePermission } from '../middleware/auth.middleware'
import {
  getNotificationSummary,
  triggerNotifications,
  getSlackConfig,
  saveSlackConfig,
  deleteSlackConfig,
  testSlackConfig,
  getEmailStatus,
  testEmail,
} from '../controllers/notifications.controller'

const router = Router()

router.use(authenticate)
router.get('/summary', requirePermission('config.manage', 'config.view'), getNotificationSummary)
router.post('/run', requirePermission('config.manage'), triggerNotifications)

// Email
router.get('/email-status', requirePermission('config.manage', 'config.view'), getEmailStatus)
router.post('/test-email', requirePermission('config.manage'), testEmail)

// Slack
router.get('/slack-config', requirePermission('config.manage', 'config.view'), getSlackConfig)
router.post('/slack-config', requirePermission('config.manage'), saveSlackConfig)
router.delete('/slack-config', requirePermission('config.manage'), deleteSlackConfig)
router.post('/slack-config/test', requirePermission('config.manage'), testSlackConfig)

export default router
