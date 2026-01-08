import { Request, Response } from 'express'
import { pool } from '../config/database'
import { ObjectiveTree, KPI } from '../types'

export const getObjectiveTrees = async (req: Request, res: Response) => {
  try {
    // Cargar todos los KPIs con sus áreas (para asociar automáticamente por área)
    const [allKpisRows] = await pool.query<any[]>(
      `SELECT k.*,
              GROUP_CONCAT(DISTINCT ka.area) as areas
       FROM kpis k
       LEFT JOIN kpi_areas ka ON ka.kpiId = k.id
       GROUP BY k.id`
    )
    const allKpis: KPI[] = (allKpisRows || []).map((row) => ({
      ...row,
      areas: row.areas ? row.areas.split(',').map((a: string) => a.trim()) : [],
    }))
    const kpiMap = new Map<number, KPI>()
    allKpis.forEach((kpi) => kpiMap.set(kpi.id as number, kpi))

    const [rows] = await pool.query<any[]>(
      `SELECT 
          ot.id,
          ot.name,
          ot.level,
          ot.parentId,
          GROUP_CONCAT(DISTINCT otk.kpiId) as kpiIds
       FROM objective_trees ot
       LEFT JOIN objective_trees_kpis otk ON ot.id = otk.objectiveTreeId
       GROUP BY ot.id, ot.name, ot.level, ot.parentId
       ORDER BY ot.level, ot.name ASC`
    )

    // Obtener KPIs para cada objetivo
    const objectivesWithKPIs = await Promise.all(
      rows.map(async (row) => {
        const kpiIds = row.kpiIds ? row.kpiIds.split(',').map(Number) : []
        const kpiIdSet = new Set<number>(kpiIds)

        // Asociar KPIs por área (nombre del objetivo coincide con el área del KPI)
        const objectiveArea = (row.name || '').trim().toLowerCase()
        if (objectiveArea) {
          allKpis.forEach((kpi) => {
            const hasArea = (kpi.areas || []).some(
              (a) => a && a.trim().toLowerCase() === objectiveArea
            )
            if (hasArea) {
              kpiIdSet.add(kpi.id as number)
            }
          })
        }

        const kpis: any[] = Array.from(kpiIdSet)
          .map((id) => kpiMap.get(id))
          .filter(Boolean)

        return {
          id: row.id,
          level: row.level,
          name: row.name,
          parentId: row.parentId,
          kpis,
        }
      })
    )

    res.json(objectivesWithKPIs)
  } catch (error: any) {
    console.error('Error fetching objective trees:', error)
    res.status(500).json({ error: 'Error al obtener árbol de objetivos' })
  }
}

export const getObjectiveTreeById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query<any[]>(
      'SELECT * FROM objective_trees WHERE id = ?',
      [id]
    )

    if (Array.isArray(rows) && rows.length === 0) {
      return res.status(404).json({ error: 'Objetivo no encontrado' })
    }

    const objective = rows[0]

    // Obtener KPIs asociados
    const [kpiRows] = await pool.query<any[]>(
      `SELECT k.* FROM kpis k
       INNER JOIN objective_trees_kpis otk ON k.id = otk.kpiId
       WHERE otk.objectiveTreeId = ?`,
      [id]
    )

    res.json({
      ...objective,
      kpis: kpiRows || [],
    })
  } catch (error: any) {
    console.error('Error fetching objective tree:', error)
    res.status(500).json({ error: 'Error al obtener objetivo' })
  }
}

export const createObjectiveTree = async (req: Request, res: Response) => {
  try {
    const { level, name, parentId, kpiIds } = req.body

    if (!level || !name) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    const [result] = await pool.query(
      `INSERT INTO objective_trees (level, name, parentId) 
       VALUES (?, ?, ?)`,
      [level, name, parentId || null]
    )

    const insertResult = result as any
    const objectiveId = insertResult.insertId

    // Vincular KPIs si se proporcionaron
    if (kpiIds && Array.isArray(kpiIds) && kpiIds.length > 0) {
      for (const kpiId of kpiIds) {
        await pool.query(
          `INSERT INTO objective_trees_kpis (objectiveTreeId, kpiId) 
           VALUES (?, ?)`,
          [objectiveId, kpiId]
        )
      }
    }

    res.status(201).json({
      id: objectiveId,
      level,
      name,
      parentId: parentId || null,
      kpiIds: kpiIds || [],
    })
  } catch (error: any) {
    console.error('Error creating objective tree:', error)
    res.status(500).json({ error: 'Error al crear objetivo' })
  }
}

export const updateObjectiveTree = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { level, name, parentId, kpiIds } = req.body

    await pool.query(
      `UPDATE objective_trees 
       SET level = ?, name = ?, parentId = ? 
       WHERE id = ?`,
      [level, name, parentId || null, id]
    )

    // Actualizar KPIs asociados
    // Primero eliminar todas las relaciones existentes
    await pool.query(
      'DELETE FROM objective_trees_kpis WHERE objectiveTreeId = ?',
      [id]
    )

    // Luego agregar las nuevas relaciones
    if (kpiIds && Array.isArray(kpiIds) && kpiIds.length > 0) {
      for (const kpiId of kpiIds) {
        await pool.query(
          `INSERT INTO objective_trees_kpis (objectiveTreeId, kpiId) 
           VALUES (?, ?)`,
          [id, kpiId]
        )
      }
    }

    res.json({ message: 'Objetivo actualizado correctamente' })
  } catch (error: any) {
    console.error('Error updating objective tree:', error)
    res.status(500).json({ error: 'Error al actualizar objetivo' })
  }
}

export const deleteObjectiveTree = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await pool.query('DELETE FROM objective_trees WHERE id = ?', [id])

    res.json({ message: 'Objetivo eliminado correctamente' })
  } catch (error: any) {
    console.error('Error deleting objective tree:', error)
    res.status(500).json({ error: 'Error al eliminar objetivo' })
  }
}
