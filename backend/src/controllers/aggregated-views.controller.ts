import { Request, Response } from 'express'
import { pool } from '../config/database'
import { calculateVariation } from '../utils/kpi-formulas'
import { KPIDirection, KPIType } from '../types'

// Función auxiliar para calcular estadísticas
function calculateStatistics(results: number[]): {
  average: number
  min: number
  max: number
  standardDeviation: number
  count: number
} {
  if (results.length === 0) {
    return {
      average: 0,
      min: 0,
      max: 0,
      standardDeviation: 0,
      count: 0,
    }
  }

  const average = results.reduce((sum, val) => sum + val, 0) / results.length
  const min = Math.min(...results)
  const max = Math.max(...results)

  // Calcular desviación estándar
  const variance =
    results.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) /
    results.length
  const standardDeviation = Math.sqrt(variance)

  return {
    average,
    min,
    max,
    standardDeviation,
    count: results.length,
  }
}

const resolveDirection = (direction?: string | null, type?: string | null): KPIDirection => {
  if (direction === 'growth' || direction === 'reduction' || direction === 'exact') return direction
  if (type === 'growth' || type === 'reduction' || type === 'exact') return type
  if (type === 'sla') return 'reduction'
  return 'growth'
}

const computeCollaboratorResult = async (collaboratorId: number, periodId: number) => {
  const [rows] = await pool.query<any[]>(
    `SELECT ck.target,
            ck.actual,
            ck.weight,
            ck.variation,
            ck.subPeriodId,
            sp.weight as subPeriodWeight,
            k.type as kpiType,
            k.direction as kpiDirection
     FROM collaborator_kpis ck
     JOIN kpis k ON ck.kpiId = k.id
     LEFT JOIN calendar_subperiods sp ON ck.subPeriodId = sp.id
     WHERE ck.collaboratorId = ? AND ck.periodId = ?`,
    [collaboratorId, periodId]
  )

  if (!Array.isArray(rows) || rows.length === 0) return null

  const hasSubPeriods = rows.some((row) => row.subPeriodId !== null && row.subPeriodId !== undefined)
  const rowsToUse = hasSubPeriods
    ? rows.filter((row) => row.subPeriodId !== null && row.subPeriodId !== undefined)
    : rows.filter((row) => row.subPeriodId === null || row.subPeriodId === undefined)

  if (rowsToUse.length === 0) return null

  let totalImpact = 0

  for (const row of rowsToUse) {
    const direction = resolveDirection(row.kpiDirection, row.kpiType as KPIType)
    const variation =
      row.variation !== null && row.variation !== undefined
        ? Number(row.variation)
        : calculateVariation(direction, Number(row.target ?? 0), Number(row.actual ?? 0))
    if (!Number.isFinite(variation)) continue
    const weight = Number(row.weight ?? 0)
    const subWeight = Number(row.subPeriodWeight ?? 100)
    if (!Number.isFinite(weight) || weight <= 0) continue
    const normalizedSubWeight = Number.isFinite(subWeight) && subWeight > 0 ? subWeight : 100
    totalImpact += (variation * (weight / 100)) * (normalizedSubWeight / 100)
  }

  return totalImpact
}

export const getAggregatedByDirection = async (req: Request, res: Response) => {
  try {
    const { periodId } = req.query

    if (!periodId) {
      return res.status(400).json({ error: 'periodId es requerido' })
    }

    // Obtener colaboradores por área (dirección)
    const [areas] = await pool.query<any[]>(
      `SELECT DISTINCT area 
       FROM collaborators 
       WHERE role IN ('director', 'admin')
       ORDER BY area ASC`
    )

    const aggregatedData = []

    for (const areaRow of areas || []) {
      const area = areaRow.area

      // Obtener colaboradores del área
      const [collaborators] = await pool.query<any[]>(
        `SELECT id, name, position, role 
         FROM collaborators 
         WHERE area = ?`,
        [area]
      )

      const results: number[] = []

      for (const collab of collaborators || []) {
        const result = await computeCollaboratorResult(collab.id, Number(periodId))
        if (result !== null && !isNaN(result)) results.push(result)
      }

      const stats = calculateStatistics(results)

      aggregatedData.push({
        area,
        collaborators: collaborators || [],
        statistics: stats,
        results,
      })
    }

    res.json({
      periodId: parseInt(periodId as string),
      aggregatedData,
    })
  } catch (error: any) {
    console.error('Error fetching aggregated by direction:', error)
    res.status(500).json({ error: 'Error al obtener datos agregados' })
  }
}

