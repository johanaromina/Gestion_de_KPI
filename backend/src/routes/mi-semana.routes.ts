import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware'
import { getMiSemana, updateKRValue, updateKPIActual } from '../controllers/mi-semana.controller'

const router = Router()

router.use(authenticate)

router.get('/', getMiSemana)
router.patch('/kr/:krId', updateKRValue)
router.patch('/kpi/:kpiId', updateKPIActual)

export default router
