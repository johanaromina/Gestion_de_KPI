import { Response } from 'express'
import { pool } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'

/* GET /api/check-ins
   Leaders/admins get their team's check-ins; collaborators get their own.
   Query params: collaboratorId, weekStart, weekEnd */
export const getCheckIns = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!
    const { collaboratorId, weekStart, weekEnd } = req.query

    let whereClause = '1=1'
    const params: any[] = []

    // Collaborators can only see their own
    if (user.role === 'collaborator') {
      whereClause += ' AND ci.collaboratorId = ?'
      params.push(user.id)
    } else if (collaboratorId) {
      whereClause += ' AND ci.collaboratorId = ?'
      params.push(Number(collaboratorId))
    }

    if (weekStart) {
      whereClause += ' AND ci.weekStart >= ?'
      params.push(weekStart)
    }
    if (weekEnd) {
      whereClause += ' AND ci.weekStart <= ?'
      params.push(weekEnd)
    }

    const [rows] = await pool.query<any[]>(
      `SELECT
         ci.id,
         ci.collaboratorId,
         c.name AS collaboratorName,
         c.position,
         ci.weekStart,
         ci.q1, ci.q2, ci.q3,
         ci.mood,
         ci.collaboratorKpiId,
         ck.kpiId,
         k.name AS kpiName,
         ci.createdAt, ci.updatedAt
       FROM check_ins ci
       JOIN collaborators c ON c.id = ci.collaboratorId
       LEFT JOIN collaborator_kpis ck ON ck.id = ci.collaboratorKpiId
       LEFT JOIN kpis k ON k.id = ck.kpiId
       WHERE ${whereClause}
       ORDER BY ci.weekStart DESC, ci.createdAt DESC`,
      params
    )

    res.json(rows)
  } catch (err) {
    console.error('[check-ins] getCheckIns error:', err)
    res.status(500).json({ error: 'Error al obtener check-ins' })
  }
}

/* GET /api/check-ins/current-week
   Returns this week's check-in for the logged-in collaborator (or null) */
export const getCurrentWeekCheckIn = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!
    const today = new Date()
    const day = today.getDay() // 0=sun, 1=mon…
    const diff = day === 0 ? -6 : 1 - day
    const monday = new Date(today)
    monday.setDate(today.getDate() + diff)
    const weekStart = monday.toISOString().slice(0, 10)

    const [rows] = await pool.query<any[]>(
      `SELECT ci.*, c.name AS collaboratorName, k.name AS kpiName
       FROM check_ins ci
       JOIN collaborators c ON c.id = ci.collaboratorId
       LEFT JOIN collaborator_kpis ck ON ck.id = ci.collaboratorKpiId
       LEFT JOIN kpis k ON k.id = ck.kpiId
       WHERE ci.collaboratorId = ? AND ci.weekStart = ?
       LIMIT 1`,
      [user.id, weekStart]
    )

    res.json(Array.isArray(rows) && rows.length > 0 ? rows[0] : null)
  } catch (err) {
    console.error('[check-ins] getCurrentWeekCheckIn error:', err)
    res.status(500).json({ error: 'Error al obtener check-in de la semana' })
  }
}

/* POST /api/check-ins — upsert (one per collaborator per week) */
export const upsertCheckIn = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!
    const { q1, q2, q3, mood, collaboratorKpiId, weekStart: bodyWeekStart } = req.body

    if (!q1?.trim() || !q2?.trim() || !q3?.trim()) {
      return res.status(400).json({ error: 'Las tres preguntas son obligatorias' })
    }

    // Determine weekStart (Monday of current week unless explicitly given)
    let weekStart = bodyWeekStart
    if (!weekStart) {
      const today = new Date()
      const day = today.getDay()
      const diff = day === 0 ? -6 : 1 - day
      const monday = new Date(today)
      monday.setDate(today.getDate() + diff)
      weekStart = monday.toISOString().slice(0, 10)
    }

    await pool.query(
      `INSERT INTO check_ins (collaboratorId, weekStart, q1, q2, q3, mood, collaboratorKpiId)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE q1=VALUES(q1), q2=VALUES(q2), q3=VALUES(q3),
         mood=VALUES(mood), collaboratorKpiId=VALUES(collaboratorKpiId), updatedAt=NOW()`,
      [
        user.id,
        weekStart,
        q1.trim(),
        q2.trim(),
        q3.trim(),
        mood || null,
        collaboratorKpiId || null,
      ]
    )

    const [rows] = await pool.query<any[]>(
      `SELECT ci.*, c.name AS collaboratorName
       FROM check_ins ci JOIN collaborators c ON c.id = ci.collaboratorId
       WHERE ci.collaboratorId = ? AND ci.weekStart = ? LIMIT 1`,
      [user.id, weekStart]
    )

    res.status(201).json(Array.isArray(rows) ? rows[0] : {})
  } catch (err) {
    console.error('[check-ins] upsertCheckIn error:', err)
    res.status(500).json({ error: 'Error al guardar check-in' })
  }
}

/* GET /api/check-ins/team-summary
   For leaders: summary of team check-in completion for the last N weeks */
export const getTeamCheckInSummary = async (req: AuthRequest, res: Response) => {
  try {
    const { weeks = 8 } = req.query

    const [rows] = await pool.query<any[]>(
      `SELECT
         ci.weekStart,
         COUNT(*) AS total,
         AVG(ci.mood) AS avgMood,
         GROUP_CONCAT(c.name ORDER BY c.name SEPARATOR ', ') AS collaboratorNames
       FROM check_ins ci
       JOIN collaborators c ON c.id = ci.collaboratorId
       WHERE ci.weekStart >= DATE_SUB(CURDATE(), INTERVAL ? WEEK)
       GROUP BY ci.weekStart
       ORDER BY ci.weekStart DESC`,
      [Number(weeks)]
    )

    res.json(rows)
  } catch (err) {
    console.error('[check-ins] getTeamCheckInSummary error:', err)
    res.status(500).json({ error: 'Error al obtener resumen del equipo' })
  }
}
