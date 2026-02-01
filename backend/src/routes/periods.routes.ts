import { Router } from 'express'
import {
  getPeriods,
  getPeriodById,
  createPeriod,
  updatePeriod,
  deletePeriod,
  getSubPeriodsByPeriod,
  closePeriod,
  reopenPeriod,
  getPeriodSummary,
} from '../controllers/periods.controller'
import { authenticate, authorize } from '../middleware/auth.middleware'

const router = Router()

router.get('/', getPeriods)
router.get('/:id', getPeriodById)
router.get('/:id/summary', getPeriodSummary)
router.get('/:id/sub-periods', getSubPeriodsByPeriod)
router.post('/', createPeriod)
router.put('/:id', updatePeriod)
router.post('/:id/close', closePeriod)
router.post('/:id/reopen', authenticate, authorize('admin', 'director', 'manager'), reopenPeriod)
router.delete('/:id', deletePeriod)

export default router
