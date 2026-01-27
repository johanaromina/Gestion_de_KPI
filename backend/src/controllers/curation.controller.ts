import { Request, Response } from 'express'
import { pool } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'

export const getCurationItems = async (req: Request, res: Response) => {
  try {
    const { status, periodId, kpiId, collaboratorId, assignmentId, area, areaId, limit } = req.query

    let query = `SELECT cv.*,
                        ck.id as assignmentId,
                        k.name as kpiName,
                        c.name as collaboratorName,
                        c.area as collaboratorArea,
                        p.name as periodName,
                        cb.name as createdByName
                 FROM kpi_criteria_versions cv
                 JOIN collaborator_kpis ck ON cv.assignmentId = ck.id
                 JOIN kpis k ON ck.kpiId = k.id
                 JOIN collaborators c ON ck.collaboratorId = c.id
                 JOIN periods p ON ck.periodId = p.id
                 LEFT JOIN collaborators cb ON cv.createdBy = cb.id
                 WHERE 1=1`

    const params: any[] = []

    if (status) {
      query += ' AND cv.status = ?'
      params.push(status)
    }
    if (periodId) {
      query += ' AND ck.periodId = ?'
      params.push(periodId)
    }
    if (kpiId) {
      query += ' AND ck.kpiId = ?'
      params.push(kpiId)
    }
    if (collaboratorId) {
      query += ' AND ck.collaboratorId = ?'
      params.push(collaboratorId)
    }
    if (assignmentId) {
      query += ' AND ck.id = ?'
      params.push(assignmentId)
    }
    if (areaId) {
      query += ' AND EXISTS (SELECT 1 FROM areas a WHERE a.name = c.area AND a.id = ?)'
      params.push(areaId)
    } else if (area) {
      query += ' AND c.area = ?'
      params.push(area)
    }

    query += ' ORDER BY cv.createdAt DESC'

    if (limit) {
      query += ' LIMIT ?'
      params.push(Number(limit))
    }

    const [rows] = await pool.query(query, params)
    res.json(rows)
  } catch (error: any) {
    console.error('Error fetching curation items:', error)
    res.status(500).json({ error: 'Error al obtener curaduría' })
  }
}

export const createCriteriaVersion = async (req: Request, res: Response) => {
  try {
    const { assignmentId } = req.params
    const { dataSource, sourceConfig, criteriaText, evidenceUrl } = req.body

    if (!assignmentId) {
      return res.status(400).json({ error: 'assignmentId es requerido' })
    }

    const userId = (req as AuthRequest).user?.id || null

    const [result] = await pool.query(
      `INSERT INTO kpi_criteria_versions
       (assignmentId, dataSource, sourceConfig, criteriaText, evidenceUrl, status, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [assignmentId, dataSource || null, sourceConfig || null, criteriaText || null, evidenceUrl || null, 'in_review', userId]
    )

    await pool.query(
      `UPDATE collaborator_kpis
       SET curationStatus = ?, dataSource = ?, sourceConfig = ?
       WHERE id = ?`,
      ['in_review', dataSource || null, sourceConfig || null, assignmentId]
    )

    const insertResult = result as any
    res.status(201).json({ id: insertResult.insertId })
  } catch (error: any) {
    console.error('Error creating criteria version:', error)
    res.status(500).json({ error: 'Error al crear versión de criterio' })
  }
}

export const approveCriteriaVersion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { comment } = req.body
    const userId = (req as AuthRequest).user?.id || null

    const [rows] = await pool.query<any[]>(
      `SELECT assignmentId, dataSource, sourceConfig FROM kpi_criteria_versions WHERE id = ?`,
      [id]
    )
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'Versión de criterio no encontrada' })
    }

    const { assignmentId, dataSource, sourceConfig } = rows[0]

    await pool.query(
      `UPDATE kpi_criteria_versions
       SET status = ?, reviewedBy = ?, reviewedAt = NOW(), comment = ?
       WHERE id = ?`,
      ['approved', userId, comment || null, id]
    )

    await pool.query(
      `UPDATE collaborator_kpis
       SET curationStatus = ?, activeCriteriaVersionId = ?, dataSource = ?, sourceConfig = ?
       WHERE id = ?`,
      ['approved', id, dataSource || null, sourceConfig || null, assignmentId]
    )

    res.json({ message: 'Criterio aprobado correctamente' })
  } catch (error: any) {
    console.error('Error approving criteria version:', error)
    res.status(500).json({ error: 'Error al aprobar criterio' })
  }
}

export const rejectCriteriaVersion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { comment } = req.body
    const userId = (req as AuthRequest).user?.id || null

    const [rows] = await pool.query<any[]>(
      `SELECT assignmentId FROM kpi_criteria_versions WHERE id = ?`,
      [id]
    )
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'Versión de criterio no encontrada' })
    }

    const assignmentId = rows[0].assignmentId

    await pool.query(
      `UPDATE kpi_criteria_versions
       SET status = ?, reviewedBy = ?, reviewedAt = NOW(), comment = ?
       WHERE id = ?`,
      ['rejected', userId, comment || null, id]
    )

    await pool.query(
      `UPDATE collaborator_kpis
       SET curationStatus = ?
       WHERE id = ?`,
      ['rejected', assignmentId]
    )

    res.json({ message: 'Criterio rechazado correctamente' })
  } catch (error: any) {
    console.error('Error rejecting criteria version:', error)
    res.status(500).json({ error: 'Error al rechazar criterio' })
  }
}

export const requestCriteriaChanges = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { comment } = req.body
    const userId = (req as AuthRequest).user?.id || null

    const [rows] = await pool.query<any[]>(
      `SELECT assignmentId FROM kpi_criteria_versions WHERE id = ?`,
      [id]
    )
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'Versión de criterio no encontrada' })
    }

    const assignmentId = rows[0].assignmentId

    await pool.query(
      `UPDATE kpi_criteria_versions
       SET status = ?, reviewedBy = ?, reviewedAt = NOW(), comment = ?
       WHERE id = ?`,
      ['in_review', userId, comment || null, id]
    )

    await pool.query(
      `UPDATE collaborator_kpis
       SET curationStatus = ?
       WHERE id = ?`,
      ['in_review', assignmentId]
    )

    res.json({ message: 'Cambios solicitados correctamente' })
  } catch (error: any) {
    console.error('Error requesting criteria changes:', error)
    res.status(500).json({ error: 'Error al solicitar cambios' })
  }
}
