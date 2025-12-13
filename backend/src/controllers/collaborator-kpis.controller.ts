import { Request, Response } from 'express'
import { pool } from '../config/database'
import { CollaboratorKPI, KPIType } from '../types'
import { calculateVariation, calculateWeightedResult } from '../utils/kpi-formulas'
import { AuthRequest } from '../middleware/auth.middleware'

const canEditAssignment = async (user: AuthRequest['user'], collaboratorId: number) => {
  if (!user) return false
  if (
    user.hasSuperpowers ||
    user.permissions?.includes('config.manage') ||
    ['admin', 'director'].includes(user.role)
  ) {
    return true
  }
  const [rows] = await pool.query<any[]>('SELECT area FROM collaborators WHERE id = ?', [collaboratorId])
  const area = rows?.[0]?.area
  return area ? area === user.area : false
}

export const getCollaboratorKPIs = async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<CollaboratorKPI[]>(
      `SELECT ck.*, 
              k.type as kpiType,
              k.name as kpiName,
              k.description as kpiDescription,
              k.criteria as kpiCriteria,
              c.name as collaboratorName,
              p.name as periodName,
              p.status as periodStatus
       FROM collaborator_kpis ck
       JOIN kpis k ON ck.kpiId = k.id
       JOIN collaborators c ON ck.collaboratorId = c.id
       JOIN periods p ON ck.periodId = p.id
       ORDER BY ck.createdAt DESC`
    )
    res.json(rows)
  } catch (error: any) {
    console.error('Error fetching collaborator KPIs:', error)
    res.status(500).json({ error: 'Error al obtener asignaciones' })
  }
}

export const getCollaboratorKPIById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query<CollaboratorKPI[]>(
      `SELECT ck.*, 
              k.type as kpiType,
              k.name as kpiName,
              k.description as kpiDescription,
              k.criteria as kpiCriteria
       FROM collaborator_kpis ck
       JOIN kpis k ON ck.kpiId = k.id
       WHERE ck.id = ?`,
      [id]
    )

    if (Array.isArray(rows) && rows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada' })
    }

    res.json(rows[0])
  } catch (error: any) {
    console.error('Error fetching collaborator KPI:', error)
    res.status(500).json({ error: 'Error al obtener asignación' })
  }
}

export const getCollaboratorKPIsByCollaborator = async (req: Request, res: Response) => {
  try {
    const { collaboratorId } = req.params
    const { periodId } = req.query

    let query = `SELECT ck.*, 
                        k.type as kpiType,
                        k.name as kpiName,
                        k.description as kpiDescription,
                        k.criteria as kpiCriteria,
                        p.name as periodName,
                        p.status as periodStatus
                 FROM collaborator_kpis ck
                 JOIN kpis k ON ck.kpiId = k.id
                 JOIN periods p ON ck.periodId = p.id
                 WHERE ck.collaboratorId = ?`

    const params: any[] = [collaboratorId]

    if (periodId) {
      query += ' AND ck.periodId = ?'
      params.push(periodId)
    }

    query += ' ORDER BY p.startDate DESC, ck.createdAt DESC'

    const [rows] = await pool.query<CollaboratorKPI[]>(query, params)
    res.json(rows)
  } catch (error: any) {
    console.error('Error fetching collaborator KPIs:', error)
    res.status(500).json({ error: 'Error al obtener asignaciones' })
  }
}

export const getCollaboratorKPIsByPeriod = async (req: Request, res: Response) => {
  try {
    const { periodId } = req.params
    const [rows] = await pool.query<CollaboratorKPI[]>(
      `SELECT ck.*, 
              k.type as kpiType,
              k.name as kpiName,
              k.description as kpiDescription,
              k.criteria as kpiCriteria,
              c.name as collaboratorName
       FROM collaborator_kpis ck
       JOIN kpis k ON ck.kpiId = k.id
       JOIN collaborators c ON ck.collaboratorId = c.id
       WHERE ck.periodId = ?
       ORDER BY c.name ASC`,
      [periodId]
    )
    res.json(rows)
  } catch (error: any) {
    console.error('Error fetching collaborator KPIs:', error)
    res.status(500).json({ error: 'Error al obtener asignaciones' })
  }
}

