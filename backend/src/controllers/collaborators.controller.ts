import { Request, Response } from 'express'
import { pool } from '../config/database'
import { Collaborator } from '../types'

export const getCollaborators = async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<Collaborator[]>(
      'SELECT * FROM collaborators ORDER BY name ASC'
    )
    res.json(rows)
  } catch (error: any) {
    console.error('Error fetching collaborators:', error)
    res.status(500).json({ error: 'Error al obtener colaboradores' })
  }
}

export const getCollaboratorById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query<Collaborator[]>(
      'SELECT * FROM collaborators WHERE id = ?',
      [id]
    )

    if (Array.isArray(rows) && rows.length === 0) {
      return res.status(404).json({ error: 'Colaborador no encontrado' })
    }

    res.json(rows[0])
  } catch (error: any) {
    console.error('Error fetching collaborator:', error)
    res.status(500).json({ error: 'Error al obtener colaborador' })
  }
}

export const createCollaborator = async (req: Request, res: Response) => {
  try {
    const { name, position, area, managerId, role } = req.body

    if (!name || !position || !area || !role) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    const [result] = await pool.query(
      `INSERT INTO collaborators (name, position, area, managerId, role) 
       VALUES (?, ?, ?, ?, ?)`,
      [name, position, area, managerId || null, role]
    )

    const insertResult = result as any
    res.status(201).json({
      id: insertResult.insertId,
      name,
      position,
      area,
      managerId: managerId || null,
      role,
    })
  } catch (error: any) {
    console.error('Error creating collaborator:', error)
    res.status(500).json({ error: 'Error al crear colaborador' })
  }
}

export const updateCollaborator = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, position, area, managerId, role } = req.body

    await pool.query(
      `UPDATE collaborators 
       SET name = ?, position = ?, area = ?, managerId = ?, role = ? 
       WHERE id = ?`,
      [name, position, area, managerId || null, role, id]
    )

    res.json({ message: 'Colaborador actualizado correctamente' })
  } catch (error: any) {
    console.error('Error updating collaborator:', error)
    res.status(500).json({ error: 'Error al actualizar colaborador' })
  }
}

export const deleteCollaborator = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await pool.query('DELETE FROM collaborators WHERE id = ?', [id])

    res.json({ message: 'Colaborador eliminado correctamente' })
  } catch (error: any) {
    console.error('Error deleting collaborator:', error)
    res.status(500).json({ error: 'Error al eliminar colaborador' })
  }
}

