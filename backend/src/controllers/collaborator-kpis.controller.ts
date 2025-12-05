import { Request, Response } from 'express'
import { pool } from '../config/database'
import { CollaboratorKPI, KPIType } from '../types'

// Función para calcular variación según tipo de KPI
function calculateVariation(
  type: KPIType,
  target: number,
  actual: number
): number {
  if (!actual || actual === 0) return 0

  switch (type) {
    case 'growth':
      // Crecimiento: (Actual / Target) * 100
      return (actual / target) * 100
    case 'reduction':
      // Reducción: (Target / Actual) * 100
      return (target / actual) * 100
    case 'exact':
      // Exacto: 100 si es igual, penalización por diferencia
      const diff = Math.abs(actual - target)
      return Math.max(0, 100 - (diff / target) * 100)
    default:
      return 0
  }
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

export const getCollaboratorKPIsByCollaborator = async (
  req: Request,
  res: Response
) => {
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

export const getCollaboratorKPIsByPeriod = async (
  req: Request,
  res: Response
) => {
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
    const {
      collaboratorId,
      kpiId,
      periodId,
      subPeriodId,
      target,
      weight,
      status,
    } = req.body

    if (!collaboratorId || !kpiId || !periodId || !target || !weight) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    // Verificar si el período está cerrado
    const [periodRows] = await pool.query<any[]>(
      'SELECT status FROM periods WHERE id = ?',
      [periodId]
    )

    if (
      Array.isArray(periodRows) &&
      periodRows.length > 0 &&
      periodRows[0].status === 'closed'
    ) {
      return res.status(403).json({
        error: 'No se pueden crear asignaciones en períodos cerrados',
      })
    }

    // Obtener tipo de KPI para cálculos
    const [kpiRows] = await pool.query<any[]>(
      'SELECT type FROM kpis WHERE id = ?',
      [kpiId]
    )

    if (Array.isArray(kpiRows) && kpiRows.length === 0) {
      return res.status(404).json({ error: 'KPI no encontrado' })
    }

    const kpiType = kpiRows[0].type

    const [result] = await pool.query(
      `INSERT INTO collaborator_kpis 
       (collaboratorId, kpiId, periodId, subPeriodId, target, weight, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        collaboratorId,
        kpiId,
        periodId,
        subPeriodId || null,
        target,
        weight,
        status || 'draft',
      ]
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
    const {
      target,
      actual,
      weight,
      status,
      comments,
      subPeriodId,
    } = req.body

    // Verificar si la asignación está cerrada o el período está cerrado
    const [ckRows] = await pool.query<any[]>(
      `SELECT ck.status as assignmentStatus, p.status as periodStatus
       FROM collaborator_kpis ck
       JOIN periods p ON ck.periodId = p.id
       WHERE ck.id = ?`,
      [id]
    )

    if (Array.isArray(ckRows) && ckRows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada' })
    }

    const { assignmentStatus, periodStatus } = ckRows[0]

    // Bloquear edición si está cerrada o el período está cerrado
    if (assignmentStatus === 'closed' || periodStatus === 'closed') {
      // Solo permitir cambiar a 'closed' si no está cerrada, o reabrir si tiene permisos
      const userRole = (req as any).user?.role
      const canReopen = ['admin', 'director'].includes(userRole)

      if (status !== 'closed' && !canReopen) {
        return res.status(403).json({
          error:
            'No se puede editar una asignación cerrada. Solo administradores y directores pueden reabrir.',
        })
      }

      // Si está cerrada y no es admin/director, bloquear cualquier cambio excepto cerrar
      if (assignmentStatus === 'closed' && !canReopen) {
        return res.status(403).json({
          error:
            'Esta asignación está cerrada y no puede ser editada. Solo administradores y directores pueden reabrir.',
        })
      }
    }

    // Si se actualiza actual, recalcular variación y alcance ponderado
    let updateQuery = `UPDATE collaborator_kpis 
                       SET target = ?, weight = ?, status = ?, comments = ?, subPeriodId = ?`
    const params: any[] = [target, weight, status, comments, subPeriodId || null]

    if (actual !== undefined) {
      // Obtener tipo de KPI y target actual
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
        const weightedResult = (variation * weight) / 100

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

    // Verificar si está cerrada
    const [ckRows] = await pool.query<any[]>(
      `SELECT ck.status, p.status as periodStatus
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

    // Obtener datos necesarios para cálculo
    const [ckDataRows] = await pool.query<any[]>(
      `SELECT ck.target, ck.weight, k.type 
       FROM collaborator_kpis ck
       JOIN kpis k ON ck.kpiId = k.id
       WHERE ck.id = ?`,
      [id]
    )

    const { target, weight, type } = ckDataRows[0]
    const variation = calculateVariation(type, target, actual)
    const weightedResult = (variation * weight) / 100

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

    // Verificar si ya está cerrada
    const [ckRows] = await pool.query<any[]>(
      'SELECT status FROM collaborator_kpis WHERE id = ?',
      [id]
    )

    if (Array.isArray(ckRows) && ckRows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada' })
    }

    if (ckRows[0].status === 'closed') {
      return res.status(400).json({ error: 'La asignación ya está cerrada' })
    }

    await pool.query(
      'UPDATE collaborator_kpis SET status = ? WHERE id = ?',
      ['closed', id]
    )

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

    // Verificar permisos (solo admin y director)
    if (!['admin', 'director'].includes(userRole)) {
      return res.status(403).json({
        error: 'Solo administradores y directores pueden reabrir asignaciones cerradas',
      })
    }

    // Verificar si está cerrada
    const [ckRows] = await pool.query<any[]>(
      'SELECT status FROM collaborator_kpis WHERE id = ?',
      [id]
    )

    if (Array.isArray(ckRows) && ckRows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada' })
    }

    if (ckRows[0].status !== 'closed') {
      return res.status(400).json({ error: 'La asignación no está cerrada' })
    }

    await pool.query(
      'UPDATE collaborator_kpis SET status = ? WHERE id = ?',
      ['approved', id]
    )

    res.json({ message: 'Asignación reabierta correctamente' })
  } catch (error: any) {
    console.error('Error reopening collaborator KPI:', error)
    res.status(500).json({ error: 'Error al reabrir asignación' })
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

    // Solo cerrar asignaciones que no estén ya cerradas
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

    // Verificar si está cerrada
    const [ckRows] = await pool.query<any[]>(
      `SELECT ck.status, p.status as periodStatus
       FROM collaborator_kpis ck
       JOIN periods p ON ck.periodId = p.id
       WHERE ck.id = ?`,
      [id]
    )

    if (Array.isArray(ckRows) && ckRows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada' })
    }

    const userRole = (req as any).user?.role
    const canDelete =
      ckRows[0].status !== 'closed' &&
      ckRows[0].periodStatus !== 'closed' &&
      ['admin', 'director'].includes(userRole)

    if (ckRows[0].status === 'closed' || ckRows[0].periodStatus === 'closed') {
      if (!['admin', 'director'].includes(userRole)) {
        return res.status(403).json({
          error:
            'No se puede eliminar una asignación cerrada. Solo administradores y directores pueden hacerlo.',
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
