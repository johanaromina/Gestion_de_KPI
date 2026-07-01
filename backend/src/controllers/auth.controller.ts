import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { pool } from '../config/database'
import { appEnv } from '../config/env'
import { sendMail } from '../utils/mailer'
import { getEffectivePermissions } from '../utils/permissions'
import { buildTokenPayload, getSessionExpiry, issueAuthToken } from '../services/auth-session.service'
import { AuthRequest } from '../middleware/auth.middleware'
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

const clearAuthCookie = (res: Response) => {
  res.clearCookie('auth_token', { path: '/', httpOnly: true, secure: appEnv.isProduction, sameSite: appEnv.isProduction ? 'strict' : 'lax' })
}

interface User {
  id: number
  email: string
  name: string
  role: string
  area?: string
  collaboratorId?: number
  hasSuperpowers?: boolean
  permissions?: string[]
}

export const login = async (req: Request, res: Response) => {
  try {
    const { collaboratorId, email, password, rememberMe } = req.body
    const normalizedEmail = email ? String(email).trim().toLowerCase() : ''

    if ((!normalizedEmail && !collaboratorId) || !password) {
      return sendApiError(res, 400, 'AUTH_CREDENTIALS_REQUIRED', 'Credenciales requeridas')
    }

    const [rows] = await pool.query<any[]>(
      normalizedEmail
        ? 'SELECT * FROM collaborators WHERE email = ?'
        : 'SELECT * FROM collaborators WHERE id = ?',
      [normalizedEmail || collaboratorId]
    )

    if (Array.isArray(rows) && rows.length === 0) {
      return sendApiError(res, 401, 'AUTH_INVALID_CREDENTIALS', 'Credenciales invalidas')
    }

    const collaborator = rows[0]

    if (collaborator.status === 'inactive') {
      return sendApiError(res, 403, 'AUTH_USER_INACTIVE', 'Usuario inactivo')
    }

    if (!collaborator.passwordHash) {
      return sendApiError(
        res,
        401,
        'AUTH_PASSWORD_NOT_SET',
        'Contrasena no configurada. Usa recuperar contrasena.'
      )
    }

    const matches = await bcrypt.compare(String(password), collaborator.passwordHash)
    if (!matches) {
      return sendApiError(res, 401, 'AUTH_INVALID_CREDENTIALS', 'Credenciales invalidas')
    }

    const permissions = await getEffectivePermissions(collaborator.id)

    if (collaborator.mfaEnabled && collaborator.email) {
      const code = crypto.randomInt(100000, 999999).toString()
      const codeHash = crypto.createHash('sha256').update(code).digest('hex')
      const expiresAt = new Date(Date.now() + appEnv.mfaTtlMin * 60 * 1000)

      await pool.query(
        'UPDATE collaborators SET mfaCodeHash = ?, mfaCodeExpiresAt = ? WHERE id = ?',
        [codeHash, expiresAt, collaborator.id]
      )

      await sendMail({
        to: collaborator.email,
        subject: 'Codigo de acceso - KPI Manager',
        html: `<p>Tu codigo de verificacion es:</p><h2>${code}</h2><p>Vence en ${appEnv.mfaTtlMin} minutos.</p>`,
        text: `Tu codigo de verificacion es: ${code}. Vence en ${appEnv.mfaTtlMin} minutos.`,
      })

      const mfaToken = jwt.sign(
        { id: collaborator.id, purpose: 'mfa' },
        appEnv.jwtSecret,
        { expiresIn: `${appEnv.mfaTtlMin}m` }
      )

      return res.json({ mfaRequired: true, mfaToken })
    }

    const token = issueAuthToken(collaborator, permissions, rememberMe)
    setAuthCookie(res, token, rememberMe)

    return res.json({ user: buildTokenPayload(collaborator, permissions) })
  } catch (error: any) {
    logger.error('[auth] login', error)
    return sendApiError(res, 500, 'AUTH_LOGIN_FAILED', 'Error al iniciar sesion')
  }
}

