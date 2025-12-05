import { Router } from 'express'
import {
  getKPIs,
  getKPIById,
  createKPI,
  updateKPI,
  deleteKPI,
} from '../controllers/kpis.controller'

const router = Router()

router.get('/', getKPIs)
router.get('/:id', getKPIById)
router.post('/', createKPI)
router.put('/:id', updateKPI)
router.delete('/:id', deleteKPI)

export default router
