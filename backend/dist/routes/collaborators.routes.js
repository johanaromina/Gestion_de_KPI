import { Router } from 'express';
import { getCollaborators, getCollaboratorById, createCollaborator, updateCollaborator, deleteCollaborator, } from '../controllers/collaborators.controller';
const router = Router();
router.get('/', getCollaborators);
router.get('/:id', getCollaboratorById);
router.post('/', createCollaborator);
router.put('/:id', updateCollaborator);
router.delete('/:id', deleteCollaborator);
export default router;
//# sourceMappingURL=collaborators.routes.js.map