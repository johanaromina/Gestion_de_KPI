import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { pool } from '../config/database'
import { sendMail } from '../utils/mailer'
import { getEffectivePermissions } from '../utils/permissions'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production'
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173'
const MFA_TTL_MIN = parseInt(process.env.MFA_TTL_MIN || '10')
const RESET_TTL_MIN = parseInt(process.env.RESET_TTL_MIN || '60')

if (!process.env.JWT_SECRET) {
  console.warn('??  ADVERTENCIA: JWT_SECRET no esta configurado. Usando clave por defecto (solo para desarrollo).')
  console.warn('??  En produccion, configura JWT_SECRET en el archivo .env')
}

interface User {
  id: number
  email: string
  name: string
  role: string
  collaboratorId?: number
  hasSuperpowers?: boolean
  permissions?: string[]
}

const buildTokenPayload = (collaborator: any, permissions: string[]) => ({
  id: collaborator.id,
  name: collaborator.name,
  role: collaborator.role,
  area: collaborator.area,
  collaboratorId: collaborator.id,
  hasSuperpowers: collaborator.hasSuperpowers === 1 || collaborator.hasSuperpowers === true,
  permissions,
})

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
      const expiresAt = new Date(Date.now() + MFA_TTL_MIN * 60 * 1000)

      await pool.query(
        'UPDATE collaborators SET mfaCodeHash = ?, mfaCodeExpiresAt = ? WHERE id = ?',
        [codeHash, expiresAt, collaborator.id]
      )

      await sendMail({
        to: collaborator.email,
        subject: 'Codigo de acceso - KPI Manager',
        html: `<p>Tu codigo de verificacion es:</p><h2>${code}</h2><p>Vence en ${MFA_TTL_MIN} minutos.</p>`,
        text: `Tu codigo de verificacion es: ${code}. Vence en ${MFA_TTL_MIN} minutos.`,
      })

      const mfaToken = jwt.sign(
        { id: collaborator.id, purpose: 'mfa' },
        JWT_SECRET,
        { expiresIn: `${MFA_TTL_MIN}m` }
      )

      return res.json({ mfaRequired: true, mfaToken })
    }

    const expiresIn = rememberMe ? '30d' : '1d'
    const token = jwt.sign(buildTokenPayload(collaborator, permissions), JWT_SECRET, { expiresIn })

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
      decoded = jwt.verify(token, JWT_SECRET) as any
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

    const expiresIn = rememberMe ? '30d' : '1d'
    const authToken = jwt.sign(buildTokenPayload(collaborator, permissions), JWT_SECRET, { expiresIn })

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
    const expiresAt = new Date(Date.now() + RESET_TTL_MIN * 60 * 1000)

    await pool.query(
      'UPDATE collaborators SET passwordResetTokenHash = ?, passwordResetExpiresAt = ? WHERE id = ?',
      [tokenHash, expiresAt, collaborator.id]
    )

    const resetLink = `${APP_BASE_URL}/reset-password?token=${rawToken}`

    await sendMail({
      to: collaborator.email,
      subject: 'Recuperacion de contrasena - KPI Manager',
      html: `<p>Recibimos una solicitud para restablecer tu contrasena.</p>
             <p><a href="${resetLink}">Restablecer contrasena</a></p>
             <p>Este enlace vence en ${RESET_TTL_MIN} minutos.</p>`,
      text: `Restablece tu contrasena: ${resetLink} (vence en ${RESET_TTL_MIN} minutos).`,
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

export const register = async (req: Request, res: Response) => {
  try {
    res.status(501).json({ error: 'Registro no implementado en MVP' })
  } catch (error: any) {
    console.error('Error in register:', error)
    res.status(500).json({ error: 'Error al registrar' })
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
