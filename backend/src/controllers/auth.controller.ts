import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { pool } from '../config/database'
import { appEnv } from '../config/env'
import { sendMail } from '../utils/mailer'
import { getEffectivePermissions } from '../utils/permissions'
import { buildTokenPayload, issueAuthToken } from '../services/auth-session.service'
import { AuthRequest } from '../middleware/auth.middleware'

if (!appEnv.isProduction && !process.env.JWT_SECRET) {
  console.warn('??  ADVERTENCIA: JWT_SECRET no esta configurado. Usando clave por defecto (solo para desarrollo).')
  console.warn('??  En produccion, configura JWT_SECRET en el archivo .env')
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
      return res.status(400).json({ error: 'Credenciales requeridas' })
    }

    const [rows] = await pool.query<any[]>(
      normalizedEmail
        ? 'SELECT * FROM collaborators WHERE email = ?'
        : 'SELECT * FROM collaborators WHERE id = ?',
      [normalizedEmail || collaboratorId]
    )

    if (Array.isArray(rows) && rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales invalidas' })
    }

    const collaborator = rows[0]

    if (collaborator.status === 'inactive') {
      return res.status(403).json({ error: 'Usuario inactivo' })
    }

    if (!collaborator.passwordHash) {
      return res.status(401).json({ error: 'Contrasena no configurada. Usa recuperar contrasena.' })
    }

    const matches = await bcrypt.compare(String(password), collaborator.passwordHash)
    if (!matches) {
      return res.status(401).json({ error: 'Credenciales invalidas' })
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

    return res.json({
      token,
      user: buildTokenPayload(collaborator, permissions),
    })
  } catch (error: any) {
    console.error('Error in login:', error)
    res.status(500).json({ error: 'Error al iniciar sesion' })
  }
}

export const verifyMfa = async (req: Request, res: Response) => {
  try {
    const { token, code, rememberMe } = req.body
    if (!token || !code) {
      return res.status(400).json({ error: 'Codigo requerido' })
    }

    let decoded: any
    try {
      decoded = jwt.verify(token, appEnv.jwtSecret) as any
    } catch {
      return res.status(401).json({ error: 'Token invalido' })
    }

    if (!decoded?.id || decoded?.purpose !== 'mfa') {
      return res.status(401).json({ error: 'Token invalido' })
    }

    const [rows] = await pool.query<any[]>(
      'SELECT * FROM collaborators WHERE id = ?',
      [decoded.id]
    )
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    const collaborator = rows[0]
    if (!collaborator.mfaCodeHash || !collaborator.mfaCodeExpiresAt) {
      return res.status(401).json({ error: 'Codigo expirado' })
    }

    if (new Date(collaborator.mfaCodeExpiresAt).getTime() < Date.now()) {
      return res.status(401).json({ error: 'Codigo expirado' })
    }

    const codeHash = crypto.createHash('sha256').update(String(code)).digest('hex')
    if (codeHash !== collaborator.mfaCodeHash) {
      return res.status(401).json({ error: 'Codigo invalido' })
    }

    await pool.query(
      'UPDATE collaborators SET mfaCodeHash = NULL, mfaCodeExpiresAt = NULL WHERE id = ?',
      [collaborator.id]
    )

    const permissions = await getEffectivePermissions(collaborator.id)

    const authToken = issueAuthToken(collaborator, permissions, rememberMe)

    return res.json({
      token: authToken,
      user: buildTokenPayload(collaborator, permissions),
    })
  } catch (error: any) {
    console.error('Error verifying mfa:', error)
    res.status(500).json({ error: 'Error al verificar codigo' })
  }
}

