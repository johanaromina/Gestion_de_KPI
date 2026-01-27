import { Request, Response } from 'express'
import { pool } from '../config/database'
import { SubPeriod } from '../types'
import { sendMail } from '../utils/mailer'

const normalizeDate = (value: any): string | null => {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

const formatNumber = (value: any): string => {
  if (value === null || value === undefined || value === '') return '-'
  const parsed = Number(value)
  if (Number.isNaN(parsed)) return String(value)
  return parsed.toFixed(2)
}

export const getSubPeriods = async (req: Request, res: Response) => {
  try {
    const { periodId } = req.query

    let query = 'SELECT * FROM sub_periods'
    const params: any[] = []

    if (periodId) {
      query += ' WHERE periodId = ?'
      params.push(periodId)
    }

    query += ' ORDER BY startDate ASC'

    const [rows] = await pool.query<SubPeriod[]>(query, params)
    res.json(rows)
  } catch (error: any) {
    console.error('Error fetching sub-periods:', error)
    res.status(500).json({ error: 'Error al obtener subperíodos' })
  }
}

export const getSubPeriodById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query<SubPeriod[]>(
      'SELECT * FROM sub_periods WHERE id = ?',
      [id]
    )

    if (Array.isArray(rows) && rows.length === 0) {
      return res.status(404).json({ error: 'Subperíodo no encontrado' })
    }

    res.json(rows[0])
  } catch (error: any) {
    console.error('Error fetching sub-period:', error)
    res.status(500).json({ error: 'Error al obtener subperíodo' })
  }
}

