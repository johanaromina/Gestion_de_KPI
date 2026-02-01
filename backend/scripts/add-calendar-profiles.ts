import { pool } from '../src/config/database'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const scriptPath = path.join(__dirname, 'add-calendar-profiles.sql')

const run = async () => {
  const sql = fs.readFileSync(scriptPath, 'utf8')
  const statements = sql
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean)

  const conn = await pool.getConnection()
  try {
    for (const stmt of statements) {
      try {
        await conn.query(stmt)
      } catch (error: any) {
        const msg = error?.message || ''
        if (
          msg.includes('Duplicate column') ||
          msg.includes('Duplicate key name') ||
          msg.includes('already exists') ||
          msg.includes('Duplicate foreign key')
        ) {
          continue
        }
        throw error
      }
    }
    console.log('✅ calendar_profiles creado/verificado')
  } catch (error: any) {
    console.error('❌ Error creando calendar_profiles:', error?.message || error)
    throw error
  } finally {
    conn.release()
    await pool.end()
  }
}

run().catch(() => {
  process.exit(1)
})
