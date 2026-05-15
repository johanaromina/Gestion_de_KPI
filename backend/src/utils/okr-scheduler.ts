import cron from 'node-cron'
import { pool } from '../config/database.js'
import { recalcObjectiveProgress, autoScoreKRStatuses } from '../services/okr.service.js'
import { logger } from '../utils/logger'

const recalcAllActiveObjectives = async (): Promise<void> => {
  const [rows] = await pool.query<any[]>(
    `SELECT id FROM okr_objectives WHERE status IN ('active', 'draft')`
  )
  const objectives = Array.isArray(rows) ? rows : []
  if (objectives.length === 0) return

  logger.info(`[okr-scheduler] Recalculando ${objectives.length} objetivos activos...`)
  let updated = 0
  let errors = 0

  for (const { id } of objectives) {
    try {
      await recalcObjectiveProgress(id)
      await autoScoreKRStatuses(id)
      updated++
    } catch (err) {
      logger.error(`[okr-scheduler] Error en objetivo ${id}:`, err)
      errors++
    }
  }

  logger.info(`[okr-scheduler] Completado — actualizados: ${updated}, errores: ${errors}`)
}

export const startOKRScheduler = (): void => {
  // Recálculo nocturno a las 02:00 todos los días
  cron.schedule('0 2 * * *', async () => {
    logger.info('[okr-scheduler] Iniciando recálculo nocturno de OKRs...')
    try {
      await recalcAllActiveObjectives()
    } catch (err) {
      logger.error('[okr-scheduler] Error en recálculo nocturno:', err)
    }
  })

  logger.info('[okr-scheduler] Programado — recálculo diario a las 02:00')
}
