import { Router } from 'express'
import { authenticate, requirePermission } from '../middleware/auth.middleware'
import {
  listRoles,
  createRole,
  updateRole,
  cloneRole,
  deleteRole,
  listScopeRoles,
  assignScopeRole,
  listUserRoles,
  assignUserRole,
  listUserOverrides,
  updateUserOverrides,
  resetUserOverrides,
} from '../controllers/security.controller'

const router = Router()

router.use(authenticate)

router.get('/roles', requirePermission('config.view', 'config.manage'), listRoles)
router.post('/roles', requirePermission('config.manage'), createRole)
router.put('/roles/:roleId', requirePermission('config.manage'), updateRole)
router.post('/roles/:roleId/clone', requirePermission('config.manage'), cloneRole)
router.delete('/roles/:roleId', requirePermission('config.manage'), deleteRole)

router.get('/scope-roles', requirePermission('config.view', 'config.manage'), listScopeRoles)
router.put('/scope-roles/:scopeId', requirePermission('config.manage'), assignScopeRole)

router.get('/user-roles', requirePermission('config.view', 'config.manage'), listUserRoles)
router.put('/user-roles/:collaboratorId', requirePermission('config.manage'), assignUserRole)

router.get('/users/:collaboratorId/permissions', requirePermission('config.view', 'config.manage'), listUserOverrides)
router.put('/users/:collaboratorId/permissions', requirePermission('config.manage'), updateUserOverrides)
router.delete('/users/:collaboratorId/permissions', requirePermission('config.manage'), resetUserOverrides)

export default router
