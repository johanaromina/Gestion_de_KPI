import { pool } from '../config/database.js'

interface CopyPeriodOptions {
  name: string
  startDate: string
  endDate: string
  copyCollaboratorKpis: boolean
  copyScopeKpis: boolean
  copyOkrs: boolean
}

export const copyPeriod = async (sourcePeriodId: number, opts: CopyPeriodOptions) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // 1. Crear el nuevo período
    const [periodResult] = await conn.query<any>(
      `INSERT INTO periods (name, startDate, endDate, status) VALUES (?, ?, ?, 'open')`,
      [opts.name, opts.startDate, opts.endDate]
    )
    const newPeriodId = periodResult.insertId

    const copied = { collaboratorKpis: 0, scopeKpis: 0, objectives: 0, keyResults: 0 }
    const collabKpiMap = new Map<number, number>()
    const scopeKpiMap = new Map<number, number>()

    // 2. Copiar KPIs individuales
    if (opts.copyCollaboratorKpis) {
      const [rows] = await conn.query<any[]>(
        `SELECT * FROM collaborator_kpis WHERE periodId = ? AND subPeriodId IS NULL`,
        [sourcePeriodId]
      )
      for (const ck of Array.isArray(rows) ? rows : []) {
        const [res] = await conn.query<any>(
          `INSERT INTO collaborator_kpis
             (collaboratorId, kpiId, periodId, subPeriodId, target, actual,
              variation, weightedResult, status, inputMode, curationStatus)
           VALUES (?, ?, ?, NULL, ?, 0, 0, 0, 'draft', ?, 'pending')`,
          [ck.collaboratorId, ck.kpiId, newPeriodId, ck.target, ck.inputMode || 'manual']
        )
        collabKpiMap.set(ck.id, res.insertId)
        copied.collaboratorKpis++
      }
    }

    // 3. Copiar KPIs grupales
    if (opts.copyScopeKpis) {
      const [rows] = await conn.query<any[]>(
        `SELECT * FROM scope_kpis WHERE periodId = ? AND subPeriodId IS NULL`,
        [sourcePeriodId]
      )
      for (const sk of Array.isArray(rows) ? rows : []) {
        const [res] = await conn.query<any>(
          `INSERT INTO scope_kpis
             (name, description, kpiId, orgScopeId, periodId, subPeriodId, ownerLevel,
              sourceMode, mixedConfig, target, weight, actual, directActual, aggregatedActual,
              status, inputMode, curationStatus)
           VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 0, NULL, NULL, 'draft', ?, 'pending')`,
          [sk.name, sk.description, sk.kpiId, sk.orgScopeId, newPeriodId, sk.ownerLevel,
           sk.sourceMode, sk.mixedConfig, sk.target, sk.weight, sk.inputMode || 'manual']
        )
        scopeKpiMap.set(sk.id, res.insertId)
        copied.scopeKpis++
      }
    }

    // 4. Copiar OKRs
    if (opts.copyOkrs) {
      const [objRows] = await conn.query<any[]>(
        `SELECT * FROM okr_objectives WHERE periodId = ? ORDER BY id ASC`,
        [sourcePeriodId]
      )
      const objMap = new Map<number, number>()

      // Primera pasada: crear objetivos sin parentId
      for (const obj of Array.isArray(objRows) ? objRows : []) {
        const [res] = await conn.query<any>(
          `INSERT INTO okr_objectives
             (title, description, orgScopeId, periodId, ownerId, status, progress, parentId)
           VALUES (?, ?, ?, ?, ?, 'draft', 0, NULL)`,
          [obj.title, obj.description, obj.orgScopeId, newPeriodId, obj.ownerId]
        )
        objMap.set(obj.id, res.insertId)
        copied.objectives++
      }

      // Segunda pasada: asignar parentId mapeado
      for (const obj of Array.isArray(objRows) ? objRows : []) {
        if (obj.parentId && objMap.has(obj.parentId)) {
          await conn.query(
            `UPDATE okr_objectives SET parentId = ? WHERE id = ?`,
            [objMap.get(obj.parentId), objMap.get(obj.id)]
          )
        }
      }

      // Copiar KRs
      for (const obj of Array.isArray(objRows) ? objRows : []) {
        const newObjId = objMap.get(obj.id)
        if (!newObjId) continue

        const [krRows] = await conn.query<any[]>(
          `SELECT * FROM okr_key_results WHERE objectiveId = ? ORDER BY sortOrder ASC, id ASC`,
          [obj.id]
        )
        const krMap = new Map<number, number>()

        for (const kr of Array.isArray(krRows) ? krRows : []) {
          const newCollabKpiId = kr.collaboratorKpiId
            ? (collabKpiMap.get(kr.collaboratorKpiId) ?? kr.collaboratorKpiId)
            : null
          const newScopeKpiId = kr.scopeKpiId
            ? (scopeKpiMap.get(kr.scopeKpiId) ?? kr.scopeKpiId)
            : null

          const [res] = await conn.query<any>(
            `INSERT INTO okr_key_results
               (objectiveId, title, description, krType, startValue, targetValue, currentValue,
                unit, collaboratorKpiId, scopeKpiId, weight, ownerId, sortOrder, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started')`,
            [newObjId, kr.title, kr.description, kr.krType,
             kr.startValue, kr.targetValue, kr.startValue,
             kr.unit, newCollabKpiId, newScopeKpiId,
             kr.weight, kr.ownerId, kr.sortOrder]
          )
          krMap.set(kr.id, res.insertId)
          copied.keyResults++
        }

        // Copiar links okr_kr_kpis
        for (const [oldKrId, newKrId] of krMap.entries()) {
          try {
            const [linkRows] = await conn.query<any[]>(
              `SELECT * FROM okr_kr_kpis WHERE krId = ?`,
              [oldKrId]
            )
            for (const link of Array.isArray(linkRows) ? linkRows : []) {
              const newLinkCollabId = link.collaboratorKpiId
                ? (collabKpiMap.get(link.collaboratorKpiId) ?? link.collaboratorKpiId)
                : null
              const newLinkScopeId = link.scopeKpiId
                ? (scopeKpiMap.get(link.scopeKpiId) ?? link.scopeKpiId)
                : null
              await conn.query(
                `INSERT INTO okr_kr_kpis (krId, collaboratorKpiId, scopeKpiId, weight) VALUES (?, ?, ?, ?)`,
                [newKrId, newLinkCollabId, newLinkScopeId, link.weight]
              )
            }
          } catch {
            // okr_kr_kpis podría no existir en instancias sin migración
          }
        }
      }
    }

    await conn.commit()
    return { newPeriodId, copied }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}
