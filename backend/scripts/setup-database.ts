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
}
const targetDatabase = process.env.DB_NAME || 'gestion_kpi'

async function setupDatabase() {
  let connection: mysql.Connection | null = null

  try {
    // Intentar conectar, primero con contraseña del .env, luego sin contraseña
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
          // Intentar sin contraseña
          continue
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
          throw new Error('No se pudo conectar a MySQL. Verifica las credenciales en el archivo .env')
        } else {
          throw error
        }
      }
    }

    if (!connected) {
      throw new Error('No se pudo establecer conexión con MySQL')
    }

    // Leer y ejecutar script de creación
    const createScriptPath = join(__dirname, 'create_database.sql')
    const createScript = readFileSync(createScriptPath, 'utf-8')
      .replace(
        /CREATE DATABASE IF NOT EXISTS gestion_kpi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;/,
        `CREATE DATABASE IF NOT EXISTS \`${targetDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
      )
      .replace(
        /USE gestion_kpi;/,
        `USE \`${targetDatabase}\`;`
      )

    console.log('📝 Ejecutando script de creación de base de datos...')
    await connection.query(createScript)
    console.log('✅ Base de datos y tablas creadas exitosamente')

    console.log('\n🎉 ¡Base de datos configurada correctamente!')
    console.log('💡 Si queres datos demo, ejecuta luego: npx tsx scripts/seed-demo-examples.ts')
  } catch (error: any) {
    console.error('❌ Error al configurar la base de datos:', error.message)
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error(
        '\n💡 Verifica las credenciales en el archivo .env o en la configuración'
      )
      console.error('   Credenciales actuales:', {
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password ? '***' : '(vacía)',
      })
    }
    process.exit(1)
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

setupDatabase()

