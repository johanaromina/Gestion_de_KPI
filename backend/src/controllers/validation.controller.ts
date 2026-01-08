import { Request, Response } from 'express'
import { pool } from '../config/database'

export const validateConsistency = async (req: Request, res: Response) => {
  try {
    const { collaboratorId, periodId } = req.query

    if (!collaboratorId || !periodId) {
      return res.status(400).json({
        error: 'collaboratorId y periodId son requeridos',
      })
    }

    const issues: any[] = []

    // 1. Validar suma de ponderaciones = 100%
    const [weightRows] = await pool.query<any[]>(
      `SELECT SUM(weight) as totalWeight, COUNT(*) as kpiCount
       FROM collaborator_kpis
       WHERE collaboratorId = ? AND periodId = ?`,
      [collaboratorId, periodId]
    )

    if (Array.isArray(weightRows) && weightRows.length > 0) {
      const totalWeight = parseFloat(weightRows[0].totalWeight || 0)
      const kpiCount = weightRows[0].kpiCount || 0

      if (kpiCount > 0) {
        if (Math.abs(totalWeight - 100) > 0.01) {
          issues.push({
            type: 'weight_sum',
            severity: totalWeight > 100 ? 'error' : 'warning',
            message: `La suma de ponderaciones es ${totalWeight.toFixed(2)}% (debe ser 100%)`,
            details: {
              totalWeight,
              difference: Math.abs(100 - totalWeight),
              kpiCount,
            },
          })
        }
      }
    }

    // 2. Validar coherencia con KPIs macro
    const [macroRows] = await pool.query<any[]>(
      `SELECT ck.id, ck.kpiId, k.name as kpiName, k.macroKPIId, 
              mk.name as macroKpiName
       FROM collaborator_kpis ck
       JOIN kpis k ON ck.kpiId = k.id
       LEFT JOIN kpis mk ON k.macroKPIId = mk.id
       WHERE ck.collaboratorId = ? AND ck.periodId = ? AND k.macroKPIId IS NOT NULL`,
      [collaboratorId, periodId]
    )

    if (Array.isArray(macroRows) && macroRows.length > 0) {
      for (const row of macroRows) {
        // Verificar si el KPI macro también está asignado
        const [macroAssigned] = await pool.query<any[]>(
          `SELECT id FROM collaborator_kpis
           WHERE collaboratorId = ? AND periodId = ? AND kpiId = ?`,
          [collaboratorId, periodId, row.macroKPIId]
        )

        if (!Array.isArray(macroAssigned) || macroAssigned.length === 0) {
          issues.push({
            type: 'macro_kpi_missing',
            severity: 'warning',
            message: `El KPI "${row.kpiName}" está vinculado al macro KPI "${row.macroKpiName}" pero este no está asignado`,
            details: {
              kpiId: row.kpiId,
              kpiName: row.kpiName,
              macroKPIId: row.macroKPIId,
              macroKpiName: row.macroKpiName,
            },
          })
        }
      }
    }

    // 3. Detectar KPIs no vinculados al árbol de objetivos
    const [unlinkedRows] = await pool.query<any[]>(
      `SELECT ck.id, ck.kpiId, k.name as kpiName
       FROM collaborator_kpis ck
       JOIN kpis k ON ck.kpiId = k.id
       LEFT JOIN objective_trees_kpis otk ON k.id = otk.kpiId
       WHERE ck.collaboratorId = ? AND ck.periodId = ? 
       AND otk.kpiId IS NULL`,
      [collaboratorId, periodId]
    )

    if (Array.isArray(unlinkedRows) && unlinkedRows.length > 0) {
      issues.push({
        type: 'unlinked_kpis',
        severity: 'info',
        message: `${unlinkedRows.length} KPI(s) no están vinculados al árbol de objetivos`,
        details: {
          count: unlinkedRows.length,
          kpis: unlinkedRows.map((r) => ({
            id: r.kpiId,
            name: r.kpiName,
          })),
        },
      })
    }

    // 4. Detectar saturación de KPIs (más de 10 KPIs asignados)
    // Contar KPIs distintos (no subperiodos) para evitar multiplicar por cada mes
    const [saturationRows] = await pool.query<any[]>(
      `SELECT COUNT(DISTINCT kpiId) as kpiCount
       FROM collaborator_kpis
       WHERE collaboratorId = ? AND periodId = ? AND subPeriodId IS NULL`,
      [collaboratorId, periodId]
    )

    if (Array.isArray(saturationRows) && saturationRows.length > 0) {
      const kpiCount = saturationRows[0].kpiCount || 0
      if (kpiCount > 10) {
        issues.push({
          type: 'kpi_saturation',
          severity: 'warning',
          message: `El colaborador tiene ${kpiCount} KPIs asignados (se recomienda máximo 10)`,
          details: {
            kpiCount,
            recommendedMax: 10,
          },
        })
      }
    }

    res.json({
      valid: issues.filter((i) => i.severity === 'error').length === 0,
      issues,
      summary: {
        total: issues.length,
        errors: issues.filter((i) => i.severity === 'error').length,
        warnings: issues.filter((i) => i.severity === 'warning').length,
        info: issues.filter((i) => i.severity === 'info').length,
      },
    })
  } catch (error: any) {
    console.error('Error validating consistency:', error)
    res.status(500).json({ error: 'Error al validar consistencia' })
  }
}

export const validatePeriodConsistency = async (req: Request, res: Response) => {
  try {
    const { periodId } = req.params

    const [collaborators] = await pool.query<any[]>(
      `SELECT DISTINCT collaboratorId 
       FROM collaborator_kpis 
       WHERE periodId = ?`,
      [periodId]
    )

    const allIssues: any[] = []

    if (Array.isArray(collaborators) && collaborators.length > 0) {
      for (const collab of collaborators) {
        const [weightRows] = await pool.query<any[]>(
          `SELECT SUM(weight) as totalWeight, COUNT(*) as kpiCount
           FROM collaborator_kpis
           WHERE collaboratorId = ? AND periodId = ?`,
          [collab.collaboratorId, periodId]
        )

        if (Array.isArray(weightRows) && weightRows.length > 0) {
          const totalWeight = parseFloat(weightRows[0].totalWeight || 0)
          if (Math.abs(totalWeight - 100) > 0.01) {
            const [collabInfo] = await pool.query<any[]>(
              'SELECT name FROM collaborators WHERE id = ?',
              [collab.collaboratorId]
            )
            allIssues.push({
              collaboratorId: collab.collaboratorId,
              collaboratorName: collabInfo?.[0]?.name || `Colaborador #${collab.collaboratorId}`,
              type: 'weight_sum',
              severity: totalWeight > 100 ? 'error' : 'warning',
              message: `Suma de ponderaciones: ${totalWeight.toFixed(2)}%`,
              totalWeight,
            })
          }
        }
      }
    }

    res.json({
      periodId: parseInt(periodId),
      issues: allIssues,
      summary: {
        total: allIssues.length,
        errors: allIssues.filter((i) => i.severity === 'error').length,
        warnings: allIssues.filter((i) => i.severity === 'warning').length,
      },
    })
  } catch (error: any) {
    console.error('Error validating period consistency:', error)
    res.status(500).json({ error: 'Error al validar consistencia del período' })
  }
}
