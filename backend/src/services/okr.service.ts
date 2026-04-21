import { pool } from '../config/database'
import { OKRObjective, OKRKeyResult, OKRCheckIn } from '../types'

// ── Helpers ────────────────────────────────────────────────

/**
 * Calcula el progreso de un KR (0-100).
 * - simple:     (current - start) / (target - start) * 100
 * - kpi_linked: delega al actual/target del KPI vinculado
 */
export const calcKrProgress = (kr: OKRKeyResult & { linkedKpis?: { actual: number | null; target: number | null }[] }): number => {
  if (kr.krType === 'kpi_linked') {
    const links = kr.linkedKpis
    if (Array.isArray(links) && links.length > 0) {
      const progresses = links.map((l) => {
        const a = Number(l.actual ?? 0)
        const t = Number(l.target ?? 0)
        return t === 0 ? 0 : Math.min(100, Math.max(0, (a / t) * 100))
      })
      return Math.round(progresses.reduce((s, p) => s + p, 0) / progresses.length)
    }
    const actual = Number(kr.kpiActual ?? 0)
    const target = Number(kr.kpiTarget ?? 0)
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

  // Cargar KPIs múltiples para KRs kpi_linked
  const krIds = krs.map((r) => r.id)
  const [kpiLinksRows] = await pool.query<any[]>(
    `SELECT okk.krId,
       COALESCE(ck.actual, sk.actual) AS actual,
       COALESCE(ck.target, sk.target) AS target
     FROM okr_kr_kpis okk
     LEFT JOIN collaborator_kpis ck ON okk.collaboratorKpiId = ck.id
     LEFT JOIN scope_kpis sk ON okk.scopeKpiId = sk.id
     WHERE okk.krId IN (${krIds.map(() => '?').join(',')})`,
    krIds
  )
  const linkedByKr = new Map<number, { actual: number | null; target: number | null }[]>()
  for (const row of Array.isArray(kpiLinksRows) ? kpiLinksRows : []) {
    const list = linkedByKr.get(row.krId) ?? []
    list.push({ actual: row.actual, target: row.target })
    linkedByKr.set(row.krId, list)
  }

  let totalWeight = 0
  let weightedSum = 0

  for (const row of krs) {
    const kr = {
      ...row,
      kpiActual: row.kpiActual ?? row.scopeActual,
      kpiTarget: row.kpiTarget ?? row.scopeTarget,
      linkedKpis: linkedByKr.get(row.id),
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

  const objectives = Array.isArray(rows) ? rows : []
  if (objectives.length === 0) return []

  // Batch-fetch all KRs in a single query — no N+1
  const ids = objectives.map((o) => o.id)
  const placeholders = ids.map(() => '?').join(',')
  const [krRows] = await pool.query<any[]>(
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
     WHERE kr.objectiveId IN (${placeholders})
     ORDER BY kr.objectiveId, kr.sortOrder ASC, kr.id ASC`,
    ids
  )

  const krsByObjective = new Map<number, OKRKeyResult[]>()
  for (const row of Array.isArray(krRows) ? krRows : []) {
    const kr: OKRKeyResult = {
      ...row,
      kpiActual: row.kpiActual ?? row.scopeActual ?? null,
      kpiTarget: row.kpiTarget ?? row.scopeTarget ?? null,
      progressPercent: calcKrProgress({
        ...row,
        kpiActual: row.kpiActual ?? row.scopeActual,
        kpiTarget: row.kpiTarget ?? row.scopeTarget,
      }),
    }
    const list = krsByObjective.get(row.objectiveId) ?? []
    list.push(kr)
    krsByObjective.set(row.objectiveId, list)
  }

  return objectives.map((o) => ({ ...o, keyResults: krsByObjective.get(o.id) ?? [] }))
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

  const krs = Array.isArray(rows) ? rows : []
  if (krs.length === 0) return []

  const krIds = krs.map((r) => r.id)
  const [kpiLinksRows] = await pool.query<any[]>(
    `SELECT okk.id, okk.krId, okk.collaboratorKpiId, okk.scopeKpiId,
       COALESCE(ck.actual, sk.actual) AS actual,
       COALESCE(ck.target, sk.target) AS target,
       COALESCE(kck.name, ksk.name) AS kpiName,
       COALESCE(col.name, sc.name) AS sourceName
     FROM okr_kr_kpis okk
     LEFT JOIN collaborator_kpis ck ON okk.collaboratorKpiId = ck.id
     LEFT JOIN scope_kpis sk ON okk.scopeKpiId = sk.id
     LEFT JOIN kpis kck ON ck.kpiId = kck.id
     LEFT JOIN kpis ksk ON sk.kpiId = ksk.id
     LEFT JOIN collaborators col ON ck.collaboratorId = col.id
     LEFT JOIN org_scopes sc ON sk.orgScopeId = sc.id
     WHERE okk.krId IN (${krIds.map(() => '?').join(',')})`,
    krIds
  )

  const linkedByKr = new Map<number, any[]>()
  for (const row of Array.isArray(kpiLinksRows) ? kpiLinksRows : []) {
    const list = linkedByKr.get(row.krId) ?? []
    list.push(row)
    linkedByKr.set(row.krId, list)
  }

  return krs.map((row) => {
    const linkedKpis = linkedByKr.get(row.id) ?? []
    return {
      ...row,
      kpiActual: row.kpiActual ?? row.scopeActual ?? null,
      kpiTarget: row.kpiTarget ?? row.scopeTarget ?? null,
      linkedKpis,
      progressPercent: calcKrProgress({
        ...row,
        kpiActual: row.kpiActual ?? row.scopeActual,
        kpiTarget: row.kpiTarget ?? row.scopeTarget,
        linkedKpis,
      }),
    }
  })
}

// Acepta tanto el formato del frontend { type, id } como el legacy { collaboratorKpiId, scopeKpiId }
type KpiLink =
  | { type: 'collaborator' | 'scope'; id: number }
  | { collaboratorKpiId?: number | null; scopeKpiId?: number | null }

const normalizeKpiLink = (link: KpiLink): { collaboratorKpiId: number | null; scopeKpiId: number | null } => {
  if ('type' in link) {
    return {
      collaboratorKpiId: link.type === 'collaborator' ? link.id : null,
      scopeKpiId: link.type === 'scope' ? link.id : null,
    }
  }
  return { collaboratorKpiId: link.collaboratorKpiId ?? null, scopeKpiId: link.scopeKpiId ?? null }
}

const syncKpiLinks = async (krId: number, kpiLinks: KpiLink[]): Promise<void> => {
  await pool.query(`DELETE FROM okr_kr_kpis WHERE krId = ?`, [krId])
  if (kpiLinks.length === 0) return
  for (const link of kpiLinks) {
    const { collaboratorKpiId, scopeKpiId } = normalizeKpiLink(link)
    await pool.query(
      `INSERT INTO okr_kr_kpis (krId, collaboratorKpiId, scopeKpiId) VALUES (?, ?, ?)`,
      [krId, collaboratorKpiId, scopeKpiId]
    )
  }
  // Mantener legacy columns apuntando al primero para compatibilidad con recalc legado
  const { collaboratorKpiId: firstCollab, scopeKpiId: firstScope } = normalizeKpiLink(kpiLinks[0])
  await pool.query(
    `UPDATE okr_key_results SET collaboratorKpiId = ?, scopeKpiId = ? WHERE id = ?`,
    [firstCollab, firstScope, krId]
  )
}

export const createKeyResult = async (
  data: Pick<OKRKeyResult, 'objectiveId' | 'title' | 'description' | 'krType' | 'startValue' | 'targetValue' | 'currentValue' | 'unit' | 'collaboratorKpiId' | 'scopeKpiId' | 'weight' | 'ownerId' | 'sortOrder'> & { kpiLinks?: KpiLink[] }
): Promise<number> => {
  const [result] = await pool.query<any>(
    `INSERT INTO okr_key_results
       (objectiveId, title, krType, startValue, targetValue, currentValue, unit,
        collaboratorKpiId, scopeKpiId, weight, ownerId, sortOrder)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.objectiveId, data.title,
      data.krType ?? 'simple',
      data.startValue ?? null, data.targetValue ?? null, data.currentValue ?? null,
      data.unit ?? null,
      data.collaboratorKpiId ?? null, data.scopeKpiId ?? null,
      data.weight ?? 1, data.ownerId ?? null, data.sortOrder ?? 0,
    ]
  )
  const krId = result.insertId
  const links = data.kpiLinks ?? (
    data.collaboratorKpiId ? [{ collaboratorKpiId: data.collaboratorKpiId }] :
    data.scopeKpiId ? [{ scopeKpiId: data.scopeKpiId }] : []
  )
  if (links.length > 0) await syncKpiLinks(krId, links)
  await recalcObjectiveProgress(data.objectiveId)
  return krId
}

export const updateKeyResult = async (
  id: number,
  data: Partial<Pick<OKRKeyResult, 'title' | 'krType' | 'currentValue' | 'targetValue' | 'startValue' | 'unit' | 'weight' | 'status' | 'sortOrder' | 'ownerId' | 'collaboratorKpiId' | 'scopeKpiId'>> & { kpiLinks?: KpiLink[] }
): Promise<void> => {
  const fields: string[] = []
  const params: any[] = []

  if (data.title !== undefined) { fields.push('title = ?'); params.push(data.title) }
  if (data.krType !== undefined) { fields.push('krType = ?'); params.push(data.krType) }
  if (data.currentValue !== undefined) { fields.push('currentValue = ?'); params.push(data.currentValue) }
  if (data.targetValue !== undefined) { fields.push('targetValue = ?'); params.push(data.targetValue) }
  if (data.startValue !== undefined) { fields.push('startValue = ?'); params.push(data.startValue) }
  if (data.unit !== undefined) { fields.push('unit = ?'); params.push(data.unit) }
  if (data.weight !== undefined) { fields.push('weight = ?'); params.push(data.weight) }
  if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status) }
  if (data.sortOrder !== undefined) { fields.push('sortOrder = ?'); params.push(data.sortOrder) }
  if (data.ownerId !== undefined) { fields.push('ownerId = ?'); params.push(data.ownerId) }
  if (data.collaboratorKpiId !== undefined && !data.kpiLinks) { fields.push('collaboratorKpiId = ?'); params.push(data.collaboratorKpiId) }
  if (data.scopeKpiId !== undefined && !data.kpiLinks) { fields.push('scopeKpiId = ?'); params.push(data.scopeKpiId) }

  if (fields.length > 0) {
    params.push(id)
    await pool.query(`UPDATE okr_key_results SET ${fields.join(', ')} WHERE id = ?`, params)
  }

  if (data.kpiLinks !== undefined) {
    await syncKpiLinks(id, data.kpiLinks)
  }

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

// ── Auto-propagación desde datos reales ────────────────────
// Cuando un collaborator_kpi o scope_kpi se actualiza, estos helpers
// propagan el cambio hacia arriba a todos los OKR vinculados.

/**
 * Recalcula el progreso de todos los objetivos que tienen algún KR
 * vinculado a un collaborator_kpi específico.
 */
export const recalcOKRsLinkedToCollaboratorKpi = async (collaboratorKpiId: number): Promise<void> => {
  const [rows] = await pool.query<any[]>(
    `SELECT DISTINCT objectiveId FROM okr_key_results WHERE collaboratorKpiId = ?`,
    [collaboratorKpiId]
  )
  if (!Array.isArray(rows) || rows.length === 0) return
  for (const row of rows) {
    await recalcObjectiveProgress(row.objectiveId)
    await autoScoreKRStatuses(row.objectiveId)
  }
}

/**
 * Recalcula el progreso de todos los objetivos que tienen algún KR
 * vinculado a un scope_kpi específico.
 */
export const recalcOKRsLinkedToScopeKpi = async (scopeKpiId: number): Promise<void> => {
  const [rows] = await pool.query<any[]>(
    `SELECT DISTINCT objectiveId FROM okr_key_results WHERE scopeKpiId = ?`,
    [scopeKpiId]
  )
  if (!Array.isArray(rows) || rows.length === 0) return
  for (const row of rows) {
    await recalcObjectiveProgress(row.objectiveId)
    await autoScoreKRStatuses(row.objectiveId)
  }
}

/**
 * Actualiza automáticamente el status de cada KR de un objetivo
 * comparando el progreso actual contra el tiempo transcurrido del período.
 *
 * Regla:
 *   - completed  → si progressPercent >= 100
 *   - on_track   → si progress >= timeElapsed - 5%
 *   - at_risk    → si progress >= timeElapsed - 20%
 *   - behind     → si progress <  timeElapsed - 20%
 *   - not_started permanece solo si progress == 0 y aún no inició el período
 */
export const autoScoreKRStatuses = async (objectiveId: number): Promise<void> => {
  // Obtener período del objetivo
  const [objRows] = await pool.query<any[]>(
    `SELECT o.periodId, p.startDate, p.endDate
     FROM okr_objectives o
     JOIN periods p ON p.id = o.periodId
     WHERE o.id = ?`,
    [objectiveId]
  )
  if (!Array.isArray(objRows) || objRows.length === 0) return

  const { startDate, endDate } = objRows[0]
  const now = Date.now()
  const start = new Date(startDate).getTime()
  const end = new Date(endDate).getTime()

  // Porcentaje de tiempo transcurrido (0-100), clampado
  const timeElapsed = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100))

  // Traer KRs del objetivo con su progreso actual
  const [krs] = await pool.query<any[]>(
    `SELECT kr.id, kr.krType, kr.status,
            kr.startValue, kr.targetValue, kr.currentValue, kr.weight,
            ck.actual AS kpiActual, ck.target AS kpiTarget,
            sk.actual AS scopeActual, sk.target AS scopeTarget
     FROM okr_key_results kr
     LEFT JOIN collaborator_kpis ck ON kr.collaboratorKpiId = ck.id
     LEFT JOIN scope_kpis sk ON kr.scopeKpiId = sk.id
     WHERE kr.objectiveId = ?`,
    [objectiveId]
  )
  if (!Array.isArray(krs) || krs.length === 0) return

  for (const row of krs) {
    // No tocar KRs marcados manualmente como completados
    if (row.status === 'completed') continue

    const progress = calcKrProgress({
      ...row,
      kpiActual: row.kpiActual ?? row.scopeActual,
      kpiTarget: row.kpiTarget ?? row.scopeTarget,
    })

    let newStatus: string
    if (progress >= 100) {
      newStatus = 'completed'
    } else if (progress >= timeElapsed - 5) {
      newStatus = 'on_track'
    } else if (progress >= timeElapsed - 20) {
      newStatus = 'at_risk'
    } else if (progress === 0 && timeElapsed < 5) {
      newStatus = 'not_started'
    } else {
      newStatus = 'behind'
    }

    if (newStatus !== row.status) {
      await pool.query(
        `UPDATE okr_key_results SET status = ? WHERE id = ?`,
        [newStatus, row.id]
      )
    }
  }
}

