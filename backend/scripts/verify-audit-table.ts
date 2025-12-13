import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gestion_kpi',
}

async function verifyAuditTable() {
  let connection: mysql.Connection | null = null

  try {
    connection = await mysql.createConnection({
      ...dbConfig,
      password: dbConfig.password || undefined,
    })

    console.log('✅ Conectado a MySQL\n')

    // Verificar que la tabla existe
    const [tables] = await connection.query<any[]>(
      "SHOW TABLES LIKE 'audit_logs'"
    )

    if (Array.isArray(tables) && tables.length > 0) {
      console.log('✅ La tabla audit_logs existe\n')

      // Mostrar estructura de la tabla
      const [columns] = await connection.query<any[]>(
        'DESCRIBE audit_logs'
      )

      console.log('📋 Estructura de la tabla audit_logs:')
      console.log('─'.repeat(80))
      if (Array.isArray(columns)) {
        columns.forEach((col) => {
          console.log(
            `${col.Field.padEnd(20)} ${col.Type.padEnd(30)} ${col.Null} ${col.Key} ${col.Default || 'NULL'}`
          )
        })
      }
      console.log('─'.repeat(80))

      // Contar registros
      const [count] = await connection.query<any[]>(
        'SELECT COUNT(*) as total FROM audit_logs'
      )
      const total = Array.isArray(count) && count.length > 0 ? count[0].total : 0
      console.log(`\n📊 Total de registros de auditoría: ${total}`)

      console.log('\n🎉 ¡La tabla de auditoría está lista para usar!')
    } else {
      console.log('❌ La tabla audit_logs NO existe')
      console.log('💡 Ejecuta: npm run add:audit')
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n💡 Verifica las credenciales en el archivo .env')
    }
    process.exit(1)
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

verifyAuditTable()

