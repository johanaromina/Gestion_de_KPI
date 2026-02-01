import { Request, Response } from 'express'
import { pool } from '../config/database'
import { calculateVariation, calculateWeightedResult } from '../utils/kpi-formulas'
import { recalcSummaryAssignment } from './collaborator-kpis.controller'
import { AuthRequest } from '../middleware/auth.middleware'

export const applyMeasurementToAssignment = async (
  assignmentId: number,
  value: number,
  mode: 'manual' | 'import' | 'auto',
  measurementId: number,
  criteriaVersionId?: number | null
) => {
  const [assignmentRows] = await pool.query<any[]>(
    `SELECT ck.target, ck.weight, ck.kpiId, ck.periodId, ck.collaboratorId
     FROM collaborator_kpis ck
     WHERE ck.id = ?`,
    [assignmentId]
  )
  if (!Array.isArray(assignmentRows) || assignmentRows.length === 0) {
    return
  }

  const assignment = assignmentRows[0]
  const [kpiRows] = await pool.query<any[]>(
    `SELECT type, direction, formula FROM kpis WHERE id = ?`,
    [assignment.kpiId]
  )

  const kpiDirection = kpiRows?.[0]?.direction || kpiRows?.[0]?.type || 'growth'
  const customFormula = kpiRows?.[0]?.formula || undefined

  const targetValue = Number(assignment.target ?? 0)
  const weightValue = Number(assignment.weight ?? 0)
  if (!targetValue || targetValue <= 0) {
    return
  }

  const variation = calculateVariation(kpiDirection, targetValue, value, customFormula)
  const weightedResult = calculateWeightedResult(variation, weightValue)

  await pool.query(
    `UPDATE collaborator_kpis
     SET actual = ?, variation = ?, weightedResult = ?, inputMode = ?, lastMeasurementId = ?, activeCriteriaVersionId = COALESCE(activeCriteriaVersionId, ?)
     WHERE id = ?`,
    [value, variation, weightedResult, mode, measurementId, criteriaVersionId || null, assignmentId]
  )

  await recalcSummaryAssignment(assignment.collaboratorId, assignment.kpiId, assignment.periodId)
}

export const getMeasurements = async (req: Request, res: Response) => {
  try {
    const { assignmentId, periodId, subPeriodId, status } = req.query

    let query = `SELECT m.*, c.name as capturedByName
                 FROM kpi_measurements m
                 LEFT JOIN collaborators c ON m.capturedBy = c.id
                 WHERE 1=1`
    const params: any[] = []

    if (assignmentId) {
      query += ' AND m.assignmentId = ?'
      params.push(assignmentId)
    }
    if (periodId) {
      query += ' AND m.periodId = ?'
      params.push(periodId)
    }
    if (subPeriodId) {
      query += ' AND m.subPeriodId = ?'
      params.push(subPeriodId)
    }
    if (status) {
      query += ' AND m.status = ?'
      params.push(status)
    }

    query += ' ORDER BY m.capturedAt DESC'

    const [rows] = await pool.query(query, params)
    res.json(rows)
  } catch (error: any) {
    console.error('Error fetching measurements:', error)
    res.status(500).json({ error: 'Error al obtener mediciones' })
  }
}

