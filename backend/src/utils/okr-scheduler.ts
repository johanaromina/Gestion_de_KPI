import cron from 'node-cron'
import { pool } from '../config/database.js'
import { recalcObjectiveProgress, autoScoreKRStatuses } from '../services/okr.service.js'

const recalcAllActiveObjectives = async (): Promise<void> => {
  const [rows] = await pool.query<any[]>(
    `SELECT id FROM okr_objectives WHERE status IN ('active', 'draft')`
  )
  const objectives = Array.isArray(rows) ? rows : []
  if (objectives.length === 0) return

  console.log(`[okr-scheduler] Recalculando ${objectives.length} objetivos activos...`)
  let updated = 0
  let errors = 0

  for (const { id } of objectives) {
    try {
      await recalcObjectiveProgress(id)
      await autoScoreKRStatuses(id)
      updated++
    } catch (err) {
      console.error(`[okr-scheduler] Error en objetivo ${id}:`, err)
      errors++
    }
  }

  console.log(`[okr-scheduler] Completado — actualizados: ${updated}, errores: ${errors}`)
}

export const startOKRScheduler = (): void => {
  // Recálculo nocturno a las 02:00 todos los días
  cron.schedule('0 2 * * *', async () => {
    console.log('[okr-scheduler] Iniciando recálculo nocturno de OKRs...')
    try {
      await recalcAllActiveObjectives()
    } catch (err) {
      console.error('[okr-scheduler] Error en recálculo nocturno:', err)
    }
  })

  console.log('[okr-scheduler] Programado — recálculo diario a las 02:00')
}
