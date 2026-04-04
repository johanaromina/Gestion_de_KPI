import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  JWT_SECRET: z.string().optional(),
  AUTH_ENCRYPTION_KEY: z.string().optional(),
  APP_BASE_URL: z.string().default('http://localhost:5173'),
  FRONTEND_BASE_URL: z.string().optional(),
  PUBLIC_API_BASE_URL: z.string().default('http://localhost:5000'),
  SELF_REGISTER_ENABLED: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().default('587'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_REPLY_TO: z.string().optional(),
  SMTP_SECURE: z.string().optional(),
  SMTP_REQUIRE_TLS: z.string().optional(),
  SMTP_IPV4_ONLY: z.string().optional(),
  DEMO_REQUEST_TO: z.string().optional(),
  MFA_TTL_MIN: z.string().default('10'),
  RESET_TTL_MIN: z.string().default('60'),
  SSO_STATE_TTL_MIN: z.string().default('10'),
  SSO_HANDOFF_TTL_MIN: z.string().default('5'),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  TRUST_PROXY: z.string().optional(),
})

const parsed = envSchema.parse(process.env)

const isProduction = parsed.NODE_ENV === 'production'
const jwtSecret = parsed.JWT_SECRET || 'dev-secret-key-change-in-production'
const authEncryptionKey = parsed.AUTH_ENCRYPTION_KEY || parsed.JWT_SECRET || ''
const trustProxy =
  parsed.TRUST_PROXY === 'true'
    ? true
    : parsed.TRUST_PROXY === 'false' || !parsed.TRUST_PROXY
      ? false
      : parsed.TRUST_PROXY
const corsAllowedOrigins = (parsed.CORS_ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

if (isProduction && (!parsed.JWT_SECRET || parsed.JWT_SECRET === 'dev-secret-key-change-in-production')) {
  throw new Error('JWT_SECRET es obligatorio en produccion')
}

if (isProduction && !parsed.AUTH_ENCRYPTION_KEY) {
  throw new Error('AUTH_ENCRYPTION_KEY es obligatorio en produccion')
}

export const appEnv = {
  nodeEnv: parsed.NODE_ENV,
  isProduction,
  jwtSecret,
  authEncryptionKey,
  appBaseUrl: parsed.APP_BASE_URL,
  frontendBaseUrl: parsed.FRONTEND_BASE_URL || parsed.APP_BASE_URL,
  publicApiBaseUrl: parsed.PUBLIC_API_BASE_URL,
  selfRegisterEnabled: parsed.SELF_REGISTER_ENABLED === 'true',
  smtpHost: parsed.SMTP_HOST || '',
  smtpPort: Number(parsed.SMTP_PORT),
  smtpUser: parsed.SMTP_USER || '',
  smtpPass: parsed.SMTP_PASS || '',
  smtpFrom: parsed.SMTP_FROM || parsed.SMTP_USER || 'no-reply@example.com',
  smtpReplyTo: parsed.SMTP_REPLY_TO || '',
  smtpSecure:
    parsed.SMTP_SECURE === 'true' ? true : parsed.SMTP_SECURE === 'false' ? false : Number(parsed.SMTP_PORT) === 465,
  smtpRequireTls: parsed.SMTP_REQUIRE_TLS === 'true',
  smtpIpv4Only: parsed.SMTP_IPV4_ONLY === 'false' ? false : true,
  demoRequestTo: (parsed.DEMO_REQUEST_TO || '').trim(),
  mfaTtlMin: Number(parsed.MFA_TTL_MIN),
  resetTtlMin: Number(parsed.RESET_TTL_MIN),
  ssoStateTtlMin: Number(parsed.SSO_STATE_TTL_MIN),
  ssoHandoffTtlMin: Number(parsed.SSO_HANDOFF_TTL_MIN),
  corsAllowedOrigins,
  trustProxy,
}
