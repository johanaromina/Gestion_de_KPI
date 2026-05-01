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
    const { title, description, krType, startValue, targetValue, currentValue, unit, collaboratorKpiId, scopeKpiId, weight, ownerId, sortOrder, kpiLinks } = req.body
    if (!title) return res.status(400).json({ error: 'title es requerido' })

    const id = await okrService.createKeyResult({
      objectiveId, title, description, krType, startValue, targetValue,
      currentValue, unit, collaboratorKpiId, scopeKpiId, weight, ownerId, sortOrder, kpiLinks,
    })
    const krs = await okrService.listKeyResults(objectiveId)
    res.status(201).json(krs.find((k) => k.id === id))
  } catch (error: any) {
    console.error('[OKR] createKeyResult:', error)
    const detail = error?.sqlMessage || error?.message || null
    res.status(500).json({ error: detail ? `Error al crear key result: ${detail}` : 'Error al crear key result' })
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

    // KRs del objetivo — incluye legacy columns como fallback para datos viejos
    const [krs] = await pool.query<any[]>(
      `SELECT
         kr.id           AS krId,
         kr.title        AS krTitle,
         kr.krType,
         kr.status       AS krStatus,
         kr.collaboratorKpiId,
         kr.scopeKpiId,
         ck.actual       AS ckActual,
         ck.target       AS ckTarget,
         ck.variation    AS ckVariation,
         k1.name         AS ckKpiName,
         k1.direction    AS ckKpiDirection,
         k1.type         AS ckKpiType,
         col.name        AS ckCollaboratorName,
         sk.actual       AS skActual,
         sk.target       AS skTarget,
         k2.name         AS skKpiName,
         k2.direction    AS skKpiDirection,
         k2.type         AS skKpiType
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

    const krIds = krs.map((r) => r.krId)

    // Leer todos los KPI links desde okr_kr_kpis (fuente primaria)
    const kpiLinksMap = new Map<number, any[]>()
    try {
      const [linkRows] = await pool.query<any[]>(
        `SELECT
           okk.krId, okk.collaboratorKpiId, okk.scopeKpiId,
           ck.actual AS ckActual, ck.target AS ckTarget, ck.variation AS ckVariation,
           k1.name AS ckKpiName, k1.direction AS ckKpiDirection, k1.type AS ckKpiType,
           col.name AS ckCollaboratorName,
           sk.actual AS skActual, sk.target AS skTarget,
           k2.name AS skKpiName, k2.direction AS skKpiDirection, k2.type AS skKpiType
         FROM okr_kr_kpis okk
         LEFT JOIN collaborator_kpis ck ON okk.collaboratorKpiId = ck.id
         LEFT JOIN collaborators col ON ck.collaboratorId = col.id
         LEFT JOIN kpis k1 ON ck.kpiId = k1.id
         LEFT JOIN scope_kpis sk ON okk.scopeKpiId = sk.id
         LEFT JOIN kpis k2 ON sk.kpiId = k2.id
         WHERE okk.krId IN (${krIds.map(() => '?').join(',')})`,
        krIds
      )
      for (const row of Array.isArray(linkRows) ? linkRows : []) {
        const list = kpiLinksMap.get(row.krId) ?? []
        list.push(row)
        kpiLinksMap.set(row.krId, list)
      }
    } catch { /* tabla okr_kr_kpis no existe — se usa legacy */ }

    // Recolectar todos los scopeKpiIds para traer sus fuentes hijas
    const allScopeKpiIds = new Set<number>()
    for (const links of kpiLinksMap.values()) {
      for (const lk of links) { if (lk.scopeKpiId) allScopeKpiIds.add(Number(lk.scopeKpiId)) }
    }
    // También legacy
    for (const kr of krs) { if (kr.scopeKpiId && !kpiLinksMap.has(kr.krId)) allScopeKpiIds.add(Number(kr.scopeKpiId)) }

    const scopeSources = new Map<number, any[]>()
    if (allScopeKpiIds.size > 0) {
      const ids = [...allScopeKpiIds]
      const ph = ids.map(() => '?').join(', ')
      const [linkRows] = await pool.query<any[]>(
        `SELECT l.scopeKpiId, 'collaborator' AS sourceType, col.name AS sourceName,
           ck.actual, ck.target, ck.variation, k.name AS kpiName, k.direction AS kpiDirection, k.type AS kpiType, ck.status AS sourceStatus
         FROM scope_kpi_links l
         JOIN collaborator_kpis ck ON l.collaboratorAssignmentId = ck.id
         JOIN collaborators col ON ck.collaboratorId = col.id
         JOIN kpis k ON ck.kpiId = k.id
         WHERE l.childType = 'collaborator' AND l.scopeKpiId IN (${ph})
         UNION ALL
         SELECT l.scopeKpiId, 'scope' AS sourceType, k.name AS sourceName,
           sk.actual, sk.target, NULL AS variation, k.name AS kpiName, k.direction AS kpiDirection, k.type AS kpiType, sk.status AS sourceStatus
         FROM scope_kpi_links l
         JOIN scope_kpis sk ON l.childScopeKpiId = sk.id
         JOIN kpis k ON sk.kpiId = k.id
         WHERE l.childType = 'scope' AND l.scopeKpiId IN (${ph})`,
        [...ids, ...ids]
      )
      for (const row of linkRows ?? []) {
        const sid = Number(row.scopeKpiId)
        if (!scopeSources.has(sid)) scopeSources.set(sid, [])
        scopeSources.get(sid)!.push(row)
      }
    }

    const result = krs.map((kr) => {
      if (kr.krType !== 'kpi_linked') {
        return { krId: kr.krId, krTitle: kr.krTitle, krType: kr.krType, krStatus: kr.krStatus, sourceType: null, kpiName: null, actual: null, target: null, sources: [] }
      }

      const links = kpiLinksMap.get(kr.krId)

      // Usar okr_kr_kpis si hay links; si no, caer en columnas legacy
      if (links && links.length > 0) {
        const allSources: any[] = []
        let primaryKpiName: string | null = null
        let primaryActual: number | null = null
        let primaryTarget: number | null = null
        let primarySourceType: string | null = null
        let primaryDirection: string | undefined
        let primaryType: string | undefined

        for (const lk of links) {
          if (lk.scopeKpiId) {
            if (!primaryKpiName) {
              primaryKpiName = lk.skKpiName; primaryActual = lk.skActual; primaryTarget = lk.skTarget
              primarySourceType = 'scope_kpi'; primaryDirection = lk.skKpiDirection; primaryType = lk.skKpiType
            }
            allSources.push(...(scopeSources.get(Number(lk.scopeKpiId)) ?? []))
          } else if (lk.collaboratorKpiId) {
            if (!primaryKpiName) {
              primaryKpiName = lk.ckKpiName; primaryActual = lk.ckActual; primaryTarget = lk.ckTarget
              primarySourceType = 'collaborator_kpi'; primaryDirection = lk.ckKpiDirection; primaryType = lk.ckKpiType
            }
            allSources.push({ sourceType: 'collaborator', sourceName: lk.ckCollaboratorName, actual: lk.ckActual, target: lk.ckTarget, variation: lk.ckVariation, kpiName: lk.ckKpiName, kpiDirection: lk.ckKpiDirection, kpiType: lk.ckKpiType, sourceStatus: null })
          }
        }
        return { krId: kr.krId, krTitle: kr.krTitle, krType: kr.krType, krStatus: kr.krStatus, sourceType: primarySourceType, kpiName: primaryKpiName, kpiDirection: primaryDirection, kpiType: primaryType, actual: primaryActual, target: primaryTarget, sources: allSources }
      }

      // Legacy fallback
      if (kr.scopeKpiId) {
        return { krId: kr.krId, krTitle: kr.krTitle, krType: kr.krType, krStatus: kr.krStatus, sourceType: 'scope_kpi', kpiName: kr.skKpiName, kpiDirection: kr.skKpiDirection, kpiType: kr.skKpiType, actual: kr.skActual, target: kr.skTarget, sources: scopeSources.get(Number(kr.scopeKpiId)) ?? [] }
      }
      if (kr.collaboratorKpiId) {
        return { krId: kr.krId, krTitle: kr.krTitle, krType: kr.krType, krStatus: kr.krStatus, sourceType: 'collaborator_kpi', kpiName: kr.ckKpiName, kpiDirection: kr.ckKpiDirection, kpiType: kr.ckKpiType, actual: kr.ckActual, target: kr.ckTarget, sources: [{ sourceType: 'collaborator', sourceName: kr.ckCollaboratorName, actual: kr.ckActual, target: kr.ckTarget, variation: kr.ckVariation, kpiName: kr.ckKpiName, kpiDirection: kr.ckKpiDirection, kpiType: kr.ckKpiType, sourceStatus: null }] }
      }
      return { krId: kr.krId, krTitle: kr.krTitle, krType: kr.krType, krStatus: kr.krStatus, sourceType: null, kpiName: null, actual: null, target: null, sources: [] }
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

export const getFullTree = async (_req: AuthRequest, res: Response) => {
  try {
    const tree = await okrService.getFullTree()
    res.json(tree)
  } catch (error) {
    console.error('[OKR] getFullTree:', error)
    res.status(500).json({ error: 'Error al obtener árbol completo de OKRs' })
  }
}
