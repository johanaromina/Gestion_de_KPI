import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as readline from 'readline'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

interface DbConfig {
  host: string
  port: number
  user: string
  password: string
}

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close()
      resolve(ans)
    })
  )
}

async function getDbConfig(): Promise<DbConfig> {
  // Intentar usar variables de entorno primero
  let config: DbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  }

  // Intentar conectar con la configuración actual
  let connected = false
  let attempts = 0
  
  while (!connected && attempts < 3) {
    try {
      const testConnection = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password || undefined,
      })
      await testConnection.end()
      console.log('✅ Credenciales de MySQL verificadas')
      connected = true
    } catch (error: any) {
      if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        attempts++
        if (attempts < 3) {
          console.log('\n⚠️  Las credenciales del .env no funcionan')
          const password = await askQuestion('Ingresa la contraseña de MySQL: ')
          config.password = password
        } else {
          throw new Error('No se pudo conectar después de varios intentos')
        }
      } else {
        throw error
      }
    }
  }

  return config
}

async function setupDatabase() {
  let connection: mysql.Connection | null = null

  try {
    console.log('🔐 Verificando credenciales de MySQL...\n')
    const dbConfig = await getDbConfig()

    // Conectar sin especificar base de datos
    connection = await mysql.createConnection({
      ...dbConfig,
      multipleStatements: true,
    })

    console.log('✅ Conectado a MySQL')

    // Leer y ejecutar script de creación
    const createScriptPath = join(__dirname, 'create_database.sql')
    const createScript = readFileSync(createScriptPath, 'utf-8')

    console.log('📝 Ejecutando script de creación de base de datos...')
    await connection.query(createScript)
    console.log('✅ Base de datos y tablas creadas exitosamente')

    // Leer y ejecutar script de datos de ejemplo
    const seedScriptPath = join(__dirname, 'seed_data.sql')
    const seedScript = readFileSync(seedScriptPath, 'utf-8')

    console.log('📝 Insertando datos de ejemplo...')
    await connection.query(seedScript)
    console.log('✅ Datos de ejemplo insertados exitosamente')

    console.log('\n🎉 ¡Base de datos configurada correctamente!')
  } catch (error: any) {
    console.error('❌ Error al configurar la base de datos:', error.message)
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error(
        '\n💡 Opciones para configurar las credenciales:'
      )
      console.error('   1. Crear archivo .env en la carpeta backend con:')
      console.error('      DB_HOST=localhost')
      console.error('      DB_PORT=3306')
      console.error('      DB_USER=root')
      console.error('      DB_PASSWORD=tu_contraseña')
      console.error('   2. O ejecutar este script y proporcionar la contraseña cuando se solicite')
    }
    process.exit(1)
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

setupDatabase()