export const verifyMfa = async (req: Request, res: Response) => {
  try {
    const { token, code, rememberMe } = req.body
    if (!token || !code) {
      return sendApiError(res, 400, 'AUTH_MFA_CODE_REQUIRED', 'Codigo requerido')
    }

    let decoded: any
    try {
      decoded = jwt.verify(token, appEnv.jwtSecret) as any
    } catch {
      return sendApiError(res, 401, 'AUTH_MFA_TOKEN_INVALID', 'Token invalido')
    }

    if (!decoded?.id || decoded?.purpose !== 'mfa') {
      return sendApiError(res, 401, 'AUTH_MFA_TOKEN_INVALID', 'Token invalido')
    }

    const [rows] = await pool.query<any[]>(
      'SELECT * FROM collaborators WHERE id = ?',
      [decoded.id]
    )
    if (!Array.isArray(rows) || rows.length === 0) {
      return sendApiError(res, 404, 'AUTH_USER_NOT_FOUND', 'Usuario no encontrado')
    }

    const collaborator = rows[0]
    if (!collaborator.mfaCodeHash || !collaborator.mfaCodeExpiresAt) {
      return sendApiError(res, 401, 'AUTH_MFA_CODE_EXPIRED', 'Codigo expirado')
    }

    if (new Date(collaborator.mfaCodeExpiresAt).getTime() < Date.now()) {
      return sendApiError(res, 401, 'AUTH_MFA_CODE_EXPIRED', 'Codigo expirado')
    }

    const codeHash = crypto.createHash('sha256').update(String(code)).digest('hex')
    if (codeHash !== collaborator.mfaCodeHash) {
      return sendApiError(res, 401, 'AUTH_MFA_CODE_INVALID', 'Codigo invalido')
    }

    await pool.query(
      'UPDATE collaborators SET mfaCodeHash = NULL, mfaCodeExpiresAt = NULL WHERE id = ?',
      [collaborator.id]
    )

    const permissions = await getEffectivePermissions(collaborator.id)

    const authToken = issueAuthToken(collaborator, permissions, rememberMe)
    setAuthCookie(res, authToken, rememberMe)

    return res.json({ user: buildTokenPayload(collaborator, permissions) })
  } catch (error: any) {
    logger.error('[auth] mfa', error)
    return sendApiError(res, 500, 'AUTH_MFA_VERIFY_FAILED', 'Error al verificar codigo')
  }
}

export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email } = req.body
    const normalizedEmail = email ? String(email).trim().toLowerCase() : ''

    if (!normalizedEmail) {
      return sendApiError(res, 400, 'AUTH_EMAIL_REQUIRED', 'Email requerido')
    }

    const [rows] = await pool.query<any[]>(
      'SELECT * FROM collaborators WHERE email = ?',
      [normalizedEmail]
    )

    if (!Array.isArray(rows) || rows.length === 0) {
      logger.info('[auth] reset request: email not found', normalizedEmail)
      return res.json({ message: 'Si el email existe, enviaremos instrucciones.' })
    }

    const collaborator = rows[0]
    logger.info('[auth] reset request: sending to', collaborator.email)
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + appEnv.resetTtlMin * 60 * 1000)

    await pool.query(
      'UPDATE collaborators SET passwordResetTokenHash = ?, passwordResetExpiresAt = ? WHERE id = ?',
      [tokenHash, expiresAt, collaborator.id]
    )

    const resetLink = `${appEnv.appBaseUrl}/reset-password?token=${rawToken}`

    await sendMail({
      to: collaborator.email,
      subject: 'Recuperacion de contrasena - KPI Manager',
      html: `<p>Recibimos una solicitud para restablecer tu contrasena.</p>
             <p><a href="${resetLink}">Restablecer contrasena</a></p>
             <p>Este enlace vence en ${appEnv.resetTtlMin} minutos.</p>`,
        text: `Restablece tu contrasena: ${resetLink} (vence en ${appEnv.resetTtlMin} minutos).`,
    })

    logger.info('[auth] reset request: email sent', collaborator.email)

    return res.json({ message: 'Si el email existe, enviaremos instrucciones.' })
  } catch (error: any) {
    logger.error('[auth] requestPasswordReset', error)
    return sendApiError(res, 500, 'AUTH_RESET_REQUEST_FAILED', 'Error al solicitar recuperacion')
  }
}

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body

    if (!token || !password) {
      return sendApiError(
        res,
        400,
        'AUTH_RESET_TOKEN_AND_PASSWORD_REQUIRED',
        'Token y contrasena requeridos'
      )
    }

    if (String(password).length < 8) {
      return sendApiError(
        res,
        400,
        'AUTH_RESET_PASSWORD_TOO_SHORT',
        'La contrasena debe tener al menos 8 caracteres'
      )
    }

    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex')
    const [rows] = await pool.query<any[]>(
      `SELECT * FROM collaborators 
       WHERE passwordResetTokenHash = ? AND passwordResetExpiresAt > NOW()`,
      [tokenHash]
    )

    if (!Array.isArray(rows) || rows.length === 0) {
      return sendApiError(res, 400, 'AUTH_RESET_TOKEN_INVALID', 'Token invalido o expirado')
    }

    const collaborator = rows[0]
    const passwordHash = await bcrypt.hash(String(password), 10)

    await pool.query(
      `UPDATE collaborators 
       SET passwordHash = ?, passwordResetTokenHash = NULL, passwordResetExpiresAt = NULL
       WHERE id = ?`,
      [passwordHash, collaborator.id]
    )

    res.json({ message: 'Contrasena actualizada correctamente' })
  } catch (error: any) {
    logger.error('[auth] resetPassword', error)
    return sendApiError(res, 500, 'AUTH_RESET_PASSWORD_FAILED', 'Error al restablecer contrasena')
  }
}

