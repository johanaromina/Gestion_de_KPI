import { Router } from 'express'
import {
  closeScopeKPI,
  createScopeKPI,
  createScopeKPILink,
  deleteScopeKPI,
  deleteScopeKPILink,
  getScopeKPIById,
  getScopeKPIAggregationRuns,
  getScopeKPIObjectives,
  getScopeKPILinks,
  getScopeKPIs,
  recalculateScopeKPIController,
  reopenScopeKPI,
  updateScopeKPI,
  updateScopeKPILink,
} from '../controllers/scope-kpis.controller'
import { authenticate } from '../middleware/auth.middleware'

const router = Router()

router.use(authenticate)

router.get('/', getScopeKPIs)
router.post('/', createScopeKPI)
router.get('/:id', getScopeKPIById)
router.get('/:id/objectives', getScopeKPIObjectives)
router.get('/:id/aggregation-runs', getScopeKPIAggregationRuns)
router.put('/:id', updateScopeKPI)
router.delete('/:id', deleteScopeKPI)
router.post('/:id/recalculate', recalculateScopeKPIController)
router.post('/:id/close', closeScopeKPI)
router.post('/:id/reopen', reopenScopeKPI)
router.get('/:id/links', getScopeKPILinks)
router.post('/:id/links', createScopeKPILink)
router.put('/links/:linkId', updateScopeKPILink)
router.delete('/links/:linkId', deleteScopeKPILink)

export default router
