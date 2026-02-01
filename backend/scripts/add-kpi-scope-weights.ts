import { pool } from '../src/config/database'
import fs from 'fs'

const scriptPath = new URL('./add-kpi-scope-weights.sql', import.meta.url)

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
    console.log('✅ kpi_scope_weights creado/verificado')
  } catch (error: any) {
    console.error('❌ Error creando kpi_scope_weights:', error?.message || error)
    throw error
  } finally {
    conn.release()
    await pool.end()
  }
}

run().catch(() => {
  process.exit(1)
})
