import { pool } from '../src/config/database'

const tableExists = async (name: string) => {
  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
    [name]
  )
  return Number(rows?.[0]?.count || 0) > 0
}

const run = async () => {
  const hasSubPeriods = await tableExists('sub_periods')
  const hasCalendarSubPeriods = await tableExists('calendar_subperiods')

  if (hasSubPeriods && !hasCalendarSubPeriods) {
    await pool.query('RENAME TABLE sub_periods TO calendar_subperiods')
    console.log('✅ sub_periods renombrado a calendar_subperiods')
  } else if (hasCalendarSubPeriods) {
    console.log('ℹ️ calendar_subperiods ya existe, no se renombra')
  } else {
    console.log('⚠️ No se encontró sub_periods ni calendar_subperiods')
  }

  await pool.end()
}

run().catch((error) => {
  console.error('❌ Error migrando subperíodos:', error?.message || error)
  process.exit(1)
})
