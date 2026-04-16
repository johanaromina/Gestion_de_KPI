import { Request, Response } from 'express'
import { pool } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import {
  applyMeasurementToCollaboratorAssignment,
  applyMeasurementToScopeKpi,
  ensureSingleMeasurementOwner,
} from '../services/measurement-application.service'

export const getMeasurements = async (req: Request, res: Response) => {
  try {
    const { assignmentId, scopeKpiId, periodId, subPeriodId, status } = req.query

    let query = `SELECT m.*, c.name as capturedByName
                 FROM kpi_measurements m
                 LEFT JOIN collaborators c ON m.capturedBy = c.id
                 WHERE 1=1`
    const params: any[] = []

    if (assignmentId) {
      query += ' AND m.assignmentId = ?'
      params.push(assignmentId)
    }
    if (scopeKpiId) {
      query += ' AND m.scopeKpiId = ?'
      params.push(scopeKpiId)
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
      scopeKpiId,
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

    try {
      ensureSingleMeasurementOwner(assignmentId, scopeKpiId)
    } catch (validationError: any) {
      return res.status(400).json({ error: validationError?.message || 'Owner de medición inválido' })
    }
    if (value === undefined) {
      return res.status(400).json({ error: 'value es requerido' })
    }

    const userId = (req as AuthRequest).user?.id || null

    // Verificar duplicado: si ya existe una medición aprobada para esta asignación, bloquear
    // salvo que el usuario envíe force=true (override explícito)
    if ((status || 'draft') === 'approved' && assignmentId && !req.body.force) {
      const [existingRows] = await pool.query<any[]>(
        `SELECT id, value, capturedAt FROM kpi_measurements WHERE assignmentId = ? AND status = 'approved' ORDER BY capturedAt DESC LIMIT 1`,
        [assignmentId]
      )
      if (Array.isArray(existingRows) && existingRows.length > 0) {
        const existing = existingRows[0]
        return res.status(409).json({
          error: `Ya existe una medición aprobada con valor ${existing.value} (${new Date(existing.capturedAt).toLocaleDateString('es-AR')}). Para reemplazarla enviá force=true con un motivo.`,
          existingValue: existing.value,
          existingDate: existing.capturedAt,
        })
      }
    }

    let warning: string | null = null
    if ((status || 'draft') === 'approved' && assignmentId) {
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
       (assignmentId, scopeKpiId, periodId, subPeriodId, value, mode, status, capturedBy, criteriaVersionId, reason, evidenceUrl, sourceRunId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        assignmentId || null,
        scopeKpiId || null,
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

    if ((status || 'draft') === 'approved' && assignmentId) {
      await applyMeasurementToCollaboratorAssignment(assignmentId, Number(value), mode || 'manual', measurementId, criteriaVersionId)
    }
    if ((status || 'draft') === 'approved' && scopeKpiId) {
      await applyMeasurementToScopeKpi(Number(scopeKpiId), Number(value), mode || 'manual', measurementId)
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

    let warning: string | null = null
    if (measurement.assignmentId) {
      const [assignmentRows] = await pool.query<any[]>(
        `SELECT curationStatus FROM collaborator_kpis WHERE id = ?`,
        [measurement.assignmentId]
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
    if (measurement.assignmentId) {
      await applyMeasurementToCollaboratorAssignment(
        measurement.assignmentId,
        Number(measurement.value),
        measurement.mode || 'manual',
        measurement.id,
        measurement.criteriaVersionId
      )
    }
    if (measurement.scopeKpiId) {
      await applyMeasurementToScopeKpi(
        measurement.scopeKpiId,
        Number(measurement.value),
        measurement.mode || 'manual',
        measurement.id
      )
    }

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
