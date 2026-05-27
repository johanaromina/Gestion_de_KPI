import { Request, Response } from 'express'
import { appEnv } from '../config/env'
import {
  buildSsoStartUrl,
  consumeSsoCallback,
  exchangeSsoHandoffCode,
  listEnabledSsoProviders,
} from '../services/sso.service'
import { logger } from '../utils/logger'
import { sendApiError } from '../utils/api-errors'

const setAuthCookie = (res: Response, token: string, rememberMe?: boolean) => {
  const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : undefined
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: appEnv.isProduction,
    sameSite: appEnv.isProduction ? 'strict' : 'lax',
    path: '/',
    ...(maxAge !== undefined ? { maxAge } : {}),
  })
}

export const getSsoProviders = async (req: Request, res: Response) => {
  try {
    const providers = await listEnabledSsoProviders()
    res.json(providers)
  } catch (error: any) {
    logger.error('Error listing SSO providers:', error)
    return sendApiError(res, 500, 'SSO_PROVIDERS_FETCH_FAILED', 'Error al obtener providers SSO')
  }
}

export const startSso = async (req: Request, res: Response) => {
  try {
    const providerRef = String(req.params.providerRef || '')
    const result = await buildSsoStartUrl(providerRef)
    res.json({
      provider: {
        id: result.provider.id,
        name: result.provider.name,
        slug: result.provider.slug,
      },
      redirectUrl: result.redirectUrl,
    })
  } catch (error: any) {
    logger.error('Error starting SSO:', error)
    return sendApiError(res, 400, 'SSO_START_FAILED', error?.message || 'Error al iniciar SSO')
  }
}

export const handleSsoCallback = async (req: Request, res: Response) => {
  try {
    const providerRef = String(req.params.providerRef || '')
    const code = String(req.query.code || '')
    const state = String(req.query.state || '')

    if (!code || !state) {
      return res.redirect(`${appEnv.frontendBaseUrl}/sso/callback?error=SSO_CALLBACK_MISSING_CODE`)
    }

    const handoffCode = await consumeSsoCallback(providerRef, code, state)
    return res.redirect(
      `${appEnv.frontendBaseUrl}/sso/callback?code=${encodeURIComponent(handoffCode)}`
    )
  } catch (error: any) {
    logger.error('Error in SSO callback:', error)
    const code = encodeURIComponent('SSO_CALLBACK_FAILED')
    return res.redirect(`${appEnv.frontendBaseUrl}/sso/callback?error=${code}`)
  }
}

export const exchangeSsoCode = async (req: Request, res: Response) => {
  try {
    const { code, rememberMe } = req.body
    if (!code) {
      return sendApiError(res, 400, 'SSO_CODE_REQUIRED', 'Codigo SSO requerido')
    }

    const session = await exchangeSsoHandoffCode(String(code), !!rememberMe)
    setAuthCookie(res, session.token, !!rememberMe)
    res.json({ user: session.user })
  } catch (error: any) {
    logger.error('Error exchanging SSO code:', error)
    return sendApiError(res, 400, 'SSO_EXCHANGE_FAILED', error?.message || 'Error al intercambiar codigo SSO')
  }
}