export const createCollaboratorKPI = async (req: Request, res: Response) => {
  try {
    const { collaboratorId, kpiId, periodId, subPeriodId, target, weight, status } = req.body

    if (!collaboratorId || !kpiId || !periodId || !target || !weight) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    const canEdit = await canEditAssignment((req as AuthRequest).user, collaboratorId)
    if (!canEdit) {
      return res.status(403).json({ error: 'No autorizado para crear asignaciones fuera de tu área' })
    }

    const [periodRows] = await pool.query<any[]>('SELECT status FROM periods WHERE id = ?', [periodId])

    if (Array.isArray(periodRows) && periodRows.length > 0 && periodRows[0].status === 'closed') {
      return res.status(403).json({
        error: 'No se pueden crear asignaciones en períodos cerrados',
      })
    }

    const [existingWeights] = await pool.query<any[]>(
      `SELECT SUM(weight) as totalWeight 
       FROM collaborator_kpis 
       WHERE collaboratorId = ? AND periodId = ?`,
      [collaboratorId, periodId]
    )

    if (Array.isArray(existingWeights) && existingWeights.length > 0) {
      const currentTotal = parseFloat(existingWeights[0].totalWeight || 0)
      const newTotal = currentTotal + (Number(weight) || 0)

      if (newTotal > 100.01) {
        return res.status(400).json({
          error: `La suma de ponderaciones no puede superar el 100%`,
        })
      }
    }

    const [kpiRows] = await pool.query<any[]>('SELECT type FROM kpis WHERE id = ?', [kpiId])

    if (Array.isArray(kpiRows) && kpiRows.length === 0) {
      return res.status(404).json({ error: 'KPI no encontrado' })
    }

    const kpiType = kpiRows[0].type

    const [result] = await pool.query(
      `INSERT INTO collaborator_kpis 
       (collaboratorId, kpiId, periodId, subPeriodId, target, weight, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [collaboratorId, kpiId, periodId, subPeriodId || null, target, weight, status || 'draft']
    )

    const insertResult = result as any
    res.status(201).json({
      id: insertResult.insertId,
      collaboratorId,
      kpiId,
      periodId,
      subPeriodId: subPeriodId || null,
      target,
      weight,
      status: status || 'draft',
    })
  } catch (error: any) {
    console.error('Error creating collaborator KPI:', error)
    res.status(500).json({ error: 'Error al crear asignación' })
  }
}

export const updateCollaboratorKPI = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { target, actual, weight, status, comments, subPeriodId } = req.body

    const [ckRows] = await pool.query<any[]>(
      `SELECT ck.status as assignmentStatus, p.status as periodStatus, ck.collaboratorId
       FROM collaborator_kpis ck
       JOIN periods p ON ck.periodId = p.id
       WHERE ck.id = ?`,
      [id]
    )

    if (Array.isArray(ckRows) && ckRows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada' })
    }

    const { assignmentStatus, periodStatus, collaboratorId } = ckRows[0]

    const canEdit = await canEditAssignment((req as AuthRequest).user, collaboratorId)
    if (!canEdit) {
      return res.status(403).json({ error: 'No autorizado para editar asignaciones fuera de tu área' })
    }

    if (assignmentStatus === 'closed' || periodStatus === 'closed') {
      const userRole = (req as any).user?.role
      const canReopen = ['admin', 'director'].includes(userRole)

      if (status !== 'closed' && !canReopen) {
        return res.status(403).json({
          error: 'No se puede editar una asignación cerrada. Solo administradores y directores pueden reabrir.',
        })
      }

      if (assignmentStatus === 'closed' && !canReopen) {
        return res.status(403).json({
          error: 'Esta asignación está cerrada y no puede ser editada. Solo administradores y directores pueden reabrir.',
        })
      }
    }

    if (weight !== undefined) {
      const [existingWeights] = await pool.query<any[]>(
        `SELECT SUM(weight) as totalWeight 
         FROM collaborator_kpis 
         WHERE collaboratorId = (SELECT collaboratorId FROM collaborator_kpis WHERE id = ?)
         AND periodId = (SELECT periodId FROM collaborator_kpis WHERE id = ?)
         AND id != ?`,
        [id, id, id]
      )

      if (Array.isArray(existingWeights) && existingWeights.length > 0) {
        const currentTotal = parseFloat(existingWeights[0].totalWeight || 0)
        const newTotal = currentTotal + (Number(weight) || 0)

        if (newTotal > 100.01) {
          return res.status(400).json({
            error: `La suma de ponderaciones no puede superar el 100%`,
          })
        }
      }
    }

    let updateQuery = `UPDATE collaborator_kpis 
                       SET target = ?, weight = ?, status = ?, comments = ?, subPeriodId = ?`
    const params: any[] = [target, weight, status, comments, subPeriodId || null]

    if (actual !== undefined) {
      const [ckDataRows] = await pool.query<any[]>(
        `SELECT ck.target, k.type 
         FROM collaborator_kpis ck
         JOIN kpis k ON ck.kpiId = k.id
         WHERE ck.id = ?`,
        [id]
      )

      if (Array.isArray(ckDataRows) && ckDataRows.length > 0) {
        const kpiType = ckDataRows[0].type
        const currentTarget = target || ckDataRows[0].target

        const variation = calculateVariation(kpiType, currentTarget, actual)
        const weightedResult = calculateWeightedResult(variation, weight)

        updateQuery += `, actual = ?, variation = ?, weightedResult = ?`
        params.push(actual, variation, weightedResult)
      } else {
        updateQuery += `, actual = ?`
        params.push(actual)
      }
    }

    updateQuery += ' WHERE id = ?'
    params.push(id)

    await pool.query(updateQuery, params)

    res.json({ message: 'Asignación actualizada correctamente' })
  } catch (error: any) {
    console.error('Error updating collaborator KPI:', error)
    res.status(500).json({ error: 'Error al actualizar asignación' })
  }
}

export const updateActualValue = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { actual } = req.body

    if (actual === undefined) {
      return res.status(400).json({ error: 'El valor actual es requerido' })
    }

    const [ckRows] = await pool.query<any[]>(
      `SELECT ck.status, p.status as periodStatus, ck.collaboratorId
       FROM collaborator_kpis ck
       JOIN periods p ON ck.periodId = p.id
       WHERE ck.id = ?`,
      [id]
    )

    if (Array.isArray(ckRows) && ckRows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada' })
    }

    if (ckRows[0].status === 'closed' || ckRows[0].periodStatus === 'closed') {
      return res.status(403).json({
        error: 'No se puede actualizar el valor de una asignación cerrada',
      })
    }

    const canEdit = await canEditAssignment((req as AuthRequest).user, ckRows[0].collaboratorId)
    if (!canEdit) {
      return res.status(403).json({ error: 'No autorizado para editar asignaciones fuera de tu área' })
    }

    const [ckDataRows] = await pool.query<any[]>(
      `SELECT ck.target, ck.weight, k.type 
       FROM collaborator_kpis ck
       JOIN kpis k ON ck.kpiId = k.id
       WHERE ck.id = ?`,
      [id]
    )

    const { target, weight, type } = ckDataRows[0]

    const variation = calculateVariation(type, target, actual)
    const weightedResult = calculateWeightedResult(variation, weight)

    await pool.query(
      `UPDATE collaborator_kpis 
       SET actual = ?, variation = ?, weightedResult = ? 
       WHERE id = ?`,
      [actual, variation, weightedResult, id]
    )

    res.json({
      message: 'Valor actualizado correctamente',
      actual,
      variation,
      weightedResult,
    })
  } catch (error: any) {
    console.error('Error updating actual value:', error)
    res.status(500).json({ error: 'Error al actualizar valor' })
  }
}

export const closeCollaboratorKPI = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const [ckRows] = await pool.query<any[]>('SELECT status, collaboratorId FROM collaborator_kpis WHERE id = ?', [id])

    if (Array.isArray(ckRows) && ckRows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada' })
    }

    const canEdit = await canEditAssignment((req as AuthRequest).user, ckRows[0].collaboratorId)
    if (!canEdit) {
      return res.status(403).json({ error: 'No autorizado para cerrar asignaciones fuera de tu área' })
    }

    if (ckRows[0].status === 'closed') {
      return res.status(400).json({ error: 'La asignación ya está cerrada' })
    }

    await pool.query('UPDATE collaborator_kpis SET status = ? WHERE id = ?', ['closed', id])

    res.json({ message: 'Asignación cerrada correctamente' })
  } catch (error: any) {
    console.error('Error closing collaborator KPI:', error)
    res.status(500).json({ error: 'Error al cerrar asignación' })
  }
}

export const reopenCollaboratorKPI = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const userRole = (req as any).user?.role

    if (!['admin', 'director'].includes(userRole)) {
      return res.status(403).json({
        error: 'Solo administradores y directores pueden reabrir asignaciones cerradas',
      })
    }

    const [ckRows] = await pool.query<any[]>('SELECT status FROM collaborator_kpis WHERE id = ?', [id])

    if (Array.isArray(ckRows) && ckRows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada' })
    }

    if (ckRows[0].status !== 'closed') {
      return res.status(400).json({ error: 'La asignación no está cerrada' })
    }

    await pool.query('UPDATE collaborator_kpis SET status = ? WHERE id = ?', ['approved', id])

    res.json({ message: 'Asignación reabierta correctamente' })
  } catch (error: any) {
    console.error('Error reopening collaborator KPI:', error)
    res.status(500).json({ error: 'Error al reabrir asignación' })
  }
}

export const proposeCollaboratorKPI = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { actual, comments } = req.body

    const [ckRows] = await pool.query<any[]>(
      `SELECT ck.*, p.status as periodStatus
       FROM collaborator_kpis ck
       JOIN periods p ON ck.periodId = p.id
       WHERE ck.id = ?`,
      [id]
    )

    if (Array.isArray(ckRows) && ckRows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada' })
    }

    const assignment = ckRows[0]

    if (assignment.status === 'closed' || assignment.periodStatus === 'closed') {
      return res.status(403).json({
        error: 'No se puede proponer valores en asignaciones o períodos cerrados',
      })
    }

    const canEdit = await canEditAssignment((req as AuthRequest).user, assignment.collaboratorId)
    if (!canEdit) {
      return res.status(403).json({ error: 'No autorizado para editar asignaciones fuera de tu área' })
    }

    let updateData: any = {
      status: 'proposed',
      comments: comments || assignment.comments || null,
    }

    if (actual !== undefined) {
      const [kpiRows] = await pool.query<any[]>('SELECT type, formula FROM kpis WHERE id = ?', [assignment.kpiId])

      if (Array.isArray(kpiRows) && kpiRows.length > 0) {
        const kpiType = kpiRows[0].type
        const customFormula = kpiRows[0].formula || undefined

        const variation = calculateVariation(kpiType, assignment.target, actual)
        const weightedResult = calculateWeightedResult(variation, assignment.weight)

        updateData.actual = actual
        updateData.variation = variation
        updateData.weightedResult = weightedResult
      } else {
        updateData.actual = actual
      }
    }

    const updateFields = Object.keys(updateData)
      .map((key) => `${key} = ?`)
      .join(', ')
    const updateValues = Object.values(updateData)
    updateValues.push(id)

    await pool.query(`UPDATE collaborator_kpis SET ${updateFields} WHERE id = ?`, updateValues)

    res.json({ message: 'Valores propuestos correctamente' })
  } catch (error: any) {
    console.error('Error proposing collaborator KPI:', error)
    res.status(500).json({ error: 'Error al proponer valores' })
  }
}

export const approveCollaboratorKPI = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { comments } = req.body
    const userRole = (req as any).user?.role

    const allowedRoles = ['admin', 'director', 'manager', 'leader']
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: 'No tienes permisos para aprobar asignaciones',
      })
    }

    const [ckRows] = await pool.query<any[]>(
      `SELECT ck.*, p.status as periodStatus
       FROM collaborator_kpis ck
       JOIN periods p ON ck.periodId = p.id
       WHERE ck.id = ?`,
      [id]
    )

    if (Array.isArray(ckRows) && ckRows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada' })
    }

    const assignment = ckRows[0]

    if (assignment.status !== 'proposed') {
      return res.status(400).json({
        error: 'Solo se pueden aprobar asignaciones en estado "propuesto"',
      })
    }

    if (assignment.periodStatus === 'closed') {
      return res.status(403).json({
        error: 'No se puede aprobar asignaciones en períodos cerrados',
      })
    }

    const canEdit = await canEditAssignment((req as AuthRequest).user, assignment.collaboratorId)
    if (!canEdit) {
      return res.status(403).json({ error: 'No autorizado para editar asignaciones fuera de tu área' })
    }

    await pool.query(
      `UPDATE collaborator_kpis 
       SET status = ?, comments = ? 
       WHERE id = ?`,
      ['approved', comments || assignment.comments || null, id]
    )

    res.json({ message: 'Asignación aprobada correctamente' })
  } catch (error: any) {
    console.error('Error approving collaborator KPI:', error)
    res.status(500).json({ error: 'Error al aprobar asignación' })
  }
}

export const rejectCollaboratorKPI = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { comments } = req.body
    const userRole = (req as any).user?.role

    const allowedRoles = ['admin', 'director', 'manager', 'leader']
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: 'No tienes permisos para rechazar asignaciones',
      })
    }

    const [ckRows] = await pool.query<any[]>(
      `SELECT ck.*, p.status as periodStatus
       FROM collaborator_kpis ck
       JOIN periods p ON ck.periodId = p.id
       WHERE ck.id = ?`,
      [id]
    )

    if (Array.isArray(ckRows) && ckRows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada' })
    }

    const assignment = ckRows[0]

    if (assignment.status !== 'proposed') {
      return res.status(400).json({
        error: 'Solo se pueden rechazar asignaciones en estado "propuesto"',
      })
    }

    if (assignment.periodStatus === 'closed') {
      return res.status(403).json({
        error: 'No se puede rechazar asignaciones en períodos cerrados',
      })
    }

    const canEdit = await canEditAssignment((req as AuthRequest).user, assignment.collaboratorId)
    if (!canEdit) {
      return res.status(403).json({ error: 'No autorizado para editar asignaciones fuera de tu área' })
    }

    await pool.query(
      `UPDATE collaborator_kpis 
       SET status = ?, comments = ? 
       WHERE id = ?`,
      ['draft', comments || assignment.comments || null, id]
    )

    res.json({ message: 'Asignación rechazada correctamente' })
  } catch (error: any) {
    console.error('Error rejecting collaborator KPI:', error)
    res.status(500).json({ error: 'Error al rechazar asignación' })
  }
}

export const closePeriodAssignments = async (req: Request, res: Response) => {
  try {
    const { periodId, collaboratorId } = req.body

    if (!periodId) {
      return res.status(400).json({ error: 'El período es requerido' })
    }

    let query = 'UPDATE collaborator_kpis SET status = ? WHERE periodId = ?'
    const params: any[] = ['closed', periodId]

    if (collaboratorId) {
      query += ' AND collaboratorId = ?'
      params.push(collaboratorId)
    }

    query += ' AND status != ?'
    params.push('closed')

    const [result] = await pool.query(query, params)
    const updateResult = result as any

    res.json({
      message: 'Parrilla(s) cerrada(s) correctamente',
      affectedRows: updateResult.affectedRows,
    })
  } catch (error: any) {
    console.error('Error closing period assignments:', error)
    res.status(500).json({ error: 'Error al cerrar parrillas' })
  }
}

export const deleteCollaboratorKPI = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const [ckRows] = await pool.query<any[]>(
      `SELECT ck.status, p.status as periodStatus, ck.collaboratorId
       FROM collaborator_kpis ck
       JOIN periods p ON ck.periodId = p.id
       WHERE ck.id = ?`,
      [id]
    )

    if (Array.isArray(ckRows) && ckRows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada' })
    }

    const canEdit = await canEditAssignment((req as AuthRequest).user, ckRows[0].collaboratorId)
    if (!canEdit) {
      return res.status(403).json({ error: 'No autorizado para eliminar asignaciones fuera de tu área' })
    }

    const userRole = (req as any).user?.role

    if (ckRows[0].status === 'closed' || ckRows[0].periodStatus === 'closed') {
      if (!['admin', 'director'].includes(userRole)) {
        return res.status(403).json({
          error: 'No se puede eliminar una asignación cerrada. Solo administradores y directores pueden hacerlo.',
        })
      }
    }

    await pool.query('DELETE FROM collaborator_kpis WHERE id = ?', [id])

    res.json({ message: 'Asignación eliminada correctamente' })
  } catch (error: any) {
    console.error('Error deleting collaborator KPI:', error)
    res.status(500).json({ error: 'Error al eliminar asignación' })
  }
}

export const generateBaseGrids = async (req: Request, res: Response) => {
  try {
    const { area, periodId, kpiIds, defaultTarget, defaultWeight } = req.body

    if (!area || !periodId) {
      return res.status(400).json({
        error: 'El área y el período son requeridos',
      })
    }

    const [periodRows] = await pool.query<any[]>('SELECT status FROM periods WHERE id = ?', [periodId])

    if (Array.isArray(periodRows) && periodRows.length > 0 && periodRows[0].status === 'closed') {
      return res.status(403).json({
        error: 'No se pueden generar parrillas en períodos cerrados',
      })
    }

    const [collaborators] = await pool.query<any[]>('SELECT id FROM collaborators WHERE area = ?', [area])

    if (!Array.isArray(collaborators) || collaborators.length === 0) {
      return res.status(404).json({
        error: `No se encontraron colaboradores en el área "${area}"`,
      })
    }

    let kpis: any[] = []
    if (kpiIds && Array.isArray(kpiIds) && kpiIds.length > 0) {
      const placeholders = kpiIds.map(() => '?').join(',')
      const [kpiRows] = await pool.query<any[]>(`SELECT id FROM kpis WHERE id IN (${placeholders})`, kpiIds)
      kpis = kpiRows || []
    } else {
      const [kpiRows] = await pool.query<any[]>('SELECT id FROM kpis ORDER BY name ASC')
      kpis = kpiRows || []
    }

    if (kpis.length === 0) {
      return res.status(404).json({
        error: 'No se encontraron KPIs para asignar',
      })
    }

    const target = defaultTarget || 0
    const weight = defaultWeight || 0

    const weightPerKpi = weight > 0 ? weight : kpis.length > 0 ? 100 / kpis.length : 0

    const createdAssignments: any[] = []
    const errors: any[] = []

    for (const collaborator of collaborators) {
      for (const kpi of kpis) {
        try {
          const [existing] = await pool.query<any[]>(
            `SELECT id FROM collaborator_kpis 
             WHERE collaboratorId = ? AND kpiId = ? AND periodId = ?`,
            [collaborator.id, kpi.id, periodId]
          )

          if (Array.isArray(existing) && existing.length > 0) {
            continue
          }

          const [result] = await pool.query(
            `INSERT INTO collaborator_kpis 
             (collaboratorId, kpiId, periodId, target, weight, status) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [collaborator.id, kpi.id, periodId, target, weightPerKpi, 'draft']
          )

          const insertResult = result as any
          createdAssignments.push({
            id: insertResult.insertId,
            collaboratorId: collaborator.id,
            kpiId: kpi.id,
            periodId,
            target,
            weight: weightPerKpi,
          })
        } catch (error: any) {
          errors.push({
            collaboratorId: collaborator.id,
            kpiId: kpi.id,
            error: error.message,
          })
        }
      }
    }

    res.json({
      message: 'Parrillas base generadas correctamente',
      created: createdAssignments.length,
      errors: errors.length,
      details: {
        area,
        periodId,
        collaboratorsCount: collaborators.length,
        kpisCount: kpis.length,
        assignments: createdAssignments,
        errors: errors.length > 0 ? errors : undefined,
      },
    })
  } catch (error: any) {
    console.error('Error generating base grids:', error)
    res.status(500).json({ error: 'Error al generar parrillas base' })
  }
}

