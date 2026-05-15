import { Request, Response } from 'express'
import { appEnv } from '../config/env'
import {
  buildSsoStartUrl,
  consumeSsoCallback,
  exchangeSsoHandoffCode,
  listEnabledSsoProviders,
} from '../services/sso.service'
import { logger } from '../utils/logger'

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
    res.status(500).json({ error: 'Error al obtener providers SSO' })
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
    res.status(400).json({ error: error?.message || 'Error al iniciar SSO' })
  }
}

export const handleSsoCallback = async (req: Request, res: Response) => {
  try {
    const providerRef = String(req.params.providerRef || '')
    const code = String(req.query.code || '')
    const state = String(req.query.state || '')

    if (!code || !state) {
      return res.redirect(`${appEnv.frontendBaseUrl}/sso/callback?error=missing_code`)
    }

    const handoffCode = await consumeSsoCallback(providerRef, code, state)
    return res.redirect(
      `${appEnv.frontendBaseUrl}/sso/callback?code=${encodeURIComponent(handoffCode)}`
    )
  } catch (error: any) {
    logger.error('Error in SSO callback:', error)
    const message = encodeURIComponent(error?.message || 'Error al procesar SSO')
    return res.redirect(`${appEnv.frontendBaseUrl}/sso/callback?error=${message}`)
  }
}

export const exchangeSsoCode = async (req: Request, res: Response) => {
  try {
    const { code, rememberMe } = req.body
    if (!code) {
      return res.status(400).json({ error: 'Codigo SSO requerido' })
    }

    const session = await exchangeSsoHandoffCode(String(code), !!rememberMe)
    setAuthCookie(res, session.token, !!rememberMe)
    res.json({ user: session.user })
  } catch (error: any) {
    logger.error('Error exchanging SSO code:', error)
    res.status(400).json({ error: error?.message || 'Error al intercambiar codigo SSO' })
  }
}
