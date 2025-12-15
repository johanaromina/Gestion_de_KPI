import { Request, Response } from 'express'
import { pool } from '../config/database'
import { CollaboratorKPI, KPIType } from '../types'
import { calculateVariation, calculateWeightedResult } from '../utils/kpi-formulas'
import { AuthRequest } from '../middleware/auth.middleware'

const canEditAssignment = async (user: AuthRequest['user'], collaboratorId: number) => {
  // Solo usuarios con permisos de configuración (o superpoderes) pueden modificar datos
  if (!user) return false
  if (user.hasSuperpowers || user.permissions?.includes('config.manage')) return true
  return false
}

const canManageConfig = (user: AuthRequest['user']) =>
  !!user && (user.hasSuperpowers || user.permissions?.includes('config.manage'))

const recalcSummaryAssignment = async (collaboratorId: number, kpiId: number, periodId: number) => {
  const [[kpiRow]] = await pool.query<any[]>(`SELECT type FROM kpis WHERE id = ?`, [kpiId])
  if (!kpiRow) return

  const kpiType: KPIType = kpiRow.type

  const [subRows] = await pool.query<any[]>(
    `SELECT ck.*, sp.endDate
     FROM collaborator_kpis ck
     LEFT JOIN sub_periods sp ON ck.subPeriodId = sp.id
     WHERE ck.collaboratorId = ? AND ck.kpiId = ? AND ck.periodId = ? AND ck.subPeriodId IS NOT NULL`,
    [collaboratorId, kpiId, periodId]
  )

  if (!Array.isArray(subRows) || subRows.length === 0) return

  let targetTotal = 0
  let weightTotal = 0
  let weightedTotal = 0

  for (const row of subRows) {
    const t = Number(row.target ?? 0)
    const w = Number(row.weight ?? 0)
    targetTotal += t
    weightTotal += w
    const vr = row.variation !== null && row.variation !== undefined ? Number(row.variation) : null
    const wr =
      row.weightedResult !== null && row.weightedResult !== undefined
        ? Number(row.weightedResult)
        : vr !== null
        ? calculateWeightedResult(vr, w)
        : null
    if (wr !== null && Number.isFinite(wr)) {
      weightedTotal += wr
    }
  }

  let summaryTarget = targetTotal
  let summaryWeight = weightTotal
  let summaryActual: number | null = null
  let summaryVariation: number | null = null
  let summaryWeightedResult: number | null = null

  if (kpiType === 'exact') {
    const sorted = subRows
      .slice()
      .sort((a, b) => {
        const ea = a.endDate ? new Date(a.endDate).getTime() : 0
        const eb = b.endDate ? new Date(b.endDate).getTime() : 0
        if (ea === eb) return (a.id || 0) - (b.id || 0)
        return ea - eb
      })
    const latest = sorted[sorted.length - 1]
    summaryTarget = Number(latest.target ?? 0)
    summaryWeight = Number(latest.weight ?? 0)
    summaryActual =
      latest.actual !== null && latest.actual !== undefined ? Number(latest.actual) : null
    summaryVariation =
      latest.variation !== null && latest.variation !== undefined ? Number(latest.variation) : null
    summaryWeightedResult =
      latest.weightedResult !== null && latest.weightedResult !== undefined
        ? Number(latest.weightedResult)
        : null
  } else {
    if (weightTotal > 0) {
      summaryWeightedResult = weightedTotal
      summaryVariation = (weightedTotal / weightTotal) * 100
    }
  }

  const [existingParent] = await pool.query<any[]>(
    `SELECT id FROM collaborator_kpis 
     WHERE collaboratorId = ? AND kpiId = ? AND periodId = ? AND subPeriodId IS NULL
     ORDER BY id ASC`,
    [collaboratorId, kpiId, periodId]
  )

  if (Array.isArray(existingParent) && existingParent.length > 0) {
    const parentId = existingParent[0].id
    const duplicateIds = existingParent.slice(1).map((r) => r.id)
    if (duplicateIds.length > 0) {
      await pool.query(`DELETE FROM collaborator_kpis WHERE id IN (${duplicateIds.map(() => '?').join(',')})`, duplicateIds)
    }
    await pool.query(
      `UPDATE collaborator_kpis 
         SET target = ?, weight = ?, actual = ?, variation = ?, weightedResult = ?
       WHERE id = ?`,
      [summaryTarget, summaryWeight, summaryActual, summaryVariation, summaryWeightedResult, parentId]
    )
  } else {
    await pool.query(
      `INSERT INTO collaborator_kpis
         (collaboratorId, kpiId, periodId, subPeriodId, target, weight, actual, variation, weightedResult, status)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
      [
        collaboratorId,
        kpiId,
        periodId,
        summaryTarget,
        summaryWeight,
        summaryActual,
        summaryVariation,
        summaryWeightedResult,
        'draft',
      ]
    )
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
              p.status as periodStatus,
              sp.name as subPeriodName
       FROM collaborator_kpis ck
       JOIN kpis k ON ck.kpiId = k.id
       JOIN collaborators c ON ck.collaboratorId = c.id
       JOIN periods p ON ck.periodId = p.id
       LEFT JOIN sub_periods sp ON ck.subPeriodId = sp.id
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
       LEFT JOIN sub_periods sp ON ck.subPeriodId = sp.id
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
                        p.status as periodStatus,
                        sp.name as subPeriodName
                 FROM collaborator_kpis ck
                 JOIN kpis k ON ck.kpiId = k.id
                 JOIN periods p ON ck.periodId = p.id
                 LEFT JOIN sub_periods sp ON ck.subPeriodId = sp.id
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
              c.name as collaboratorName,
              sp.name as subPeriodName
       FROM collaborator_kpis ck
       JOIN kpis k ON ck.kpiId = k.id
       JOIN collaborators c ON ck.collaboratorId = c.id
       LEFT JOIN sub_periods sp ON ck.subPeriodId = sp.id
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

    // Validación de ponderación: solo aplica a filas resumen (subPeriodId NULL)
    if (!subPeriodId) {
      const [existingWeights] = await pool.query<any[]>(
        `SELECT SUM(weight) as totalWeight 
         FROM collaborator_kpis 
         WHERE collaboratorId = ? AND periodId = ? AND subPeriodId IS NULL`,
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
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        error:
          'Ya existe una asignación para este colaborador, KPI, período y subperíodo. Edítala en lugar de crearla nuevamente.',
      })
    }
    console.error('Error creating collaborator KPI:', error)
    res.status(500).json({ error: 'Error al crear asignación' })
  }
}

export const updateCollaboratorKPI = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { target, actual, weight, status, comments, subPeriodId } = req.body
    let collaboratorId: number | null = null
    let kpiId: number | null = null
    let periodId: number | null = null

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

    const { assignmentStatus, periodStatus, collaboratorId: collabId } = ckRows[0]
    collaboratorId = collabId

    const [kpiInfo] = await pool.query<any[]>(
      `SELECT kpiId, periodId FROM collaborator_kpis WHERE id = ?`,
      [id]
    )
    if (Array.isArray(kpiInfo) && kpiInfo.length > 0) {
      kpiId = kpiInfo[0].kpiId
      periodId = kpiInfo[0].periodId
    }

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
      // Valida ponderación solo si esta fila es resumen (sin subperiodo)
      const [selfRow] = await pool.query<any[]>(
        `SELECT subPeriodId FROM collaborator_kpis WHERE id = ?`,
        [id]
      )
      const isSummary = Array.isArray(selfRow) && selfRow[0]?.subPeriodId === null

      if (isSummary) {
        const [existingWeights] = await pool.query<any[]>(
          `SELECT SUM(weight) as totalWeight 
           FROM collaborator_kpis 
           WHERE collaboratorId = (SELECT collaboratorId FROM collaborator_kpis WHERE id = ?)
           AND periodId = (SELECT periodId FROM collaborator_kpis WHERE id = ?)
           AND subPeriodId IS NULL
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
    }

    // Evitar duplicados al cambiar subperiodo
    if (subPeriodId !== undefined) {
      const [dupRows] = await pool.query<any[]>(
        `SELECT id FROM collaborator_kpis
         WHERE collaboratorId = ? AND kpiId = ? AND periodId = ? AND (subPeriodId <=> ?)
         AND id != ?`,
        [collaboratorId, kpiId, periodId, subPeriodId || null, id]
      )
      if (Array.isArray(dupRows) && dupRows.length > 0) {
        return res.status(400).json({
          error: 'Ya existe una asignación para este KPI y subperiodo. Edita la existente en lugar de moverla.',
        })
      }
    }

    let updateQuery = `UPDATE collaborator_kpis 
                       SET target = ?, weight = ?, status = ?, comments = ?, subPeriodId = ?`
    const params: any[] = [target, weight, status, comments, subPeriodId || null]

    if (actual !== undefined) {
      const [ckDataRows] = await pool.query<any[]>(
        `SELECT ck.target, ck.weight, k.type 
         FROM collaborator_kpis ck
         JOIN kpis k ON ck.kpiId = k.id
         WHERE ck.id = ?`,
        [id]
      )

      if (Array.isArray(ckDataRows) && ckDataRows.length > 0) {
        const kpiType = ckDataRows[0].type
        const currentTarget = Number(target ?? ckDataRows[0].target ?? 0)
        const currentWeight = Number(weight ?? ckDataRows[0].weight ?? 0)

        if (!currentTarget || currentTarget <= 0) {
          return res.status(400).json({
            error:
              'No se puede actualizar el valor actual porque el target es 0 o no está definido. Ajusta el target antes de registrar el alcance.',
          })
        }

        const variation = calculateVariation(kpiType, currentTarget, actual)
        const weightedResult = calculateWeightedResult(variation, currentWeight)

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

    if (actual !== undefined && collaboratorId && kpiId && periodId) {
      await recalcSummaryAssignment(collaboratorId, kpiId, periodId)
    }

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
      `SELECT ck.status, p.status as periodStatus, ck.collaboratorId, ck.periodId, ck.kpiId
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

    const kpiId = ckRows[0].kpiId
    const periodId = ckRows[0].periodId

    const [ckDataRows] = await pool.query<any[]>(
      `SELECT ck.target, ck.weight, k.type 
       FROM collaborator_kpis ck
       JOIN kpis k ON ck.kpiId = k.id
       WHERE ck.id = ?`,
      [id]
    )

    const { target, weight, type } = ckDataRows[0]
    const currentTarget = Number(target ?? 0)
    const currentWeight = Number(weight ?? 0)

    if (!currentTarget || currentTarget <= 0) {
      return res.status(400).json({
        error:
          'No se puede actualizar el valor actual porque el target es 0 o no está definido. Ajusta el target antes de registrar el alcance.',
      })
    }

    const variation = calculateVariation(type, currentTarget, actual)
    const weightedResult = calculateWeightedResult(variation, currentWeight)

    await pool.query(
      `UPDATE collaborator_kpis 
       SET actual = ?, variation = ?, weightedResult = ? 
       WHERE id = ?`,
      [actual, variation, weightedResult, id]
    )

    await recalcSummaryAssignment(ckRows[0].collaboratorId, kpiId, periodId)

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

        const targetValue = Number(assignment.target ?? 0)
        const weightValue = Number(assignment.weight ?? 0)

        if (!targetValue || targetValue <= 0) {
          return res.status(400).json({
            error:
              'No se puede actualizar el valor actual porque el target es 0 o no está definido. Ajusta el target antes de registrar el alcance.',
          })
        }

        const variation = calculateVariation(kpiType, targetValue, actual, customFormula)
        const weightedResult = calculateWeightedResult(variation, weightValue)

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
    const { area, periodId, kpiIds, defaultTarget, defaultWeight, kpiOverrides } = req.body

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

    const overridesMap = new Map<
      number,
      {
        target?: number
        weight?: number
      }
    >()

    if (Array.isArray(kpiOverrides)) {
      for (const ov of kpiOverrides) {
        if (!ov || typeof ov.kpiId !== 'number') continue
        overridesMap.set(ov.kpiId, {
          target: ov.target !== undefined && ov.target !== null ? Number(ov.target) : undefined,
          weight: ov.weight !== undefined && ov.weight !== null ? Number(ov.weight) : undefined,
        })
      }
    }

    const target = defaultTarget || 0
    const weight = defaultWeight || 0

    const weightPerKpi = weight > 0 ? weight : kpis.length > 0 ? 100 / kpis.length : 0

    // Traer plan mensual si existe para los colaboradores/KPIs del período
    const collaboratorIds = collaborators.map((c: any) => c.id)
    let planMap = new Map<string, any[]>()

    if (collaboratorIds.length > 0) {
      const collaboratorPlaceholders = collaboratorIds.map(() => '?').join(',')
      const params: any[] = [periodId, ...collaboratorIds]

      let planQuery = `SELECT collaboratorId, kpiId, subPeriodId, target, weight 
                       FROM collaborator_kpi_plan 
                       WHERE periodId = ? 
                       AND collaboratorId IN (${collaboratorPlaceholders})`

      if (kpiIds && Array.isArray(kpiIds) && kpiIds.length > 0) {
        const kpiPlaceholders = kpiIds.map(() => '?').join(',')
        planQuery += ` AND kpiId IN (${kpiPlaceholders})`
        params.push(...kpiIds)
      }

      const [planRows] = await pool.query<any[]>(planQuery, params)

      if (Array.isArray(planRows)) {
        planMap = planRows.reduce((map, row) => {
          const key = `${row.collaboratorId}-${row.kpiId}`
          const existing = map.get(key) || []
          existing.push(row)
          map.set(key, existing)
          return map
        }, new Map<string, any[]>())
      }
    }

    const createdAssignments: any[] = []
    const errors: any[] = []

    for (const collaborator of collaborators) {
      for (const kpi of kpis) {
        try {
          const planKey = `${collaborator.id}-${kpi.id}`
          const planRows = planMap.get(planKey) || []

          if (planRows.length > 0) {
            // El peso en el plan es el peso total del KPI para todo el período
            // Lo distribuimos entre los subperíodos para no inflar el total (>100%)
            const baseWeight = Number(planRows[0].weight ?? 0)
            // Si hay múltiples subperíodos, dividimos el peso entre ellos
            // Si solo hay uno, usamos el peso completo
            const distributedWeight =
              baseWeight > 0 && planRows.length > 1 ? baseWeight / planRows.length : baseWeight || weightPerKpi

            for (const plan of planRows) {
              const planTarget = Number(plan.target ?? 0)
              // Usar el peso distribuido para cada subperíodo
              const planWeight = Number.isFinite(distributedWeight) ? distributedWeight : weightPerKpi
              const subPeriodId = plan.subPeriodId || null

              if (!planTarget || planTarget < 0) {
                errors.push({
                  collaboratorId: collaborator.id,
                  kpiId: kpi.id,
                  subPeriodId,
                  error: 'Target inválido en plan',
                })
                continue
              }

              const [existing] = await pool.query<any[]>(
                `SELECT id FROM collaborator_kpis 
                 WHERE collaboratorId = ? AND kpiId = ? AND periodId = ? AND (subPeriodId <=> ?)`,
                [collaborator.id, kpi.id, periodId, subPeriodId]
              )

              if (Array.isArray(existing) && existing.length > 0) {
                continue
              }

              const [result] = await pool.query(
                `INSERT INTO collaborator_kpis 
                 (collaboratorId, kpiId, periodId, subPeriodId, target, weight, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [collaborator.id, kpi.id, periodId, subPeriodId, planTarget, planWeight, 'draft']
              )

              const insertResult = result as any
              createdAssignments.push({
                id: insertResult.insertId,
                collaboratorId: collaborator.id,
                kpiId: kpi.id,
                periodId,
                subPeriodId,
                target: planTarget,
                weight: planWeight,
              })
            }

            continue
          }

          // Sin plan: crear asignación única con defaults
          const [existing] = await pool.query<any[]>(
            `SELECT id FROM collaborator_kpis 
             WHERE collaboratorId = ? AND kpiId = ? AND periodId = ? AND subPeriodId IS NULL`,
            [collaborator.id, kpi.id, periodId]
          )

          if (Array.isArray(existing) && existing.length > 0) {
            continue
          }

          const override = overridesMap.get(kpi.id)
          const targetValue = override?.target !== undefined ? override.target : target
          const weightValue =
            override?.weight !== undefined
              ? override.weight
              : weight > 0
              ? weight
              : weightPerKpi

          const [result] = await pool.query(
            `INSERT INTO collaborator_kpis 
             (collaboratorId, kpiId, periodId, target, weight, status) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [collaborator.id, kpi.id, periodId, targetValue, weightValue, 'draft']
          )

          const insertResult = result as any
          createdAssignments.push({
            id: insertResult.insertId,
            collaboratorId: collaborator.id,
            kpiId: kpi.id,
            periodId,
            target: targetValue,
            weight: weightValue,
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

// --- PLAN MENSUAL POR KPI / SUBPERIODO ---

export const getMonthlyPlan = async (req: Request, res: Response) => {
  try {
    const { collaboratorId, kpiId, periodId } = req.params

    if (!collaboratorId || !kpiId || !periodId) {
      return res.status(400).json({ error: 'collaboratorId, kpiId y periodId son requeridos' })
    }

    const [rows] = await pool.query<any[]>(
      `SELECT id, collaboratorId, kpiId, periodId, subPeriodId, target, weight
       FROM collaborator_kpi_plan
       WHERE collaboratorId = ? AND kpiId = ? AND periodId = ?
       ORDER BY subPeriodId ASC`,
      [collaboratorId, kpiId, periodId]
    )

    res.json(rows)
  } catch (error: any) {
    console.error('Error fetching monthly plan:', error)
    res.status(500).json({ error: 'Error al obtener el plan mensual' })
  }
}

export const upsertMonthlyPlan = async (req: Request, res: Response) => {
  try {
    const { collaboratorId, kpiId, periodId } = req.params
    const { items } = req.body

    if (!collaboratorId || !kpiId || !periodId) {
      return res.status(400).json({ error: 'collaboratorId, kpiId y periodId son requeridos' })
    }

    const user = (req as AuthRequest).user
    if (!canManageConfig(user)) {
      return res.status(403).json({ error: 'No autorizado: se requieren permisos de configuración' })
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Debe enviar al menos un item con subPeriodId, target y weight' })
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      for (const item of items) {
        if (!item || typeof item.subPeriodId !== 'number') continue

        const target = Number(item.target ?? 0)
        const weight = Number(item.weight ?? 0)

        if (target < 0) {
          await conn.rollback()
          return res.status(400).json({ error: 'Target no puede ser negativo' })
        }

        if (weight < 0 || weight > 100) {
          await conn.rollback()
          return res.status(400).json({ error: 'La ponderación debe estar entre 0 y 100' })
        }

        await conn.query(
          `INSERT INTO collaborator_kpi_plan (collaboratorId, kpiId, periodId, subPeriodId, target, weight)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE target = VALUES(target), weight = VALUES(weight)`,
          [collaboratorId, kpiId, periodId, item.subPeriodId, target, weight]
        )

        // Si existe una asignación para ese subperiodo, actualizamos target/weight allí también
        const [existingAssignments] = await conn.query<any[]>(
          `SELECT id FROM collaborator_kpis 
           WHERE collaboratorId = ? AND kpiId = ? AND periodId = ? AND (subPeriodId <=> ?)`,
          [collaboratorId, kpiId, periodId, item.subPeriodId]
        )

        if (Array.isArray(existingAssignments) && existingAssignments.length > 0) {
          await conn.query(
            `UPDATE collaborator_kpis 
               SET target = ?, weight = ?
             WHERE id = ?`,
            [target, weight, existingAssignments[0].id]
          )
        } else {
          await conn.query(
            `INSERT INTO collaborator_kpis 
               (collaboratorId, kpiId, periodId, subPeriodId, target, weight, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [collaboratorId, kpiId, periodId, item.subPeriodId, target, weight, 'draft']
          )
        }
      }

      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }

    await recalcSummaryAssignment(Number(collaboratorId), Number(kpiId), Number(periodId))

    res.json({ message: 'Plan mensual actualizado' })
  } catch (error: any) {
    console.error('Error upserting monthly plan:', error)
    res.status(500).json({ error: 'Error al actualizar plan mensual' })
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
