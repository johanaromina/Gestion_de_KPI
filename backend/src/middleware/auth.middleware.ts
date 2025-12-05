import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export interface AuthRequest extends Request {
  user?: {
    id: number
    name: string
    role: string
    collaboratorId?: number
  }
}

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no proporcionado' })
    }

    const token = authHeader.substring(7)

    const decoded = jwt.verify(token, JWT_SECRET) as any

    ;(req as AuthRequest).user = {
      id: decoded.id,
      name: decoded.name,
      role: decoded.role,
      collaboratorId: decoded.collaboratorId,
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