// ── Full tree for visualization ────────────────────────────

export const getFullTree = async (): Promise<any[]> => {
  // 1. All objectives
  const [objRows] = await pool.query<any[]>(
    `SELECT o.id, o.title, o.description, o.status, o.progress, o.orgScopeId, o.parentId,
            c.name AS ownerName, s.name AS orgScopeName, p.name AS periodName, p.id AS periodId
     FROM okr_objectives o
     LEFT JOIN collaborators c ON o.ownerId = c.id
     LEFT JOIN org_scopes s ON o.orgScopeId = s.id
     LEFT JOIN periods p ON o.periodId = p.id
     WHERE o.status IN ('active','draft')
     ORDER BY s.name ASC, o.title ASC`
  )
  if (!Array.isArray(objRows) || objRows.length === 0) return []

  // 2. All KRs for those objectives
  const objIds = objRows.map((o) => o.id)
  const placeholders = objIds.map(() => '?').join(',')
  const [krRows] = await pool.query<any[]>(
    `SELECT kr.id, kr.objectiveId, kr.title, kr.krType, kr.status,
            kr.startValue, kr.targetValue, kr.currentValue, kr.unit, kr.weight, kr.progressPercent,
            c.name AS ownerName,
            ck.actual AS kpiActual, ck.target AS kpiTarget,
            sk.actual AS scopeActual, sk.target AS scopeTarget
     FROM okr_key_results kr
     LEFT JOIN collaborators c ON kr.ownerId = c.id
     LEFT JOIN collaborator_kpis ck ON kr.collaboratorKpiId = ck.id
     LEFT JOIN scope_kpis sk ON kr.scopeKpiId = sk.id
     WHERE kr.objectiveId IN (${placeholders})
     ORDER BY kr.objectiveId, kr.sortOrder ASC, kr.id ASC`,
    objIds
  )

  // 3. KPI links per KR
  const krIds = (Array.isArray(krRows) ? krRows : []).map((r) => r.id)
  let kpiLinksByKr = new Map<number, any[]>()
  if (krIds.length > 0) {
    const krPlaceholders = krIds.map(() => '?').join(',')
    const [linkRows] = await pool.query<any[]>(
      `SELECT okk.krId,
              COALESCE(kck.name, ksk.name) AS kpiName,
              COALESCE(ck.actual, sk.actual) AS actual,
              COALESCE(ck.target, sk.target) AS target,
              CASE WHEN okk.collaboratorKpiId IS NOT NULL THEN 'collaborator' ELSE 'scope' END AS type,
              COALESCE(col.name, sc.name) AS sourceName
       FROM okr_kr_kpis okk
       LEFT JOIN collaborator_kpis ck ON okk.collaboratorKpiId = ck.id
       LEFT JOIN scope_kpis sk ON okk.scopeKpiId = sk.id
       LEFT JOIN kpis kck ON ck.kpiId = kck.id
       LEFT JOIN kpis ksk ON sk.kpiId = ksk.id
       LEFT JOIN collaborators col ON ck.collaboratorId = col.id
       LEFT JOIN org_scopes sc ON sk.orgScopeId = sc.id
       WHERE okk.krId IN (${krPlaceholders})`,
      krIds
    )
    for (const row of Array.isArray(linkRows) ? linkRows : []) {
      const list = kpiLinksByKr.get(row.krId) ?? []
      list.push({ kpiName: row.kpiName, actual: row.actual, target: row.target, type: row.type, sourceName: row.sourceName })
      kpiLinksByKr.set(row.krId, list)
    }
  }

  // 4. Assemble KRs with progress
  const krsByObjective = new Map<number, any[]>()
  for (const kr of Array.isArray(krRows) ? krRows : []) {
    const linkedKpis = kpiLinksByKr.get(kr.id) ?? []
    const progress = Math.round(calcKrProgress({
      ...kr,
      kpiActual: kr.kpiActual ?? kr.scopeActual,
      kpiTarget: kr.kpiTarget ?? kr.scopeTarget,
      linkedKpis,
    }))
    const list = krsByObjective.get(kr.objectiveId) ?? []
    list.push({ ...kr, progressPercent: progress, linkedKpis })
    krsByObjective.set(kr.objectiveId, list)
  }

  // 5. Group objectives by scope
  const scopeMap = new Map<string, any>()
  for (const obj of objRows) {
    const key = obj.orgScopeId ? String(obj.orgScopeId) : '__sin_area__'
    const label = obj.orgScopeName ?? 'Sin área'
    if (!scopeMap.has(key)) scopeMap.set(key, { scopeId: obj.orgScopeId, scopeName: label, objectives: [] })
    scopeMap.get(key)!.objectives.push({
      id: obj.id,
      title: obj.title,
      description: obj.description,
      status: obj.status,
      progress: obj.progress ?? 0,
      ownerName: obj.ownerName,
      periodName: obj.periodName,
      parentId: obj.parentId,
      keyResults: krsByObjective.get(obj.id) ?? [],
    })
  }

  return Array.from(scopeMap.values())
}
