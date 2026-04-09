import { pool } from '../config/database'
import { OKRObjective, OKRKeyResult, OKRCheckIn } from '../types'

// ── Helpers ────────────────────────────────────────────────

/**
 * Calcula el progreso de un KR (0-100).
 * - simple:     (current - start) / (target - start) * 100
 * - kpi_linked: delega al actual/target del KPI vinculado
 */
export const calcKrProgress = (kr: OKRKeyResult): number => {
  if (kr.krType === 'kpi_linked') {
    const actual = kr.kpiActual ?? 0
    const target = kr.kpiTarget ?? 0
    if (target === 0) return 0
    return Math.min(100, Math.max(0, (actual / target) * 100))
  }
  const start = kr.startValue ?? 0
  const target = kr.targetValue ?? 0
  const current = kr.currentValue ?? start
  if (target === start) return current >= target ? 100 : 0
  return Math.min(100, Math.max(0, ((current - start) / (target - start)) * 100))
}

/**
 * Recalcula y persiste el progreso del objetivo
 * como promedio ponderado de sus KRs.
 */
export const recalcObjectiveProgress = async (objectiveId: number): Promise<void> => {
  const [krs] = await pool.query<any[]>(
    `SELECT
       kr.id, kr.krType, kr.startValue, kr.targetValue, kr.currentValue, kr.weight,
       ck.actual AS kpiActual, ck.target AS kpiTarget,
       sk.actual AS scopeActual, sk.target AS scopeTarget
     FROM okr_key_results kr
     LEFT JOIN collaborator_kpis ck ON kr.collaboratorKpiId = ck.id
     LEFT JOIN scope_kpis sk ON kr.scopeKpiId = sk.id
     WHERE kr.objectiveId = ?`,
    [objectiveId]
  )

  if (!Array.isArray(krs) || krs.length === 0) {
    await pool.query(`UPDATE okr_objectives SET progress = 0 WHERE id = ?`, [objectiveId])
    return
  }

  let totalWeight = 0
  let weightedSum = 0

  for (const row of krs) {
    const kr: OKRKeyResult = {
      ...row,
      kpiActual: row.kpiActual ?? row.scopeActual,
      kpiTarget: row.kpiTarget ?? row.scopeTarget,
    }
    const progress = calcKrProgress(kr)
    const w = Number(row.weight) || 1
    weightedSum += progress * w
    totalWeight += w
  }

  const progress = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0
  await pool.query(`UPDATE okr_objectives SET progress = ? WHERE id = ?`, [progress, objectiveId])
}

// ── Objectives ─────────────────────────────────────────────

