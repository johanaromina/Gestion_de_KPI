import { Response } from 'express'
import { pool } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import { recalcOKRsLinkedToCollaboratorKpi, autoScoreKRStatuses } from '../services/okr.service'
import { applyMeasurementToCollaboratorAssignment } from '../services/measurement-application.service'
import { recalcSummaryAssignment } from '../controllers/collaborator-kpis.controller'

/**
 * GET /api/mi-semana
 * Devuelve en una sola llamada:
 *   - krs: Key Results activos donde el usuario es responsable (tipo simple)
 *   - kpis: Asignaciones de KPI del usuario en el período activo
 *   - checkIn: check-in de la semana actual (si existe)
 */
export const getMiSemana = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id
    const collaboratorId = req.user!.collaboratorId

    if (!collaboratorId) {
      return res.json({ krs: [], kpis: [], checkIn: null })
    }

    // ── KRs activos del usuario ─────────────────────────────
    const [krs] = await pool.query<any[]>(
      `SELECT
         kr.id            AS krId,
         kr.title         AS krTitle,
         kr.startValue,
         kr.targetValue,
         kr.currentValue,
         kr.unit,
         kr.status        AS krStatus,
         kr.weight,
         o.id             AS objectiveId,
         o.title          AS objectiveTitle,
         o.progress       AS objectiveProgress,
         p.name           AS periodName,
         -- última fecha de check-in
         (SELECT MAX(ci.createdAt)
          FROM okr_check_ins ci
          WHERE ci.keyResultId = kr.id) AS lastCheckin
       FROM okr_key_results kr
       JOIN okr_objectives o   ON o.id = kr.objectiveId
       JOIN periods p          ON p.id = o.periodId
       WHERE kr.ownerId = ?
         AND kr.krType  = 'simple'
         AND o.status   = 'active'
       ORDER BY o.id ASC, kr.sortOrder ASC`,
      [collaboratorId]
    )

    // ── KPIs activos del usuario en período abierto ─────────
    const [kpis] = await pool.query<any[]>(
      `SELECT
         ck.id,
         k.name           AS kpiName,
         ck.actual,
         ck.target,
         ck.weightedResult,
         ck.status,
         ck.periodId,
         p.name           AS periodName,
         sp.name          AS subPeriodName,
         ck.inputMode
       FROM collaborator_kpis ck
       JOIN kpis k         ON k.id  = ck.kpiId
       JOIN periods p       ON p.id  = ck.periodId
       LEFT JOIN calendar_subperiods sp ON sp.id = ck.subPeriodId
       WHERE ck.collaboratorId = ?
         AND ck.status NOT IN ('closed', 'rejected')
         AND p.status  = 'open'
       ORDER BY ck.id DESC
       LIMIT 20`,
      [collaboratorId]
    )

    // ── Check-in de la semana actual ────────────────────────
    const today = new Date()
    const dayOfWeek = today.getDay()
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(today)
    monday.setDate(today.getDate() + diff)
    const weekStart = monday.toISOString().slice(0, 10)

    const [ciRows] = await pool.query<any[]>(
      `SELECT id, q1, q2, q3, mood FROM check_ins WHERE collaboratorId = ? AND weekStart = ?`,
      [collaboratorId, weekStart]
    )
    const checkIn = Array.isArray(ciRows) && ciRows.length > 0 ? ciRows[0] : null

    res.json({
      krs: Array.isArray(krs) ? krs : [],
      kpis: Array.isArray(kpis) ? kpis : [],
      checkIn,
      weekStart,
    })
  } catch (error) {
    console.error('[MiSemana] getMiSemana:', error)
    res.status(500).json({ error: 'Error al obtener datos de la semana' })
  }
}

/**
 * PATCH /api/mi-semana/kr/:krId
 * Registra un check-in en un KR simple y actualiza currentValue.
 * Body: { value: number, note?: string }
 */
