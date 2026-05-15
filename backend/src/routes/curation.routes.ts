import express from 'express'
import {
  getCurationItems,
  createCriteriaVersion,
  approveCriteriaVersion,
  rejectCriteriaVersion,
  requestCriteriaChanges,
} from '../controllers/curation.controller'
import { authenticate, requirePermission } from '../middleware/auth.middleware'

const router = express.Router()

const canReview = requirePermission('curation.review')

router.get('/items', authenticate, getCurationItems)
router.post('/assignments/:assignmentId/criteria', authenticate, createCriteriaVersion)
router.post('/criteria/:id/approve', authenticate, canReview, approveCriteriaVersion)
router.post('/criteria/:id/reject', authenticate, canReview, rejectCriteriaVersion)
router.post('/criteria/:id/request-changes', authenticate, canReview, requestCriteriaChanges)

export default router