export const listObjectives = async (filters: {
  periodId?: number
  orgScopeId?: number
  ownerId?: number
  status?: string
  parentId?: number | null
}): Promise<OKRObjective[]> => {
  const conditions: string[] = []
  const params: any[] = []

  if (filters.periodId) {
    conditions.push('o.periodId = ?')
    params.push(filters.periodId)
  }
  if (filters.orgScopeId) {
    conditions.push('o.orgScopeId = ?')
    params.push(filters.orgScopeId)
  }
  if (filters.ownerId) {
    conditions.push('o.ownerId = ?')
    params.push(filters.ownerId)
  }
  if (filters.status) {
    conditions.push('o.status = ?')
    params.push(filters.status)
  }
  if (filters.parentId === null) {
    conditions.push('o.parentId IS NULL')
  } else if (filters.parentId !== undefined) {
    conditions.push('o.parentId = ?')
    params.push(filters.parentId)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const [rows] = await pool.query<any[]>(
    `SELECT
       o.*,
       c.name AS ownerName,
       s.name AS orgScopeName,
       p.name AS periodName
     FROM okr_objectives o
     LEFT JOIN collaborators c ON o.ownerId = c.id
     LEFT JOIN org_scopes s ON o.orgScopeId = s.id
     LEFT JOIN periods p ON o.periodId = p.id
     ${where}
     ORDER BY o.createdAt DESC`,
    params
  )

  return Array.isArray(rows) ? rows : []
}

export const getObjectiveById = async (id: number): Promise<OKRObjective | null> => {
  const [rows] = await pool.query<any[]>(
    `SELECT
       o.*,
       c.name AS ownerName,
       s.name AS orgScopeName,
       p.name AS periodName
     FROM okr_objectives o
     LEFT JOIN collaborators c ON o.ownerId = c.id
     LEFT JOIN org_scopes s ON o.orgScopeId = s.id
     LEFT JOIN periods p ON o.periodId = p.id
     WHERE o.id = ?`,
    [id]
  )
  if (!Array.isArray(rows) || rows.length === 0) return null

  const objective = rows[0] as OKRObjective
  objective.keyResults = await listKeyResults(id)
  return objective
}

export const createObjective = async (
  data: Pick<OKRObjective, 'title' | 'description' | 'parentId' | 'orgScopeId' | 'periodId' | 'ownerId' | 'status'>
): Promise<number> => {
  const [result] = await pool.query<any>(
    `INSERT INTO okr_objectives (title, description, parentId, orgScopeId, periodId, ownerId, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.title, data.description ?? null, data.parentId ?? null, data.orgScopeId ?? null, data.periodId, data.ownerId, data.status ?? 'active']
  )
  return result.insertId
}

export const updateObjective = async (
  id: number,
  data: Partial<Pick<OKRObjective, 'title' | 'description' | 'parentId' | 'orgScopeId' | 'status'>>
): Promise<void> => {
  const fields: string[] = []
  const params: any[] = []

  if (data.title !== undefined) { fields.push('title = ?'); params.push(data.title) }
  if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description) }
  if (data.parentId !== undefined) { fields.push('parentId = ?'); params.push(data.parentId) }
  if (data.orgScopeId !== undefined) { fields.push('orgScopeId = ?'); params.push(data.orgScopeId) }
  if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status) }

  if (fields.length === 0) return
  params.push(id)
  await pool.query(`UPDATE okr_objectives SET ${fields.join(', ')} WHERE id = ?`, params)
}

export const deleteObjective = async (id: number): Promise<void> => {
  await pool.query(`DELETE FROM okr_objectives WHERE id = ?`, [id])
}

// ── Key Results ────────────────────────────────────────────

export const listKeyResults = async (objectiveId: number): Promise<OKRKeyResult[]> => {
  const [rows] = await pool.query<any[]>(
    `SELECT
       kr.*,
       c.name AS ownerName,
       k.name AS kpiName,
       ck.actual AS kpiActual,
       ck.target AS kpiTarget,
       sk.actual AS scopeActual,
       sk.target AS scopeTarget
     FROM okr_key_results kr
     LEFT JOIN collaborators c ON kr.ownerId = c.id
     LEFT JOIN collaborator_kpis ck ON kr.collaboratorKpiId = ck.id
     LEFT JOIN scope_kpis sk ON kr.scopeKpiId = sk.id
     LEFT JOIN kpis k ON COALESCE(ck.kpiId, sk.kpiId) = k.id
     WHERE kr.objectiveId = ?
     ORDER BY kr.sortOrder ASC, kr.id ASC`,
    [objectiveId]
  )

  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    kpiActual: row.kpiActual ?? row.scopeActual ?? null,
    kpiTarget: row.kpiTarget ?? row.scopeTarget ?? null,
    progressPercent: calcKrProgress({
      ...row,
      kpiActual: row.kpiActual ?? row.scopeActual,
      kpiTarget: row.kpiTarget ?? row.scopeTarget,
    }),
  }))
}

export const createKeyResult = async (
  data: Pick<OKRKeyResult, 'objectiveId' | 'title' | 'description' | 'krType' | 'startValue' | 'targetValue' | 'currentValue' | 'unit' | 'collaboratorKpiId' | 'scopeKpiId' | 'weight' | 'ownerId' | 'sortOrder'>
): Promise<number> => {
  const [result] = await pool.query<any>(
    `INSERT INTO okr_key_results
       (objectiveId, title, description, krType, startValue, targetValue, currentValue, unit,
        collaboratorKpiId, scopeKpiId, weight, ownerId, sortOrder)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.objectiveId, data.title, data.description ?? null,
      data.krType ?? 'simple',
      data.startValue ?? null, data.targetValue ?? null, data.currentValue ?? null,
      data.unit ?? null,
      data.collaboratorKpiId ?? null, data.scopeKpiId ?? null,
      data.weight ?? 1, data.ownerId ?? null, data.sortOrder ?? 0,
    ]
  )
  await recalcObjectiveProgress(data.objectiveId)
  return result.insertId
}

export const updateKeyResult = async (
  id: number,
  data: Partial<Pick<OKRKeyResult, 'title' | 'description' | 'currentValue' | 'targetValue' | 'startValue' | 'unit' | 'weight' | 'status' | 'sortOrder'>>
): Promise<void> => {
  const fields: string[] = []
  const params: any[] = []

  if (data.title !== undefined) { fields.push('title = ?'); params.push(data.title) }
  if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description) }
  if (data.currentValue !== undefined) { fields.push('currentValue = ?'); params.push(data.currentValue) }
  if (data.targetValue !== undefined) { fields.push('targetValue = ?'); params.push(data.targetValue) }
  if (data.startValue !== undefined) { fields.push('startValue = ?'); params.push(data.startValue) }
  if (data.unit !== undefined) { fields.push('unit = ?'); params.push(data.unit) }
  if (data.weight !== undefined) { fields.push('weight = ?'); params.push(data.weight) }
  if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status) }
  if (data.sortOrder !== undefined) { fields.push('sortOrder = ?'); params.push(data.sortOrder) }

  if (fields.length === 0) return
  params.push(id)
  await pool.query(`UPDATE okr_key_results SET ${fields.join(', ')} WHERE id = ?`, params)

  // Recalcular progreso del objetivo padre
  const [rows] = await pool.query<any[]>(`SELECT objectiveId FROM okr_key_results WHERE id = ?`, [id])
  if (Array.isArray(rows) && rows[0]) {
    await recalcObjectiveProgress(rows[0].objectiveId)
  }
}

