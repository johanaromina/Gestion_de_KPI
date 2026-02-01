import { pool } from '../config/database'
import { sendMail } from './mailer'
import crypto from 'crypto'

const NOTIFY_WINDOW_DAYS = parseInt(process.env.NOTIFY_WINDOW_DAYS || '7')
const NOTIFY_ENABLED = (process.env.NOTIFY_ENABLED || 'true').toLowerCase() === 'true'
const NOTIFY_COOLDOWN_MIN = parseInt(process.env.NOTIFY_COOLDOWN_MIN || '180')

interface NotificationSummary {
  missingActual: { collaboratorId: number; collaboratorName: string; count: number }[]
  atRisk: { collaboratorId: number; collaboratorName: string; kpiName: string; variation: number }[]
  periodsExpiring: { periodId: number; periodName: string; endDate: string; daysLeft: number }[]
}

const hashValue = (value: string) => crypto.createHash('sha256').update(value).digest('hex')

export async function buildNotificationSummary(): Promise<NotificationSummary> {
  const [kpiRows] = await pool.query<any[]>(
    `SELECT ck.id as assignmentId, ck.collaboratorId, ck.kpiId, ck.target, ck.actual, ck.status,
            c.name as collaboratorName, k.name as kpiName, k.type as kpiType, k.direction as kpiDirection
     FROM collaborator_kpis ck
     JOIN collaborators c ON c.id = ck.collaboratorId
     JOIN kpis k ON k.id = ck.kpiId
     WHERE ck.status <> 'closed'`
  )

  const missingMap = new Map<number, { collaboratorId: number; collaboratorName: string; count: number }>()
  const atRisk: { collaboratorId: number; collaboratorName: string; kpiName: string; variation: number }[] = []

  for (const row of kpiRows || []) {
    const targetValue = Number(row.target) || 0
    const actualValue = row.actual !== null && row.actual !== undefined ? Number(row.actual) : null

    if (actualValue === null) {
      const existing = missingMap.get(row.collaboratorId)
      if (existing) {
        existing.count += 1
      } else {
        missingMap.set(row.collaboratorId, {
          collaboratorId: row.collaboratorId,
          collaboratorName: row.collaboratorName,
          count: 1,
        })
      }
      continue
    }

    if (targetValue <= 0) continue

    const direction = row.kpiDirection || row.kpiType || 'growth'
    const variation =
      direction === 'reduction'
        ? actualValue > 0
          ? (targetValue / actualValue) * 100
          : 0
        : (actualValue / targetValue) * 100

    if (variation < 80) {
      atRisk.push({
        collaboratorId: row.collaboratorId,
        collaboratorName: row.collaboratorName,
        kpiName: row.kpiName,
        variation,
      })
    }
  }

  const missingActual = Array.from(missingMap.values()).sort((a, b) => b.count - a.count)

  const [periodRows] = await pool.query<any[]>(
    `SELECT id, name, endDate, status
     FROM periods
     WHERE status IN ('open', 'in_review')`
  )

  const now = new Date()
  const periodsExpiring: NotificationSummary['periodsExpiring'] = []
  for (const period of periodRows || []) {
    const end = new Date(period.endDate)
    const diffMs = end.getTime() - now.getTime()
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    if (daysLeft >= 0 && daysLeft <= NOTIFY_WINDOW_DAYS) {
      periodsExpiring.push({
        periodId: period.id,
        periodName: period.name,
        endDate: period.endDate,
        daysLeft,
      })
    }
  }

  return {
    missingActual,
    atRisk: atRisk.sort((a, b) => a.variation - b.variation).slice(0, 10),
    periodsExpiring: periodsExpiring.sort((a, b) => a.daysLeft - b.daysLeft),
  }
}

async function getRecipients() {
  const [rows] = await pool.query<any[]>(
    `SELECT DISTINCT c.id, c.name, c.email
     FROM collaborators c
     LEFT JOIN collaborator_permissions cp ON cp.collaboratorId = c.id
     LEFT JOIN permissions p ON p.id = cp.permissionId
     WHERE c.status = 'active'
       AND c.email IS NOT NULL
       AND (
         c.hasSuperpowers = 1 OR p.code = 'config.manage'
       )`
  )

  return (rows || []).filter((r) => r.email)
}

async function upsertState(type: string, entityKey: string, stateHash: string, notified: boolean) {
  await pool.query(
    `INSERT INTO notification_states (type, entityKey, stateHash, lastNotifiedAt)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       stateHash = VALUES(stateHash),
       lastNotifiedAt = CASE WHEN VALUES(lastNotifiedAt) IS NOT NULL THEN VALUES(lastNotifiedAt) ELSE lastNotifiedAt END,
       updatedAt = NOW()`,
    [type, entityKey, stateHash, notified ? new Date() : null]
  )
}

