import { Request, Response } from 'express'
import { pool } from '../config/database'
import { ObjectiveTree, KPI, ScopeKPI } from '../types'
import { hydrateScopeKpiMixedFields } from '../services/scope-kpi-mixed.service'

const parseIdArray = (value: any) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0)
    )
  )

const buildPlaceholders = (count: number) => Array.from({ length: count }, () => '?').join(', ')

const fetchAllKpisWithAreas = async () => {
  const [allKpisRows] = await pool.query<any[]>(
    `SELECT k.*,
            GROUP_CONCAT(DISTINCT ka.area) as areas
     FROM kpis k
     LEFT JOIN kpi_areas ka ON ka.kpiId = k.id
     GROUP BY k.id`
  )

  return (allKpisRows || []).map((row: any) => ({
    ...row,
    areas: row.areas ? row.areas.split(',').map((area: string) => area.trim()) : [],
  })) as KPI[]
}

const fetchScopeKpisForObjectives = async (objectiveIds: number[]) => {
  const grouped = new Map<number, ScopeKPI[]>()
  if (objectiveIds.length === 0) return grouped

  const placeholders = buildPlaceholders(objectiveIds.length)
  const [rows] = await pool.query<any[]>(
    `SELECT otsk.objectiveTreeId,
            sk.*,
            k.name as kpiName,
            os.name as orgScopeName,
            os.type as orgScopeType,
            p.name as periodName,
            p.status as periodStatus,
            sp.name as subPeriodName
     FROM objective_trees_scope_kpis otsk
     JOIN scope_kpis sk ON sk.id = otsk.scopeKpiId
     JOIN kpis k ON k.id = sk.kpiId
     JOIN org_scopes os ON os.id = sk.orgScopeId
     JOIN periods p ON p.id = sk.periodId
     LEFT JOIN calendar_subperiods sp ON sp.id = sk.subPeriodId
     WHERE otsk.objectiveTreeId IN (${placeholders})
     ORDER BY sk.name ASC`,
    objectiveIds
  )

  ;(rows || []).forEach((row) => {
    const objectiveTreeId = Number(row.objectiveTreeId)
    const current = grouped.get(objectiveTreeId) || []
    current.push({
      ...hydrateScopeKpiMixedFields(row),
      objectiveTreeId: undefined,
    })
    grouped.set(objectiveTreeId, current)
  })

  return grouped
}

