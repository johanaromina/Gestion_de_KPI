import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config()

async function main() {
  const cfg = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gestion_kpi',
  }

  const conn = await mysql.createConnection(cfg)
  const [rows]: any[] = await conn.query(
    'SELECT id FROM collaborators WHERE role = "admin" LIMIT 1'
  )

  if (Array.isArray(rows) && rows.length) {
    console.log('Ya existe un admin con ID', rows[0].id)
    await conn.end()
    return
  }

  const [res]: any = await conn.query(
    'INSERT INTO collaborators (name, position, area, role) VALUES (?, ?, ?, ?)',
    ['Admin Central', 'Administración Central', 'Administración', 'admin']
  )
  console.log('Admin creado con ID', res.insertId)
  await conn.end()
}

main().catch((err) => {
  console.error('Error creando admin:', err)
  process.exit(1)
})
