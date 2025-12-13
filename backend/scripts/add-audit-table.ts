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

async function addAuditTable() {
  let connection: mysql.Connection | null = null

  try {
    // Intentar conectar
    let connected = false
    let attempts = [
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
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
          throw new Error(
            'No se pudo conectar a MySQL. Verifica las credenciales en el archivo .env'
          )
        } else {
          throw error
        }
      }
    }

    if (!connected) {
      throw new Error('No se pudo establecer conexión con MySQL')
    }

    // Leer y ejecutar script de auditoría
    const auditScriptPath = join(__dirname, 'add_audit_table.sql')
    const auditScript = readFileSync(auditScriptPath, 'utf-8')

    console.log('📝 Ejecutando script de creación de tabla de auditoría...')
    await connection.query(auditScript)
    console.log('✅ Tabla de auditoría creada exitosamente')
    console.log('\n🎉 ¡Tabla audit_logs agregada correctamente!')
  } catch (error: any) {
    console.error('❌ Error al ejecutar el script:', error.message)
    if (error.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log('⚠️  La tabla audit_logs ya existe. No se realizaron cambios.')
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error(
        '\n💡 Verifica las credenciales en el archivo .env'
      )
      console.error('   Credenciales actuales:', {
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        database: dbConfig.database,
        password: dbConfig.password ? '***' : '(vacía)',
      })
    } else {
      console.error('Error completo:', error)
    }
    process.exit(1)
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

addAuditTable()

