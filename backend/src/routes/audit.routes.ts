import { Router } from 'express'
import {
  getAuditLogsController,
  getEntityAuditHistory,
} from '../controllers/audit.controller'

const router = Router()

router.get('/audit-logs', getAuditLogsController)
router.get('/audit-logs/:entityType/:entityId', getEntityAuditHistory)

export default router