export const getConsolidatedByCollaborator = async (req: Request, res: Response) => {
  try {
    const { collaboratorId } = req.params
    const { periodId } = req.query

    if (!periodId) {
      return res.status(400).json({ error: 'El periodo es requerido' })
    }

    const [rows] = await pool.query<any[]>(
      `SELECT ck.*,
              k.type as kpiType,
              k.name as kpiName,
              k.description as kpiDescription,
              k.criteria as kpiCriteria,
              k.formula as kpiFormula,
              c.name as collaboratorName,
              p.name as periodName,
              p.startDate as periodStartDate,
              p.endDate as periodEndDate,
              sp.name as subPeriodName,
              sp.weight as subPeriodWeight
       FROM collaborator_kpis ck
       JOIN kpis k ON ck.kpiId = k.id
       JOIN collaborators c ON ck.collaboratorId = c.id
       JOIN periods p ON ck.periodId = p.id
       LEFT JOIN sub_periods sp ON ck.subPeriodId = sp.id
       WHERE ck.collaboratorId = ? AND ck.periodId = ?
       ORDER BY sp.startDate ASC, ck.createdAt DESC`,
      [collaboratorId, periodId]
    )

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({
        error: 'No hay asignaciones para el colaborador y periodo seleccionados',
      })
    }

    const assignments = rows.map((row) => {
      const customFormula = row.kpiFormula || undefined

      const variation =
        row.variation ??
        (row.actual !== null && row.actual !== undefined
          ? calculateVariation(row.kpiType, row.target, row.actual, customFormula)
          : 0)

      const weightedResult = row.weightedResult ?? calculateWeightedResult(variation, row.weight || 0)

      return { ...row, variation, weightedResult }
    })

    type SubPeriodSummary = {
      id: number | null
      name: string
      weight: number | null
      totalWeight: number
      totalWeightedResult: number
      kpiCount: number
      result: number
      kpis: any[]
    }

    const subPeriodMap = new Map<string, SubPeriodSummary>()

    assignments.forEach((assignment) => {
      const key = String(assignment.subPeriodId ?? 'no-subperiod')
      const existing = subPeriodMap.get(key)

      const summary: SubPeriodSummary =
        existing ??
        ({
          id: assignment.subPeriodId || null,
          name: assignment.subPeriodName || 'Sin subperiodo',
          weight: assignment.subPeriodWeight ?? null,
          totalWeight: 0,
          totalWeightedResult: 0,
          kpiCount: 0,
          result: 0,
          kpis: [],
        } as SubPeriodSummary)

      summary.totalWeight += assignment.weight || 0
      summary.totalWeightedResult += assignment.weightedResult || 0
      summary.kpiCount += 1
      summary.kpis.push(assignment)

      subPeriodMap.set(key, summary)
    })

    const subPeriods = Array.from(subPeriodMap.values()).map((sp) => ({
      ...sp,
      result: sp.totalWeight > 0 ? (sp.totalWeightedResult / sp.totalWeight) * 100 : 0,
    }))

    const totalWeightAll = assignments.reduce((sum, a) => sum + (a.weight || 0), 0)
    const totalWeightedResultAll = assignments.reduce((sum, a) => sum + (a.weightedResult || 0), 0)
    const resultByKpiWeight = totalWeightAll > 0 ? (totalWeightedResultAll / totalWeightAll) * 100 : 0

    const baseWeights = subPeriods.map((sp) => sp.weight ?? sp.totalWeight ?? 0)
    const totalBaseWeight = baseWeights.reduce((sum, val) => sum + val, 0)

    const resultBySubPeriodWeight =
      subPeriods.length === 0
        ? 0
        : totalBaseWeight > 0
        ? subPeriods.reduce((acc, sp, idx) => acc + sp.result * (baseWeights[idx] / totalBaseWeight), 0)
        : subPeriods.reduce((acc, sp) => acc + sp.result, 0) / subPeriods.length

    res.json({
      collaborator: {
        id: assignments[0].collaboratorId,
        name: assignments[0].collaboratorName,
      },
      period: {
        id: assignments[0].periodId,
        name: assignments[0].periodName,
        startDate: assignments[0].periodStartDate,
        endDate: assignments[0].periodEndDate,
      },
      overall: {
        totalWeight: totalWeightAll,
        totalWeightedResult: totalWeightedResultAll,
        resultByKpiWeight,
        resultBySubPeriodWeight,
      },
      subPeriods,
    })
  } catch (error: any) {
    console.error('Error fetching consolidated data:', error)
    res.status(500).json({ error: 'Error al obtener consolidado' })
  }
}