export const updateKRValue = async (req: AuthRequest, res: Response) => {
  try {
    const krId = Number(req.params.krId)
    const { value, note } = req.body
    const authorId = req.user!.collaboratorId

    if (value === undefined || value === null) {
      return res.status(400).json({ error: 'value es requerido' })
    }
    if (!authorId) {
      return res.status(403).json({ error: 'No autorizado' })
    }

    // Verificar que el KR le pertenece al usuario
    const [krRows] = await pool.query<any[]>(
      `SELECT id, objectiveId, ownerId FROM okr_key_results WHERE id = ? AND krType = 'simple'`,
      [krId]
    )
    if (!Array.isArray(krRows) || krRows.length === 0) {
      return res.status(404).json({ error: 'Key Result no encontrado' })
    }
    if (krRows[0].ownerId !== authorId) {
      return res.status(403).json({ error: 'No sos el responsable de este KR' })
    }

    // Registrar check-in
    await pool.query(
      `INSERT INTO okr_check_ins (keyResultId, value, note, authorId) VALUES (?, ?, ?, ?)`,
      [krId, Number(value), note ?? null, authorId]
    )

    // Actualizar currentValue en el KR
    await pool.query(
      `UPDATE okr_key_results SET currentValue = ? WHERE id = ?`,
      [Number(value), krId]
    )

    // Recalcular progreso del objetivo
    await autoScoreKRStatuses(krRows[0].objectiveId)

    // Re-leer el KR actualizado
    const [updated] = await pool.query<any[]>(
      `SELECT id, currentValue, targetValue, startValue,
              ROUND(LEAST(100, GREATEST(0,
                CASE WHEN targetValue = startValue THEN
                  IF(? >= targetValue, 100, 0)
                ELSE
                  ((? - startValue) / (targetValue - startValue)) * 100
                END
              ))) AS progressPercent
       FROM okr_key_results WHERE id = ?`,
      [Number(value), Number(value), krId]
    )

    res.json({ success: true, kr: Array.isArray(updated) ? updated[0] : null })
  } catch (error) {
    console.error('[MiSemana] updateKRValue:', error)
    res.status(500).json({ error: 'Error al actualizar KR' })
  }
}

/**
 * PATCH /api/mi-semana/kpi/:kpiId
 * Actualiza el actual de un KPI asignado al usuario.
 * Body: { actual: number }
 */
export const updateKPIActual = async (req: AuthRequest, res: Response) => {
  try {
    const kpiId = Number(req.params.kpiId)
    const { actual } = req.body
    const collaboratorId = req.user!.collaboratorId

    if (actual === undefined || actual === null) {
      return res.status(400).json({ error: 'actual es requerido' })
    }
    if (!collaboratorId) {
      return res.status(403).json({ error: 'No autorizado' })
    }

    // Verificar que la asignación le pertenece
    const [ckRows] = await pool.query<any[]>(
      `SELECT ck.id, ck.collaboratorId, ck.kpiId, ck.periodId, ck.status,
              ck.target, ck.inputMode, ck.activeCriteriaVersionId,
              p.status AS periodStatus
       FROM collaborator_kpis ck
       JOIN periods p ON p.id = ck.periodId
       WHERE ck.id = ?`,
      [kpiId]
    )
    if (!Array.isArray(ckRows) || ckRows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada' })
    }
    if (ckRows[0].collaboratorId !== collaboratorId) {
      return res.status(403).json({ error: 'No sos el responsable de esta asignación' })
    }
    if (ckRows[0].status === 'closed') {
      return res.status(403).json({ error: 'La asignación está cerrada' })
    }

    const ck = ckRows[0]
    const userId = req.user!.id

    // Insertar medición
    const [result] = await pool.query<any>(
      `INSERT INTO kpi_measurements
       (assignmentId, periodId, value, mode, status, capturedBy, criteriaVersionId)
       VALUES (?, ?, ?, ?, 'approved', ?, ?)`,
      [kpiId, ck.periodId, Number(actual), ck.inputMode || 'manual', userId, ck.activeCriteriaVersionId || null]
    )
    const measurementId = (result as any).insertId
    if (measurementId) {
      await applyMeasurementToCollaboratorAssignment(
        kpiId,
        Number(actual),
        ck.inputMode || 'manual',
        measurementId,
        ck.activeCriteriaVersionId || null
      )
    }

    await recalcSummaryAssignment(collaboratorId, ck.kpiId, ck.periodId)

    // Propagar a OKRs vinculados
    recalcOKRsLinkedToCollaboratorKpi(kpiId).catch((err) =>
      console.error('[MiSemana] OKR propagation:', err)
    )

    // Leer valor actualizado
    const [updatedRows] = await pool.query<any[]>(
      `SELECT actual, weightedResult FROM collaborator_kpis WHERE id = ?`,
      [kpiId]
    )
    const updated = Array.isArray(updatedRows) ? updatedRows[0] : null

    res.json({ success: true, actual: updated?.actual, weightedResult: updated?.weightedResult })
  } catch (error) {
    console.error('[MiSemana] updateKPIActual:', error)
    res.status(500).json({ error: 'Error al actualizar KPI' })
  }
}
