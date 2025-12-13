import { Router } from 'express'
import {
  getCollaboratorKPIs,
  getCollaboratorKPIById,
  getCollaboratorKPIsByCollaborator,
  getCollaboratorKPIsByPeriod,
  getConsolidatedByCollaborator,
  createCollaboratorKPI,
  updateCollaboratorKPI,
  deleteCollaboratorKPI,
  updateActualValue,
  closeCollaboratorKPI,
  reopenCollaboratorKPI,
  closePeriodAssignments,
  generateBaseGrids,
  proposeCollaboratorKPI,
  approveCollaboratorKPI,
  rejectCollaboratorKPI,
} from '../controllers/collaborator-kpis.controller'
import { authenticate, authorize } from '../middleware/auth.middleware'

const router = Router()

// Todas las rutas requieren usuario autenticado
router.use(authenticate)

router.get('/', getCollaboratorKPIs)
router.get('/collaborator/:collaboratorId/consolidated', getConsolidatedByCollaborator)
router.get('/collaborator/:collaboratorId', getCollaboratorKPIsByCollaborator)
router.get('/period/:periodId', getCollaboratorKPIsByPeriod)
router.get('/:id', getCollaboratorKPIById)
router.post('/', createCollaboratorKPI)
router.post('/generate-base-grids', generateBaseGrids)
router.put('/:id', updateCollaboratorKPI)
router.patch('/:id/actual', updateActualValue)
router.post('/:id/close', closeCollaboratorKPI)
router.post('/:id/reopen', authenticate, authorize('admin', 'director'), reopenCollaboratorKPI)
router.post('/:id/propose', proposeCollaboratorKPI)
router.post('/:id/approve', authenticate, authorize('admin', 'director', 'manager', 'leader'), approveCollaboratorKPI)
router.post('/:id/reject', authenticate, authorize('admin', 'director', 'manager', 'leader'), rejectCollaboratorKPI)
router.post('/close-period', closePeriodAssignments)
router.delete('/:id', authenticate, deleteCollaboratorKPI)

export default router
