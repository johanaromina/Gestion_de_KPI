import { Router } from 'express'
import { authenticate, requirePermission } from '../middleware/auth.middleware'
import {
  bulkSyncDataSourceMappings,
  listDataSourceMappings,
  syncDataSourceMappings,
} from '../controllers/data-source-mappings.controller'

const router = Router()

router.use(authenticate)

router.get('/', requirePermission('config.view', 'config.manage'), listDataSourceMappings)
router.post('/sync', requirePermission('config.manage'), syncDataSourceMappings)
router.post('/bulk-sync', requirePermission('config.manage'), bulkSyncDataSourceMappings)

export default router
