import express from 'express'
import {
  getCurationItems,
  createCriteriaVersion,
  approveCriteriaVersion,
  rejectCriteriaVersion,
  requestCriteriaChanges,
} from '../controllers/curation.controller'
import { authenticate } from '../middleware/auth.middleware'

const router = express.Router()

router.get('/items', authenticate, getCurationItems)
router.post('/assignments/:assignmentId/criteria', authenticate, createCriteriaVersion)
router.post('/criteria/:id/approve', authenticate, approveCriteriaVersion)
router.post('/criteria/:id/reject', authenticate, rejectCriteriaVersion)
router.post('/criteria/:id/request-changes', authenticate, requestCriteriaChanges)

export default router
