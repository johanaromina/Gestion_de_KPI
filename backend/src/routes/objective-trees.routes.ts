import { Router } from 'express'
import {
  getObjectiveTrees,
  getObjectiveTreeById,
  getObjectiveTreeDrilldown,
  getObjectiveTreeScopeKpis,
  createObjectiveTree,
  syncObjectiveTreeScopeKpis,
  updateObjectiveTree,
  deleteObjectiveTree,
} from '../controllers/objective-trees.controller'

const router = Router()

router.get('/', getObjectiveTrees)
router.get('/:id/drilldown', getObjectiveTreeDrilldown)
router.get('/:id/scope-kpis', getObjectiveTreeScopeKpis)
router.get('/:id', getObjectiveTreeById)
router.post('/', createObjectiveTree)
router.put('/:id/scope-kpis', syncObjectiveTreeScopeKpis)
router.put('/:id', updateObjectiveTree)
router.delete('/:id', deleteObjectiveTree)

export default router

