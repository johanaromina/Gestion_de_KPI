import { Router } from 'express'
import {
  getCollaborators,
  getCollaboratorById,
  createCollaborator,
  updateCollaborator,
  deleteCollaborator,
  deactivateCollaborator,
  changeCollaboratorRole,
  getCollaboratorEvents,
} from '../controllers/collaborators.controller'
import { authenticate } from '../middleware/auth.middleware'

const router = Router()

// Todas las rutas requieren usuario autenticado
router.use(authenticate)

router.get('/', getCollaborators)
router.get('/:id/events', getCollaboratorEvents)
router.get('/:id', getCollaboratorById)
router.post('/', createCollaborator)
router.put('/:id', updateCollaborator)
router.post('/:id/deactivate', deactivateCollaborator)
router.post('/:id/change-role', changeCollaboratorRole)
router.delete('/:id', deleteCollaborator)

export default router