export const deleteKeyResult = async (id: number): Promise<void> => {
  const [rows] = await pool.query<any[]>(`SELECT objectiveId FROM okr_key_results WHERE id = ?`, [id])
  await pool.query(`DELETE FROM okr_key_results WHERE id = ?`, [id])
  if (Array.isArray(rows) && rows[0]) {
    await recalcObjectiveProgress(rows[0].objectiveId)
  }
}

// ── Check-ins ──────────────────────────────────────────────

export const createCheckIn = async (data: {
  keyResultId: number
  value: number
  note?: string | null
  authorId: number
}): Promise<number> => {
  const [result] = await pool.query<any>(
    `INSERT INTO okr_check_ins (keyResultId, value, note, authorId) VALUES (?, ?, ?, ?)`,
    [data.keyResultId, data.value, data.note ?? null, data.authorId]
  )

  // Actualizar currentValue del KR con el último check-in
  await pool.query(
    `UPDATE okr_key_results SET currentValue = ? WHERE id = ? AND krType = 'simple'`,
    [data.value, data.keyResultId]
  )

  const [rows] = await pool.query<any[]>(`SELECT objectiveId FROM okr_key_results WHERE id = ?`, [data.keyResultId])
  if (Array.isArray(rows) && rows[0]) {
    await recalcObjectiveProgress(rows[0].objectiveId)
  }

  return result.insertId
}

export const listCheckIns = async (keyResultId: number): Promise<OKRCheckIn[]> => {
  const [rows] = await pool.query<any[]>(
    `SELECT ci.*, c.name AS authorName
     FROM okr_check_ins ci
     LEFT JOIN collaborators c ON ci.authorId = c.id
     WHERE ci.keyResultId = ?
     ORDER BY ci.createdAt DESC`,
    [keyResultId]
  )
  return Array.isArray(rows) ? rows : []
}

// ── Objective Tree links ───────────────────────────────────

export const linkToObjectiveTree = async (okrObjectiveId: number, objectiveTreeId: number): Promise<void> => {
  await pool.query(
    `INSERT IGNORE INTO okr_objective_tree_links (okrObjectiveId, objectiveTreeId) VALUES (?, ?)`,
    [okrObjectiveId, objectiveTreeId]
  )
}

export const unlinkFromObjectiveTree = async (okrObjectiveId: number, objectiveTreeId: number): Promise<void> => {
  await pool.query(
    `DELETE FROM okr_objective_tree_links WHERE okrObjectiveId = ? AND objectiveTreeId = ?`,
    [okrObjectiveId, objectiveTreeId]
  )
}

export const getTreeLinksForObjective = async (okrObjectiveId: number): Promise<{ objectiveTreeId: number; objectiveTreeName: string; level: string }[]> => {
  const [rows] = await pool.query<any[]>(
    `SELECT otl.objectiveTreeId, ot.name AS objectiveTreeName, ot.level
     FROM okr_objective_tree_links otl
     JOIN objective_trees ot ON ot.id = otl.objectiveTreeId
     WHERE otl.okrObjectiveId = ?`,
    [okrObjectiveId]
  )
  return Array.isArray(rows) ? rows : []
}

export const getOKRsForObjectiveTree = async (objectiveTreeId: number): Promise<{ id: number; title: string; progress: number; status: string; ownerName?: string }[]> => {
  const [rows] = await pool.query<any[]>(
    `SELECT o.id, o.title, o.progress, o.status, c.name AS ownerName
     FROM okr_objective_tree_links otl
     JOIN okr_objectives o ON o.id = otl.okrObjectiveId
     LEFT JOIN collaborators c ON c.id = o.ownerId
     WHERE otl.objectiveTreeId = ?
     ORDER BY o.status ASC, o.progress DESC`,
    [objectiveTreeId]
  )
  return Array.isArray(rows) ? rows : []
}

// ── Alignment tree ─────────────────────────────────────────

export const getAlignmentTree = async (periodId: number): Promise<OKRObjective[]> => {
  // Traer todos los objetivos del período con sus KRs
  const [rows] = await pool.query<any[]>(
    `SELECT
       o.*,
       c.name AS ownerName,
       s.name AS orgScopeName
     FROM okr_objectives o
     LEFT JOIN collaborators c ON o.ownerId = c.id
     LEFT JOIN org_scopes s ON o.orgScopeId = s.id
     WHERE o.periodId = ?
     ORDER BY o.parentId ASC, o.id ASC`,
    [periodId]
  )

  if (!Array.isArray(rows)) return []

  const map = new Map<number, OKRObjective>()
  const roots: OKRObjective[] = []

  for (const row of rows) {
    map.set(row.id, { ...row, children: [], keyResults: [] })
  }

  for (const obj of map.values()) {
    if (obj.parentId && map.has(obj.parentId)) {
      map.get(obj.parentId)!.children!.push(obj)
    } else {
      roots.push(obj)
    }
  }

  return roots
}