async function getStateMap(type: string): Promise<Map<string, { stateHash: string; lastNotifiedAt: Date | null }>> {
  const [rows] = await pool.query<any[]>(
    `SELECT entityKey, stateHash, lastNotifiedAt FROM notification_states WHERE type = ?`,
    [type]
  )
  const map = new Map<string, { stateHash: string; lastNotifiedAt: Date | null }>()
  for (const row of rows || []) {
    map.set(row.entityKey, {
      stateHash: row.stateHash,
      lastNotifiedAt: row.lastNotifiedAt ? new Date(row.lastNotifiedAt) : null,
    })
  }
  return map
}

async function deleteMissingStates(type: string, activeKeys: Set<string>) {
  const [rows] = await pool.query<any[]>(
    `SELECT entityKey FROM notification_states WHERE type = ?`,
    [type]
  )
  const stale = (rows || []).filter((r) => !activeKeys.has(r.entityKey))
  for (const row of stale) {
    await pool.query('DELETE FROM notification_states WHERE type = ? AND entityKey = ?', [
      type,
      row.entityKey,
    ])
  }
}

export async function runNotifications() {
  if (!NOTIFY_ENABLED) return

  const summary = await buildNotificationSummary()
  const recipients = await getRecipients()

  if (!recipients.length) {
    return
  }

  const newEvents: string[] = []
  const now = Date.now()
  const cooldownMs = NOTIFY_COOLDOWN_MIN * 60 * 1000
  const isCoolingDown = (lastNotifiedAt: Date | null) =>
    lastNotifiedAt ? now - lastNotifiedAt.getTime() < cooldownMs : false

  const missingState = await getStateMap('missing_actual')
  const activeMissingKeys = new Set<string>()
  for (const item of summary.missingActual) {
    const key = `collab-${item.collaboratorId}`
    const state = hashValue(String(item.count))
    activeMissingKeys.add(key)
    const prev = missingState.get(key)
    const changed = prev?.stateHash !== state
    if (changed && !isCoolingDown(prev?.lastNotifiedAt || null)) {
      newEvents.push(`KPI sin carga: ${item.collaboratorName} (${item.count})`)
      await upsertState('missing_actual', key, state, true)
    } else if (changed) {
      await upsertState('missing_actual', key, state, false)
    }
  }
  await deleteMissingStates('missing_actual', activeMissingKeys)

  const riskState = await getStateMap('at_risk')
  const activeRiskKeys = new Set<string>()
  for (const item of summary.atRisk) {
    const key = `risk-${item.collaboratorId}-${item.kpiName}`
    // Bucket to avoid spam on tiny variation changes
    const bucket = Math.floor(item.variation / 5) * 5
    const state = hashValue(`${bucket}`)
    activeRiskKeys.add(key)
    const prev = riskState.get(key)
    const changed = prev?.stateHash !== state
    if (changed && !isCoolingDown(prev?.lastNotifiedAt || null)) {
      newEvents.push(`KPI en riesgo: ${item.kpiName} (${item.collaboratorName})`)
      await upsertState('at_risk', key, state, true)
    } else if (changed) {
      await upsertState('at_risk', key, state, false)
    }
  }
  await deleteMissingStates('at_risk', activeRiskKeys)

  const periodState = await getStateMap('period_expiring')
  const activePeriodKeys = new Set<string>()
  for (const period of summary.periodsExpiring) {
    const key = `period-${period.periodId}`
    const state = hashValue('expiring')
    activePeriodKeys.add(key)
    const prev = periodState.get(key)
    const changed = prev?.stateHash !== state
    if (changed && !isCoolingDown(prev?.lastNotifiedAt || null)) {
      newEvents.push(`Periodo por vencer: ${period.periodName} (${period.daysLeft} dias)`)
      await upsertState('period_expiring', key, state, true)
    } else if (changed) {
      await upsertState('period_expiring', key, state, false)
    }
  }
  await deleteMissingStates('period_expiring', activePeriodKeys)

  if (!newEvents.length) {
    return
  }

  const html = `
    <h2>Alertas nuevas detectadas</h2>
    <ul>
      ${newEvents.map((e) => `<li>${e}</li>`).join('')}
    </ul>
    <p>Estas alertas se generan cuando cambian los datos del sistema.</p>
  `

  for (const recipient of recipients) {
    await sendMail({
      to: recipient.email,
      subject: 'Alertas KPI - Cambios detectados',
      html,
      text: newEvents.join('\n'),
    })
  }
}
