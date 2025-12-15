import { pool } from '../src/config/database.js'
import dotenv from 'dotenv'

dotenv.config()

const periodId = Number(process.argv[2]) || 150

async function listSubPeriods() {
  try {
    const [rows] = await pool.query<any[]>('SELECT id, name, startDate, endDate FROM sub_periods WHERE periodId = ? ORDER BY startDate', [periodId])
    
    if (Array.isArray(rows) && rows.length > 0) {
      console.log(`\n📅 Subperíodos del período ${periodId}:\n`)
      console.table(rows.map(r => ({
        id: r.id,
        nombre: r.name,
        inicio: r.startDate,
        fin: r.endDate
      })))
    } else {
      console.log(`⚠️  No hay subperíodos para el período ${periodId}`)
    }
    
    await pool.end()
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

listSubPeriods()

