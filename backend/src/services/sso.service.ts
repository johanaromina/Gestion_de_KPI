import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { pool } from '../config/database'
import { appEnv } from '../config/env'
import { decryptSecret } from '../utils/crypto'
import { getEffectivePermissions } from '../utils/permissions'
import { buildTokenPayload, issueAuthToken } from './auth-session.service'

export interface SsoProviderRow {
  id: number
  name: string
  slug: string
  providerType: 'oidc'
  issuer?: string | null
  clientId: string
  clientSecret?: string | null
  authorizationEndpoint: string
  tokenEndpoint: string
  userInfoEndpoint: string
  scopes?: string | null
  allowedDomains?: string | null
  enabled: number | boolean
}

const splitCsv = (value?: string | null) =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const hashValue = (value: string) => crypto.createHash('sha256').update(value).digest('hex')

const normalizeEmail = (value: any) => String(value || '').trim().toLowerCase()

const getRedirectUri = (providerId: number) =>
  `${appEnv.publicApiBaseUrl.replace(/\/$/, '')}/api/auth/sso/${providerId}/callback`

const getProviderBySlugOrId = async (providerRef: string) => {
  const numericId = Number(providerRef)
  const isNumeric = Number.isFinite(numericId) && `${numericId}` === providerRef
  const [rows] = await pool.query<SsoProviderRow[]>(
    isNumeric
      ? 'SELECT * FROM sso_providers WHERE id = ? AND enabled = 1 LIMIT 1'
      : 'SELECT * FROM sso_providers WHERE slug = ? AND enabled = 1 LIMIT 1',
    [isNumeric ? numericId : providerRef]
  )
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null
}

const resolveUserInfo = async (provider: SsoProviderRow, accessToken: string) => {
  if (!provider.userInfoEndpoint) {
    throw new Error('El provider SSO no tiene userInfoEndpoint configurado')
  }

  const response = await fetch(provider.userInfoEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`SSO userinfo error ${response.status}: ${text}`)
  }

  return response.json()
}

export const listEnabledSsoProviders = async () => {
  const [rows] = await pool.query<SsoProviderRow[]>(
    `SELECT id, name, slug, providerType, enabled
     FROM sso_providers
     WHERE enabled = 1
     ORDER BY name ASC`
  )

  return (Array.isArray(rows) ? rows : []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    providerType: row.providerType,
  }))
}

export const buildSsoStartUrl = async (providerRef: string) => {
  const provider = await getProviderBySlugOrId(providerRef)
  if (!provider) {
    throw new Error('Provider SSO no encontrado')
  }

  const state = jwt.sign(
    {
      purpose: 'sso_state',
      providerId: provider.id,
    },
    appEnv.jwtSecret,
    { expiresIn: `${appEnv.ssoStateTtlMin}m` }
  )

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: provider.clientId,
    redirect_uri: getRedirectUri(provider.id),
    scope: splitCsv(provider.scopes).join(' ') || 'openid profile email',
    state,
  })

  return {
    provider,
    redirectUrl: `${provider.authorizationEndpoint}?${params.toString()}`,
  }
}

export const consumeSsoCallback = async (providerRef: string, code: string, state: string) => {
  const provider = await getProviderBySlugOrId(providerRef)
  if (!provider) {
    throw new Error('Provider SSO no encontrado')
  }

  const decoded = jwt.verify(state, appEnv.jwtSecret) as any
  if (!decoded?.providerId || decoded.purpose !== 'sso_state' || Number(decoded.providerId) !== Number(provider.id)) {
    throw new Error('State invalido')
  }

  const tokenResponse = await fetch(provider.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(provider.id),
      client_id: provider.clientId,
      client_secret: provider.clientSecret ? decryptSecret(provider.clientSecret) : '',
    }),
  })

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text()
    throw new Error(`SSO token error ${tokenResponse.status}: ${text}`)
  }

  const tokenPayload: any = await tokenResponse.json()
  if (!tokenPayload?.access_token) {
    throw new Error('El provider SSO no devolvio access_token')
  }

  const userInfo: any = await resolveUserInfo(provider, String(tokenPayload.access_token))
  const email = normalizeEmail(userInfo.email || userInfo.preferred_username || userInfo.upn)
  const subject = String(userInfo.sub || userInfo.id || '')

  if (!email) {
    throw new Error('El provider SSO no devolvio un email utilizable')
  }

  const allowedDomains = splitCsv(provider.allowedDomains)
  if (allowedDomains.length > 0) {
    const domain = email.split('@')[1] || ''
    if (!allowedDomains.includes(domain)) {
      throw new Error('Dominio no permitido para este provider SSO')
    }
  }

  const [collaboratorRows] = await pool.query<any[]>(
    'SELECT * FROM collaborators WHERE email = ? LIMIT 1',
    [email]
  )
  if (!Array.isArray(collaboratorRows) || collaboratorRows.length === 0) {
    throw new Error('No existe un colaborador asociado a este email corporativo')
  }

  const collaborator = collaboratorRows[0]
  if (collaborator.status === 'inactive') {
    throw new Error('Usuario inactivo')
  }

  await pool.query(
    `UPDATE collaborators
     SET ssoProviderId = ?, ssoSubject = ?, authSource = 'sso'
     WHERE id = ?`,
    [provider.id, subject || null, collaborator.id]
  )

  const rawCode = crypto.randomBytes(32).toString('hex')
  const codeHash = hashValue(rawCode)
  const expiresAt = new Date(Date.now() + appEnv.ssoHandoffTtlMin * 60 * 1000)

  await pool.query(
    `INSERT INTO auth_handoff_codes
     (codeHash, collaboratorId, ssoProviderId, expiresAt, metadata)
     VALUES (?, ?, ?, ?, ?)`,
    [
      codeHash,
      collaborator.id,
      provider.id,
      expiresAt,
      JSON.stringify({
        email,
        subject,
        name: userInfo.name || collaborator.name,
      }),
    ]
  )

  return rawCode
}

export const exchangeSsoHandoffCode = async (code: string, rememberMe?: boolean) => {
  const codeHash = hashValue(code)
  const [rows] = await pool.query<any[]>(
    `SELECT * FROM auth_handoff_codes
     WHERE codeHash = ? AND consumedAt IS NULL AND expiresAt > NOW()
     ORDER BY id DESC
     LIMIT 1`,
    [codeHash]
  )

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Codigo SSO invalido o expirado')
  }

  const handoff = rows[0]
  await pool.query('UPDATE auth_handoff_codes SET consumedAt = NOW() WHERE id = ?', [handoff.id])

  const [collaboratorRows] = await pool.query<any[]>(
    'SELECT * FROM collaborators WHERE id = ? LIMIT 1',
    [handoff.collaboratorId]
  )
  if (!Array.isArray(collaboratorRows) || collaboratorRows.length === 0) {
    throw new Error('Usuario no encontrado')
  }

  const collaborator = collaboratorRows[0]
  const permissions = await getEffectivePermissions(collaborator.id)
  const token = issueAuthToken(collaborator, permissions, rememberMe)

  return {
    token,
    user: buildTokenPayload(collaborator, permissions),
  }
}
