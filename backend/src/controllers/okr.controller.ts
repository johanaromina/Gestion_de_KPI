import { Response } from 'express'
import { AuthRequest } from '../middleware/auth.middleware'
import { pool } from '../config/database'
import * as okrService from '../services/okr.service'

// ── Objectives ─────────────────────────────────────────────

export const getObjectives = async (req: AuthRequest, res: Response) => {
  try {
    const { periodId, orgScopeId, ownerId, status, parentId } = req.query
    const objectives = await okrService.listObjectives({
      periodId: periodId ? Number(periodId) : undefined,
      orgScopeId: orgScopeId ? Number(orgScopeId) : undefined,
      ownerId: ownerId ? Number(ownerId) : undefined,
      status: status as string | undefined,
      parentId: parentId === 'null' ? null : parentId ? Number(parentId) : undefined,
    })
    res.json(objectives)
  } catch (error) {
    console.error('[OKR] getObjectives:', error)
    res.status(500).json({ error: 'Error al obtener objetivos' })
  }
}

export const getObjective = async (req: AuthRequest, res: Response) => {
  try {
    const objective = await okrService.getObjectiveById(Number(req.params.id))
    if (!objective) return res.status(404).json({ error: 'Objetivo no encontrado' })
    res.json(objective)
  } catch (error) {
    console.error('[OKR] getObjective:', error)
    res.status(500).json({ error: 'Error al obtener objetivo' })
  }
}

export const createObjective = async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, parentId, orgScopeId, periodId, ownerId, status } = req.body
    if (!title || !periodId || !ownerId) {
      return res.status(400).json({ error: 'title, periodId y ownerId son requeridos' })
    }
    const id = await okrService.createObjective({ title, description, parentId, orgScopeId, periodId, ownerId, status })
    const created = await okrService.getObjectiveById(id)
    res.status(201).json(created)
  } catch (error) {
    console.error('[OKR] createObjective:', error)
    res.status(500).json({ error: 'Error al crear objetivo' })
  }
}

export const updateObjective = async (req: AuthRequest, res: Response) => {
  try {
    await okrService.updateObjective(Number(req.params.id), req.body)
    const updated = await okrService.getObjectiveById(Number(req.params.id))
    res.json(updated)
  } catch (error) {
    console.error('[OKR] updateObjective:', error)
    res.status(500).json({ error: 'Error al actualizar objetivo' })
  }
}

export const deleteObjective = async (req: AuthRequest, res: Response) => {
  try {
    await okrService.deleteObjective(Number(req.params.id))
    res.json({ success: true })
  } catch (error) {
    console.error('[OKR] deleteObjective:', error)
    res.status(500).json({ error: 'Error al eliminar objetivo' })
  }
}

// ── Key Results ────────────────────────────────────────────

export const getKeyResults = async (req: AuthRequest, res: Response) => {
  try {
    const krs = await okrService.listKeyResults(Number(req.params.objectiveId))
    res.json(krs)
  } catch (error) {
    console.error('[OKR] getKeyResults:', error)
    res.status(500).json({ error: 'Error al obtener key results' })
  }
}

export const createKeyResult = async (req: AuthRequest, res: Response) => {
  try {
    const objectiveId = Number(req.params.objectiveId)
    const { title, description, krType, startValue, targetValue, currentValue, unit, collaboratorKpiId, scopeKpiId, weight, ownerId, sortOrder } = req.body
    if (!title) return res.status(400).json({ error: 'title es requerido' })

    const id = await okrService.createKeyResult({
      objectiveId, title, description, krType, startValue, targetValue,
      currentValue, unit, collaboratorKpiId, scopeKpiId, weight, ownerId, sortOrder,
    })
    const krs = await okrService.listKeyResults(objectiveId)
    res.status(201).json(krs.find((k) => k.id === id))
  } catch (error) {
    console.error('[OKR] createKeyResult:', error)
    res.status(500).json({ error: 'Error al crear key result' })
  }
}

export const updateKeyResult = async (req: AuthRequest, res: Response) => {
  try {
    await okrService.updateKeyResult(Number(req.params.krId), req.body)
    res.json({ success: true })
  } catch (error) {
    console.error('[OKR] updateKeyResult:', error)
    res.status(500).json({ error: 'Error al actualizar key result' })
  }
}

