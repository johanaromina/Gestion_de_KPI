import { Router } from 'express'
import {
  getReductionKPIs,
  getReductionStatistics,
  getReductionEvolution,
} from '../controllers/reduction-views.controller'

const router = Router()

router.get('/reduction-kpis', getReductionKPIs)
router.get('/reduction-statistics', getReductionStatistics)
router.get('/reduction-evolution/:kpiId/:collaboratorId?', getReductionEvolution)

export default router

