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

async function addIntegrationsTables() {
  let connection: mysql.Connection | null = null

  try {
    let connected = false
    const attempts = [
      { ...dbConfig, password: dbConfig.password },
      { ...dbConfig, password: '' },
    ]

    for (const config of attempts) {
      try {
        connection = await mysql.createConnection({
          ...config,
          multipleStatements: true,
        })
        console.log('✅ Conectado a MySQL')
        connected = true
        break
      } catch (error: any) {
        if (error.code === 'ER_ACCESS_DENIED_ERROR' && config.password) {
          continue
        } else {
          throw error
        }
      }
    }

    if (!connected || !connection) {
      throw new Error('No se pudo establecer conexion con MySQL')
    }

    const scriptPath = join(__dirname, 'add-integrations-tables.sql')
    const sqlScript = readFileSync(scriptPath, 'utf-8')

    console.log('🔧 Ejecutando script de integraciones...')
    const statements = sqlScript
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean)

    for (const stmt of statements) {
      try {
        await connection.query(stmt)
      } catch (error: any) {
        if (
          error?.code === 'ER_TABLE_EXISTS_ERROR' ||
          error?.code === 'ER_DUP_KEYNAME' ||
          error?.code === 'ER_DUP_FIELDNAME' ||
          error?.code === 'ER_DUP_KEY' ||
          error?.code === 'ER_CANT_DROP_FIELD_OR_KEY' ||
          error?.code === 'ER_FK_DUP_NAME'
        ) {
          console.log('ℹ️  Cambio ya aplicado, continuando...')
          continue
        }
        throw error
      }
    }

    console.log('✅ Integraciones agregadas/verificadas')
  } catch (error: any) {
    console.error('❌ Error al ejecutar el script:', error.message)
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('Revisa credenciales en .env')
    } else {
      console.error('Detalle:', error)
    }
    process.exit(1)
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

addIntegrationsTables()