export const deleteKeyResult = async (req: AuthRequest, res: Response) => {
  try {
    await okrService.deleteKeyResult(Number(req.params.krId))
    res.json({ success: true })
  } catch (error) {
    console.error('[OKR] deleteKeyResult:', error)
    res.status(500).json({ error: 'Error al eliminar key result' })
  }
}

// ── Check-ins ──────────────────────────────────────────────

export const getCheckIns = async (req: AuthRequest, res: Response) => {
  try {
    const checkIns = await okrService.listCheckIns(Number(req.params.krId))
    res.json(checkIns)
  } catch (error) {
    console.error('[OKR] getCheckIns:', error)
    res.status(500).json({ error: 'Error al obtener check-ins' })
  }
}

export const createCheckIn = async (req: AuthRequest, res: Response) => {
  try {
    const keyResultId = Number(req.params.krId)
    const { value, note } = req.body
    const authorId = req.user!.id

    if (value === undefined || value === null) {
      return res.status(400).json({ error: 'value es requerido' })
    }

    const id = await okrService.createCheckIn({ keyResultId, value: Number(value), note, authorId })
    const checkIns = await okrService.listCheckIns(keyResultId)
    res.status(201).json(checkIns.find((c) => c.id === id))
  } catch (error) {
    console.error('[OKR] createCheckIn:', error)
    res.status(500).json({ error: 'Error al crear check-in' })
  }
}

// ── Objective Tree links ───────────────────────────────────

export const getTreeLinks = async (req: AuthRequest, res: Response) => {
  try {
    const links = await okrService.getTreeLinksForObjective(Number(req.params.id))
    res.json(links)
  } catch (error) {
    console.error('[OKR] getTreeLinks:', error)
    res.status(500).json({ error: 'Error al obtener vinculos con arbol' })
  }
}

export const addTreeLink = async (req: AuthRequest, res: Response) => {
  try {
    const { objectiveTreeId } = req.body
    if (!objectiveTreeId) return res.status(400).json({ error: 'objectiveTreeId requerido' })
    await okrService.linkToObjectiveTree(Number(req.params.id), Number(objectiveTreeId))
    res.json({ success: true })
  } catch (error) {
    console.error('[OKR] addTreeLink:', error)
    res.status(500).json({ error: 'Error al vincular con arbol' })
  }
}

export const removeTreeLink = async (req: AuthRequest, res: Response) => {
  try {
    await okrService.unlinkFromObjectiveTree(Number(req.params.id), Number(req.params.treeId))
    res.json({ success: true })
  } catch (error) {
    console.error('[OKR] removeTreeLink:', error)
    res.status(500).json({ error: 'Error al desvincular del arbol' })
  }
}

// ── Data sources (trazabilidad) ────────────────────────────

