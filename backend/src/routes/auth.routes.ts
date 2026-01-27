import { Router } from 'express'
import {
  login,
  register,
  getCurrentUser,
  requestPasswordReset,
  resetPassword,
  verifyMfa,
} from '../controllers/auth.controller'
import { authenticate } from '../middleware/auth.middleware'

const router = Router()

router.post('/login', login)
router.post('/mfa/verify', verifyMfa)
router.post('/request-password-reset', requestPasswordReset)
router.post('/reset-password', resetPassword)
router.post('/register', register)
router.get('/me', authenticate, getCurrentUser)

export default router
