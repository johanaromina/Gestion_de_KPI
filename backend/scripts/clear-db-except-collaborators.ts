import { pool } from '../src/config/database'

const run = async () => {
  const dbName = process.env.DB_NAME || 'gestion_kpi'
  const keepTables = new Set(['collaborators'])

  const [tables] = await pool.query<any[]>(
    `SELECT table_name as name
     FROM information_schema.tables
     WHERE table_schema = ?
       AND table_type = 'BASE TABLE'`,
    [dbName]
  )

  const tableNames = (tables || []).map((t) => t.name).filter((name) => !keepTables.has(name))

  if (tableNames.length === 0) {
    console.log('ℹ️  No hay tablas para limpiar.')
    return
  }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.query('SET FOREIGN_KEY_CHECKS = 0')
    for (const table of tableNames) {
      await conn.query(`TRUNCATE TABLE \`${table}\``)
      console.log(`🧹 Tabla limpiada: ${table}`)
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1')
    await conn.commit()
    console.log('✅ Limpieza completada. Se mantuvo collaborators.')
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

run()
  .catch((error) => {
    console.error('❌ Error limpiando base de datos:', error)
  })
  .finally(() => process.exit(0))