export const createMeasurement = async (req: Request, res: Response) => {
  try {
    const {
      assignmentId,
      periodId,
      subPeriodId,
      value,
      mode,
      status,
      criteriaVersionId,
      reason,
      evidenceUrl,
      sourceRunId,
    } = req.body

    if (!assignmentId || value === undefined) {
      return res.status(400).json({ error: 'assignmentId y value son requeridos' })
    }

    const userId = (req as AuthRequest).user?.id || null

    let warning: string | null = null
    if ((status || 'draft') === 'approved') {
      const [assignmentRows] = await pool.query<any[]>(
        `SELECT curationStatus FROM collaborator_kpis WHERE id = ?`,
        [assignmentId]
      )
      if (Array.isArray(assignmentRows) && assignmentRows.length > 0) {
        const curationStatus = assignmentRows[0].curationStatus || 'pending'
        if (curationStatus === 'in_review') {
          warning = 'Curaduría en revisión: medición aprobada con warning'
        } else if (curationStatus !== 'approved') {
          return res.status(400).json({
            error: 'No se puede aprobar una medición si la curaduría no está aprobada',
          })
        }
      }
    }

    if (subPeriodId) {
      const [subRows] = await pool.query<any[]>(
        `SELECT status FROM calendar_subperiods WHERE id = ?`,
        [subPeriodId]
      )
      if (Array.isArray(subRows) && subRows.length > 0) {
        const isClosed = subRows[0].status === 'closed'
        const user = (req as AuthRequest).user
        const canOverride =
          user?.hasSuperpowers ||
          user?.permissions?.includes('curation_review') ||
          user?.permissions?.includes('config.manage')
        if (isClosed && !canOverride) {
          return res.status(400).json({
            error: 'El subperíodo está cerrado. Solo Admin/Curator pueden overridear.',
          })
        }
      }
    }

    const [result] = await pool.query(
      `INSERT INTO kpi_measurements
       (assignmentId, periodId, subPeriodId, value, mode, status, capturedBy, criteriaVersionId, reason, evidenceUrl, sourceRunId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        assignmentId,
        periodId || null,
        subPeriodId || null,
        value,
        mode || 'manual',
        status || 'draft',
        userId,
        criteriaVersionId || null,
        reason || null,
        evidenceUrl || null,
        sourceRunId || null,
      ]
    )

    const insertResult = result as any
    const measurementId = insertResult.insertId

    if ((status || 'draft') === 'approved') {
      await applyMeasurementToAssignment(assignmentId, Number(value), mode || 'manual', measurementId, criteriaVersionId)
    }

    res.status(201).json({ id: measurementId, warning })
  } catch (error: any) {
    console.error('Error creating measurement:', error)
    res.status(500).json({ error: 'Error al crear medición' })
  }
}

export const approveMeasurement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const [rows] = await pool.query<any[]>(
      `SELECT * FROM kpi_measurements WHERE id = ?`,
      [id]
    )
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'Medición no encontrada' })
    }

    const measurement = rows[0]

    const [assignmentRows] = await pool.query<any[]>(
      `SELECT curationStatus FROM collaborator_kpis WHERE id = ?`,
      [measurement.assignmentId]
    )
    let warning: string | null = null
    if (Array.isArray(assignmentRows) && assignmentRows.length > 0) {
      const curationStatus = assignmentRows[0].curationStatus || 'pending'
      if (curationStatus === 'in_review') {
        warning = 'Curaduría en revisión: medición aprobada con warning'
      } else if (curationStatus !== 'approved') {
        return res.status(400).json({
          error: 'No se puede aprobar una medición si la curaduría no está aprobada',
        })
      }
    }

    if (measurement.subPeriodId) {
      const [subRows] = await pool.query<any[]>(
        `SELECT status FROM calendar_subperiods WHERE id = ?`,
        [measurement.subPeriodId]
      )
      if (Array.isArray(subRows) && subRows.length > 0) {
        const isClosed = subRows[0].status === 'closed'
        const user = (req as AuthRequest).user
        const canOverride =
          user?.hasSuperpowers ||
          user?.permissions?.includes('curation_review') ||
          user?.permissions?.includes('config.manage')
        if (isClosed && !canOverride) {
          return res.status(400).json({
            error: 'El subperíodo está cerrado. Solo Admin/Curator pueden overridear.',
          })
        }
      }
    }

    await pool.query(`UPDATE kpi_measurements SET status = ? WHERE id = ?`, ['approved', id])
    await applyMeasurementToAssignment(
      measurement.assignmentId,
      Number(measurement.value),
      measurement.mode || 'manual',
      measurement.id,
      measurement.criteriaVersionId
    )

    res.json({ message: 'Medición aprobada correctamente', warning })
  } catch (error: any) {
    console.error('Error approving measurement:', error)
    res.status(500).json({ error: 'Error al aprobar medición' })
  }
}

export const rejectMeasurement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    await pool.query(`UPDATE kpi_measurements SET status = ? WHERE id = ?`, ['rejected', id])
    res.json({ message: 'Medición rechazada correctamente' })
  } catch (error: any) {
    console.error('Error rejecting measurement:', error)
    res.status(500).json({ error: 'Error al rechazar medición' })
  }
}
