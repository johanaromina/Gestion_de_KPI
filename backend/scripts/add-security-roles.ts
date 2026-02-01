import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { pool } from '../src/config/database'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const run = async () => {
  try {
    console.log('✅ Conectado a MySQL')
    console.log('🔧 Ejecutando script de roles y permisos...')
    const sqlPath = path.join(__dirname, 'add-security-roles.sql')
    const sql = await fs.readFile(sqlPath, 'utf8')
    const statements = sql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length)
    for (const statement of statements) {
      await pool.query(statement)
    }
    console.log('✅ Roles y permisos agregados/verificados')
  } catch (error: any) {
    console.error('❌ Error al ejecutar el script:', error?.message || error)
    if (error?.sqlMessage) {
      console.error('Detalle:', error.sqlMessage)
    }
  } finally {
    await pool.end()
  }
}

run()