const fetchLinksForScopeKpis = async (scopeKpiIds: number[]) => {
  const grouped = new Map<number, any[]>()
  if (scopeKpiIds.length === 0) return grouped

  const [rows] = await pool.query<any[]>(
    `SELECT l.scopeKpiId,
            l.id,
            l.childType,
            l.collaboratorAssignmentId,
            l.childScopeKpiId,
            l.contributionWeight,
            l.aggregationMethod,
            l.sortOrder,
            ck.actual as collaboratorActual,
            ck.target as collaboratorTarget,
            ck.weightedResult as collaboratorWeightedResult,
            ck.periodId as collaboratorPeriodId,
            ck.subPeriodId as collaboratorSubPeriodId,
            c.name as collaboratorName,
            k.name as collaboratorKpiName,
            p.name as collaboratorPeriodName,
            sp.name as collaboratorSubPeriodName,
            skChild.actual as childScopeActual,
            skChild.target as childScopeTarget,
            skChild.weightedResult as childScopeWeightedResult,
            skChild.periodId as childScopePeriodId,
            skChild.subPeriodId as childScopeSubPeriodId,
            skChild.status as childScopeStatus,
            skChild.name as childScopeKpiName,
            os.name as childScopeOrgScopeName,
            p2.name as childScopePeriodName,
            sp2.name as childScopeSubPeriodName
     FROM scope_kpi_links l
     LEFT JOIN collaborator_kpis ck ON ck.id = l.collaboratorAssignmentId
     LEFT JOIN collaborators c ON c.id = ck.collaboratorId
     LEFT JOIN kpis k ON k.id = ck.kpiId
     LEFT JOIN periods p ON p.id = ck.periodId
     LEFT JOIN calendar_subperiods sp ON sp.id = ck.subPeriodId
     LEFT JOIN scope_kpis skChild ON skChild.id = l.childScopeKpiId
     LEFT JOIN org_scopes os ON os.id = skChild.orgScopeId
     LEFT JOIN periods p2 ON p2.id = skChild.periodId
     LEFT JOIN calendar_subperiods sp2 ON sp2.id = skChild.subPeriodId
     WHERE l.scopeKpiId IN (${buildPlaceholders(scopeKpiIds.length)})
     ORDER BY l.scopeKpiId, COALESCE(l.sortOrder, 0), l.id`,
    scopeKpiIds
  )

  ;(rows || []).forEach((row) => {
    const scopeKpiId = Number(row.scopeKpiId)
    const current = grouped.get(scopeKpiId) || []
    current.push({
      id: Number(row.id),
      childType: row.childType,
      collaboratorAssignmentId: row.collaboratorAssignmentId,
      childScopeKpiId: row.childScopeKpiId,
      contributionWeight: row.contributionWeight,
      aggregationMethod: row.aggregationMethod,
      sortOrder: row.sortOrder,
      collaboratorName: row.collaboratorName,
      collaboratorKpiName: row.collaboratorKpiName,
      collaboratorActual: row.collaboratorActual,
      collaboratorTarget: row.collaboratorTarget,
      collaboratorWeightedResult: row.collaboratorWeightedResult,
      collaboratorPeriodName: row.collaboratorPeriodName,
      collaboratorSubPeriodName: row.collaboratorSubPeriodName,
      childScopeKpiName: row.childScopeKpiName,
      childScopeOrgScopeName: row.childScopeOrgScopeName,
      childScopeActual: row.childScopeActual,
      childScopeTarget: row.childScopeTarget,
      childScopeWeightedResult: row.childScopeWeightedResult,
      childScopeStatus: row.childScopeStatus,
      childScopePeriodName: row.childScopePeriodName,
      childScopeSubPeriodName: row.childScopeSubPeriodName,
    })
    grouped.set(scopeKpiId, current)
  })

  return grouped
}

const syncObjectiveRelations = async (
  connection: any,
  objectiveId: number,
  kpiIds: number[],
  scopeKpiIds: number[]
) => {
  await connection.query('DELETE FROM objective_trees_kpis WHERE objectiveTreeId = ?', [objectiveId])
  await connection.query('DELETE FROM objective_trees_scope_kpis WHERE objectiveTreeId = ?', [objectiveId])

  for (const kpiId of kpiIds) {
    await connection.query(
      'INSERT INTO objective_trees_kpis (objectiveTreeId, kpiId) VALUES (?, ?)',
      [objectiveId, kpiId]
    )
  }

  for (const scopeKpiId of scopeKpiIds) {
    await connection.query(
      'INSERT INTO objective_trees_scope_kpis (objectiveTreeId, scopeKpiId) VALUES (?, ?)',
      [objectiveId, scopeKpiId]
    )
  }
}

const getObjectiveTreeRowOrThrow = async (id: number) => {
  const [rows] = await pool.query<any[]>('SELECT * FROM objective_trees WHERE id = ?', [id])
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Objetivo no encontrado')
  }
  return rows[0]
}

