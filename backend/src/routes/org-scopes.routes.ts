import { Router } from 'express'
import { authenticate, requirePermission } from '../middleware/auth.middleware'
import { listOrgScopes, createOrgScope, updateOrgScope } from '../controllers/org-scopes.controller'

const router = Router()

router.use(authenticate)

router.get('/', requirePermission('config.view', 'config.manage'), listOrgScopes)
router.post('/', requirePermission('config.manage'), createOrgScope)
router.put('/:id', requirePermission('config.manage'), updateOrgScope)

export default router
