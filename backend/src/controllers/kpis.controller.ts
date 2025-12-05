import { Request, Response } from 'express'
import { pool } from '../config/database'
import { KPI } from '../types'

export const getKPIs = async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<KPI[]>(
      'SELECT * FROM kpis ORDER BY name ASC'
    )
    res.json(rows)
  } catch (error: any) {
    console.error('Error fetching KPIs:', error)
    res.status(500).json({ error: 'Error al obtener KPIs' })
  }
}

export const getKPIById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query<KPI[]>(
      'SELECT * FROM kpis WHERE id = ?',
      [id]
    )

    if (Array.isArray(rows) && rows.length === 0) {
      return res.status(404).json({ error: 'KPI no encontrado' })
    }

    res.json(rows[0])
  } catch (error: any) {
    console.error('Error fetching KPI:', error)
    res.status(500).json({ error: 'Error al obtener KPI' })
  }
}

export const createKPI = async (req: Request, res: Response) => {
  try {
    const { name, description, type, criteria, macroKPIId } = req.body

    if (!name || !type) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    const [result] = await pool.query(
      `INSERT INTO kpis (name, description, type, criteria, macroKPIId) 
       VALUES (?, ?, ?, ?, ?)`,
      [name, description || null, type, criteria || null, macroKPIId || null]
    )

    const insertResult = result as any
    res.status(201).json({
      id: insertResult.insertId,
      name,
      description: description || null,
      type,
      criteria: criteria || null,
      macroKPIId: macroKPIId || null,
    })
  } catch (error: any) {
    console.error('Error creating KPI:', error)
    res.status(500).json({ error: 'Error al crear KPI' })
  }
}

export const updateKPI = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, description, type, criteria, macroKPIId } = req.body

    await pool.query(
      `UPDATE kpis 
       SET name = ?, description = ?, type = ?, criteria = ?, macroKPIId = ? 
       WHERE id = ?`,
      [name, description, type, criteria, macroKPIId || null, id]
    )

    res.json({ message: 'KPI actualizado correctamente' })
  } catch (error: any) {
    console.error('Error updating KPI:', error)
    res.status(500).json({ error: 'Error al actualizar KPI' })
  }
}

export const deleteKPI = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await pool.query('DELETE FROM kpis WHERE id = ?', [id])

    res.json({ message: 'KPI eliminado correctamente' })
  } catch (error: any) {
    console.error('Error deleting KPI:', error)
    res.status(500).json({ error: 'Error al eliminar KPI' })
  }
}

