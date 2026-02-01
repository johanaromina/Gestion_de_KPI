import 'dotenv/config'
import { createPool } from 'mysql2/promise'

const run = async () => {
  const pool = await createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gestion_kpi',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  })

  try {
    await pool.query(`ALTER TABLE integration_template_runs ADD COLUMN archived TINYINT(1) NOT NULL DEFAULT 0`)
    console.log('✅ Columna archived agregada en integration_template_runs')
  } catch (error: any) {
    if (error?.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️ archived ya existe, continuando...')
    } else {
      console.error('❌ Error al agregar archived:', error?.message || error)
      process.exitCode = 1
    }
  } finally {
    await pool.end()
  }
}

run()