export const getObjectiveTrees = async (_req: Request, res: Response) => {
  try {
    const allKpis = await fetchAllKpisWithAreas()
    const kpiMap = new Map<number, KPI>()
    allKpis.forEach((kpi) => kpiMap.set(kpi.id as number, kpi))

    const [rows] = await pool.query<any[]>(
      `SELECT 
          ot.id,
          ot.name,
          ot.level,
          ot.parentId,
          GROUP_CONCAT(DISTINCT otk.kpiId) as kpiIds
       FROM objective_trees ot
       LEFT JOIN objective_trees_kpis otk ON ot.id = otk.objectiveTreeId
       GROUP BY ot.id, ot.name, ot.level, ot.parentId
       ORDER BY ot.level, ot.name ASC`
    )

    const objectiveIds = (rows || []).map((row) => Number(row.id))
    const scopeKpisByObjective = await fetchScopeKpisForObjectives(objectiveIds)

    const objectivesWithRelations = await Promise.all(
      (rows || []).map(async (row: any) => {
        const kpiIds = row.kpiIds ? row.kpiIds.split(',').map(Number) : []
        const kpiIdSet = new Set<number>(kpiIds)

        const objectiveArea = String(row.name || '').trim().toLowerCase()
        if (objectiveArea) {
          allKpis.forEach((kpi) => {
            const hasArea = (kpi.areas || []).some((area) => area && area.trim().toLowerCase() === objectiveArea)
            if (hasArea) {
              kpiIdSet.add(kpi.id as number)
            }
          })
        }

        const kpis: KPI[] = Array.from(kpiIdSet)
          .map((id) => kpiMap.get(id))
          .filter(Boolean) as KPI[]

        return {
          id: row.id,
          level: row.level,
          name: row.name,
          parentId: row.parentId,
          kpis,
          scopeKpis: scopeKpisByObjective.get(Number(row.id)) || [],
        } as ObjectiveTree
      })
    )

    res.json(objectivesWithRelations)
  } catch (error: any) {
    console.error('Error fetching objective trees:', error)
    res.status(500).json({ error: 'Error al obtener árbol de objetivos' })
  }
}

export const getObjectiveTreeById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    const objective = await getObjectiveTreeRowOrThrow(id)

    const [kpiRows] = await pool.query<any[]>(
      `SELECT k.* FROM kpis k
       INNER JOIN objective_trees_kpis otk ON k.id = otk.kpiId
       WHERE otk.objectiveTreeId = ?`,
      [id]
    )

    const scopeKpisByObjective = await fetchScopeKpisForObjectives([id])

    res.json({
      ...objective,
      kpis: kpiRows || [],
      scopeKpis: scopeKpisByObjective.get(id) || [],
    })
  } catch (error: any) {
    const message = error?.message || 'Error al obtener objetivo'
    console.error('Error fetching objective tree:', error)
    res.status(message === 'Objetivo no encontrado' ? 404 : 500).json({ error: message })
  }
}

export const getObjectiveTreeScopeKpis = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    await getObjectiveTreeRowOrThrow(id)
    const scopeKpisByObjective = await fetchScopeKpisForObjectives([id])
    res.json(scopeKpisByObjective.get(id) || [])
  } catch (error: any) {
    const message = error?.message || 'Error al obtener Scope KPIs del objetivo'
    console.error('Error fetching objective tree scope KPIs:', error)
    res.status(message === 'Objetivo no encontrado' ? 404 : 500).json({ error: message })
  }
}

export const getObjectiveTreeDrilldown = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    const objective = await getObjectiveTreeRowOrThrow(id)

    const [kpiRows] = await pool.query<any[]>(
      `SELECT k.* FROM kpis k
       INNER JOIN objective_trees_kpis otk ON k.id = otk.kpiId
       WHERE otk.objectiveTreeId = ?`,
      [id]
    )

    const scopeKpisByObjective = await fetchScopeKpisForObjectives([id])
    const scopeKpis = scopeKpisByObjective.get(id) || []
    const linksByScopeKpi = await fetchLinksForScopeKpis(scopeKpis.map((scopeKpi) => Number(scopeKpi.id)))

    res.json({
      ...objective,
      kpis: kpiRows || [],
      scopeKpis: scopeKpis.map((scopeKpi) => ({
        ...scopeKpi,
        links: linksByScopeKpi.get(Number(scopeKpi.id)) || [],
      })),
    })
  } catch (error: any) {
    const message = error?.message || 'Error al obtener drill-down del objetivo'
    console.error('Error fetching objective tree drilldown:', error)
    res.status(message === 'Objetivo no encontrado' ? 404 : 500).json({ error: message })
  }
}