export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email } = req.body
    const normalizedEmail = email ? String(email).trim().toLowerCase() : ''

    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Email requerido' })
    }

    const [rows] = await pool.query<any[]>(
      'SELECT * FROM collaborators WHERE email = ?',
      [normalizedEmail]
    )

    if (!Array.isArray(rows) || rows.length === 0) {
      console.log('[auth] reset request: email not found', normalizedEmail)
      return res.json({ message: 'Si el email existe, enviaremos instrucciones.' })
    }

    const collaborator = rows[0]
    console.log('[auth] reset request: sending to', collaborator.email)
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

    console.log('[auth] reset request: email sent', collaborator.email)

    return res.json({ message: 'Si el email existe, enviaremos instrucciones.' })
  } catch (error: any) {
    console.error('Error in requestPasswordReset:', error)
    res.status(500).json({ error: 'Error al solicitar recuperacion' })
  }
}

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body

    if (!token || !password) {
      return res.status(400).json({ error: 'Token y contrasena requeridos' })
    }

    if (String(password).length < 8) {
      return res.status(400).json({ error: 'La contrasena debe tener al menos 8 caracteres' })
    }

    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex')
    const [rows] = await pool.query<any[]>(
      `SELECT * FROM collaborators 
       WHERE passwordResetTokenHash = ? AND passwordResetExpiresAt > NOW()`,
      [tokenHash]
    )

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Token invalido o expirado' })
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
    console.error('Error in resetPassword:', error)
    res.status(500).json({ error: 'Error al restablecer contrasena' })
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
      return res.status(401).json({ error: 'Sesion invalida' })
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Contrasena actual y nueva contrasena son requeridas' })
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'La nueva contrasena debe tener al menos 8 caracteres' })
    }

    const [rows] = await pool.query<any[]>('SELECT id, passwordHash FROM collaborators WHERE id = ?', [collaboratorId])
    const collaborator = rows?.[0]

    if (!collaborator) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    if (!collaborator.passwordHash) {
      return res.status(400).json({
        error: 'Tu cuenta no tiene una contrasena local configurada. Usa recuperacion de contrasena o el acceso corporativo.',
      })
    }

    const matches = await bcrypt.compare(String(currentPassword), collaborator.passwordHash)
    if (!matches) {
      return res.status(401).json({ error: 'La contrasena actual es incorrecta' })
    }

    if (String(currentPassword) === String(newPassword)) {
      return res.status(400).json({ error: 'La nueva contrasena debe ser distinta de la actual' })
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
    console.error('Error in changePassword:', error)
    return res.status(500).json({ error: 'Error al cambiar la contrasena' })
  }
}

export const register = async (req: Request, res: Response) => {
  try {
    if (!appEnv.selfRegisterEnabled) {
      return res.status(403).json({
        error: 'El registro autonomo esta deshabilitado en esta instancia. El alta inicial se realiza por despliegue/bootstrap del cliente.',
      })
    }

    const { companyName, adminName, email, password } = req.body
    const normalizedEmail = email ? String(email).trim().toLowerCase() : ''

    if (!companyName || !adminName || !normalizedEmail || !password) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Email inválido' })
    }

    if (String(password).length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
    }

    const [existing] = await pool.query<any[]>(
      'SELECT id FROM collaborators WHERE email = ?',
      [normalizedEmail]
    )
    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(400).json({ error: 'Ya existe una cuenta con ese email' })
    }

    const [companyResult] = await pool.query<any>(
      `INSERT INTO org_scopes (name, type, parentId, metadata, active) VALUES (?, 'company', NULL, ?, 1)`,
      [String(companyName).trim(), JSON.stringify({ code: 'COMPANY', aliases: ['company'] })]
    )
    const companyScopeId = Number(companyResult.insertId)

    await pool.query(
      `INSERT INTO org_scopes (name, type, parentId, metadata, active) VALUES ('General', 'area', ?, NULL, 1)`,
      [companyScopeId]
    )

    const passwordHash = await bcrypt.hash(String(password), 10)
    const [adminResult] = await pool.query<any>(
      `INSERT INTO collaborators (name, position, area, orgScopeId, managerId, role, status, email, passwordHash, mfaEnabled, hasSuperpowers)
       VALUES (?, 'Administrador', ?, ?, NULL, 'admin', 'active', ?, ?, 0, 1)`,
      [String(adminName).trim(), String(companyName).trim(), companyScopeId, normalizedEmail, passwordHash]
    )
    const adminId = Number(adminResult.insertId)

    const permissions = await getEffectivePermissions(adminId)
    const [adminRows] = await pool.query<any[]>('SELECT * FROM collaborators WHERE id = ?', [adminId])
    const adminCollaborator = adminRows[0]
    const token = issueAuthToken(adminCollaborator, permissions, true)

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
      console.error('[register] Error enviando email de bienvenida:', mailErr)
    }

    return res.status(201).json({
      token,
      user: {
        id: adminId,
        name: String(adminName).trim(),
        email: normalizedEmail,
        role: 'admin',
        companyName: String(companyName).trim(),
      },
    })
  } catch (error: any) {
    console.error('Error in register:', error)
    res.status(500).json({ error: 'Error al registrar la empresa' })
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
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    const collaborator = rows[0]

    const permissions = await getEffectivePermissions(collaborator.id)

    res.json({
      ...buildTokenPayload(collaborator, permissions),
    } as User)
  } catch (error: any) {
    console.error('Error getting current user:', error)
    res.status(500).json({ error: 'Error al obtener usuario' })
  }
}
