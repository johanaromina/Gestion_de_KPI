import { Router } from 'express'
import {
  getCollaboratorPermissions,
  listPermissions,
  toggleSuperpowers,
  updateCollaboratorPermissions,
} from '../controllers/config.controller'
import { authenticate, requirePermission } from '../middleware/auth.middleware'

const router = Router()

router.use(authenticate)

router.get('/permissions', listPermissions)
router.get('/collaborators/:collaboratorId/permissions', requirePermission('config.view', 'config.manage'), getCollaboratorPermissions)
router.put('/collaborators/:collaboratorId/permissions', requirePermission('config.manage'), updateCollaboratorPermissions)
router.patch('/collaborators/:collaboratorId/superpowers', requirePermission('config.manage'), toggleSuperpowers)

export default router
