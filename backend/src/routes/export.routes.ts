import { Router } from 'express'
import {
  exportParrillaPDF,
  exportParrillaExcel,
  exportOKRObjectivePDF,
  exportOKRObjectiveExcel,
  exportOKRPeriodPDF,
  exportOKRPeriodExcel,
} from '../controllers/export.controller'

const router = Router()

router.get('/parrilla/:collaboratorId/:periodId/pdf',   exportParrillaPDF)
router.get('/parrilla/:collaboratorId/:periodId/excel', exportParrillaExcel)

router.get('/okr/:objectiveId/pdf',          exportOKRObjectivePDF)
router.get('/okr/:objectiveId/excel',        exportOKRObjectiveExcel)
router.get('/okr/period/:periodId/pdf',      exportOKRPeriodPDF)
router.get('/okr/period/:periodId/excel',    exportOKRPeriodExcel)

export default router