export const changePassword = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user
    const collaboratorId = Number(user?.collaboratorId || user?.id || 0)
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string
      newPassword?: string
    }

    if (!collaboratorId) {
      return sendApiError(res, 401, 'AUTH_SESSION_INVALID', 'Sesion invalida')
    }

    if (!currentPassword || !newPassword) {
      return sendApiError(
        res,
        400,
        'AUTH_CHANGE_PASSWORD_REQUIRED',
        'Contrasena actual y nueva contrasena son requeridas'
      )
    }

    if (String(newPassword).length < 8) {
      return sendApiError(
        res,
        400,
        'AUTH_CHANGE_PASSWORD_TOO_SHORT',
        'La nueva contrasena debe tener al menos 8 caracteres'
      )
    }

    const [rows] = await pool.query<any[]>('SELECT id, passwordHash FROM collaborators WHERE id = ?', [collaboratorId])
    const collaborator = rows?.[0]

    if (!collaborator) {
      return sendApiError(res, 404, 'AUTH_USER_NOT_FOUND', 'Usuario no encontrado')
    }

    if (!collaborator.passwordHash) {
      return sendApiError(
        res,
        400,
        'AUTH_LOCAL_PASSWORD_NOT_SET',
        'Tu cuenta no tiene una contrasena local configurada. Usa recuperacion de contrasena o el acceso corporativo.'
      )
    }

    const matches = await bcrypt.compare(String(currentPassword), collaborator.passwordHash)
    if (!matches) {
      return sendApiError(
        res,
        401,
        'AUTH_CURRENT_PASSWORD_INCORRECT',
        'La contrasena actual es incorrecta'
      )
    }

    if (String(currentPassword) === String(newPassword)) {
      return sendApiError(
        res,
        400,
        'AUTH_NEW_PASSWORD_SAME_AS_CURRENT',
        'La nueva contrasena debe ser distinta de la actual'
      )
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 10)
    await pool.query(
      `UPDATE collaborators
       SET passwordHash = ?, passwordResetTokenHash = NULL, passwordResetExpiresAt = NULL
       WHERE id = ?`,
      [passwordHash, collaboratorId]
    )

    return res.json({ message: 'Contrasena actualizada correctamente' })
  } catch (error: any) {
    logger.error('[auth] changePassword', error)
    return sendApiError(res, 500, 'AUTH_CHANGE_PASSWORD_FAILED', 'Error al cambiar la contrasena')
  }
}

export const logout = (_req: Request, res: Response) => {
  clearAuthCookie(res)
  res.json({ message: 'Sesion cerrada' })
}

