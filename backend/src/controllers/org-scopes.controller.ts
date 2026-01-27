import { Request, Response } from 'express'
import { pool } from '../config/database'

const parseJson = (value: any) => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export const listOrgScopes = async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT * FROM org_scopes ORDER BY type ASC, name ASC`
    )
    const data = Array.isArray(rows)
      ? rows.map((row) => ({
          ...row,
          metadata: row.metadata ? parseJson(row.metadata) : null,
        }))
      : []
    res.json(data)
  } catch (error: any) {
    console.error('Error fetching org scopes:', error)
    res.status(500).json({ error: 'Error al obtener scopes' })
  }
}

export const createOrgScope = async (req: Request, res: Response) => {
  try {
    const { name, type, parentId, metadata, active } = req.body
    if (!name) {
      return res.status(400).json({ error: 'name es requerido' })
    }
    const [result] = await pool.query(
      `INSERT INTO org_scopes (name, type, parentId, metadata, active)
       VALUES (?, ?, ?, ?, ?)`,
      [
        name,
        type || 'area',
        parentId || null,
        metadata ? JSON.stringify(metadata) : null,
        active === false ? 0 : 1,
      ]
    )
    const insertResult = result as any
    res.status(201).json({ id: insertResult.insertId })
  } catch (error: any) {
    console.error('Error creating org scope:', error)
    res.status(500).json({ error: 'Error al crear scope' })
  }
}

export const updateOrgScope = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, type, parentId, metadata, active } = req.body
    await pool.query(
      `UPDATE org_scopes
       SET name = ?, type = ?, parentId = ?, metadata = ?, active = ?
       WHERE id = ?`,
      [
        name,
        type || 'area',
        parentId || null,
        metadata ? JSON.stringify(metadata) : null,
        active === false ? 0 : 1,
        id,
      ]
    )
    res.json({ message: 'Scope actualizado' })
  } catch (error: any) {
    console.error('Error updating org scope:', error)
    res.status(500).json({ error: 'Error al actualizar scope' })
  }
}
