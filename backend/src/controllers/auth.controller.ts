import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { pool } from '../config/database'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

interface User {
  id: number
  email: string
  name: string
  role: string
  collaboratorId?: number
}

// Para MVP, usaremos la tabla de collaborators como usuarios
// En producción, deberías tener una tabla de usuarios separada
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    // TODO: En producción, buscar en tabla de usuarios
    // Por ahora, usamos un sistema simple basado en colaboradores
    // Esto es solo para MVP - necesitarás crear tabla de usuarios después

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' })
    }

    // Para MVP: buscar colaborador por email (necesitarías agregar campo email a collaborators)
    // Por ahora, hacemos login simple con ID de colaborador
    const { collaboratorId } = req.body

    if (!collaboratorId) {
      return res.status(400).json({ error: 'ID de colaborador requerido' })
    }

    const [rows] = await pool.query<any[]>(
      'SELECT * FROM collaborators WHERE id = ?',
      [collaboratorId]
    )

    if (Array.isArray(rows) && rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    const collaborator = rows[0]

    // Para MVP, generamos token directamente
    // En producción, validarías la contraseña aquí
    const token = jwt.sign(
      {
        id: collaborator.id,
        name: collaborator.name,
        role: collaborator.role,
        collaboratorId: collaborator.id,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    res.json({
      token,
      user: {
        id: collaborator.id,
        name: collaborator.name,
        role: collaborator.role,
        collaboratorId: collaborator.id,
      },
    })
  } catch (error: any) {
    console.error('Error in login:', error)
    res.status(500).json({ error: 'Error al iniciar sesión' })
  }
}

export const register = async (req: Request, res: Response) => {
  try {
    // Para MVP, el registro se hace creando un colaborador
    // En producción, crearías un usuario y luego un colaborador
    res.status(501).json({ error: 'Registro no implementado en MVP' })
  } catch (error: any) {
    console.error('Error in register:', error)
    res.status(500).json({ error: 'Error al registrar' })
  }
}

export const getCurrentUser = async (req: Request, res: Response) => {
  try {
    // El usuario viene del middleware de autenticación
    const user = (req as any).user

    // Obtener datos actualizados del colaborador
    const [rows] = await pool.query<any[]>(
      'SELECT * FROM collaborators WHERE id = ?',
      [user.collaboratorId || user.id]
    )

    if (Array.isArray(rows) && rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    const collaborator = rows[0]

    res.json({
      id: user.id,
      name: collaborator.name,
      role: collaborator.role,
      collaboratorId: collaborator.id,
    })
  } catch (error: any) {
    console.error('Error getting current user:', error)
    res.status(500).json({ error: 'Error al obtener usuario' })
  }
}

