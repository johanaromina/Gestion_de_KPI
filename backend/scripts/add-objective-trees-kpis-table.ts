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

async function addObjectiveTreesKPIsTable() {
  let connection: mysql.Connection | null = null

  try {
    connection = await mysql.createConnection({
      ...dbConfig,
      password: dbConfig.password || undefined,
      multipleStatements: true,
    })

    console.log('✅ Conectado a MySQL\n')

    // Leer y ejecutar script
    const scriptPath = join(__dirname, 'add_objective_trees_kpis_table.sql')
    const script = readFileSync(scriptPath, 'utf-8')

    console.log('📝 Ejecutando script para crear tabla objective_trees_kpis...')
    await connection.query(script)
    console.log('✅ Tabla objective_trees_kpis creada exitosamente\n')

    console.log('🎉 ¡Tabla agregada correctamente!')
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n💡 Verifica las credenciales en el archivo .env')
    } else if (error.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log('ℹ️  La tabla ya existe')
    }
    process.exit(1)
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

addObjectiveTreesKPIsTable()

