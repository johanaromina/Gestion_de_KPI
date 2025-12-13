import { Router } from 'express'
import {
  getObjectiveTrees,
  getObjectiveTreeById,
  createObjectiveTree,
  updateObjectiveTree,
  deleteObjectiveTree,
} from '../controllers/objective-trees.controller'

const router = Router()

router.get('/', getObjectiveTrees)
router.get('/:id', getObjectiveTreeById)
router.post('/', createObjectiveTree)
router.put('/:id', updateObjectiveTree)
router.delete('/:id', deleteObjectiveTree)

export default router

