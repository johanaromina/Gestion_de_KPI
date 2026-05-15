import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { appEnv } from '../config/env'

export interface AuthRequest extends Request {
  user?: {
    id: number
    name: string
    role: string
    area?: string
    collaboratorId?: number
    hasSuperpowers?: boolean
    permissions?: string[]
  }
}

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // httpOnly cookie takes priority; Authorization header is the fallback for API clients
    const cookieToken = (req as any).cookies?.auth_token as string | undefined
    const authHeader = req.headers.authorization
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined
    const token = cookieToken || bearerToken

    if (!token) {
      return res.status(401).json({ error: 'Token no proporcionado' })
    }

    const decoded = jwt.verify(token, appEnv.jwtSecret) as any

    ;(req as AuthRequest).user = {
      id: decoded.id,
      name: decoded.name,
      role: decoded.role,
      area: decoded.area,
      collaboratorId: decoded.collaboratorId,
      hasSuperpowers: decoded.hasSuperpowers || false,
      permissions: decoded.permissions || [],
    }

    next()
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido' })
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' })
    }
    return res.status(500).json({ error: 'Error al autenticar' })
  }
}

export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthRequest).user

    if (!user) {
      return res.status(401).json({ error: 'No autenticado' })
    }

    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: 'No autorizado' })
    }

    next()
  }
}

export const requirePermission = (...permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthRequest).user
    if (!user) {
      return res.status(401).json({ error: 'No autenticado' })
    }
    const hasPerm =
      user.hasSuperpowers ||
      (user.permissions || []).some((p) => permissions.includes(p)) ||
      false
    if (!hasPerm) {
      return res.status(403).json({ error: 'No autorizado' })
    }
    next()
  }
}
