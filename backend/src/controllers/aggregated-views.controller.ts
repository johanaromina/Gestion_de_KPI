import { Request, Response } from 'express'
import { pool } from '../config/database'

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
        // Calcular resultado global del colaborador
        const [kpis] = await pool.query<any[]>(
          `SELECT 
            SUM(weightedResult) as totalWeightedResult,
            SUM(weight) as totalWeight
           FROM collaborator_kpis
           WHERE collaboratorId = ? AND periodId = ?`,
          [collab.id, periodId]
        )

        if (
          Array.isArray(kpis) &&
          kpis.length > 0 &&
          kpis[0].totalWeight > 0
        ) {
          const result =
            (parseFloat(kpis[0].totalWeightedResult || 0) /
              parseFloat(kpis[0].totalWeight)) *
            100
          if (!isNaN(result)) {
            results.push(result)
          }
        }
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

      // Incluir también el resultado del manager
      const [managerKpis] = await pool.query<any[]>(
        `SELECT 
          SUM(weightedResult) as totalWeightedResult,
          SUM(weight) as totalWeight
         FROM collaborator_kpis
         WHERE collaboratorId = ? AND periodId = ?`,
        [manager.id, periodId]
      )

      if (
        Array.isArray(managerKpis) &&
        managerKpis.length > 0 &&
        managerKpis[0].totalWeight > 0
      ) {
        const result =
          (parseFloat(managerKpis[0].totalWeightedResult || 0) /
            parseFloat(managerKpis[0].totalWeight)) *
          100
        if (!isNaN(result)) {
          results.push(result)
        }
      }

      for (const member of teamMembers || []) {
        const [kpis] = await pool.query<any[]>(
          `SELECT 
            SUM(weightedResult) as totalWeightedResult,
            SUM(weight) as totalWeight
           FROM collaborator_kpis
           WHERE collaboratorId = ? AND periodId = ?`,
          [member.id, periodId]
        )

        if (Array.isArray(kpis) && kpis.length > 0 && kpis[0].totalWeight > 0) {
          const result =
            (parseFloat(kpis[0].totalWeightedResult || 0) /
              parseFloat(kpis[0].totalWeight)) *
            100
          if (!isNaN(result)) {
            results.push(result)
          }
        }
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

      // Incluir también el resultado del líder
      const [leaderKpis] = await pool.query<any[]>(
        `SELECT 
          SUM(weightedResult) as totalWeightedResult,
          SUM(weight) as totalWeight
         FROM collaborator_kpis
         WHERE collaboratorId = ? AND periodId = ?`,
        [leader.id, periodId]
      )

      if (
        Array.isArray(leaderKpis) &&
        leaderKpis.length > 0 &&
        leaderKpis[0].totalWeight > 0
      ) {
        const result =
          (parseFloat(leaderKpis[0].totalWeightedResult || 0) /
            parseFloat(leaderKpis[0].totalWeight)) *
          100
        if (!isNaN(result)) {
          results.push(result)
        }
      }

      for (const member of teamMembers || []) {
        const [kpis] = await pool.query<any[]>(
          `SELECT 
            SUM(weightedResult) as totalWeightedResult,
            SUM(weight) as totalWeight
           FROM collaborator_kpis
           WHERE collaboratorId = ? AND periodId = ?`,
          [member.id, periodId]
        )

        if (Array.isArray(kpis) && kpis.length > 0 && kpis[0].totalWeight > 0) {
          const result =
            (parseFloat(kpis[0].totalWeightedResult || 0) /
              parseFloat(kpis[0].totalWeight)) *
            100
          if (!isNaN(result)) {
            results.push(result)
          }
        }
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
        const [kpis] = await pool.query<any[]>(
          `SELECT 
            SUM(weightedResult) as totalWeightedResult,
            SUM(weight) as totalWeight
           FROM collaborator_kpis
           WHERE collaboratorId = ? AND periodId = ?`,
          [collab.id, periodId]
        )

        if (
          Array.isArray(kpis) &&
          kpis.length > 0 &&
          kpis[0].totalWeight > 0
        ) {
          const result =
            (parseFloat(kpis[0].totalWeightedResult || 0) /
              parseFloat(kpis[0].totalWeight)) *
            100
          if (!isNaN(result)) {
            results.push(result)
          }
        }
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

