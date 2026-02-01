import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { pool } from '../src/config/database'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function addSheetsConnector() {
  try {
    console.log('✅ Conectado a MySQL')
    const scriptPath = path.join(__dirname, 'add-sheets-connector.sql')
    const sql = fs.readFileSync(scriptPath, 'utf8')
    console.log('🔧 Ejecutando script de conector Sheets...')
    const statements = sql
      .split(/;[\r\n]+/)
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0)

    for (const statement of statements) {
      await pool.query(statement)
    }
    console.log('✅ Conector Sheets agregado/verificado')
  } catch (error: any) {
    console.error('❌ Error al ejecutar el script:', error?.message || error)
    if (error?.sqlMessage) {
      console.error('Detalle:', error)
    }
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

addSheetsConnector()