export const createObjectiveTree = async (req: Request, res: Response) => {
  const connection = await pool.getConnection()
  try {
    const { level, name, parentId } = req.body
    const kpiIds = parseIdArray(req.body?.kpiIds)
    const scopeKpiIds = parseIdArray(req.body?.scopeKpiIds)

    if (!level || !name) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    await connection.beginTransaction()

    const [result] = await connection.query(
      `INSERT INTO objective_trees (level, name, parentId) 
       VALUES (?, ?, ?)`,
      [level, name, parentId || null]
    )

    const objectiveId = Number((result as any).insertId)
    await syncObjectiveRelations(connection, objectiveId, kpiIds, scopeKpiIds)
    await connection.commit()

    res.status(201).json({
      id: objectiveId,
      level,
      name,
      parentId: parentId || null,
      kpiIds,
      scopeKpiIds,
    })
  } catch (error: any) {
    await connection.rollback()
    console.error('Error creating objective tree:', error)
    res.status(500).json({ error: 'Error al crear objetivo' })
  } finally {
    connection.release()
  }
}

export const updateObjectiveTree = async (req: Request, res: Response) => {
  const connection = await pool.getConnection()
  try {
    const id = Number(req.params.id)
    const { level, name, parentId } = req.body
    const kpiIds = parseIdArray(req.body?.kpiIds)
    const scopeKpiIds = parseIdArray(req.body?.scopeKpiIds)

    await connection.beginTransaction()
    await connection.query(
      `UPDATE objective_trees 
       SET level = ?, name = ?, parentId = ? 
       WHERE id = ?`,
      [level, name, parentId || null, id]
    )

    await syncObjectiveRelations(connection, id, kpiIds, scopeKpiIds)
    await connection.commit()

    res.json({ message: 'Objetivo actualizado correctamente' })
  } catch (error: any) {
    await connection.rollback()
    console.error('Error updating objective tree:', error)
    res.status(500).json({ error: 'Error al actualizar objetivo' })
  } finally {
    connection.release()
  }
}

export const syncObjectiveTreeScopeKpis = async (req: Request, res: Response) => {
  const connection = await pool.getConnection()
  try {
    const id = Number(req.params.id)
    await getObjectiveTreeRowOrThrow(id)
    const scopeKpiIds = parseIdArray(req.body?.scopeKpiIds)

    await connection.beginTransaction()
    await connection.query('DELETE FROM objective_trees_scope_kpis WHERE objectiveTreeId = ?', [id])
    for (const scopeKpiId of scopeKpiIds) {
      await connection.query(
        'INSERT INTO objective_trees_scope_kpis (objectiveTreeId, scopeKpiId) VALUES (?, ?)',
        [id, scopeKpiId]
      )
    }
    await connection.commit()

    res.json({ message: 'Scope KPIs del objetivo sincronizados', count: scopeKpiIds.length })
  } catch (error: any) {
    await connection.rollback()
    const message = error?.message || 'Error al sincronizar Scope KPIs del objetivo'
    console.error('Error syncing objective tree scope KPIs:', error)
    res.status(message === 'Objetivo no encontrado' ? 404 : 500).json({ error: message })
  } finally {
    connection.release()
  }
}

export const getOKRsForObjectiveTree = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { getOKRsForObjectiveTree: fetchOKRs } = await import('../services/okr.service.js')
    const okrs = await fetchOKRs(Number(id))
    res.json(okrs)
  } catch (error: any) {
    console.error('Error fetching OKRs for objective tree:', error)
    res.status(500).json({ error: 'Error al obtener OKRs vinculados' })
  }
}

export const deleteObjectiveTree = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    await pool.query('DELETE FROM objective_trees WHERE id = ?', [id])
    res.json({ message: 'Objetivo eliminado correctamente' })
  } catch (error: any) {
    console.error('Error deleting objective tree:', error)
    res.status(500).json({ error: 'Error al eliminar objetivo' })
  }
}
