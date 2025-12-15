import { pool } from '../src/config/database.js'
import dotenv from 'dotenv'

dotenv.config()

async function listPeriods() {
  try {
    const [rows] = await pool.query<any[]>('SELECT id, name, startDate, endDate, status FROM periods ORDER BY startDate DESC')
    
    if (Array.isArray(rows) && rows.length > 0) {
      console.log('\n📅 Períodos disponibles:\n')
      console.table(rows.map(r => ({
        id: r.id,
        nombre: r.name,
        inicio: r.startDate,
        fin: r.endDate,
        estado: r.status
      })))
    } else {
      console.log('⚠️  No hay períodos en la base de datos')
    }
    
    await pool.end()
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

listPeriods()

