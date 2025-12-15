import { Request, Response } from 'express'
import { pool } from '../config/database'
import { Area } from '../types'

export const getAreas = async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<Area[]>('SELECT * FROM areas ORDER BY name ASC')
    res.json(rows)
  } catch (error: any) {
    console.error('Error fetching areas:', error)
    res.status(500).json({ error: 'Error al obtener áreas' })
  }
}

export const createArea = async (req: Request, res: Response) => {
  try {
    const { name, parentId } = req.body

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre es requerido' })
    }

    const [result] = await pool.query(
      `INSERT INTO areas (name, parentId) VALUES (?, ?)`,
      [name.trim(), parentId || null]
    )

    const insertResult = result as any
    res.status(201).json({
      id: insertResult.insertId,
      name: name.trim(),
      parentId: parentId || null,
    })
  } catch (error: any) {
    console.error('Error creating area:', error)
    res.status(500).json({ error: 'Error al crear área' })
  }
}

export const updateArea = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, parentId } = req.body

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre es requerido' })
    }

    await pool.query(
      `UPDATE areas SET name = ?, parentId = ? WHERE id = ?`,
      [name.trim(), parentId || null, id]
    )

    res.json({ message: 'Área actualizada correctamente' })
  } catch (error: any) {
    console.error('Error updating area:', error)
    res.status(500).json({ error: 'Error al actualizar área' })
  }
}

export const deleteArea = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    await pool.query('DELETE FROM areas WHERE id = ?', [id])
    res.json({ message: 'Área eliminada correctamente' })
  } catch (error: any) {
    console.error('Error deleting area:', error)
    res.status(500).json({ error: 'Error al eliminar área' })
  }
}