export const getDataSources = async (req: AuthRequest, res: Response) => {
  try {
    const objectiveId = Number(req.params.id)

    // KRs del objetivo con sus vínculos a collaborator_kpi y scope_kpi
    const [krs] = await pool.query<any[]>(
      `SELECT
         kr.id        AS krId,
         kr.title     AS krTitle,
         kr.krType,
         kr.progressPercent,
         kr.status    AS krStatus,
         kr.collaboratorKpiId,
         kr.scopeKpiId,
         ck.actual    AS ckActual,
         ck.target    AS ckTarget,
         k1.name      AS ckKpiName,
         col.name     AS ckCollaboratorName,
         sk.actual    AS skActual,
         sk.target    AS skTarget,
         k2.name      AS skKpiName
       FROM okr_key_results kr
       LEFT JOIN collaborator_kpis ck ON kr.collaboratorKpiId = ck.id
       LEFT JOIN collaborators col ON ck.collaboratorId = col.id
       LEFT JOIN kpis k1 ON ck.kpiId = k1.id
       LEFT JOIN scope_kpis sk ON kr.scopeKpiId = sk.id
       LEFT JOIN kpis k2 ON sk.kpiId = k2.id
       WHERE kr.objectiveId = ?
       ORDER BY kr.sortOrder ASC, kr.id ASC`,
      [objectiveId]
    )

    if (!Array.isArray(krs) || krs.length === 0) {
      return res.json([])
    }

    // Para los KRs vinculados a scope_kpi, traer sus fuentes (collaborator_kpis hijos)
    const scopeKpiIds = krs
      .filter((r) => r.scopeKpiId)
      .map((r) => Number(r.scopeKpiId))

    const scopeSources = new Map<number, any[]>()

    if (scopeKpiIds.length > 0) {
      const placeholders = scopeKpiIds.map(() => '?').join(', ')
      const [linkRows] = await pool.query<any[]>(
        `SELECT
           l.parentScopeKpiId AS scopeKpiId,
           'collaborator'     AS sourceType,
           col.name           AS sourceName,
           ck.actual          AS actual,
           ck.target          AS target,
           k.name             AS kpiName,
           ck.status          AS sourceStatus
         FROM scope_kpi_links l
         JOIN collaborator_kpis ck ON l.collaboratorAssignmentId = ck.id
         JOIN collaborators col ON ck.collaboratorId = col.id
         JOIN kpis k ON ck.kpiId = k.id
         WHERE l.parentScopeKpiId IN (${placeholders})
         UNION ALL
         SELECT
           l.parentScopeKpiId AS scopeKpiId,
           'scope'            AS sourceType,
           k.name             AS sourceName,
           sk.actual          AS actual,
           sk.target          AS target,
           k.name             AS kpiName,
           sk.status          AS sourceStatus
         FROM scope_kpi_links l
         JOIN scope_kpis sk ON l.childScopeKpiId = sk.id
         JOIN kpis k ON sk.kpiId = k.id
         WHERE l.parentScopeKpiId IN (${placeholders})`,
        [...scopeKpiIds, ...scopeKpiIds]
      )

      for (const row of linkRows || []) {
        const id = Number(row.scopeKpiId)
        if (!scopeSources.has(id)) scopeSources.set(id, [])
        scopeSources.get(id)!.push(row)
      }
    }

    const result = krs.map((kr) => {
      if (kr.krType === 'kpi_linked' && kr.scopeKpiId) {
        return {
          krId: kr.krId,
          krTitle: kr.krTitle,
          krType: kr.krType,
          krStatus: kr.krStatus,
          sourceType: 'scope_kpi',
          kpiName: kr.skKpiName,
          actual: kr.skActual,
          target: kr.skTarget,
          sources: scopeSources.get(Number(kr.scopeKpiId)) ?? [],
        }
      }
      if (kr.krType === 'kpi_linked' && kr.collaboratorKpiId) {
        return {
          krId: kr.krId,
          krTitle: kr.krTitle,
          krType: kr.krType,
          krStatus: kr.krStatus,
          sourceType: 'collaborator_kpi',
          kpiName: kr.ckKpiName,
          actual: kr.ckActual,
          target: kr.ckTarget,
          sources: [
            {
              sourceType: 'collaborator',
              sourceName: kr.ckCollaboratorName,
              actual: kr.ckActual,
              target: kr.ckTarget,
              kpiName: kr.ckKpiName,
              sourceStatus: null,
            },
          ],
        }
      }
      // KR simple — no tiene fuente de datos externa
      return {
        krId: kr.krId,
        krTitle: kr.krTitle,
        krType: kr.krType,
        krStatus: kr.krStatus,
        sourceType: null,
        kpiName: null,
        actual: null,
        target: null,
        sources: [],
      }
    })

    res.json(result)
  } catch (error) {
    console.error('[OKR] getDataSources:', error)
    res.status(500).json({ error: 'Error al obtener fuentes de datos' })
  }
}

// ── Alignment tree ─────────────────────────────────────────

export const getAlignmentTree = async (req: AuthRequest, res: Response) => {
  try {
    const { periodId } = req.query
    if (!periodId) return res.status(400).json({ error: 'periodId es requerido' })
    const tree = await okrService.getAlignmentTree(Number(periodId))
    res.json(tree)
  } catch (error) {
    console.error('[OKR] getAlignmentTree:', error)
    res.status(500).json({ error: 'Error al obtener árbol de alineación' })
  }
}
