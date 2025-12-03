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

async function testConnection() {
  try {
    // Primero intentar sin base de datos
    const connection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password || undefined,
    })

    console.log('✅ Conectado a MySQL')
    
    // Verificar si la base de datos existe
    const [databases] = await connection.query(
      'SHOW DATABASES LIKE ?',
      [dbConfig.database]
    ) as any[]

    if (databases.length > 0) {
      console.log(`✅ Base de datos '${dbConfig.database}' existe`)
      
      // Conectar a la base de datos
      await connection.end()
      const dbConnection = await mysql.createConnection({
        ...dbConfig,
        password: dbConfig.password || undefined,
      })

      // Verificar tablas
      const [tables] = await dbConnection.query('SHOW TABLES') as any[]
      console.log(`✅ Tablas encontradas: ${tables.length}`)
      
      if (tables.length > 0) {
        console.log('\n📋 Tablas en la base de datos:')
        tables.forEach((table: any) => {
          const tableName = Object.values(table)[0]
          console.log(`   - ${tableName}`)
        })
      }

      await dbConnection.end()
      return true
    } else {
      console.log(`⚠️  Base de datos '${dbConfig.database}' no existe`)
      console.log('   Ejecuta el script create_database.sql para crearla')
      await connection.end()
      return false
    }
  } catch (error: any) {
    console.error('❌ Error de conexión:', error.message)
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n💡 Las credenciales son incorrectas.')
      console.error('   Crea un archivo .env en la carpeta backend con:')
      console.error('   DB_HOST=localhost')
      console.error('   DB_PORT=3306')
      console.error('   DB_USER=root')
      console.error('   DB_PASSWORD=tu_contraseña')
      console.error('   DB_NAME=gestion_kpi')
    }
    return false
  }
}

testConnection().then((success) => {
  process.exit(success ? 0 : 1)
})

