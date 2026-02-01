import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gestion_kpi',
}

async function run() {
  let connection: mysql.Connection | null = null
  try {
    connection = await mysql.createConnection({
      ...dbConfig,
      multipleStatements: true,
    })
    console.log('✅ Conectado a MySQL')

    const scriptPath = join(__dirname, 'add-kpi-type-direction.sql')
    const sqlScript = readFileSync(scriptPath, 'utf-8')

    console.log('🔧 Ejecutando script de tipos de KPI...')
    const statements = sqlScript
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean)

    for (const stmt of statements) {
      try {
        await connection.query(stmt)
      } catch (error: any) {
        if (
          error?.code === 'ER_DUP_FIELDNAME' ||
          error?.code === 'ER_DUP_KEYNAME' ||
          error?.code === 'ER_BAD_FIELD_ERROR'
        ) {
          console.log('ℹ️  Cambio ya aplicado, continuando...')
          continue
        }
        throw error
      }
    }

    console.log('✅ Tipos de KPI actualizados')
  } catch (error: any) {
    console.error('❌ Error al ejecutar el script:', error.message)
    process.exit(1)
  } finally {
    if (connection) await connection.end()
  }
}

run()