export const register = async (req: Request, res: Response) => {
  if (!appEnv.selfRegisterEnabled) {
    return sendApiError(
      res,
      403,
      'AUTH_SELF_REGISTER_DISABLED',
      'El registro autonomo esta deshabilitado en esta instancia. El alta inicial se realiza por despliegue/bootstrap del cliente.'
    )
  }

  const { companyName, adminName, email, password } = req.body
  const normalizedEmail = email ? String(email).trim().toLowerCase() : ''

  if (!companyName || !adminName || !normalizedEmail || !password) {
    return sendApiError(res, 400, 'AUTH_REGISTER_ALL_FIELDS_REQUIRED', 'Todos los campos son requeridos')
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(normalizedEmail)) {
    return sendApiError(res, 400, 'AUTH_REGISTER_INVALID_EMAIL', 'Email invalido')
  }

  if (String(password).length < 8) {
    return sendApiError(
      res,
      400,
      'AUTH_REGISTER_PASSWORD_TOO_SHORT',
      'La contrasena debe tener al menos 8 caracteres'
    )
  }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const [existing] = await conn.query<any[]>(
      'SELECT id FROM collaborators WHERE email = ?',
      [normalizedEmail]
    )
    if (Array.isArray(existing) && existing.length > 0) {
      await conn.rollback()
      conn.release()
      return sendApiError(
        res,
        400,
        'AUTH_REGISTER_EMAIL_ALREADY_EXISTS',
        'Ya existe una cuenta con ese email'
      )
    }

    const [companyResult] = await conn.query<any>(
      `INSERT INTO org_scopes (name, type, parentId, metadata, active) VALUES (?, 'company', NULL, ?, 1)`,
      [String(companyName).trim(), JSON.stringify({ code: 'COMPANY', aliases: ['company'] })]
    )
    const companyScopeId = Number(companyResult.insertId)

    await conn.query(
      `INSERT INTO org_scopes (name, type, parentId, metadata, active) VALUES ('General', 'area', ?, NULL, 1)`,
      [companyScopeId]
    )

    const passwordHash = await bcrypt.hash(String(password), 10)
    const [adminResult] = await conn.query<any>(
      `INSERT INTO collaborators (name, position, area, orgScopeId, managerId, role, status, email, passwordHash, mfaEnabled, hasSuperpowers)
       VALUES (?, 'Administrador', ?, ?, NULL, 'admin', 'active', ?, ?, 0, 1)`,
      [String(adminName).trim(), String(companyName).trim(), companyScopeId, normalizedEmail, passwordHash]
    )
    const adminId = Number(adminResult.insertId)

    await conn.commit()
    conn.release()

    const permissions = await getEffectivePermissions(adminId)
    const [adminRows] = await pool.query<any[]>('SELECT * FROM collaborators WHERE id = ?', [adminId])
    const adminCollaborator = adminRows[0]
    const token = issueAuthToken(adminCollaborator, permissions, true)
    setAuthCookie(res, token, true)

    try {
      await sendMail({
        to: normalizedEmail,
        subject: '¡Bienvenido/a a KPI Manager!',
        html: `<p>Hola ${String(adminName).trim()},</p>
               <p>Tu empresa <strong>${String(companyName).trim()}</strong> fue registrada exitosamente en KPI Manager.</p>
               <p>Ya podés ingresar con tu email y contraseña.</p>
               <p><a href="${appEnv.appBaseUrl}/login" style="background:#f97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Ingresar ahora</a></p>
               <p>Te recomendamos comenzar configurando tu estructura organizacional y los KPIs de tu equipo.</p>`,
        text: `Bienvenido/a a KPI Manager. Tu empresa ${String(companyName).trim()} fue registrada. Ingresá en: ${appEnv.appBaseUrl}/login`,
      })
    } catch (mailErr) {
      logger.error('[auth] register welcome email', mailErr)
    }

    return res.status(201).json({
      user: {
        id: adminId,
        name: String(adminName).trim(),
        email: normalizedEmail,
        role: 'admin',
        companyName: String(companyName).trim(),
      },
    })
  } catch (error: any) {
    await conn.rollback().catch(() => {})
    conn.release()
    logger.error('Error in register:', error)
    return sendApiError(res, 500, 'AUTH_REGISTER_FAILED', 'Error al registrar la empresa')
  }
}

export const getCurrentUser = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user

    const [rows] = await pool.query<any[]>(
      'SELECT * FROM collaborators WHERE id = ?',
      [user.collaboratorId || user.id]
    )

    if (Array.isArray(rows) && rows.length === 0) {
      clearAuthCookie(res)
      return sendApiError(res, 401, 'AUTH_USER_NOT_FOUND', 'Usuario no encontrado')
    }

    const collaborator = rows[0]
    const permissions = await getEffectivePermissions(collaborator.id)

    let companyTheme = 'navy-teal'
    if (collaborator.orgScopeId) {
      try {
        const [themeRows] = await pool.query<any[]>(
          `WITH RECURSIVE ancestry AS (
             SELECT os.id, os.parentId, os.type, os.theme
             FROM org_scopes os WHERE os.id = ?
             UNION ALL
             SELECT os.id, os.parentId, os.type, os.theme
             FROM org_scopes os JOIN ancestry a ON os.id = a.parentId
           )
           SELECT theme FROM ancestry WHERE type = 'company' LIMIT 1`,
          [collaborator.orgScopeId]
        )
        companyTheme = themeRows?.[0]?.theme ?? 'navy-teal'
      } catch {
        // theme column may not exist yet (migration pending)
      }
    }

    res.json({
      ...buildTokenPayload(collaborator, permissions),
      companyTheme,
    } as User)
  } catch (error: any) {
    logger.error('[auth] getCurrentUser', error)
    return sendApiError(res, 500, 'AUTH_GET_CURRENT_USER_FAILED', 'Error al obtener usuario')
  }
}