export const createSubPeriod = async (req: Request, res: Response) => {
  try {
    const { periodId, name, startDate, endDate, weight } = req.body

    if (!periodId || !name || !startDate || !endDate) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    const start = normalizeDate(startDate)
    const end = normalizeDate(endDate)

    if (!start || !end) {
      return res.status(400).json({ error: 'Fechas inválidas' })
    }

    const [result] = await pool.query(
      `INSERT INTO sub_periods (periodId, name, startDate, endDate, status, weight) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [periodId, name, start, end, 'open', weight || null]
    )

    const insertResult = result as any
    res.status(201).json({
      id: insertResult.insertId,
      periodId,
      name,
      startDate: start,
      endDate: end,
      status: 'open',
      weight: weight || null,
    })
  } catch (error: any) {
    console.error('Error creating sub-period:', error)
    res.status(500).json({ error: 'Error al crear subperíodo' })
  }
}

export const updateSubPeriod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, startDate, endDate, weight } = req.body

    const start = normalizeDate(startDate)
    const end = normalizeDate(endDate)

    if (!start || !end) {
      return res.status(400).json({ error: 'Fechas inválidas' })
    }

    const [existingRows] = await pool.query<SubPeriod[]>(
      'SELECT * FROM sub_periods WHERE id = ?',
      [id]
    )

    if (Array.isArray(existingRows) && existingRows.length === 0) {
      return res.status(404).json({ error: 'Subperíodo no encontrado' })
    }

    const existing = existingRows[0]
    if (existing.status === 'closed') {
      return res.status(400).json({ error: 'El subperíodo está cerrado' })
    }

    await pool.query(
      `UPDATE sub_periods 
       SET name = ?, startDate = ?, endDate = ?, weight = ? 
       WHERE id = ?`,
      [name, start, end, weight || null, id]
    )

    res.json({ message: 'Subperíodo actualizado correctamente' })
  } catch (error: any) {
    console.error('Error updating sub-period:', error)
    res.status(500).json({ error: 'Error al actualizar subperíodo' })
  }
}

export const deleteSubPeriod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const [existingRows] = await pool.query<SubPeriod[]>(
      'SELECT * FROM sub_periods WHERE id = ?',
      [id]
    )

    if (Array.isArray(existingRows) && existingRows.length === 0) {
      return res.status(404).json({ error: 'Subperíodo no encontrado' })
    }

    const existing = existingRows[0]
    if (existing.status === 'closed') {
      return res.status(400).json({ error: 'No se puede eliminar un subperíodo cerrado' })
    }

    await pool.query('DELETE FROM sub_periods WHERE id = ?', [id])

    res.json({ message: 'Subperíodo eliminado correctamente' })
  } catch (error: any) {
    console.error('Error deleting sub-period:', error)
    res.status(500).json({ error: 'Error al eliminar subperíodo' })
  }
}

export const closeSubPeriod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const [subRows] = await pool.query<any[]>(
      `SELECT sp.*, p.name as periodName
       FROM sub_periods sp
       JOIN periods p ON p.id = sp.periodId
       WHERE sp.id = ?`,
      [id]
    )

    if (Array.isArray(subRows) && subRows.length === 0) {
      return res.status(404).json({ error: 'Subperíodo no encontrado' })
    }

    const subPeriod = subRows[0]
    if (subPeriod.status === 'closed') {
      return res.status(400).json({ error: 'El subperíodo ya está cerrado' })
    }

    await pool.query('UPDATE sub_periods SET status = ? WHERE id = ?', [
      'closed',
      id,
    ])

    const [kpiRows] = await pool.query<any[]>(
      `SELECT 
          ck.collaboratorId,
          c.name as collaboratorName,
          c.email as collaboratorEmail,
          k.name as kpiName,
          ck.target,
          ck.actual,
          ck.weight,
          ck.status
        FROM collaborator_kpis ck
        JOIN collaborators c ON c.id = ck.collaboratorId
        JOIN kpis k ON k.id = ck.kpiId
        WHERE ck.subPeriodId = ?
        ORDER BY c.name ASC, k.name ASC`,
      [id]
    )

    const grouped = new Map<
      number,
      {
        name: string
        email: string | null
        rows: any[]
      }
    >()

    for (const row of kpiRows) {
      if (!grouped.has(row.collaboratorId)) {
        grouped.set(row.collaboratorId, {
          name: row.collaboratorName,
          email: row.collaboratorEmail,
          rows: [],
        })
      }
      grouped.get(row.collaboratorId)?.rows.push(row)
    }

    const failures: { email: string; reason: string }[] = []
    let sentCount = 0

    for (const entry of grouped.values()) {
      if (!entry.email) {
        continue
      }

      const tableRows = entry.rows
        .map((item) => {
          return `
            <tr>
              <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${item.kpiName}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${formatNumber(item.target)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${formatNumber(item.actual)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${formatNumber(item.weight)}%</td>
              <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-transform:capitalize;">${item.status}</td>
            </tr>`
        })
        .join('')

      const html = `
        <div style="font-family:Arial, sans-serif; color:#111827;">
          <h2 style="margin-bottom:8px;">Resumen de KPIs</h2>
          <p style="margin:0 0 12px;">Hola ${entry.name},</p>
          <p style="margin:0 0 16px;">
            El subperíodo <strong>${subPeriod.name}</strong> del período
            <strong>${subPeriod.periodName}</strong> fue cerrado. Este es tu resumen:
          </p>
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <thead>
              <tr style="background:#f3f4f6; text-align:left;">
                <th style="padding:8px 10px;">KPI</th>
                <th style="padding:8px 10px;">Objetivo</th>
                <th style="padding:8px 10px;">Actual</th>
                <th style="padding:8px 10px;">Peso</th>
                <th style="padding:8px 10px;">Estado</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
          <p style="margin-top:16px;color:#6b7280;font-size:12px;">
            KPI Manager - Resumen automático
          </p>
        </div>
      `

      try {
        await sendMail({
          to: entry.email,
          subject: `Resumen de KPIs - ${subPeriod.name}`,
          html,
          text: `Resumen de KPIs del subperíodo ${subPeriod.name}`,
        })
        sentCount += 1
      } catch (error: any) {
        failures.push({
          email: entry.email,
          reason: error?.message || 'Error al enviar email',
        })
      }
    }

    if (failures.length > 0) {
      return res.json({
        message: 'Subperíodo cerrado con errores al enviar emails',
        sent: sentCount,
        failed: failures,
      })
    }

    res.json({ message: 'Subperíodo cerrado y emails enviados', sent: sentCount })
  } catch (error: any) {
    console.error('Error closing sub-period:', error)
    res.status(500).json({ error: 'Error al cerrar subperíodo' })
  }
}
