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
    await pool.query(`ALTER TABLE integration_templates ADD COLUMN metricTypeUi VARCHAR(20) NULL`)
    console.log('✅ Columna metricTypeUi agregada en integration_templates')
  } catch (error: any) {
    if (error?.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️ metricTypeUi ya existe, continuando...')
    } else {
      console.error('❌ Error al agregar metricTypeUi:', error?.message || error)
      process.exitCode = 1
    }
  } finally {
    await pool.end()
  }
}

run()
