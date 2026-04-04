import { Router } from 'express'
import { submitDemoRequest } from '../controllers/contact.controller'
import { demoRequestRateLimiter } from '../middleware/rate-limit.middleware'

const router = Router()

router.post('/demo-request', demoRequestRateLimiter, submitDemoRequest)

export default router
