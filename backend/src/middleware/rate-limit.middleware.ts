import rateLimit from 'express-rate-limit'

const jsonMessage = (message: string) => ({
  error: message,
})

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Demasiados intentos de login. Intenta nuevamente en unos minutos.'),
})

export const mfaRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Demasiados intentos de MFA. Espera unos minutos antes de reintentar.'),
})

export const passwordResetRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Demasiadas solicitudes de recuperacion. Intenta nuevamente mas tarde.'),
})

export const ssoRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Demasiados intentos de SSO. Intenta nuevamente en unos minutos.'),
})

export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Demasiados intentos de registro. Intentá en una hora.'),
})

export const demoRequestRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Demasiadas solicitudes de demo. Intentá nuevamente en unos minutos.'),
})
