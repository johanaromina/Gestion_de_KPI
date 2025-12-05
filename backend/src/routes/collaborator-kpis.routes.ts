import { Router } from 'express'
import {
  getCollaboratorKPIs,
  getCollaboratorKPIById,
  getCollaboratorKPIsByCollaborator,
  getCollaboratorKPIsByPeriod,
  createCollaboratorKPI,
  updateCollaboratorKPI,
  deleteCollaboratorKPI,
  updateActualValue,
  closeCollaboratorKPI,
  reopenCollaboratorKPI,
  closePeriodAssignments,
} from '../controllers/collaborator-kpis.controller'
import { authenticate, authorize } from '../middleware/auth.middleware'

const router = Router()

router.get('/', getCollaboratorKPIs)
router.get('/collaborator/:collaboratorId', getCollaboratorKPIsByCollaborator)
router.get('/period/:periodId', getCollaboratorKPIsByPeriod)
router.get('/:id', getCollaboratorKPIById)
router.post('/', createCollaboratorKPI)
router.put('/:id', updateCollaboratorKPI)
router.patch('/:id/actual', updateActualValue)
router.post('/:id/close', closeCollaboratorKPI)
router.post('/:id/reopen', authenticate, authorize('admin', 'director'), reopenCollaboratorKPI)
router.post('/close-period', closePeriodAssignments)
router.delete('/:id', authenticate, deleteCollaboratorKPI)

export default router
