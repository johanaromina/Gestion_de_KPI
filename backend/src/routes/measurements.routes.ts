import express from 'express'
import {
  getMeasurements,
  createMeasurement,
  approveMeasurement,
  rejectMeasurement,
} from '../controllers/measurements.controller'
import { authenticate } from '../middleware/auth.middleware'

const router = express.Router()

router.get('/', authenticate, getMeasurements)
router.post('/', authenticate, createMeasurement)
router.post('/:id/approve', authenticate, approveMeasurement)
router.post('/:id/reject', authenticate, rejectMeasurement)

export default router
