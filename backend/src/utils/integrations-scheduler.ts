import cron from 'node-cron'
import { pool } from '../config/database'
import { runTemplateQueued } from './integrations-runner'

type IntegrationSchedule = {
  id: number
  schedule: string
  enabled: number
}

const tasks = new Map<number, { schedule: string; task: cron.ScheduledTask }>()

const refreshSchedules = async () => {
  let rows: IntegrationSchedule[] = []
  try {
    const [result] = await pool.query<IntegrationSchedule[]>(
      `SELECT id, schedule, enabled FROM integration_templates
       WHERE enabled = 1 AND schedule IS NOT NULL AND schedule != ''`
    )
    rows = Array.isArray(result) ? result : []
  } catch (error: any) {
    if (error?.code !== 'ER_NO_SUCH_TABLE') {
      console.error('[integrations] error loading schedules:', error)
    }
    return
  }

  const activeIds = new Set<number>()
  for (const integration of rows || []) {
    activeIds.add(integration.id)
    const existing = tasks.get(integration.id)
    if (existing && existing.schedule === integration.schedule) {
      continue
    }
    if (existing) {
      existing.task.stop()
      tasks.delete(integration.id)
    }
    if (cron.validate(integration.schedule)) {
      const task = cron.schedule(integration.schedule, () => {
        void runTemplateQueued({
          templateId: integration.id,
          mode: 'scheduled',
          note: 'Ejecución programada',
        })
      })
      tasks.set(integration.id, { schedule: integration.schedule, task })
    } else {
      console.warn(`[integrations] Cron inválido para ${integration.id}: ${integration.schedule}`)
    }
  }

  for (const [id, task] of tasks.entries()) {
    if (!activeIds.has(id)) {
      task.task.stop()
      tasks.delete(id)
    }
  }
}

export const startIntegrationsScheduler = () => {
  void refreshSchedules()
  setInterval(() => {
    void refreshSchedules()
  }, 5 * 60 * 1000)
}
