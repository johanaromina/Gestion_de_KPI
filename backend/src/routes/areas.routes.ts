import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware'
import { getAreas, createArea, updateArea, deleteArea } from '../controllers/areas.controller'

const router = Router()

router.use(authenticate)

router.get('/', getAreas)
router.post('/', createArea)
router.put('/:id', updateArea)
router.delete('/:id', deleteArea)

export default router