export const getAggregatedByManagement = async (
  req: Request,
  res: Response
) => {
  try {
    const { periodId } = req.query

    if (!periodId) {
      return res.status(400).json({ error: 'periodId es requerido' })
    }

    // Obtener gerentes (managers)
    const [managers] = await pool.query<any[]>(
      `SELECT id, name, position, area 
       FROM collaborators 
       WHERE role = 'manager'
       ORDER BY area, name ASC`
    )

    const aggregatedData = []

    for (const manager of managers || []) {
      // Obtener colaboradores que reportan a este manager
      const [teamMembers] = await pool.query<any[]>(
        `SELECT id, name, position, area 
         FROM collaborators 
         WHERE managerId = ?`,
        [manager.id]
      )

      const results: number[] = []

      const managerResult = await computeCollaboratorResult(manager.id, Number(periodId))
      if (managerResult !== null && !isNaN(managerResult)) results.push(managerResult)

      for (const member of teamMembers || []) {
        const memberResult = await computeCollaboratorResult(member.id, Number(periodId))
        if (memberResult !== null && !isNaN(memberResult)) results.push(memberResult)
      }

      const stats = calculateStatistics(results)

      aggregatedData.push({
        manager: {
          id: manager.id,
          name: manager.name,
          position: manager.position,
          area: manager.area,
        },
        teamMembers: teamMembers || [],
        statistics: stats,
        results,
      })
    }

    res.json({
      periodId: parseInt(periodId as string),
      aggregatedData,
    })
  } catch (error: any) {
    console.error('Error fetching aggregated by management:', error)
    res.status(500).json({ error: 'Error al obtener datos agregados' })
  }
}

export const getAggregatedByLeadership = async (
  req: Request,
  res: Response
) => {
  try {
    const { periodId } = req.query

    if (!periodId) {
      return res.status(400).json({ error: 'periodId es requerido' })
    }

    // Obtener líderes
    const [leaders] = await pool.query<any[]>(
      `SELECT id, name, position, area 
       FROM collaborators 
       WHERE role = 'leader'
       ORDER BY area, name ASC`
    )

    const aggregatedData = []

    for (const leader of leaders || []) {
      // Obtener colaboradores que reportan a este líder
      const [teamMembers] = await pool.query<any[]>(
        `SELECT id, name, position, area 
         FROM collaborators 
         WHERE managerId = ?`,
        [leader.id]
      )

      const results: number[] = []

      const leaderResult = await computeCollaboratorResult(leader.id, Number(periodId))
      if (leaderResult !== null && !isNaN(leaderResult)) results.push(leaderResult)

      for (const member of teamMembers || []) {
        const memberResult = await computeCollaboratorResult(member.id, Number(periodId))
        if (memberResult !== null && !isNaN(memberResult)) results.push(memberResult)
      }

      const stats = calculateStatistics(results)

      aggregatedData.push({
        leader: {
          id: leader.id,
          name: leader.name,
          position: leader.position,
          area: leader.area,
        },
        teamMembers: teamMembers || [],
        statistics: stats,
        results,
      })
    }

    res.json({
      periodId: parseInt(periodId as string),
      aggregatedData,
    })
  } catch (error: any) {
    console.error('Error fetching aggregated by leadership:', error)
    res.status(500).json({ error: 'Error al obtener datos agregados' })
  }
}

export const getAggregatedByArea = async (req: Request, res: Response) => {
  try {
    const { periodId } = req.query

    if (!periodId) {
      return res.status(400).json({ error: 'periodId es requerido' })
    }

    // Obtener todas las áreas únicas
    const [areas] = await pool.query<any[]>(
      `SELECT DISTINCT area 
       FROM collaborators 
       ORDER BY area ASC`
    )

    const aggregatedData = []

    for (const areaRow of areas || []) {
      const area = areaRow.area

      // Obtener todos los colaboradores del área
      const [collaborators] = await pool.query<any[]>(
        `SELECT id, name, position, role 
         FROM collaborators 
         WHERE area = ?`,
        [area]
      )

      const results: number[] = []

      for (const collab of collaborators || []) {
        const result = await computeCollaboratorResult(collab.id, Number(periodId))
        if (result !== null && !isNaN(result)) results.push(result)
      }

      const stats = calculateStatistics(results)

      aggregatedData.push({
        area,
        collaborators: collaborators || [],
        statistics: stats,
        results,
      })
    }

    res.json({
      periodId: parseInt(periodId as string),
      aggregatedData,
    })
  } catch (error: any) {
    console.error('Error fetching aggregated by area:', error)
    res.status(500).json({ error: 'Error al obtener datos agregados' })
  }
}

