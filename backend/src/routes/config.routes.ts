import { Router } from 'express'
import {
  getCollaboratorPermissions,
  listPermissions,
  listRoles,
  assignRoleToCollaborator,
  toggleSuperpowers,
  updateCollaboratorPermissions,
  getCompanyTheme,
  updateCompanyTheme,
} from '../controllers/config.controller'
import { authenticate, requirePermission } from '../middleware/auth.middleware'

const router = Router()

router.use(authenticate)

router.get('/permissions', requirePermission('config.view', 'config.manage'), listPermissions)
router.get('/roles', requirePermission('config.view', 'config.manage'), listRoles)
router.get('/collaborators/:collaboratorId/permissions', requirePermission('config.view', 'config.manage'), getCollaboratorPermissions)
router.put('/collaborators/:collaboratorId/permissions', requirePermission('config.manage'), updateCollaboratorPermissions)
router.post('/collaborators/:collaboratorId/role', requirePermission('config.manage'), assignRoleToCollaborator)
router.patch('/collaborators/:collaboratorId/superpowers', requirePermission('config.manage'), toggleSuperpowers)
router.get('/company-theme', getCompanyTheme)
router.patch('/company-theme', requirePermission('config.manage'), updateCompanyTheme)

export default router
