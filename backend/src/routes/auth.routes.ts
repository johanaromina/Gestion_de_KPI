import { Router } from 'express'
import {
  login,
  register,
  getCurrentUser,
  requestPasswordReset,
  resetPassword,
  verifyMfa,
} from '../controllers/auth.controller'
import { exchangeSsoCode, getSsoProviders, handleSsoCallback, startSso } from '../controllers/sso.controller'
import { authenticate } from '../middleware/auth.middleware'
import {
  loginRateLimiter,
  mfaRateLimiter,
  passwordResetRateLimiter,
  ssoRateLimiter,
  registerRateLimiter,
} from '../middleware/rate-limit.middleware'

const router = Router()

router.get('/sso/providers', getSsoProviders)
router.post('/sso/:providerRef/start', ssoRateLimiter, startSso)
router.get('/sso/:providerRef/callback', ssoRateLimiter, handleSsoCallback)
router.post('/sso/exchange', ssoRateLimiter, exchangeSsoCode)
router.post('/login', loginRateLimiter, login)
router.post('/mfa/verify', mfaRateLimiter, verifyMfa)
router.post('/request-password-reset', passwordResetRateLimiter, requestPasswordReset)
router.post('/reset-password', resetPassword)
router.post('/register', registerRateLimiter, register)
router.get('/me', authenticate, getCurrentUser)

export default router
