import { Router } from 'express'
import {
  getSubPeriods,
  getSubPeriodById,
  createSubPeriod,
  updateSubPeriod,
  deleteSubPeriod,
  closeSubPeriod,
} from '../controllers/sub-periods.controller'
import { authenticate, requirePermission } from '../middleware/auth.middleware'

const router = Router()

router.get('/', getSubPeriods)
router.get('/:id', getSubPeriodById)
router.post('/', createSubPeriod)
router.put('/:id', updateSubPeriod)
router.post('/:id/close', authenticate, requirePermission('config.manage'), closeSubPeriod)
router.delete('/:id', deleteSubPeriod)

export default router

