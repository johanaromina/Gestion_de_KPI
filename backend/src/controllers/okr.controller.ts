import { Response } from 'express'
import { AuthRequest } from '../middleware/auth.middleware'
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
